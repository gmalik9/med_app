import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import { testPassword } from './helpers/syntheticSecrets';
import { auditDatabaseUrl } from './helpers/auditDatabase';

vi.mock('../src/services/stickerOcr', () => ({ processStickerImage: vi.fn(() => { throw new Error('OCR forbidden'); }) }));

const testUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!testUrl)('restricted audit references in guarded synthetic PostgreSQL', () => {
  let app: Express;
  let db: Pool;
  let admin: Pool;
  let schema: string;
  let accessToken: string;
  let log: ReturnType<typeof vi.spyOn>;
  let errorLog: ReturnType<typeof vi.spyOn>;
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  const patients = ['SYN-G-Alpha', 'SYN-G-Beta'];
  const clinical = 'SYN_G_PRIVATE_CLINICAL_BODY';
  const credential = 'SYN_G_PRIVATE_CREDENTIAL';
  const password = testPassword;
  const ids = new Map<string, { patient: number; note: number }>();
  const headers = () => ({ Authorization: `Bearer ${accessToken}`, 'X-Request-ID': credential });
  const events = async (requestId: string) => {
    let rows: { user_id: number | null; details: any }[] = [];
    // Finish writes are explicitly best effort/asynchronous, not a durability
    // promise. Wait only in the test, select correlation+phase, not insertion ID.
    await vi.waitFor(async () => {
      rows = (await db.query(`SELECT user_id, details::jsonb AS details FROM audit_log
        WHERE details::jsonb->>'requestId'=$1`, [requestId])).rows;
      expect(rows).toHaveLength(2);
    }, { timeout: 3000, interval: 10 });
    return rows;
  };
  const terminal = async (response: request.Response) => {
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    const rows = await events(response.headers['x-request-id']);
    expect(rows.find(row => row.details.phase === 'request_received')?.details.resourceId).toBeUndefined();
    const finish = rows.filter(row => row.details.phase === 'response_finished');
    expect(finish).toHaveLength(1);
    return finish[0].details;
  };

  beforeAll(async () => {
    const url = new URL(auditDatabaseUrl(testUrl));
    admin = new Pool({ connectionString: testUrl });
    schema = `audit_g_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE SCHEMA ${schema}`);
    url.searchParams.set('options', `-c search_path=${schema}`);
    process.env.DATABASE_URL = url.toString();
    db = (await import('../src/db')).default;
    await (await import('../src/db/schema')).initializeDatabase();
    await (await import('../src/db/migrations')).migrateDatabase();
    expect((await db.query('SELECT current_schema() AS schema')).rows[0].schema).toBe(schema);
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('External network forbidden'));
    app = (await import('../src/app')).createApp();
    const account = await request(app).post('/api/auth/register').send({ email: 'g-synthetic@example.invalid', password }).expect(201);
    accessToken = account.body.accessToken;
    await terminal(account);
    for (const patient of patients) {
      const result = await db.query('INSERT INTO patients (patient_id, first_name) VALUES ($1, $2) RETURNING id', [patient, clinical]);
      const note = await db.query(`INSERT INTO clinical_notes (patient_id, doctor_id, note_date, note_text)
        VALUES ($1, $2, '2026-09-20', $3) RETURNING id`, [patient, account.body.user.id, clinical]);
      ids.set(patient, { patient: result.rows[0].id, note: note.rows[0].id });
    }
  });
  afterAll(async () => {
    try {
      if (fetchSpy) expect(fetchSpy).not.toHaveBeenCalled();
      if (log && errorLog) {
        const output = JSON.stringify([...log.mock.calls, ...errorLog.mock.calls]);
        for (const forbidden of [...patients, clinical, credential, password, accessToken, 'g-synthetic@example.invalid']) expect(output).not.toContain(forbidden);
      }
    } finally {
      vi.restoreAllMocks();
      await db?.end();
      if (admin && schema) {
        await admin.query(`DROP SCHEMA ${schema} CASCADE`);
        expect((await admin.query('SELECT 1 FROM pg_namespace WHERE nspname=$1', [schema])).rowCount).toBe(0);
      }
      await admin?.end();
    }
  });

  it.each(patients)('persists identifiable search and note terminal events for %s', async patient => {
    const search = await request(app).get(`/API/PATIENTS/SEARCH/?patientId=${patient}&private=${credential}`).set(headers()).expect(200);
    expect(search.body.patient.patient_id).toBe(patient);
    const searchAudit = await terminal(search);
    expect(searchAudit).toMatchObject({ resourceId: patient, resourceType: 'patient_identifier', referenceSource: 'requested',
      resolvedPatientId: patient, resolvedResourceId: ids.get(patient)!.patient, endpoint: '/api/patients/search', authentication: 'established' });
    const note = await request(app).get(`/API/NOTES/PATIENT/${patient}/?date=2026-09-20`).set(headers()).expect(200);
    expect(note.body.note).toMatchObject({ id: ids.get(patient)!.note, patient_id: patient,
      note_date: '2026-09-20', note_text: clinical });
    expect(await terminal(note)).toMatchObject({ resourceId: patient, resourceType: 'patient_identifier', referenceSource: 'requested',
      resolvedPatientId: patient, resolvedResourceId: ids.get(patient)!.note, endpoint: '/api/notes/patient/:patientId',
      authentication: 'established', status: 200, outcome: 'success' });
  });

  describe.each(patients)('malformed single-note query for %s', patient => {
    it.each([
      ['private/clinical keys', `private=${credential}&clinical=${clinical}`],
      ['unrelated patientId parameter', 'patientId=SYN-Distractor'],
      ['former extra-key success fixture', `private=${credential}&patientId=${patient}`],
      ['valid date with extra keys', `date=2026-09-20&patientId=SYN-Distractor&private=${credential}&clinical=${clinical}`],
    ])('persists redacted 400 events (%s), not authorized disclosure', async (_name, query) => {
      const url = `/API/NOTES/PATIENT/${patient}/?${query}`;
      const response = await request(app).get(url).set(headers()).set('Cookie', `private=${clinical}`).expect(400);
      expect(response.body).toEqual({ error: 'Invalid request fields' });
      expect(await terminal(response)).toMatchObject({ endpoint: '/api/notes/patient/:patientId',
        phase: 'response_finished', status: 400, outcome: 'failure', authentication: 'not_established' });
      const rows = await events(response.headers['x-request-id']);
      for (const row of rows) {
        expect(row.user_id).toBeNull();
        expect(row.details.authentication).toBe('not_established');
        for (const key of ['resourceId', 'resourceType', 'referenceSource', 'resolvedPatientId', 'resolvedResourceId', 'listScope']) {
          expect(row.details).not.toHaveProperty(key);
        }
      }
      const serialized = JSON.stringify({ audits: rows, operator: [...log.mock.calls, ...errorLog.mock.calls] });
      for (const forbidden of [query, url, ...patients, 'SYN-Distractor', clinical, credential, password,
        accessToken, 'g-synthetic@example.invalid']) expect(serialized).not.toContain(forbidden);
    });
  });

  it('separates requested internal record ID from resolved patient identifier', async () => {
    const patient = patients[0];
    const response = await request(app).get(`/api/patients/${ids.get(patient)!.patient}`).set(headers()).expect(200);
    expect(await terminal(response)).toMatchObject({ resourceId: String(ids.get(patient)!.patient), resourceType: 'patient_record',
      referenceSource: 'requested', resolvedPatientId: patient, resolvedResourceId: ids.get(patient)!.patient });
  });

  it('records empty successful search/note scope without inventing resolved records', async () => {
    for (const url of ['/api/patients/search?patientId=SYN-G-Missing', '/api/notes/patient/SYN-G-Missing?date=2026-09-20']) {
      const response = await request(app).get(url).set(headers()).expect(200);
      const details = await terminal(response);
      expect(details).toMatchObject({ resourceId: 'SYN-G-Missing', referenceSource: 'requested' });
      expect(details).not.toHaveProperty('resolvedPatientId');
      expect(details).not.toHaveProperty('resolvedResourceId');
    }
  });

  it('persists bounded list scope without cursors or a patient/result dump', async () => {
    const first = await request(app).get(`/api/patients?limit=1&private=${credential}`).set(headers()).expect(200);
    expect(await terminal(first)).toMatchObject({ listScope: { kind: 'shared_patient_directory', limit: 1, offset: 0, continuation: false } });
    expect(first.body.hasMore).toBe(true);
    const next = await request(app).get(`/api/patients?limit=1&cursor=${first.body.nextCursor}`).set(headers()).expect(200);
    const nextAudit = await terminal(next);
    expect(nextAudit.listScope).toEqual({ kind: 'shared_patient_directory', limit: 1, offset: 0, continuation: true });
    expect(nextAudit).not.toHaveProperty('resourceId');
    expect(JSON.stringify(nextAudit)).not.toContain(first.body.nextCursor);
    const history = await request(app).get(`/api/notes/patient/${patients[1]}/history?limit=2`).set(headers()).expect(200);
    expect(await terminal(history)).toMatchObject({ resourceId: patients[1], listScope: { kind: 'patient_history', limit: 2, continuation: false } });
  });

  it('does not retain references on unauthenticated, invalid, unmatched or unrelated requests', async () => {
    const responses = [
      await request(app).get(`/api/patients/search?patientId=${patients[0]}`).expect(401),
      await request(app).get('/api/patients/search?patientId=A&patientId=B').set(headers()).expect(400),
      await request(app).get(`/api/unknown/${patients[0]}?patientId=${patients[1]}`).set(headers()).expect(404),
      await request(app).get(`/api/auth/capabilities?patientId=${patients[0]}`).expect(200),
    ];
    for (const response of responses) {
      const details = await terminal(response);
      expect(details).not.toHaveProperty('resourceId');
      expect(details).not.toHaveProperty('resolvedPatientId');
    }
  });

  it('retains the original ordinary-read best-effort policy on real audit INSERT failure', async () => {
    await db.query(`CREATE FUNCTION reject_g_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'SYN_G_PRIVATE_CREDENTIAL SYN_G_PRIVATE_CLINICAL_BODY'; END $$`);
    await db.query('CREATE TRIGGER reject_g_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION reject_g_audit()');
    try {
      const response = await request(app).get(`/api/notes/patient/${patients[0]}?date=2026-09-20`).set(headers()).expect(200);
      expect(response.body.note.note_text).toBe(clinical);
      await vi.waitFor(() => {
        const errors = errorLog.mock.calls.map(([value]: unknown[]) => JSON.parse(String(value)) as { event: string; requestId: string });
        expect(errors.filter((row: { event: string; requestId: string }) => row.event === 'audit_write_failed' && row.requestId === response.headers['x-request-id'])).toHaveLength(2);
      }, { timeout: 3000, interval: 10 });
      expect((await db.query(`SELECT 1 FROM audit_log WHERE details::jsonb->>'requestId'=$1`, [response.headers['x-request-id']])).rowCount).toBe(0);
    } finally {
      await db.query('DROP TRIGGER reject_g_audit ON audit_log');
      await db.query('DROP FUNCTION reject_g_audit()');
    }
  });

  it('uses current v3 readiness and keeps clinical bodies and credentials out of restricted details too', async () => {
    expect((await db.query('SELECT version FROM schema_migrations ORDER BY version')).rows.map(row => row.version)).toEqual([1, 2, 3]);
    await request(app).get('/ready').expect(200, { status: 'ready' });
    const serialized = JSON.stringify((await db.query('SELECT details FROM audit_log')).rows);
    for (const forbidden of [clinical, credential, password, accessToken, 'SYN-Distractor']) expect(serialized).not.toContain(forbidden);
    for (const patient of patients) expect(serialized).toContain(patient);
  });
});
