import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { validateRequest } from '../src/middleware/validation';
import { assertSupportedPostgres } from './helpers/supportedPg';
import { randomBytes } from 'node:crypto';
import { testPassword } from './helpers/syntheticSecrets';
import { auditDatabaseUrl } from './helpers/auditDatabase';

// No environment files, OCR, external AI, existing schemas or production data.
vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));
vi.mock('../src/services/stickerOcr', () => ({ processStickerImage: vi.fn(() => { throw new Error('OCR must not run'); }) }));

type Method = 'get' | 'post' | 'put' | 'patch';
const variants = [
  { name: 'canonical lowercase', change: (path: string) => path },
  { name: 'lowercase trailing slash', change: (path: string) => `${path}/` },
  { name: 'uppercase endpoint', change: (path: string) => path.replace(/[^/]+$/, segment => segment.toUpperCase()) },
  { name: 'uppercase route and API mount', change: (path: string) => path.toUpperCase() },
  { name: 'uppercase route with trailing slash', change: (path: string) => `${path.toUpperCase()}/` },
  { name: 'uppercase API mount only', change: (path: string) => path.replace('/api/', '/API/') },
  { name: 'mixed-case route with trailing slash', change: (path: string) => `${path.replace(/[a-z]/g, (letter, index: number) => index % 2 ? letter.toUpperCase() : letter)}/` },
];
type Variant = typeof variants[number];
const mixedId = 'Syn-MiXeD-01';
const route = (variant: Variant, path: string, id = mixedId) => variant.change(path).replace(/:patientId/gi, id);
const invalidFields = { error: 'Invalid request fields' };
const unicodeId = 'Syn-É中９_Ω.01';
const boundaryId = 'MiXeD-' + 'a'.repeat(44);
const acceptedIdentifiers = [mixedId, mixedId.toLowerCase(), unicodeId, boundaryId, '123456789012345'];
const encodeEveryCharacter = (value: string) => [...Buffer.from(value)].map(byte => `%${byte.toString(16).padStart(2, '0')}`).join('');
// Include every ASCII control at both boundaries: trim() used to hide several
// of these. Also cover Unicode whitespace, invisible characters and line breaks.
const forbiddenEdges = [...Array.from({ length: 33 }, (_, index) => String.fromCharCode(index === 32 ? 127 : index)),
  ' ', '\u0085', '\u00a0', '\u1680', '\u2000', '\u200b', '\u2028', '\u2029', '\u202f', '\u205f', '\u3000', '\ufeff', '\r\n'];
const invalidIdentifierValues = (id: string) => [
  ...forbiddenEdges.flatMap(character => [`${character}${id}`, `${id}${character}`]),
  `${' '.repeat(60)}${id}`, `${id}${' '.repeat(60)}`, `${id.slice(0, 2)} ${id.slice(2)}`,
  `${id.slice(0, 2)}\t${id.slice(2)}`, `${id}/other`, `${id}\\other`, `${id}%`, `${id}😀`,
];
const invalidPatientValues = [...invalidIdentifierValues(mixedId), 'a'.repeat(51), 'é'.repeat(51), ' ', '\r\n'];
const invalidPatientEncodings = [...invalidPatientValues.map(encodeURIComponent),
  '%2553yn-MiXeD-01', `${mixedId}%250a`, `${mixedId}%2520`, 'bad%252Fid', '%E0%A4%A'];
const internalPaths: { method: Method; path: string; body?: object }[] = [
  { method: 'put', path: '/api/patients/:patientId', body: { firstName: 'UNCHANGED_IF_REJECTED' } },
  { method: 'patch', path: '/api/patients/:patientId/active', body: { is_active: false } },
  { method: 'put', path: '/api/appointments/:patientId/status', body: { status: 'cancelled' } },
];
const invalidInternalEncodings = [...invalidIdentifierValues('1'), '2147483648', '00000000001', '1e2', '-1', '１', '١']
  .map(encodeURIComponent).concat('%2531', '1%250a', '%E0%A4%A');

const queryPatientIds = ['Syn-Query-MiXeD-01', 'syn-query-mixed-01'];
const requestedDay = '2035-02-28';
const leapDay = '2036-02-29';
const noteMarker = (patientId: string, day: string) => `SYNTHETIC_QUERY_NOTE_${patientId}_${day}`;
const malformedNoteQueries = [
  'date=2035-02-30', 'date=2035-02-29', 'date=2035-13-01', 'date=2035-00-01', 'date=2035-02-00',
  'date=', 'date', 'date=null', 'date=undefined', 'date=true', 'date=20350228',
  'date=2035-2-28', 'date=2035-02-28T00%3A00%3A00Z', 'date=+2035-02-28', 'date=2035-02-28%0A',
  'date=%222035-02-28%22', 'date=%7B%22value%22%3A%222035-02-28%22%7D', 'date=%5B%222035-02-28%22%5D',
  'date=2035-02-28&date=2035-02-28', 'date=2035-02-28&date=2036-02-29',
  'date=&date=2035-02-28', 'date=2035-02-28&date=',
  ...['2035-02-30', requestedDay].flatMap(value => [
    `date[x]=${value}`, `date.value=${value}`, `date%5Bx%5D=${value}`, `date%2Evalue=${value}`,
    `date[]=${value}`, `date[0]=${value}`, `date[x][value]=${value}`,
    `date[__proto__]=${value}`, `date[constructor]=${value}`, `date[toString]=${value}`,
    `date[=${value}`, `date]=${value}`, `date%255Bx%255D=${value}`,
    `Date=${value}`, `DATE=${value}`, `date%00=${value}`, `%20date=${value}`,
    `date=${requestedDay}&date[x]=${value}`, `date.value=${value}&date=${requestedDay}`,
  ]),
  // Single-note reads have no alternate patient/date selector or pagination.
  'patientId=other', 'patientId[x]=other', 'limit=1', 'limit[x]=1', 'offset=0',
  'cursor=not-a-date', 'cursor[value]=not-a-date', 'filter=all', 'filter[x]=all',
];

// Reuse one loopback listener per harness instead of binding/closing an ephemeral
// port for each of the matrix's hundreds of requests. Always close it on cleanup.
async function listen(app: Express) {
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server;
}
async function close(server?: Server) {
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

// Each current body schema has both a rejecting fixture and an accepted fixture.
// Probe routes use Express's real default matcher, with the same /api mount as
// production. This checks every schema without invoking unrelated write services.
const bodyCases: { method: Method; path: string; invalid: object; valid: object }[] = [
  { method: 'post', path: '/api/auth/register', invalid: { email: 'synthetic@example.invalid', password: 'x' }, valid: { email: 'synthetic@example.invalid', password: testPassword } },
  { method: 'post', path: '/api/auth/login', invalid: { email: {}, password: 'x' }, valid: { email: 'synthetic@example.invalid', password: testPassword } },
  { method: 'post', path: '/api/auth/refresh', invalid: { refreshToken: {} }, valid: { refreshToken: 'Case-SENSITIVE-token' } },
  { method: 'post', path: '/api/auth/logout', invalid: { refreshToken: 'synthetic', sessionId: 'not-a-selector' }, valid: { refreshToken: 'Case-SENSITIVE-token' } },
  { method: 'put', path: '/api/auth/profile', invalid: { phone: {} }, valid: { first_name: 'MiXeD' } },
  { method: 'post', path: '/api/patients/create', invalid: { patientId: 'bad/id' }, valid: { patientId: mixedId, firstName: 'MiXeD' } },
  { method: 'put', path: '/api/patients/1', invalid: { dob: '2026-02-30' }, valid: { firstName: 'MiXeD' } },
  { method: 'patch', path: '/api/patients/1/active', invalid: { is_active: 'true' }, valid: { is_active: true } },
  { method: 'post', path: '/api/notes/patient/:patientId', invalid: { noteText: 'Synthetic', date: '2026-02-30' }, valid: { noteText: 'MiXeD synthetic note', date: '2026-09-20', medicalCodes: ['a01'], expectedRevision: 0 } },
  { method: 'post', path: '/api/vitals/patient/:patientId', invalid: { oxygenSaturation: 101 }, valid: { heartRate: 70, notes: 'MiXeD' } },
  { method: 'post', path: '/api/appointments/create', invalid: { patientId: mixedId, appointmentDate: '2026-02-30T12:00:00' }, valid: { patientId: mixedId, appointmentDate: '2026-09-20T12:00:00', reason: 'MiXeD' } },
  { method: 'put', path: '/api/appointments/1/status', invalid: { status: 'COMPLETED' }, valid: { status: 'completed' } },
  { method: 'post', path: '/api/visits/create', invalid: { patientId: mixedId, nextVisitDate: '2026-02-30' }, valid: { patientId: mixedId, diagnosis: 'MiXeD' } },
  { method: 'post', path: '/api/templates/create', invalid: { templateName: 'Synthetic', templateText: '' }, valid: { templateName: 'MiXeD', templateText: 'MiXeD synthetic text' } },
  { method: 'post', path: '/api/analytics/event', invalid: { eventType: 'LOGIN' }, valid: { eventType: 'login' } },
  { method: 'post', path: '/api/format-note', invalid: { text: '' }, valid: { text: 'MiXeD synthetic note' } },
];
const patientReadPaths = [
  '/api/notes/patient/:patientId', '/api/notes/patient/:patientId/history',
  '/api/vitals/patient/:patientId/latest', '/api/vitals/patient/:patientId/history',
  '/api/appointments/patient/:patientId/history', '/api/visits/patient/:patientId',
  '/api/analytics/patient/:patientId/trends',
];

function probeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', validateRequest);
  for (const { method, path } of bodyCases) {
    app[method](path, (req, res) => res.json({ body: req.body, params: req.params, url: req.originalUrl }));
  }
  for (const path of patientReadPaths) {
    app.get(path, (req, res) => res.json({ params: req.params, url: req.originalUrl }));
  }
  app.get('/api/patients/search', (req, res) => res.json({ query: req.query, url: req.originalUrl }));
  app.get('/api/patients/:patientId', (req, res) => res.json({ params: req.params, url: req.originalUrl }));
  for (const { method, path } of internalPaths) {
    app[method](path, (req, res) => res.json({ params: req.params, url: req.originalUrl }));
  }
  app.use((error: { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.status === 400 ? 400 : 500).json({ error: 'Request rejected' });
  });
  return app;
}

describe.each(variants)('shared Express schema matching: $name', variant => {
  let probe: Server;
  beforeAll(async () => { probe = await listen(probeApp()); });
  afterAll(async () => { await close(probe); });
  it.each(bodyCases)('$method $path rejects invalid input and preserves accepted input', async ({ method, path, invalid, valid }) => {
    const url = route(variant, path);
    await request(probe)[method](url).send(invalid).expect(400, invalidFields);
    const response = await request(probe)[method](url).send(valid).expect(200);
    expect(response.body.body).toEqual(valid);
    expect(response.body.url).toBe(url);
    if (path.includes(':patientId')) expect(response.body.params.patientId).toBe(mixedId);
  });
  it.each(patientReadPaths)('GET %s validates decoded IDs across every clinical read family', async path => {
    for (const id of ['bad%2Fid', 'bad%00id', 'bad%252Fid', '%E0%A4%A']) {
      await request(probe).get(route(variant, path, id)).expect(400);
    }
    const url = route(variant, path, mixedId.replace('S', '%53'));
    const accepted = await request(probe).get(url).expect(200);
    expect(accepted.body.params.patientId).toBe(mixedId);
    expect(accepted.body.url).toBe(url);
  });
  it('does not turn unsupported static paths or repeated terminal slashes into accepted routes', async () => {
    for (const path of ['/api/auth/register//', '/api/auth/%72egister', '/api/auth/register.json']) {
      await request(probe).post(variant.change(path)).send({ email: 'synthetic@example.invalid', password: testPassword }).expect(404);
    }
  });
});

describe.each(variants)('strict decoded identifiers: $name', variant => {
  let probe: Server;
  beforeAll(async () => { probe = await listen(probeApp()); });
  afterAll(async () => { await close(probe); });

  it.each([...patientReadPaths, '/api/patients/:patientId'])('GET %s rejects whitespace, controls, overlength and repeated decoding', async path => {
    for (const encoded of invalidPatientEncodings) {
      const response = await request(probe).get(route(variant, path, encoded));
      expect(response.status, `${path}: ${encoded}`).toBe(400);
    }
    for (const id of acceptedIdentifiers) {
      // The direct patient lookup interprets all-ASCII digits as internal IDs;
      // longer numeric business IDs are deliberately searched via the query API.
      if (path === '/api/patients/:patientId' && /^\d+$/.test(id)) continue;
      for (const encoded of [encodeURIComponent(id), encodeEveryCharacter(id)]) {
        const url = route(variant, path, encoded);
        const response = await request(probe).get(url).expect(200);
        expect(response.body.params.patientId).toBe(id);
        expect(response.body.url).toBe(url);
      }
    }
  });

  it.each(bodyCases.filter(test => test.path.includes(':patientId')))('$method $path rejects invalid path IDs even with a valid body', async ({ method, path, valid }) => {
    for (const encoded of invalidPatientEncodings) {
      const response = await request(probe)[method](route(variant, path, encoded)).send(valid);
      expect(response.status, `${path}: ${encoded}`).toBe(400);
    }
    const url = route(variant, path, encodeEveryCharacter(unicodeId));
    const response = await request(probe)[method](url).send(valid).expect(200);
    expect(response.body.params.patientId).toBe(unicodeId);
    expect(response.body.body).toEqual(valid);
    expect(response.body.url).toBe(url);
  });

  it.each(['/api/patients/search', '/api/notes/patient/:patientId/history'])('GET %s applies strict query bounds and preserves a single decode', async path => {
    const base = route(variant, path);
    for (const encoded of ['', ...invalidPatientEncodings, `+${mixedId}`, `${mixedId}+`]) {
      const response = await request(probe).get(`${base}?patientId=${encoded}`);
      expect(response.status, `${path}: ${encoded}`).toBe(400);
      expect(response.body).toEqual(invalidFields);
    }
    for (const id of acceptedIdentifiers) {
      for (const encoded of [encodeURIComponent(id), encodeEveryCharacter(id)]) {
        const url = `${base}?patientId=${encoded}`;
        const response = await request(probe).get(url).expect(200);
        expect(response.body.url).toBe(url);
        if (path === '/api/patients/search') expect(response.body.query.patientId).toBe(id);
      }
    }
  });

  it.each(internalPaths)('$method $path strictly validates numeric internal IDs', async ({ method, path, body }) => {
    for (const encoded of invalidInternalEncodings) {
      const response = await request(probe)[method](route(variant, path, encoded)).send(body);
      expect(response.status, `${path}: ${encoded}`).toBe(400);
    }
    for (const id of ['1', '0001', '2147483647']) {
      const url = route(variant, path, encodeEveryCharacter(id));
      const response = await request(probe)[method](url).send(body).expect(200);
      expect(response.body.params.patientId).toBe(id);
      expect(response.body.url).toBe(url);
    }
  });

  it('validates direct patient lookup numeric bounds without treating numeric business queries as internal IDs', async () => {
    for (const id of ['2147483648', '00000000001', '0'.repeat(51)]) {
      await request(probe).get(route(variant, '/api/patients/:patientId', id)).expect(400, invalidFields);
    }
    const url = route(variant, '/api/patients/:patientId', '%30%30%31');
    const response = await request(probe).get(url).expect(200);
    expect(response.body.params.patientId).toBe('001');
    expect(response.body.url).toBe(url);
  });

  it.each(bodyCases.filter(test => ['patients', 'appointments', 'visits'].some(family => test.path === `/api/${family}/create`)))('$path intentionally normalizes body IDs and passes the normalized value', async ({ method, path, valid }) => {
    const response = await request(probe)[method](route(variant, path)).send({ ...valid, patientId: ` \t${unicodeId}\r\n` }).expect(200);
    expect(response.body.body).toEqual({ ...valid, patientId: unicodeId });
  });
});

describe('synthetic PostgreSQL validation-routing regression', () => {
  const schema = `validation_b_${randomUUID().replaceAll('-', '')}`;
  let admin: Pool; let db: Pool; let app: Server; let createdSchema = false;
  let extendedApp: Server; let today: string;
  let accessToken: string; let refreshToken: string; let appointmentId: number; let patientInternalId: number;
  let sequence = 0;
  const email = 'case-sensitive@example.invalid';
  const password = `Aa${randomBytes(35).toString('hex')}`; // Exactly 72 UTF-8 bytes; lowercase must differ.
  const auth = () => ({ Authorization: `Bearer ${accessToken}` });
  const newEmail = () => `rejected-${++sequence}@example.invalid`;

  beforeAll(async () => {
    const raw = auditDatabaseUrl();
    const url = new URL(raw);
    admin = new Pool({ connectionString: raw });
    await assertSupportedPostgres(admin);
    await admin.query(`CREATE SCHEMA ${schema}`);
    createdSchema = true;
    url.searchParams.set('options', `-c search_path=${schema}`);
    process.env.DATABASE_URL = url.toString();
    process.env.ENABLE_EXTERNAL_AI = 'false';
    db = (await import('../src/db')).default;
    expect((await db.query('SHOW search_path')).rows[0].search_path).toBe(schema);
    await (await import('../src/db/schema')).initializeDatabase();
    await (await import('../src/db/migrations')).migrateDatabase();
    const mountedRoutes = [
      ['auth', (await import('../src/routes/auth')).default],
      ['patients', (await import('../src/routes/patients')).default],
      ['notes', (await import('../src/routes/notes')).default],
      ['appointments', (await import('../src/routes/appointments')).default],
      ['vitals', (await import('../src/routes/vitals')).default],
      ['visits', (await import('../src/routes/visits')).default],
    ] as const;
    const handler = (parser: 'simple' | 'extended') => {
      const server = express(); server.set('query parser', parser); server.use(express.json());
      server.use('/api', validateRequest);
      for (const [name, router] of mountedRoutes) server.use(`/api/${name}`, router);
      // Match production's error-status handling, including Express URI decode errors.
      server.use((error: { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        res.status(error.status === 400 ? 400 : 500).json({ error: 'Request rejected' });
      });
      return server;
    };
    app = await listen(handler('simple')); // Express 5 / application's current default.
    extendedApp = await listen(handler('extended')); // Objects/arrays must also fail closed.
    const registration = await request(app).post('/api/auth/register').send({ email, password }).expect(201);
    ({ accessToken, refreshToken } = registration.body);
    for (const patientId of acceptedIdentifiers) {
      const created = await request(app).post('/api/patients/create').set(auth()).send({ patientId }).expect(201);
      if (patientId === mixedId) patientInternalId = created.body.patient.id;
    }
    const appointment = await request(app).post('/api/appointments/create').set(auth())
      .send({ patientId: mixedId, appointmentDate: '2026-09-20T12:00:00' }).expect(201);
    appointmentId = appointment.body.appointment.id;

    // Use the same process-local day as the real note handler, not PostgreSQL or
    // UTC's date. Distinct fixtures make a silent fallback to today observable.
    const now = new Date();
    today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect([requestedDay, leapDay]).not.toContain(today);
    for (const patientId of queryPatientIds) {
      await request(app).post('/api/patients/create').set(auth()).send({ patientId }).expect(201);
      for (const day of [today, requestedDay, leapDay]) {
        await db.query(`INSERT INTO clinical_notes (patient_id, doctor_id, note_date, note_text)
          SELECT $1, id, $2::date, $3 FROM users WHERE email=$4`, [patientId, day, noteMarker(patientId, day), email]);
      }
      await db.query(`INSERT INTO visit_history (patient_id, doctor_id, visit_date)
        SELECT $1, id, day FROM users CROSS JOIN (VALUES (TIMESTAMP '2098-01-01'), (TIMESTAMP '2099-01-01')) dates(day)
        WHERE email=$2`, [patientId, email]);
    }
  });
  afterAll(async () => {
    await close(app);
    await close(extendedApp);
    await db?.end();
    if (admin) {
      try { if (createdSchema) await admin.query(`DROP SCHEMA ${schema} CASCADE`); }
      finally { await admin.end(); }
    }
  });

  describe.each(variants)('$name', variant => {
    describe.each(['simple', 'extended'] as const)('note-date query boundary (%s parser)', parser => {
      const server = () => parser === 'simple' ? app : extendedApp;

      it('rejects malformed shapes without returning today, requested-day or other-case note content', async () => {
        for (const patientId of queryPatientIds) {
          const path = route(variant, '/api/notes/patient/:patientId', patientId);
          for (const query of malformedNoteQueries) {
            const response = await request(server()).get(`${path}?${query}`).set(auth());
            expect(response.status, `${path}?${query}`).toBe(400);
            expect(response.body).toEqual(invalidFields);
            expect(response.text).not.toContain('SYNTHETIC_QUERY_NOTE_');
            expect(response.body).not.toHaveProperty('note');
          }
        }
      });

      it('accepts only a scalar real calendar date and preserves literal patient-ID case', async () => {
        for (const patientId of queryPatientIds) {
          const path = route(variant, '/api/notes/patient/:patientId', encodeEveryCharacter(patientId));
          for (const day of [requestedDay, leapDay]) {
            for (const query of [`date=${day}`, `%64ate=${encodeEveryCharacter(day)}`]) {
              const response = await request(server()).get(`${path}?${query}`).set(auth()).expect(200);
              expect(response.body).toMatchObject({ exists: true, note: { patient_id: patientId, note_text: noteMarker(patientId, day) } });
              expect(response.text).not.toContain(noteMarker(patientId, today));
              const otherId = queryPatientIds.find(id => id !== patientId)!;
              expect(response.text).not.toContain(noteMarker(otherId, day));
            }
          }
          const missing = await request(server()).get(`${path}?date=2035-03-01`).set(auth()).expect(200);
          expect(missing.body).toEqual({ exists: false, note: null });
        }
      });

      it('returns the documented process-local today note only when date is legitimately omitted', async () => {
        for (const patientId of queryPatientIds) {
          const path = route(variant, '/api/notes/patient/:patientId', patientId);
          for (const suffix of ['', '?']) {
            const response = await request(server()).get(`${path}${suffix}`).set(auth()).expect(200);
            expect(response.body).toMatchObject({ exists: true, note: { patient_id: patientId, note_text: noteMarker(patientId, today) } });
            expect(response.text).not.toContain(noteMarker(patientId, requestedDay));
            expect(response.text).not.toContain(noteMarker(patientId, leapDay));
            const otherId = queryPatientIds.find(id => id !== patientId)!;
            expect(response.text).not.toContain(noteMarker(otherId, today));
          }
        }
      });

      it('does not apply the single-note query schema to history, visit filters or directory pagination', async () => {
        const patientId = queryPatientIds[0];
        const get = (path: string, query: Record<string, unknown>) => request(server()).get(route(variant, path, patientId)).set(auth()).query(query);
        for (const [path, field, extra] of [
          ['/api/notes/patient/:patientId/history', 'notes', {}],
          ['/api/visits/patient/:patientId', 'visits', { filter: 'upcoming' }],
          ['/api/patients', 'patients', {}],
        ] as const) {
          const first = await get(path, { limit: 1, ...extra }).expect(200);
          expect(first.body.hasMore).toBe(true);
          expect(first.body[field]).toHaveLength(1);
          expect(typeof first.body.nextCursor).toBe('string');
          const next = await get(path, { limit: 1, cursor: first.body.nextCursor, ...extra }).expect(200);
          expect(next.body[field]).toHaveLength(1);
          expect(next.body[field][0].id).not.toBe(first.body[field][0].id);
          for (const query of ['limit[x]=1', 'limit.value=1', 'limit=1&limit=2', 'cursor[x]=bad', 'cursor.value=bad', 'cursor=bad&cursor=bad']) {
            await request(server()).get(`${route(variant, path, patientId)}?${query}`).set(auth()).expect(400);
          }
          await get(path, { limit: 1, cursor: first.body.nextCursor, offset: 0, ...extra }).expect(400);
        }
        for (const path of ['/api/vitals/patient/:patientId/history', '/api/appointments/patient/:patientId/history']) {
          await get(path, { limit: 1 }).expect(200);
        }
        for (const filter of ['all', 'upcoming']) await get('/api/visits/patient/:patientId', { limit: 1, filter }).expect(200);
        for (const query of ['filter=past', 'filter[x]=all', 'filter.value=all', 'filter=all&filter=upcoming']) {
          await request(server()).get(`${route(variant, '/api/visits/patient/:patientId', patientId)}?${query}`).set(auth()).expect(400);
        }
        const directory = await get('/api/patients', { limit: 1, offset: 1 }).expect(200);
        expect(directory.body).toMatchObject({ limit: 1, offset: 1 });
        expect(directory.body.patients).toHaveLength(1);
      });
    });

    it('rejects short registration passwords before inserting a user', async () => {
      const rejectedEmail = newEmail();
      await request(app).post(route(variant, '/api/auth/register')).send({ email: rejectedEmail, password: 'x' }).expect(400, invalidFields);
      expect((await db.query('SELECT id FROM users WHERE email=$1', [rejectedEmail])).rowCount).toBe(0);
    });

    it.each(['x'.repeat(73), 'é'.repeat(37)])('rejects over-72-byte registration passwords (%#)', async oversized => {
      const rejectedEmail = newEmail();
      await request(app).post(route(variant, '/api/auth/register')).send({ email: rejectedEmail, password: oversized }).expect(400, invalidFields);
      expect((await db.query('SELECT id FROM users WHERE email=$1', [rejectedEmail])).rowCount).toBe(0);
    });

    it('rejects malformed login credentials and bcrypt-truncation aliases', async () => {
      const path = route(variant, '/api/auth/login');
      for (const body of [{ email: {}, password }, { email, password: {} }, { email, password: `${password}suffix` }, { email, password: 'é'.repeat(37) }]) {
        await request(app).post(path).send(body).expect(400, invalidFields);
      }
      await request(app).post(path).send({ email, password: password.toLowerCase() }).expect(401);
      await request(app).post(path).send({ email, password }).expect(200);
    });

    it('rejects logout unknown fields with valid credentials without revoking the session', async () => {
      // A broken logout must not revoke the shared fixture and cascade failures
      // into unrelated clinical cases during a pre-fix reproduction.
      const own = (await request(app).post('/api/auth/login').send({ email, password }).expect(200)).body;
      for (const unknown of [{ sessionId: 'not-a-selector' }, { SessionId: 'not-a-selector' }, { REFRESHTOKEN: own.refreshToken }]) {
        await request(app).post(route(variant, '/api/auth/logout')).set({ Authorization: `Bearer ${own.accessToken}` })
          .send({ refreshToken: own.refreshToken, ...unknown }).expect(400, invalidFields);
      }
      await request(app).get('/api/auth/profile').set({ Authorization: `Bearer ${own.accessToken}` }).expect(200);
    });

    it('rejects invalid clinical status without updating the appointment', async () => {
      await request(app).put(route(variant, `/api/appointments/${appointmentId}/status`)).set(auth()).send({ status: 'COMPLETED' }).expect(400, invalidFields);
      expect((await db.query('SELECT status FROM appointments WHERE id=$1', [appointmentId])).rows[0].status).toBe('scheduled');
    });

    it('rejects impossible note dates before a database write', async () => {
      await request(app).post(route(variant, '/api/notes/patient/:patientId')).set(auth())
        .send({ noteText: 'SYNTHETIC_INVALID_DATE', date: '2026-02-30' }).expect(400, invalidFields);
      expect((await db.query("SELECT id FROM clinical_notes WHERE note_text='SYNTHETIC_INVALID_DATE'")).rowCount).toBe(0);
    });

    it('rejects malformed internal IDs, encoded separators and malformed URI parameters', async () => {
      for (const id of ['not-an-integer', '2147483648', '1e2', '1%2F2', '%E0%A4%A']) {
        await request(app).put(route(variant, '/api/patients/:patientId', id)).set(auth()).send({}).expect(400);
        await request(app).patch(route(variant, '/api/patients/:patientId/active', id)).set(auth()).send({ is_active: true }).expect(400);
        await request(app).put(route(variant, '/api/appointments/:patientId/status', id)).set(auth()).send({ status: 'completed' }).expect(400);
      }
      for (const id of ['bad%2Fid', 'bad%00id', 'bad%252Fid', '%E0%A4%A']) {
        await request(app).get(route(variant, '/api/notes/patient/:patientId/history', id)).set(auth()).expect(400);
      }
    });

    it('enforces patient-search and date/pagination query validation without folding query keys', async () => {
      for (const query of ['', '?PatientId=synthetic', '?patientId=bad%2Fid', '?patientId=one&patientId=two', '?patientId%5Bx%5D=one']) {
        await request(app).get(`${route(variant, '/api/patients/search')}${query}`).set(auth()).expect(400, invalidFields);
      }
      for (const query of ['?date=2026-02-30', '?date=2026-09-20&date=2026-09-21', '?limit=-1', '?limit=101', '?limit=1&limit=2', '?offset=100001']) {
        await request(app).get(`${route(variant, '/api/notes/patient/:patientId/history')}${query}`).set(auth()).expect(400, invalidFields);
      }
    });

    it('rejects exact malformed business IDs on real reads, writes and queries before any note write', async () => {
      const before = (await db.query('SELECT count(*) FROM clinical_notes')).rows;
      for (const encoded of invalidPatientEncodings) {
        for (const path of ['/api/notes/patient/:patientId/history', '/api/patients/:patientId']) {
          const response = await request(app).get(route(variant, path, encoded)).set(auth());
          expect(response.status, `${path}: ${encoded}`).toBe(400);
        }
        const write = await request(app).post(route(variant, '/api/notes/patient/:patientId', encoded)).set(auth())
          .send({ noteText: 'SYNTHETIC_INVALID_IDENTIFIER', date: '2026-09-20' });
        expect(write.status, `note write: ${encoded}`).toBe(400);
        await request(app).get(`${route(variant, '/api/patients/search')}?patientId=${encoded}`).set(auth()).expect(400, invalidFields);
      }
      expect((await db.query('SELECT count(*) FROM clinical_notes')).rows).toEqual(before);
      expect((await db.query("SELECT id FROM clinical_notes WHERE note_text='SYNTHETIC_INVALID_IDENTIFIER'")).rowCount).toBe(0);
    });

    it('preserves legitimate Unicode, mixed case and length-boundary IDs through real lookup and search', async () => {
      for (const id of acceptedIdentifiers) {
        const encoded = encodeEveryCharacter(id);
        const searched = await request(app).get(`${route(variant, '/api/patients/search')}?patientId=${encoded}`).set(auth()).expect(200);
        expect(searched.body.patient.patient_id).toBe(id);
        if (!/^\d+$/.test(id)) {
          const direct = await request(app).get(route(variant, '/api/patients/:patientId', encoded)).set(auth()).expect(200);
          expect(direct.body.patient.patient_id).toBe(id);
        }
      }
      const numeric = await request(app).get(route(variant, '/api/patients/:patientId', encodeEveryCharacter(String(patientInternalId)))).set(auth()).expect(200);
      expect(numeric.body.patient.id).toBe(patientInternalId);
      expect(numeric.body.patient.patient_id).toBe(mixedId);
    });

    it('rejects malformed numeric write IDs without changing patient or appointment rows', async () => {
      const patients = (await db.query('SELECT * FROM patients ORDER BY id')).rows;
      const appointments = (await db.query('SELECT * FROM appointments ORDER BY id')).rows;
      for (const { method, path, body } of internalPaths) {
        for (const encoded of invalidInternalEncodings) {
          const response = await request(app)[method](route(variant, path, encoded)).set(auth()).send(body);
          expect(response.status, `${path}: ${encoded}`).toBe(400);
        }
      }
      expect((await db.query('SELECT * FROM patients ORDER BY id')).rows).toEqual(patients);
      expect((await db.query('SELECT * FROM appointments ORDER BY id')).rows).toEqual(appointments);
    });

    it('keeps business IDs and note text case-sensitive through accepted route variants', async () => {
      const date = `2026-09-${String(21 + variants.indexOf(variant)).padStart(2, '0')}`;
      for (const id of [mixedId, mixedId.toLowerCase()]) {
        const text = `Synthetic Note for ${id}`;
        const path = route(variant, '/api/notes/patient/:patientId', id);
        const saved = await request(app).post(path).set(auth()).send({ noteText: text, date }).expect(200);
        expect(saved.body.note.patient_id).toBe(id);
        expect(saved.body.note.note_text).toBe(text);
        const fetched = await request(app).get(`${path}?date=${date}`).set(auth()).expect(200);
        expect(fetched.body.note.patient_id).toBe(id);
        expect(fetched.body.note.note_text).toBe(text);
        const searched = await request(app).get(`${route(variant, '/api/patients/search')}?patientId=${id}`).set(auth()).expect(200);
        expect(searched.body.patient.patient_id).toBe(id);
      }
    });
  });

  it('persists the normalized create-body identifier, never the unvalidated original', async () => {
    const patientId = 'Syn-BodyNormalized';
    const response = await request(app).post('/API/PATIENTS/CREATE/').set(auth())
      .send({ patientId: ` \t${patientId}\r\n` }).expect(201);
    expect(response.body.patient.patient_id).toBe(patientId);
    expect((await db.query('SELECT patient_id FROM patients WHERE id=$1', [response.body.patient.id])).rows).toEqual([{ patient_id: patientId }]);
  });

  it('validates numeric IDs after exactly one Express parameter decode', async () => {
    const id = appointmentId.toString().split('').map(digit => `%${digit.charCodeAt(0).toString(16)}`).join('');
    await request(app).put(`/API/APPOINTMENTS/${id}/STATUS/`).set(auth()).send({ status: 'arbitrary' }).expect(400, invalidFields);
    const updated = await request(app).put(`/API/APPOINTMENTS/${id}/STATUS/`).set(auth()).send({ status: 'completed' }).expect(200);
    expect(updated.body.appointment.id).toBe(appointmentId);
  });

  it('keeps valid refresh and logout usable on uppercase trailing-slash routes', async () => {
    const rotated = await request(app).post('/API/AUTH/REFRESH/').send({ refreshToken }).expect(200);
    await request(app).post('/API/AUTH/LOGOUT/').send({ refreshToken: rotated.body.refreshToken }).expect(204);
    await request(app).get('/api/auth/profile').set({ Authorization: `Bearer ${rotated.body.accessToken}` }).expect(401);
  });
});
