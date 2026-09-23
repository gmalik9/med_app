// Standalone QA against the explicitly approved, already-running Docker app.
// No Vite server, shared E2E config, production credentials, real mic or cloud TTS.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { generateSyntheticAudio } from './fixtures/vosk-synthetic-audio.mjs';
import { settings, selectModel, worker, expectedWorkerSha, phrase } from './vosk-browser-settings.mjs';
import { observeNativeResources, resourceSnapshot } from './vosk-browser-observer.mjs';
import { assertFreshEvidenceDirectory, captureFrame, writeEvidence } from './vosk-browser-evidence.mjs';

export async function runQa(options = {}) {
const { origin, output, capture } = settings(process.env, options);
assert.equal(Number(process.versions.node.split('.')[0]), 22, 'Use Node 22');
if (capture) await assertFreshEvidenceDirectory(output);
let model;
const frames = [];
const report = { started: new Date().toISOString(), node: process.version, capture, cases: [], screenshots: [] };
let stage = 'preconditions';
let browser;
let activePage;
const deadline = setTimeout(() => { void browser?.close(); }, 330000);
deadline.unref();
const sha = value => createHash('sha256').update(value).digest('hex');

function observe(context) {
  const counts = { requests: 0, model: 0, worker: 0, worklet: 0, apiWrites: 0, audioUploads: 0,
    external: 0, unexpectedRequests: 0, pageErrors: 0, consoleErrors: 0, httpErrors: 0, failedRequests: 0,
    expectedHttpErrors: 0, expectedFailedRequests: 0, expectedConsoleErrors: 0 };
  const expectedModelFault = () => ['missing-model-manual-recovery', 'cancel-loading'].includes(stage);
  context.on('page', page => {
    page.on('pageerror', () => counts.pageErrors++);
    page.on('console', message => {
      if (!['warning', 'error'].includes(message.type())) return;
      if (expectedModelFault() && /Failed to load resource/.test(message.text())) counts.expectedConsoleErrors++;
      else counts.consoleErrors++;
    });
  });
  context.on('request', request => {
    counts.requests++;
    const url = new URL(request.url());
    if (url.origin !== origin) counts.external++;
    const path = url.pathname;
    if (path === model) counts.model++;
    if (path === worker) counts.worker++;
    if (/^\/assets\/dictationCapture\.worklet-.*\.js$/.test(path)) counts.worklet++;
    if (!['GET', 'HEAD'].includes(request.method())) {
      counts.apiWrites++;
      const type = request.headers()['content-type'] ?? '';
      if (/audio|octet-stream|multipart/i.test(type)) counts.audioUploads++;
      const allowed = ['/api/auth/login', '/api/auth/logout'].includes(path) || /^\/api\/notes\/patient\/VOSK-/.test(path);
      if (!allowed || !type.startsWith('application/json')) counts.unexpectedRequests++;
    } else if (!(path === '/' || path === '/favicon.ico' || path === '/vite.svg' || path.startsWith('/assets/') || path.startsWith('/api/') || path === model || path === worker)) {
      counts.unexpectedRequests++;
    }
  });
  context.on('response', response => {
    if (response.status() < 400) return;
    if (expectedModelFault() && new URL(response.url()).pathname === model && response.status() === 404) counts.expectedHttpErrors++;
    else counts.httpErrors++;
  });
  context.on('requestfailed', request => {
    if (expectedModelFault() && new URL(request.url()).pathname === model) counts.expectedFailedRequests++;
    else counts.failedRequests++;
  });
  return counts;
}
function clean(counts) {
  for (const key of ['audioUploads', 'external', 'unexpectedRequests', 'pageErrors', 'consoleErrors', 'httpErrors', 'failedRequests']) {
    assert.equal(counts[key], 0, `Unexpected browser diagnostic: ${key}`);
  }
}
async function api(path, data, token, expected = 200) {
  const response = await fetch(origin + path, { method: data ? 'POST' : 'GET',
    redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { ...(data ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {}) });
  assert.equal(response.status, expected, 'Synthetic API status');
  return response.json();
}
async function setup(context) {
  const password = randomUUID();
  const id = randomUUID().replaceAll('-', '').slice(0, 12);
  const email = `vosk-${id}@example.invalid`;
  const patient = `VOSK-${id}`;
  const account = await api('/api/auth/register', { email, password, firstName: 'Synthetic', lastName: 'Vosk QA' }, null, 201);
  assert.equal(typeof account.accessToken, 'string');
  await api('/api/patients/create', { patientId: patient, firstName: 'SYNTHETIC', lastName: 'Vosk test only', dob: '2000-02-29' }, account.accessToken, 201);
  const page = await context.newPage();
  await page.goto(origin);
  assert.equal(await page.evaluate(() => window.isSecureContext), true);
  await page.getByPlaceholder('Email', { exact: true }).fill(email);
  await page.getByPlaceholder('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await openPatient(page, patient);
  activePage = page;
  return { page, patient, token: account.accessToken, email };
}
async function openPatient(page, patient) {
  const back = page.getByRole('button', { name: '← Back to Search', exact: true });
  if (await back.isVisible()) await back.click();
  await page.getByPlaceholder(/patient.*id/i).fill(patient);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByLabel('Patient ID', { exact: true })).toHaveValue(patient);
  await expect(page.getByLabel('Clinical note', { exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Start dictation', exact: true })).toBeEnabled();
}
async function screenshot(page, name, caption, assertion) {
  const frame = await captureFrame({ capture, page, name, caption, assertion });
  if (frame) frames.push(frame);
}
async function cacheInventory(page) {
  // Inspect IDB keys only; never read record values (model bytes or otherwise).
  return page.evaluate(async () => {
    const databases = await indexedDB.databases();
    const output = [];
    for (const { name } of databases) {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(name); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(new Error('IDB open failed'));
      });
      for (const store of db.objectStoreNames) {
        const keys = await new Promise((resolve, reject) => {
          const request = db.transaction(store).objectStore(store).getAllKeys();
          request.onsuccess = () => resolve(request.result); request.onerror = () => reject(new Error('IDB keys failed'));
        });
        output.push({ database: name, store, keys });
      }
      db.close();
    }
    return output;
  });
}

const statusOf = page => page.getByRole('status', { name: 'Dictation status', exact: true });
const noteOf = page => page.getByLabel('Clinical note', { exact: true });
const button = (page, name) => page.getByRole('button', { name, exact: true });
async function gate(name, body) {
  stage = name;
  console.log(`V3 stage: ${name}`);
  const started = performance.now();
  await body();
  report.cases.push({ name, passed: true, milliseconds: Math.round(performance.now() - started) });
}
async function newContext(permission = true) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: 'en-US', timezoneId: 'UTC', serviceWorkers: 'block' });
  context.setDefaultTimeout(15000);
  context.setDefaultNavigationTimeout(20000);
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await context.grantPermissions(permission ? ['microphone'] : [], { origin });
  await context.addInitScript(observeNativeResources);
  const counts = observe(context);
  report.diagnostics.push(counts);
  return { context, counts };
}
async function clearModelCache(page) {
  // Only this disposable browser partition; never DB/API or an existing profile.
  await page.evaluate(async () => {
    for (const { name } of await indexedDB.databases()) {
      if (name !== '/vosk') throw new Error('Unexpected non-model database');
      await new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = resolve; request.onerror = reject; request.onblocked = reject;
      });
    }
  });
  assert.deepEqual(await cacheInventory(page), []);
}
async function assertReleased(page) {
  await expect.poll(async () => {
    const snapshot = await page.evaluate(resourceSnapshot);
    return snapshot.tracks.every(s => s === 'ended') && snapshot.contexts.every(s => s === 'closed')
      && snapshot.workers.every(w => w.terminated === 1) && snapshot.ports.every(p => p.closed && p.disconnected);
  }, { timeout: 5000 }).toBe(true);
  const snapshot = await page.evaluate(resourceSnapshot);
  assert.equal(snapshot.violations, 0);
  return snapshot;
}
async function start(page, cold = false) {
  await button(page, 'Start dictation').click();
  if (cold) await expect(statusOf(page)).toHaveText('Loading model');
  await expect.poll(async () => (await statusOf(page).textContent()) === 'Listening' || await page.getByRole('alert').count() > 0,
    { timeout: 125000, intervals: [100, 250, 500] }).toBe(true);
  await expect(statusOf(page)).toHaveText('Listening');
  await expect(button(page, 'Save Note')).toBeDisabled();
}
async function finish(page) {
  const start = performance.now();
  await button(page, 'Stop dictation').click();
  await expect(statusOf(page)).toHaveText('Stopped', { timeout: 15000 });
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(button(page, 'Save Note')).toBeEnabled();
  await expect(page.getByLabel('Dictation preview')).toHaveCount(0);
  const transcript = await noteOf(page).inputValue();
  assert.ok(transcript.trim().length > 0, 'Real transcription must be nonempty');
  assert.ok(transcript.includes(phrase), 'Real transcription must contain all five expected tokens in order');
  const resources = await assertReleased(page);
  const events = resources.events.map(e => e.kind);
  const barrier = ['capture-stop', 'capture-drained', 'flush-sent', 'flush-final', 'worker-terminated'];
  for (let i = 0; i < barrier.length; i++) {
    assert.ok(events.includes(barrier[i]), `Missing native final barrier ${barrier[i]}`);
    if (i) assert.ok(events.indexOf(barrier[i - 1]) < events.indexOf(barrier[i]), 'Native final barrier order');
  }
  const transitions = resources.statuses.slice(-4);
  assert.deepEqual(transitions.map(s => s.text), ['Loading model', 'Listening', 'Processing', 'Stopped']);
  assert.ok(transitions.slice(0, 3).every(s => s.saveDisabled), 'Save remains disabled until genuine final barrier');
  assert.equal(transitions[3].saveDisabled, false);
  assert.ok(resources.workers.at(-1).partials.some(text => text.includes('one two')));
  assert.ok(resources.workers.at(-1).finals.some(result => result.flush));
  assert.equal(resources.workers.at(-1).frames, resources.ports.at(-1).frames, 'All captured native frames reach real adapter');
  return { transcript, stopDrainMs: Math.round(performance.now() - start), resources };
}
async function saveProof(page, patient, token, text) {
  await button(page, 'Save Note').click();
  await expect(page.getByText('Note saved successfully!')).toBeVisible();
  const date = await page.getByLabel('Note date').inputValue();
  const saved = await api(`/api/notes/patient/${patient}?date=${date}`, null, token);
  assert.equal(saved.note.note_text, text); assert.equal(saved.note.revision, 1);
  assert.deepEqual(saved.note.medical_codes ?? [], [], 'Dictation never creates medical codes');
  const record = await api(`/api/patients/search?patientId=${patient}`, null, token);
  assert.equal(record.patient.medications, '', 'Dictation must not infer or fill medications');
  assert.equal(record.patient.medical_conditions, '', 'Dictation must not infer diagnoses');
  assert.deepEqual(record.patient.cumulative_medical_codes, []);
  await page.reload(); await openPatient(page, patient);
  await expect(noteOf(page)).toHaveValue(text);
  await expect(page.getByText('No unsaved note changes.')).toBeVisible();
  return { patient, date, revision: saved.note.revision, transcript: text, sha256: sha(text),
    reloadedViaPatientSearch: true, medicalCodes: [], medications: '', medicalConditions: '' };
}
async function createPatient(token) {
  const patient = `VOSK-${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  await api('/api/patients/create', { patientId: patient, firstName: 'SYNTHETIC', lastName: 'Vosk test only', dob: '2000-02-29' }, token, 201);
  return patient;
}
async function unchangedFor(page, text, milliseconds = 1200) {
  // Bounded browser observation, not a replacement for an engine completion.
  await page.evaluate(async ({ text, milliseconds }) => {
    await new Promise((resolve, reject) => {
      const read = () => document.querySelector('[aria-label="Clinical note"]')?.value;
      const observer = new MutationObserver(() => { if (read() !== text) { observer.disconnect(); reject(new Error('Stale draft mutation')); } });
      observer.observe(document.body, { subtree: true, childList: true, characterData: true });
      setTimeout(() => { observer.disconnect(); read() === text ? resolve() : reject(new Error('Stale draft mutation')); }, milliseconds);
    });
  }, { text, milliseconds });
  await expect(noteOf(page)).toHaveValue(text);
}

try {
  const caps = await api('/api/auth/capabilities');
  assert.equal(caps.allowRegistration, true); assert.equal(caps.aiEnabled, false);
  const audio = await generateSyntheticAudio();
  assert.equal(audio.phrase, phrase); assert.equal(audio.sampleRate, 48000);
  report.audio = audio; report.diagnostics = []; report.origin = origin;
  await gate('served-assets-and-csp', async () => {
    const response = await fetch(origin + '/models/manifest.json', { redirect: 'error', signal: AbortSignal.timeout(15000) });
    assert.equal(response.status, 200);
    const manifest = await response.json(); model = selectModel(manifest);
    report.selectedModel = { ...manifest }; report.assets = {};
    for (const path of ['/', '/models/manifest.json', model, worker]) {
      const response = await fetch(origin + path, { redirect: 'error', signal: AbortSignal.timeout(20000) });
      assert.equal(response.status, 200);
      const policy = response.headers.get('content-security-policy');
      assert.ok(policy?.includes("worker-src 'self'")); assert.ok(policy.includes("connect-src 'self'"));
      assert.equal(policy.includes("'unsafe-eval'"), path === worker);
      assert.ok(policy.includes("script-src 'self'"));
      const bytes = Buffer.from(await response.arrayBuffer());
      if (path === model) { assert.equal(sha(bytes), manifest.assetSha256); assert.equal(bytes.length, manifest.assetBytes); }
      if (path === worker) { assert.equal(sha(bytes), expectedWorkerSha); assert.equal(response.headers.get('cache-control'), 'no-store'); }
      report.assets[path] = { bytes: bytes.length, sha256: sha(bytes), policy, cacheControl: response.headers.get('cache-control') };
    }
  });
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: [
    '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${audio.path}`,
    '--autoplay-policy=no-user-gesture-required',
  ] });
  report.browser = browser.version();
  const { context, counts } = await newContext();
  const { page, patient, token } = await setup(context);
  await gate('cold-real-mic-recognition-and-stop-barrier', async () => {
    await clearModelCache(page);
    await expect(page.getByText(/General speech model, not clinically validated/)).toBeVisible();
    assert.equal(counts.model, 0); assert.equal(counts.worker, 0);
    const started = performance.now();
    await start(page, true); report.coldReadyMs = Math.round(performance.now() - started);
    await expect(page.getByLabel('Dictation preview')).toContainText(phrase, { timeout: 35000 });
    await screenshot(page, 'vosk-01-listening', 'Actual cold Vosk recognition; synthetic Rishi voice; interim not saved', async () => {
      await expect(statusOf(page)).toHaveText('Listening'); await expect(noteOf(page)).toHaveValue('');
      await expect(page.getByLabel('Dictation preview')).toContainText(phrase);
      await expect(button(page, 'Save Note')).toBeDisabled();
    });
    report.cold = await finish(page);
    assert.equal(counts.model, 1); assert.equal(counts.worker, 1); assert.equal(counts.worklet, 1);
    assert.equal(counts.apiWrites, 1, 'Only UI login; no automatic save or audio upload');
    const workletPath = await page.evaluate(() => performance.getEntriesByType('resource').map(e => e.name).find(url => /\/assets\/dictationCapture\.worklet-.*\.js$/.test(url)));
    assert.ok(workletPath && new URL(workletPath).origin === origin, 'Non-inline worklet must be served from same origin');
    const workletResponse = await fetch(workletPath, { redirect: 'error' });
    const workletPolicy = workletResponse.headers.get('content-security-policy');
    assert.equal(workletResponse.status, 200); assert.ok(workletPolicy.includes("script-src 'self'"));
    assert.equal(workletPolicy.includes("'unsafe-eval'"), false);
    report.worklet = { path: new URL(workletPath).pathname, policy: workletPolicy, sha256: sha(Buffer.from(await workletResponse.arrayBuffer())) };
    clean(counts);
  });
  await gate('explicit-save-reload-patient-search', async () => {
    report.saved = await saveProof(page, patient, token, report.cold.transcript);
    await screenshot(page, 'vosk-02-saved', 'Actual final text saved via API/PostgreSQL and reloaded by patient search', async () => {
      await expect(noteOf(page)).toHaveValue(report.cold.transcript); await expect(statusOf(page)).toHaveText('Stopped');
    });
    report.cache = await cacheInventory(page);
    assert.equal(report.cache.length, 1); assert.equal(report.cache[0].database, '/vosk');
    assert.equal(report.cache[0].keys.length, 21);
    assert.ok(report.cache[0].keys.every(key => key.startsWith('/vosk/_models_vosk_model_small_en_in_0_4_browser_v2_tar_gz')));
    clean(counts);
  });
  await gate('warm-idb-offline-recognition-online-save', async () => {
    const warmPatient = await createPatient(token); await openPatient(page, warmPatient);
    const beforeModels = counts.model;
    const started = performance.now(); await start(page); report.warmReadyMs = Math.round(performance.now() - started);
    assert.equal(counts.model, beforeModels, 'Warm real engine restores IDB without model HTTP');
    // Worker is no-store: deliberately take the browser offline AFTER static
    // worker/worklet load. Offline cold boot/reload and offline Save are NOT claims.
    const before = { ...counts }; await context.setOffline(true);
    assert.equal(await page.evaluate(() => navigator.onLine), false);
    await expect(page.getByLabel('Dictation preview')).toContainText(phrase, { timeout: 35000 });
    report.warm = await finish(page);
    report.offline = { requests: counts.requests - before.requests, apiWrites: counts.apiWrites - before.apiWrites,
      modelRequests: counts.model - before.model, outbound: counts.external - before.external };
    assert.deepEqual(report.offline, { requests: 0, apiWrites: 0, modelRequests: 0, outbound: 0 });
    await context.setOffline(false);
    assert.equal(await page.evaluate(() => navigator.onLine), true);
    report.warmSaved = await saveProof(page, warmPatient, token, report.warm.transcript);
    clean(counts);
  });
  await gate('missing-model-manual-recovery', async () => {
    const { context: negative, counts: network } = await newContext();
    const fixture = await setup(negative); const p = fixture.page;
    await clearModelCache(p);
    await negative.route(origin + model, route => route.fulfill({ status: 404, contentType: 'text/plain', body: 'Synthetic missing model' }));
    const text = 'SYNTHETIC manual draft survives a missing model.';
    await noteOf(p).fill(text); await button(p, 'Start dictation').click();
    await expect(p.getByRole('alert')).toContainText(/local model availability/, { timeout: 15000 });
    await expect(statusOf(p)).toHaveText('Stopped'); await expect(noteOf(p)).toHaveValue(text);
    await noteOf(p).fill(text + ' Reviewed.');
    report.missingModel = { resources: await assertReleased(p), saved: await saveProof(p, fixture.patient, fixture.token, text + ' Reviewed.') };
    assert.equal(network.model, 1); assert.equal(network.expectedHttpErrors, 1); clean(network);
    await negative.close();
  });
  await gate('native-permission-denied-manual-recovery', async () => {
    const { context: denied, counts: network } = await newContext(false);
    const fixture = await setup(denied); const p = fixture.page;
    assert.equal(await p.evaluate(async () => (await navigator.permissions.query({ name: 'microphone' })).state), 'denied');
    await noteOf(p).fill('SYNTHETIC manually typed note.'); await button(p, 'Start dictation').click();
    await expect(p.getByRole('alert')).toContainText('Microphone permission was denied.');
    await expect(statusOf(p)).toHaveText('Stopped');
    const manual = 'SYNTHETIC manually typed note. Reviewed after permission denial.';
    await noteOf(p).fill(manual);
    await screenshot(p, 'vosk-03-permission-denied', 'Test-configured native permission denial (not a human mic); manual editing remains available', async () => {
      await expect(p.getByRole('alert')).toContainText('Microphone permission was denied.');
      await expect(noteOf(p)).toHaveValue(manual); await expect(button(p, 'Save Note')).toBeEnabled();
    });
    report.permissionDenied = { resources: await assertReleased(p), saved: await saveProof(p, fixture.patient, fixture.token, manual) };
    assert.equal(network.worker, 0); assert.equal(network.model, 0); clean(network);
    await denied.close();
  });
  await gate('cancel-loading', async () => {
    const { context: cancel, counts: network } = await newContext();
    const fixture = await setup(cancel); const p = fixture.page;
    await clearModelCache(p);
    let release; let requested;
    const held = new Promise(resolve => { release = resolve; });
    const arrived = new Promise(resolve => { requested = resolve; });
    await cancel.route(origin + model, async route => { requested(); await held; await route.abort('aborted').catch(() => {}); });
    await noteOf(p).fill('SYNTHETIC retained during cancel.');
    await button(p, 'Start dictation').click();
    try {
      await Promise.race([arrived, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Model request deadline')), 15000); timer.unref(); })]);
      await expect(statusOf(p)).toHaveText('Loading model'); await expect(button(p, 'Save Note')).toBeDisabled();
      await button(p, 'Stop dictation').click(); await expect(statusOf(p)).toHaveText('Stopped');
      report.cancelLoading = await assertReleased(p);
    } finally { release(); }
    await unchangedFor(p, 'SYNTHETIC retained during cancel.');
    await expect(p.getByRole('alert')).toHaveCount(0); await expect(button(p, 'Save Note')).toBeEnabled();
    assert.equal(network.model, 1); assert.equal(network.apiWrites, 1); clean(network);
    await cancel.close();
  });
  activePage = page;
  await gate('patient-change-cancels-real-recognition', async () => {
    const next = await createPatient(token);
    await start(page);
    await expect(page.getByLabel('Dictation preview')).toContainText(/one two/, { timeout: 35000 });
    let dialogs = 0;
    const confirm = async dialog => { dialogs++; assert.equal(dialog.type(), 'confirm'); await dialog.accept(); };
    page.on('dialog', confirm);
    const writes = counts.apiWrites;
    await openPatient(page, next); page.off('dialog', confirm);
    assert.equal(dialogs, 1); await expect(statusOf(page)).toHaveText('Stopped');
    await noteOf(page).fill('SYNTHETIC next-patient draft; no leaked dictation.');
    report.patientChange = await assertReleased(page);
    await unchangedFor(page, 'SYNTHETIC next-patient draft; no leaked dictation.', 1500);
    assert.equal(counts.apiWrites, writes);
    const saved = await api(`/api/notes/patient/${next}`, null, token); assert.equal(saved.exists, false);
    await expect(page.getByLabel('Dictation preview')).toHaveCount(0); clean(counts);
    await noteOf(page).fill('');
  });
  await gate('logout-cancels-real-recognition', async () => {
    await start(page);
    await expect(page.getByLabel('Dictation preview')).toContainText(/one two/, { timeout: 35000 });
    page.once('dialog', async dialog => { assert.equal(dialog.type(), 'confirm'); await dialog.accept(); });
    await button(page, 'Logout').click();
    await expect(page.getByPlaceholder('Email', { exact: true })).toBeVisible();
    report.logout = await assertReleased(page);
    await expect(page.getByLabel('Dictation preview')).toHaveCount(0);
    await expect(noteOf(page)).toHaveCount(0);
    clean(counts);
  });
  stage = 'complete'; report.passed = true;
  report.remaining = { clinicalAccuracyVerified: false, realSpeakerVerified: false, independentEvaluation: 'pending MAIN', fullRegression: 'pending MAIN' };
} catch (error) {
  report.passed = false;
  // Never serialize raw errors/Playwright logs, headers, bodies or auth state.
  report.failure = { stage, type: error?.name ?? 'Error', code: error?.code,
    locations: [...String(error?.stack ?? '').matchAll(/vosk-browser[^\s)]*:\d+:\d+/g)].map(match => match[0]),
    ownerAction: 'Inspect stage and native resource evidence; do not change application guards or substitute recognition.' };
  if (activePage && !activePage.isClosed()) report.failure.resources = await activePage.evaluate(resourceSnapshot).catch(() => null);
} finally {
  clearTimeout(deadline);
  await browser?.close(); report.stage = stage; report.ended = new Date().toISOString();
  if (report.passed) await writeEvidence({ capture, output, report, frames });
  console.log(JSON.stringify({ passed: report.passed, stage, cases: report.cases, diagnostics: report.diagnostics,
    failure: report.failure ? { stage: report.failure.stage, type: report.failure.type, locations: report.failure.locations } : undefined,
    capture, screenshotCount: report.screenshots.length, receiptWritten: Boolean(report.receipt) }, null, 2));
}
return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    // One CLI switch only: the exact environment flag. No legacy --capture OR.
    assert.equal(process.argv.length, 2, 'Unsupported CLI arguments');
    const receipt = await runQa();
    if (!receipt.passed) process.exitCode = 1;
  } catch {
    console.error('V3 configuration/evidence failure; no raw diagnostic output.');
    process.exitCode = 1;
  }
}
