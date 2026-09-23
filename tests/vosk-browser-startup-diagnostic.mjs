// Diagnostic ONLY after the real app gate fails. Native worker, unchanged served
// bytes/CSP; no auth, patient data, audio, fake recognition or application edits.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { settings, selectModel, worker as workerUrl } from './vosk-browser-settings.mjs';

const { origin, output } = settings();
assert.equal(Number(process.versions.node.split('.')[0]), 22);
const response = await fetch(origin + '/models/manifest.json', { redirect: 'error', signal: AbortSignal.timeout(15000) });
assert.equal(response.status, 200);
const modelUrl = selectModel(await response.json());
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.goto(origin);
  const pending = page.waitForEvent('worker');
  await page.evaluate(url => { window.__diagnosticWorker = new Worker(url); }, workerUrl);
  const worker = await pending;
  const serialized = await worker.evaluate(async modelUrl => {
    let stage = 'original runtime.load';
    let exception;
    try {
      // Access through DevTools evaluation, NOT rewritten worker code. The exact
      // original methods used by the generated bridge run against the real model.
      let timer;
      try {
        await Promise.race([runtime.load(modelUrl), new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('Diagnostic startup deadline')), 120000);
        })]);
      } finally { clearTimeout(timer); }
      stage = 'original runtime.createRecognizer';
      await runtime.createRecognizer({ recognizerId: 'diagnostic', sampleRate: 48000 });
      stage = 'ready';
    } catch (error) {
      // Initialization has never received audio, text, patient data or credentials.
      // Capture only fixed engine errors / model-file paths, not console streams.
      exception = { type: typeof error, name: String(error?.name ?? ''), message: String(error?.message ?? error).slice(0, 1200) };
    }
    const paths = [];
    function walk(path) {
      let names;
      try { names = runtime.Vosk.FS.readdir(path); }
      catch (error) { paths.push({ path, readdirError: Number(error.errno) }); return; }
      for (const name of names) {
        if (name === '.' || name === '..') continue;
        const child = `${path}/${name}`;
        const stat = runtime.Vosk.FS.stat(child);
        paths.push({ path: child, bytes: stat.size, mode: stat.mode.toString(8), directory: runtime.Vosk.FS.isDir(stat.mode) });
        if (runtime.Vosk.FS.isDir(stat.mode)) walk(child);
      }
    }
    try { if (runtime.Vosk) walk('/vosk'); } catch { paths.push({ inspectionFailed: true }); }
    return JSON.stringify({ stage, exception, wasmLoaded: Boolean(runtime.Vosk), modelCreated: Boolean(runtime.model), paths });
  }, modelUrl);
  const result = JSON.parse(serialized);
  result.modelUrl = modelUrl;
  const directory = output;
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, `startup-diagnostic-${new Date().toISOString().replaceAll(':', '-')}.json`), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  assert.equal(result.stage, 'ready');
  assert.equal(result.modelCreated, true);
} finally {
  await browser.close();
}
