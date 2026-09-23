import { appendFileSync, constants } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { requireAuditDatabase } from './audit-database.cjs';

export function maskGithubValue(value) {
  // GitHub workflow-command escaping, not shell escaping. Only masking commands
  // may carry credentials on stdout; never ordinary diagnostics or outputs.
  process.stdout.write(`::add-mask::${value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}\n`);
}

export function configureTestDatabase(env = process.env, append = appendFileSync, mask = maskGithubValue) {
  if (typeof env.TEST_DATABASE_PASSWORD !== 'string' || !env.TEST_DATABASE_PASSWORD ||
      /[\r\n\0]/.test(env.TEST_DATABASE_PASSWORD) || !env.GITHUB_ENV) {
    throw new Error('CI requires a private nonempty TEST_DATABASE_PASSWORD and GITHUB_ENV; never use a production credential.');
  }
  mask(env.TEST_DATABASE_PASSWORD);
  const url = new URL('postgresql://audit@127.0.0.1:55439/medapp_audit');
  url.password = encodeURIComponent(env.TEST_DATABASE_PASSWORD);
  const value = requireAuditDatabase({ TEST_DATABASE_URL: url.href });
  mask(url.password);
  mask(value);
  // GitHub's private job environment file, not a repository dotenv file/artifact.
  // Never print a raw or encoded password/URL, even on failure.
  append(env.GITHUB_ENV, `TEST_DATABASE_URL=${value}\n`, {
    encoding: 'utf8', mode: 0o600,
    flag: constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { configureTestDatabase(); }
  catch { console.error('Synthetic database configuration failed: supply a private nonempty TEST_DATABASE_PASSWORD and GITHUB_ENV (values redacted).'); process.exitCode = 1; }
}
