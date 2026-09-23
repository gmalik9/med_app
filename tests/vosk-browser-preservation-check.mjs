// Explicit maintenance check: default -> fresh capture -> default, real app.
// No service lifecycle, SQL, source edits, secret files or raw child output.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { settings, root } from './vosk-browser-settings.mjs';
import { assertFreshEvidenceDirectory } from './vosk-browser-evidence.mjs';

const qa = settings(process.env, { capture: true });
assert.ok(process.env.VOSK_EVIDENCE_DIR, 'Explicit fresh capture destination required');
assert.ok(process.env.VOSK_PRESERVATION_DIR, 'Explicit private check-result directory required');
const results = settings(process.env, { capture: true, evidenceDir: process.env.VOSK_PRESERVATION_DIR }).output;
await assertFreshEvidenceDirectory(qa.output);
await assertFreshEvidenceDirectory(results);
assert.equal(Number(process.versions.node.split('.')[0]), 22);
await mkdir(results, { mode: 0o700 });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function snapshot() {
  const hashes = {};
  async function walk(path) {
    for (const entry of await readdir(resolve(root, path), { withFileTypes: true })) {
      const child = `${path}/${entry.name}`;
      if (entry.isDirectory()) await walk(child);
      else if (entry.isFile()) hashes[child] = digest(await readFile(resolve(root, child)));
    }
  }
  for (const path of ['docs/verification', 'frontend/src', 'backend/src', 'frontend/public', 'tools', 'test-results/vosk-browser']) await walk(path);
  for (const path of ['docs/VOSK_DICTATION.md', 'package.json', 'package-lock.json', 'frontend/package.json',
    'backend/package.json', 'frontend/Dockerfile', 'backend/Dockerfile', 'frontend/nginx.conf',
    'docker-compose.yml', 'tests/fixtures/vosk-synthetic-audio.mjs']) hashes[path] = digest(await readFile(resolve(root, path)));
  return hashes;
}
const baseline = await snapshot();
await writeFile(resolve(results, 'protected-before.json'), JSON.stringify(baseline, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
const checks = [];
async function run(capture, label) {
  const env = { ...process.env, PATH: dirname(process.execPath) + ':' + process.env.PATH };
  delete env.VOSK_CAPTURE_SCREENSHOTS; delete env.VOSK_QA_CAPTURE; delete env.VOSK_EVIDENCE_DIR;
  if (capture) { env.VOSK_CAPTURE_SCREENSHOTS = 'true'; env.VOSK_EVIDENCE_DIR = qa.output; }
  const child = spawnSync(process.execPath, [resolve(root, 'node_modules/@playwright/test/cli.js'),
    'test', '--config', resolve(root, 'tests/vosk-browser.config.mjs')],
  { env, cwd: root, encoding: 'utf8', timeout: 390000, maxBuffer: 2e6 });
  // stdout is already restricted to constant stage names/counts by the harness.
  // Do not persist arbitrary stderr, browser exception values or failed logs.
  assert.equal(child.status, 0, 'Browser preservation gate failed; child output withheld');
  const stdout = child.stdout.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
  const serialized = stdout.match(/\{\n  "passed": (?:true|false),[\s\S]*?\n\}/g);
  assert.equal(serialized?.length, 1, 'Expected one count-only browser summary');
  const summary = JSON.parse(serialized[0]);
  assert.equal(summary.passed, true); assert.equal(summary.cases.length, 9);
  assert.ok(summary.cases.every(result => result.passed));
  assert.equal(summary.capture, capture); assert.equal(summary.screenshotCount, capture ? 3 : 0);
  assert.equal(summary.receiptWritten, capture);
  checks.push({ label, ...summary });
  console.log(JSON.stringify({ label, passed: true, scenarios: 9, screenshots: summary.screenshotCount, receiptWritten: summary.receiptWritten }));
}
await run(false, 'default-before');
assert.deepEqual(await snapshot(), baseline, 'Default run changed protected evidence or manifests');
await run(true, 'explicit-fresh-capture');
const captured = await snapshot();
for (const [path, hash] of Object.entries(baseline)) assert.equal(captured[path], hash, 'Capture modified existing protected file');
const receiptNames = (await readdir(qa.output)).filter(name => /^receipt-.*\.json$/.test(name));
assert.equal(receiptNames.length, 1);
assert.equal((await readdir(qa.output)).length, 4);
const receiptPath = resolve(qa.output, receiptNames[0]), receiptBytes = await readFile(receiptPath), receipt = JSON.parse(receiptBytes);
assert.equal(receipt.evidenceDirectory, qa.output); assert.equal(receipt.passed, true);
assert.equal(receipt.cases.length, 9); assert.equal(receipt.screenshots.length, 3);
const freshHashes = { [receiptNames[0]]: digest(receiptBytes) };
for (const shot of receipt.screenshots) {
  freshHashes[shot.path] = digest(await readFile(resolve(qa.output, shot.path)));
  assert.equal(freshHashes[shot.path], shot.sha256);
}
await run(false, 'default-after');
assert.deepEqual(await snapshot(), captured, 'Default repeat changed protected or fresh evidence');
for (const [path, hash] of Object.entries(freshHashes)) assert.equal(digest(await readFile(resolve(qa.output, path))), hash);
const report = { completed: new Date().toISOString(), node: process.version, passed: true,
  protectedFiles: Object.keys(baseline).length, checks, freshEvidence: relative(root, qa.output), freshHashes,
  receipt: relative(root, receiptPath), allExistingFilesUnchanged: true, defaultSnapshotsWritten: false };
await writeFile(resolve(results, 'preservation.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ passed: true, browserRuns: 3, scenariosPerRun: 9, protectedFiles: report.protectedFiles, freshHashes }, null, 2));
