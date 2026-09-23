import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/auth';
import { query } from '../db';
import { config } from '../config';
import { safeDiagnostic } from './safeAudit';

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: number;
        email: string;
        role: string;
        sessionId: string;
      };
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    const token = typeof header === 'string' && /^Bearer \S+$/i.test(header) ? header.slice(7) : '';

    if (!token) {
      return res.status(401).json({ error: 'No authorization token' });
    }

    const payload = verifyAccessToken(token);

    if (!payload) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Enforce inactivity BEFORE updating, and bind to this exact session.
    const sessionResult = await query(
      `UPDATE sessions s SET last_activity = NOW() FROM users u
       WHERE s.session_key = $1 AND s.user_id = $2 AND u.id = s.user_id
       AND u.is_active = true AND s.expires_at > NOW()
       AND s.last_activity > NOW() - ($3 * INTERVAL '1 minute')
       RETURNING u.email, u.role`,
      [payload.sessionId, payload.userId, config.sessionTimeoutMinutes]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(401).json({ error: 'Session expired' });
    }

    req.user = { ...payload, email: sessionResult.rows[0].email, role: sessionResult.rows[0].role };
    next();
  } catch (err) {
    safeDiagnostic(req, 'authentication_unavailable');
    res.status(503).json({ error: 'Authentication temporarily unavailable' });
  }
}

export function authorize(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}


