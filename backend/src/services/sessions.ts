import { randomUUID } from 'node:crypto';
import { Request } from 'express';
import { PoolClient } from 'pg';
import { generateAccessToken, generateRefreshToken, hashToken } from '../utils/auth';

export async function createSession(client: PoolClient, user: { id: number; email: string; role: string }, req: Request) {
  const payload = { userId: user.id, email: user.email, role: user.role, sessionId: randomUUID() };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);
  await client.query(`INSERT INTO sessions (user_id, session_key, refresh_token_hash, ip_address, user_agent, expires_at)
    VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '7 days')`,
    [user.id, payload.sessionId, hashToken(refreshToken), req.ip, req.get('user-agent')?.slice(0, 512)]);
  req.user = payload;
  return { user: { id: user.id, email: user.email, role: user.role }, accessToken, refreshToken };
}