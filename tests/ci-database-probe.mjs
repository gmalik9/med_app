// Explicit, disposable local probe; never discovered by the default test glob.
// Capture the real CLI's masking commands privately, not in a local terminal log.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, readFileSync, rmSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { CI_DATABASE_IMAGES, CI_DATABASE_TIMEZONES, CI_DATABASE_STATE } from './ci-database.mjs';
import { requireAuditDatabase } from './audit-database.cjs';

const execute = promisify(execFile);
const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { Client } = require('pg');
const helper = new URL('./ci-database.mjs', import.meta.url).pathname;
let stage = 'explicit opt-in';

async function snapshot() {
  const containers = await execute('docker', ['container', 'ls', '--all', '--no-trunc',
    '--format', '{{.ID}}|{{.Names}}|{{.State}}'], { timeout: 10000 });
  const volumes = await execute('docker', ['volume', 'ls', '--format', '{{.Name}}'], { timeout: 10000 });
  return [containers.stdout.trim().split('\n').sort(), volumes.stdout.trim().split('\n').sort()];
}

try {
  if (process.env.CI_DATABASE_PROBE !== 'disposable-local-only') throw new Error();
  stage = 'loopback port availability';
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen({ host: '127.0.0.1', port: 55439, exclusive: true }, resolve); });
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  stage = 'existing resource snapshot';
  const before = await snapshot();
  for (const major of ['15', '17']) for (const timezone of CI_DATABASE_TIMEZONES) {
    const directory = mkdtempSync(join(tmpdir(), 'medapp-ci-database-probe-'));
    const env = { ...process.env, RUNNER_TEMP: directory, GITHUB_ENV: join(directory, 'job-env'),
      GITHUB_RUN_ID: String(Date.now()), GITHUB_RUN_ATTEMPT: '1', GITHUB_JOB: 'required-integration',
      EXPECTED_PG_MAJOR: major, EXPECTED_PG_TIMEZONE: timezone, TZ: timezone, CI_DATABASE_IMAGE: CI_DATABASE_IMAGES[major] };
    delete env.TEST_DATABASE_PASSWORD;
    delete env.TEST_DATABASE_URL;
    try {
      stage = `PG${major}/${timezone} real CLI startup`;
      const result = await execute(process.execPath, [helper, 'start'], { env, timeout: 240000, maxBuffer: 65536 });
      assert.ok(!result.stderr);
      const content = readFileSync(env.GITHUB_ENV, 'utf8');
      assert.ok(content.startsWith('TEST_DATABASE_URL=') && content.split('\n').length === 2);
      const url = requireAuditDatabase({ TEST_DATABASE_URL: content.slice('TEST_DATABASE_URL='.length, -1) });
      assert.ok((statSync(env.GITHUB_ENV).mode & 0o777) === 0o600);
      const maskLines = result.stdout.trim().split('\n');
      assert.ok(maskLines.length === 4 && maskLines.every(line => line.startsWith('::add-mask::')));
      assert.ok(maskLines[0] === `::add-mask::${new URL(url).password}`);
      assert.ok(maskLines.at(-1) === `::add-mask::${url}`);
      stage = `PG${major}/${timezone} wrong-password rejection`;
      const wrong = new URL(url);
      wrong.password = randomBytes(32).toString('hex');
      const denied = new Client({ connectionString: wrong.href, connectionTimeoutMillis: 5000 });
      try {
        await assert.rejects(denied.connect(), error => {
          if (error.code !== '28P01') throw error;
          return true;
        });
      }
      finally { await denied.end(); }
      const client = new Client({ connectionString: url, connectionTimeoutMillis: 5000 });
      const schema = `ci_probe_${randomBytes(12).toString('hex')}`;
      let created = false;
      try {
        stage = `PG${major}/${timezone} authenticated connection`;
        await client.connect();
        stage = `PG${major}/${timezone} SQL matrix metadata`;
        const { rows: [info] } = await client.query("SELECT current_setting('server_version_num') AS version, current_setting('TimeZone') AS timezone, current_user AS username, current_database() AS database");
        assert.ok(String(Math.floor(Number(info.version) / 10000)) === major);
        assert.ok(info.timezone === timezone && info.username === 'audit' && info.database === 'medapp_audit');
        stage = `PG${major}/${timezone} isolated synthetic writes`;
        await client.query(`CREATE SCHEMA "${schema}"`); created = true;
        await client.query(`CREATE TABLE "${schema}".probe (value integer NOT NULL)`);
        await client.query(`INSERT INTO "${schema}".probe VALUES (1)`);
        const { rows } = await client.query(`SELECT value FROM "${schema}".probe`);
        assert.ok(rows.length === 1 && rows[0].value === 1);
      } finally {
        try { if (created) await client.query(`DROP SCHEMA "${schema}" CASCADE`); }
        finally { await client.end(); }
      }
    } finally {
      // Use a new process and the non-secret receipt, like the workflow's
      // always() step. Failed cleanup retains receipt privately for a retry.
      await execute(process.execPath, [helper, 'cleanup'], { env, timeout: 30000, maxBuffer: 65536 });
      assert.ok(!existsSync(join(directory, CI_DATABASE_STATE)));
      rmSync(directory, { recursive: true, force: true });
    }
    console.log(`PASS disposable PG${major}/${timezone}: real CLI masks, authenticated SQL, wrong-password rejection, private env and owned cleanup`);
  }
  stage = 'existing resource preservation';
  assert.deepEqual(await snapshot(), before);
  console.log('PASS existing container identities/states and volume names unchanged; no probe containers retained');
} catch (error) {
  const code = ['28P01', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ERR_ASSERTION'].includes(error.code) ? error.code : 'withheld';
  console.error(`Disposable CI database probe failed at ${stage}; category=${code} (all credential/child diagnostics withheld).`);
  process.exitCode = 1;
}
