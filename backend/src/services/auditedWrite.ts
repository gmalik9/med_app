import { Request } from 'express';
import { PoolClient } from 'pg';
import { transaction } from '../db';

// Mutation and its successful audit record commit together or neither commits.
// A supplied client must already be inside the caller's transaction.
export function auditedWrite(req: Request, action: string, sql: string, params: any[], client?: PoolClient) {
  const work = async (client: PoolClient) => {
    const result = await client.query(sql, params);
    if (result.rows.length) {
      await client.query(`INSERT INTO audit_log (user_id, patient_id, action, details, ip_address)
        VALUES ($1, $2, $3, $4, $5)`, [req.user?.userId, result.rows[0].patient_id ?? null,
        action, JSON.stringify({ requestId: req.requestId, resourceId: result.rows[0].id, outcome: 'success' }), req.ip]);
    }
    return result;
  };
  return client ? work(client) : transaction(work);
}