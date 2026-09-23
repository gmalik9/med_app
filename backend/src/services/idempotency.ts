import { createHash } from 'node:crypto';
import { Request } from 'express';
import { transaction } from '../db';
import { auditedWrite } from './auditedWrite';

const operations = {
  CREATE_APPOINTMENT: { table: 'appointments', actor: 'doctor_id' },
  CREATE_VISIT: { table: 'visit_history', actor: 'doctor_id' },
  RECORD_VITALS: { table: 'vital_signs', actor: 'recorded_by' },
} as const;
type Operation = keyof typeof operations;

export class IdempotencyError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

// Optional for older clients. UUID v4, exactly 36 ASCII characters; reject lists,
// duplicate headers, arbitrary text and keys containing clinical identifiers.
function requestKey(req: Request): string | undefined {
  const value = req.get('Idempotency-Key');
  if (value === undefined) return undefined;
  const occurrences = req.rawHeaders.filter((_, i) => i % 2 === 0 && req.rawHeaders[i].toLowerCase() === 'idempotency-key').length;
  if (occurrences > 1 || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new IdempotencyError(400, 'Idempotency-Key must be a UUID v4 (36 characters)');
  }
  return value.toLowerCase();
}

// Call only after authenticate + validateRequest. Params are the allowlisted,
// validated INSERT values in a fixed order, never raw req.body or server NOW().
export async function idempotentWrite(req: Request, operation: Operation, patientId: string,
  sql: string, values: any[]) {
  const key = requestKey(req);
  const actor = req.user?.userId;
  if (!actor) throw new IdempotencyError(401, 'Authentication required');
  return transaction(async client => {
    // Current shared-clinic access rule, checked on first use AND replay. Do not
    // turn patients.created_by into an invented ownership/tenant policy.
    const patient = await client.query('SELECT patient_id FROM patients WHERE patient_id = $1 FOR KEY SHARE', [patientId]);
    if (!patient.rows.length) throw new IdempotencyError(404, 'Patient not found');
    const params = values.map(value => value ?? null);
    if (operation === 'CREATE_APPOINTMENT') {
      // Preserve PostgreSQL's existing TIMESTAMP WITHOUT TIME ZONE semantics:
      // wall clock fields, NOT Date/toISOString or an assumed legacy timezone.
      // Offset suffixes are ignored by this existing column type. Canonicalize
      // precision/omitted seconds exactly as stored, including on unkeyed writes.
      const time = await client.query(`SELECT to_char($1::timestamp, 'YYYY-MM-DD"T"HH24:MI:SS.US') AS value`, [params[2]]);
      params[2] = time.rows[0].value;
    }
    if (!key) return { result: await auditedWrite(req, operation, sql, params, client), replayed: false };

    // Every caller includes the validated patient ID in params[0]. Preserve
    // v2's canonical digest format: patient is payload, not a key namespace.
    const digest = createHash('sha256').update(JSON.stringify(params)).digest('hex');
    const scope = [actor, operation, key];
    // INSERT ... ON CONFLICT waits for the concurrent owner's commit/rollback.
    // The next READ COMMITTED statement sees its committed metadata. No racy
    // SELECT-then-INSERT, no natural clinical uniqueness constraint.
    // Cover BOTH the retained v2 PK and v3's actor/operation/key UNIQUE. Naming
    // only the v3 index can race PostgreSQL's speculative insert on the old PK
    // and raise 23505 for a matching concurrent request. The v3 constraint (a
    // deployment prerequisite) sets the namespace; replay uses that same scope.
    const claim = await client.query(`INSERT INTO clinical_write_keys
      (actor_id, operation, request_key, patient_id, request_digest)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT DO NOTHING RETURNING request_key`, [...scope, patientId, digest]);
    if (!claim.rows.length) {
      const prior = await client.query(`SELECT patient_id, request_digest, resource_id FROM clinical_write_keys
        WHERE actor_id=$1 AND operation=$2 AND request_key=$3`, scope);
      if (prior.rows[0]?.patient_id !== patientId || prior.rows[0]?.request_digest !== digest) {
        throw new IdempotencyError(409, 'Idempotency key already used for different request fields');
      }
      const resource = operations[operation];
      const result = await client.query(`SELECT * FROM ${resource.table} WHERE id=$1 AND patient_id=$2 AND ${resource.actor}=$3`,
        [prior.rows[0].resource_id, patientId, actor]);
      if (!result.rows.length) throw new IdempotencyError(409, 'Original resource is unavailable; reconcile before creating a new submission');
      // Replay the same resource's CURRENT representation (e.g. appointment
      // status may change), not a duplicate clinical snapshot in the ledger.
      return { result, replayed: true };
    }
    const result = await auditedWrite(req, operation, sql, params, client);
    if (result.rows.length !== 1) throw new Error('Idempotent create must return one resource');
    await client.query(`UPDATE clinical_write_keys SET resource_id=$4
      WHERE actor_id=$1 AND operation=$2 AND request_key=$3`, [...scope, result.rows[0].id]);
    return { result, replayed: false };
  });
}
