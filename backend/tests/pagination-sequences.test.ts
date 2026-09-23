import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { paginationHttp } from './helpers/pagination-http';
import { assertSupportedPostgres } from './helpers/supportedPg';
import { testPassword } from './helpers/syntheticSecrets';
import { auditDatabaseUrl } from './helpers/auditDatabase';

const resources = [
  { path: '/api/notes/patient/SYN-SEQUENCE/history', field: 'notes' },
  { path: '/api/vitals/patient/SYN-SEQUENCE/history', field: 'vitalSigns' },
  { path: '/api/visits/patient/SYN-SEQUENCE', field: 'visits' },
  { path: '/api/appointments/patient/SYN-SEQUENCE/history', field: 'appointments' },
  { path: '/api/patients/', field: 'patients' },
];
const cases = Array.from({ length: 20 }, (_, index) => ({ index, ...resources[index % resources.length] }));
const rid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('20 independent adversarial pagination HTTP sequences (guarded real PostgreSQL)', () => {
  let http: Awaited<ReturnType<typeof paginationHttp>>; let db: Pool; let admin: Pool;
  const schema = `pagination_sequences_${randomUUID().replaceAll('-', '')}`;
  beforeAll(async () => {
    const value = process.env.TEST_DATABASE_URL;
    if (!value) throw new Error('TEST_DATABASE_URL required; no skipped integration tests');
    const url = new URL(auditDatabaseUrl(value));
    if (url.hostname !== '127.0.0.1' || url.port !== '55439' || url.pathname !== '/medapp_audit' || url.username !== 'audit') {
      throw new Error('Only synthetic audit database at 127.0.0.1:55439/medapp_audit allowed');
    }
    admin = new Pool({ connectionString: value, connectionTimeoutMillis: 2000, statement_timeout: 2000, query_timeout: 2500 });
    await assertSupportedPostgres(admin);
    await admin.query(`CREATE SCHEMA ${schema}`);
    console.log(`TRACK_F3_SEQUENCES_SCHEMA=${schema}`);
    url.searchParams.set('options', `-c search_path=${schema} -c timezone=America/Los_Angeles`);
    process.env.DATABASE_URL = url.toString();
    db = (await import('../src/db')).default;
    await (await import('../src/db/schema')).initializeDatabase();
    await (await import('../src/db/migrations')).migrateDatabase();
    http = await paginationHttp((await import('../src/app')).createApp());
    await db.query(`
      INSERT INTO users(email, password_hash) VALUES ('synthetic-author@example.invalid', 'synthetic-no-login');
      INSERT INTO patients(patient_id, created_at) VALUES ('SYN-SEQUENCE', '2000-01-01');
      INSERT INTO patients(patient_id, created_at)
        SELECT 'SYN-DIR-' || i, TIMESTAMP '2031-11-02 01:30:00.123000' + i * INTERVAL '1 microsecond' FROM generate_series(1,9) i;
      INSERT INTO clinical_notes(patient_id, doctor_id, note_date, note_text)
        SELECT 'SYN-SEQUENCE', 1, DATE '2031-01-01' + i, 'Synthetic only' FROM generate_series(1,9) i;
      INSERT INTO vital_signs(patient_id, recorded_by, recorded_date, heart_rate)
        SELECT 'SYN-SEQUENCE', 1, TIMESTAMP '2031-11-02 01:30:00.123000' + i * INTERVAL '1 microsecond', 70 FROM generate_series(1,9) i;
      INSERT INTO visit_history(patient_id, doctor_id, visit_date)
        SELECT 'SYN-SEQUENCE', 1, TIMESTAMP '2031-11-02 01:30:00.123000' + i * INTERVAL '1 microsecond' FROM generate_series(1,9) i;
      INSERT INTO appointments(patient_id, doctor_id, appointment_date)
        SELECT 'SYN-SEQUENCE', 1, TIMESTAMP '2031-11-02 01:30:00.123000' + i * INTERVAL '1 microsecond' FROM generate_series(1,9) i;
    `);
  });
  afterEach(context => { if (context.task.result?.state === 'fail') http?.diagnose(); });
  afterAll(async () => { await http?.close(); await db?.end(); await admin?.end(); }); // Synthetic evidence retained.

  it.each(cases)('sequence $index / $field: rejects adversarial input without corrupting later auth/boundaries', async c => {
    // Independent token and freshly acquired cursor in each sequence; no shared
    // cursor/client state and no assertion retry, even after an expected denial.
    const account = await http.post('/api/auth/register').send({
      email: `sequence-${c.index}@example.invalid`, password: testPassword,
    }).expect(201).expect('X-Request-ID', rid);
    const get = (query: Record<string, unknown> = {}, path = c.path) => http.get(path)
      .set('Authorization', `Bearer ${account.body.accessToken}`).query(query);
    const first = await get({ limit: 2 }).expect(200).expect('X-Request-ID', rid);
    const cursor: string = first.body.nextCursor;
    expect(first.body[c.field]).toHaveLength(2);
    expect(first.body.hasMore).toBe(true);
    expect(typeof cursor).toBe('string');
    const baseline = await get({ limit: 100 }).expect(200).expect('X-Request-ID', rid);

    const unauth = await http.get(c.path).query({ cursor }).expect(401).expect('X-Request-ID', rid);
    expect(unauth.body).toEqual({ error: 'No authorization token' });
    const invalidAuth = await http.get(c.path).query({ cursor }).set('Authorization', 'Bearer synthetic-invalid-token')
      .expect(401).expect('X-Request-ID', rid);
    expect(invalidAuth.body).toEqual({ error: 'Invalid or expired token' });

    const mutated = [
      { cursor: [cursor, cursor] }, { 'cursor.value': cursor },
      { cursor: 'x'.repeat(1025) }, { cursor: `${cursor}=` },
    ][Math.floor(c.index / resources.length)];
    for (const query of [mutated, { cursor: { bad: cursor } }, { cursor, offset: 0 }]) {
      const rejected = await get(query).expect(400).expect('X-Request-ID', rid);
      expect(rejected.body).toEqual({ error: 'Invalid pagination parameters' });
    }
    const validator = await get({ cursor, limit: '0' }).expect(400).expect('X-Request-ID', rid);
    expect(validator.body).toEqual({ error: 'Invalid request fields' });
    const other = resources[(c.index + 1) % resources.length];
    const wrongScope = await get({ cursor }, other.path).expect(400).expect('X-Request-ID', rid);
    expect(wrongScope.body).toEqual({ error: 'Invalid pagination parameters' });

    // Deliberate protocol-invalid control, NOT the historical failure: Node must
    // reject before Express with empty body/no RID. The next valid request must
    // still pass. This proves our diagnostics distinguish HTTP from validation.
    const parser = await get({ cursor }).set('Content-Length', 'not-a-number').expect(400);
    expect(parser.headers['x-request-id']).toBeUndefined();
    expect(parser.headers['content-type']).toBeUndefined();
    expect(parser.headers.connection).toBe('close');
    expect(parser.text).toBe('');

    const second = await get({ cursor, limit: 3 }).expect(200).expect('X-Request-ID', rid);
    expect(second.body[c.field].map((row: any) => row.id)).toEqual(baseline.body[c.field].slice(2, 5).map((row: any) => row.id));
    const final = await get({ cursor: second.body.nextCursor, limit: 100 }).expect(200).expect('X-Request-ID', rid);
    expect(final.body[c.field].map((row: any) => row.id)).toEqual(baseline.body[c.field].slice(5).map((row: any) => row.id));
    expect(final.body).toMatchObject({ hasMore: false, nextCursor: null });
    console.log(JSON.stringify({ event: 'pagination_independent_sequence_complete', index: c.index, resource: c.field,
      statuses: [201, 200, 200, 401, 401, 400, 400, 400, 400, 400, 400, 200, 200] }));
  });
});
