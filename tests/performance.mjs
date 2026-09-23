// Local synthetic benchmark, not a production capacity claim. No data is deleted.
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { requireAuditDatabase } from './audit-database.cjs';
import { syntheticSecret } from './synthetic-secrets.mjs';
const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { Pool } = require('pg');
const url = new URL(requireAuditDatabase());
if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/medapp_audit') throw new Error('Requires local medapp_audit database');
const admin = new Pool({ connectionString: url.toString() });
const schema = `perf_${randomUUID().replaceAll('-', '')}`;
await admin.query(`CREATE SCHEMA ${schema}`);
await admin.end();
url.searchParams.set('options', `-c search_path=${schema}`);
Object.assign(process.env, { NODE_ENV: 'test', DATABASE_URL: url.toString(), ENABLE_EXTERNAL_AI: 'false', GEMINI_API_KEY: '', ALLOW_SELF_REGISTRATION: 'true',
  JWT_SECRET: syntheticSecret(), JWT_REFRESH_SECRET: syntheticSecret() });
const pool = require('../backend/dist/db/index.js').default;
await require('../backend/dist/db/schema.js').initializeDatabase();
await require('../backend/dist/db/migrations.js').migrateDatabase();
const server = require('../backend/dist/app.js').createApp().listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
try {
  const response = await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'load@example.invalid', password: syntheticSecret() }) });
  if (response.status !== 201) throw new Error('Synthetic registration failed');
  const { user, accessToken } = await response.json();
  await pool.query(`INSERT INTO patients(patient_id, first_name, last_name, created_by)
    SELECT 'PERF-' || n, 'Synthetic', 'Patient', $1 FROM generate_series(1, 10000) n`, [user.id]);
  await pool.query(`INSERT INTO clinical_notes(patient_id, doctor_id, note_date, note_text, medical_codes)
    SELECT 'PERF-' || n, $1, CURRENT_DATE - d, 'SYNTHETIC benchmark note', '["Z00"]'::jsonb
    FROM generate_series(1, 10000) n CROSS JOIN generate_series(1, 5) d`, [user.id]);
  await pool.query('ANALYZE patients; ANALYZE clinical_notes');
  const plan = await pool.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT * FROM clinical_notes WHERE patient_id='PERF-5000' ORDER BY note_date DESC LIMIT 30`);
  const latencies = []; let failures = 0;
  const cpu = process.cpuUsage(); const start = performance.now();
  await Promise.all(Array.from({ length: 10 }, async () => {
    for (let i = 0; i < 20; i++) {
      const t = performance.now();
      const result = await fetch(base + '/api/patients?limit=50', { headers: { Authorization: `Bearer ${accessToken}` } });
      const body = await result.json();
      if (!result.ok || body.patients?.length !== 50) failures++;
      latencies.push(performance.now() - t);
    }
  }));
  latencies.sort((a, b) => a - b);
  const elapsed = performance.now() - start; const cpuUsed = process.cpuUsage(cpu);
  console.log(JSON.stringify({ benchmark: { patients: 10000, notes: 50000, requests: 200, concurrency: 10, failures,
    p50Ms: latencies[99], p95Ms: latencies[189], maxMs: latencies[199], requestsPerSecond: 200000 / elapsed,
    rssMiB: process.memoryUsage().rss / 1048576, cpuUserMs: cpuUsed.user / 1000, cpuSystemMs: cpuUsed.system / 1000 },
    noteQueryPlan: plan.rows[0]['QUERY PLAN'][0] }, null, 2));
} finally {
  await new Promise(resolve => server.close(resolve));
  await pool.end();
}
