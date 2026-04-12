import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/auth';
import { query } from '../db';
import { config } from '../config';

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: number;
        email: string;
        role: string;
      };
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No authorization token' });
    }

    const payload = verifyAccessToken(token);

    if (!payload) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Check session for activity and update last_activity
    const sessionResult = await query(
      `SELECT id FROM sessions 
       WHERE user_id = $1 AND expires_at > NOW() 
       LIMIT 1`,
      [payload.userId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(401).json({ error: 'Session expired' });
    }

    // Update last activity
    await query(
      `UPDATE sessions SET last_activity = NOW() WHERE user_id = $1`,
      [payload.userId]
    );

    req.user = payload;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Authentication failed' });
  }
}

export async function authorize(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// Session timeout middleware
export async function checkSessionTimeout(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return next();
  }

  try {
    const result = await query(
      `SELECT last_activity FROM sessions 
       WHERE user_id = $1 AND expires_at > NOW() 
       ORDER BY created_at DESC LIMIT 1`,
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Session expired' });
    }

    const lastActivity = new Date(result.rows[0].last_activity);
    const now = new Date();
    const timeoutMinutes = config.sessionTimeoutMinutes;
    const inactivityMs = now.getTime() - lastActivity.getTime();

    if (inactivityMs > timeoutMinutes * 60 * 1000) {
      // Invalidate session
      await query(`UPDATE sessions SET expires_at = NOW() WHERE user_id = $1`, [req.user.userId]);
      return res.status(401).json({ error: 'Session timed out due to inactivity' });
    }

    next();
  } catch (err) {
    next();
  }
}
