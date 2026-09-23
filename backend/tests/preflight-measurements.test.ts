import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { runPreflight } from '../src/db/preflight';
import { withReadOnlyDatabase } from '../src/db/schemaState';
import { assertSupportedPostgres } from './helpers/supportedPg';
import { auditDatabaseUrl } from './helpers/auditDatabase';

let approvedUrl: string;
const backend = resolve(__dirname, '..');
// Independent expected bounds, intentionally not imported from the preflight.
// These are the current middleware/validation.ts API bounds, not clinical advice.
const fields = [
  ['temperature', 60, false], ['heart_rate', 400, true],
  ['blood_pressure_systolic', 400, true], ['blood_pressure_diastolic', 300, true],
  ['respiratory_rate', 150, true], ['oxygen_saturation', 100, false],
  ['weight', 1000, false], ['height', 300, false],
] as const;

describe.sequential('E2 count-only measurement preflight (one fresh guarded synthetic schema)', () => {
  let admin: Pool; let db: Pool; let url: string;
  const schema = `ops_measurements_${randomUUID().replaceAll('-', '')}`;
  const patient = 'SYN-E2-MEASUREMENT-PRIVATE';
  const notes = 'SYNTHETIC-E2-PRIVATE-NOTES';
  const cli = (command: 'preflight' | 'migrate') => spawnSync(process.execPath,
    ['-r', 'ts-node/register', 'src/db/cli.ts', command, '--approved-production',
      ...(command === 'migrate' ? ['--confirm-migration'] : [])], {
      cwd: backend, encoding: 'utf8', timeout: 30000,
      // Never inherit real DATABASE_URL, PG*, NODE_OPTIONS or dotenv paths.
      env: { PATH: process.env.PATH, NODE_ENV: 'production', DATABASE_URL: url,
        DB_POOL_MAX: '1', RELEASE_MIGRATION_APPROVED: 'true' },
    });
  const snapshot = async () => (await db.query(`SELECT table_name,
    md5(coalesce(string_agg(row_text, E'\n' ORDER BY row_text), '')) AS digest FROM (
      SELECT 'users' AS table_name, to_jsonb(t)::text AS row_text FROM users t UNION ALL
      SELECT 'patients', to_jsonb(t)::text FROM patients t UNION ALL
      SELECT 'vital_signs', to_jsonb(t)::text FROM vital_signs t UNION ALL
      SELECT 'audit_log', to_jsonb(t)::text FROM audit_log t UNION ALL
      SELECT 'schema_migrations', to_jsonb(t)::text FROM schema_migrations t
    ) rows GROUP BY table_name ORDER BY table_name`)).rows;
  const insert = async (values: Partial<Record<typeof fields[number][0], number | string>> = {}, note?: string) => {
    const entries = Object.entries(values);
    // Column names are from the fixed test allowlist, never input/catalog text.
    expect(entries.every(([column]) => fields.some(([field]) => field === column))).toBe(true);
    await db.query(`INSERT INTO vital_signs(patient_id, recorded_by, recorded_date, notes
      ${entries.map(([column]) => `, "${column}"`).join('')})
      VALUES ($1, 87654321, '2001-10-28 01:30:00.123456', $2
        ${entries.map((_, index) => `, $${index + 3}`).join('')})`, [patient, note ?? null, ...entries.map(([, value]) => value)]);
  };
  const verify = async (expectedCounts: number[], empty: number, blocked: boolean) => {
    const before = await snapshot();
    const report = await runPreflight(db);
    const result = cli('preflight');
    expect(result.error).toBeUndefined(); expect(result.signal).toBeNull();
    expect(result.stderr).toBe(''); expect(result.status).toBe(blocked ? 2 : 3);
    expect(JSON.parse(result.stdout)).toEqual(report);
    expect(report.outcome).toBe(blocked ? 'blocked' : 'review');
    const expected = fields.map(([column], index) => ({
      invariant: `vital_signs.${column}_range`, count: String(expectedCounts[index]), severity: 'blocker',
    }));
    expected.push({ invariant: 'vital_signs.measurement_required', count: String(empty), severity: 'blocker' });
    expect(report.checks.filter(check => check.invariant.startsWith('vital_signs.'))).toEqual(expected);
    expect(report.checks.filter(check => check.severity === 'blocker' && check.count !== '0'))
      .toEqual(expected.filter(check => check.count !== '0'));
    expect(Object.keys(report).sort()).toEqual(['checks', 'outcome']);
    for (const check of report.checks) {
      expect(Object.keys(check).sort()).toEqual(['count', 'invariant', 'severity']);
      expect(check.count).toMatch(/^\d+$/);
      expect(['blocker', 'review']).toContain(check.severity);
    }
    const output = JSON.stringify(report) + result.stdout + result.stderr;
    for (const sensitive of [approvedUrl, url, schema, patient, notes, '87654321',
      'ops-measurement@example.invalid', 'synthetic-no-login', '2001-10-28',
      'NaN', 'Infinity', 'SELECT ', 'INSERT ', 'statement_timeout']) expect(output).not.toContain(sensitive);
    expect(await snapshot()).toEqual(before);
    return report;
  };

  beforeAll(async () => {
    // Exact guard before constructing any pool, importing config, or issuing DDL.
    approvedUrl = auditDatabaseUrl();
    admin = new Pool({ connectionString: approvedUrl, connectionTimeoutMillis: 5000, max: 1 });
    await assertSupportedPostgres(admin);
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const target = new URL(approvedUrl);
    target.searchParams.set('options', `-c search_path=${schema}`);
    url = target.toString();
    db = new Pool({ connectionString: url, max: 1 });
    const migrated = cli('migrate');
    expect(migrated.error).toBeUndefined(); expect(migrated.status).toBe(0); expect(migrated.stderr).toBe('');
    await db.query(`INSERT INTO users(id, email, password_hash) VALUES (87654321, 'ops-measurement@example.invalid', 'synthetic-no-login')`);
    await db.query('INSERT INTO patients(patient_id, created_by) VALUES ($1, 87654321)', [patient]);
    console.log(`E2_MEASUREMENT_SCHEMA=${schema}`);
  });
  afterAll(async () => {
    await Promise.all([db?.end(), admin?.end()]);
    // Preserve this new synthetic schema as evidence; no cleanup or shared ACL DDL.
  });

  it('retains enforced read-only/repeatable-read transactions and the existing statement/lock caps', async () => {
    await withReadOnlyDatabase(async client => {
      const settings = (await client.query(`SELECT current_setting('transaction_read_only') AS readonly,
        current_setting('transaction_isolation') AS isolation,
        current_setting('statement_timeout') AS statement, current_setting('lock_timeout') AS lock`)).rows[0];
      expect(settings).toEqual({ readonly: 'on', isolation: 'repeatable read', statement: '15s', lock: '5s' });
      await expect(client.query('DELETE FROM vital_signs')).rejects.toMatchObject({ code: '25006' });
    }, db);
  });

  it('accepts every zero/maximum boundary, individual NULLs, decimal fractions and optional notes without changing row digests', async () => {
    for (const [column, maximum, integer] of fields) {
      await insert({ [column]: 0 });
      await insert({ [column]: maximum }, '');
      if (!integer) await insert({ [column]: 0.5 }, notes);
    }
    await insert(Object.fromEntries(fields.map(([column]) => [column, 0])), notes);
    await insert(Object.fromEntries(fields.map(([column, maximum]) => [column, maximum])));
    expect((await db.query('SELECT count(*)::text AS count FROM vital_signs')).rows[0].count).toBe('22');
    const report = await verify(fields.map(() => 0), 0, false);
    expect(report.checks).toContainEqual({ invariant: 'timestamp_provenance.vital_signs.recorded_date', count: '22', severity: 'review' });
  });

  it('blocks exactly sixteen out-of-range rows plus one all-NULL row, with separate per-field counts and CLI exit 2', async () => {
    for (const [column, maximum] of fields) {
      await insert({ [column]: -1 }, notes);
      await insert({ [column]: maximum + 1 }, notes);
    }
    await insert();
    expect((await db.query('SELECT count(*)::text AS count FROM vital_signs')).rows[0].count).toBe('39');
    await verify(fields.map(() => 2), 1, true);
  });

  it('does not count empty or nonempty notes as a measurement, and never rewrites notes or wall timestamps', async () => {
    await insert({}, ''); await insert({}, notes);
    await verify(fields.map(() => 2), 3, true);
    expect((await db.query(`SELECT count(*)::text AS count FROM vital_signs
      WHERE to_char(recorded_date, 'YYYY-MM-DD HH24:MI:SS.US') <> '2001-10-28 01:30:00.123456'`)).rows[0].count).toBe('0');
  });

  it('blocks SQL numeric NaN in every type that permits it; precision-limited infinities are rejected by PostgreSQL itself', async () => {
    const beforeRejectedWrites = await snapshot();
    for (const [column, , integer] of fields) {
      if (integer) {
        // INTEGER cannot represent NaN, infinities or a fractional text value.
        for (const value of ['NaN', 'Infinity', '-Infinity', '0.5']) {
          await expect(insert({ [column]: value })).rejects.toMatchObject({ code: '22P02' });
        }
      } else {
        // Current DECIMAL(p,s) permits NaN but not +/-Infinity; no fixture DDL
        // widens these types merely to fabricate unsupported stored values.
        for (const value of ['Infinity', '-Infinity']) {
          await expect(insert({ [column]: value })).rejects.toMatchObject({ code: '22003' });
        }
      }
    }
    expect(await snapshot()).toEqual(beforeRejectedWrites);
    for (const [column, , integer] of fields) if (!integer) await insert({ [column]: 'NaN' }, notes);
    const report = await verify(fields.map(([, , integer]) => integer ? 2 : 3), 3, true);
    expect(report.checks).toContainEqual({ invariant: 'timestamp_provenance.vital_signs.recorded_date', count: '45', severity: 'review' });
  });
});
