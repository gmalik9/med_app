import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import { testPassword } from './helpers/syntheticSecrets';
import { auditDatabaseUrl } from './helpers/auditDatabase';

const testUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!testUrl)('PostgreSQL API integration (synthetic only)', () => {
  let app: Express;
  let db: Pool;
  let admin: Pool;
  let schema: string;
  let a: any; let b: any; let patient: any;
  let searchRequestId: string;
  const password = testPassword;
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const signup = (email: string) => request(app).post('/api/auth/register').send({ email, password, firstName: 'Synthetic', lastName: 'Doctor' });
  beforeAll(async () => {
    const url = new URL(auditDatabaseUrl(testUrl));
    admin = new Pool({ connectionString: testUrl });
    schema = `audit_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE SCHEMA ${schema}`);
    url.searchParams.set('options', `-c search_path=${schema}`);
    process.env.DATABASE_URL = url.toString();
    const database = await import('../src/db');
    db = database.default;
    const { initializeDatabase } = await import('../src/db/schema');
    const { migrateDatabase } = await import('../src/db/migrations');
    await initializeDatabase();
    await migrateDatabase();
    await migrateDatabase();
    app = (await import('../src/app')).createApp();
    a = (await signup('a@example.invalid').expect(201)).body;
    b = (await signup('b@example.invalid').expect(201)).body;
  });
  afterAll(async () => {
    await db?.end();
    if (admin && schema) {
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      expect((await admin.query('SELECT 1 FROM pg_namespace WHERE nspname=$1', [schema])).rowCount).toBe(0);
    }
    await admin?.end();
  });

  it('preserves schema and records on migration rerun', async () => {
    const migrationsBefore = (await db.query('SELECT version, applied_at FROM schema_migrations ORDER BY version')).rows;
    const usersBefore = (await db.query('SELECT * FROM users ORDER BY id')).rows;
    expect(migrationsBefore.map(row => row.version)).toEqual([1, 2, 3]);
    expect(usersBefore).toHaveLength(2);

    await (await import('../src/db/migrations')).migrateDatabase();
    // Preserve both the original migration timestamps and complete user records,
    // rather than accepting a matching count after destructive replacement.
    expect((await db.query('SELECT version, applied_at FROM schema_migrations ORDER BY version')).rows).toEqual(migrationsBefore);
    expect((await db.query('SELECT * FROM users ORDER BY id')).rows).toEqual(usersBefore);
  });
  it('rejects arbitrary refresh tokens (baseline issued a token)', async () => {
    await request(app).post('/api/auth/refresh').send({ refreshToken: 'not-a-token' }).expect(401);
  });
  it('rotates refresh tokens atomically and rejects replay', async () => {
    const results = await Promise.all([1, 2].map(() => request(app).post('/api/auth/refresh').send({ refreshToken: a.refreshToken })));
    expect(results.map(r => r.status).sort()).toEqual([200, 401]);
    const good = results.find(r => r.status === 200)!;
    a = { ...a, ...good.body };
  });
  it('validates credentials and rejects privilege injection', async () => {
    await request(app).post('/api/auth/login').send({ email: {}, password }).expect(400);
    await request(app).post('/api/auth/register').send({ email: 'short@example.invalid', password: 'x' }).expect(400);
    await request(app).post('/api/auth/login').send({ email: 'a@example.invalid', password: 'wrong' }).expect(401);
    const result = await request(app).post('/api/auth/register').send({ email: 'role@example.invalid', password, role: 'admin' }).expect(201);
    expect(result.body.user.role).toBe('doctor');
  });
  it('creates complete patient data atomically and preserves calendar DOB', async () => {
    const response = await request(app).post('/api/patients/create').set(auth(a.accessToken)).send({ patientId: 'SYN-001', firstName: 'Synthetic', lastName: 'Patient', dob: '2000-02-29', allergies: 'SYNTHETIC_ALLERGY', medications: 'Synthetic medication' }).expect(201);
    patient = response.body.patient;
    expect(patient.dob).toBe('2000-02-29');
    expect(patient.allergies).toBe('SYNTHETIC_ALLERGY');
    await request(app).put(`/api/patients/${patient.id}`).set(auth(a.accessToken)).send({ firstName: 'Synthetic updated' }).expect(200);
    expect((await request(app).get(`/api/patients/${patient.id}`).set(auth(a.accessToken))).body.patient.dob).toBe('2000-02-29');
    const audits = await db.query("SELECT id FROM audit_log WHERE action = 'CREATE_PATIENT' AND patient_id = 'SYN-001'");
    expect(audits.rowCount).toBe(1);
  });
  it('handles duplicate concurrent patient creation as conflict, not server error', async () => {
    const results = await Promise.all([1, 2].map(() => request(app).post('/api/patients/create').set(auth(a.accessToken)).send({ patientId: 'SYN-DUP' })));
    expect(results.map(r => r.status).sort()).toEqual([201, 409]);
  });
  it('validates date, IDs, oversized JSON and query bounds', async () => {
    await request(app).post('/api/notes/patient/SYN-001').set(auth(a.accessToken)).send({ noteText: 'synthetic', date: 'not-a-date' }).expect(400);
    await request(app).post('/api/notes/patient/SYN-001').set(auth(a.accessToken)).send({ noteText: {} }).expect(400);
    await request(app).get('/api/notes/patient/SYN-001/history?limit=-1').set(auth(a.accessToken)).expect(400);
    await request(app).get('/api/patients?limit=100000').set(auth(a.accessToken)).expect(400);
    await request(app).put('/api/patients/not-an-integer').set(auth(a.accessToken)).send({}).expect(400);
    await request(app).get('/api/patients/999999999999999999999').set(auth(a.accessToken)).expect(400);
    await request(app).post('/api/patients/create').set(auth(a.accessToken)).send({ patientId: 'X', firstName: 'x'.repeat(140000) }).expect(413);
    await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{').expect(400);
  });
  it('prevents lost note updates and races with explicit revisions', async () => {
    const first = await request(app).post('/api/notes/patient/SYN-001').set(auth(a.accessToken)).send({ noteText: 'SYNTHETIC_CLINICAL_NOTE', date: '2026-09-20', medicalCodes: ['a01', 'A01'] }).expect(200);
    expect(first.body.note.medical_codes).toEqual(['A01']);
    expect(first.body.note.note_date).toBe('2026-09-20');
    const writes = await Promise.all(['one', 'two'].map(noteText => request(app).post('/api/notes/patient/SYN-001').set(auth(a.accessToken)).send({ noteText, date: '2026-09-20', expectedRevision: first.body.note.revision })));
    expect(writes.map(r => r.status).sort()).toEqual([200, 409]);
    const persisted = await request(app).get('/api/notes/patient/SYN-001?date=2026-09-20').set(auth(a.accessToken)).expect(200);
    expect(persisted.body.note.revision).toBe(2);
    expect((await db.query("SELECT count(*)::int AS n FROM clinical_notes WHERE patient_id='SYN-001'")).rows[0].n).toBe(1);
  });
  it('rolls clinical mutation back if its audit insert fails', async () => {
    const { auditedWrite } = await import('../src/services/auditedWrite');
    await expect(auditedWrite({ user: { userId: a.user.id }, ip: 'invalid-ip', requestId: 'test' } as any, 'x'.repeat(101),
      "INSERT INTO patients(patient_id) VALUES ('SYN-ROLLBACK') RETURNING *", [])).rejects.toBeDefined();
    expect((await db.query("SELECT id FROM patients WHERE patient_id='SYN-ROLLBACK'")).rows.length).toBe(0);
  });
  it('exercises patient lookup, update, activation, pagination and missing resources', async () => {
    const search = await request(app).get('/api/patients/search?patientId=SYN-001').set(auth(a.accessToken)).expect(200);
    searchRequestId = search.headers['x-request-id'];
    await request(app).get(`/api/patients/${patient.id}`).set(auth(a.accessToken)).expect(200);
    await request(app).get('/api/patients/SYN-001').set(auth(a.accessToken)).expect(200);
    await request(app).get('/api/patients/missing').set(auth(a.accessToken)).expect(404);
    await request(app).put(`/api/patients/${patient.id}`).set(auth(a.accessToken)).send({ dob: null, firstName: 'Updated' }).expect(200);
    const persisted = await request(app).get(`/api/patients/${patient.id}`).set(auth(a.accessToken));
    expect(persisted.body.patient.dob).toBeNull();
    await request(app).patch(`/api/patients/${patient.id}/active`).set(auth(a.accessToken)).send({ is_active: false }).expect(200);
    const page = await request(app).get('/api/patients?limit=1').set(auth(a.accessToken)).expect(200);
    expect(page.body.patients).toHaveLength(1); expect(page.body.hasMore).toBe(true);
  });
  it('enforces private template boundaries', async () => {
    await request(app).post('/api/templates/create').set(auth(a.accessToken)).send({ templateName: 'Private', templateText: 'SYNTHETIC_PRIVATE', templateCategory: 'General', isPublic: false }).expect(201);
    const own = await request(app).get('/api/templates/list').set(auth(a.accessToken)).expect(200);
    const other = await request(app).get('/api/templates/list').set(auth(b.accessToken)).expect(200);
    expect(own.body.templates).toHaveLength(1); expect(other.body.templates).toHaveLength(0);
    const category = await request(app).get('/api/templates/category/General').set(auth(b.accessToken)).expect(200);
    expect(category.body.templates).toHaveLength(0);
  });
  it('enforces appointment ownership and status enum', async () => {
    const appointment = await request(app).post('/api/appointments/create').set(auth(a.accessToken)).send({ patientId: 'SYN-001', appointmentDate: '2030-01-01T12:00:00Z' }).expect(201);
    const path = `/api/appointments/${appointment.body.appointment.id}/status`;
    await request(app).put(path).set(auth(b.accessToken)).send({ status: 'completed' }).expect(404);
    await request(app).put(path).set(auth(a.accessToken)).send({ status: 'arbitrary' }).expect(400);
    await request(app).put(path).set(auth(a.accessToken)).send({ status: 'completed' }).expect(200);
    await request(app).get('/api/appointments/upcoming').set(auth(a.accessToken)).expect(200);
    await request(app).get('/api/appointments/patient/SYN-001/history').set(auth(a.accessToken)).expect(200);
  });
  it('exercises vitals, visits, trends, notes history, profile and analytics', async () => {
    await request(app).post('/api/vitals/patient/SYN-001').set(auth(a.accessToken)).send({ heartRate: 70, temperature: 37, oxygenSaturation: 99 }).expect(201);
    await request(app).post('/api/vitals/patient/SYN-001').set(auth(a.accessToken)).send({ oxygenSaturation: 101 }).expect(400);
    const history = await request(app).get('/api/vitals/patient/SYN-001/history').set(auth(a.accessToken)).expect(200);
    expect(history.body.vitalSigns).toHaveLength(1);
    await request(app).get('/api/vitals/patient/SYN-001/latest').set(auth(a.accessToken)).expect(200);
    await request(app).post('/api/visits/create').set(auth(a.accessToken)).send({ patientId: 'SYN-001', nextVisitDate: '' }).expect(201);
    for (const path of ['/api/visits/patient/SYN-001', '/api/visits/doctor/today', '/api/analytics/dashboard', '/api/analytics/patient/SYN-001/trends', '/api/notes/patient/SYN-001/history', '/api/auth/profile']) {
      await request(app).get(path).set(auth(a.accessToken)).expect(200);
    }
    await request(app).put('/api/auth/profile').set(auth(a.accessToken)).send({ first_name: 'Synthetic updated', phone: '123' }).expect(200);
    await request(app).post('/api/analytics/event').set(auth(a.accessToken)).send({ eventType: 'search', eventData: { note: 'SHOULD_NOT_BE_STORED' } }).expect(200);
    expect((await db.query('SELECT event_data FROM analytics_events')).rows[0].event_data).toEqual({});
  });
  it('documents the existing shared-clinic read model without claiming tenant isolation', async () => {
    const shared = await request(app).get('/api/patients/search?patientId=SYN-001').set(auth(b.accessToken)).expect(200);
    expect(shared.body.exists).toBe(true);
  });
  it('rejects unauthenticated reads across every protected resource family', async () => {
    for (const path of ['/api/patients', '/api/patients/search?patientId=SYN-001', '/api/notes/patient/SYN-001', '/api/vitals/patient/SYN-001/latest', '/api/appointments/upcoming', '/api/visits/doctor/today', '/api/templates/list', '/api/analytics/dashboard', '/api/auth/profile']) {
      await request(app).get(path).expect(401);
    }
  });
  it('rejects file spoofing and keeps unknown OCR IDs out of the patient FK', async () => {
    await request(app).post('/api/patients/scan-sticker').set(auth(a.accessToken)).attach('image', Buffer.from('bad'), { filename: '../../image.png', contentType: 'image/png' }).expect(415);
    await request(app).post('/api/patients/scan-sticker').set(auth(a.accessToken)).attach('image', Buffer.from('<svg/>'), { filename: 'file.svg', contentType: 'image/svg+xml' }).expect(415);
    const ocr = await import('../src/services/stickerOcr');
    const mock = vi.spyOn(ocr, 'processStickerImage').mockResolvedValue({ text: 'MRN: 999999999\nName: SYNTHETIC PERSON' });
    try {
      const response = await request(app).post('/api/patients/scan-sticker').set(auth(a.accessToken)).attach('image', Buffer.from('mock-only'), { filename: 'synthetic.png', contentType: 'image/png' }).expect(200);
      expect(response.body.exists).toBe(false);
    } finally { mock.mockRestore(); }
  });
  it('removes seed endpoint and gates external AI without sending clinical data', async () => {
    await request(app).post('/api/seed').expect(404);
    await request(app).post('/api/format-note').set(auth(a.accessToken)).send({ text: 'SYNTHETIC ONLY' }).expect(503);
  });
  it('sets security/cache headers and rejects unapproved CORS origins', async () => {
    const health = await request(app).get('/health').expect(200);
    expect(health.headers['cache-control']).toBe('no-store');
    expect(health.headers['x-content-type-options']).toBe('nosniff');
    expect(health.headers['x-powered-by']).toBeUndefined();
    await request(app).get('/ready').expect(200);
    await request(app).get('/health').set('Origin', 'https://unapproved.example.invalid').expect(403);
  });
  it('enforces exact-session inactivity, disabled users and logout revocation', async () => {
    const otherLogin = (await request(app).post('/api/auth/login').send({ email: 'a@example.invalid', password }).expect(200)).body;
    await request(app).post('/api/auth/logout').set(auth(otherLogin.accessToken)).expect(204);
    await request(app).get('/api/auth/profile').set(auth(otherLogin.accessToken)).expect(401);
    await request(app).post('/api/auth/refresh').send({ refreshToken: otherLogin.refreshToken }).expect(401);
    await request(app).get('/api/auth/profile').set(auth(a.accessToken)).expect(200);
    await db.query("UPDATE sessions SET last_activity=NOW()-INTERVAL '1 hour' WHERE user_id=$1", [b.user.id]);
    await request(app).get('/api/auth/profile').set(auth(b.accessToken)).expect(401);
    await request(app).post('/api/auth/refresh').send({ refreshToken: b.refreshToken }).expect(401);
    await db.query('UPDATE users SET is_active=false WHERE id=$1', [a.user.id]);
    await request(app).get('/api/auth/profile').set(auth(a.accessToken)).expect(401);
    await request(app).post('/api/auth/login').send({ email: 'a@example.invalid', password }).expect(401);
  });
  it('does not persist passwords, tokens, notes or OCR text in audit details', async () => {
    const rows = await db.query('SELECT details FROM audit_log');
    const logs = JSON.stringify(rows.rows);
    for (const sensitive of [password, a.accessToken, a.refreshToken, 'SYNTHETIC_CLINICAL_NOTE', 'SYNTHETIC_PRIVATE', 'SYNTHETIC PERSON']) expect(logs.includes(sensitive)).toBe(false);
    expect(rows.rows.some(row => row.details?.includes('"status":401'))).toBe(true);
    const searchAudit = await db.query(`SELECT user_id, details FROM audit_log WHERE action='GET /api/patients/search'
      AND details::jsonb->>'requestId'=$1 AND details::jsonb->>'phase'='response_finished'`, [searchRequestId]);
    expect(searchAudit.rows).toHaveLength(1);
    expect(searchAudit.rows[0].user_id).toBe(a.user.id);
    expect(JSON.parse(searchAudit.rows[0].details)).toMatchObject({ requestId: searchRequestId, resourceId: 'SYN-001',
      resourceType: 'patient_identifier', referenceSource: 'requested', resolvedPatientId: 'SYN-001',
      resolvedResourceId: patient.id, endpoint: '/api/patients/search', authentication: 'established', status: 200 });
    const loginAudit = await db.query("SELECT user_id FROM audit_log WHERE action='POST /api/auth/login' AND details::jsonb->>'status'='200' LIMIT 1");
    expect(loginAudit.rows[0].user_id).toBe(a.user.id);
  });
  it('rate limits repeated authentication attempts', async () => {
    const limitedApp = (await import('../src/app')).createApp();
    const responses = [];
    for (let i = 0; i < 31; i++) responses.push(await request(limitedApp).post('/api/auth/login').send({}));
    expect(responses.at(-1)?.status).toBe(429);
  });
});
