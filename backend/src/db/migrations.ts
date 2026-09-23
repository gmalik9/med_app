import { transaction } from './index';

// Counts only: never put actor/patient IDs, request keys, digests or driver
// details in a migration diagnostic. Decimal strings preserve BIGINT counts.
export class IdempotencyMigrationCollisionError extends Error {
  constructor(public readonly collisionGroups: string, public readonly collisionRows: string) {
    super(`migration_3_idempotency_scope_collisions: groups=${collisionGroups}; rows=${collisionRows}. ` +
      'Migration aborted; version 2 and all records are unchanged. Pause keyed creation and arrange approved human reconciliation; ' +
      'do not delete records or automatically rewrite keys. See docs/verification/track-d-idempotency.md.');
    this.name = 'IdempotencyMigrationCollisionError';
  }
}

// Additive, versioned migrations. No patient data is deleted or reassigned.
export async function migrateDatabase() {
  await transaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(73410291)');
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    const applied = await client.query('SELECT version FROM schema_migrations WHERE version = 1');
    if (!applied.rows.length) {
    await client.query(`
      ALTER TABLE sessions ADD COLUMN IF NOT EXISTS session_key UUID NOT NULL DEFAULT gen_random_uuid();
      CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_key ON sessions(session_key);
      ALTER TABLE clinical_notes ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;
      CREATE INDEX IF NOT EXISTS idx_notes_patient_date ON clinical_notes(patient_id, note_date DESC);
      CREATE INDEX IF NOT EXISTS idx_vitals_patient_date ON vital_signs(patient_id, recorded_date DESC);
      CREATE INDEX IF NOT EXISTS idx_visits_patient_date ON visit_history(patient_id, visit_date DESC);
      CREATE INDEX IF NOT EXISTS idx_visits_doctor_date ON visit_history(doctor_id, visit_date);
      CREATE INDEX IF NOT EXISTS idx_appointments_doctor_date ON appointments(doctor_id, appointment_date) WHERE status = 'scheduled';
      CREATE INDEX IF NOT EXISTS idx_patients_created ON patients(created_at DESC, id DESC);
      ALTER TABLE data_retention ALTER COLUMN auto_delete SET DEFAULT false;
      INSERT INTO schema_migrations(version) VALUES (1);
    `);
    }
    const version2 = await client.query('SELECT version FROM schema_migrations WHERE version = 2');
    if (!version2.rows.length) {
      await client.query(`
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
      `);
    }
    const version3 = await client.query('SELECT version FROM schema_migrations WHERE version = 3');
    if (!version3.rows.length) {
      // Keep the v2 table/PK and history intact. Serialize ledger writers as
      // well as migration runners so no new collision can race this preflight.
      await client.query('LOCK TABLE clinical_write_keys IN SHARE ROW EXCLUSIVE MODE');
      const collisions = await client.query<{ collision_groups: string; collision_rows: string }>(`
        SELECT count(*)::text AS collision_groups, COALESCE(sum(row_count), 0)::text AS collision_rows
        FROM (
          SELECT count(*) AS row_count FROM clinical_write_keys
          GROUP BY actor_id, operation, request_key HAVING count(*) > 1
        ) collisions`);
      const { collision_groups, collision_rows } = collisions.rows[0];
      if (collision_groups !== '0') throw new IdempotencyMigrationCollisionError(collision_groups, collision_rows);
      await client.query(`
        ALTER TABLE clinical_write_keys ADD CONSTRAINT clinical_write_keys_actor_operation_request_key
          UNIQUE (actor_id, operation, request_key);
        INSERT INTO schema_migrations(version) VALUES (3);
      `);
    }
  });
}
