import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
// These are metadata receipts, not invented hashes. Reverify and update evidence on upgrades.
const commits = new Map([
  ['actions/checkout', '11d5960a326750d5838078e36cf38b85af677262'],
  ['actions/setup-node', '49933ea5288caeca8642d1e84afbd3f7d6820020'],
  ['actions/upload-artifact', 'ea165f8d65b6e75b540449e92b4886f43607fa02'],
  ['github/codeql-action/init', '3ea06614dafe36dec890db3446326e0d40ce53d4'],
  ['github/codeql-action/analyze', '3ea06614dafe36dec890db3446326e0d40ce53d4'],
]);

test('workflow actions use verified commit receipts and no privileged PR triggers or soft failures', () => {
  for (const file of readdirSync(new URL('.github/workflows/', root)).filter(name => /\.ya?ml$/.test(name))) {
    const text = read(`.github/workflows/${file}`);
    assert.doesNotMatch(text, /pull_request_target|continue-on-error:\s*true/);
    for (const [, action, revision] of text.matchAll(/uses:\s+([^\s@]+)@([^\s#]+)/g)) {
      assert.equal(revision, commits.get(action), `${file}: ${action} must have verified commit provenance`);
      assert.match(revision, /^[a-f0-9]{40}$/);
    }
  }
});

test('verification matrix requires actual database metadata and non-skipping release verification', () => {
  const text = read('.github/workflows/verify.yml');
  for (const fragment of ["pg: ['15', '17']", 'timezone: [UTC, America/New_York]',
    'PGTZ: ${{ matrix.timezone }}', 'EXPECTED_PG_TIMEZONE: ${{ matrix.timezone }}',
    "ports: ['55439:5432']", 'node tests/release-database-info.mjs', 'npm ci',
    'npm run verify:release', 'needs: [required-integration]', 'if: always()',
    'TEST_DATABASE_PASSWORD: ${{ secrets.TEST_DATABASE_PASSWORD }}', 'POSTGRES_USER: audit',
    'POSTGRES_PASSWORD: ${{ secrets.TEST_DATABASE_PASSWORD }}', 'POSTGRES_DB: medapp_audit',
    'node tests/configure-test-database.mjs',
    'npm run test:inventory', 'node tests/release-runner.mjs --check-database',
    'test "$RESULT" = success']) assert.ok(text.includes(fragment), fragment);
  assert.equal([...text.matchAll(/image: postgres:(?:15|17)-alpine@sha256:[a-f0-9]{64}/g)].length, 2);
});

test('security jobs scan fetched full history with redaction and retain only SBOM artifacts', () => {
  const text = read('.github/workflows/security.yml');
  for (const fragment of ['fetch-depth: 0', 'persist-credentials: false', '--redact=100',
    '--log-opts=--all', 'build-mode: none', 'queries: security-extended',
    '--scanners vuln --severity HIGH,CRITICAL --exit-code 1', '--format cyclonedx',
    'retention-days: 7', 'needs: [history-secrets, codeql, images]']) assert.ok(text.includes(fragment), fragment);
  assert.match(text, /gitleaks:v8\.30\.1@sha256:[a-f0-9]{64}/);
  assert.match(text, /trivy:0\.74\.0@sha256:[a-f0-9]{64}/);
  assert.doesNotMatch(text, /--ignore-unfixed|--report-path|\$\{\{\s*secrets\./);
  assert.match(text, /path: \$\{\{ runner\.temp \}\}\/image-scan\/image\.cdx\.json/);
});
