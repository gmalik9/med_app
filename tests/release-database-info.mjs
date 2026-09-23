import { createRequire } from 'node:module';
import { requireAuditDatabase } from './release-runner.mjs';

// No dotenv, no application import, no DDL: metadata-only CI matrix assertion.
try {
  requireAuditDatabase();
  const require = createRequire(new URL('../backend/package.json', import.meta.url));
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, connectionTimeoutMillis: 5000 });
  try {
    const { rows: [info] } = await pool.query("SELECT current_setting('server_version_num') AS version, current_setting('TimeZone') AS timezone");
    const major = String(Math.floor(Number(info.version) / 10000));
    if (process.env.EXPECTED_PG_MAJOR && major !== process.env.EXPECTED_PG_MAJOR) throw new Error('PostgreSQL major does not match matrix');
    if (process.env.EXPECTED_PG_TIMEZONE && info.timezone !== process.env.EXPECTED_PG_TIMEZONE) throw new Error('Server timezone does not match matrix');
    console.log(`Synthetic PostgreSQL major=${major}; server timezone=${info.timezone}; process TZ=${process.env.TZ || 'unset'}`);
  } finally { await pool.end(); }
} catch (error) {
  // Configuration values and connection errors may contain credentials; do not print them.
  console.error(`Synthetic database metadata check failed (${error.code || 'prerequisite/matrix mismatch'}); verify the guarded URL, service and matrix settings.`);
  process.exitCode = 1;
}