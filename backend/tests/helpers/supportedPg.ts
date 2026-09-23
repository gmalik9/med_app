import type { Pool } from 'pg';

// Test-only contract, kept in sync with the declared CI matrix by release tests.
export const SUPPORTED_PG_MAJORS = Object.freeze([15, 17] as const);

/** Call only AFTER the suite's approved-URL guard and BEFORE schema/role DDL. */
export async function assertSupportedPostgres(
  database: Pick<Pool, 'query'>,
  expectedMajor: string | undefined = process.env.EXPECTED_PG_MAJOR,
): Promise<number> {
  const result = await database.query('SHOW server_version_num');
  const version = result.rows[0]?.server_version_num;
  // SHOW returns a decimal string, not a claimed version from the environment.
  if (typeof version !== 'string' || !/^[1-9]\d{5}$/.test(version)) {
    throw new Error('Invalid PostgreSQL server_version_num probe');
  }
  const major = Math.floor(Number(version) / 10000);
  if (!SUPPORTED_PG_MAJORS.some(supported => supported === major)) {
    throw new Error('PostgreSQL major is outside the declared test matrix [15, 17]');
  }
  // Only undefined means absent: empty, malformed and undeclared values fail too.
  // Never print the raw environment value or connection details on failure.
  if (expectedMajor !== undefined && expectedMajor !== String(major)) {
    throw new Error('PostgreSQL major does not match EXPECTED_PG_MAJOR');
  }
  return major;
}
