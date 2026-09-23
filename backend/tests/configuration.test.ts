import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { auditDatabaseUrl } from './helpers/auditDatabase';

// Never read ignored environment files. Each import gets only explicit synthetic settings.
vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));
const valid = {
  NODE_ENV: 'production', DATABASE_URL: 'postgresql://synthetic.invalid/not-connected',
  JWT_SECRET: randomBytes(48).toString('base64url'),
  JWT_REFRESH_SECRET: randomBytes(48).toString('base64url'),
  ALLOWED_ORIGINS: 'https://clinic.example.invalid', SEED_DATABASE: 'false',
  PORT: '5000', SESSION_TIMEOUT_MINUTES: '15', TRUST_PROXY_HOPS: '0', DB_POOL_MAX: '10',
};
async function load(overrides: Record<string, string | undefined> = {}) {
  for (const [key, value] of Object.entries({ ...valid, ALLOW_SELF_REGISTRATION: undefined, ENABLE_EXTERNAL_AI: undefined, ...overrides })) {
    vi.stubEnv(key, value);
  }
  return import('../src/config');
}
beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllEnvs());

describe('exact-origin startup contract (no database connection)', () => {
  it.each([
    '*', 'https://*.onrender.com', 'https://clinic.*.invalid',
    'https://user:pass@clinic.example.invalid', 'https://user@clinic.example.invalid',
    'https://clinic.example.invalid/', 'https://clinic.example.invalid/api',
    'https://clinic.example.invalid?x=1', 'https://clinic.example.invalid?',
    'https://clinic.example.invalid#fragment', 'https://clinic.example.invalid#',
    'file://clinic.example.invalid', 'null', 'not-a-url',
    'https://clinic.example.invalid,',
  ])('rejects non-origin %s', async origin => {
    const { validateProductionConfig } = await load({ ALLOWED_ORIGINS: origin });
    expect(() => validateProductionConfig()).toThrow();
  });
  it('accepts multiple exact HTTPS origins and trims list whitespace', async () => {
    const { config, validateProductionConfig } = await load({ ALLOWED_ORIGINS: 'https://clinic.example.invalid, https://other.example.invalid:8443 ' });
    expect(config.allowedOrigins).toEqual(['https://clinic.example.invalid', 'https://other.example.invalid:8443']);
    expect(() => validateProductionConfig()).not.toThrow();
  });
  it('rejects HTTP in production', async () => {
    const { validateProductionConfig } = await load({ ALLOWED_ORIGINS: 'http://localhost:5173' });
    expect(() => validateProductionConfig()).toThrow('HTTPS origins required');
  });
  it('allows an explicit loopback HTTP development origin', async () => {
    const { validateProductionConfig } = await load({ NODE_ENV: 'development', ALLOWED_ORIGINS: 'http://localhost:5173' });
    expect(() => validateProductionConfig()).not.toThrow();
  });
  it('rejects wildcards in development too', async () => {
    const { validateProductionConfig } = await load({ NODE_ENV: 'development', ALLOWED_ORIGINS: 'https://*.example.invalid' });
    expect(() => validateProductionConfig()).toThrow();
  });
});

describe('production configuration gates', () => {
  it('requires a database URL without connecting to it', async () => {
    const { validateProductionConfig } = await load({ DATABASE_URL: '' });
    expect(() => validateProductionConfig()).toThrow('DATABASE_URL is required');
  });
  it.each(['JWT_SECRET', 'JWT_REFRESH_SECRET'])('rejects missing, short, or placeholder %s', async key => {
    for (const value of [undefined, '', 'short', 'dev-secret-change-me', 'change_in_production'.repeat(3), 'dev_'.repeat(12), 'change_me'.repeat(5), '<independent-random-signing-secret>']) {
      vi.resetModules();
      const { validateProductionConfig } = await load({ [key]: value });
      expect(() => validateProductionConfig()).toThrow('Strong, distinct JWT secrets are required');
    }
  });
  it('requires distinct signing secrets', async () => {
    const { validateProductionConfig } = await load({ JWT_REFRESH_SECRET: valid.JWT_SECRET });
    expect(() => validateProductionConfig()).toThrow('JWT secrets must be distinct');
  });
  it('prohibits production seeding', async () => {
    const { validateProductionConfig } = await load({ SEED_DATABASE: 'true' });
    expect(() => validateProductionConfig()).toThrow('Seeding is prohibited in production');
  });
  it.each([undefined, 'false'])('permits disabled seed flag %s', async flag => {
    const { validateProductionConfig } = await load({ SEED_DATABASE: flag });
    expect(() => validateProductionConfig()).not.toThrow();
  });
  it('defaults production registration and external AI off', async () => {
    const { config } = await load();
    expect(config.allowRegistration).toBe(false);
    expect(config.aiEnabled).toBe(false);
  });
  it('characterizes explicit opt-ins, not policy approval', async () => {
    const { config } = await load({ ALLOW_SELF_REGISTRATION: 'true', ENABLE_EXTERNAL_AI: 'true' });
    expect(config.allowRegistration).toBe(true);
    expect(config.aiEnabled).toBe(true);
  });
  it.each(['1', 'TRUE', 'yes'])('does not interpret %s as a production opt-in', async flag => {
    const { config } = await load({ ALLOW_SELF_REGISTRATION: flag, ENABLE_EXTERNAL_AI: flag });
    expect(config.allowRegistration).toBe(false);
    expect(config.aiEnabled).toBe(false);
  });
  it.each(['-1', '6', '1.5', 'true'])('rejects invalid proxy hop count %s', async value => {
    await expect(load({ TRUST_PROXY_HOPS: value })).rejects.toThrow('Invalid TRUST_PROXY_HOPS');
  });
});

describe('ephemeral development signing keys', () => {
  it('uses the actual TypeScript audit wrapper without a database or fixed credential', () => {
    const url = new URL('postgresql://audit@127.0.0.1:55439/medapp_audit');
    url.password = randomBytes(32).toString('hex');
    expect(auditDatabaseUrl(url.href) === url.href).toBe(true);
    for (const value of ['', `${url.href}?options=-csearch_path=public`, url.href.replace('55439', '5432')]) {
      expect(() => auditDatabaseUrl(value)).toThrow('TEST_DATABASE_URL');
    }
  });
  it('uses independent random fallbacks only outside production and retains keys for a process import', async () => {
    const overrides = { NODE_ENV: 'development', JWT_SECRET: undefined, JWT_REFRESH_SECRET: undefined };
    const first = await load(overrides);
    expect(first.config.jwtSecret.length).toBeGreaterThanOrEqual(32);
    expect(first.config.jwtRefreshSecret.length).toBeGreaterThanOrEqual(32);
    expect(first.config.jwtSecret === first.config.jwtRefreshSecret).toBe(false);
    expect((await load(overrides)).config.jwtSecret === first.config.jwtSecret).toBe(true);
    vi.resetModules();
    const next = await load(overrides);
    expect(next.config.jwtSecret === first.config.jwtSecret).toBe(false);
    expect(next.config.jwtRefreshSecret === first.config.jwtRefreshSecret).toBe(false);
  });
});

vi.mock('../src/db/index', () => ({ query: vi.fn() }));
describe('explicit development seed credentials (no database)', () => {
  it('rejects missing, invalid and placeholder passwords before any DB work, and all production seeding', async () => {
    const { seedDatabase } = await import('../src/db/seed');
    const { query } = await import('../src/db/index');
    vi.mocked(query).mockClear();
    vi.stubEnv('NODE_ENV', 'development');
    for (const password of [undefined, '', 'short', 'x'.repeat(73), 'é'.repeat(37), '<development-seed-password>']) {
      vi.stubEnv('SEED_PASSWORD', password);
      await expect(seedDatabase()).rejects.toThrow('SEED_PASSWORD is required');
    }
    vi.stubEnv('SEED_PASSWORD', randomBytes(24).toString('base64url'));
    vi.stubEnv('NODE_ENV', 'production');
    await expect(seedDatabase()).rejects.toThrow('Seeding is prohibited in production');
    expect(query).not.toHaveBeenCalled();
  });

  it('hashes the supplied password without logging it or replacing existing-account passwords', async () => {
    const { seedDatabase } = await import('../src/db/seed');
    const { query } = await import('../src/db/index');
    const bcrypt = await import('bcryptjs');
    const password = randomBytes(24).toString('base64url');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SEED_PASSWORD', password);
    vi.mocked(query).mockReset().mockResolvedValue({ rows: [{ id: 1, patient_id: 'P001' }], rowCount: 1 } as never);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await seedDatabase();
      const [sql, params] = vi.mocked(query).mock.calls[0];
      expect(await bcrypt.compare(password, params![1])).toBe(true);
      expect(sql).toContain('ON CONFLICT (email) DO UPDATE SET is_active = true');
      expect(sql).not.toMatch(/DO UPDATE SET[^;]*password_hash/i);
      expect(JSON.stringify(log.mock.calls).includes(password)).toBe(false);
    } finally { log.mockRestore(); }
  });
});
