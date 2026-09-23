import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { testPassword } from './helpers/syntheticSecrets';
import { auditDatabaseUrl } from './helpers/auditDatabase';

// Never load environment files. Every record lives in a new synthetic schema.
vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));
const schema = `session_b_${randomUUID().replaceAll('-', '')}`;
let db: Pool; let admin: Pool; let app: Express;
let tokens: typeof import('../src/utils/auth');
let config: typeof import('../src/config').config;
let actor = 0;
type Session = { accessToken: string; refreshToken: string; user: { id: number } };
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
async function session(): Promise<Session> {
  const response = await request(app).post('/api/auth/register').send({ email: `synthetic-${++actor}@example.invalid`, password: testPassword, firstName: 'Synthetic' }).expect(201);
  return response.body;
}
const expiredAccess = (value: Session) => jwt.sign({ ...tokens.verifyAccessToken(value.accessToken), tokenUse: 'access' }, config.jwtSecret,
  { algorithm: 'HS256', issuer: 'medical-notes', audience: 'medical-notes-api', expiresIn: -1 });

beforeAll(async () => {
  const raw = auditDatabaseUrl();
  const url = new URL(raw);
  admin = new Pool({ connectionString: raw });
  await admin.query(`CREATE SCHEMA ${schema}`);
  url.searchParams.set('options', `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  process.env.ENABLE_EXTERNAL_AI = 'false';
  process.env.SESSION_TIMEOUT_MINUTES = '7';
  db = (await import('../src/db')).default;
  await (await import('../src/db/schema')).initializeDatabase();
  await (await import('../src/db/migrations')).migrateDatabase();
  tokens = await import('../src/utils/auth');
  config = (await import('../src/config')).config;
  app = express(); app.use(express.json());
  app.use('/api', (await import('../src/middleware/validation')).validateRequest);
  app.use('/api/auth', (await import('../src/routes/auth')).default);
});
afterAll(async () => {
  await db?.end();
  if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
});

describe('synthetic exact-session revocation', () => {
  it('revokes with expired access and valid refresh, without affecting another session', async () => {
    const a = await session(); const b = await session();
    await request(app).get('/api/auth/profile').set(auth(expiredAccess(a))).expect(401);
    await request(app).post('/api/auth/logout').set(auth(expiredAccess(a))).send({ refreshToken: a.refreshToken }).expect(204);
    await request(app).get('/api/auth/profile').set(auth(a.accessToken)).expect(401);
    await request(app).post('/api/auth/refresh').send({ refreshToken: a.refreshToken }).expect(401);
    await request(app).get('/api/auth/profile').set(auth(b.accessToken)).expect(200);
  });

  it('preserves access-only logout and supports refresh-only exact-session logout', async () => {
    for (const credential of ['access', 'refresh']) {
      const a = await session();
      const logout = request(app).post('/api/auth/logout');
      if (credential === 'access') logout.set(auth(a.accessToken)); else logout.send({ refreshToken: a.refreshToken });
      await logout.expect(204);
      await request(app).get('/api/auth/profile').set(auth(a.accessToken)).expect(401);
      await request(app).post('/api/auth/refresh').send({ refreshToken: a.refreshToken }).expect(401);
    }
  });

  it('rejects arbitrary session IDs, missing proof, forged credentials and token-purpose confusion', async () => {
    const a = await session(); const payload = tokens.verifyAccessToken(a.accessToken)!;
    await request(app).post('/api/auth/logout').send({ sessionId: payload.sessionId }).expect(400);
    await request(app).post('/api/auth/logout').send({ sessionId: payload.sessionId, refreshToken: a.refreshToken }).expect(400);
    await request(app).post('/api/auth/logout').send({}).expect(401);
    await request(app).post('/api/auth/logout').set(auth(expiredAccess(a))).expect(401);
    await request(app).post('/api/auth/logout').send({ refreshToken: a.accessToken }).expect(401);
    await request(app).post('/api/auth/logout').set(auth(a.refreshToken)).expect(401);
    await request(app).post('/api/auth/logout').send({ refreshToken: 'synthetic-forgery' }).expect(401);
    await request(app).post('/api/auth/logout').set(auth('synthetic-forgery')).send({ refreshToken: a.refreshToken }).expect(401);
    await request(app).post('/api/auth/logout').send({ refreshToken: {} }).expect(400);
    await request(app).post('/api/auth/logout').send({ refreshToken: 'x'.repeat(4097) }).expect(400);
    await request(app).get('/api/auth/profile').set(auth(a.accessToken)).expect(200);
  });

  it('rejects mixing actors or different sessions of the same actor, even with an expired access header', async () => {
    const a = await session(); const b = await session();
    const sameActor = (await request(app).post('/api/auth/login').send({ email: tokens.verifyAccessToken(a.accessToken)!.email, password: testPassword }).expect(200)).body;
    for (const other of [b, sameActor]) {
      for (const access of [a.accessToken, expiredAccess(a)]) {
        await request(app).post('/api/auth/logout').set(auth(access)).send({ refreshToken: other.refreshToken }).expect(401);
      }
      await request(app).get('/api/auth/profile').set(auth(other.accessToken)).expect(200);
    }
    await request(app).get('/api/auth/profile').set(auth(a.accessToken)).expect(200);
  });

  it('requires signed purpose/issuer/audience/unexpired refresh and a matching stored hash for issuance', async () => {
    const a = await session(); const payload = tokens.verifyRefreshToken(a.refreshToken)!;
    const sign = (claims = {}, options = {}) => jwt.sign({ ...payload, tokenUse: 'refresh', ...claims }, config.jwtRefreshSecret,
      { algorithm: 'HS256', issuer: 'medical-notes', audience: 'medical-notes-api', expiresIn: '1h', ...options });
    for (const invalid of [sign({}, { expiresIn: -1 }), sign({ tokenUse: 'access' }), sign({}, { issuer: 'other' }), sign({}, { audience: 'other' }), jwt.sign({ ...payload, tokenUse: 'refresh' }, 'synthetic-wrong-signing-key')]) {
      await request(app).post('/api/auth/logout').send({ refreshToken: invalid }).expect(401);
      await request(app).post('/api/auth/refresh').send({ refreshToken: invalid }).expect(401);
    }
    await request(app).post('/api/auth/refresh').send({ refreshToken: sign() }).expect(401);
    await request(app).get('/api/auth/profile').set(auth(a.accessToken)).expect(200);
  });

  it('permits only one refresh winner when duplicated tabs use the same token', async () => {
    const a = await session();
    const results = await Promise.all([1, 2].map(() => request(app).post('/api/auth/refresh').send({ refreshToken: a.refreshToken })));
    expect(results.map(result => result.status).sort()).toEqual([200, 401]);
    const rotated = results.find(result => result.status === 200)!.body;
    await request(app).post('/api/auth/refresh').send({ refreshToken: a.refreshToken }).expect(401);
    await request(app).get('/api/auth/profile').set(auth(rotated.accessToken)).expect(200);
    // The losing tab can still sign out the copied session using its signed
    // credential. It cannot refresh or obtain new authority with that token.
    await request(app).post('/api/auth/logout').send({ refreshToken: a.refreshToken }).expect(204);
    await request(app).get('/api/auth/profile').set(auth(rotated.accessToken)).expect(401);
    await request(app).post('/api/auth/refresh').send({ refreshToken: rotated.refreshToken }).expect(401);
  });

  it.each(['refresh-first', 'logout-first'])('rejects all tokens after completed logout with deterministic %s interleaving', async order => {
    const a = await session();
    const database = await import('../src/db'); const originalQuery = database.query;
    let signal!: () => void; let release!: () => void;
    const committed = new Promise<void>(resolve => { signal = resolve; });
    const resume = new Promise<void>(resolve => { release = resolve; });
    const pattern = order === 'refresh-first' ? 'UPDATE sessions s SET refresh_token_hash' : 'UPDATE sessions s SET expires_at';
    const spy = vi.spyOn(database, 'query').mockImplementation(async (sql, params) => {
      const result = await originalQuery(sql, params);
      if (sql.startsWith(pattern)) { signal(); await resume; }
      return result;
    });
    try {
      if (order === 'refresh-first') {
        const refreshing = request(app).post('/api/auth/refresh').send({ refreshToken: a.refreshToken }).then(result => result);
        await committed;
        await request(app).post('/api/auth/logout').set(auth(expiredAccess(a))).send({ refreshToken: a.refreshToken }).expect(204);
        release(); const rotated = await refreshing;
        expect(rotated.status).toBe(200);
        await request(app).get('/api/auth/profile').set(auth(rotated.body.accessToken)).expect(401);
        await request(app).post('/api/auth/refresh').send({ refreshToken: rotated.body.refreshToken }).expect(401);
      } else {
        const loggingOut = request(app).post('/api/auth/logout').send({ refreshToken: a.refreshToken }).then(result => result);
        await committed;
        await request(app).post('/api/auth/refresh').send({ refreshToken: a.refreshToken }).expect(401);
        release(); expect((await loggingOut).status).toBe(204);
      }
      await request(app).get('/api/auth/profile').set(auth(a.accessToken)).expect(401);
      await request(app).post('/api/auth/refresh').send({ refreshToken: a.refreshToken }).expect(401);
    } finally { release(); spy.mockRestore(); }
  });

  it('enforces server idle expiry without a client clock assumption, while allowing exact-session revocation', async () => {
    const a = await session();
    await db.query("UPDATE sessions SET last_activity = NOW() - INTERVAL '8 minutes' WHERE session_key=$1", [tokens.verifyAccessToken(a.accessToken)!.sessionId]);
    await request(app).get('/api/auth/profile').set(auth(a.accessToken)).expect(401);
    await request(app).post('/api/auth/refresh').send({ refreshToken: a.refreshToken }).expect(401);
    await request(app).post('/api/auth/logout').send({ refreshToken: a.refreshToken }).expect(204);
  });

  it('keeps active-user and DB-expiry checks on access, refresh and revocation', async () => {
    for (const condition of ['disabled', 'expired']) {
      const a = await session();
      if (condition === 'disabled') await db.query('UPDATE users SET is_active=false WHERE id=$1', [a.user.id]);
      else await db.query("UPDATE sessions SET expires_at=NOW()-INTERVAL '1 second' WHERE user_id=$1", [a.user.id]);
      await request(app).get('/api/auth/profile').set(auth(a.accessToken)).expect(401);
      await request(app).post('/api/auth/refresh').send({ refreshToken: a.refreshToken }).expect(401);
      await request(app).post('/api/auth/logout').send({ refreshToken: a.refreshToken }).expect(401);
    }
  });

  it('returns an outage rather than invalidating a still-active session on temporary DB failure', async () => {
    const a = await session(); const database = await import('../src/db');
    const spy = vi.spyOn(database, 'query').mockRejectedValueOnce(new Error('synthetic DB outage'));
    try { await request(app).get('/api/auth/profile').set(auth(a.accessToken)).expect(503); }
    finally { spy.mockRestore(); }
    await request(app).get('/api/auth/profile').set(auth(a.accessToken)).expect(200);
  });

  it('publishes only the three allowlisted capabilities and does not reopen registration', async () => {
    const registration = config.allowRegistration;
    config.allowRegistration = false;
    try {
      const response = await request(app).get('/api/auth/capabilities').expect(200);
      expect(response.body).toEqual({ allowRegistration: false, aiEnabled: false, sessionTimeoutMinutes: 7 });
      expect(response.headers['cache-control']).toBe('no-store');
      await request(app).post('/api/auth/register').send({ email: 'disabled@example.invalid', password: testPassword }).expect(403);
    } finally { config.allowRegistration = registration; }
  });
});
