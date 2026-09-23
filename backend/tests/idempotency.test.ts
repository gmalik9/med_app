import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import { idempotencyHttp } from './helpers/idempotency-http';
import { testPassword } from './helpers/syntheticSecrets';
import { auditDatabaseUrl } from './helpers/auditDatabase';

const testUrl = process.env.TEST_DATABASE_URL;
// Frozen historical DDL: fixtures must genuinely start at v1/v2, not create v3
// and remove its version marker/constraint. Keep v2's original patient PK.
const version1Fixture = `
  CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
  ALTER TABLE sessions ADD COLUMN session_key UUID NOT NULL DEFAULT gen_random_uuid();
  CREATE UNIQUE INDEX idx_sessions_key ON sessions(session_key);
  ALTER TABLE clinical_notes ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
  CREATE INDEX idx_notes_patient_date ON clinical_notes(patient_id, note_date DESC);
  CREATE INDEX idx_vitals_patient_date ON vital_signs(patient_id, recorded_date DESC);
  CREATE INDEX idx_visits_patient_date ON visit_history(patient_id, visit_date DESC);
  CREATE INDEX idx_visits_doctor_date ON visit_history(doctor_id, visit_date);
  CREATE INDEX idx_appointments_doctor_date ON appointments(doctor_id, appointment_date) WHERE status = 'scheduled';
  CREATE INDEX idx_patients_created ON patients(created_at DESC, id DESC);
  ALTER TABLE data_retention ALTER COLUMN auto_delete SET DEFAULT false;
  INSERT INTO schema_migrations(version) VALUES (1);`;
const version2Fixture = `
  CREATE TABLE clinical_write_keys (
    actor_id INTEGER NOT NULL REFERENCES users(id),
    operation VARCHAR(32) NOT NULL CHECK (operation IN ('CREATE_APPOINTMENT', 'CREATE_VISIT', 'RECORD_VITALS')),
    patient_id VARCHAR(50) NOT NULL REFERENCES patients(patient_id),
    request_key UUID NOT NULL,
    request_digest CHAR(64) NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
    resource_id INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (actor_id, operation, patient_id, request_key)
  );
  INSERT INTO schema_migrations(version) VALUES (2);
  INSERT INTO users(email, password_hash) VALUES ('v2-a@example.invalid', 'synthetic-no-login'), ('v2-b@example.invalid', 'synthetic-no-login');
  INSERT INTO patients(patient_id) VALUES ('SYN-V2-A'), ('SYN-V2-B'), ('SYN-V2-C');`;
const legacyVisitValues = (patient: string, actor: number) => [patient, actor, null, null, 'SYNTHETIC_V2_DIAGNOSIS', null, null, null];
const legacyVisitSql = `INSERT INTO visit_history
  (patient_id, doctor_id, visit_date, visit_type, chief_complaint, diagnosis, treatment_provided, followup_instructions, next_visit_date)
  VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7, $8) RETURNING *`;
async function seedVersion2Visit(client: PoolClient, actor: number, patient: string, key: string) {
  const values = legacyVisitValues(patient, actor);
  const result = await client.query(legacyVisitSql, values);
  const id = result.rows[0].id;
  await client.query(`INSERT INTO clinical_write_keys(actor_id, operation, patient_id, request_key, request_digest, resource_id)
    VALUES ($1, 'CREATE_VISIT', $2, $3, $4, $5)`, [actor, patient, key, createHash('sha256').update(JSON.stringify(values)).digest('hex'), id]);
  await client.query(`INSERT INTO audit_log(user_id, patient_id, action, details) VALUES ($1, $2, 'CREATE_VISIT', $3)`,
    [actor, patient, JSON.stringify({ resourceId: id })]);
  return id;
}
async function snapshotVersion2(client: PoolClient) {
  return {
    migrations: (await client.query('SELECT * FROM schema_migrations ORDER BY version')).rows,
    keys: (await client.query('SELECT * FROM clinical_write_keys ORDER BY actor_id, operation, patient_id, request_key')).rows,
    users: (await client.query('SELECT * FROM users ORDER BY id')).rows,
    patients: (await client.query('SELECT * FROM patients ORDER BY id')).rows,
    visits: (await client.query('SELECT * FROM visit_history ORDER BY id')).rows,
    audits: (await client.query('SELECT * FROM audit_log ORDER BY id')).rows,
  };
}
const cases = [
  { operation: 'CREATE_APPOINTMENT', path: '/api/appointments/create', field: 'appointment', table: 'appointments', body: { patientId: 'SYN-IDEM', appointmentDate: '2031-11-02T01:30', reason: 'SYNTHETIC_REASON' }, change: { reason: 'changed' } },
  { operation: 'CREATE_VISIT', path: '/api/visits/create', field: 'visit', table: 'visit_history', body: { patientId: 'SYN-IDEM', diagnosis: 'SYNTHETIC_DIAGNOSIS', nextVisitDate: '2031-11-02' }, change: { diagnosis: 'changed' } },
  { operation: 'RECORD_VITALS', path: '/api/vitals/patient/SYN-IDEM', field: 'vitalSigns', table: 'vital_signs', body: { heartRate: 73, notes: 'SYNTHETIC_VITAL_NOTE' }, change: { heartRate: 74 } },
];

describe('retry-safe clinical writes (fresh synthetic PostgreSQL schema)', () => {
  let http: Awaited<ReturnType<typeof idempotencyHttp>>; let db: Pool; let admin: Pool;
  let a: any; let b: any;
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  beforeAll(async () => {
    if (!testUrl) throw new Error('TEST_DATABASE_URL is required; idempotency integration must not silently skip');
    const url = new URL(auditDatabaseUrl(testUrl));
    if (url.hostname !== '127.0.0.1' || url.port !== '55439' || url.pathname !== '/medapp_audit' || url.username !== 'audit') {
      throw new Error('Dedicated synthetic audit database at 127.0.0.1:55439/medapp_audit required');
    }
    // Independent bounded observer, never queued behind the application's pool.
    admin = new Pool({ connectionString: testUrl, connectionTimeoutMillis: 2000, statement_timeout: 2000, query_timeout: 2500 });
    const schema = `idem_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE SCHEMA ${schema}`);
    console.log(`IDEMPOTENCY_SCHEMA=${schema}`);
    url.searchParams.set('options', `-c search_path=${schema}`);
    process.env.DATABASE_URL = url.toString();
    db = (await import('../src/db')).default;
    await (await import('../src/db/schema')).initializeDatabase();
    // Already-applied v1 must not short-circuit either v2 or v3.
    await db.query(version1Fixture);
    await db.query(`
      INSERT INTO patients(patient_id) VALUES ('SYN-IDEM'), ('SYN-OTHER'), ('SYN-ROLLBACK');
      INSERT INTO users(email, password_hash) VALUES ('legacy-fixture@example.invalid', 'synthetic-no-login');
      INSERT INTO appointments(patient_id, doctor_id, appointment_date)
        SELECT 'SYN-IDEM', id, '2001-10-28 01:30:00.123456'::timestamp FROM users WHERE email='legacy-fixture@example.invalid';
    `);
    const migrate = (await import('../src/db/migrations')).migrateDatabase;
    await Promise.all([migrate(), migrate()]);
    console.log('IDEMPOTENCY_DB_DEADLINES', JSON.stringify((await db.query(`SELECT
      current_setting('statement_timeout') AS statement_timeout, current_setting('lock_timeout') AS lock_timeout,
      current_setting('idle_in_transaction_session_timeout') AS idle_in_transaction_session_timeout`)).rows[0]));
    http = await idempotencyHttp((await import('../src/app')).createApp(), async () => ({
      pool: { total: db.totalCount, idle: db.idleCount, waiting: db.waitingCount },
      // No SQL text, bind values, actor/patient/key/fingerprint or credentials.
      // Only this suite's synthetic DB, with PID/blocker/wait/lock metadata.
      sessions: (await admin.query(`SELECT a.pid, a.state, a.wait_event_type, a.wait_event,
        pg_blocking_pids(a.pid) AS blocking_pids,
        round(extract(epoch FROM (clock_timestamp()-a.query_start))*1000) AS query_age_ms,
        round(extract(epoch FROM (clock_timestamp()-a.xact_start))*1000) AS transaction_age_ms,
        (SELECT json_agg(json_build_object('type', l.locktype, 'mode', l.mode, 'granted', l.granted))
          FROM pg_locks l WHERE l.pid=a.pid) AS locks
        FROM pg_stat_activity a WHERE a.datname=current_database() AND a.usename=current_user
          AND a.application_name='medical-notes' ORDER BY a.pid`)).rows,
    }));
    const signup = (email: string) => http.post('/api/auth/register').send({ email, password: testPassword }).expect(201);
    a = (await signup('idem-a@example.invalid')).body;
    b = (await signup('idem-b@example.invalid')).body;
  });
  afterEach(async context => { if (context.task.result?.state === 'fail') await http?.diagnose('failed_case'); });
  afterAll(async () => { await http?.close(); await db?.end(); await admin?.end(); }); // Retain synthetic schema/evidence.

  it('upgrades populated v1 once and reruns without suppressing newer versions or changing clinical data', async () => {
    await (await import('../src/db/migrations')).migrateDatabase();
    expect((await db.query('SELECT version FROM schema_migrations ORDER BY version')).rows).toEqual([{ version: 1 }, { version: 2 }, { version: 3 }]);
    expect((await db.query('SELECT count(*)::int AS n FROM patients')).rows[0].n).toBe(3);
    expect((await db.query("SELECT to_char(appointment_date, 'YYYY-MM-DD HH24:MI:SS.US') AS wall FROM appointments WHERE doctor_id=1")).rows).toEqual([{ wall: '2001-10-28 01:30:00.123456' }]);
  });

  async function withMigrationFixture(version: 'fresh' | 'v2', work: (client: PoolClient) => Promise<void>) {
    const schema = `idem_${version}_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE SCHEMA ${schema}`);
    console.log(`IDEMPOTENCY_MIGRATION_FIXTURE=${schema}`);
    const client = await admin.connect();
    const database = await import('../src/db');
    // Inject a dedicated real PostgreSQL transaction so this second schema
    // does not change the API pool/search_path or any existing database data.
    const seam = vi.spyOn(database, 'transaction').mockImplementation(async work => {
      await client.query('BEGIN');
      try {
        await client.query(`SET LOCAL search_path TO ${schema}`);
        const result = await work(client);
        await client.query('COMMIT'); return result;
      } catch (error) { await client.query('ROLLBACK'); throw error; }
    });
    try {
      await client.query(`SET search_path TO ${schema}`);
      await (await import('../src/db/schema')).initializeDatabase();
      if (version === 'v2') await client.query(version1Fixture + version2Fixture);
      await work(client);
    } finally {
      seam.mockRestore();
      await client.query('RESET search_path');
      client.release();
    }
  }

  it('applies all three migrations to an empty fresh schema and reruns without a missing version', async () => {
    await withMigrationFixture('fresh', async client => {
      const migrate = (await import('../src/db/migrations')).migrateDatabase;
      await migrate(); await migrate();
      expect((await client.query('SELECT version FROM schema_migrations ORDER BY version')).rows).toEqual([{ version: 1 }, { version: 2 }, { version: 3 }]);
      expect((await client.query('SELECT * FROM clinical_write_keys')).rows).toEqual([]);
      const constraints = (await client.query(`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
        WHERE conrelid='clinical_write_keys'::regclass AND contype IN ('p', 'u') ORDER BY contype`)).rows;
      expect(constraints).toEqual([
        { definition: 'PRIMARY KEY (actor_id, operation, patient_id, request_key)' },
        { definition: 'UNIQUE (actor_id, operation, request_key)' },
      ]);
    });
  });

  it('upgrades noncolliding populated v2 without rewriting keys/digests/history and replays the legacy identity', async () => {
    await withMigrationFixture('v2', async client => {
      const key = randomUUID();
      const id = await seedVersion2Visit(client, 1, 'SYN-V2-A', key);
      await seedVersion2Visit(client, 2, 'SYN-V2-B', key); // Another actor is independent.
      await seedVersion2Visit(client, 1, 'SYN-V2-B', randomUUID());
      const before = await snapshotVersion2(client);
      const migrate = (await import('../src/db/migrations')).migrateDatabase;
      await migrate(); await migrate();
      const after = await snapshotVersion2(client);
      expect(after.migrations.map(row => row.version)).toEqual([1, 2, 3]);
      expect({ ...after, migrations: after.migrations.slice(0, 2) }).toEqual(before);
      const { idempotentWrite } = await import('../src/services/idempotency');
      const req = { user: { userId: 1 }, get: () => key, rawHeaders: ['Idempotency-Key', key] } as any;
      const replay = await idempotentWrite(req, 'CREATE_VISIT', 'SYN-V2-A', legacyVisitSql, legacyVisitValues('SYN-V2-A', 1));
      expect(replay.replayed).toBe(true);
      expect(replay.result.rows[0].id).toBe(id);
      await expect(idempotentWrite(req, 'CREATE_VISIT', 'SYN-V2-B', legacyVisitSql, legacyVisitValues('SYN-V2-B', 1)))
        .rejects.toMatchObject({ status: 409 });
      expect(await snapshotVersion2(client)).toEqual(after);
    });
  });

  it('aborts colliding v2 at version 2 with sanitized actionable counts and preserves every row on repeated attempts', async () => {
    await withMigrationFixture('v2', async client => {
      const keys = [randomUUID(), randomUUID()];
      for (const patient of ['SYN-V2-A', 'SYN-V2-B', 'SYN-V2-C']) await seedVersion2Visit(client, 1, patient, keys[0]);
      for (const patient of ['SYN-V2-A', 'SYN-V2-B']) await seedVersion2Visit(client, 2, patient, keys[1]);
      await seedVersion2Visit(client, 1, 'SYN-V2-C', randomUUID()); // Noncolliding history also survives.
      const before = await snapshotVersion2(client);
      const { migrateDatabase, IdempotencyMigrationCollisionError } = await import('../src/db/migrations');
      for (let attempt = 0; attempt < 2; attempt++) {
        const error = await migrateDatabase().then(() => undefined, error => error);
        expect(error).toBeInstanceOf(IdempotencyMigrationCollisionError);
        expect(error).toMatchObject({ collisionGroups: '2', collisionRows: '5' });
        expect(error.message).toContain('groups=2; rows=5');
        expect(error.message).toContain('human reconciliation');
        expect(error.message).toContain('do not delete records or automatically rewrite keys');
        for (const sensitive of [...keys, 'SYN-V2-', 'SYNTHETIC_V2_DIAGNOSIS', 'v2-a@example.invalid', testUrl]) {
          expect(error.message).not.toContain(sensitive);
        }
        expect(error.detail).toBeUndefined();
        expect(await snapshotVersion2(client)).toEqual(before);
        expect((await client.query(`SELECT conname FROM pg_constraint WHERE conrelid='clinical_write_keys'::regclass AND contype='u'`)).rows).toEqual([]);
      }
    });
  });

  it('rolls back v3 DDL if the version marker fails, preserving populated v2 records and allowing a clean retry', async () => {
    await withMigrationFixture('v2', async client => {
      await seedVersion2Visit(client, 1, 'SYN-V2-A', randomUUID());
      const before = await snapshotVersion2(client);
      await client.query(`CREATE FUNCTION reject_v3_marker() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.version=3 THEN RAISE EXCEPTION 'synthetic v3 marker failure'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER reject_v3_marker BEFORE INSERT ON schema_migrations FOR EACH ROW EXECUTE FUNCTION reject_v3_marker();`);
      const migrate = (await import('../src/db/migrations')).migrateDatabase;
      try {
        await expect(migrate()).rejects.toThrow('synthetic v3 marker failure');
        expect(await snapshotVersion2(client)).toEqual(before);
        expect((await client.query(`SELECT conname FROM pg_constraint WHERE conrelid='clinical_write_keys'::regclass AND contype='u'`)).rows).toEqual([]);
      } finally { await client.query('DROP TRIGGER reject_v3_marker ON schema_migrations'); }
      await migrate();
      const after = await snapshotVersion2(client);
      expect(after.migrations.map(row => row.version)).toEqual([1, 2, 3]);
      expect({ ...after, migrations: after.migrations.slice(0, 2) }).toEqual(before);
    });
  });

  for (const c of cases) {
    const post = (token: string, key?: string, body: any = c.body, path = c.path) => {
      const req = http.post(path).set(auth(token));
      if (key !== undefined) req.set('Idempotency-Key', key);
      return req.send(body);
    };
    it(`${c.operation}: 20 concurrent requests and lost-response retry commit one resource/one success audit`, async () => {
      const key = randomUUID();
      const responses = await http.all(Array.from({ length: 20 }, () => post(a.accessToken, key)));
      expect(responses.map(r => r.status)).toEqual(Array(20).fill(201));
      const id = responses[0].body[c.field].id;
      expect(new Set(responses.map(r => r.body[c.field].id)).size).toBe(1);
      expect(responses.filter(r => r.headers['idempotency-replayed'] === 'false')).toHaveLength(1);
      // Simulate a caller losing/ignoring the successful response, then retrying.
      const replay = await post(a.accessToken, key).expect(201);
      expect(replay.body[c.field].id).toBe(id);
      expect(replay.headers['idempotency-replayed']).toBe('true');
      expect((await db.query(`SELECT count(*)::int AS n FROM ${c.table} WHERE id=$1`, [id])).rows[0].n).toBe(1);
      expect((await db.query("SELECT count(*)::int AS n FROM audit_log WHERE action=$1 AND details::jsonb->>'resourceId'=$2", [c.operation, String(id)])).rows[0].n).toBe(1);
      expect((await db.query('SELECT count(*)::int AS n FROM clinical_write_keys WHERE request_key=$1', [key])).rows[0].n).toBe(1);
      await post(a.accessToken, key, { ...c.body, ...c.change }).expect(409);
      await http.post(c.path).set('Idempotency-Key', key).send(c.body).expect(401);
    });
    it(`${c.operation}: other actors are independent but changing patient conflicts without another resource or success audit`, async () => {
      const key = randomUUID();
      const first = await post(a.accessToken, key).expect(201);
      const other = await post(b.accessToken, key).expect(201);
      expect(other.body[c.field].id).not.toBe(first.body[c.field].id);
      const path = c.path.replace('SYN-IDEM', 'SYN-OTHER');
      const rowsBefore = (await db.query(`SELECT * FROM ${c.table} ORDER BY id`)).rows;
      const auditsBefore = (await db.query('SELECT * FROM audit_log WHERE action=$1 ORDER BY id', [c.operation])).rows;
      const keysBefore = (await db.query('SELECT * FROM clinical_write_keys WHERE request_key=$1 ORDER BY actor_id', [key])).rows;
      const conflict = await post(a.accessToken, key, { ...c.body, patientId: 'SYN-OTHER' }, path).expect(409);
      expect(conflict.body).toEqual({ error: 'Idempotency key already used for different request fields' });
      expect((await db.query(`SELECT * FROM ${c.table} ORDER BY id`)).rows).toEqual(rowsBefore);
      expect((await db.query('SELECT * FROM audit_log WHERE action=$1 ORDER BY id', [c.operation])).rows).toEqual(auditsBefore);
      expect((await db.query('SELECT * FROM clinical_write_keys WHERE request_key=$1 ORDER BY actor_id', [key])).rows).toEqual(keysBefore);
      const replay = await post(a.accessToken, key).expect(201);
      expect(replay.body[c.field].id).toBe(first.body[c.field].id);
      expect(replay.headers['idempotency-replayed']).toBe('true');
      const fresh = await post(a.accessToken, randomUUID()).expect(201);
      expect(fresh.body[c.field].id).not.toBe(first.body[c.field].id);
      // Backwards compatibility is intentionally not natural clinical dedupe.
      const unkeyed = await post(a.accessToken).expect(201);
      const again = await post(a.accessToken).expect(201);
      expect(again.body[c.field].id).not.toBe(unkeyed.body[c.field].id);
    });
    it(`${c.operation}: 20 concurrent cross-patient attempts commit one identity and one success audit`, async () => {
      const key = randomUUID();
      const rowsBefore = (await db.query(`SELECT count(*)::int AS n FROM ${c.table}`)).rows[0].n;
      const auditsBefore = (await db.query('SELECT count(*)::int AS n FROM audit_log WHERE action=$1', [c.operation])).rows[0].n;
      const responses = await http.all(Array.from({ length: 20 }, (_, i) => {
        const patient = i % 2 ? 'SYN-IDEM' : 'SYN-OTHER';
        return post(a.accessToken, key, { ...c.body, patientId: patient }, c.path.replace('SYN-IDEM', patient));
      }));
      const successes = responses.filter(r => r.status === 201);
      const conflicts = responses.filter(r => r.status === 409);
      expect(successes).toHaveLength(10);
      expect(conflicts).toHaveLength(10);
      expect(successes.filter(r => r.headers['idempotency-replayed'] === 'false')).toHaveLength(1);
      expect(new Set(successes.map(r => r.body[c.field].id)).size).toBe(1);
      expect(new Set(successes.map(r => r.body[c.field].patient_id)).size).toBe(1);
      for (const conflict of conflicts) expect(conflict.body).toEqual({ error: 'Idempotency key already used for different request fields' });
      expect((await db.query(`SELECT count(*)::int AS n FROM ${c.table}`)).rows[0].n).toBe(rowsBefore + 1);
      expect((await db.query('SELECT count(*)::int AS n FROM audit_log WHERE action=$1', [c.operation])).rows[0].n).toBe(auditsBefore + 1);
      const ledger = (await db.query('SELECT * FROM clinical_write_keys WHERE request_key=$1', [key])).rows;
      expect(ledger).toHaveLength(1);
      expect(ledger[0].resource_id).toBe(successes[0].body[c.field].id);
      expect(ledger[0].patient_id).toBe(successes[0].body[c.field].patient_id);
    });
    it(`${c.operation}: PostgreSQL itself rejects cross-patient duplicate keys under the v3 constraint`, async () => {
      const key = randomUUID();
      await post(a.accessToken, key).expect(201);
      const before = (await db.query('SELECT * FROM clinical_write_keys WHERE request_key=$1', [key])).rows;
      const values = [a.user.id, c.operation, key, before[0].request_digest, before[0].resource_id];
      const insert = `INSERT INTO clinical_write_keys(actor_id, operation, patient_id, request_key, request_digest, resource_id)
        VALUES ($1, $2, 'SYN-OTHER', $3, $4, $5)`;
      await expect(db.query(insert, values)).rejects.toMatchObject({ code: '23505', constraint: 'clinical_write_keys_actor_operation_request_key' });
      // Explicit conflict-target inference must work, not just a generic catch.
      expect((await db.query(`${insert} ON CONFLICT (actor_id, operation, request_key) DO NOTHING RETURNING *`, values)).rows).toEqual([]);
      expect((await db.query('SELECT * FROM clinical_write_keys WHERE request_key=$1', [key])).rows).toEqual(before);
    });
    it(`${c.operation}: replay cannot replace a resource whose patient linkage changed`, async () => {
      const key = randomUUID();
      const first = await post(a.accessToken, key).expect(201);
      await db.query(`UPDATE ${c.table} SET patient_id='SYN-OTHER' WHERE id=$1`, [first.body[c.field].id]);
      const rowsBefore = (await db.query(`SELECT * FROM ${c.table} ORDER BY id`)).rows;
      const auditsBefore = (await db.query('SELECT * FROM audit_log WHERE action=$1 ORDER BY id', [c.operation])).rows;
      const keysBefore = (await db.query('SELECT * FROM clinical_write_keys WHERE request_key=$1', [key])).rows;
      const conflict = await post(a.accessToken, key).expect(409);
      expect(conflict.body).toEqual({ error: 'Original resource is unavailable; reconcile before creating a new submission' });
      expect((await db.query(`SELECT * FROM ${c.table} ORDER BY id`)).rows).toEqual(rowsBefore);
      expect((await db.query('SELECT * FROM audit_log WHERE action=$1 ORDER BY id', [c.operation])).rows).toEqual(auditsBefore);
      expect((await db.query('SELECT * FROM clinical_write_keys WHERE request_key=$1', [key])).rows).toEqual(keysBefore);
    });
    it(`${c.operation}: rejects malformed/oversized keys and invalid bodies before a ledger claim`, async () => {
      for (const key of ['not-a-key', 'x'.repeat(512), '00000000-0000-0000-0000-000000000000', `${randomUUID()}, ${randomUUID()}`]) {
        await post(a.accessToken, key).expect(400);
      }
      const key = randomUUID();
      await post(a.accessToken, key, { ...c.body, patientId: {}, heartRate: -1 }).expect(400);
      expect((await db.query('SELECT * FROM clinical_write_keys WHERE request_key=$1', [key])).rowCount).toBe(0);
    });
    it(`${c.operation}: audit failure rolls back business row and ledger, then the same key can succeed`, async () => {
      const key = randomUUID();
      const path = c.path.replace('SYN-IDEM', 'SYN-ROLLBACK');
      const body = { ...c.body, patientId: 'SYN-ROLLBACK' };
      await db.query(`CREATE OR REPLACE FUNCTION reject_idem_audit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.patient_id = 'SYN-ROLLBACK' AND NEW.action = '${c.operation}' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER idem_audit_failure BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION reject_idem_audit();`);
      try {
        await post(a.accessToken, key, body, path).expect(500);
        expect((await db.query('SELECT * FROM clinical_write_keys WHERE request_key=$1', [key])).rowCount).toBe(0);
        expect((await db.query(`SELECT * FROM ${c.table} WHERE patient_id='SYN-ROLLBACK'`)).rowCount).toBe(0);
      } finally { await db.query('DROP TRIGGER idem_audit_failure ON audit_log'); }
      await post(a.accessToken, key, body, path).expect(201);
    });
  }

  it('conflicting concurrent payloads never commit a second mutation', async () => {
    const key = randomUUID();
    const before = (await db.query(`SELECT (SELECT count(*)::int FROM visit_history) AS visits,
      (SELECT count(*)::int FROM audit_log WHERE action='CREATE_VISIT') AS audits,
      (SELECT count(*)::int FROM clinical_write_keys) AS keys`)).rows[0];
    const results = await http.all(Array.from({ length: 20 }, (_, i) => http.post('/api/visits/create').set(auth(a.accessToken))
      .set('Idempotency-Key', key).send({ patientId: 'SYN-IDEM', diagnosis: i % 2 ? 'one' : 'two' })));
    const successes = results.filter(r => r.status === 201);
    expect(results).toHaveLength(20);
    expect(successes).toHaveLength(10);
    const winner = successes[0].body.visit.diagnosis;
    expect(['one', 'two']).toContain(winner);
    // Arrival order may choose either payload, but ALL ten matching indices
    // must succeed and ALL ten changed indices must conflict, without retries.
    expect(results.map(r => r.status)).toEqual(Array.from({ length: 20 }, (_, i) => (i % 2 ? 'one' : 'two') === winner ? 201 : 409));
    for (const conflict of results.filter(r => r.status === 409)) {
      expect(conflict.body).toEqual({ error: 'Idempotency key already used for different request fields' });
    }
    expect(successes.filter(r => r.headers['idempotency-replayed'] === 'false')).toHaveLength(1);
    expect(successes.filter(r => r.headers['idempotency-replayed'] === 'true')).toHaveLength(9);
    expect(new Set(successes.map(r => r.body.visit.id)).size).toBe(1);
    expect(new Set(successes.map(r => r.body.visit.diagnosis))).toEqual(new Set([winner]));
    const id = successes[0].body.visit.id;
    const ledger = (await db.query('SELECT * FROM clinical_write_keys WHERE actor_id=$1 AND operation=$2 AND request_key=$3',
      [a.user.id, 'CREATE_VISIT', key])).rows;
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ patient_id: 'SYN-IDEM', resource_id: id,
      request_digest: createHash('sha256').update(JSON.stringify(['SYN-IDEM', a.user.id, null, null, winner, null, null, null])).digest('hex') });
    expect((await db.query('SELECT id, diagnosis FROM visit_history WHERE id=$1', [id])).rows).toEqual([{ id, diagnosis: winner }]);
    expect((await db.query("SELECT count(*)::int AS n FROM audit_log WHERE action='CREATE_VISIT' AND details::jsonb->>'resourceId'=$1", [String(id)])).rows[0].n).toBe(1);
    expect((await db.query(`SELECT (SELECT count(*)::int FROM visit_history) AS visits,
      (SELECT count(*)::int FROM audit_log WHERE action='CREATE_VISIT') AS audits,
      (SELECT count(*)::int FROM clinical_write_keys) AS keys`)).rows[0])
      .toEqual({ visits: before.visits + 1, audits: before.audits + 1, keys: before.keys + 1 });
  });
  it('a rolled-back claim releases concurrent waiters and rolls back its resource and success audit', async () => {
    const key = randomUUID();
    await db.query(`INSERT INTO patients(patient_id) VALUES ('SYN-CLAIM-ROLLBACK');
      CREATE SEQUENCE idem_failure_sequence;
      CREATE FUNCTION reject_first_idem_completion() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.patient_id = 'SYN-CLAIM-ROLLBACK' AND nextval('idem_failure_sequence') = 1 THEN
          RAISE EXCEPTION 'synthetic metadata failure after business and audit'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER idem_completion_failure BEFORE UPDATE ON clinical_write_keys FOR EACH ROW EXECUTE FUNCTION reject_first_idem_completion();`);
    try {
      const results = await http.all(Array.from({ length: 20 }, () => http.post('/api/visits/create').set(auth(a.accessToken))
        .set('Idempotency-Key', key).send({ patientId: 'SYN-CLAIM-ROLLBACK', diagnosis: 'SYNTHETIC_ROLLBACK' })));
      expect(results.filter(r => r.status === 500)).toHaveLength(1);
      expect(results.filter(r => r.status === 201)).toHaveLength(19);
      expect(new Set(results.filter(r => r.status === 201).map(r => r.body.visit.id)).size).toBe(1);
      expect((await db.query("SELECT count(*)::int AS n FROM visit_history WHERE patient_id='SYN-CLAIM-ROLLBACK'")).rows[0].n).toBe(1);
      expect((await db.query("SELECT count(*)::int AS n FROM audit_log WHERE patient_id='SYN-CLAIM-ROLLBACK' AND action='CREATE_VISIT'")).rows[0].n).toBe(1);
      expect((await db.query('SELECT count(*)::int AS n FROM clinical_write_keys WHERE request_key=$1 AND resource_id IS NOT NULL', [key])).rows[0].n).toBe(1);
    } finally { await db.query('DROP TRIGGER idem_completion_failure ON clinical_write_keys'); }
  });
  it('canonicalizes validated field order, absent/null numeric values, calendar dates and legacy wall timestamps', async () => {
    const key = randomUUID();
    const base = cases[0].body;
    const first = await http.post(cases[0].path).set(auth(a.accessToken)).set('Idempotency-Key', key).send(base).expect(201);
    const again = await http.post(cases[0].path).set(auth(a.accessToken)).set('Idempotency-Key', key.toUpperCase())
      .send({ reason: base.reason, appointmentDate: '2031-11-02T01:30:00.000000-04:00', patientId: ' SYN-IDEM ', ignoredField: 'not persisted' }).expect(201);
    expect(again.body.appointment.id).toBe(first.body.appointment.id);
    const stored = await db.query("SELECT to_char(appointment_date, 'YYYY-MM-DD HH24:MI:SS') AS wall FROM appointments WHERE id=$1", [first.body.appointment.id]);
    expect(stored.rows[0].wall).toBe('2031-11-02 01:30:00');
    const vitalKey = randomUUID();
    const vital = await http.post(cases[2].path).set(auth(a.accessToken)).set('Idempotency-Key', vitalKey).send({ heartRate: 73 }).expect(201);
    const replay = await http.post(cases[2].path).set(auth(a.accessToken)).set('Idempotency-Key', vitalKey).send({ temperature: null, heartRate: 73 }).expect(201);
    expect(replay.body.vitalSigns.id).toBe(vital.body.vitalSigns.id);
    expect((await db.query("SELECT DISTINCT next_visit_date::text AS day FROM visit_history WHERE next_visit_date IS NOT NULL")).rows).toEqual([{ day: '2031-11-02' }]);
  });
  it('isolates operation scopes and replays the current authorized resource, not a stored clinical snapshot', async () => {
    const key = randomUUID();
    const results = [];
    for (const c of cases) results.push(await http.post(c.path).set(auth(a.accessToken)).set('Idempotency-Key', key).send(c.body).expect(201));
    const id = results[0].body.appointment.id;
    await http.put(`/api/appointments/${id}/status`).set(auth(a.accessToken)).send({ status: 'completed' }).expect(200);
    const replay = await http.post(cases[0].path).set(auth(a.accessToken)).set('Idempotency-Key', key).send(cases[0].body).expect(201);
    expect(replay.body.appointment.id).toBe(id);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(replay.body.appointment.status).toBe('completed');
    expect(results[0].body.appointment.status).toBe('scheduled');
    expect((await db.query('SELECT operation FROM clinical_write_keys WHERE actor_id=$1 AND request_key=$2 ORDER BY operation', [a.user.id, key])).rows)
      .toEqual([{ operation: 'CREATE_APPOINTMENT' }, { operation: 'CREATE_VISIT' }, { operation: 'RECORD_VITALS' }]);
    await db.query('UPDATE appointments SET doctor_id=$1 WHERE id=$2', [b.user.id, id]);
    await http.post(cases[0].path).set(auth(a.accessToken)).set('Idempotency-Key', key).send(cases[0].body).expect(409);
  });
  it('ledger contains only protected reference metadata and digests, never clinical bodies or response snapshots', async () => {
    const rows = (await db.query('SELECT * FROM clinical_write_keys')).rows;
    expect(rows.length).toBeGreaterThan(0);
    expect(Object.keys(rows[0]).sort()).toEqual(['actor_id', 'operation', 'patient_id', 'request_key', 'request_digest', 'resource_id', 'created_at'].sort());
    for (const row of rows) { expect(row.resource_id).toBeGreaterThan(0); expect(row.request_digest).toMatch(/^[a-f0-9]{64}$/); }
    const ledger = JSON.stringify(rows);
    for (const sensitive of ['SYNTHETIC_REASON', 'SYNTHETIC_DIAGNOSIS', 'SYNTHETIC_VITAL_NOTE', a.accessToken, a.refreshToken, '2031-11-02']) expect(ledger).not.toContain(sensitive);
  });
  it('requires a currently valid session and active user for replays', async () => {
    const c = cases[1]; const key = randomUUID();
    const post = () => http.post(c.path).set(auth(a.accessToken)).set('Idempotency-Key', key).send(c.body);
    await post().expect(201);
    await db.query('UPDATE users SET is_active=false WHERE id=$1', [a.user.id]);
    await post().expect(401);
    await db.query('UPDATE users SET is_active=true WHERE id=$1', [a.user.id]);
    await http.post('/api/auth/logout').set(auth(a.accessToken)).send({ refreshToken: a.refreshToken }).expect(204);
    await post().expect(401);
  });
});
