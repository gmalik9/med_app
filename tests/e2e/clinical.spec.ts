import { test as base, expect, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

type Observation = {
  expectedStatuses: Set<number>;
  expectedFailures: { path: string; status: number; remaining: number }[];
  counts: { pageErrors: number; unexpectedConsole: number; expectedConsole: number; unexpectedHttp: number; expectedHttp: number; failedRequests: number; externalRequests: number };
};
const test = base.extend<{ observation: Observation }>({
  observation: [async ({ page, context }, use, info) => {
    const observation: Observation = { expectedStatuses: new Set(), expectedFailures: [], counts: {
      pageErrors: 0, unexpectedConsole: 0, expectedConsole: 0, unexpectedHttp: 0, expectedHttp: 0, failedRequests: 0, externalRequests: 0,
    } };
    const { counts, expectedStatuses } = observation;
    page.on('pageerror', () => counts.pageErrors++);
    page.on('console', message => {
      if (!['error', 'warning'].includes(message.type())) return;
      // Do not retain console text: Chromium's fixed HTTP error is classified only.
      const match = /^Failed to load resource: the server responded with a status of (\d{3})/.exec(message.text());
      if (match && expectedStatuses.has(Number(match[1]))) counts.expectedConsole++;
      else counts.unexpectedConsole++;
    });
    page.on('requestfailed', () => counts.failedRequests++);
    page.on('response', response => {
      if (response.status() < 400) return;
      const expected = observation.expectedFailures.find(item => item.remaining > 0 && item.status === response.status()
        && response.request().method() === 'POST' && new URL(response.url()).pathname === item.path);
      if (expected) { expected.remaining--; counts.expectedHttp++; }
      else counts.unexpectedHttp++;
    });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === 'http://127.0.0.1:5179') return route.continue();
      counts.externalRequests++;
      return route.abort();
    });
    await use(observation);
    // Annotation contains scalar counts only, never request URLs or credentials.
    info.annotations.push({ type: 'synthetic-observation', description: JSON.stringify(counts) });
    expect(counts.pageErrors, 'Unexpected browser page errors').toBe(0);
    expect(counts.unexpectedConsole, 'Unexpected console warnings/errors').toBe(0);
    expect(counts.unexpectedHttp, 'Unexpected HTTP failures').toBe(0);
    expect(counts.failedRequests, 'Unexpected failed browser requests').toBe(0);
    expect(counts.externalRequests, 'External browser requests prohibited').toBe(0);
    expect(observation.expectedFailures.every(item => item.remaining === 0), 'Expected negative browser responses all observed').toBe(true);
  }, { auto: true }],
});

const PASSWORD = randomUUID();
const ORIGIN = 'http://127.0.0.1:5179';
async function api(request: APIRequestContext, token: string | null, method: string, path: string, data?: unknown, status = 200, key?: string) {
  const response = await request.fetch(`${ORIGIN}${path}`, {
    method, data,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(key ? { 'Idempotency-Key': key } : {}) },
  });
  // Do not use toBeOK(): its failure log can include Authorization headers.
  expect(response.status(), `Synthetic API ${method} expected status`).toBe(status);
  return { body: await response.json(), replayed: response.headers()['idempotency-replayed'] };
}
async function registerApi(request: APIRequestContext, name: string) {
  const { body } = await api(request, null, 'POST', '/api/auth/register', {
    email: `${name}@example.invalid`, password: PASSWORD, firstName: 'Synthetic', lastName: name,
  }, 201);
  expect(typeof body.accessToken === 'string', 'Access token exists (value never reported)').toBe(true);
  return body.accessToken as string;
}
async function login(page: Page, name: string) {
  await page.goto('/');
  await page.getByPlaceholder('Email', { exact: true }).fill(`${name}@example.invalid`);
  await page.getByPlaceholder('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Search Patient', exact: true })).toBeVisible();
}
async function tokenFrom(page: Page) {
  const token = await page.evaluate(() => sessionStorage.getItem('accessToken'));
  expect(Boolean(token), 'Session exists without exposing token').toBe(true);
  return token!;
}
async function createPatient(request: APIRequestContext, token: string, id: string) {
  const { body } = await api(request, token, 'POST', '/api/patients/create', {
    patientId: id, firstName: 'SYNTHETIC', lastName: id, dob: '2000-02-29',
  }, 201);
  return body.patient as { id: number; patient_id: string };
}
async function openPatient(page: Page, id: string) {
  await page.getByPlaceholder(/patient.*id/i).fill(id);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByLabel('Patient ID', { exact: true })).toHaveValue(id);
  await expect(page.getByLabel('Clinical note', { exact: true })).toBeEnabled();
}
async function setup(page: Page, request: APIRequestContext, name: string, patient: string) {
  const token = await registerApi(request, name);
  const record = await createPatient(request, token, patient);
  await login(page, name);
  await openPatient(page, patient);
  return { token, record };
}
async function capture(page: Page, info: TestInfo, name: string, caption: string, assertState: () => Promise<void>) {
  // Required assertions run even when image generation is not opted in.
  await assertState();
  const passwordFilled = await page.locator('input[type="password"]').evaluateAll(inputs => inputs.some(input => (input as HTMLInputElement).value.length > 0));
  expect(passwordFilled, 'Screenshots must never contain filled password fields').toBe(false);
  if (process.env.EVIDENCE_SCREENSHOTS !== 'true') return;
  const at = new Date().toISOString();
  const label = `SYNTHETIC TEST DATA ONLY — ${caption} — ${at.slice(0, 10)} UTC`;
  await page.evaluate(text => {
    const banner = document.createElement('div');
    banner.id = 'synthetic-evidence-caption';
    banner.textContent = text;
    Object.assign(banner.style, { position: 'fixed', top: '0', left: '0', right: '0', zIndex: '2147483647', padding: '10px', background: '#142b40', color: '#fff', font: 'bold 14px system-ui', textAlign: 'center', pointerEvents: 'none' });
    document.body.appendChild(banner);
  }, label);
  try {
    await expect(page.locator('#synthetic-evidence-caption')).toHaveText(label);
    const directory = resolve('docs/verification/screenshots');
    await mkdir(directory, { recursive: true });
    await page.screenshot({ path: resolve(directory, `${name}.png`), animations: 'disabled' });
    info.annotations.push({ type: 'synthetic-screenshot', description: JSON.stringify({ name, caption, at }) });
  } finally {
    await page.locator('#synthetic-evidence-caption').evaluate(element => element.remove());
  }
}

test('synthetic clinician: register, create patient, save note, record vitals, reload, logout', async ({ page, request }, info) => {
  await page.goto('/');
  await page.getByRole('button', { name: "Don't have an account? Register" }).click();
  await page.getByPlaceholder('First Name', { exact: true }).fill('Synthetic');
  await page.getByPlaceholder('Last Name', { exact: true }).fill('Clinician');
  await page.getByPlaceholder('Email', { exact: true }).fill('browser@example.invalid');
  await page.getByPlaceholder('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  const search = page.getByPlaceholder(/patient.*id/i);
  await search.fill('BROWSER-SYN');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByLabel('First Name', { exact: true }).fill('Synthetic');
  await page.getByLabel('Last Name', { exact: true }).fill('Patient');
  await page.getByLabel('Date of Birth').fill('2000-02-29');
  await page.getByLabel('Allergies').fill('SYNTHETIC ALLERGY');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByLabel('Clinical note')).toBeEnabled();
  await page.getByLabel('Clinical note').fill('SYNTHETIC clinical note for verification only.');
  await page.getByRole('button', { name: 'Save Note', exact: true }).click();
  await expect(page.getByText('Note saved successfully!')).toBeVisible();
  await expect(page.getByText('SYNTHETIC clinical note for verification only.', { exact: true }).last()).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await capture(page, info, '02-patient-record', 'Saved synthetic patient and clinical note; no real PHI', async () => {
    await expect(page.getByLabel('Patient ID', { exact: true })).toHaveValue('BROWSER-SYN');
    await expect(page.getByLabel('First Name', { exact: true })).toHaveValue('Synthetic');
    await expect(page.getByLabel('Clinical note')).toHaveValue('SYNTHETIC clinical note for verification only.');
    await expect(page.getByText('No unsaved note changes.')).toBeVisible();
  });
  await page.getByPlaceholder('Heart Rate', { exact: true }).fill('72');
  await page.getByRole('button', { name: 'Record Vitals' }).click();
  await page.getByRole('button', { name: /Show.*Vitals History/ }).click();
  await expect(page.getByText(/72 bpm/).first()).toBeVisible();
  await page.getByLabel('Appointment date').fill('2030-01-01T10:00');
  await page.getByPlaceholder('Type', { exact: true }).fill('Synthetic checkup');
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await expect(page.getByText(/Synthetic checkup.*scheduled/)).toBeVisible();
  await page.getByPlaceholder('Visit Type', { exact: true }).fill('Synthetic visit');
  await page.getByPlaceholder('Diagnosis', { exact: true }).fill('Synthetic verification');
  await page.getByRole('button', { name: 'Save Visit', exact: true }).click();
  await expect(page.getByText(/Synthetic visit.*Synthetic verification/)).toBeVisible();
  await page.reload();
  await search.fill('BROWSER-SYN');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByLabel('Clinical note')).toHaveValue('SYNTHETIC clinical note for verification only.');
  await expect(page.getByLabel('Date of Birth')).toHaveValue('2000-02-29');
  await expect(page.getByLabel('Allergies')).toHaveValue('SYNTHETIC ALLERGY');
  const persistentTokenCount = await page.evaluate(() => ['accessToken', 'refreshToken', 'user'].filter(key => localStorage.getItem(key)).length);
  expect(persistentTokenCount).toBe(0);
  const oldToken = await tokenFrom(page);
  const oldRefresh = await page.evaluate(() => sessionStorage.getItem('refreshToken'));
  await page.getByRole('button', { name: /Logout/i }).click();
  await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('accessToken'))).toBeNull();
  await api(request, oldToken, 'GET', '/api/auth/profile', undefined, 401);
  await api(request, null, 'POST', '/api/auth/refresh', { refreshToken: oldRefresh }, 401);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeVisible();
  await login(page, 'browser');
  await openPatient(page, 'BROWSER-SYN');
  await expect(page.getByLabel('Clinical note')).toHaveValue('SYNTHETIC clinical note for verification only.');
  await expect(page.getByText(/Synthetic checkup.*scheduled/)).toHaveCount(1);
  await expect(page.getByText(/Synthetic visit.*Synthetic verification/)).toHaveCount(1);
});

test('invalid credentials do not authenticate or expose response details', async ({ page, request, observation }, info) => {
  observation.expectedStatuses.add(401);
  observation.expectedFailures.push({ path: '/api/auth/login', status: 401, remaining: 1 });
  await page.goto('/');
  await capture(page, info, '01-login', 'Login before credentials; fields empty; built frontend', async () => {
    await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeVisible();
    await expect(page.getByPlaceholder('Email', { exact: true })).toHaveValue('');
    await expect(page.getByPlaceholder('Password', { exact: true })).toHaveValue('');
  });
  await page.getByPlaceholder('Email', { exact: true }).fill('missing@example.invalid');
  await page.getByPlaceholder('Password', { exact: true }).fill('Synthetic-invalid-password!');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByText('Invalid credentials')).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('accessToken'))).toBeNull();
  await page.getByPlaceholder('Password', { exact: true }).fill('');
  await api(request, null, 'GET', '/api/patients/', undefined, 401);
  await api(request, 'synthetic-invalid-credential', 'GET', '/api/patients/', undefined, 401);
  const ready = await request.get('http://127.0.0.1:5059/ready');
  expect(ready.status()).toBe(200);
  expect(await ready.json()).toEqual({ status: 'ready' });
  const { body } = await api(request, null, 'GET', '/api/auth/capabilities');
  expect(body).toMatchObject({ allowRegistration: true, aiEnabled: false });
  // Proves preview serves built assets rather than /src/main.tsx or Vite HMR.
  expect(await page.locator('script[type="module"]').getAttribute('src')).toMatch(/^\/assets\/.+\.js$/);
});

test('canceled draft navigation preserves patient, note date, text and medical codes', async ({ page, request }, info) => {
  const { token } = await setup(page, request, 'draft', 'J-DRAFT');
  const date = await page.getByLabel('Note date').inputValue();
  await page.getByLabel('Clinical note').fill('SYNTHETIC unsaved draft retained for J-DRAFT only.');
  await page.getByLabel('Medical code', { exact: true }).fill('SYN-DRAFT');
  await page.getByRole('button', { name: 'Add Code', exact: true }).click();
  let canceled = 0;
  page.on('dialog', async dialog => { expect(dialog.type()).toBe('confirm'); canceled++; await dialog.dismiss(); });
  for (const name of ['Dashboard', 'View All Patients', 'Logout']) {
    await page.getByRole('banner').getByRole('button', { name, exact: true }).click();
  }
  await page.getByRole('button', { name: '← Back to Search', exact: true }).click();
  await page.getByLabel('Note date').fill('2025-01-01');
  expect(canceled).toBe(5);
  await page.evaluate(() => window.scrollTo(0, 0));
  await capture(page, info, '03-draft-retained', 'Five canceled navigation attempts retain patient identity and unsaved draft', async () => {
    await expect(page.getByLabel('Patient ID', { exact: true })).toHaveValue('J-DRAFT');
    await expect(page.getByLabel('Clinical note')).toHaveValue('SYNTHETIC unsaved draft retained for J-DRAFT only.');
    await expect(page.getByLabel('Note date')).toHaveValue(date);
    await expect(page.getByRole('button', { name: 'Remove medical code SYN-DRAFT' })).toBeVisible();
    await expect(page.getByText('Unsaved changes or pending review.')).toBeVisible();
  });
  const { body } = await api(request, token, 'GET', `/api/notes/patient/J-DRAFT?date=${date}`);
  expect(body.exists).toBe(false);
  expect(await page.evaluate(() => [...Object.values(localStorage), ...Object.values(sessionStorage)].some(value => String(value).includes('SYNTHETIC unsaved draft')))).toBe(false);
});

test('late real patient update response cannot replace another patient with a dirty note', async ({ page, request }) => {
  const { token, record } = await setup(page, request, 'stale', 'J-STALE-A');
  await createPatient(request, token, 'J-STALE-B');
  let release!: () => void;
  let committed!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const committedResponse = new Promise<void>(resolve => { committed = resolve; });
  await page.route(`**/api/patients/${record.id}`, async route => {
    if (route.request().method() !== 'PUT') return route.continue();
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    committed();
    await pending;
    await route.fulfill({ response });
  });
  await page.getByLabel('First Name', { exact: true }).fill('SYNTHETIC UPDATED A');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await committedResponse;
  await page.getByRole('button', { name: '← Back to Search', exact: true }).click();
  await openPatient(page, 'J-STALE-B');
  await page.getByLabel('Clinical note').fill('SYNTHETIC dirty B must survive late A.');
  const delivered = page.waitForResponse(response => response.url().endsWith(`/api/patients/${record.id}`) && response.request().method() === 'PUT');
  release();
  await delivered;
  await page.getByLabel('Medical code', { exact: true }).fill('SYN-B');
  await page.getByRole('button', { name: 'Add Code', exact: true }).click();
  await expect(page.getByLabel('Patient ID', { exact: true })).toHaveValue('J-STALE-B');
  await expect(page.getByLabel('First Name', { exact: true })).toHaveValue('SYNTHETIC');
  await expect(page.getByLabel('Clinical note')).toHaveValue('SYNTHETIC dirty B must survive late A.');
  await page.getByRole('button', { name: 'Save Note', exact: true }).click();
  await expect(page.getByText('Note saved successfully!')).toBeVisible();
  const date = await page.getByLabel('Note date').inputValue();
  const saved = await api(request, token, 'GET', `/api/notes/patient/J-STALE-B?date=${date}`);
  expect(saved.body.note.note_text).toBe('SYNTHETIC dirty B must survive late A.');
  const untouched = await api(request, token, 'GET', `/api/notes/patient/J-STALE-A?date=${date}`);
  expect(untouched.body.exists).toBe(false);
});

test('real note 409 review preserves draft and detects a second external write after comparison', async ({ page, request, observation }, info) => {
  observation.expectedStatuses.add(409);
  observation.expectedFailures.push({ path: '/api/notes/patient/J-CONFLICT', status: 409, remaining: 2 });
  const { token } = await setup(page, request, 'conflict', 'J-CONFLICT');
  const date = await page.getByLabel('Note date').inputValue();
  const path = '/api/notes/patient/J-CONFLICT';
  await page.getByLabel('Clinical note').fill('SYNTHETIC base revision one.');
  await page.getByRole('button', { name: 'Save Note', exact: true }).click();
  await expect(page.getByText('Note saved successfully!')).toBeVisible();
  await page.getByLabel('Clinical note').fill('SYNTHETIC local draft for explicit merge.');
  await api(request, token, 'POST', path, { date, noteText: 'SYNTHETIC external revision two.', medicalCodes: ['SYN-2'], expectedRevision: 1 });
  await page.getByRole('button', { name: 'Save Note', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Note conflict reconciliation' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save Note', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Load server version for comparison' }).click();
  await page.getByRole('region', { name: 'Note conflict reconciliation' }).scrollIntoViewIfNeeded();
  await capture(page, info, '04-conflict-review', 'Real HTTP 409: local draft and server revision two require explicit reconciliation', async () => {
    await expect(page.getByLabel('Clinical note')).toHaveValue('SYNTHETIC local draft for explicit merge.');
    await expect(page.getByLabel('Server note for comparison')).toHaveValue('SYNTHETIC external revision two.');
    await expect(page.getByText('Server revision: 2')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save Note', exact: true })).toBeDisabled();
  });
  // A comparison is not a lock: a second external write must still conflict.
  await api(request, token, 'POST', path, { date, noteText: 'SYNTHETIC external revision three.', medicalCodes: ['SYN-3'], expectedRevision: 2 });
  await page.getByRole('button', { name: 'Use reviewed draft with server revision' }).click();
  await page.getByRole('button', { name: 'Save Note', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Note conflict reconciliation' })).toBeVisible();
  expect((await api(request, token, 'GET', `${path}?date=${date}`)).body.note.revision).toBe(3);
  await expect(page.getByLabel('Clinical note')).toHaveValue('SYNTHETIC local draft for explicit merge.');
  await page.getByRole('button', { name: 'Load server version for comparison' }).click();
  await expect(page.getByLabel('Server note for comparison')).toHaveValue('SYNTHETIC external revision three.');
  await page.getByRole('button', { name: 'Use reviewed draft with server revision' }).click();
  await page.getByRole('button', { name: 'Save Note', exact: true }).click();
  await expect(page.getByText('Note saved successfully!')).toBeVisible();
  const saved = (await api(request, token, 'GET', `${path}?date=${date}`)).body.note;
  expect(saved.revision).toBe(4);
  expect(saved.note_text).toBe('SYNTHETIC local draft for explicit merge.');
});

test('disabled AI shows helpful error; mocked synthetic proposal requires discard or accept then separate save', async ({ page, request, observation }, info) => {
  observation.expectedStatuses.add(503);
  observation.expectedFailures.push({ path: '/api/format-note', status: 503, remaining: 1 });
  const { token } = await setup(page, request, 'ai-review', 'J-AI-MOCK');
  const original = 'SYNTHETIC original text; verification only, no clinical facts.';
  const proposal = 'MOCKED SYNTHETIC AI PROPOSAL — NOT LIVE AI. Verification text only.';
  await page.getByLabel('Clinical note').fill(original);
  await page.getByRole('button', { name: /Format with AI/ }).click();
  await capture(page, info, '07-helpful-error', 'Real provider-disabled 503; original synthetic note retained', async () => {
    await expect(page.getByRole('alert')).toHaveText('External AI formatting is disabled pending provider approval');
    await expect(page.getByLabel('Clinical note')).toHaveValue(original);
    await expect(page.getByRole('region', { name: 'AI draft review' })).toHaveCount(0);
  });
  let mockedRequests = 0;
  await page.route('**/api/format-note', async route => {
    expect(route.request().postDataJSON()).toEqual({ text: original });
    mockedRequests++;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: proposal, finish_reason: 'stop' }) });
  });
  await page.getByRole('button', { name: /Format with AI/ }).click();
  await page.getByRole('region', { name: 'AI draft review' }).scrollIntoViewIfNeeded();
  await capture(page, info, '05-ai-mocked-review', 'MOCKED synthetic AI response — NOT LIVE AI; review before acceptance and separate save', async () => {
    await expect(page.getByLabel('Original note before AI formatting')).toHaveValue(original);
    await expect(page.getByLabel('AI proposed note')).toHaveValue(proposal);
    await expect(page.getByRole('button', { name: 'Accept AI draft' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save Note', exact: true })).toBeDisabled();
  });
  await page.getByRole('button', { name: 'Discard AI draft' }).click();
  await expect(page.getByLabel('Clinical note')).toHaveValue(original);
  await expect(page.getByText('AI draft discarded. Your note is unchanged.')).toBeVisible();
  await page.getByRole('button', { name: /Format with AI/ }).click();
  await page.getByRole('button', { name: 'Accept AI draft' }).click();
  await expect(page.getByLabel('Clinical note')).toHaveValue(proposal);
  await expect(page.getByText('AI draft accepted into the editor. Not saved.')).toBeVisible();
  const date = await page.getByLabel('Note date').inputValue();
  expect((await api(request, token, 'GET', `/api/notes/patient/J-AI-MOCK?date=${date}`)).body.exists).toBe(false);
  await page.getByRole('button', { name: 'Save Note', exact: true }).click();
  await expect(page.getByText('Note saved successfully!')).toBeVisible();
  expect((await api(request, token, 'GET', `/api/notes/patient/J-AI-MOCK?date=${date}`)).body.note.note_text).toBe(proposal);
  expect(mockedRequests).toBe(2);
});

test('real database paging traverses 55 notes and more than 50 patients without duplicates', async ({ page, request }, info) => {
  const token = await registerApi(request, 'paging');
  await createPatient(request, token, 'J-PAGING');
  for (let index = 0; index < 55; index++) {
    const date = new Date(Date.UTC(2024, 0, index + 1)).toISOString().slice(0, 10);
    await api(request, token, 'POST', '/api/notes/patient/J-PAGING', {
      date, noteText: `SYNTHETIC history row ${String(index + 1).padStart(2, '0')} of 55.`, expectedRevision: 0, medicalCodes: [],
    });
  }
  for (let index = 0; index < 52; index++) await createPatient(request, token, `J-DIRECTORY-${String(index + 1).padStart(2, '0')}`);
  await login(page, 'paging');
  await openPatient(page, 'J-PAGING');
  const history = page.getByRole('heading', { name: 'Clinical Notes History', exact: true }).locator('..');
  await expect(history.getByText(/^SYNTHETIC history row/)).toHaveCount(30);
  await history.getByRole('button', { name: 'Load more', exact: true }).scrollIntoViewIfNeeded();
  await capture(page, info, '06-history-load-more', 'Real database: first 30 of 55 synthetic notes; Load more uses cursor pagination', async () => {
    await expect(history.getByText(/^SYNTHETIC history row/)).toHaveCount(30);
    await expect(history.getByRole('button', { name: 'Load more', exact: true })).toBeVisible();
    await expect(history.getByText('SYNTHETIC history row 26 of 55.', { exact: true })).toBeVisible();
  });
  const continuation = page.waitForResponse(response => new URL(response.url()).pathname === '/api/notes/patient/J-PAGING/history' && new URL(response.url()).searchParams.has('cursor'));
  await history.getByRole('button', { name: 'Load more', exact: true }).click();
  expect((await continuation).status()).toBe(200);
  await expect(history.getByText(/^SYNTHETIC history row/)).toHaveCount(55);
  await expect(history.getByText('No more records.', { exact: true })).toBeVisible();
  const texts = await history.getByText(/^SYNTHETIC history row/).allTextContents();
  expect(new Set(texts).size).toBe(55);
  await page.getByRole('banner').getByRole('button', { name: 'View All Patients', exact: true }).click();
  const ids = page.getByText(/^ID: /);
  await expect(ids).toHaveCount(50);
  const directoryContinuation = page.waitForResponse(response => new URL(response.url()).pathname === '/api/patients/' && new URL(response.url()).searchParams.has('cursor'));
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  expect((await directoryContinuation).status()).toBe(200);
  await expect(page.getByText('No more records.', { exact: true })).toBeVisible();
  const allIds = await ids.allTextContents();
  expect(allIds.length).toBeGreaterThan(52);
  expect(new Set(allIds).size).toBe(allIds.length);
  expect(allIds.filter(id => id.startsWith('ID: J-DIRECTORY-')).length).toBe(52);
});

test('real committed-write retry reuses keys and IDs; private template and appointment actor routes deny access', async ({ page, request, observation }, info) => {
  observation.expectedStatuses.add(503);
  observation.expectedFailures.push({ path: '/api/appointments/create', status: 503, remaining: 1 });
  const { token } = await setup(page, request, 'retry-owner', 'J-RETRY');
  const other = await registerApi(request, 'retry-other');
  // Direct real API retry proof for all three idempotent clinical operations.
  const operations = [
    { path: '/api/vitals/patient/J-RETRY', body: { heartRate: 71 }, field: 'vitalSigns', history: '/api/vitals/patient/J-RETRY/history' },
    { path: '/api/appointments/create', body: { patientId: 'J-RETRY', appointmentDate: '2030-01-01T10:00', appointmentType: 'SYNTHETIC direct retry', reason: 'SYNTHETIC' }, field: 'appointment', history: '/api/appointments/patient/J-RETRY/history' },
    { path: '/api/visits/create', body: { patientId: 'J-RETRY', visitType: 'SYNTHETIC direct retry', diagnosis: 'SYNTHETIC' }, field: 'visit', history: '/api/visits/patient/J-RETRY' },
  ];
  let appointmentId = 0;
  for (const operation of operations) {
    const key = randomUUID();
    const first = await api(request, token, 'POST', operation.path, operation.body, 201, key);
    const second = await api(request, token, 'POST', operation.path, operation.body, 201, key);
    expect(first.replayed).toBe('false');
    expect(second.replayed).toBe('true');
    const id = first.body[operation.field].id;
    expect(second.body[operation.field].id).toBe(id);
    const historyField = operation.field === 'vitalSigns' ? 'vitalSigns' : `${operation.field}s`;
    const history = await api(request, token, 'GET', operation.history);
    expect(history.body[historyField].filter((row: { id: number }) => row.id === id)).toHaveLength(1);
    if (operation.field === 'appointment') appointmentId = id;
  }
  const template = await api(request, token, 'POST', '/api/templates/create', { templateName: 'SYNTHETIC private owner only', templateCategory: 'SYNTHETIC-J', templateText: 'SYNTHETIC private text', isPublic: false }, 201);
  const privateId = template.body.template.id;
  for (const path of ['/api/templates/list', '/api/templates/category/SYNTHETIC-J']) {
    const owned = await api(request, token, 'GET', path);
    expect(owned.body.templates.some((row: { id: number }) => row.id === privateId)).toBe(true);
    const foreign = await api(request, other, 'GET', path);
    expect(foreign.body.templates.some((row: { id: number }) => row.id === privateId)).toBe(false);
    await api(request, null, 'GET', path, undefined, 401);
  }
  await api(request, other, 'PUT', `/api/appointments/${appointmentId}/status`, { status: 'cancelled' }, 404);
  await api(request, null, 'PUT', `/api/appointments/${appointmentId}/status`, { status: 'cancelled' }, 401);
  const appointments = await api(request, token, 'GET', '/api/appointments/patient/J-RETRY/history');
  expect(appointments.body.appointments.find((row: { id: number }) => row.id === appointmentId).status).toBe('scheduled');
  await api(request, token, 'PUT', `/api/appointments/${appointmentId}/status`, { status: 'completed' });
  // Real commit; intentionally replace only its acknowledgement with a 503.
  const keys: string[] = [];
  const ids: number[] = [];
  const replayed: string[] = [];
  await page.route('**/api/appointments/create', async route => {
    const key = route.request().headers()['idempotency-key'];
    expect(Boolean(key), 'UI supplies idempotency key (not logged)').toBe(true);
    keys.push(key);
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    ids.push((await response.json()).appointment.id);
    replayed.push(response.headers()['idempotency-replayed']);
    if (keys.length === 1) await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'SYNTHETIC TEST: acknowledgement withheld after real commit; retry unchanged.' }) });
    else await route.fulfill({ response });
  });
  await page.getByLabel('Appointment date').fill('2030-02-01T11:00');
  await page.getByPlaceholder('Type', { exact: true }).fill('SYNTHETIC UI acknowledgement retry');
  await page.getByPlaceholder('Reason', { exact: true }).fill('SYNTHETIC single-row proof');
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await page.getByRole('button', { name: 'Retry same submission', exact: true }).scrollIntoViewIfNeeded();
  await capture(page, info, '08-idempotent-retry', 'Synthetic lost acknowledgement after real DB commit; retry unchanged, not a new write', async () => {
    await expect(page.getByRole('button', { name: 'Retry same submission', exact: true })).toBeEnabled();
    await expect(page.getByPlaceholder('Type', { exact: true })).toHaveValue('SYNTHETIC UI acknowledgement retry');
    await expect(page.getByText(/Save outcome not confirmed/)).toBeVisible();
    const committed = await api(request, token, 'GET', '/api/appointments/patient/J-RETRY/history');
    expect(committed.body.appointments.filter((row: { id: number }) => row.id === ids[0])).toHaveLength(1);
  });
  await page.getByRole('button', { name: 'Retry same submission', exact: true }).click();
  await expect(page.getByText(/SYNTHETIC UI acknowledgement retry.*scheduled/)).toHaveCount(1);
  expect(keys.length).toBe(2);
  expect(keys[0] === keys[1], 'Retry preserves opaque key without reporting it').toBe(true);
  expect(ids[0]).toBe(ids[1]);
  expect(replayed).toEqual(['false', 'true']);
  const final = await api(request, token, 'GET', '/api/appointments/patient/J-RETRY/history');
  expect(final.body.appointments.filter((row: { id: number }) => row.id === ids[0])).toHaveLength(1);
});
