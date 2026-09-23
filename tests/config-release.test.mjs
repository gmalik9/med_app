import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { requireAuditDatabase } from './release-runner.mjs';
import { syntheticDatabaseUrl as createSyntheticDatabaseUrl } from './synthetic-secrets.mjs';
const syntheticDatabaseUrl = createSyntheticDatabaseUrl();

const root = new URL('../', import.meta.url);
const json = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));

test('required integration refuses missing or unapproved URLs without exposing values', () => {
  const withoutPassword = new URL(syntheticDatabaseUrl);
  withoutPassword.password = '';
  for (const value of [undefined, '', 'postgresql://secret:DO_NOT_PRINT@remote.invalid/medapp_audit',
    syntheticDatabaseUrl.replace('medapp_audit', 'production'), `${syntheticDatabaseUrl}?options=-csearch_path=public`,
    syntheticDatabaseUrl.replace('55439', '5432'), syntheticDatabaseUrl.replace('127.0.0.1', 'localhost'),
    syntheticDatabaseUrl.replace('audit:', 'other:'), withoutPassword.toString(),
    `${syntheticDatabaseUrl}/`, `${syntheticDatabaseUrl}#ignored`, `${syntheticDatabaseUrl}?schema=public`]) {
    const env = { ...process.env, TEST_DATABASE_URL: value || '' };
    assert.throws(() => requireAuditDatabase(env), /TEST_DATABASE_URL/);
    const result = spawnSync(process.execPath, [new URL('release-runner.mjs', import.meta.url).pathname, '--check-database'], { env, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Release prerequisite failed:.*TEST_DATABASE_URL/);
    assert.doesNotMatch(result.stderr, /DO_NOT_PRINT|remote\.invalid|options=/);
  }
  assert.doesNotThrow(() => requireAuditDatabase({ TEST_DATABASE_URL: syntheticDatabaseUrl }));
});

test('verify and integration fail before executing any child command when URL is missing', () => {
  for (const mode of ['--verify', '--integration']) {
    const result = spawnSync(process.execPath, [new URL('release-runner.mjs', import.meta.url).pathname, mode], {
      env: { ...process.env, TEST_DATABASE_URL: '', PATH: '' }, encoding: 'utf8',
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /TEST_DATABASE_URL is required/);
    assert.equal(result.stdout, '');
  }
});

test('root lockfile matches workspace dependency declarations (script edits need no regeneration)', () => {
  const lock = json('package-lock.json');
  for (const workspace of ['', 'backend', 'frontend']) {
    const manifest = json(workspace ? `${workspace}/package.json` : 'package.json');
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'engines']) {
      assert.deepEqual(manifest[field] || {}, lock.packages[workspace][field] || {}, `${workspace || 'root'} ${field}`);
    }
  }
});

test('script contract separates units, required integration, and release verification', async () => {
  const rootScripts = json('package.json').scripts;
  const backendScripts = json('backend/package.json').scripts;
  assert.match(rootScripts.verify, /release-runner\.mjs --verify/);
  assert.match(rootScripts['test:integration'], /release-runner\.mjs --integration/);
  assert.match(backendScripts['test:integration'], /release-runner\.mjs --integration/);
  assert.equal(backendScripts.test, 'npm run test:unit');
  assert.equal(backendScripts['test:unit'], 'vitest run tests/security.test.ts tests/configuration.test.ts');
  const runner = readFileSync(new URL('tests/release-runner.mjs', root), 'utf8');
  assert.match(runner, /'--exclude', 'tests\/security\.test\.ts', '--exclude', 'tests\/configuration\.test\.ts'/);
  assert.match(rootScripts['test:unit'], /test:release/);

  // Exercise the actual TS prerequisite without Vitest, app imports or a DB.
  // Extend this existing contract so release/integration case identities stay fixed.
  const require = createRequire(new URL('backend/package.json', root));
  require('ts-node').register({ project: fileURLToPath(new URL('backend/tsconfig.json', root)) });
  const { assertSupportedPostgres, SUPPORTED_PG_MAJORS } = require('./tests/helpers/supportedPg.ts');
  assert.deepEqual(SUPPORTED_PG_MAJORS, [15, 17]);
  assert.ok(Object.isFrozen(SUPPORTED_PG_MAJORS));
  const workflow = readFileSync(new URL('.github/workflows/verify.yml', root), 'utf8');
  const matrix = workflow.match(/^\s+pg: \[([^\]]+)\]$/m);
  assert.ok(matrix, 'CI must declare an explicit PostgreSQL matrix');
  assert.deepEqual(matrix[1].split(',').map(value => Number(value.trim().match(/^'(\d+)'$/)?.[1])), SUPPORTED_PG_MAJORS);
  assert.ok(workflow.includes('EXPECTED_PG_MAJOR: ${{ matrix.pg }}'));
  for (const suite of ['database-operations', 'pagination-sequences', 'preflight-measurements', 'validation-routing']) {
    const text = readFileSync(new URL(`backend/tests/${suite}.test.ts`, root), 'utf8');
    assert.match(text, /import \{ assertSupportedPostgres \} from '\.\/helpers\/supportedPg';/);
    assert.equal(text.match(/await assertSupportedPostgres\(admin\);/g)?.length, 1);
    assert.doesNotMatch(text, /SHOW server_version_num|toBeGreaterThanOrEqual\(170000\)|toBeLessThan\(180000\)/);
    assert.ok(text.indexOf('await assertSupportedPostgres(admin);') > text.indexOf('admin = new Pool('));
  }
  const probe = (version, ...expected) => {
    let queries = 0;
    const result = assertSupportedPostgres({ query: async sql => {
      assert.equal(sql, 'SHOW server_version_num');
      queries++;
      return { rows: [{ server_version_num: version }] };
    } }, ...expected);
    return result.finally(() => assert.equal(queries, 1, 'always probe the actual server exactly once'));
  };
  const original = process.env.EXPECTED_PG_MAJOR;
  try {
    delete process.env.EXPECTED_PG_MAJOR;
    for (const version of ['150000', '150019', '159999', '170000', '170011', '179999']) {
      const major = Math.floor(Number(version) / 10000);
      assert.equal(await probe(version), major);
      assert.equal(await probe(version, String(major)), major);
    }
    for (const version of ['140019', '160000', '180000', '999999']) {
      await assert.rejects(probe(version), /outside the declared test matrix/);
      await assert.rejects(probe(version, String(Math.floor(Number(version) / 10000))), /outside the declared test matrix/);
    }
    for (const version of [undefined, null, '', 150019, '150019.0', ' 150019', '150019junk', 'NaN', 'Infinity']) {
      await assert.rejects(probe(version), /Invalid PostgreSQL server_version_num probe/);
    }
    for (const expected of ['', '16', '18', '015', '15.0', ' 15', '15 ', '1.5e1', 'DO_NOT_PRINT']) {
      await assert.rejects(probe('150019', expected), /^Error: PostgreSQL major does not match EXPECTED_PG_MAJOR$/);
    }
    for (const expected of ['15', '17']) {
      process.env.EXPECTED_PG_MAJOR = expected;
      assert.equal(await probe(`${expected}0019`), Number(expected));
      await assert.rejects(probe(expected === '15' ? '170011' : '150019'), /does not match EXPECTED_PG_MAJOR/);
    }
    process.env.EXPECTED_PG_MAJOR = '';
    await assert.rejects(probe('150019'), /does not match EXPECTED_PG_MAJOR/);
    await assert.rejects(assertSupportedPostgres({ query: async () => ({ rows: [] }) }), /Invalid PostgreSQL server_version_num probe/);
    const failure = new Error('synthetic probe failure');
    await assert.rejects(assertSupportedPostgres({ query: async () => { throw failure; } }), error => error === failure);
  } finally {
    if (original === undefined) delete process.env.EXPECTED_PG_MAJOR;
    else process.env.EXPECTED_PG_MAJOR = original;
  }
});
