import { Request, Response, NextFunction } from 'express';
import { query } from '../db';

export async function auditLog(req: Request, res: Response, next: NextFunction) {
  res.on('finish', async () => {
    try {
      const userId = req.user?.userId || null;
      const action = `${req.method} ${req.path}`;
      const ipAddress = req.ip || req.connection.remoteAddress || '';

      await query(
        `INSERT INTO audit_log (user_id, action, details, ip_address) VALUES ($1, $2, $3, $4)`,
        [userId, action, req.body ? JSON.stringify(req.body) : null, ipAddress]
      );
    } catch (err) {
      console.error('Error logging audit trail:', err);
    }
  });

  next();
}
