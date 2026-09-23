import dotenv from 'dotenv';
import { randomBytes } from 'node:crypto';

dotenv.config({ quiet: true });

function integer(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}`);
  return value;
}

export const config = {
  port: integer('PORT', 5000, 1, 65535),
  host: process.env.HOST || '127.0.0.1',
  databaseUrl: process.env.DATABASE_URL || '',
  // Development sessions expire across restarts unless explicit keys are supplied.
  // Production has no fallback and must pass validateProductionConfig().
  jwtSecret: process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : randomBytes(48).toString('base64url')),
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || (process.env.NODE_ENV === 'production' ? '' : randomBytes(48).toString('base64url')),
  nodeEnv: process.env.NODE_ENV || 'development',
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',').map(s => s.trim()),
  sessionTimeoutMinutes: integer('SESSION_TIMEOUT_MINUTES', 15, 1, 480),
  trustProxyHops: integer('TRUST_PROXY_HOPS', 0, 0, 5),
  poolMax: integer('DB_POOL_MAX', 10, 1, 100),
  allowRegistration: process.env.ALLOW_SELF_REGISTRATION === 'true' ||
    (process.env.NODE_ENV !== 'production' && process.env.ALLOW_SELF_REGISTRATION !== 'false'),
  aiEnabled: process.env.ENABLE_EXTERNAL_AI === 'true',
};

export function validateProductionConfig() {
  for (const origin of config.allowedOrigins) {
    const url = new URL(origin);
    if (origin.includes('*') || url.origin !== origin || !['http:', 'https:'].includes(url.protocol)) throw new Error('ALLOWED_ORIGINS must contain exact origins');
  }
  if (config.nodeEnv !== 'production') return;
  if (!config.databaseUrl) throw new Error('DATABASE_URL is required');
  for (const secret of [config.jwtSecret, config.jwtRefreshSecret]) {
    if (secret.length < 32 || /dev[-_]|change[-_]me|change_in_production|[<>]/i.test(secret)) throw new Error('Strong, distinct JWT secrets are required');
  }
  if (config.jwtSecret === config.jwtRefreshSecret) throw new Error('JWT secrets must be distinct');
  if (config.allowedOrigins.some(origin => !origin.startsWith('https://'))) throw new Error('HTTPS origins required in production');
  if (process.env.SEED_DATABASE === 'true') throw new Error('Seeding is prohibited in production');
}
