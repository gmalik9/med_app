import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Express, type Request, type Response } from 'express';
import { createServer, type Server } from 'node:http';
import { EventEmitter } from 'node:events';
import request from 'supertest';
import { testPassword } from './helpers/syntheticSecrets';

// No real DB/config/environment files, OCR workers or outbound providers. Use
// the REAL app, auth, route and schema-readiness code with controlled DB spies.
const db = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn(), transaction: vi.fn() }));
vi.mock('../src/db', () => ({ query: db.query, default: { connect: db.connect },
  getClient: db.connect, transaction: db.transaction }));
vi.mock('../src/config', async () => {
  const { randomBytes } = await import('node:crypto');
  return { config: {
    trustProxyHops: 0, allowedOrigins: ['http://localhost:5173'], sessionTimeoutMinutes: 15,
    aiEnabled: false, allowRegistration: false,
    jwtSecret: randomBytes(48).toString('base64url'),
    jwtRefreshSecret: randomBytes(48).toString('base64url'),
  } };
});
vi.mock('../src/services/stickerOcr', () => ({ processStickerImage: vi.fn(() => { throw new Error('OCR must not run'); }) }));

import { createApp } from '../src/app';
import { createAuditLog, databaseAuditEventWriter, type AuditEvent, type AuditEventWriter } from '../src/middleware/auditLog';
import { safeEndpointMetadata, requestedAuditScope, setResolvedAuditReference, terminalAuditScope } from '../src/middleware/safeAuditMetadata';
import { safeDiagnostic } from '../src/middleware/safeAudit';
import { createOperationalMetrics } from '../src/services/operationalMetrics';
import { EXPECTED_SCHEMA_VERSIONS, REQUIRED_COLUMNS, REQUIRED_UNIQUE_INDEXES, checkSchemaReady } from '../src/db/schemaState';
import { authorize } from '../src/middleware/auth';
import { generateAccessToken, generateRefreshToken } from '../src/utils/auth';

const patient = 'SYN-G-MiXeD-patient';
const phi = 'SYNTHETIC_PRIVATE_CLINICAL_TEXT';
const secret = 'synthetic-private-token-marker';
const providerFailure = new Error(`postgresql://synthetic:${secret}@invalid.example/${phi}`);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const token = () => generateAccessToken({ userId: 7, email: 'synthetic-private@example.invalid', role: 'doctor',
  sessionId: 'a7777777-7777-4777-8777-777777777777' });
const variants = [
  { name: 'canonical', change: (path: string) => path },
  { name: 'trailing slash', change: (path: string) => `${path}/` },
  { name: 'uppercase API mount', change: (path: string) => path.replace('/api', '/API') },
  { name: 'uppercase static segments', change: (path: string) => path.toUpperCase() },
  { name: 'uppercase with trailing slash', change: (path: string) => `${path.toUpperCase()}/` },
  { name: 'mixed case with trailing slash', change: (path: string) => `${path.replace(/[a-z]/g, (c, i) => i % 2 ? c.toUpperCase() : c)}/` },
];
const route = (change: (path: string) => string, path: string) => change(path).replace(/:patientId/gi, patient);
const writePaths: { method: 'post' | 'put' | 'patch'; path: string; endpoint?: string; body: object; status?: number }[] = [
  { method: 'post', path: '/api/auth/register', body: { email: 'synthetic@example.invalid', password: testPassword }, status: 403 },
  { method: 'post', path: '/api/auth/login', body: { email: {}, password: secret }, status: 400 },
  { method: 'post', path: '/api/auth/refresh', body: { refreshToken: secret } },
  { method: 'post', path: '/api/auth/logout', body: { refreshToken: secret } },
  { method: 'put', path: '/api/auth/profile', body: { bio: phi } },
  { method: 'post', path: '/api/patients/create', body: { patientId: patient, firstName: phi } },
  { method: 'post', path: '/api/patients/scan-sticker', body: {} },
  { method: 'put', path: '/api/patients/1', endpoint: '/api/patients/:id', body: { firstName: phi } },
  { method: 'patch', path: '/api/patients/1/active', endpoint: '/api/patients/:id/active', body: { is_active: true } },
  { method: 'post', path: '/api/notes/patient/:patientId', body: { noteText: phi } },
  { method: 'post', path: '/api/vitals/patient/:patientId', body: { heartRate: 70, notes: phi } },
  { method: 'post', path: '/api/appointments/create', body: { patientId: patient, appointmentDate: '2026-09-20T12:00:00', reason: phi } },
  { method: 'put', path: '/api/appointments/1/status', endpoint: '/api/appointments/:appointmentId/status', body: { status: 'completed' } },
  { method: 'post', path: '/api/visits/create', body: { patientId: patient, diagnosis: phi } },
  { method: 'post', path: '/api/templates/create', body: { templateName: 'Synthetic', templateText: phi } },
  { method: 'post', path: '/api/analytics/event', body: { eventType: 'search', eventData: { note: phi } } },
  { method: 'post', path: '/api/format-note', body: { text: phi } },
];

let servers: Server[];
let metrics: ReturnType<typeof createOperationalMetrics>;
let log: ReturnType<typeof vi.spyOn>;
let errorLog: ReturnType<typeof vi.spyOn>;
let fetchSpy: ReturnType<typeof vi.spyOn>;
const auditCalls = () => db.query.mock.calls.filter(([sql]) => sql.startsWith('INSERT INTO audit_log'));
const auditDetails = () => auditCalls().map(([, params]) => JSON.parse(params[2]));
const logs = () => [...log.mock.calls, ...errorLog.mock.calls].map(([value]) => JSON.parse(String(value)));

async function listen(app: Express = createApp({ operationalMetrics: metrics })) {
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server;
}

beforeEach(() => {
  servers = [];
  metrics = createOperationalMetrics();
  log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('External network forbidden in Track G tests'));
  db.query.mockReset().mockImplementation(async (sql: string) => {
    if (sql.startsWith('INSERT INTO audit_log')) return { rows: [], rowCount: 1 };
    if (sql.includes('UPDATE sessions')) return { rows: [{ email: 'synthetic-private@example.invalid', role: 'doctor' }] };
    if (sql.includes('FROM clinical_notes')) return { rows: [{ id: 1, patient_id: patient, note_text: phi }] };
    throw new Error('Unexpected database operation in Track G spy harness');
  });
  db.connect.mockReset();
  db.transaction.mockReset().mockRejectedValue(new Error('Unexpected clinical mutation'));
});
afterEach(async () => {
  await Promise.all(servers.map(server => new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()))));
  expect(fetchSpy).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

function assertCorrelated(response: request.Response, endpoint: string, status: number, restrictedKeys: string[] = []) {
  const requestId = response.headers['x-request-id'];
  expect(requestId).toMatch(uuid);
  const events = auditDetails();
  expect(events).toHaveLength(2);
  expect(events.map(event => event.phase)).toEqual(['request_received', 'response_finished']);
  for (const event of events) expect(event).toMatchObject({ requestId, endpoint });
  const commonKeys = ['schemaVersion', 'requestId', 'method', 'endpoint', 'endpointSource', 'endpointResolution', 'phase', 'authentication'];
  expect(Object.keys(events[0]).sort()).toEqual(commonKeys.sort());
  expect(Object.keys(events[1]).sort()).toEqual([...commonKeys, 'status', 'outcome', ...restrictedKeys].sort());
  expect(events[1]).toMatchObject({ status, outcome: status < 400 ? 'success' : 'failure' });
  expect(logs().filter(event => ['request_started', 'request_complete'].includes(event.event))).toEqual([
    expect.objectContaining({ event: 'request_started', requestId, endpoint }),
    expect.objectContaining({ event: 'request_complete', requestId, endpoint, status }),
  ]);
}

describe.each(variants)('accepted API variants: $name', ({ change }) => {
  it('retains authorized patient references only in restricted audit, never clinical text or credentials', async () => {
    const app = await listen();
    const accessToken = token();
    // Single-note GET permits only an optional date, not arbitrary query keys.
    const response = await request(app).get(route(change, '/api/notes/patient/:patientId'))
      .set('Authorization', `Bearer ${accessToken}`).set('X-Request-ID', secret).set('Cookie', `private=${phi}`).expect(200);
    expect(response.body.note.note_text).toBe(phi);
    assertCorrelated(response, '/api/notes/patient/:patientId', 200,
      ['resourceId', 'resourceType', 'referenceSource', 'resolvedPatientId', 'resolvedResourceId']);
    expect(auditDetails()[0].authentication).toBe('not_established');
    expect(auditDetails()[1].authentication).toBe('established');
    expect(auditCalls()[1][1][0]).toBe(7);
    expect(auditDetails()[1]).toMatchObject({ resourceId: patient, resourceType: 'patient_identifier',
      referenceSource: 'requested', resolvedPatientId: patient, resolvedResourceId: 1 });
    expect(auditCalls().map(([, params]) => params[1])).toEqual(Array(2).fill('GET /api/notes/patient/:patientId'));
    const serialized = JSON.stringify({ audits: auditDetails(), operator: logs(), counters: metrics.snapshot() });
    for (const forbidden of [phi, secret, accessToken, 'synthetic-private@example.invalid', 'a7777777']) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(JSON.stringify({ operator: logs(), counters: metrics.snapshot() })).not.toContain(patient);
    // Audit submission happens before the route's session/PHI queries.
    expect(db.query.mock.calls[0][0]).toContain('INSERT INTO audit_log');
    expect(metrics.snapshot()).toMatchObject({ requestsStarted: 1, requestsCompleted: 1,
      auditWritesAttempted: 2, auditWritesSucceeded: 2, auditWritesFailed: 0 });
  });

  it.each([
    ['private/clinical keys', `private=${secret}&clinical=${phi}`],
    ['unrelated patientId parameter', 'patientId=SYN-Distractor'],
    ['former extra-key success fixture', `private=${secret}&patientId=${patient}`],
    ['valid date with extra keys', `date=2026-09-20&patientId=SYN-Distractor&private=${secret}&clinical=${phi}`],
  ])('redacts rejected single-note query (%s) without claiming authorized disclosure', async (_name, query) => {
    const accessToken = token();
    const url = `${route(change, '/api/notes/patient/:patientId')}?${query}`;
    const response = await request(await listen()).get(url).set('Authorization', `Bearer ${accessToken}`)
      .set('X-Request-ID', secret).set('Cookie', `private=${phi}`).expect(400);
    expect(response.body).toEqual({ error: 'Invalid request fields' });
    // Exact event-key assertions exclude all requested/resolved references and
    // list scope. A supplied valid token is not an authorization/disclosure event.
    assertCorrelated(response, '/api/notes/patient/:patientId', 400);
    expect(auditDetails().every(event => event.authentication === 'not_established')).toBe(true);
    expect(auditCalls().map(([, params]) => params[0])).toEqual([null, null]);
    expect(db.query.mock.calls.every(([sql]) => sql.startsWith('INSERT INTO audit_log'))).toBe(true);
    expect(db.transaction).not.toHaveBeenCalled();
    const serialized = JSON.stringify({ audits: auditDetails(), operator: logs(), counters: metrics.snapshot() });
    for (const forbidden of [query, url, patient, 'SYN-Distractor', phi, secret, accessToken,
      'synthetic-private@example.invalid', 'a7777777']) expect(serialized).not.toContain(forbidden);
    expect(metrics.snapshot()).toMatchObject({ requestsStarted: 1, requestsCompleted: 1,
      auditWritesAttempted: 2, auditWritesSucceeded: 2, auditWritesFailed: 0 });
  });

  it.each([
    ['/api/patients', '/api/patients'], ['/api/patients/search?patientId=SYN-G', '/api/patients/search'],
    ['/api/patients/:patientId', '/api/patients/:id'], ['/api/auth/profile', '/api/auth/profile'],
    ['/api/notes/patient/:patientId/history', '/api/notes/patient/:patientId/history'],
    ['/api/vitals/patient/:patientId/latest', '/api/vitals/patient/:patientId/latest'],
    ['/api/vitals/patient/:patientId/history', '/api/vitals/patient/:patientId/history'],
    ['/api/appointments/upcoming', '/api/appointments/upcoming'],
    ['/api/appointments/patient/:patientId/history', '/api/appointments/patient/:patientId/history'],
    ['/api/visits/patient/:patientId', '/api/visits/patient/:patientId'], ['/api/visits/doctor/today', '/api/visits/doctor/today'],
    ['/api/templates/list', '/api/templates/list'], ['/api/templates/category/:patientId', '/api/templates/category/:category'],
    ['/api/analytics/dashboard', '/api/analytics/dashboard'],
    ['/api/analytics/patient/:patientId/trends', '/api/analytics/patient/:patientId/trends'],
  ])('correlates denied reads %s with bounded endpoint metadata', async (path, endpoint) => {
    const [pathname, search] = path.split('?');
    const url = route(change, pathname) + (search ? `?${search}` : '');
    const response = await request(await listen()).get(url).set('Authorization', `Bearer ${secret}`).expect(401);
    assertCorrelated(response, endpoint, 401);
    expect(JSON.stringify(auditDetails())).not.toContain(patient);
  });

  it('audits a public successful route without claiming authentication', async () => {
    const response = await request(await listen()).get(route(change, '/api/auth/capabilities')).expect(200);
    assertCorrelated(response, '/api/auth/capabilities', 200);
    expect(auditDetails()[1].authentication).toBe('not_established');
  });

  it.each(writePaths)('correlates accepted write route $method $path without body leakage', async ({ method, path, endpoint, body, status = 401 }) => {
    const response = await request(await listen())[method](route(change, path)).send(body).expect(status);
    assertCorrelated(response, endpoint ?? path, status);
    expect(auditDetails()[1].method).toBe(method.toUpperCase());
    const serialized = JSON.stringify({ logs: logs(), audits: auditDetails() });
    for (const forbidden of [phi, secret, patient, 'synthetic@example.invalid', testPassword]) expect(serialized).not.toContain(forbidden);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('traces validation failures with no request-body or refresh-token leakage', async () => {
    const response = await request(await listen()).post(route(change, '/api/auth/refresh'))
      .send({ refreshToken: { secret }, noteText: phi }).expect(400);
    assertCorrelated(response, '/api/auth/refresh', 400);
    expect(JSON.stringify({ logs: logs(), audits: auditDetails() })).not.toMatch(new RegExp(`${phi}|${secret}`));
  });
});

describe('safe audit foundation', () => {
  it.each(['/api', '/API/', '/API/unknown/SYNTHETIC_PRIVATE_CLINICAL_TEXT', '/api/auth/%72egister',
    '/API/AUTH/REGISTER//', '/api/notes/patient/SYN-G/history/extra'])('audits unmatched %s without copying raw paths', async path => {
    const response = await request(await listen()).get(`${path}?token=${secret}`).expect(404);
    assertCorrelated(response, '/api/unmatched', 404);
    expect(auditDetails()[1]).toMatchObject({ endpointSource: 'unmatched', endpointResolution: 'unmatched' });
    expect(JSON.stringify({ logs: logs(), audits: auditDetails() })).not.toMatch(new RegExp(`${phi}|${secret}`));
  });

  it.each(['/apiculture', '/x/api/notes', '/health', '/metrics', '/api/metrics'])('does not expose counters publicly at %s', async path => {
    const result = await request(await listen()).get(path).expect(path === '/health' ? 200 : 404);
    expect(JSON.stringify(result.body)).not.toContain('auditWrites');
    expect(auditCalls()).toHaveLength(path === '/api/metrics' ? 2 : 0);
  });

  it('keeps permission denials correlated, including an authenticated actor', async () => {
    const app = express(); app.use(createAuditLog(databaseAuditEventWriter, metrics));
    app.get('/api/notes/patient/:patientId', (req, _res, next) => {
      req.user = { userId: 7, email: 'synthetic@example.invalid', role: 'viewer', sessionId: secret }; next();
    }, authorize('doctor'), (_req, res) => res.json({ note: phi }));
    const response = await request(await listen(app)).get(`/API/NOTES/PATIENT/${patient}/`).expect(403);
    assertCorrelated(response, '/api/notes/patient/:patientId', 403);
    expect(auditDetails()[1]).toMatchObject({ authentication: 'established', outcome: 'failure' });
  });

  it('catches injected audit DB failures without fail-closing ordinary reads or logging provider errors', async () => {
    const normal = db.query.getMockImplementation()!;
    db.query.mockImplementation((sql, params) => sql.startsWith('INSERT INTO audit_log') ? Promise.reject(providerFailure) : normal(sql, params));
    const response = await request(await listen()).get(`/api/notes/patient/${patient}`).set('Authorization', `Bearer ${token()}`).expect(200);
    expect(response.body.note.note_text).toBe(phi);
    expect(metrics.snapshot()).toMatchObject({ auditWritesAttempted: 2, auditWritesSucceeded: 0, auditWritesFailed: 2 });
    expect(errorLog).toHaveBeenCalledTimes(2);
    for (const event of logs().filter(event => event.event === 'audit_write_failed')) {
      expect(event).toMatchObject({ requestId: response.headers['x-request-id'], endpointSource: 'notes' });
      expect(Object.keys(event).sort()).toEqual(['durationMs', 'endpoint', 'endpointResolution', 'endpointSource', 'event', 'method', 'phase', 'requestId', 'status'].filter(key => event[key] !== undefined).sort());
    }
    expect(JSON.stringify(logs())).not.toMatch(new RegExp(`${phi}|${secret}|postgresql|stack|synthetic-private@`));
  });

  it('catches synchronous writer throws using the same safe failure signal', async () => {
    const writer: AuditEventWriter = { write: vi.fn(() => { throw providerFailure; }) };
    const response = await request(await listen(createApp({ auditWriter: writer, operationalMetrics: metrics })))
      .get('/API/AUTH/CAPABILITIES/').expect(200);
    expect(writer.write).toHaveBeenCalledTimes(2);
    expect(metrics.snapshot().auditWritesFailed).toBe(2);
    expect(logs().filter(event => event.event === 'audit_write_failed').every(event => event.requestId === response.headers['x-request-id'])).toBe(true);
    expect(JSON.stringify(logs())).not.toContain(providerFailure.message);
  });

  it('does not await the best-effort sink before preparing a clinical response', async () => {
    const complete: (() => void)[] = [];
    const received: AuditEvent[] = [];
    const writer: AuditEventWriter = { write: event => { received.push(event); return new Promise<void>(resolve => complete.push(resolve)); } };
    const response = await request(await listen(createApp({ auditWriter: writer, operationalMetrics: metrics })))
      .get(`/api/notes/patient/${patient}`).set('Authorization', `Bearer ${token()}`).expect(200);
    expect(response.body.note.note_text).toBe(phi);
    expect(received.map(event => event.details.phase)).toEqual(['request_received', 'response_finished']);
    expect(metrics.snapshot().auditWritesSucceeded).toBe(0);
    complete.forEach(resolve => resolve());
    await Promise.resolve();
    expect(metrics.snapshot().auditWritesSucceeded).toBe(2);
  });

  it('records exactly one abort terminal event and does not mistake it for success', async () => {
    const events: AuditEvent[] = [];
    const writer: AuditEventWriter = { write: async event => { events.push(event); } };
    const req = { path: `/API/NOTES/PATIENT/${patient}`, method: 'GET', ip: 'untrusted-forwarded-token',
      socket: { remoteAddress: '127.0.0.1' }, query: { token: secret }, body: { note: phi },
      route: { path: secret }, baseUrl: phi } as unknown as Request;
    const res = Object.assign(new EventEmitter(), { setHeader: vi.fn(), statusCode: 200, writableFinished: false });
    const next = vi.fn();
    createAuditLog(writer, metrics)(req, res as unknown as Response, next);
    res.emit('close'); res.emit('finish'); res.emit('close');
    await Promise.resolve();
    expect(next).toHaveBeenCalledOnce();
    expect(events).toHaveLength(2);
    expect(events[1].details).toMatchObject({ phase: 'response_aborted', outcome: 'aborted' });
    expect(events[1].ipAddress).toBeNull();
    expect(metrics.snapshot()).toMatchObject({ requestsAborted: 1, requestsCompleted: 0 });
    expect(JSON.stringify(events)).not.toMatch(new RegExp(`${phi}|${secret}|${patient}`));
  });

  it('audits CORS, malformed JSON and malformed parameter rejection before handlers', async () => {
    const app = await listen();
    const cases = [
      request(app).get('/API/PATIENTS/').set('Origin', 'https://synthetic-denied.invalid').expect(403),
      request(app).post('/API/AUTH/REFRESH/').set('Content-Type', 'application/json').send(`{"${secret}":`).expect(400),
      request(app).get('/API/NOTES/PATIENT/%E0%A4%A').expect(400),
    ];
    for (const pending of cases) {
      const response = await pending;
      expect(auditDetails().filter(event => event.requestId === response.headers['x-request-id'])).toHaveLength(2);
    }
    expect(JSON.stringify(logs())).not.toContain(secret);
  });

  it('audits HEAD and automatic preflight without incorrectly claiming a human read', async () => {
    const app = await listen();
    await request(app).head('/API/AUTH/CAPABILITIES/').expect(200);
    await request(app).options('/API/NOTES/PATIENT/SYN-G/').set('Origin', 'http://localhost:5173').expect(204);
    expect(auditDetails().map(event => event.method)).toEqual(['HEAD', 'HEAD', 'OPTIONS', 'OPTIONS']);
    expect(auditDetails().every(event => event.authentication === 'not_established')).toBe(true);
  });

  it('keeps the audit and operator correlation for early rate-limit rejection', async () => {
    const app = await listen();
    for (let i = 0; i < 30; i++) await request(app).post('/API/AUTH/LOGIN/').send({}).expect(400);
    const limited = await request(app).post('/API/AUTH/LOGIN/').send({ password: secret }).expect(429);
    const requestId = limited.headers['x-request-id'];
    expect(auditDetails().filter(event => event.requestId === requestId)).toEqual([
      expect.objectContaining({ phase: 'request_received', endpoint: '/api/auth/login' }),
      expect.objectContaining({ phase: 'response_finished', endpoint: '/api/auth/login', status: 429, outcome: 'failure' }),
    ]);
    expect(logs()).toContainEqual(expect.objectContaining({ event: 'request_complete', requestId, status: 429 }));
  });

  it('keeps internal failure counts if the console transport also throws', async () => {
    log.mockImplementation(() => { throw providerFailure; });
    errorLog.mockImplementation(() => { throw providerFailure; });
    const writer: AuditEventWriter = { write: async () => { throw providerFailure; } };
    await request(await listen(createApp({ auditWriter: writer, operationalMetrics: metrics })))
      .get('/API/AUTH/CAPABILITIES/').expect(200);
    expect(metrics.snapshot()).toMatchObject({ auditWritesFailed: 2, requestsCompleted: 1 });
  });

  it('bounds method, route and metric cardinality even with attacker-controlled URLs', async () => {
    const snapshots = [];
    for (let i = 0; i < 1000; i++) {
      snapshots.push(safeEndpointMetadata({ method: `USER-${i}`, path: `/API/unknown/${i}/${secret}` } as Request));
      metrics.increment('requestsStarted');
    }
    expect(new Set(snapshots.map(value => JSON.stringify(value))).size).toBe(1);
    expect(snapshots[0]).toMatchObject({ endpoint: '/api/unmatched', method: 'OTHER' });
    const snapshot = metrics.snapshot();
    expect(Object.keys(snapshot)).toHaveLength(7);
    expect(Object.isFrozen(snapshot)).toBe(true);
    metrics.increment('requestsStarted');
    expect(snapshot.requestsStarted).toBe(1000);
    expect(metrics.snapshot().requestsStarted).toBe(1001);
  });
});

describe('restricted reference boundary corrections', () => {
  it.each(variants)('distinguishes two successful searches and note reads: $name', async ({ change }) => {
    const normal = db.query.getMockImplementation()!;
    db.query.mockImplementation((sql, params) => {
      if (sql.includes('FROM clinical_notes cn') || sql.includes('FROM patients p WHERE patient_id')) {
        return Promise.resolve({ rows: [{ id: params[0] === patient ? 11 : 22, patient_id: params[0], note_text: phi }] });
      }
      return normal(sql, params);
    });
    const app = await listen();
    for (const id of [patient, 'SYN-G-Second']) {
      for (const [url, field] of [[`${change('/api/patients/search')}?patientId=${id}&private=${secret}`, 'patient'],
        [`${route(change, '/api/notes/patient/:patientId').replace(patient, id)}?date=2026-09-20`, 'note']]) {
        const response = await request(app).get(url).set('Authorization', `Bearer ${token()}`).expect(200);
        expect(response.body[field]).toMatchObject({ patient_id: id, id: id === patient ? 11 : 22 });
        const events = auditDetails().filter(event => event.requestId === response.headers['x-request-id']);
        expect(events).toHaveLength(2);
        expect(events[0]).not.toHaveProperty('resourceId');
        expect(events[1]).toMatchObject({ phase: 'response_finished', status: 200, outcome: 'success',
          authentication: 'established', resourceId: id, referenceSource: 'requested',
          resourceType: 'patient_identifier', resolvedPatientId: id, resolvedResourceId: id === patient ? 11 : 22 });
      }
    }
    expect(JSON.stringify(auditDetails())).not.toMatch(new RegExp(`${phi}|${secret}`));
    expect(JSON.stringify({ operator: logs(), metrics: metrics.snapshot() })).not.toMatch(new RegExp(`${patient}|SYN-G-Second|${phi}|${secret}`));
  });

  it('labels an empty successful search as requested, not a resolved patient', async () => {
    const normal = db.query.getMockImplementation()!;
    db.query.mockImplementation((sql, params) => sql.includes('FROM patients p WHERE patient_id')
      ? Promise.resolve({ rows: [] }) : normal(sql, params));
    const response = await request(await listen()).get(`/api/patients/search?patientId=${patient}`).set('Authorization', `Bearer ${token()}`).expect(200);
    expect(response.body).toEqual({ exists: false, patient: null });
    expect(auditDetails()[1]).toMatchObject({ resourceId: patient, referenceSource: 'requested' });
    expect(auditDetails()[1]).not.toHaveProperty('resolvedPatientId');
  });

  it.each(['A.1_é-9', '000012', '界'.repeat(50)])('preserves valid decoded identifiers exactly: %s', async id => {
    const normal = db.query.getMockImplementation()!;
    db.query.mockImplementation((sql, params) => sql.includes('FROM clinical_notes') ? Promise.resolve({ rows: [] }) : normal(sql, params));
    await request(await listen()).get(`/API/NOTES/PATIENT/${encodeURIComponent(id)}/`).set('Authorization', `Bearer ${token()}`).expect(200);
    expect(auditDetails()[1]).toMatchObject({ resourceId: id, resourceType: 'patient_identifier', referenceSource: 'requested' });
    expect(auditDetails()[1]).not.toHaveProperty('resolvedPatientId');
    expect(JSON.stringify(logs())).not.toContain(id);
  });

  it.each(['', 'A B', 'A\nB', 'x'.repeat(51), '%41', 'x/y', 'x?token', 'x@host'])('rejects unsafe search reference %j without retaining it', async value => {
    await request(await listen()).get(`/api/patients/search?patientId=${encodeURIComponent(value)}`).set('Authorization', `Bearer ${token()}`).expect(400);
    expect(auditDetails().every(event => event.resourceId === undefined)).toBe(true);
  });

  it.each(['patientId=A&patientId=B', 'patientId[x]=A', 'patientId.x=A'])('rejects query reference collections: %s', async query => {
    await request(await listen()).get(`/api/patients/search?${query}`).set('Authorization', `Bearer ${token()}`).expect(400);
    expect(auditDetails().every(event => event.resourceId === undefined)).toBe(true);
  });

  it('does not treat patientId query keys on unrelated endpoints as patient context', async () => {
    await request(await listen()).get(`/api/auth/capabilities?patientId=${patient}`).expect(200);
    expect(auditDetails().every(event => event.resourceId === undefined)).toBe(true);
    expect(JSON.stringify(logs())).not.toContain(patient);
  });

  it('retains bounded list scope, not raw cursors, queries or result sets', async () => {
    const req = { method: 'GET', path: '/API/VISITS/PATIENT/SYN-G/', query: { limit: '7', cursor: secret, filter: 'upcoming', private: phi } } as unknown as Request;
    expect(requestedAuditScope(req, safeEndpointMetadata(req))).toEqual({ resourceId: 'SYN-G', resourceType: 'patient_identifier',
      referenceSource: 'requested', listScope: { kind: 'patient_history', limit: 7, continuation: true, filter: 'upcoming' } });
    const normal = db.query.getMockImplementation()!;
    db.query.mockImplementation((sql, params) => sql.includes('FROM patients\n') ? Promise.resolve({ rows: [] }) : normal(sql, params));
    await request(await listen()).get(`/API/PATIENTS/?limit=3&offset=2&private=${secret}`).set('Authorization', `Bearer ${token()}`).expect(200);
    expect(auditDetails()[1].listScope).toEqual({ kind: 'shared_patient_directory', limit: 3, offset: 2, continuation: false });
    expect(auditDetails()[1]).not.toHaveProperty('resourceId');
    expect(JSON.stringify({ audits: auditDetails(), logs: logs() })).not.toContain(secret);
  });

  it('does not trust raw route/baseUrl or attach mismatched resolved context', () => {
    const req = { method: 'GET', path: '/api/unknown', query: { patientId: patient }, params: { patientId: patient },
      route: { path: '/api/patients/search' }, baseUrl: '/api/patients' } as unknown as Request;
    setResolvedAuditReference(req, patient, 4);
    expect(terminalAuditScope(req, requestedAuditScope(req, safeEndpointMetadata(req)))).toEqual({});
    const other = { ...req, path: '/api/notes/patient/SYN-Other' } as Request;
    setResolvedAuditReference(other, patient, 4);
    expect(terminalAuditScope(other, requestedAuditScope(other, safeEndpointMetadata(other)))).toEqual({
      resourceId: 'SYN-Other', resourceType: 'patient_identifier', referenceSource: 'requested' });
  });
});

describe('safely correlated originating-component diagnostics', () => {
  it.each(variants)('identifies authentication DB failure on a notes endpoint: $name', async ({ change }) => {
    const normal = db.query.getMockImplementation()!;
    db.query.mockImplementation((sql, params) => sql.includes('UPDATE sessions') ? Promise.reject(providerFailure) : normal(sql, params));
    const response = await request(await listen()).get(route(change, '/api/notes/patient/:patientId')).set('Authorization', `Bearer ${token()}`).expect(503);
    expect(logs()).toContainEqual({ event: 'authentication_unavailable', sourceCategory: 'authentication', requestId: response.headers['x-request-id'] });
    expect(logs()).toContainEqual(expect.objectContaining({ event: 'request_complete', endpointSource: 'notes', requestId: response.headers['x-request-id'], status: 503 }));
    expect(auditDetails()[1]).not.toHaveProperty('resourceId');
    expect(JSON.stringify({ logs: logs(), audits: auditDetails(), metrics: metrics.snapshot() })).not.toMatch(new RegExp(`${patient}|${phi}|${secret}|postgresql|stack`));
  });

  const failures: { method: 'get' | 'post' | 'put' | 'patch'; path: string; source: string; event: string; body?: object }[] = [
    { method: 'post', path: '/api/auth/login', source: 'auth', event: 'login_failed', body: { email: 'synthetic-private@example.invalid', password: secret } },
    { method: 'get', path: '/api/auth/profile', source: 'auth', event: 'profile_fetch_failed' },
    { method: 'put', path: '/api/auth/profile', source: 'auth', event: 'profile_update_failed', body: { bio: phi } },
    { method: 'get', path: `/api/notes/patient/${patient}`, source: 'notes', event: 'note_read_failed' },
    { method: 'get', path: `/api/notes/patient/${patient}/history`, source: 'notes', event: 'note_history_failed' },
    { method: 'post', path: `/api/notes/patient/${patient}`, source: 'notes', event: 'note_write_failed', body: { noteText: phi } },
    { method: 'get', path: '/api/patients', source: 'patients', event: 'patients_list_failed' },
    { method: 'get', path: `/api/patients/search?patientId=${patient}`, source: 'patients', event: 'patient_search_failed' },
    { method: 'get', path: `/api/patients/${patient}`, source: 'patients', event: 'patient_read_failed' },
    { method: 'post', path: '/api/patients/create', source: 'patients', event: 'patient_create_failed', body: { patientId: patient } },
    { method: 'put', path: '/api/patients/1', source: 'patients', event: 'patient_update_failed', body: { firstName: phi } },
    { method: 'patch', path: '/api/patients/1/active', source: 'patients', event: 'patient_status_failed', body: { is_active: true } },
    { method: 'post', path: `/api/vitals/patient/${patient}`, source: 'vitals', event: 'vitals_write_failed', body: { heartRate: 70, notes: phi } },
    { method: 'get', path: `/api/vitals/patient/${patient}/latest`, source: 'vitals', event: 'vitals_read_failed' },
    { method: 'get', path: `/api/vitals/patient/${patient}/history`, source: 'vitals', event: 'vitals_history_failed' },
    { method: 'post', path: '/api/appointments/create', source: 'appointments', event: 'appointment_write_failed', body: { patientId: patient, appointmentDate: '2026-09-20T12:00:00', reason: phi } },
    { method: 'get', path: '/api/appointments/upcoming', source: 'appointments', event: 'appointments_read_failed' },
    { method: 'put', path: '/api/appointments/1/status', source: 'appointments', event: 'appointment_status_failed', body: { status: 'completed' } },
    { method: 'get', path: `/api/appointments/patient/${patient}/history`, source: 'appointments', event: 'appointment_history_failed' },
    { method: 'post', path: '/api/visits/create', source: 'visits', event: 'visit_write_failed', body: { patientId: patient, diagnosis: phi } },
    { method: 'get', path: `/api/visits/patient/${patient}`, source: 'visits', event: 'visit_history_failed' },
    { method: 'get', path: '/api/visits/doctor/today', source: 'visits', event: 'visits_today_failed' },
    { method: 'post', path: '/api/templates/create', source: 'templates', event: 'template_write_failed', body: { templateName: 'Synthetic', templateText: phi } },
    { method: 'get', path: '/api/templates/list', source: 'templates', event: 'templates_read_failed' },
    { method: 'get', path: '/api/templates/category/General', source: 'templates', event: 'templates_category_failed' },
    { method: 'get', path: '/api/analytics/dashboard', source: 'analytics', event: 'analytics_read_failed' },
    { method: 'get', path: `/api/analytics/patient/${patient}/trends`, source: 'analytics', event: 'patient_trends_failed' },
    { method: 'post', path: '/api/analytics/event', source: 'analytics', event: 'analytics_write_failed', body: { eventType: 'search', eventData: { note: phi } } },
  ];
  it.each(failures)('correlates $event without logging driver error, query or payload', async ({ method, path, source, event, body }) => {
    const normal = db.query.getMockImplementation()!;
    db.query.mockImplementation((sql, params) => {
      if (sql.startsWith('INSERT INTO audit_log') || sql.includes('UPDATE sessions')) return normal(sql, params);
      if (sql === 'SELECT patient_id FROM patients WHERE patient_id = $1') return Promise.resolve({ rows: [{ patient_id: patient }] });
      return Promise.reject(providerFailure);
    });
    db.transaction.mockRejectedValue(providerFailure);
    const pending = request(await listen())[method](path).set('Authorization', `Bearer ${token()}`).set('X-Request-ID', secret);
    const response = await (body ? pending.send(body) : pending).expect(500);
    expect(logs()).toContainEqual({ event, sourceCategory: source, requestId: response.headers['x-request-id'] });
    expect(logs()).toContainEqual(expect.objectContaining({ event: 'request_complete', requestId: response.headers['x-request-id'], status: 500 }));
    expect(auditDetails()[1]).not.toHaveProperty('resourceId');
    if (event === 'note_write_failed') expect(db.transaction).toHaveBeenCalledOnce();
    expect(JSON.stringify({ logs: logs(), audits: auditDetails() })).not.toMatch(new RegExp(`${patient}|${phi}|${secret}|postgresql|stack|synthetic-private@`));
  });

  it.each(['refresh', 'logout'])('correlates %s DB failures without serializing either credential', async operation => {
    const normal = db.query.getMockImplementation()!;
    db.query.mockImplementation((sql, params) => sql.includes('UPDATE sessions') ? Promise.reject(providerFailure) : normal(sql, params));
    const refreshToken = generateRefreshToken({ userId: 7, email: 'synthetic-private@example.invalid', role: 'doctor', sessionId: 'a7777777-7777-4777-8777-777777777777' });
    const response = await request(await listen()).post(`/API/AUTH/${operation}/`).send({ refreshToken }).expect(500);
    expect(logs()).toContainEqual({ event: `${operation}_failed`, sourceCategory: 'auth', requestId: response.headers['x-request-id'] });
    expect(JSON.stringify(logs())).not.toMatch(new RegExp(`${phi}|${secret}|postgresql|stack`));
    expect(JSON.stringify(logs())).not.toContain(refreshToken);
  });

  it('rejects unknown diagnostic events and invalid correlation values at runtime', () => {
    const req = { requestId: secret } as Request;
    safeDiagnostic(req, secret as Parameters<typeof safeDiagnostic>[1]);
    expect(errorLog).not.toHaveBeenCalled();
    safeDiagnostic(req, 'note_write_failed');
    expect(logs()).toEqual([{ event: 'note_write_failed', sourceCategory: 'notes' }]);
    errorLog.mockImplementation(() => { throw providerFailure; });
    expect(() => safeDiagnostic(req, 'note_write_failed')).not.toThrow();
  });
});

describe('real schema readiness contract with a controlled pool', () => {
  function schemaPool(mode: 'ready' | 'missing-migration' | 'future-migration' | 'missing-column' | 'missing-ledger' | 'missing-index' | 'driver-error') {
    const columns = Object.entries(REQUIRED_COLUMNS).flatMap(([table_name, names]) => names.map(column_name => ({ table_name, column_name, data_type: 'text' })));
    columns.push({ table_name: 'schema_migrations', column_name: 'version', data_type: 'integer' });
    const versions = [...EXPECTED_SCHEMA_VERSIONS] as number[];
    if (mode === 'missing-migration') versions.pop(); // Follows E's central version set, including future D v3.
    if (mode === 'future-migration') versions.push(Math.max(...versions) + 1);
    if (mode === 'missing-column') columns.splice(columns.findIndex(row => row.table_name === 'audit_log'), 1);
    const client = { release: vi.fn(), query: vi.fn(async (sql: string) => {
      if (mode === 'driver-error') throw providerFailure;
      if (sql.includes('information_schema.columns')) return { rows: columns };
      if (sql.includes('FROM pg_index')) return { rows: [{ present: mode !== 'missing-index' }] };
      if (sql.includes('SELECT EXISTS')) return { rows: [{ present: mode !== 'missing-ledger' }] };
      if (sql.startsWith('SELECT version')) return { rows: versions.map(version => ({ version })) };
      return { rows: [] };
    }) };
    db.connect.mockResolvedValue(client);
    return client;
  }

  it('awaits the real schema check and does not substitute SELECT 1', async () => {
    const client = schemaPool('ready');
    const result = await request(await listen()).get('/ready').expect(200);
    expect(result.body).toEqual({ status: 'ready' });
    expect(client.query.mock.calls.map(([sql]) => sql)).toContain('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    expect(client.query.mock.calls.map(([sql]) => sql)).toContain('SELECT version FROM schema_migrations ORDER BY version');
    expect(client.query.mock.calls.map(([sql]) => sql)).not.toContain('SELECT 1');
    expect(EXPECTED_SCHEMA_VERSIONS).toEqual([1, 2, 3]);
    expect(client.query.mock.calls.filter(([sql]) => sql.includes('FROM pg_index'))).toHaveLength(REQUIRED_UNIQUE_INDEXES.length);
    expect(client.release).toHaveBeenCalledOnce();
    expect(auditCalls()).toHaveLength(0);
  });

  it.each(['missing-migration', 'future-migration', 'missing-column', 'missing-ledger', 'missing-index', 'driver-error'] as const)
  ('returns sanitized 503 for %s while liveness remains independent', async mode => {
    schemaPool(mode);
    const app = await listen();
    const result = await request(app).get('/READY/').expect(503);
    expect(result.body).toEqual({ status: 'unavailable' });
    await request(app).get('/health').expect(200, { status: 'ok' });
    expect(metrics.snapshot().readinessFailures).toBe(1);
    expect(JSON.stringify({ result: result.body, logs: logs() })).not.toMatch(new RegExp(`${phi}|${secret}|schema_migrations|version`));
    expect(errorLog).not.toHaveBeenCalled();
    expect(auditCalls()).toHaveLength(0);
  });

  it('does not cache readiness after a required migration becomes unavailable', async () => {
    schemaPool('ready');
    const app = await listen();
    await request(app).get('/ready').expect(200);
    schemaPool('missing-migration');
    await request(app).get('/ready').expect(503, { status: 'unavailable' });
    expect(db.connect).toHaveBeenCalledTimes(2);
  });

  it('preserves the sanitized E error contract on connection failure', async () => {
    db.connect.mockRejectedValue(providerFailure);
    await expect(checkSchemaReady()).rejects.toMatchObject({ name: 'SchemaNotReadyError', message: 'database_schema_not_ready' });
    await request(await listen()).get('/ready').expect(503, { status: 'unavailable' });
    expect(metrics.snapshot().readinessFailures).toBe(1);
  });
});
