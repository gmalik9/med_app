import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { Pool } = require('pg');
import { requireAuditDatabase } from './audit-database.cjs';
import { syntheticSecret } from './synthetic-secrets.mjs';
// Fail before connecting; reject option/search_path injection and other databases.
let expected;
try { expected = requireAuditDatabase(); }
catch { throw new Error('E2E requires the exact approved loopback synthetic audit database with a supplied password'); }
const url = new URL(expected);
const admin = new Pool({ connectionString: url.toString() });
const schema = `e2e_${randomUUID().replaceAll('-', '')}`;
let pool;
let server;
let created = false;
let closing = false;
// dotenv's default cwd must not read a developer/production environment file.
const emptyCwd = await mkdtemp(join(tmpdir(), 'medapp-e2e-env-'));
process.chdir(emptyCwd);
async function close(exitCode) {
  if (closing) return;
  closing = true;
  try {
    if (server) await new Promise(resolve => {
      server.close(resolve);
      server.closeAllConnections();
    });
    if (pool) await pool.end();
    if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
    await rm(emptyCwd, { recursive: true, force: true });
  } catch {
    console.error('Synthetic E2E cleanup failed; inspect only the owned temporary schema');
    exitCode = 1;
  }
  process.exit(exitCode);
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void close(0); });
try {
  await admin.query(`CREATE SCHEMA ${schema}`);
  created = true;
  url.searchParams.set('options', `-c search_path=${schema}`);
  Object.assign(process.env, { NODE_ENV: 'test', DATABASE_URL: url.toString(), SEED_DATABASE: 'false', ENABLE_EXTERNAL_AI: 'false', GEMINI_API_KEY: '',
    JWT_SECRET: syntheticSecret(), JWT_REFRESH_SECRET: syntheticSecret(),
    ALLOW_SELF_REGISTRATION: 'true', ALLOWED_ORIGINS: 'http://127.0.0.1:5179', TRUST_PROXY_HOPS: '0', DB_POOL_MAX: '10' });
  // No live provider is permitted, even if application configuration regresses.
  globalThis.fetch = async () => { throw new Error('External fetch disabled in synthetic E2E'); };
  const { initializeDatabase } = require('../backend/dist/db/schema.js');
  const { migrateDatabase } = require('../backend/dist/db/migrations.js');
  const { createApp } = require('../backend/dist/app.js');
  pool = require('../backend/dist/db/index.js').default;
  await initializeDatabase();
  await migrateDatabase();
  const { checkSchemaReady } = require('../backend/dist/db/schemaState.js');
  await checkSchemaReady(pool);
  const versions = (await pool.query('SELECT version FROM schema_migrations ORDER BY version')).rows.map(row => row.version);
  if (JSON.stringify(versions) !== '[1,2,3]') throw new Error('Synthetic schema must include migrations 1, 2 and 3');
  server = createApp().listen(5059, '127.0.0.1');
  server.on('error', () => { console.error('Synthetic E2E listener failed'); void close(1); });
} catch {
  console.error('Synthetic E2E startup failed (build, database connectivity, or schema readiness)');
  await close(1);
}
