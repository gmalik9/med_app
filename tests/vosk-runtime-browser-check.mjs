// V1 runtime regression ONLY, against the already-running isolated nginx image.
// Real served worker/WASM; no UI/DB changes, auth, physical mic or external API.
// Negative control substitutes ONLY historical archive bytes, never engine code.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { generateSyntheticAudio } from './fixtures/vosk-synthetic-audio.mjs';

assert.equal(process.env.VOSK_LOCAL_QA, 'medapp-vosk-local:55440');
assert.equal(Number(process.versions.node.split('.')[0]), 22);
const origin = 'http://localhost:5173';
const manifest = JSON.parse(await readFile(new URL('../frontend/public/models/manifest.json', import.meta.url), 'utf8'));
const model = manifest.assetUrl;
const workerUrl = '/vosk/vosk-browser-0.0.8.worker.js';
const oldUrl = '/models/vosk-model-small-en-in-0.4.tar.gz';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const report = { started: new Date().toISOString(), node: process.version, model, cases: [] };
const deadline = setTimeout(() => { console.error('V1 real-runtime probe exceeded 180 seconds'); process.exit(1); }, 180_000);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
report.browser = browser.version();
const fixtureDirectory = await mkdtemp(join(tmpdir(), 'medapp-vosk-v1-negative-'));

async function cacheKeys(page) {
  return page.evaluate(async () => {
    const result = [];
    for (const { name } of await indexedDB.databases()) {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(new Error('IDB open failed'));
      });
      for (const store of db.objectStoreNames) {
        const keys = await new Promise((resolve, reject) => {
          const request = db.transaction(store).objectStore(store).getAllKeys();
          request.onsuccess = () => resolve(request.result); request.onerror = () => reject(new Error('IDB keys failed'));
        });
        result.push({ name, store, keys });
      }
      db.close();
    }
    return result;
  });
}

async function createContext() {
  // New browser storage partition = nonce cache isolation, not a query variant
  // (production fetch correctly rejects query/fragment variants).
  const nonce = randomUUID();
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const counts = { model: 0, external: 0, writes: 0, pageErrors: 0, consoleErrors: 0 };
  context.on('request', request => {
    if (new URL(request.url()).origin !== origin) counts.external++;
    if (request.url() === origin + model) counts.model++;
    if (!['GET', 'HEAD'].includes(request.method())) counts.writes++;
  });
  const page = await context.newPage();
  page.on('pageerror', () => counts.pageErrors++);
  page.on('console', message => { if (['warning', 'error'].includes(message.type())) counts.consoleErrors++; });
  await page.goto(origin);
  assert.deepEqual(await cacheKeys(page), []);
  return { nonce, context, page, counts };
}

async function start(page, bridge) {
  const waiting = page.waitForEvent('worker', { timeout: 10_000 });
  await page.evaluate(({ workerUrl, bridge }) => {
    window.__v1events = [];
    window.__v1worker = new Worker(workerUrl);
    window.__v1worker.onmessage = ({ data }) => window.__v1events.push(data);
    if (bridge) window.__v1worker.postMessage({ action: 'init', sampleRate: 48000 });
  }, { workerUrl, bridge });
  const worker = await waiting;
  if (bridge) {
    await page.waitForFunction(() => window.__v1events.some(e => ['ready', 'error'].includes(e.event)), null, { timeout: 120_000 });
    assert.deepEqual(await page.evaluate(() => window.__v1events), [{ event: 'ready' }]);
  }
  return worker;
}

async function inspect(worker) {
  // Actual Emscripten FS, without chmod/ignorePermissions/error suppression.
  return JSON.parse(await worker.evaluate(async () => {
    const fs = runtime.Vosk.FS;
    const entries = [];
    async function walk(path) {
      // IDB restore inserts entries in key order, unlike tar extraction order.
      // Compare full path/mode/byte/hash inventories, not readdir insertion order.
      for (const name of fs.readdir(path).filter(name => !['.', '..'].includes(name)).sort()) {
        const child = path + '/' + name;
        const stat = fs.stat(child);
        const directory = fs.isDir(stat.mode);
        const item = { path: child, mode: stat.mode.toString(8), bytes: stat.size, directory };
        if (!directory) {
          const hash = await crypto.subtle.digest('SHA-256', fs.readFile(child));
          item.sha256 = Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('');
        }
        entries.push(item);
        if (directory) await walk(child);
      }
    }
    await walk('/vosk');
    return JSON.stringify({ wasmLoaded: Boolean(runtime.Vosk), modelCreated: Boolean(runtime.model),
      permissionsEnforced: !fs.ignorePermissions, entries });
  }));
}

try {
  // Verify actual deployed assets, not merely host outputs or source regexes.
  for (const path of ['/', model, workerUrl, oldUrl, '/models/missing.tar.gz']) {
    const response = await fetch(origin + path);
    const missing = [oldUrl, '/models/missing.tar.gz'].includes(path);
    assert.equal(response.status, missing ? 404 : 200);
    const csp = response.headers.get('content-security-policy');
    assert.equal(csp.includes("'unsafe-eval'"), path === workerUrl);
    assert.ok(csp.includes("worker-src 'self'")); assert.ok(csp.includes("connect-src 'self'"));
    assert.equal(response.headers.get('cache-control'), path === model ? 'public, max-age=31536000, immutable' : 'no-store');
    if (path === model) {
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(bytes.length, manifest.assetBytes); assert.equal(sha(bytes), manifest.assetSha256);
    }
    if (path === workerUrl) {
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(sha(bytes), sha(await readFile(new URL('../frontend/public' + workerUrl, import.meta.url))));
      report.worker = { url: workerUrl, bytes: bytes.length, sha256: sha(bytes) };
    }
  }
  const range = await fetch(origin + model, { headers: { Range: 'bytes=0-1' } });
  assert.equal(range.status, 206);
  assert.equal(range.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal(Buffer.from(await range.arrayBuffer()).toString('hex'), '1f8b');
  const head = await fetch(origin + model, { method: 'HEAD' });
  const unchanged = await fetch(origin + model, { headers: { 'If-None-Match': head.headers.get('etag') } });
  assert.equal(unchanged.status, 304);
  assert.equal(unchanged.headers.get('cache-control'), 'public, max-age=31536000, immutable');

  const expectedRun = spawnSync('python3', ['-B', '-c', `
import gzip,hashlib,json,pathlib,sys,tarfile,zipfile
m=json.loads(pathlib.Path('frontend/public/models/manifest.json').read_text())
source=pathlib.Path('.cache/vosk/'+m['name']+'.zip')
assert source.stat().st_size==m['sourceBytes']
assert hashlib.sha256(source.read_bytes()).hexdigest()==m['sourceSha256']
with zipfile.ZipFile(source) as z:
 # Reproduce v1 exactly in a private test temp directory, NEVER the retired URL.
 with open(sys.argv[1],'wb') as output:
  with gzip.GzipFile(filename='',mode='wb',fileobj=output,mtime=0,compresslevel=9) as gz:
   with tarfile.open(fileobj=gz,mode='w|',format=tarfile.USTAR_FORMAT) as tar:
    for member in sorted(z.infolist(),key=lambda i:i.filename):
     if member.is_dir(): continue
     info=tarfile.TarInfo('model/'+member.filename.split('/',1)[1])
     info.size=member.file_size; info.mode=0o644; info.mtime=0
     with z.open(member) as data: tar.addfile(info,data)
 print(json.dumps({i.filename.split('/',1)[1]:{'bytes':i.file_size,'sha256':hashlib.sha256(z.read(i)).hexdigest()} for i in z.infolist() if not i.is_dir()}))
`, join(fixtureDirectory, 'v1.tar.gz')], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(expectedRun.status, 0, expectedRun.stderr);
  const expected = JSON.parse(expectedRun.stdout);
  assert.equal(Object.keys(expected).length, 14);

  const positive = await createContext();
  const coldAt = performance.now();
  const coldWorker = await start(positive.page, true);
  const cold = await inspect(coldWorker);
  assert.equal(cold.wasmLoaded, true); assert.equal(cold.modelCreated, true); assert.equal(cold.permissionsEnforced, true);
  const base = '/vosk/' + model.replace(/[\W]/g, '_');
  const directories = cold.entries.filter(e => e.directory);
  assert.equal(directories.length, 6);
  assert.ok(directories.every(e => e.mode === '40755'));
  const files = cold.entries.filter(e => !e.directory && !e.path.endsWith('/extracted.ok'));
  assert.equal(files.length, 14);
  for (const file of files) {
    assert.equal(file.mode, '100644');
    assert.deepEqual({ bytes: file.bytes, sha256: file.sha256 }, expected[file.path.slice(base.length + 1)]);
  }
  assert.equal(positive.counts.model, 1);
  report.cases.push({ name: 'cold real bridge ready + all 14 source hashes', nonce: positive.nonce,
    ms: Math.round(performance.now() - coldAt), ...cold });

  // V3-owned OFFLINE synthetic WAV generator; feed its PCM to the actual bridge.
  // No fake recognizer/results, no physical mic, no clinical text or network audio.
  const audio = await generateSyntheticAudio();
  const wav = await readFile(audio.path);
  assert.equal(wav.toString('ascii', 36, 40), 'data');
  assert.equal(sha(wav), audio.sha256);
  report.audio = audio;
  const frames = [];
  for (let offset = 44; offset < wav.length; offset += 2) frames.push(wav.readInt16LE(offset));
  // Await each real engine reply to keep the diagnostic bounded, not a backlog.
  for (let offset = 0; offset < frames.length; offset += 24_000) {
    await positive.page.evaluate(data => {
      window.__v1events = [];
      const samples = new Float32Array(data);
      window.__v1worker.postMessage({ action: 'audioChunk', data: samples }, [samples.buffer]);
    }, frames.slice(offset, offset + 24_000));
    await positive.page.waitForFunction(() => window.__v1events.length > 0, null, { timeout: 15_000 });
    const events = await positive.page.evaluate(() => window.__v1events);
    assert.ok(events.every(e => ['result', 'partialresult'].includes(e.event)));
    for (const e of events) {
      if (e.event === 'result' && e.result.text) (report.syntheticFinals ??= []).push(e.result.text);
      if (e.event === 'partialresult' && e.result.partial) report.syntheticPartialObserved = true;
    }
  }
  await positive.page.evaluate(() => {
    window.__v1events = []; window.__v1worker.postMessage({ action: 'retrieveFinalResult', flushId: 1 });
  });
  await positive.page.waitForFunction(() => window.__v1events.some(e => e.flushId === 1 || e.event === 'error'), null, { timeout: 15_000 });
  const final = await positive.page.evaluate(() => window.__v1events.at(-1));
  assert.equal(final.event, 'result'); assert.equal(final.flushId, 1);
  if (final.result.text) (report.syntheticFinals ??= []).push(final.result.text);
  assert.equal(report.syntheticFinals.join(' '), audio.phrase);
  assert.equal(report.syntheticPartialObserved, true);
  report.cases.push({ name: 'real synthetic speech + tagged FinalResult', transcript: report.syntheticFinals.join(' ') });

  const keys = await cacheKeys(positive.page);
  assert.equal(keys.length, 1); assert.equal(keys[0].name, '/vosk');
  assert.equal(keys[0].keys.length, 21);
  assert.ok(keys[0].keys.every(path => path === base || path.startsWith(base + '/')));
  report.cache = keys;
  await positive.page.evaluate(() => window.__v1worker.terminate());
  const warmAt = performance.now();
  const warmWorker = await start(positive.page, true);
  assert.deepEqual(await inspect(warmWorker), cold);
  assert.equal(positive.counts.model, 1, 'Warm worker uses IDB; no second HTTP fetch');
  report.cases.push({ name: 'warm IDB real bridge ready', ms: Math.round(performance.now() - warmAt), counts: positive.counts });
  for (const key of ['external', 'writes', 'pageErrors', 'consoleErrors']) assert.equal(positive.counts[key], 0);
  await positive.context.close();

  // Fail the OLD archive through the SAME NEW worker/URL under another empty
  // storage partition. This rules out cached success hiding the FS exception.
  const historical = await readFile(join(fixtureDirectory, 'v1.tar.gz'));
  assert.equal(sha(historical), 'bec97982c2e1013a1d915d5a98b830f6ca24456b92849128b9245e3958bfbd10');
  const negative = await createContext();
  await negative.context.route(origin + model, route => route.fulfill({ status: 200,
    contentType: 'application/gzip', headers: { 'cache-control': 'no-store' }, body: historical }));
  const badWorker = await start(negative.page, false);
  const failure = JSON.parse(await badWorker.evaluate(async url => {
    let error;
    try { await runtime.load(url); } catch (caught) { error = String(caught); }
    const root = '/vosk/' + url.replace(/[\W]/g, '_');
    let descendantErrno;
    try { runtime.Vosk.FS.stat(root + '/am/final.mdl'); } catch (caught) { descendantErrno = caught.errno; }
    return JSON.stringify({ error, wasmLoaded: Boolean(runtime.Vosk), modelCreated: Boolean(runtime.model),
      permissionsEnforced: !runtime.Vosk.FS.ignorePermissions,
      amMode: runtime.Vosk.FS.stat(root + '/am').mode.toString(8), descendantErrno });
  }, model));
  assert.equal(failure.error, 'Failed to sync file system: Error: FS error');
  assert.equal(failure.wasmLoaded, true); assert.equal(failure.modelCreated, false);
  assert.equal(failure.permissionsEnforced, true); assert.equal(failure.amMode, '40000');
  assert.equal(failure.descendantErrno, 2);
  const failedKeys = await cacheKeys(negative.page);
  assert.ok(failedKeys.every(db => db.keys.length === 0), 'Failed extraction must not be a warm model cache');
  report.cases.push({ name: 'historical archive cold-cache failure control', nonce: negative.nonce, ...failure, cache: failedKeys });
  await negative.page.evaluate(() => window.__v1worker.terminate());
  await negative.context.unroute(origin + model);
  const recoveryWorker = await start(negative.page, true);
  assert.deepEqual(await inspect(recoveryWorker), cold);
  report.cases.push({ name: 'fresh worker recovers with v2 after old archive failure', counts: negative.counts });
  for (const key of ['external', 'writes', 'pageErrors', 'consoleErrors']) assert.equal(negative.counts[key], 0);
  await negative.context.close();
  report.outcome = 'PASS';
} catch (error) {
  report.outcome = 'FAIL';
  // This isolated test handles public model metadata and synthetic audio ONLY.
  report.error = String(error).slice(0, 1200);
  throw error;
} finally {
  report.finished = new Date().toISOString();
  await browser.close(); clearTimeout(deadline);
  await rm(fixtureDirectory, { recursive: true, force: true });
  await mkdir('test-results/vosk-browser', { recursive: true });
  await writeFile(`test-results/vosk-browser/v1-runtime-${report.started.replaceAll(':', '-')}.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ outcome: report.outcome, cases: report.cases.map(c => c.name), model, worker: report.worker, error: report.error }, null, 2));
}
