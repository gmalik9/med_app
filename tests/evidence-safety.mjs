import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { requireAuditDatabase } from './audit-database.cjs';

// Implementer self-check, NOT the independently assigned evaluator.
// No file writes. The child runs non-opt-in by default; --capture explicitly
// requests the same eight PNGs/manifest. Catalog access is read-only metadata.
const root = resolve(import.meta.dirname, '..');
const expected = requireAuditDatabase();

assert.equal(process.env.TEST_DATABASE_URL === expected, true, 'Exact synthetic DB opt-in required');
assert.equal(process.argv.slice(2).every(arg => arg === '--capture'), true, 'Only --capture is supported');
const capture = process.argv.includes('--capture');
assert.equal(!capture || process.env.EVIDENCE_SCREENSHOTS === 'true', true, '--capture requires EVIDENCE_SCREENSHOTS=true');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function files(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? files(join(path, entry.name)) : [join(path, entry.name)]);
}
function fingerprint(paths) {
  return sha(JSON.stringify(paths.sort().map(path => [path, sha(readFileSync(path))])));
}
const protectedFiles = ['backend/src', 'frontend/src', 'backend/dist', 'frontend/dist', 'backend/tests', 'frontend/tests']
  .flatMap(path => files(join(root, path)))
  .concat(['package.json', 'package-lock.json', 'backend/package.json', 'frontend/package.json', 'frontend/vite.config.ts'].map(path => join(root, path)));
const artifacts = [join(root, 'docs/verification/browser-evidence.md'), ...files(join(root, 'docs/verification/screenshots'))];
const protectedBefore = fingerprint(protectedFiles);
const artifactsBefore = fingerprint(artifacts);
const invalid = ['', `${expected}?options=-csearch_path=public`, `${expected}#fragment`, expected.replace(':55439', ':5432'), expected.replace('/medapp_audit', '/not_the_audit_db'), expected.replace('audit:', 'other:'), expected.replace('127.0.0.1', 'localhost')];
for (const url of invalid) {
  const result = spawnSync(process.execPath, ['tests/start-test-server.mjs'], {
    cwd: root, env: { ...process.env, TEST_DATABASE_URL: url }, encoding: 'utf8', timeout: 10000,
  });
  assert.equal(result.status, 1, 'Unsafe startup must fail before connecting');
  assert.equal(result.stderr.includes('E2E requires the exact approved loopback synthetic audit database'), true, 'Expected guard refusal');
}
console.log(`SYNTHETIC safety: ${invalid.length} unsafe-input startup refusals passed (no connection).`);
const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { Pool } = require('pg');
const pool = new Pool({ connectionString: expected });
async function catalog() {
  return (await pool.query('SELECT nspname FROM pg_namespace ORDER BY nspname')).rows.map(row => row.nspname);
}
try {
  const before = await catalog();
  const result = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test'], {
    cwd: root, env: { ...process.env, EVIDENCE_SCREENSHOTS: capture ? 'true' : 'false' }, stdio: 'inherit', timeout: 600000,
  });
  const after = await catalog();
  assert.equal(JSON.stringify(after) === JSON.stringify(before), true, 'Harness must remove only its own schema and preserve the prior catalog');
  assert.equal(fingerprint(protectedFiles) === protectedBefore, true, 'Runtime, built output, other-track tests and manifests unchanged');
  if (!capture) assert.equal(fingerprint(artifacts) === artifactsBefore, true, 'Non-opt-in run must preserve all evidence bytes');
  assert.equal(result.status, 0, 'All browser cases must pass');
  const manifest = readFileSync(join(root, 'docs/verification/browser-evidence.md'), 'utf8');
  const shots = [...manifest.matchAll(/!\[[^\]]+\]\(screenshots\/([^/]+\.png)\)[\s\S]*?PNG SHA-256: ([a-f0-9]{64})/g)];
  assert.equal(shots.length, 8, 'Exactly eight asserted screenshots expected');
  for (const [, name, digest] of shots) {
    const bytes = readFileSync(join(root, 'docs/verification/screenshots', name));
    assert.equal(sha(bytes), digest, 'Manifest PNG hash matches');
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'PNG signature');
    assert.equal(bytes.readUInt32BE(16), 1440, 'Expected evidence width');
    assert.equal(bytes.readUInt32BE(20), 1100, 'Expected evidence height');
  }
  assert.equal(/eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|Bearer\s+[A-Za-z0-9_-]{12,}/.test(manifest), false, 'No credential-shaped values in manifest');
  console.log(`SYNTHETIC safety PASS: schema catalog unchanged; ${protectedFiles.length} protected files unchanged; eight PNG hashes/dimensions valid; ${capture ? 'opt-in evidence regenerated' : 'evidence bytes unchanged without opt-in'}.`);
} finally { await pool.end(); }
