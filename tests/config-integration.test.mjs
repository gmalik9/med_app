import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertIntegrationReport, backendUnitSuites, discoverBackendSuites } from './release-suites.mjs';
import { run } from './release-runner.mjs';
import { syntheticDatabaseUrl } from './synthetic-secrets.mjs';
import { CI_DATABASE_IMAGES } from './ci-database.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(join(root, path), 'utf8');
const json = path => JSON.parse(read(path));
const backend = join(root, 'backend');
const env = { TEST_DATABASE_URL: syntheticDatabaseUrl() };
const reportFor = files => ({
  success: true, numTotalTests: files.length, numPassedTests: files.length,
  numFailedTests: 0, numPendingTests: 0, numTodoTests: 0,
  testResults: files.map(name => ({ name, status: 'passed', assertionResults: [{ status: 'passed' }] })),
});

test('all current backend suites are classified; real-DB frontend render is not a frontend unit', () => {
  const suites = discoverBackendSuites(backend);
  assert.deepEqual(suites.unit, backendUnitSuites);
  assert.deepEqual(suites.integration, [
    'api', 'audit-observability', 'audit-references', 'database-operations', 'idempotency',
    'pagination-render', 'pagination-sequences', 'pagination', 'preflight-measurements',
    'session-lifecycle', 'validation-routing',
  ].map(name => `tests/${name}.test.ts`).sort());
  assert.match(read('backend/vitest.config.ts'), /include: \['tests\/\*\*\/\*\.test\.ts'\]/);
  assert.match(read('backend/vitest.config.ts'), /fileParallelism: false/);
  assert.equal(json('package.json').scripts.test, 'npm run test:unit');
  assert.equal(json('backend/package.json').scripts['test:unit'], `vitest run ${backendUnitSuites.join(' ')}`);
  assert.match(json('backend/package.json').scripts['test:database-operations'], /--check-database && vitest run tests\/database-operations\.test\.ts tests\/preflight-measurements\.test\.ts$/);
});

test('new nested suites default to integration and unsupported test naming fails instead of vanishing', () => {
  const directory = mkdtempSync(join(tmpdir(), 'medapp-inventory-test-'));
  try {
    mkdirSync(join(directory, 'tests/nested'), { recursive: true });
    for (const file of [...backendUnitSuites, 'tests/nested/new-database.test.ts']) writeFileSync(join(directory, file), '');
    assert.deepEqual(discoverBackendSuites(directory).integration, ['tests/nested/new-database.test.ts']);
    writeFileSync(join(directory, 'tests/hidden.spec.ts'), '');
    assert.throws(() => discoverBackendSuites(directory), /Unsupported backend suite naming/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('integration reports require every discovered suite and every assertion to pass, with no skips or todos', () => {
  const files = discoverBackendSuites(backend).integration.map(path => join(backend, path));
  const good = reportFor(files);
  assert.doesNotThrow(() => assertIntegrationReport(good, files));
  const mutations = [
    value => { value.success = false; },
    value => { value.numPendingTests = 1; },
    value => { value.numTodoTests = 1; },
    value => { value.numFailedTests = 1; },
    value => { value.numPassedTests--; },
    value => { value.testResults.pop(); },
    value => { value.testResults[0].name = value.testResults[1].name; },
    value => { value.testResults[0].status = 'failed'; },
    value => { value.testResults[0].assertionResults = []; },
    value => { value.testResults[0].assertionResults[0].status = 'pending'; },
    value => { value.testResults[0].assertionResults[0].status = 'todo'; },
    value => { value.numTotalTests++; value.numPassedTests++; },
  ];
  for (const mutate of mutations) {
    const value = structuredClone(good); mutate(value);
    assert.throws(() => assertIntegrationReport(value, files), /Required integration report incomplete/);
  }
  assert.throws(() => assertIntegrationReport(reportFor([]), []), /Required integration report incomplete/);
});

test('runner guards before children, preserves diagnostics, checks report and cleans only its temporary directory', context => {
  // A fabricated runner report exercises plumbing, not real integration. Never
  // print its synthetic success line as if these were executed database tests.
  const log = context.mock.method(console, 'log', () => {});
  let calls = 0;
  let reportPath;
  const execute = (_command, args, options) => {
    calls++;
    assert.equal(options.cwd, root);
    assert.equal(options.stdio, 'inherit');
    assert.ok(args.includes('--reporter=default'));
    assert.ok(args.includes('--reporter=json'));
    assert.deepEqual(args.slice(5, 9), ['--exclude', ...backendUnitSuites.slice(0, 1), '--exclude', ...backendUnitSuites.slice(1)]);
    reportPath = args.find(arg => arg.startsWith('--outputFile.json=')).slice('--outputFile.json='.length);
    writeFileSync(reportPath, JSON.stringify(reportFor(discoverBackendSuites(backend).integration.map(file => join(backend, file)))));
    return { status: 0 };
  };
  assert.throws(() => run('--integration', {}, execute), /TEST_DATABASE_URL/);
  assert.equal(calls, 0);
  assert.equal(run('--integration', env, execute), 0);
  assert.equal(calls, 1);
  assert.equal(log.mock.callCount(), 1);
  assert.equal(existsSync(reportPath), false);
  assert.throws(() => run('--integration', env, () => ({ status: 0 })), /report missing or invalid/);
  assert.equal(run('--integration', env, () => ({ status: 7 })), 7);
  assert.equal(run('--integration', env, () => ({ signal: 'SIGTERM', status: null })), 1);
});

test('compiled and source CLI forwarding preserve the actual rootDir/outDir layout and approval boundaries', () => {
  const rootScripts = json('package.json').scripts;
  const scripts = json('backend/package.json').scripts;
  for (const command of ['check', 'preflight', 'migrate']) {
    assert.equal(rootScripts[`db:${command}`], `npm run db:${command} --workspace=backend --`);
    assert.equal(rootScripts[`db:${command}:source`], `npm run db:${command}:source --workspace=backend --`);
    assert.equal(scripts[`db:${command}`], `node dist/db/cli.js ${command}`);
    assert.equal(scripts[`db:${command}:source`], `ts-node src/db/cli.ts ${command}`);
  }
  assert.equal(json('backend/tsconfig.json').compilerOptions.rootDir, './src');
  assert.equal(json('backend/tsconfig.json').compilerOptions.outDir, './dist');
  assert.equal(scripts.start, 'node dist/index.js');
  assert.match(read('backend/src/db/schemaState.ts'), /EXPECTED_SCHEMA_VERSIONS = \[1, 2, 3\]/);
  assert.match(read('backend/src/db/cli.ts'), /RELEASE_MIGRATION_APPROVED !== 'true'/);
  for (const flag of ['--approved-production', '--confirm-migration']) assert.ok(read('backend/src/db/cli.ts').includes(flag));
});

test('Verify CI image receipts match the runtime allowlist while retaining the exact shared URL guard', () => {
  const workflow = read('.github/workflows/verify.yml');
  for (const image of Object.values(CI_DATABASE_IMAGES)) assert.ok(workflow.includes(`image: ${image}`));
  assert.match(read('tests/configure-test-database.mjs'), /requireAuditDatabase\(\{ TEST_DATABASE_URL: url.href \}\)/);
  assert.match(read('tests/ci-database.mjs'), /configureTestDatabase\(\{ TEST_DATABASE_PASSWORD: password, GITHUB_ENV: env.GITHUB_ENV \}/);
});

test('application image bases use registry-verified OCI index receipts without changing runtime layout', () => {
  const node = 'node:22-alpine@sha256:b6f26b36c8ff49624cfdac716b8ea1138d606df02586a77d364bb5536a634f85';
  const nginx = 'nginxinc/nginx-unprivileged:stable-alpine@sha256:daa17b944bac2b578e962da4c61ad72a59233b3c63abea17113acaf4e6b9aea4';
  assert.deepEqual([...read('backend/Dockerfile').matchAll(/^FROM (\S+)/gm)].map(match => match[1]), [node, node]);
  assert.deepEqual([...read('frontend/Dockerfile').matchAll(/^FROM (\S+)/gm)].map(match => match[1]), [node, nginx]);
  for (const fragment of ['USER node', '/app/backend/dist ./backend/dist', '"backend/dist/index.js"', '/ready']) assert.ok(read('backend/Dockerfile').includes(fragment));
  for (const fragment of ['COPY frontend/nginx.conf', '/app/frontend/dist /usr/share/nginx/html', 'EXPOSE 8080', 'HEALTHCHECK']) assert.ok(read('frontend/Dockerfile').includes(fragment));
});
