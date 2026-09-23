import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { checkSchemaReady, EXPECTED_SCHEMA_VERSIONS, readSchemaState, withReadOnlyDatabase } from '../src/db/schemaState';
import { runPreflight } from '../src/db/preflight';
import { parseDatabaseCommand } from '../src/db/cli';
import { assertSupportedPostgres } from './helpers/supportedPg';
import { auditDatabaseUrl } from './helpers/auditDatabase';

let approvedUrl: string;
const backend = resolve(__dirname, '..');
const tag = randomUUID().replaceAll('-', '');
const schema = `ops_${tag}`;
const migrationRole = `ops_m_${tag}`;
const runtimeRole = `ops_r_${tag}`;
const loginRole = `ops_l_${tag}`;

// Frozen historical v1/v2 DDL; these fixtures never apply/downgrade v3. Keep
// the original patient-scoped v2 PK so legacy collisions are genuine.
const historicalVersions = `
  CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
  ALTER TABLE sessions ADD COLUMN session_key UUID NOT NULL DEFAULT gen_random_uuid();
  CREATE UNIQUE INDEX idx_sessions_key ON sessions(session_key);
  ALTER TABLE clinical_notes ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
  CREATE INDEX idx_notes_patient_date ON clinical_notes(patient_id, note_date DESC);
  CREATE INDEX idx_vitals_patient_date ON vital_signs(patient_id, recorded_date DESC);
  CREATE INDEX idx_visits_patient_date ON visit_history(patient_id, visit_date DESC);
  CREATE INDEX idx_visits_doctor_date ON visit_history(doctor_id, visit_date);
  CREATE INDEX idx_appointments_doctor_date ON appointments(doctor_id, appointment_date) WHERE status='scheduled';
  CREATE INDEX idx_patients_created ON patients(created_at DESC, id DESC);
  ALTER TABLE data_retention ALTER COLUMN auto_delete SET DEFAULT false;
  INSERT INTO schema_migrations(version) VALUES (1);
  CREATE TABLE clinical_write_keys (
    actor_id INTEGER NOT NULL REFERENCES users(id),
    operation VARCHAR(32) NOT NULL CHECK(operation IN ('CREATE_APPOINTMENT', 'CREATE_VISIT', 'RECORD_VITALS')),
    patient_id VARCHAR(50) NOT NULL REFERENCES patients(patient_id),
    request_key UUID NOT NULL,
    request_digest CHAR(64) NOT NULL CHECK(request_digest ~ '^[0-9a-f]{64}$'),
    resource_id INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(actor_id, operation, patient_id, request_key)
  );
  INSERT INTO schema_migrations(version) VALUES (2);`;

describe('E1/E2/E3 explicit database operations (isolated synthetic PostgreSQL)', () => {
  let admin: Pool; let db: Pool; let runtime: Pool;
  let url: string;
  let initialize: () => Promise<void>; let migrate: () => Promise<void>;
  let originalDatabaseUrl: string | undefined;
  const extraPools: Pool[] = [];
  const template = (name: string) => readFileSync(resolve(backend, 'scripts/migration-role', name), 'utf8')
    .replaceAll(':"app_schema"', `"${schema}"`).replaceAll(':"migration_role"', `"${migrationRole}"`).replaceAll(':"runtime_role"', `"${runtimeRole}"`);
  const cli = (args: string[], databaseUrl = url, env: Record<string, string> = {}) => spawnSync(process.execPath,
    ['-r', 'ts-node/register', 'src/db/cli.ts', ...args], { cwd: backend, encoding: 'utf8', timeout: 30000,
      // Do not inherit a real DATABASE_URL, PG*, NODE_OPTIONS or dotenv path.
        env: { PATH: process.env.PATH, NODE_ENV: 'production', DATABASE_URL: databaseUrl, DB_POOL_MAX: '1', RELEASE_MIGRATION_APPROVED: 'true', ...env } });
      const snapshot = async (database = db) => (await database.query(`SELECT table_name,
    md5(coalesce(string_agg(row_text, E'\n' ORDER BY row_text), '')) AS digest FROM (
      SELECT 'users' AS table_name, to_jsonb(t)::text AS row_text FROM users t UNION ALL
      SELECT 'patients', to_jsonb(t)::text FROM patients t UNION ALL
      SELECT 'clinical_notes', to_jsonb(t)::text FROM clinical_notes t UNION ALL
      SELECT 'appointments', to_jsonb(t)::text FROM appointments t UNION ALL
      SELECT 'visit_history', to_jsonb(t)::text FROM visit_history t UNION ALL
      SELECT 'vital_signs', to_jsonb(t)::text FROM vital_signs t UNION ALL
      SELECT 'data_retention', to_jsonb(t)::text FROM data_retention t UNION ALL
      SELECT 'clinical_write_keys', to_jsonb(t)::text FROM clinical_write_keys t UNION ALL
      SELECT 'audit_log', to_jsonb(t)::text FROM audit_log t UNION ALL
      SELECT 'schema_migrations', to_jsonb(t)::text FROM schema_migrations t
    ) rows GROUP BY table_name ORDER BY table_name`)).rows;
  const freshFixture = async (suffix: string, version2 = false) => {
    const name = `ops_${suffix}_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE SCHEMA ${name}`);
    const target = new URL(approvedUrl);
    target.searchParams.set('options', `-c search_path=${name}`);
    const pool = new Pool({ connectionString: target.toString() }); extraPools.push(pool);
    if (version2) {
      const result = spawnSync(process.execPath, ['-r', 'ts-node/register', '-e', `
        const pool = require('./src/db').default;
        require('./src/db/schema').initializeDatabase().then(() => pool.end())
          .catch(async () => { await pool.end(); process.exitCode=1; });
      `], { cwd: backend, encoding: 'utf8', timeout: 30000,
        env: { PATH: process.env.PATH, NODE_ENV: 'test', DATABASE_URL: target.toString() } });
      expect(result.status).toBe(0); expect(result.stderr).toBe('');
      await pool.query(historicalVersions);
    } else {
      const result = cli(['migrate', '--approved-production', '--confirm-migration'], target.toString());
      expect(result.status).toBe(0); expect(result.stderr).toBe('');
    }
    return { pool, url: target.toString(), name };
  };
  const populateLedger = async (pool: Pool, collisions: boolean) => {
    await pool.query(`INSERT INTO users(email, password_hash) VALUES ('v3-ops@example.invalid', 'synthetic-no-login');
      INSERT INTO patients(patient_id, first_name) VALUES ('SYN-V3-A', 'SYNTHETIC-V3-PRIVATE'), ('SYN-V3-B', NULL), ('SYN-V3-C', NULL)`);
    const keys = [randomUUID(), randomUUID(), randomUUID()];
    const claims = collisions ? [[0, 'A'], [0, 'B'], [0, 'C'], [1, 'A'], [1, 'B'], [2, 'A']] as const
      : [[0, 'A'], [1, 'B'], [2, 'C']] as const;
    for (const [key, patient] of claims) {
      const id = (await pool.query(`INSERT INTO visit_history(patient_id, doctor_id, visit_date, diagnosis)
        VALUES ($1, 1, '2001-10-28 01:30:00.123456', 'SYNTHETIC-V3-DIAGNOSIS') RETURNING id`, [`SYN-V3-${patient}`])).rows[0].id;
      await pool.query(`INSERT INTO clinical_write_keys(actor_id, operation, patient_id, request_key, request_digest, resource_id)
        VALUES (1, 'CREATE_VISIT', $1, $2, $3, $4)`, [`SYN-V3-${patient}`, keys[key], 'a'.repeat(64), id]);
      await pool.query(`INSERT INTO audit_log(user_id, patient_id, action) VALUES (1, $1, 'SYNTHETIC_V3_CREATE_VISIT')`, [`SYN-V3-${patient}`]);
    }
    return keys;
  };

  beforeAll(async () => {
    // Mandatory exact guard BEFORE constructing any pool or importing db/config.
    approvedUrl = auditDatabaseUrl();
    admin = new Pool({ connectionString: approvedUrl, connectionTimeoutMillis: 5000 });
    await assertSupportedPostgres(admin);
    // Only NEW uniquely named roles/schema in this isolated database. Never alter
    // existing roles, global PUBLIC grants, or another agent's schema.
    await admin.query(template('01-provision.sql.template'));
    console.log(`DATABASE_OPERATIONS_SCHEMA=${schema}`);
    const target = new URL(approvedUrl);
    target.searchParams.set('options', `-c search_path=${schema} -c role=${migrationRole}`);
    url = target.toString();
    originalDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = url;
    db = (await import('../src/db')).default;
    initialize = (await import('../src/db/schema')).initializeDatabase;
    migrate = (await import('../src/db/migrations')).migrateDatabase;
    await initialize();
    // Legacy populated baseline, before v1/v2/v3. Wall times are NOT assumed UTC.
    await db.query(`
      INSERT INTO users(email, password_hash) VALUES ('ops-synthetic@example.invalid', 'synthetic-no-login');
      INSERT INTO patients(patient_id, first_name, created_by) VALUES ('SYN-OPS-PRIVATE', 'SYNTHETIC-PATIENT-TEXT', 1);
      INSERT INTO appointments(patient_id, doctor_id, appointment_date, reason) VALUES
        ('SYN-OPS-PRIVATE', 1, '2001-10-28 01:30:00.123456', 'SYNTHETIC-REASON');
      INSERT INTO clinical_notes(patient_id, doctor_id, note_date, note_text, medical_codes) VALUES
        ('SYN-OPS-PRIVATE', 1, '2001-10-28', 'SYNTHETIC-NOTE-TEXT', '["A1"]');
      INSERT INTO data_retention(patient_id, auto_delete) VALUES ('SYN-OPS-PRIVATE', true);
      INSERT INTO audit_log(user_id, patient_id, action) VALUES (1, 'SYN-OPS-PRIVATE', 'SYNTHETIC_BASELINE');
    `);
  });
  afterAll(async () => {
    await Promise.all([db?.end(), runtime?.end(), admin?.end(), ...extraPools.map(pool => pool.end())]);
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    // Retain synthetic rows/schemas/unique roles as evidence; no test cleanup DDL.
  });

  it('fails readiness before migration; baseline preflight reads without changing historical data', async () => {
    await expect(checkSchemaReady(db)).rejects.toThrow('database_schema_not_ready');
    const report = await runPreflight(db);
    expect(report.outcome).toBe('review');
    expect(report.checks).toContainEqual({ invariant: 'schema.missing_versions', count: '3', severity: 'review' });
    expect((await db.query("SELECT to_char(appointment_date, 'YYYY-MM-DD HH24:MI:SS.US') AS wall FROM appointments")).rows[0].wall).toBe('2001-10-28 01:30:00.123456');
    expect((await db.query('SELECT auto_delete FROM data_retention')).rows[0].auto_delete).toBe(true);
  });

  it('migrates a populated baseline once, preserves data on concurrent reruns, and validates readiness', async () => {
    await migrate();
    await db.query(`INSERT INTO clinical_write_keys(actor_id, operation, patient_id, request_key, request_digest, resource_id)
      VALUES (1, 'CREATE_APPOINTMENT', 'SYN-OPS-PRIVATE', $1, $2, 1)`, [randomUUID(), 'a'.repeat(64)]);
    const before = await snapshot();
    await Promise.all([migrate(), migrate()]);
    await initialize(); await migrate();
    expect(await snapshot()).toEqual(before);
    expect(EXPECTED_SCHEMA_VERSIONS).toEqual([1, 2, 3]);
    expect((await db.query('SELECT version FROM schema_migrations ORDER BY version')).rows.map(row => row.version)).toEqual([...EXPECTED_SCHEMA_VERSIONS]);
    await expect(checkSchemaReady(db)).resolves.toBeUndefined();
    expect((await db.query("SELECT to_char(appointment_date, 'YYYY-MM-DD HH24:MI:SS.US') AS wall FROM appointments")).rows[0].wall).toBe('2001-10-28 01:30:00.123456');
    expect((await db.query('SELECT auto_delete FROM data_retention')).rows[0].auto_delete).toBe(true);
  });

  it('guards explicit CLI environments before any connection (including NODE_ENV=test)', () => {
    const env = { DATABASE_URL: approvedUrl, NODE_ENV: 'production', RELEASE_MIGRATION_APPROVED: 'true' };
    expect(() => parseDatabaseCommand(['check'], env)).toThrow('production_approval');
    expect(() => parseDatabaseCommand(['migrate', '--approved-production'], env)).toThrow('migration_confirmation');
    expect(() => parseDatabaseCommand(['check'], {})).toThrow('explicit_operator_environment');
    expect(() => parseDatabaseCommand(['check', '--approved-production'], { ...env, NODE_ENV: 'test' })).toThrow('explicit_operator_environment');
    expect(() => parseDatabaseCommand(['check', '--unknown'], env)).toThrow('usage');
    expect(() => parseDatabaseCommand(['check'], { DATABASE_URL: 'SECRET-NOT-A-URL' })).toThrow('invalid_url');
    expect(parseDatabaseCommand(['migrate', '--approved-production', '--confirm-migration'], env)).toBe('migrate');
  });

  it('importing the CLI/readiness/preflight modules is inert even with an unapproved environment', () => {
    const result = spawnSync(process.execPath, ['-r', 'ts-node/register', '-e', `
      const pg = require('pg');
      pg.Pool.prototype.connect = () => { throw new Error('unexpected pool connection'); };
      pg.Client.prototype.connect = () => { throw new Error('unexpected client connection'); };
      require('./src/db/cli'); require('./src/db/schemaState'); require('./src/db/preflight');
    `], { cwd: backend, encoding: 'utf8', timeout: 30000,
      env: { PATH: process.env.PATH, NODE_ENV: 'test', DATABASE_URL: 'unapproved-no-network' } });
    expect(result.status).toBe(0); expect(result.stdout).toBe(''); expect(result.stderr).toBe('');
  });

  it('explicit production CLI check/migrate uses the approved environment and preserves data (pool size 1)', async () => {
    const before = await snapshot();
    for (const args of [['check', '--approved-production'], ['migrate', '--approved-production', '--confirm-migration']]) {
      const result = cli(args);
      expect(result.stderr).toBe(''); expect(result.status).toBe(0);
      expect(result.stdout).not.toContain(approvedUrl);
    }
    expect(await snapshot()).toEqual(before);
    const refused = cli(['migrate']);
    expect(refused.status).toBe(1);
    expect(refused.stderr.trim()).toBe('{"event":"database_command_failed"}');
  });

  it('serializes the whole CLI lifecycle with a non-waiting advisory lock', async () => {
    const lock = await admin.connect();
    try {
      await lock.query('SELECT pg_advisory_lock(73410292)');
      const result = cli(['migrate', '--approved-production', '--confirm-migration']);
      expect(result.status).toBe(1);
      expect(result.stderr.trim()).toBe('{"event":"database_command_failed"}');
    } finally { await lock.query('SELECT pg_advisory_unlock(73410292)'); lock.release(); }
  });

  it('explicitly migrates a fresh synthetic schema and returns clear/review preflight exit codes', async () => {
    const fresh = `ops_fresh_${tag}`;
    await admin.query(`CREATE SCHEMA ${fresh}`);
    const target = new URL(approvedUrl);
    target.searchParams.set('options', `-c search_path=${fresh}`);
    const pool = new Pool({ connectionString: target.toString() }); extraPools.push(pool);
    const migrated = cli(['migrate', '--approved-production', '--confirm-migration'], target.toString());
    expect(migrated.status).toBe(0);
    await expect(checkSchemaReady(pool)).resolves.toBeUndefined();
    const clear = cli(['preflight', '--approved-production'], target.toString());
    expect(clear.status).toBe(0); expect(JSON.parse(clear.stdout).outcome).toBe('clear');
    // Populated baseline has provenance warnings, not a fabricated UTC conversion.
    const review = cli(['preflight', '--approved-production']);
    expect(review.status).toBe(3); expect(JSON.parse(review.stdout).outcome).toBe('review');
  });

  it('rejects missing/unsupported versions, broken objects and wrong search paths without attempting repair', async () => {
    for (const [suffix, ddl] of [
      ['empty', ''],
      ['missing', 'CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY); INSERT INTO schema_migrations VALUES (2);'],
      ['future', 'CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY); INSERT INTO schema_migrations VALUES (1),(2),(3),(999);'],
      ['objects', 'CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY); INSERT INTO schema_migrations VALUES (1),(2),(3);'],
    ]) {
      const other = `ops_${suffix}_${tag}`;
      await admin.query(`CREATE SCHEMA ${other}`);
      const target = new URL(approvedUrl);
      target.searchParams.set('options', `-c search_path=${other},${schema}`);
      const pool = new Pool({ connectionString: target.toString() }); extraPools.push(pool);
      if (ddl) await pool.query(ddl);
      await expect(checkSchemaReady(pool)).rejects.toThrow('database_schema_not_ready');
      if (suffix === 'future' || suffix === 'missing') {
        const result = cli(['migrate', '--approved-production', '--confirm-migration'], target.toString());
        expect(result.status).toBe(1);
        expect((await pool.query('SELECT count(*)::int AS n FROM pg_tables WHERE schemaname=$1', [other])).rows[0].n).toBe(1);
      }
    }
  });

  it('runs readiness/preflight in enforced read-only transactions and redacts driver errors', async () => {
    await withReadOnlyDatabase(async client => {
      expect((await client.query('SHOW transaction_read_only')).rows[0].transaction_read_only).toBe('on');
      await expect(client.query("UPDATE patients SET first_name='not-allowed'")).rejects.toMatchObject({ code: '25006' });
    }, db);
    const failing = { connect: async () => { throw new Error(`${approvedUrl}/SYNTHETIC-PATIENT-TEXT`); } } as unknown as Pool;
    await expect(checkSchemaReady(failing)).rejects.toThrow(/^database_schema_not_ready$/);
    await expect(runPreflight(failing)).rejects.toThrow(/^database_preflight_failed$/);
  });

  it('reports malformed JSON shapes/status/roles/orphans as counts, never repairs records or guesses timestamps', async () => {
    // Dirty legacy fixtures ONLY in our new synthetic schema. Drop individual
    // test-schema FKs to model pre-existing orphans, never disable global checks.
    await db.query(`
      ALTER TABLE clinical_notes DROP CONSTRAINT clinical_notes_patient_id_fkey;
      ALTER TABLE appointments DROP CONSTRAINT appointments_doctor_id_fkey;
      INSERT INTO users(email, password_hash, role) VALUES ('dirty-ops@example.invalid', 'synthetic-no-login', 'unexpected-role');
      INSERT INTO appointments(patient_id, doctor_id, appointment_date, status) VALUES ('SYN-OPS-PRIVATE', 987654, '2001-10-28 01:30', 'unexpected-status');
      INSERT INTO clinical_notes(patient_id, doctor_id, note_date, medical_codes) VALUES
        ('SYN-ORPHAN-PRIVATE', 1, '2001-10-27', '{}'),
        ('SYN-ORPHAN-PRIVATE', 1, '2001-10-28', 'null'),
        ('SYN-ORPHAN-PRIVATE', 1, '2001-10-29', '[1]'),
        ('SYN-ORPHAN-PRIVATE', 1, '2001-10-30', '[""]'),
        ('SYN-ORPHAN-PRIVATE', 1, '2001-10-31', NULL),
        ('SYN-ORPHAN-PRIVATE', 1, '2001-11-01', '"not-an-array"');
    `);
    const before = await snapshot();
    const report = await runPreflight(db);
    const counts = Object.fromEntries(report.checks.map(check => [check.invariant, check.count]));
    expect(report.outcome).toBe('blocked');
    expect(counts['clinical_notes.medical_codes_shape']).toBe('6');
    expect(counts['appointments.status_allowed']).toBe('1');
    expect(counts['users.role_allowed']).toBe('1');
    expect(counts['orphans.clinical_notes.patient_id']).toBe('6');
    expect(counts['orphans.appointments.doctor_id']).toBe('1');
    expect(counts['timestamp_provenance.appointments.appointment_date']).toBe('2');
    expect(counts['orphans.clinical_write_keys.CREATE_APPOINTMENT']).toBe('0');
    const result = cli(['preflight', '--approved-production']);
    expect(result.status).toBe(2); expect(result.stderr).toBe('');
    const output = JSON.stringify(report) + result.stdout;
    for (const sensitive of ['SYN-OPS-PRIVATE', 'SYN-ORPHAN-PRIVATE', 'SYNTHETIC-PATIENT-TEXT', 'SYNTHETIC-NOTE-TEXT', 'SYNTHETIC-REASON', 'unexpected-role', 'unexpected-status', '987654', approvedUrl]) expect(output).not.toContain(sensitive);
    expect(report.checks.every(check => /^\d+$/.test(check.count))).toBe(true);
    expect(await snapshot()).toEqual(before);
  });

  it('separate runtime DML role can read/write/audit and check readiness without owning schema objects', async () => {
    await admin.query(template('02-runtime-grants.sql.template'));
    // Authenticate a genuinely separate non-owner principal: SET ROLE on an
    // admin connection alone is insufficient (session_user could regain DDL).
    const password = randomBytes(32).toString('hex');
    await admin.query(`CREATE ROLE ${loginRole} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${password}';
      GRANT ${runtimeRole} TO ${loginRole}`);
    const target = new URL(approvedUrl);
    target.username = loginRole; target.password = password;
    target.searchParams.set('options', `-c search_path=${schema} -c role=${runtimeRole}`);
    runtime = new Pool({ connectionString: target.toString() });
    expect((await runtime.query('SELECT current_user')).rows[0].current_user).toBe(runtimeRole);
    await expect(checkSchemaReady(runtime)).resolves.toBeUndefined();
    const client = await runtime.connect();
    try {
      await client.query('BEGIN');
      await client.query("INSERT INTO patients(patient_id, created_by) VALUES ('SYN-RUNTIME', 1)");
      await client.query("UPDATE patients SET first_name='SYNTHETIC-RUNTIME' WHERE patient_id='SYN-RUNTIME'");
      await client.query("INSERT INTO clinical_notes(patient_id, doctor_id, note_date, note_text) VALUES ('SYN-RUNTIME', 1, '2030-01-01', 'SYNTHETIC-RUNTIME')");
      await client.query("INSERT INTO audit_log(user_id, patient_id, action) VALUES (1, 'SYN-RUNTIME', 'SYNTHETIC_RUNTIME_WRITE')");
      // v3 requires no new grant, but real keyed creation still needs ledger
      // claim/completion and the unique index must reject another patient.
      const key = randomUUID();
      const visit = await client.query("INSERT INTO visit_history(patient_id, doctor_id, visit_date) VALUES ('SYN-RUNTIME', 1, NOW()) RETURNING id");
      await client.query(`INSERT INTO clinical_write_keys(actor_id, operation, patient_id, request_key, request_digest)
        VALUES (1, 'CREATE_VISIT', 'SYN-RUNTIME', $1, $2)`, [key, 'b'.repeat(64)]);
      await client.query(`UPDATE clinical_write_keys SET resource_id=$1 WHERE actor_id=1 AND operation='CREATE_VISIT' AND request_key=$2`, [visit.rows[0].id, key]);
      await client.query('SAVEPOINT duplicate_key');
      await expect(client.query(`INSERT INTO clinical_write_keys(actor_id, operation, patient_id, request_key, request_digest)
        VALUES (1, 'CREATE_VISIT', 'SYN-OPS-PRIVATE', $1, $2)`, [key, 'c'.repeat(64)]))
        .rejects.toMatchObject({ code: '23505', constraint: 'clinical_write_keys_actor_operation_request_key' });
      await client.query('ROLLBACK TO SAVEPOINT duplicate_key');
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK'); throw error;
    } finally { client.release(); }
    expect((await runtime.query("SELECT count(*)::int AS n FROM audit_log WHERE patient_id='SYN-RUNTIME'")).rows[0].n).toBe(1);
    expect((await runPreflight(runtime)).outcome).toBe('blocked'); // Legacy dirty fixtures remain untouched.
    expect((await runtime.query('SELECT pg_has_role(current_user, $1, $2) AS member', [migrationRole, 'MEMBER'])).rows[0].member).toBe(false);
  });

  it('runtime role cannot persist DDL, change migration history, or update/delete/truncate audit records', async () => {
    const before = await snapshot();
    for (const sql of [
      'CREATE TABLE runtime_forbidden(id int)', `CREATE SCHEMA runtime_forbidden_${tag}`,
      'ALTER TABLE patients ADD COLUMN forbidden int', 'DROP TABLE clinical_notes',
      'CREATE INDEX runtime_forbidden ON patients(first_name)',
      "UPDATE audit_log SET action='forbidden'", 'DELETE FROM audit_log', 'TRUNCATE audit_log',
      'ALTER TABLE audit_log DISABLE TRIGGER ALL',
      'INSERT INTO schema_migrations(version) VALUES (999)', 'DELETE FROM schema_migrations',
      'UPDATE schema_migrations SET version=99 WHERE version=3',
      'DELETE FROM clinical_write_keys', 'TRUNCATE clinical_write_keys',
      'ALTER TABLE clinical_write_keys DROP CONSTRAINT clinical_write_keys_actor_operation_request_key',
      "SELECT setval('audit_log_id_seq', 1)", `SET ROLE ${migrationRole}`,
    ]) await expect(runtime.query(sql)).rejects.toMatchObject({ code: '42501' });
    // PostgreSQL may WARN, not ERROR, on an unauthorized GRANT. Prove no ACL
    // changes rather than mistaking a successful command tag for a privilege.
    const acl = () => db.query("SELECT relacl::text AS acl FROM pg_class WHERE oid='audit_log'::regclass");
    const beforeAcl = (await acl()).rows;
    await runtime.query('GRANT UPDATE ON audit_log TO PUBLIC');
    expect((await acl()).rows).toEqual(beforeAcl);
    await expect(runtime.query("UPDATE audit_log SET action='still-forbidden'")).rejects.toMatchObject({ code: '42501' });
    expect(await snapshot()).toEqual(before);
  });

  it('requires exact release environment approval for production migration before connection, not for read-only commands', async () => {
    const env = { NODE_ENV: 'production', DATABASE_URL: approvedUrl };
    const args = ['migrate', '--approved-production', '--confirm-migration'];
    for (const approval of [undefined, '', 'false', '1', 'TRUE', 'yes']) {
      expect(() => parseDatabaseCommand(args, { ...env, RELEASE_MIGRATION_APPROVED: approval })).toThrow('release_migration_approval');
    }
    expect(parseDatabaseCommand(['check', '--approved-production'], env)).toBe('check');
    expect(parseDatabaseCommand(['preflight', '--approved-production'], env)).toBe('preflight');
    expect(parseDatabaseCommand(args, { ...env, RELEASE_MIGRATION_APPROVED: 'true' })).toBe('migrate');
    const before = await snapshot();
    const result = cli(args, url, { RELEASE_MIGRATION_APPROVED: '' });
    expect(result.status).toBe(1); expect(result.stdout).toBe('');
    expect(result.stderr.trim()).toBe('{"event":"database_command_failed"}');
    expect(await snapshot()).toEqual(before);
  });

  it('upgrades populated noncolliding v2 to v3 without changing historical rows or migration timestamps', async () => {
    const fixture = await freshFixture('v2clean', true);
    await populateLedger(fixture.pool, false);
    await expect(checkSchemaReady(fixture.pool)).rejects.toThrow('database_schema_not_ready');
    const before = await snapshot(fixture.pool);
    const history = (await fixture.pool.query('SELECT * FROM schema_migrations ORDER BY version')).rows;
    const preflight = await runPreflight(fixture.pool);
    expect(preflight.checks).toContainEqual({ invariant: 'schema.missing_versions', count: '1', severity: 'review' });
    expect(preflight.checks).toContainEqual({ invariant: 'schema.missing_required_unique_indexes', count: '1', severity: 'review' });
    expect(preflight.checks).toContainEqual({ invariant: 'clinical_write_keys.scope_collision_groups', count: '0', severity: 'blocker' });
    const result = cli(['migrate', '--approved-production', '--confirm-migration'], fixture.url);
    expect(result.status).toBe(0); expect(result.stderr).toBe('');
    await expect(checkSchemaReady(fixture.pool)).resolves.toBeUndefined();
    const afterHistory = (await fixture.pool.query('SELECT * FROM schema_migrations ORDER BY version')).rows;
    expect(afterHistory.map(row => row.version)).toEqual([1, 2, 3]);
    expect(afterHistory.slice(0, 2)).toEqual(history);
    expect((await snapshot(fixture.pool)).filter(row => row.table_name !== 'schema_migrations'))
      .toEqual(before.filter(row => row.table_name !== 'schema_migrations'));
    const upgraded = await snapshot(fixture.pool);
    expect(cli(['migrate', '--approved-production', '--confirm-migration'], fixture.url).status).toBe(0);
    expect(await snapshot(fixture.pool)).toEqual(upgraded);
  });

  it('reports v2 collision groups/rows actionably through the CLI and read-only preflight without deleting or leaking records', async () => {
    const fixture = await freshFixture('v2collision', true);
    const keys = await populateLedger(fixture.pool, true);
    const before = await snapshot(fixture.pool);
    const preflight = cli(['preflight', '--approved-production'], fixture.url);
    expect(preflight.status).toBe(2); expect(preflight.stderr).toBe('');
    const report = JSON.parse(preflight.stdout);
    expect(report.checks).toContainEqual({ invariant: 'clinical_write_keys.scope_collision_groups', count: '2', severity: 'blocker' });
    expect(report.checks).toContainEqual({ invariant: 'clinical_write_keys.scope_collision_rows', count: '5', severity: 'blocker' });
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = cli(['migrate', '--approved-production', '--confirm-migration'], fixture.url);
      expect(result.status).toBe(1); expect(result.stdout).not.toContain('database_migrate_complete');
      const diagnostic = JSON.parse(result.stderr);
      expect(diagnostic).toEqual({ event: 'database_migration_blocked', migration: 3, reason: 'idempotency_scope_collisions',
        collisionGroups: '2', collisionRows: '5',
        action: 'Pause keyed creation; arrange approved human reconciliation. Do not delete records or automatically rewrite keys. See docs/verification/track-d-idempotency.md.' });
      const output = result.stdout + result.stderr + preflight.stdout;
      for (const sensitive of [...keys, approvedUrl, fixture.url, fixture.name, 'SYN-V3-', 'SYNTHETIC-V3-',
        'v3-ops@example.invalid', 'a'.repeat(64), 'SELECT ', 'GROUP BY', 'ALTER TABLE', 'request_digest']) {
        expect(output).not.toContain(sensitive);
      }
      expect(await snapshot(fixture.pool)).toEqual(before);
      expect((await fixture.pool.query('SELECT version FROM schema_migrations ORDER BY version')).rows.map(row => row.version)).toEqual([1, 2]);
      await expect(checkSchemaReady(fixture.pool)).rejects.toThrow('database_schema_not_ready');
    }
    const state = await withReadOnlyDatabase(readSchemaState, fixture.pool);
    expect(state.missingIndexes).toContain('clinical_write_keys.clinical_write_keys_actor_operation_request_key');
  });

  it.each([
    ['missing', ''],
    ['nonunique', 'CREATE INDEX clinical_write_keys_actor_operation_request_key ON clinical_write_keys(actor_id, operation, request_key)'],
    ['patient_scoped', 'CREATE UNIQUE INDEX clinical_write_keys_actor_operation_request_key ON clinical_write_keys(actor_id, operation, patient_id, request_key)'],
    ['wrong_column', 'CREATE UNIQUE INDEX clinical_write_keys_actor_operation_request_key ON clinical_write_keys(actor_id, operation, patient_id)'],
    ['partial', "CREATE UNIQUE INDEX clinical_write_keys_actor_operation_request_key ON clinical_write_keys(actor_id, operation, request_key) WHERE operation='CREATE_VISIT'"],
    ['expression', 'CREATE UNIQUE INDEX clinical_write_keys_actor_operation_request_key ON clinical_write_keys(actor_id, lower(operation), request_key)'],
    ['deferred', 'ALTER TABLE clinical_write_keys ADD CONSTRAINT clinical_write_keys_actor_operation_request_key UNIQUE(actor_id, operation, request_key) DEFERRABLE INITIALLY DEFERRED'],
  ])('rejects forged v3 readiness when its unique index is %s; never repairs it', async (suffix, ddl) => {
    const fixture = await freshFixture(suffix, true);
    await fixture.pool.query('INSERT INTO schema_migrations(version) VALUES (3)');
    if (ddl) await fixture.pool.query(ddl);
    const before = await snapshot(fixture.pool);
    const state = await withReadOnlyDatabase(readSchemaState, fixture.pool);
    expect(state.versions).toEqual([1, 2, 3]); expect(state.ready).toBe(false);
    expect(state.missingObjects).toEqual([]);
    expect(state.missingIndexes).toEqual(['clinical_write_keys.clinical_write_keys_actor_operation_request_key']);
    await expect(checkSchemaReady(fixture.pool)).rejects.toThrow(/^database_schema_not_ready$/);
    const result = cli(['check', '--approved-production'], fixture.url);
    expect(result.status).toBe(1); expect(result.stdout).toBe('');
    expect(result.stderr.trim()).toBe('{"event":"database_command_failed"}');
    expect(await snapshot(fixture.pool)).toEqual(before);
  });

  it('does not borrow a valid unique index from a later search-path schema', async () => {
    const fixture = await freshFixture('indexscope', true);
    await fixture.pool.query('INSERT INTO schema_migrations(version) VALUES (3)');
    const target = new URL(fixture.url);
    target.searchParams.set('options', `-c search_path=${fixture.name},${schema}`);
    const pool = new Pool({ connectionString: target.toString() }); extraPools.push(pool);
    await expect(checkSchemaReady(pool)).rejects.toThrow('database_schema_not_ready');
    expect((await withReadOnlyDatabase(readSchemaState, pool)).missingIndexes)
      .toEqual(['clinical_write_keys.clinical_write_keys_actor_operation_request_key']);
  });

  it('requires the v1 session unique index even with an otherwise complete v3 ledger', async () => {
    const fixture = await freshFixture('sessionindex');
    await fixture.pool.query('DROP INDEX idx_sessions_key');
    await expect(checkSchemaReady(fixture.pool)).rejects.toThrow('database_schema_not_ready');
    expect((await withReadOnlyDatabase(readSchemaState, fixture.pool)).missingIndexes).toEqual(['sessions.idx_sessions_key']);
  });

  it('records the PUBLIC TEMP gap without changing shared database privileges or claiming universal DDL denial', async () => {
    const permissions = await runtime.query(`SELECT
      has_database_privilege(current_user, current_database(), 'TEMP') AS temporary,
      has_schema_privilege(current_user, current_schema(), 'CREATE') AS app_create`);
    expect(permissions.rows[0].app_create).toBe(false);
    expect(typeof permissions.rows[0].temporary).toBe('boolean');
    // Dedicated connection: a temporary synthetic table is never an app object.
    // PostgreSQL's default PUBLIC TEMP grant is observed, not revoked here.
    const client = await runtime.connect();
    try {
      await client.query('BEGIN');
      if (permissions.rows[0].temporary) await client.query('CREATE TEMP TABLE ops_temp_probe(id integer) ON COMMIT DROP');
      else await expect(client.query('CREATE TEMP TABLE ops_temp_probe(id integer) ON COMMIT DROP')).rejects.toMatchObject({ code: '42501' });
    } finally { await client.query('ROLLBACK'); client.release(); }
    console.log(`DATABASE_OPERATIONS_PUBLIC_TEMP_GAP=${permissions.rows[0].temporary}`);
  });

  it('production startup calls readiness only; missing schema never starts HTTP or tries DDL', async () => {
    const ready = vi.fn().mockResolvedValue(undefined);
    const init = vi.fn(); const migration = vi.fn(); const seed = vi.fn();
    const listen = vi.fn().mockReturnValue({});
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const once = vi.spyOn(process, 'once').mockReturnValue(process);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.doMock('../src/config', () => ({ config: { nodeEnv: 'production' }, validateProductionConfig: vi.fn() }));
    vi.doMock('../src/app', () => ({ createApp: () => ({ listen }) }));
    vi.doMock('../src/db', () => ({ default: { end: vi.fn() } }));
    vi.doMock('../src/db/schema', () => ({ initializeDatabase: init }));
    vi.doMock('../src/db/migrations', () => ({ migrateDatabase: migration }));
    vi.doMock('../src/db/seed', () => ({ seedDatabase: seed }));
    vi.doMock('../src/db/schemaState', () => ({ checkSchemaReady: ready }));
    try {
      vi.resetModules(); await import('../src/index');
      await vi.waitFor(() => expect(listen).toHaveBeenCalledOnce());
      ready.mockRejectedValueOnce(new Error('database_schema_not_ready'));
      vi.resetModules(); await import('../src/index');
      await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
      expect(listen).toHaveBeenCalledOnce(); expect(ready).toHaveBeenCalledTimes(2);
      expect(init).not.toHaveBeenCalled(); expect(migration).not.toHaveBeenCalled(); expect(seed).not.toHaveBeenCalled();
    } finally {
      for (const path of ['../src/config', '../src/app', '../src/db', '../src/db/schema', '../src/db/migrations', '../src/db/seed', '../src/db/schemaState']) vi.doUnmock(path);
      exit.mockRestore(); once.mockRestore(); log.mockRestore(); vi.resetModules();
    }
  });
});
