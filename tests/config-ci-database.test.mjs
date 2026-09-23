import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startCiDatabase, cleanupCiDatabase, CI_DATABASE_IMAGES, CI_DATABASE_STATE, CI_DATABASE_TIMEZONES } from './ci-database.mjs';
import { configureTestDatabase, maskGithubValue } from './configure-test-database.mjs';
import { requireAuditDatabase } from './audit-database.cjs';

function fixture(t, overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'medapp-ci-database-unit-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const env = { RUNNER_TEMP: directory, GITHUB_ENV: join(directory, 'job-env'),
    GITHUB_RUN_ID: '35819755428', GITHUB_RUN_ATTEMPT: '1', GITHUB_JOB: 'required-integration',
    EXPECTED_PG_MAJOR: '15', EXPECTED_PG_TIMEZONE: 'UTC', TZ: 'UTC', CI_DATABASE_IMAGE: CI_DATABASE_IMAGES['15'],
    // Even supplied credentials, actor, PR labels and URLs must never select a
    // Docker image, password, target, container name or command.
    TEST_DATABASE_PASSWORD: randomBytes(32).toString('hex'), TEST_DATABASE_URL: 'untrusted-input',
    GITHUB_ACTOR: '--privileged', PR_LABEL: 'docker.invalid/image', NODE_OPTIONS: '--untrusted', ...overrides };
  const events = [], masks = [], containers = new Map(), passwords = [];
  let health = 'true|healthy', failRun = false, failRemove = false, failList = false;
  const options = {
    mask(value) { masks.push(value); events.push({ kind: 'mask' }); },
    append(path, content, flags) {
      events.push({ kind: 'append' });
      const url = content.slice('TEST_DATABASE_URL='.length, -1);
      assert.ok(masks.includes(url), 'mask the full URL before writing');
      assert.equal(path, env.GITHUB_ENV);
      assert.equal(flags.mode, 0o600);
      assert.equal(content.split('\n').length, 2);
      assert.ok(requireAuditDatabase({ TEST_DATABASE_URL: url }) === url);
      appendFileSync(path, content, flags);
    },
    async delay(ms) { events.push({ kind: 'delay' }); assert.equal(ms, 1000); },
    async execute(command, args, opts) {
      events.push({ kind: 'docker', args });
      assert.equal(command, 'docker');
      assert.equal(opts.encoding, 'utf8');
      assert.ok(opts.timeout > 0 && opts.timeout <= 120000);
      assert.ok(!opts.shell);
      assert.ok(!Object.hasOwn(opts.env, 'NODE_OPTIONS'));
      assert.ok(!Object.hasOwn(opts.env, 'TEST_DATABASE_PASSWORD'));
      assert.ok(!Object.hasOwn(opts.env, 'TEST_DATABASE_URL'));
      assert.ok(passwords.every(value => !args.some(arg => arg.includes(value))), 'no password in argv');
      if (args[0] === 'run') {
        const password = opts.env.POSTGRES_PASSWORD;
        assert.ok(/^[a-f0-9]{64}$/.test(password));
        assert.ok(password !== env.TEST_DATABASE_PASSWORD, 'ignore supplied reusable credential');
        assert.ok(masks.includes(password), 'mask before passing to Docker');
        assert.ok(!args.some(arg => arg.includes(password)), 'no credential literal in argv');
        assert.ok(existsSync(join(directory, CI_DATABASE_STATE)), 'persist ownership before launch');
        passwords.push(password);
        const name = args[args.indexOf('--name') + 1];
        const owner = args[args.indexOf('--label') + 1].split('=')[1];
        const id = randomBytes(32).toString('hex');
        containers.set(name, { id, owner });
        if (failRun) throw new Error(`runner error containing ${password}`);
        return { stdout: id + '\n' };
      }
      if (args[1] === 'ls') {
        if (failList) throw new Error('Docker unavailable');
        const name = args[args.indexOf('--filter') + 1].slice('name=^/'.length, -1);
        const container = containers.get(name);
        return { stdout: container ? `${container.id}|${name}|${container.owner}\n` : '' };
      }
      if (args[1] === 'inspect') {
        assert.deepEqual(args.slice(0, -1), ['container', 'inspect', '--format',
          '{{.State.Running}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}']);
        return { stdout: health + '\n' };
      }
      if (args[1] === 'rm') {
        assert.equal(args[2], '--force');
        assert.equal(args.length, 4);
        if (failRemove) throw new Error('Docker unavailable');
        const item = [...containers].find(([, value]) => value.id === args[3]);
        assert.ok(item, 'remove only exact immutable owned ID');
        containers.delete(item[0]);
        return { stdout: args[3] + '\n' };
      }
      assert.fail('Unexpected Docker operation');
    },
  };
  return { directory, env, options, events, masks, passwords, containers,
    setHealth(value) { health = value; }, failRun() { failRun = true; },
    setFailRemove(value) { failRemove = value; }, setFailList(value) { failList = value; } };
}

test('two runtime launches generate distinct credentials, mask before use, privately export URL and clean only owned containers', async t => {
  const first = fixture(t), second = fixture(t);
  for (const value of [first, second]) {
    const { env, options, events, passwords, containers, directory } = value;
    const outsider = { id: randomBytes(32).toString('hex'), owner: randomBytes(16).toString('hex') };
    containers.set('preexisting-app', outsider);
    assert.equal(await startCiDatabase(env, options), undefined);
    assert.equal(events[0].kind, 'mask');
    assert.equal(events.at(-1).kind, 'append');
    const content = readFileSync(env.GITHUB_ENV, 'utf8');
    assert.ok(decodeURIComponent(new URL(content.slice('TEST_DATABASE_URL='.length, -1)).password) === passwords[0]);
    assert.equal(statSync(env.GITHUB_ENV).mode & 0o777, 0o600);
    const statePath = join(directory, CI_DATABASE_STATE);
    assert.equal(statSync(statePath).mode & 0o777, 0o600);
    assert.ok(!readFileSync(statePath, 'utf8').includes(passwords[0]), 'receipt contains no password');
    await cleanupCiDatabase(env, options);
    assert.equal(existsSync(statePath), false);
    assert.deepEqual([...containers.keys()], ['preexisting-app']);
    const before = events.length;
    await cleanupCiDatabase(env, options);
    assert.equal(events.length, before, 'no receipt means no Docker access');
  }
  assert.ok(first.passwords[0] !== second.passwords[0]);
});

test('all four exact pinned-image/timezone cells launch loopback-only with authentication, health bounds and no persistent volume', async t => {
  for (const major of ['15', '17']) for (const timezone of CI_DATABASE_TIMEZONES) {
    const value = fixture(t, { EXPECTED_PG_MAJOR: major, EXPECTED_PG_TIMEZONE: timezone,
      TZ: timezone, CI_DATABASE_IMAGE: CI_DATABASE_IMAGES[major] });
    await startCiDatabase(value.env, value.options);
    const args = value.events.find(event => event.args?.[0] === 'run').args;
    assert.ok(args.includes('127.0.0.1:55439:5432'));
    assert.ok(args.includes('POSTGRES_PASSWORD'));
    assert.ok(args.includes('POSTGRES_HOST_AUTH_METHOD=scram-sha-256'));
    assert.ok(args.includes(`TZ=${timezone}`) && args.includes(`PGTZ=${timezone}`));
    assert.deepEqual(args.slice(-4), [CI_DATABASE_IMAGES[major], 'postgres', '-c', `timezone=${timezone}`]);
    assert.equal(args[args.indexOf('--health-cmd') + 1], 'pg_isready -h 127.0.0.1 -U audit -d medapp_audit');
    assert.ok(args.includes('--health-interval=1s') && args.includes('--health-retries=60'));
    assert.ok(args.includes('--tmpfs') && args.includes('--memory=1g') && args.includes('--cpus=2'));
    assert.ok(args.includes('--log-driver=none'));
    assert.ok(!args.some(arg => /trust|--privileged|--volume|--env-file|--network=host/.test(arg)));
    await cleanupCiDatabase(value.env, value.options);
  }
});

test('invalid matrix/identity/path inputs fail before masks, files or Docker; no actor/label/image injection', async t => {
  const invalid = [
    { EXPECTED_PG_MAJOR: '16' }, { EXPECTED_PG_MAJOR: '15;echo bad' }, { EXPECTED_PG_MAJOR: '__proto__' },
    { CI_DATABASE_IMAGE: 'postgres:15-alpine' }, { CI_DATABASE_IMAGE: CI_DATABASE_IMAGES['17'] },
    { CI_DATABASE_IMAGE: `--privileged ${CI_DATABASE_IMAGES['15']}` },
    { CI_DATABASE_IMAGE: 'https://docker.invalid/pr.json' }, { EXPECTED_PG_TIMEZONE: 'UTC\n--privileged' },
    { EXPECTED_PG_TIMEZONE: 'Europe/London' }, { TZ: 'America/New_York' },
    { GITHUB_RUN_ID: '../other' }, { GITHUB_RUN_ID: '0' }, { GITHUB_RUN_ATTEMPT: '1\n' },
    { GITHUB_JOB: 'other-job' }, { RUNNER_TEMP: 'relative' }, { GITHUB_ENV: '' }, { GITHUB_ENV: 'relative' },
  ];
  for (const invalidEnv of invalid) {
    const value = fixture(t, invalidEnv);
    await assert.rejects(startCiDatabase(value.env, value.options), /values redacted/);
    assert.equal(value.events.length, 0);
    assert.equal(existsSync(join(value.directory, CI_DATABASE_STATE)), false);
  }
});

test('existing ownership receipt is never overwritten or used to remove an earlier container', async t => {
  const value = fixture(t), statePath = join(value.directory, CI_DATABASE_STATE);
  await startCiDatabase(value.env, value.options);
  const original = readFileSync(statePath, 'utf8'), before = value.events.filter(e => e.kind === 'docker').length;
  await assert.rejects(startCiDatabase(value.env, value.options), /values redacted/);
  assert.equal(readFileSync(statePath, 'utf8'), original);
  assert.equal(value.events.filter(e => e.kind === 'docker').length, before);
  assert.equal(value.containers.size, 1);
  await cleanupCiDatabase(value.env, value.options);
});

test('failed Docker run including partial creation cleans only its owned container and never surfaces child errors', async t => {
  const value = fixture(t);
  value.failRun();
  await assert.rejects(startCiDatabase(value.env, value.options), error => {
    assert.ok(!value.passwords.some(password => error.message.includes(password)));
    assert.match(error.message, /values redacted/);
    return true;
  });
  assert.equal(value.containers.size, 0);
  assert.equal(existsSync(value.env.GITHUB_ENV), false);
  assert.equal(existsSync(join(value.directory, CI_DATABASE_STATE)), false);
});

test('starting health is polled with bounded Node timers before credentials are exported', async t => {
  const value = fixture(t);
  value.setHealth('true|starting');
  value.options.delay = async ms => { assert.equal(ms, 1000); value.setHealth('true|healthy'); };
  await startCiDatabase(value.env, value.options);
  assert.equal(value.events.filter(e => e.args?.[1] === 'inspect').length, 2);
  await cleanupCiDatabase(value.env, value.options);
});

test('unhealthy, stopped, malformed and never-ready containers fail closed with cleanup and no URL export', async t => {
  for (const health of ['true|unhealthy', 'false|starting', 'true|', 'untrusted', 'true|starting']) {
    const value = fixture(t);
    value.setHealth(health);
    await assert.rejects(startCiDatabase(value.env, value.options), /values redacted/);
    assert.equal(value.containers.size, 0);
    assert.equal(existsSync(value.env.GITHUB_ENV), false);
    assert.equal(value.events.filter(e => e.args?.[1] === 'inspect').length, health === 'true|starting' ? 60 : 1);
  }
});

test('job-env write failures are redacted and clean the newly healthy container', async t => {
  const value = fixture(t);
  value.options.append = (_path, content) => { throw new Error(content); };
  await assert.rejects(startCiDatabase(value.env, value.options), error => {
    assert.ok(!value.passwords.some(password => error.message.includes(password)));
    return /values redacted/.test(error.message);
  });
  assert.equal(value.containers.size, 0);
});

test('cancellation during readiness cleans owned container; cancellation before launch has no side effects', async t => {
  const value = fixture(t), controller = new AbortController();
  value.setHealth('true|starting');
  value.options.delay = async () => controller.abort();
  await assert.rejects(startCiDatabase(value.env, { ...value.options, signal: controller.signal }), /values redacted/);
  assert.equal(value.containers.size, 0);
  assert.equal(existsSync(value.env.GITHUB_ENV), false);
  const before = value.events.length;
  await assert.rejects(startCiDatabase(value.env, { ...value.options, signal: controller.signal }), /values redacted/);
  assert.equal(value.events.length, before);
});

test('ownership mismatch prevents deletion even if a container has the same name', async t => {
  const value = fixture(t);
  await startCiDatabase(value.env, value.options);
  const state = JSON.parse(readFileSync(join(value.directory, CI_DATABASE_STATE), 'utf8'));
  value.containers.get(state.name).owner = randomBytes(16).toString('hex');
  await assert.rejects(cleanupCiDatabase(value.env, value.options), /values redacted/);
  assert.equal(value.containers.size, 1);
  assert.equal(value.events.some(e => e.args?.[1] === 'rm'), false);
  assert.ok(existsSync(join(value.directory, CI_DATABASE_STATE)));
});

test('failed cleanup retains ownership for the always-step retry; Docker unavailability is not mistaken for absence', async t => {
  for (const failingOperation of ['setFailList', 'setFailRemove']) {
    const value = fixture(t);
    await startCiDatabase(value.env, value.options);
    value[failingOperation](true);
    await assert.rejects(cleanupCiDatabase(value.env, value.options), /values redacted/);
    assert.equal(value.containers.size, 1);
    assert.ok(existsSync(join(value.directory, CI_DATABASE_STATE)));
    value[failingOperation](false);
    await cleanupCiDatabase(value.env, value.options);
    assert.equal(value.containers.size, 0);
  }
});

test('launch failure with cleanup failure retains receipt, then a separate cleanup can retry', async t => {
  const value = fixture(t);
  value.failRun(); value.setFailRemove(true);
  await assert.rejects(startCiDatabase(value.env, value.options), /values redacted/);
  assert.ok(existsSync(join(value.directory, CI_DATABASE_STATE)));
  value.setFailRemove(false);
  await cleanupCiDatabase(value.env, value.options);
  assert.equal(value.containers.size, 0);
});

test('cleanup refuses tampered, cross-job and symlink receipts without invoking Docker', async t => {
  for (const mutate of [state => { state.identity = 'other'; }, state => { state.name = '--all'; },
    state => { state.owner = '--all'; }, state => { state.version = 2; }]) {
    const value = fixture(t);
    await startCiDatabase(value.env, value.options);
    const path = join(value.directory, CI_DATABASE_STATE), state = JSON.parse(readFileSync(path, 'utf8'));
    mutate(state); writeFileSync(path, JSON.stringify(state));
    const before = value.events.length;
    await assert.rejects(cleanupCiDatabase(value.env, value.options), /values redacted/);
    assert.equal(value.events.length, before);
  }
  const value = fixture(t), target = join(value.directory, 'unrelated');
  writeFileSync(target, '{}'); symlinkSync(target, join(value.directory, CI_DATABASE_STATE));
  await assert.rejects(cleanupCiDatabase(value.env, value.options), /values redacted/);
  assert.equal(value.events.length, 0);
  assert.equal(readFileSync(target, 'utf8'), '{}');
});

test('private URL writer rejects line injection and symlinks; reserved characters are masked in raw and encoded forms before write', t => {
  const value = fixture(t), events = [], password = `${randomBytes(32).toString('hex')}:@/?#%+é`;
  configureTestDatabase({ ...value.env, TEST_DATABASE_PASSWORD: password }, (_path, content) => {
    const url = content.slice('TEST_DATABASE_URL='.length, -1);
    assert.ok(events.includes(password) && events.includes(encodeURIComponent(password)) && events.includes(url));
    assert.ok(decodeURIComponent(new URL(url).password) === password);
    assert.equal(content.split('\n').length, 2);
  }, content => events.push(content));
  for (const suffix of ['\nX=bad', '\rX=bad', '\0']) {
    assert.throws(() => configureTestDatabase({ ...value.env, TEST_DATABASE_PASSWORD: password + suffix },
      () => assert.fail('no write'), () => assert.fail('no mask for invalid input')), /CI requires/);
  }
  const target = join(value.directory, 'unrelated');
  writeFileSync(target, 'unchanged'); symlinkSync(target, value.env.GITHUB_ENV);
  assert.throws(() => configureTestDatabase(value.env, appendFileSync, () => {}));
  assert.equal(readFileSync(target, 'utf8'), 'unchanged');
});

test('mask command escaping cannot inject extra workflow commands', t => {
  const writes = [];
  t.mock.method(process.stdout, 'write', value => { writes.push(value); return true; });
  maskGithubValue('synthetic%\r\n::warning::inert');
  assert.deepEqual(writes, ['::add-mask::synthetic%25%0D%0A::warning::inert\n']);
});

test('CLI failures print only a fixed redacted diagnostic; no secret outputs, child streams or full environment inspection', () => {
  const result = spawnSync(process.execPath, [new URL('./ci-database.mjs', import.meta.url).pathname, 'start'], {
    env: { TEST_DATABASE_PASSWORD: randomBytes(32).toString('hex') }, encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'Synthetic CI database operation failed; check approved matrix inputs and Docker availability (values redacted).\n');
  const source = readFileSync(new URL('./ci-database.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /GITHUB_OUTPUT|console\.log|stdio:\s*['"]inherit|\.Config\.Env|from ['"]dotenv|execSync\(/);
  assert.doesNotMatch(source, /\b(?:prune|sleep)\b/);
});
