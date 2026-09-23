// One fail-closed guard for the runner and every direct integration invocation.
export function auditDatabaseUrl(value = process.env.TEST_DATABASE_URL): string {
  const { requireAuditDatabase } = require('../../../tests/audit-database.cjs');
  return requireAuditDatabase({ TEST_DATABASE_URL: value });
}
