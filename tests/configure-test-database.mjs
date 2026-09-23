import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { requireAuditDatabase } from './audit-database.cjs';

export function configureTestDatabase(env = process.env, append = appendFileSync) {
  if (!env.TEST_DATABASE_PASSWORD || !env.GITHUB_ENV) {
    throw new Error('CI requires a dedicated TEST_DATABASE_PASSWORD repository secret and GITHUB_ENV; never use a production credential.');
  }
  const url = new URL('postgresql://audit@127.0.0.1:55439/medapp_audit');
  url.password = encodeURIComponent(env.TEST_DATABASE_PASSWORD);
  const value = requireAuditDatabase({ TEST_DATABASE_URL: url.href });
  // GitHub's private job environment file, not a repository dotenv file/artifact.
  // Never print a raw or encoded password/URL, even on failure.
  append(env.GITHUB_ENV, `TEST_DATABASE_URL=${value}\n`, { encoding: 'utf8', mode: 0o600 });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { configureTestDatabase(); }
  catch { console.error('Synthetic database configuration failed: supply a dedicated TEST_DATABASE_PASSWORD repository secret and GITHUB_ENV (values redacted).'); process.exitCode = 1; }
}
