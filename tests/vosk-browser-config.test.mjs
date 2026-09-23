import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lstat, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { settings, selectModel, root } from './vosk-browser-settings.mjs';
import { assertFreshEvidenceDirectory, captureFrame, writeEvidence } from './vosk-browser-evidence.mjs';

const approval = { VOSK_LOCAL_QA: 'medapp-vosk-local:55440' };
test('accepts only the two approved loopback origins', () => {
  for (const origin of ['http://localhost:5173', 'http://127.0.0.1:5173']) assert.equal(settings({ ...approval, VOSK_QA_ORIGIN: origin }).origin, origin);
});
for (const origin of ['', 'https://example.invalid', 'http://localhost:5001', 'http://localhost:5173/',
  'http://localhost:5173@remote.invalid', 'http://user:secret@localhost:5173', 'http://localhost:5173?x=1',
  'http://localhost:5173#x', 'http://localhost:5173/api', 'http://localhost.evil:5173', 'http://0.0.0.0:5173']) {
  test(`rejects unsafe origin form ${['', 'https://example.invalid'].includes(origin) ? 'empty/external' : 'noncanonical'} ${origin.length}`, () => {
    assert.throws(() => settings({ ...approval, VOSK_QA_ORIGIN: origin }), /Only approved loopback/);
  });
}
test('requires exact project opt-in and strict screenshot flag', () => {
  for (const value of [undefined, '', 'true', 'medapp-vosk-local:5432']) assert.throws(() => settings({ VOSK_LOCAL_QA: value }));
  for (const value of ['', '1', 'TRUE', 'yes']) assert.throws(() => settings({ ...approval, VOSK_CAPTURE_SCREENSHOTS: value }));
  assert.equal(settings(approval).capture, false);
});
test('manifest selector rejects retired version and checksum drift', async () => {
  const manifest = JSON.parse(await readFile(new URL('../frontend/public/models/manifest.json', import.meta.url), 'utf8'));
  assert.equal(selectModel(manifest), manifest.assetUrl);
  for (const change of [{ packagingVersion: 'browser-v1' }, { assetUrl: '/models/old.tar.gz' }, { assetBytes: 1 }, { assetSha256: '0'.repeat(64) }]) {
    assert.throws(() => selectModel({ ...manifest, ...change }));
  }
});

test('only new exact env opt-in enables capture; explicit API boolean has full control', () => {
  assert.equal(settings({ ...approval, VOSK_QA_CAPTURE: 'true' }).capture, false);
  assert.equal(settings({ ...approval, VOSK_CAPTURE_SCREENSHOTS: 'false' }).capture, false);
  assert.equal(settings({ ...approval, VOSK_CAPTURE_SCREENSHOTS: 'true' }).capture, true);
  assert.equal(settings({ ...approval, VOSK_CAPTURE_SCREENSHOTS: 'true' }, { capture: false }).capture, false);
  assert.equal(settings({ ...approval, VOSK_CAPTURE_SCREENSHOTS: 'false' }, { capture: true }).capture, true);
  assert.throws(() => settings(approval, { capture: 'true' }));
});

test('evidence path is explicit and restricted; error messages do not echo rejected values', () => {
  const selected = 'docs/verification/screenshots/vosk-20260922-final';
  assert.equal(settings({ ...approval, VOSK_EVIDENCE_DIR: selected }).output, resolve(root, selected));
  for (const value of ['', '/', root, 'docs/verification/screenshots', 'frontend/public/new',
    'test-results/vosk-browser/../old', '/etc/proof', 'https://secret.invalid/proof', '/tmp/a\\b', '/tmp/a\nsecret']) {
    assert.throws(() => settings({ ...approval, VOSK_EVIDENCE_DIR: value }), { message: 'Unsafe evidence directory' });
  }
  const first = settings(approval, { capture: true }), second = settings(approval, { capture: true });
  assert.notEqual(first.output, second.output);
});

test('capture false makes no screenshot, mkdir, writeFile or evidence inspection calls', async () => {
  let assertions = 0, calls = 0;
  const fail = () => { calls++; throw new Error('Unexpected write/capture'); };
  const page = { locator: () => ({ evaluateAll: async () => false }), screenshot: fail, evaluate: fail };
  assert.equal(await captureFrame({ capture: false, page, assertion: async () => { assertions++; } }), null);
  assert.equal(await writeEvidence({ capture: false }, new Proxy({}, { get: fail })), null);
  assert.equal(assertions, 1); assert.equal(calls, 0);
});

test('failed screenshot assertion never calls capture', async () => {
  let calls = 0;
  await assert.rejects(captureFrame({ capture: true, page: { screenshot: () => { calls++; } },
    assertion: async () => { throw new Error('State not verified'); } }), /State not verified/);
  assert.equal(calls, 0);
});

async function temporary(t) {
  const directory = await mkdtemp(join(tmpdir(), 'medapp-vosk-guard-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
function passingReport() {
  return { started: '2026-09-22T00:00:00.000Z', passed: true, cases: Array.from({ length: 9 }, () => ({ passed: true })) };
}
function testFrames() {
  // Writer contract only, not clinical/browser proof or genuine PNGs.
  return [1, 2, 3].map(n => ({ path: `vosk-0${n}-unit.png`, bytes: Buffer.from('synthetic writer unit'),
    sha256: createHash('sha256').update('synthetic writer unit').digest('hex'), at: '2026-09-22T00:00:00.000Z', caption: 'UNIT ONLY' }));
}
test('fresh capture writes actual hashes and timestamped receipt; preview and repeated capture preserve bytes', async t => {
  const directory = await temporary(t), output = join(directory, 'fresh');
  const report = passingReport();
  await writeEvidence({ capture: true, output, report, frames: testFrames() });
  const names = await readdir(output), before = await Promise.all(names.map(name => readFile(join(output, name))));
  assert.equal(names.length, 4);
  assert.ok(names.includes('receipt-2026-09-22T00-00-00.000Z.json'));
  const persisted = JSON.parse(await readFile(join(output, report.receipt)));
  for (const frame of persisted.screenshots) assert.equal(createHash('sha256').update(await readFile(join(output, frame.path))).digest('hex'), frame.sha256);
  await writeEvidence({ capture: false, output, report: passingReport(), frames: testFrames() });
  await assert.rejects(writeEvidence({ capture: true, output, report: passingReport(), frames: testFrames() }), /must be fresh/);
  assert.deepEqual(await Promise.all(names.map(name => readFile(join(output, name)))), before);
});

test('failed or incomplete run publishes no evidence even when capture was requested', async t => {
  const directory = await temporary(t), output = join(directory, 'failed');
  for (const report of [{ ...passingReport(), passed: false }, { ...passingReport(), cases: [] }]) {
    await assert.rejects(writeEvidence({ capture: true, output, report, frames: testFrames() }));
  }
  await assert.rejects(lstat(output), { code: 'ENOENT' });
});

test('existing files/directories and symlink parents cannot be capture targets', async t => {
  const directory = await temporary(t);
  const existing = join(directory, 'existing.json'); await writeFile(existing, 'original');
  await symlink(directory, join(directory, 'alias'));
  for (const output of [directory, existing, join(directory, 'alias'), join(directory, 'alias', 'new')]) {
    await assert.rejects(assertFreshEvidenceDirectory(output));
  }
  assert.equal(await readFile(existing, 'utf8'), 'original');
});

test('real Playwright worker receives capture/output metadata; its cleanup cannot touch evidence', async t => {
  const directory = await temporary(t), output = join(directory, 'selected-proof');
  const spec = join(directory, 'propagation.spec.mjs'), config = join(directory, 'config.mjs');
  const playwright = pathToFileURL(resolve(root, 'node_modules/@playwright/test/index.mjs')).href;
  const settingsUrl = new URL('./vosk-browser-settings.mjs', import.meta.url).href;
  await writeFile(spec, `import { test, expect } from ${JSON.stringify(playwright)};
import { settings } from ${JSON.stringify(settingsUrl)};
test('serialized options survive actual worker boundary', async ({}, info) => {
 const qa = info.config.metadata.voskQa;
 expect(qa.capture).toBe(true);
 expect(qa.output).toBe(${JSON.stringify(output)});
 expect(settings(process.env, {capture:qa.capture, evidenceDir:qa.output, origin:qa.origin})).toEqual(qa);
 expect(info.project.outputDir.startsWith(qa.output)).toBe(false);
 expect(info.project.use.screenshot).toBe('off');
 expect(info.project.use.trace).toBe('off'); expect(info.project.use.video).toBe('off');
});`);
  await writeFile(config, `import base from ${JSON.stringify(new URL('./vosk-browser.config.mjs', import.meta.url).href)};
export default {...base, testDir:${JSON.stringify(directory)}, testMatch:'propagation.spec.mjs'};`);
  const env = { ...process.env, ...approval, VOSK_CAPTURE_SCREENSHOTS: 'true', VOSK_EVIDENCE_DIR: output,
    PATH: dirname(process.execPath) + ':' + process.env.PATH };
  const result = spawnSync(process.execPath, [resolve(root, 'node_modules/@playwright/test/cli.js'), 'test', '--config', config],
    { env, cwd: root, encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, 'Worker propagation guard failed (raw output withheld)');
  await assert.rejects(lstat(output), { code: 'ENOENT' });
});

test('CLIs reject retired --capture and destructive Playwright output overrides before work', async t => {
  const result = spawnSync(process.execPath, [resolve(root, 'tests/vosk-browser-qa.mjs'), '--capture'],
    { env: { ...process.env, ...approval }, encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr.trim(), 'V3 configuration/evidence failure; no raw diagnostic output.');
  const directory = await temporary(t), receipt = join(directory, 'previous-receipt.json');
  await writeFile(receipt, 'previous evidence');
  for (const args of [['--output', directory], [`--output=${directory}`]]) {
    const rejected = spawnSync(process.execPath, [resolve(root, 'node_modules/@playwright/test/cli.js'),
      'test', '--config', resolve(root, 'tests/vosk-browser.config.mjs'), ...args],
    { env: { ...process.env, ...approval }, encoding: 'utf8', timeout: 10000 });
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /Playwright output override disabled/);
    assert.equal(await readFile(receipt, 'utf8'), 'previous evidence');
  }
});

