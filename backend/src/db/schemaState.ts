import type { Pool, PoolClient } from 'pg';

// Migration declarations are not exported; keep this module import-inert.
// Extend this exact set and the object contract together for every new migration.
export const EXPECTED_SCHEMA_VERSIONS = [1, 2, 3] as const;

// Names alone cannot prove uniqueness: validate the actual nonpartial, immediate,
// live/valid/ready index and its exact NOT NULL key columns in current_schema().
export const REQUIRED_UNIQUE_INDEXES = [
  { table: 'sessions', name: 'idx_sessions_key', columns: ['session_key'] },
  { table: 'clinical_write_keys', name: 'clinical_write_keys_actor_operation_request_key', columns: ['actor_id', 'operation', 'request_key'] },
] as const;

// Also detect a missing table/column behind an otherwise current version ledger.
// This is a readiness contract, not a complete schema/constraint diff tool.
export const REQUIRED_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  users: ['id', 'email', 'password_hash', 'role', 'is_active', 'last_login', 'created_at', 'updated_at'],
  patients: ['id', 'patient_id', 'created_by', 'created_at', 'updated_at'],
  clinical_notes: ['id', 'patient_id', 'doctor_id', 'note_date', 'medical_codes', 'revision', 'created_at', 'updated_at'],
  vital_signs: ['id', 'patient_id', 'recorded_by', 'recorded_date', 'created_at', 'updated_at'],
  appointments: ['id', 'patient_id', 'doctor_id', 'status', 'appointment_date', 'created_at', 'updated_at'],
  visit_history: ['id', 'patient_id', 'doctor_id', 'visit_date', 'created_at', 'updated_at'],
  note_templates: ['id', 'creator_id', 'created_at', 'updated_at'],
  data_retention: ['id', 'patient_id', 'auto_delete', 'created_at', 'updated_at'],
  analytics_events: ['id', 'doctor_id', 'event_date'],
  audit_log: ['id', 'user_id', 'patient_id', 'created_at'],
  sessions: ['id', 'user_id', 'session_key', 'expires_at', 'last_activity', 'created_at'],
  clinical_write_keys: ['actor_id', 'operation', 'patient_id', 'request_key', 'request_digest', 'resource_id', 'created_at'],
};

export class SchemaNotReadyError extends Error {
  constructor() { super('database_schema_not_ready'); this.name = 'SchemaNotReadyError'; }
}

export interface SchemaState {
  ready: boolean;
  versions: number[];
  missingVersions: number[];
  unsupportedVersions: number[];
  missingObjects: string[];
  missingIndexes: string[];
  // Internal catalog metadata only. Never include it in public readiness output.
  columns: Map<string, string>;
}

/** The caller must supply a read-only transaction; never uses DDL or repairs. */
export async function readSchemaState(client: PoolClient): Promise<SchemaState> {
  const catalog = await client.query<{ table_name: string; column_name: string; data_type: string }>(`
    SELECT table_name, column_name, data_type FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = ANY($1::text[])
    ORDER BY table_name, ordinal_position`,
  [[...Object.keys(REQUIRED_COLUMNS), 'schema_migrations']]);
  const columns = new Map(catalog.rows.map(row => [`${row.table_name}.${row.column_name}`, row.data_type]));
  // Explicit current_schema qualification prevents fallback to a ledger in public.
  const ledger = await client.query<{ present: boolean }>(`
    SELECT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=current_schema() AND c.relname='schema_migrations' AND c.relkind='r') AS present`);
  let versions: number[] = [];
  if (ledger.rows[0].present) {
    if (columns.get('schema_migrations.version') !== 'integer') throw new SchemaNotReadyError();
    const result = await client.query<{ version: number }>('SELECT version FROM schema_migrations ORDER BY version');
    versions = result.rows.map(row => row.version);
  }
  const expected: readonly number[] = EXPECTED_SCHEMA_VERSIONS;
  const missingVersions = expected.filter(version => !versions.includes(version));
  const unsupportedVersions = versions.filter(version => !expected.includes(version));
  const missingObjects = Object.entries(REQUIRED_COLUMNS).flatMap(([table, names]) =>
    names.filter(name => !columns.has(`${table}.${name}`)).map(name => `${table}.${name}`));
  const missingIndexes: string[] = [];
  for (const requirement of REQUIRED_UNIQUE_INDEXES) {
    const index = await client.query<{ present: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM pg_index i
        JOIN pg_class t ON t.oid=i.indrelid
        JOIN pg_namespace n ON n.oid=t.relnamespace
        JOIN pg_class x ON x.oid=i.indexrelid
        WHERE n.nspname=current_schema() AND t.relname=$1 AND t.relkind='r'
          AND x.relnamespace=t.relnamespace AND x.relname=$2 AND x.relkind='i'
          AND i.indisunique AND i.indisvalid AND i.indisready AND i.indislive AND i.indimmediate
          AND i.indpred IS NULL AND i.indexprs IS NULL
          AND i.indnatts=i.indnkeyatts AND i.indnkeyatts=cardinality($3::text[])
          AND ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(attnum, position)
            JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.attnum
            WHERE a.attnotnull AND NOT a.attisdropped ORDER BY k.position)=$3::text[]
      ) AS present`, [requirement.table, requirement.name, [...requirement.columns]]);
    if (!index.rows[0].present) missingIndexes.push(`${requirement.table}.${requirement.name}`);
  }
  const duplicates = new Set(versions).size !== versions.length;
  return { ready: !missingVersions.length && !unsupportedVersions.length && !missingObjects.length && !missingIndexes.length && !duplicates,
    versions, missingVersions, unsupportedVersions, missingObjects, missingIndexes, columns };
}

/** Lazy default pool: importing this module never connects or loads DB config. */
export async function withReadOnlyDatabase<T>(work: (client: PoolClient) => Promise<T>, database?: Pool): Promise<T> {
  const pool = database ?? (await import('./index')).default;
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout = '15s'");
    await client.query("SET LOCAL lock_timeout = '5s'");
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

/** /ready contract: resolves void when ready, otherwise rejects a sanitized error.
 * Do not return this function's result as a boolean; use await + try/catch.
 * Connection/permission failures also fail closed, without driver error details.
 */
export async function checkSchemaReady(database?: Pool): Promise<void> {
  try {
    const state = await withReadOnlyDatabase(readSchemaState, database);
    if (!state.ready) throw new SchemaNotReadyError();
  } catch { throw new SchemaNotReadyError(); }
}
