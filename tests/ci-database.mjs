import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { appendFileSync, closeSync, constants, fstatSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as wait } from 'node:timers/promises';
import { configureTestDatabase, maskGithubValue } from './configure-test-database.mjs';

// Reviewed public OCI index receipts; never accept an arbitrary image, digest,
// timezone, PR actor/label, Docker argument, dotenv file or remote configuration.
export const CI_DATABASE_IMAGES = Object.freeze({
  '15': 'postgres:15-alpine@sha256:a46e076249ce434e41203b8c1dadfaa025b9726331d72390df038385d6dc29cd',
  '17': 'postgres:17-alpine@sha256:f02121de6f74d30d8a94cd1d9584125e2178d7e6c377d8130112d4e52d867995',
});
export const CI_DATABASE_TIMEZONES = Object.freeze(['UTC', 'America/New_York']);
export const CI_DATABASE_STATE = 'medapp-ci-database.json';
const ownerLabel = 'org.medapp.ci-audit-owner';
const failure = () => new Error('Synthetic CI database operation failed (details and values redacted).');
const defaultExecute = promisify(execFile);

function settings(env) {
  const major = env.EXPECTED_PG_MAJOR, timezone = env.EXPECTED_PG_TIMEZONE;
  if (!Object.hasOwn(CI_DATABASE_IMAGES, major) || env.CI_DATABASE_IMAGE !== CI_DATABASE_IMAGES[major] ||
      !CI_DATABASE_TIMEZONES.includes(timezone) || env.TZ !== timezone ||
      !/^[1-9][0-9]{0,19}$/.test(env.GITHUB_RUN_ID ?? '') ||
      !/^[1-9][0-9]{0,5}$/.test(env.GITHUB_RUN_ATTEMPT ?? '') ||
      env.GITHUB_JOB !== 'required-integration' || !env.RUNNER_TEMP || !isAbsolute(env.RUNNER_TEMP)) throw failure();
  const identity = `${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}-${major}-${timezone === 'UTC' ? 'utc' : 'ny'}`;
  return { major, timezone, identity, image: CI_DATABASE_IMAGES[major],
    prefix: `medapp-ci-audit-${identity}-`, statePath: join(env.RUNNER_TEMP, CI_DATABASE_STATE) };
}

function dockerClient(env, execute) {
  // Do not pass application secrets, NODE_OPTIONS or arbitrary CI variables to
  // Docker. Connection settings support the configured local Docker context.
  const childEnv = {};
  for (const key of ['PATH', 'HOME', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG',
    'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH', 'XDG_RUNTIME_DIR']) {
    if (env[key] !== undefined) childEnv[key] = env[key];
  }
  return async (args, extraEnv = {}, timeout = 10000) => {
    try {
      const result = await execute('docker', args, { env: { ...childEnv, ...extraEnv },
        encoding: 'utf8', maxBuffer: 65536, timeout, killSignal: 'SIGKILL', windowsHide: true });
      return result.stdout.trim();
    } catch { throw failure(); } // Never surface child errors, stderr, logs or argv.
  };
}

function readState(config) {
  let fd;
  try {
    fd = openSync(config.statePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 2048) throw failure();
    const state = JSON.parse(readFileSync(fd, 'utf8'));
    if (state.version !== 1 || state.identity !== config.identity ||
        typeof state.name !== 'string' || !state.name.startsWith(config.prefix) ||
        !/^[a-f0-9]{24}$/.test(state.name.slice(config.prefix.length)) ||
        !/^[a-f0-9]{32}$/.test(state.owner)) throw failure();
    return state;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw failure();
  } finally { if (fd !== undefined) closeSync(fd); }
}

async function ownedContainer(docker, state) {
  // Narrow formatted metadata ONLY; never inspect Config.Env or health logs.
  const metadata = await docker(['container', 'ls', '--all', '--no-trunc', '--filter',
    `name=^/${state.name}$`, '--format', `{{.ID}}|{{.Names}}|{{.Label "${ownerLabel}"}}`]);
  if (!metadata) return null;
  const [id, name, owner, ...extra] = metadata.split('|');
  if (extra.length || !/^[a-f0-9]{64}$/.test(id) || name !== state.name || owner !== state.owner) throw failure();
  return id;
}

async function removeOwned(docker, state, config) {
  const id = await ownedContainer(docker, state);
  // Full immutable ID avoids a name-replacement race. No volumes are mounted:
  // PostgreSQL's data directory is a new bounded tmpfs, not an existing volume.
  if (id) await docker(['container', 'rm', '--force', id]);
  unlinkSync(config.statePath);
}

export async function cleanupCiDatabase(env = process.env, { execute = defaultExecute } = {}) {
  try {
    const config = settings(env), state = readState(config);
    if (state) await removeOwned(dockerClient(env, execute), state, config);
  } catch { throw failure(); } // Leave ownership receipt for a safe retry.
}

export async function startCiDatabase(env = process.env, {
  execute = defaultExecute, mask = maskGithubValue, append = appendFileSync,
  delay = wait, signal,
} = {}) {
  let config, state, docker, saved = false;
  try {
    config = settings(env);
    if (!env.GITHUB_ENV || !isAbsolute(env.GITHUB_ENV)) throw failure();
    signal?.throwIfAborted();
    const password = randomBytes(32).toString('hex');
    mask(password); // Must precede *every* use, including Docker's child env.
    state = { version: 1, identity: config.identity,
      name: config.prefix + randomBytes(12).toString('hex'), owner: randomBytes(16).toString('hex') };
    // Exclusive creation: never adopt/overwrite an earlier job's receipt. Saved
    // before run so cancellation or a failed/timeout run can still be cleaned.
    writeFileSync(config.statePath, JSON.stringify(state) + '\n', { flag: 'wx', mode: 0o600 });
    saved = true;
    docker = dockerClient(env, execute);
    const id = await docker(['run', '--detach', '--name', state.name,
      '--label', `${ownerLabel}=${state.owner}`, '--pull=missing',
      '--publish', '127.0.0.1:55439:5432', '--cpus=2', '--memory=1g', '--pids-limit=256',
      '--log-driver=none', '--tmpfs', '/var/lib/postgresql/data:rw,nosuid,noexec,size=512m',
      '--env', 'POSTGRES_PASSWORD', '--env', 'POSTGRES_USER=audit', '--env', 'POSTGRES_DB=medapp_audit',
      '--env', 'POSTGRES_HOST_AUTH_METHOD=scram-sha-256',
      '--env', `TZ=${config.timezone}`, '--env', `PGTZ=${config.timezone}`,
      // The entrypoint's temporary initialization server accepts Unix sockets
      // before TCP is ready; probe TCP so that phase cannot publish the URL.
      '--health-cmd', 'pg_isready -h 127.0.0.1 -U audit -d medapp_audit', '--health-interval=1s',
      '--health-timeout=5s', '--health-retries=60',
      config.image, 'postgres', '-c', `timezone=${config.timezone}`], { POSTGRES_PASSWORD: password }, 120000);
    if (!/^[a-f0-9]{64}$/.test(id) || await ownedContainer(docker, state) !== id) throw failure();
    const deadline = Date.now() + 90000;
    for (let attempt = 0; attempt < 60 && Date.now() < deadline; attempt++) {
      signal?.throwIfAborted();
      const health = await docker(['container', 'inspect', '--format',
        '{{.State.Running}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}', id]);
      if (health === 'true|healthy') {
        signal?.throwIfAborted();
        configureTestDatabase({ TEST_DATABASE_PASSWORD: password, GITHUB_ENV: env.GITHUB_ENV }, append, mask);
        return; // No password, URL, container env, or secret output returned.
      }
      if (health !== 'true|starting') throw failure();
      await delay(1000, undefined, { signal });
    }
    throw failure();
  } catch {
    if (saved) {
      try { await removeOwned(docker, state, config); }
      catch { /* always() cleanup retries; never sweep unrelated resources. */ }
    }
    throw failure();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.on('SIGINT', cancel);
  process.on('SIGTERM', cancel);
  try {
    if (process.argv.length !== 3) throw failure();
    if (process.argv[2] === 'start') await startCiDatabase(process.env, { signal: controller.signal });
    else if (process.argv[2] === 'cleanup') await cleanupCiDatabase();
    else throw failure();
  } catch {
    console.error('Synthetic CI database operation failed; check approved matrix inputs and Docker availability (values redacted).');
    process.exitCode = 1;
  } finally {
    process.off('SIGINT', cancel);
    process.off('SIGTERM', cancel);
  }
}
