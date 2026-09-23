import type { Pool } from 'pg';
import { readSchemaState, withReadOnlyDatabase } from './schemaState';

export interface PreflightCheck { invariant: string; count: string; severity: 'blocker' | 'review' }
export interface PreflightReport { outcome: 'clear' | 'review' | 'blocked'; checks: PreflightCheck[] }

// Mirror the existing /vitals body rule in middleware/validation.ts, not new
// clinical cutoffs. Fixed SQL identifiers only; no patient values leave SQL.
const measurements = [
  ['temperature', 60, false], ['heart_rate', 400, true],
  ['blood_pressure_systolic', 400, true], ['blood_pressure_diastolic', 300, true],
  ['respiratory_rate', 150, true], ['oxygen_saturation', 100, false],
  ['weight', 1000, false], ['height', 300, false],
] as const;

const references = [
  ['patients', 'created_by', 'users', 'id'],
  ...['clinical_notes', 'vital_signs', 'appointments', 'visit_history', 'data_retention', 'audit_log', 'clinical_write_keys']
    .map(table => [table, 'patient_id', 'patients', 'patient_id']),
  ...['clinical_notes', 'appointments', 'visit_history', 'analytics_events'].map(table => [table, 'doctor_id', 'users', 'id']),
  ['vital_signs', 'recorded_by', 'users', 'id'], ['note_templates', 'creator_id', 'users', 'id'],
  ['audit_log', 'user_id', 'users', 'id'], ['sessions', 'user_id', 'users', 'id'],
  ['clinical_write_keys', 'actor_id', 'users', 'id'],
];

/** Only aggregate counts and constant invariant names leave the database.
 * PostgreSQL JSONB cannot contain syntactically invalid JSON; check its shape.
 * No coercion, patient identifiers/text, timezone guesses, or repairs.
 */
export async function runPreflight(database?: Pool): Promise<PreflightReport> {
  try {
    return await withReadOnlyDatabase(async client => {
      const state = await readSchemaState(client);
      const checks: PreflightCheck[] = [
        { invariant: 'schema.missing_versions', count: String(state.missingVersions.length), severity: 'review' },
        { invariant: 'schema.unsupported_versions', count: String(state.unsupportedVersions.length), severity: 'blocker' },
        { invariant: 'schema.missing_required_columns', count: String(state.missingObjects.length), severity: 'review' },
        { invariant: 'schema.missing_required_unique_indexes', count: String(state.missingIndexes.length), severity: 'review' },
      ];
      const count = async (invariant: string, sql: string, required: string[], severity: PreflightCheck['severity'] = 'blocker') => {
        if (!required.every(column => state.columns.has(column))) {
          checks.push({ invariant: `${invariant}.unavailable`, count: '1', severity: 'review' });
          return;
        }
        const result = await client.query<{ count: string }>(sql);
        checks.push({ invariant, count: result.rows[0].count, severity });
      };
      // Same grouping/count semantics as migration 3, but advisory only: the
      // migration must still repeat this check under its ledger-writer lock.
      for (const [suffix, aggregate] of [['groups', 'count(*)'], ['rows', 'COALESCE(sum(row_count), 0)']]) {
        await count(`clinical_write_keys.scope_collision_${suffix}`, `
          SELECT ${aggregate}::text AS count FROM (
            SELECT count(*) AS row_count FROM clinical_write_keys
            GROUP BY actor_id, operation, request_key HAVING count(*) > 1
          ) collisions`, ['clinical_write_keys.actor_id', 'clinical_write_keys.operation', 'clinical_write_keys.request_key']);
      }
      await count('clinical_notes.medical_codes_shape', `
        SELECT count(*)::text AS count FROM clinical_notes WHERE
          CASE WHEN jsonb_typeof(medical_codes) = 'array' THEN
            jsonb_array_length(medical_codes) > 100 OR EXISTS (
              SELECT 1 FROM jsonb_array_elements(medical_codes) code WHERE
                jsonb_typeof(code) <> 'string' OR length(code #>> '{}') > 50
                OR (code #>> '{}') ~ '^[[:space:]]*$')
          ELSE true END`, ['clinical_notes.medical_codes']);
      await count('appointments.status_allowed', `SELECT count(*)::text AS count FROM appointments
        WHERE status IS NULL OR status NOT IN ('scheduled', 'completed', 'cancelled', 'no-show')`, ['appointments.status']);
      await count('users.role_allowed', `SELECT count(*)::text AS count FROM users
        WHERE role IS NULL OR role NOT IN ('doctor', 'admin')`, ['users.role']);
      for (const [column, maximum, integer] of measurements) {
        // NULL is individually valid. Numeric NaN is supported even by the
        // current precision-limited DECIMAL columns; never treat it as missing.
        // INTEGER storage already enforces integrality, but legacy numeric
        // columns must not allow fractions to bypass the API's integer rule.
        await count(`vital_signs.${column}_range`, `SELECT count(*)::text AS count FROM vital_signs
          WHERE "${column}" IS NOT NULL AND (
            "${column}" < 0 OR "${column}" > ${maximum}
            OR "${column}"::text IN ('NaN', 'Infinity', '-Infinity')
            ${integer ? `OR "${column}" <> trunc("${column}"::numeric)` : ''}
          )`, [`vital_signs.${column}`]);
      }
      // Notes (including nonempty notes) do not satisfy the measurement rule.
      await count('vital_signs.measurement_required', `SELECT count(*)::text AS count FROM vital_signs
        WHERE ${measurements.map(([column]) => `"${column}" IS NULL`).join(' AND ')}`,
      measurements.map(([column]) => `vital_signs.${column}`));
      for (const [table, column, parent, key] of references) {
        await count(`orphans.${table}.${column}`, `SELECT count(*)::text AS count FROM "${table}" child
          WHERE child."${column}" IS NOT NULL AND NOT EXISTS
            (SELECT 1 FROM "${parent}" parent WHERE parent."${key}" = child."${column}")`, [`${table}.${column}`, `${parent}.${key}`]);
      }
      for (const [operation, table] of [['CREATE_APPOINTMENT', 'appointments'], ['CREATE_VISIT', 'visit_history'], ['RECORD_VITALS', 'vital_signs']]) {
        await count(`orphans.clinical_write_keys.${operation}`, `SELECT count(*)::text AS count FROM clinical_write_keys k
          WHERE k.operation = '${operation}' AND (k.resource_id IS NULL OR NOT EXISTS
            (SELECT 1 FROM ${table} r WHERE r.id=k.resource_id AND r.patient_id=k.patient_id))`,
        ['clinical_write_keys.operation', 'clinical_write_keys.resource_id', 'clinical_write_keys.patient_id', `${table}.id`, `${table}.patient_id`]);
      }
      // A populated wall-clock column has unknown timezone provenance, not a
      // proven DST error. Count all populated legacy timestamp columns, not just
      // the current timezone's DST window; never convert or assume UTC.
      for (const [key, type] of state.columns) {
        if (type !== 'timestamp without time zone') continue;
        const [table, column] = key.split('.');
        // Catalog includes more columns than the explicit readiness allowlist.
        // Only emit fixed, known identifiers; never arbitrary catalog names.
        if (!['last_login', 'created_at', 'updated_at', 'recorded_date', 'appointment_date', 'visit_date', 'event_date', 'expires_at', 'last_activity'].includes(column)) continue;
        await count(`timestamp_provenance.${table}.${column}`, `SELECT count(*)::text AS count FROM "${table}" WHERE "${column}" IS NOT NULL`, [key], 'review');
      }
      const outcome = checks.some(check => check.severity === 'blocker' && check.count !== '0') ? 'blocked'
        : checks.some(check => check.count !== '0') ? 'review' : 'clear';
      return { outcome, checks };
    }, database);
  } catch { throw new Error('database_preflight_failed'); }
}
