import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
import { requireAuditDatabase } from './audit-database.cjs';
import { syntheticDatabaseUrl, syntheticSecret } from './synthetic-secrets.mjs';
import { configureTestDatabase } from './configure-test-database.mjs';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const accepted = value => requireAuditDatabase({ TEST_DATABASE_URL: value });

test('synthetic credentials are fresh in memory, not deterministic published fixtures', () => {
  const values = Array.from({ length: 100 }, syntheticSecret);
  assert.equal(new Set(values).size, 100);
  assert.ok(values.every(value => /^[A-Za-z0-9_-]{43}$/.test(value)));
  assert.ok(syntheticDatabaseUrl() !== syntheticDatabaseUrl());
});

test('actual Vosk setup creates a fresh password per account and uses it only for that login', async () => {
  const source = ts.createSourceFile('qa.mjs', read('tests/vosk-browser-qa.mjs'), ts.ScriptTarget.Latest, true);
  let setupSource;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'setup') setupSource = node.getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(setupSource);
  const registered = [], filled = [];
  const api = async (path, body) => {
    if (path === '/api/auth/register') { registered.push(body.password); return { accessToken: syntheticSecret() }; }
    assert.equal(path, '/api/patients/create');
    return {};
  };
  // Execute only the actual account setup with inert API/browser stubs; no network,
  // real page, environment, model files, account update or credential output.
  const setup = new Function('randomUUID', 'api', 'assert', 'origin', 'openPatient',
    `let activePage; ${setupSource}; return setup;`)(randomUUID, api, assert, 'http://localhost:5173', async () => {});
  const context = { newPage: async () => ({
    goto: async () => {}, evaluate: async () => true,
    getByPlaceholder: label => ({ fill: async value => { if (label === 'Password') filled.push(value); } }),
    getByRole: () => ({ click: async () => {} }),
  }) };
  const first = await setup(context), second = await setup(context);
  assert.equal(registered.length, 2);
  assert.equal(filled.length, 2);
  assert.ok(registered.every((value, i) => value.length >= 12 && value === filled[i]));
  assert.ok(registered[0] !== registered[1]);
  assert.ok(!Object.hasOwn(first, 'password') && !Object.hasOwn(second, 'password'));
});

test('audit guard accepts supplied random passwords, including encoded reserved characters', () => {
  for (const password of [syntheticSecret(), `${syntheticSecret()}:@/?#%+é`]) {
    const url = new URL('postgresql://audit@127.0.0.1:55439/medapp_audit');
    url.password = encodeURIComponent(password);
    assert.ok(accepted(url.href) === url.href);
    assert.ok(decodeURIComponent(new URL(accepted(url.href)).password) === password);
  }
});

test('audit guard rejects target/credential/operator overrides without echoing values', () => {
  const value = syntheticDatabaseUrl();
  const replace = (from, to) => value.replace(from, to);
  const bad = [undefined, '', 'not-a-url', value + '?', value + '#', value + '/',
    value + '?options=-csearch_path=public', value + '?host=remote.invalid', value + '?schema=public',
    value + '#fragment', value + '\n', ' ' + value, value.replace(':', ':\n'),
    replace('postgresql:', 'postgres:'), replace('audit:', 'other:'), replace('audit:', '%61udit:'),
    replace('127.0.0.1', 'localhost'), replace('127.0.0.1', '[::1]'), replace('127.0.0.1', '127.1'),
    replace('127.0.0.1', 'remote.invalid'), replace('55439', '5432'), replace('medapp_audit', 'production'),
    replace('/medapp_audit', '/public/../medapp_audit'), replace('/medapp_audit', '/%6dedapp_audit'),
    value.replace(/audit:[^@]+@/, 'audit:@'), value.replace(/audit:[^@]+@/, 'audit@'),
    value.replace(/audit:[^@]+@/, 'audit:%00@'), value.replace(/audit:[^@]+@/, 'audit:%ZZ@'),
    value.replace(/audit:[^@]+@/, 'audit:<test-database-password>@'),
    value.replace(/audit:[^@]+@/, 'audit:%3Ctest-database-password%3E@')];
  for (const candidate of bad) {
    assert.throws(() => accepted(candidate), error => {
      assert.match(error.message, /^TEST_DATABASE_URL (?:is required|refused:)/);
      assert.ok(!candidate || !error.message.includes(candidate));
      assert.ok(!error.message.includes(new URL(value).password));
      return true;
    });
  }
});

test('CI URL construction percent-encodes the supplied secret, writes only job env, never logs', () => {
  const password = `${syntheticSecret()}:@/?#%+é`;
  let calls = 0;
  configureTestDatabase({ TEST_DATABASE_PASSWORD: password, GITHUB_ENV: 'job-environment-only' }, (path, content, options) => {
    calls++;
    assert.equal(path, 'job-environment-only');
    assert.equal(options.mode, 0o600);
    assert.ok(content.startsWith('TEST_DATABASE_URL=') && content.endsWith('\n'));
    const value = content.slice('TEST_DATABASE_URL='.length, -1);
    assert.ok(accepted(value) === value);
    assert.ok(decodeURIComponent(new URL(value).password) === password);
    assert.equal(content.split('\n').length, 2);
  });
  assert.equal(calls, 1);
});

test('CI provisioning refuses missing secret or job environment with redacted errors', () => {
  for (const env of [{}, { TEST_DATABASE_PASSWORD: syntheticSecret() }, { GITHUB_ENV: 'unused' }]) {
    assert.throws(() => configureTestDatabase(env, () => assert.fail('must not write')), /CI requires/);
  }
  const result = spawnSync(process.execPath, [new URL('configure-test-database.mjs', import.meta.url).pathname], {
    env: {}, encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /^Synthetic database configuration failed:.*values redacted/);
});

test('every DB test entry point uses the same strict guard before connecting', () => {
  for (const file of ['api', 'audit-references', 'database-operations', 'idempotency', 'pagination-render',
    'pagination-sequences', 'pagination', 'preflight-measurements', 'session-lifecycle', 'validation-routing']) {
    const source = read(`backend/tests/${file}.test.ts`);
    assert.match(source, /import \{ auditDatabaseUrl \} from '\.\/helpers\/auditDatabase';/);
    assert.match(source, /auditDatabaseUrl\(/);
    assert.doesNotMatch(source, /url\.password\s*!==/);
  }
  for (const file of ['release-runner', 'start-test-server', 'evidence-safety', 'performance']) {
    assert.match(read(`tests/${file}.mjs`), /import \{ requireAuditDatabase \} from '\.\/audit-database\.cjs';/);
  }
});

test('Compose and tracked example files never supply usable credential defaults', () => {
  const compose = read('docker-compose.yml');
  for (const name of ['POSTGRES_PASSWORD', 'DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET']) {
    assert.ok(compose.includes(`${name}: \${${name}:?`), `Compose must require ${name}`);
  }
  const example = read('backend/.env.example');
  for (const name of ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'SEED_PASSWORD']) {
    assert.match(example, new RegExp(`^${name}=<[^>]+>$`, 'm'));
  }
  const shell = read('deploy.sh');
  assert.doesNotMatch(shell, /jwt_secret=|jwt_refresh=|cat > \/tmp\/render_env_vars/);
});

test('publication ignores local dotenv variants but keeps examples, direnv config and source eligible', () => {
  // Path-only probes work even when absent. Never create/read dotenv files or
  // stage anything; --no-index also checks examples that are already tracked.
  const check = (paths, expected) => {
    const result = spawnSync('git', ['check-ignore', '--no-index', '-z', '--stdin'], {
      cwd: root, input: paths.join('\0') + '\0', encoding: 'utf8',
    });
    assert.ifError(result.error);
    assert.equal(result.status, expected.length ? 0 : 1);
    assert.equal(result.stderr, '');
    assert.deepEqual(result.stdout.split('\0').filter(Boolean), expected);
  };
  const privatePaths = ['.env', '.env.local', '.env.production', 'backend/.env.test',
    'frontend/.env.staging', 'backend/nested/.env.production'];
  check(privatePaths, privatePaths);
  check(['.env.example', 'backend/.env.example', 'frontend/.env.example',
    'backend/nested/.env.example', '.envrc', 'backend/.envrc',
    'backend/src/config.ts', 'tests/synthetic-secrets.mjs', 'tests/fixtures/publication-key.json',
    'frontend/public/models/manifest.json'], []);
  const generatedPaths = ['.cache/vosk/publication-probe', 'frontend/public/models/publication-probe.zip',
    'frontend/public/models/publication-probe.tar.gz', 'frontend/public/vosk/publication-probe.worker.js'];
  check(generatedPaths, generatedPaths);
  for (const pattern of ['.env.*', '!.env.example', '!**/.env.example']) {
    assert.ok(read('.gitignore').split('\n').includes(pattern), `Missing dotenv ignore rule: ${pattern}`);
  }
});

test('publishable source has no fixed positive password or signing-key assignments', () => {
  // Read only publishable text candidates; never ignored files, history or secrets.
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0').filter(file => /\.(?:[cm]?js|tsx?)$/.test(file));
  const fields = /^(?:password|doctorPassword|PASSWORD|jwtSecret|jwtRefreshSecret|JWT_SECRET|JWT_REFRESH_SECRET)$/;
  const invalidPasswords = new Set(['', 'x', 'short', 'wrong']);
  for (const file of new Set(files)) {
    const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
    function visit(node) {
      if ((ts.isVariableDeclaration(node) || ts.isPropertyAssignment(node)) && fields.test(ts.isStringLiteral(node.name) ? node.name.text : node.name.getText(source))) {
        const value = node.initializer;
        if (value && ts.isStringLiteralLike(value)) {
          assert.ok(file.includes('tests/') && invalidPasswords.has(value.text), `${file}:${source.getLineAndCharacterOfPosition(value.pos).line + 1}: fixed credential literal (value redacted)`);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
});

test('publishable text has no reusable PostgreSQL URL credentials, including historical receipts', () => {
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0').filter(file => /\.(?:[cm]?js|tsx?|md|sh|ya?ml|example)$/.test(file));
  for (const file of new Set(files)) {
    for (const [index, line] of read(file).split('\n').entries()) {
      for (const match of line.matchAll(/postgres(?:ql)?:\/\/[^\s/:'"`]+:([^\s/@'"`]+)@([^\s/'"`]+)/g)) {
        const [, password, host] = match;
        const placeholder = /^<[^>]+>$/.test(password);
        const runtime = password.includes('${');
        const invalidHost = /(?:\.invalid|invalid\.example)(?::\d+)?$/.test(host);
        assert.ok(placeholder || runtime || invalidHost, `${file}:${index + 1}: reusable database URL credential (value redacted)`);
      }
    }
  }
});

