import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'node:crypto';
import { config } from '../config';

export interface TokenPayload {
  userId: number;
  email: string;
  role: string;
  sessionId: string;
}

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign({ ...payload, tokenUse: 'access' }, config.jwtSecret, {
    algorithm: 'HS256', expiresIn: '15m', issuer: 'medical-notes', audience: 'medical-notes-api', jwtid: randomUUID(),
  });
}

export function generateRefreshToken(payload: TokenPayload): string {
  return jwt.sign({ ...payload, tokenUse: 'refresh' }, config.jwtRefreshSecret, {
    algorithm: 'HS256', expiresIn: '7d', issuer: 'medical-notes', audience: 'medical-notes-api', jwtid: randomUUID(),
  });
}

export function verifyAccessToken(token: string): TokenPayload | null {
  return verify(token, 'access');
}

export function verifyRefreshToken(token: string): TokenPayload | null {
  return verify(token, 'refresh');
}

// Only for binding a logout header to a separately verified, unexpired refresh
// credential. Never use this to authorize access or issue new credentials.
export function verifyAccessTokenForRevocation(token: string): TokenPayload | null {
  return verify(token, 'access', true);
}

function verify(token: string, use: 'access' | 'refresh', ignoreExpiration = false): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, use === 'access' ? config.jwtSecret : config.jwtRefreshSecret, {
      algorithms: ['HS256'], issuer: 'medical-notes', audience: 'medical-notes-api', ignoreExpiration,
    }) as TokenPayload & { tokenUse: string };
    if (decoded.tokenUse !== use || !Number.isInteger(decoded.userId) ||
        typeof decoded.email !== 'string' || typeof decoded.role !== 'string' ||
        typeof decoded.sessionId !== 'string' || !/^[a-f0-9-]{36}$/.test(decoded.sessionId)) return null;
    return { userId: decoded.userId, email: decoded.email, role: decoded.role, sessionId: decoded.sessionId };
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
