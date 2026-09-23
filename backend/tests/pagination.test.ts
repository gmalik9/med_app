import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { pagination, PaginationError } from '../src/utils/pagination';
import { paginationHttp } from './helpers/pagination-http';
import { testPassword } from './helpers/syntheticSecrets';
import { auditDatabaseUrl } from './helpers/auditDatabase';

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const decode = (value: string) => JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
const requestId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const resources = [
  { endpoint: '/api/notes/patient/SYN-HISTORY/history', field: 'notes', table: 'clinical_notes', stamp: 'note_date', existing: ['note_text', 'medical_codes', 'doctor_id', 'email', 'first_name', 'last_name'] },
  { endpoint: '/api/vitals/patient/SYN-HISTORY/history', field: 'vitalSigns', table: 'vital_signs', stamp: 'recorded_date', existing: ['temperature', 'heart_rate', 'recorded_by', 'notes'] },
  { endpoint: '/api/visits/patient/SYN-HISTORY', field: 'visits', table: 'visit_history', stamp: 'visit_date', existing: ['chief_complaint', 'diagnosis', 'doctor_id', 'first_name', 'last_name'] },
  { endpoint: '/api/appointments/patient/SYN-HISTORY/history', field: 'appointments', table: 'appointments', stamp: 'appointment_date', existing: ['status', 'reason', 'doctor_id', 'first_name', 'last_name'] },
  { endpoint: '/api/patients/', field: 'patients', table: 'patients', stamp: 'created_at', existing: ['patient_id', 'is_active', 'cumulative_medical_codes', 'allergies', 'medications'] },
];

describe('bounded scoped keyset pagination (fresh synthetic PostgreSQL)', () => {
  let http: Awaited<ReturnType<typeof paginationHttp>>; let db: Pool; let admin: Pool;
  let a: any; let b: any;
  const get = (path: string, params: Record<string, unknown> = {}, token?: string) => http.get(path)
    .set('Authorization', `Bearer ${token ?? a.accessToken}`).query(params)
    // An HTTP-parser 400 must never satisfy an expected application 400.
    .expect('X-Request-ID', requestId);
  beforeAll(async () => {
    const testUrl = process.env.TEST_DATABASE_URL;
    if (!testUrl) throw new Error('TEST_DATABASE_URL required; no skipped integration tests');
    const url = new URL(auditDatabaseUrl(testUrl));
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.port !== '55439' || url.pathname !== '/medapp_audit') throw new Error('Only loopback medapp_audit:55439 synthetic database is allowed');
    admin = new Pool({ connectionString: testUrl });
    const schema = `pagination_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE SCHEMA ${schema}`);
    console.log(`TRACK_F_SCHEMA=${schema}`);
    // Use a non-UTC session to expose accidental timezone conversions.
    url.searchParams.set('options', `-c search_path=${schema} -c timezone=America/Los_Angeles`);
    process.env.DATABASE_URL = url.toString();
    db = (await import('../src/db')).default;
    await (await import('../src/db/schema')).initializeDatabase();
    await (await import('../src/db/migrations')).migrateDatabase();
    console.log('TRACK_F_APPLIED_MIGRATIONS', (await db.query('SELECT version FROM schema_migrations ORDER BY version')).rows);
    http = await paginationHttp((await import('../src/app')).createApp());
    const register = (email: string) => http.post('/api/auth/register').send({ email, password: testPassword }).expect(201);
    a = (await register('pagination-a@example.invalid')).body;
    b = (await register('pagination-b@example.invalid')).body;
    await db.query(`
      INSERT INTO patients(patient_id, first_name, created_at) SELECT 'SYN-DIRECTORY-' || i, 'Synthetic',
        TIMESTAMP '2031-11-02 01:30:00.123000' + ((i % 7) + 1) * INTERVAL '1 microsecond' FROM generate_series(1,130) i;
      INSERT INTO patients(patient_id, created_at) VALUES ('SYN-HISTORY', '2020-01-01'), ('SYN-OTHER', '2020-01-01'),
        ('SYN-NULL-1', NULL), ('SYN-NULL-2', NULL), ('SYN-NULL-3', NULL);
      INSERT INTO clinical_notes(patient_id, doctor_id, note_date, note_text, medical_codes)
        SELECT 'SYN-HISTORY', (SELECT id FROM users ORDER BY id LIMIT 1 OFFSET (i % 2)), DATE '2031-01-01' + (i / 2),
          'Synthetic note ' || i, '["SYNTHETIC"]' FROM generate_series(0,129) i;
      INSERT INTO vital_signs(patient_id, recorded_by, recorded_date, heart_rate)
        SELECT 'SYN-HISTORY', (SELECT min(id) FROM users), TIMESTAMP '2031-11-02 01:30:00.123000' + ((i % 7) + 1) * INTERVAL '1 microsecond', 70 FROM generate_series(1,130) i;
      INSERT INTO visit_history(patient_id, doctor_id, visit_date, diagnosis)
        SELECT 'SYN-HISTORY', (SELECT min(id) FROM users), TIMESTAMP '2031-11-02 01:30:00.123000' + ((i % 7) + 1) * INTERVAL '1 microsecond', 'Synthetic visit' FROM generate_series(1,130) i;
      INSERT INTO appointments(patient_id, doctor_id, appointment_date, reason)
        SELECT 'SYN-HISTORY', (SELECT min(id) FROM users), TIMESTAMP '2031-11-02 01:30:00.123000' + ((i % 7) + 1) * INTERVAL '1 microsecond', 'Synthetic appointment' FROM generate_series(1,130) i;
    `);
  });
  afterEach(context => { if (context.task.result?.state === 'fail') http?.diagnose(); });
  afterAll(async () => { await http?.close(); await db?.end(); await admin?.end(); }); // Retain only synthetic evidence.

  for (const c of resources) {
    it(`${c.field}: traverses >100 tied/microsecond rows exactly once across concurrent newer inserts, preserving fields`, async () => {
      const where = c.table === 'patients' ? '' : "WHERE patient_id='SYN-HISTORY'";
      const baseline = (await db.query(`SELECT id FROM ${c.table} ${where} ORDER BY ${c.stamp} DESC, id DESC`)).rows.map(r => r.id);
      expect(baseline.length).toBeGreaterThan(100);
      const seen: number[] = [];
      let cursor: string | undefined;
      let pages = 0;
      do {
        const response = await get(c.endpoint, { limit: 17, ...(cursor ? { cursor } : {}) }).expect(200);
        expect(response.body[c.field].length).toBeLessThanOrEqual(17);
        expect(typeof response.body.hasMore).toBe('boolean');
        for (const row of response.body[c.field]) {
          for (const field of ['id', 'patient_id', 'created_at', 'updated_at', ...c.existing]) expect(row).toHaveProperty(field);
          expect(row).not.toHaveProperty('_cursor_timestamp');
          seen.push(row.id);
        }
        if (c.table === 'patients') expect(response.body).toMatchObject({ limit: 17, offset: 0 });
        if (response.body.hasMore) {
          expect(typeof response.body.nextCursor).toBe('string');
          const decoded = decode(response.body.nextCursor);
          const last = response.body[c.field].at(-1);
          const exact = (await db.query(`SELECT to_char(${c.stamp}, 'YYYY-MM-DD"T"HH24:MI:SS.US') AS stamp FROM ${c.table} WHERE id=$1`, [last.id])).rows[0].stamp;
          expect(decoded.t).toBe(exact);
          expect(decoded.id).toBe(last.id);
        } else expect(response.body.nextCursor).toBeNull();
        cursor = response.body.nextCursor ?? undefined;
        pages++;
        if (pages === 1) {
          const insert = c.table === 'patients'
            ? "INSERT INTO patients(patient_id, created_at) VALUES ('SYN-CONCURRENT', '2040-01-01')"
            : c.table === 'clinical_notes'
              ? "INSERT INTO clinical_notes(patient_id, doctor_id, note_date, note_text) SELECT 'SYN-HISTORY', min(id), '2040-01-01', 'Synthetic concurrent' FROM users"
              : `INSERT INTO ${c.table}(patient_id, ${c.table === 'vital_signs' ? 'recorded_by' : 'doctor_id'}, ${c.stamp}) SELECT 'SYN-HISTORY', min(id), '2040-01-01' FROM users`;
          // The insert and another read overlap; a newer row cannot shift the boundary.
          await Promise.all([db.query(insert), get(c.endpoint, { limit: 17, cursor }).expect(200)]);
        }
        expect(pages).toBeLessThan(20);
      } while (cursor);
      expect(seen).toEqual(baseline);
      expect(new Set(seen).size).toBe(seen.length);
    });

    it(`${c.field}: rejects malformed, wrong endpoint/patient, and invalid canonical timestamp cursors`, async () => {
      const first = await get(c.endpoint, { limit: 2 }).expect(200);
      const valid = first.body.nextCursor;
      const payload = decode(valid);
      const invalid = ['', '%%%', 'A', 'x'.repeat(1025), encode(null), encode([]), encode({}), `${valid}=`,
        encode({ ...payload, v: 2 }), encode({ ...payload, extra: true }), encode({ ...payload, id: '2' }),
        encode({ ...payload, id: 0 }), encode({ ...payload, id: 2147483648 }), encode({ ...payload, id: 1.5 }),
        ...['2031-02-29T00:00:00.000000', '0000-01-01T00:00:00.000000', '2031-01-01T24:00:00.000000',
          '2031-01-01T00:60:00.000000', '2031-01-01T00:00:60.000000', '2031-01-01T00:00:00.123',
          '2031-01-01T00:00:00.123456Z', '2031-01-01 00:00:00.123456', 123].map(t => encode({ ...payload, t })),
      ];
      for (const cursor of invalid) await get(c.endpoint, { cursor }).expect(400);
      await get(c.endpoint, { cursor: [valid, valid] }).expect(400);
      await get(c.endpoint, { cursor: { bad: valid } }).expect(400);
      if (c.table !== 'patients') {
        await get(c.endpoint.replace('SYN-HISTORY', 'SYN-OTHER'), { cursor: valid }).expect(400);
        await get(c.endpoint, { cursor: encode({ ...payload, t: null }) }).expect(400);
      }
      const otherEndpoint = resources.find(r => r.endpoint !== c.endpoint)!;
      await get(otherEndpoint.endpoint, { cursor: valid }).expect(400);
      await get(c.endpoint, { cursor: valid, offset: 0 }).expect(400);
      for (const limit of ['0', '101', '1.5', '-1', 'abc']) await get(c.endpoint, { limit }).expect(400);
    });

    it(`${c.field}: cursor grants no authorization and shared reads remain shared`, async () => {
      const first = await get(c.endpoint, { limit: 2 }).expect(200);
      const cursor = first.body.nextCursor;
      await http.get(c.endpoint).query({ cursor }).expect(401).expect('X-Request-ID', requestId);
      await get(c.endpoint, { cursor }, 'synthetic-invalid-token').expect(401);
      const shared = await get(c.endpoint, { cursor, limit: 2 }, b.accessToken).expect(200);
      expect(shared.body[c.field].length).toBe(2);
      // Even an intentionally fabricated boundary cannot remove the WHERE patient predicate.
      const forged = encode({ ...decode(cursor), t: '9999-12-31T23:59:59.999999', id: 2147483647 });
      const scoped = await get(c.endpoint, { cursor: forged }).expect(200);
      if (c.table !== 'patients') expect(scoped.body[c.field].every((r: any) => r.patient_id === 'SYN-HISTORY')).toBe(true);
    });
  }

  it('directory supports legacy offset, null creation timestamps and transition to non-null keysets', async () => {
    const baseline = (await db.query('SELECT id FROM patients ORDER BY created_at DESC, id DESC')).rows.map(r => r.id);
    const legacy = await get('/api/patients/', { limit: 3, offset: 2 }).expect(200);
    expect(legacy.body.patients.map((p: any) => p.id)).toEqual(baseline.slice(2, 5));
    expect(legacy.body).toMatchObject({ limit: 3, offset: 2, hasMore: true });
    const seen: number[] = []; let cursor: string | undefined;
    for (let i = 0; i < 4; i++) {
      const page = await get('/api/patients/', { limit: 1, ...(cursor ? { cursor } : {}) }).expect(200);
      seen.push(page.body.patients[0].id);
      cursor = page.body.nextCursor;
      if (i < 3) expect(decode(cursor!).t).toBeNull();
    }
    expect(seen).toEqual(baseline.slice(0, 4));
  });

  it('visit filtering binds cursors and does not widen the query', async () => {
    await db.query("INSERT INTO visit_history(patient_id, doctor_id, visit_date) SELECT 'SYN-HISTORY', min(id), '2000-01-01' FROM users");
    const upcoming = await get('/api/visits/patient/SYN-HISTORY', { limit: 2, filter: 'upcoming' }).expect(200);
    await get('/api/visits/patient/SYN-HISTORY', { cursor: upcoming.body.nextCursor, filter: 'all' }).expect(400);
    await get('/api/visits/patient/SYN-HISTORY', { cursor: upcoming.body.nextCursor }).expect(400);
    await get('/api/visits/patient/SYN-HISTORY', { filter: 'invalid' }).expect(400);
    await get('/api/visits/patient/SYN-HISTORY', { filter: ['all', 'upcoming'] }).expect(400);
    let cursor = upcoming.body.nextCursor;
    while (cursor) {
      const page = await get('/api/visits/patient/SYN-HISTORY', { limit: 100, filter: 'upcoming', cursor }).expect(200);
      expect(page.body.visits.every((v: any) => v.visit_date.startsWith('2031') || v.visit_date.startsWith('2040'))).toBe(true);
      cursor = page.body.nextCursor;
    }
  });

  it('empty and exact-size terminal pages have no continuation; exact MRN search is unchanged', async () => {
    for (const c of resources.filter(c => c.table !== 'patients')) {
      expect((await get(c.endpoint.replace('SYN-HISTORY', 'SYN-OTHER')).expect(200)).body).toEqual({ [c.field]: [], hasMore: false, nextCursor: null });
      const all = await get(c.endpoint, { limit: 100 }).expect(200);
      const remaining = await get(c.endpoint, { limit: 100, cursor: all.body.nextCursor }).expect(200);
      const exact = await get(c.endpoint, { limit: remaining.body[c.field].length, cursor: all.body.nextCursor }).expect(200);
      expect(exact.body.hasMore).toBe(false); expect(exact.body.nextCursor).toBeNull();
    }
    const result = await get('/api/patients/search', { patientId: 'SYN-HISTORY' }).expect(200);
    expect(result.body.exists).toBe(true); expect(result.body.patient.patient_id).toBe('SYN-HISTORY');
  });

  it('inactive users and revoked sessions are denied even with a valid cursor', async () => {
    const first = await get('/api/patients/', { limit: 1 }).expect(200);
    await db.query("UPDATE users SET is_active=false WHERE email='pagination-b@example.invalid'");
    for (const c of resources) await get(c.endpoint, {}, b.accessToken).expect(401);
    await db.query("UPDATE users SET is_active=true WHERE email='pagination-b@example.invalid'");
    await db.query("UPDATE sessions SET expires_at=NOW() - INTERVAL '1 second' WHERE user_id=(SELECT id FROM users WHERE email='pagination-b@example.invalid')");
    await get('/api/patients/', { cursor: first.body.nextCursor }, b.accessToken).expect(401);
  });
});

describe('cursor utility scope and bounds', () => {
  const scope = { endpoint: 'actor-scoped-example', patient: 'SYN', actor: 1, filters: { status: 'scheduled' } };
  const rows = [{ id: 2, _cursor_timestamp: '2000-02-29T01:30:00.123456' }, { id: 1, _cursor_timestamp: '2000-02-29T01:30:00.123456' }];
  it('binds actor and filters when access-scoped and preserves leap-day microseconds', () => {
    const cursor = pagination({ limit: '1' }, scope, 30).page(rows).nextCursor!;
    expect(pagination({ cursor }, scope, 30).cursor?.t).toBe(rows[0]._cursor_timestamp);
    expect(() => pagination({ cursor }, { ...scope, actor: 2 }, 30)).toThrow(PaginationError);
    expect(() => pagination({ cursor }, { ...scope, filters: { status: 'completed' } }, 30)).toThrow(PaginationError);
    expect(() => pagination({ cursor: encode({ ...decode(cursor), t: '1900-02-29T00:00:00.000000' }) }, scope, 30)).toThrow(PaginationError);
  });
  it('bounds query values itself and does not rely on global validation', () => {
    for (const query of [{ limit: [] }, { limit: '10000000' }, { limit: '0' }, { offset: '1' }, { cursor: 1 }, { cursor: [] }]) {
      expect(() => pagination(query, scope, 30)).toThrow(PaginationError);
    }
    expect(() => pagination({ offset: '100001' }, scope, 30, true)).toThrow(PaginationError);
  });
});
