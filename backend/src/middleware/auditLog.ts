import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { query } from '../db';
import { createOperationalMetrics, type OperationalMetrics } from '../services/operationalMetrics';
import { isApiRequest, safeAuditActor, safeEndpointMetadata, requestedAuditScope, terminalAuditScope,
  type RestrictedAuditScope, type SafeEndpointMetadata } from './safeAuditMetadata';

declare global {
  namespace Express { interface Request { requestId?: string } }
}

export type AuditPhase = 'request_received' | 'response_finished' | 'response_aborted';
export interface AuditEvent {
  readonly userId: number | null;
  readonly ipAddress: string | null;
  readonly action: string;
  readonly details: Readonly<SafeEndpointMetadata & RestrictedAuditScope & {
    schemaVersion: 1;
    requestId: string;
    phase: AuditPhase;
    authentication: 'established' | 'not_established';
    status?: number;
    outcome?: 'success' | 'failure' | 'aborted';
  }>;
}

// An explicit best-effort sink contract, not an outbox. Rejection must not
// change the ordinary read response or transactional clinical-write policy.
export interface AuditEventWriter { write(event: AuditEvent): Promise<void> }
export const databaseAuditEventWriter: AuditEventWriter = {
  async write(event) {
    await query('INSERT INTO audit_log (user_id, action, details, ip_address) VALUES ($1, $2, $3, $4)',
      [event.userId, event.action, JSON.stringify(event.details), event.ipAddress]);
  },
};

export function createAuditLog(
  writer: AuditEventWriter = databaseAuditEventWriter,
  metrics: OperationalMetrics = createOperationalMetrics(),
): RequestHandler {
  return (req, res, next) => {
    // Always replace client-supplied correlation headers, including non-API
    // requests. A fresh server UUID is the only correlation value we emit.
    const requestId = randomUUID();
    req.requestId = requestId;
    res.setHeader('X-Request-ID', requestId);
    res.setHeader('Cache-Control', 'no-store');
    if (!isApiRequest(req)) return next();

    const endpoint = safeEndpointMetadata(req);
    const requestedScope = requestedAuditScope(req, endpoint);
    const started = performance.now();
    const log = (event: 'request_started' | 'request_complete' | 'request_aborted' | 'audit_write_failed',
      phase: AuditPhase, status?: number) => {
      // Construct a fresh allowlisted operator event, never serialize Request,
      // AuditEvent (actor/IP), provider errors, or arbitrary writer rejection.
      const record = { event, requestId, ...endpoint, phase, status,
        durationMs: phase === 'request_received' ? undefined : Math.round(performance.now() - started) };
      try {
        if (event === 'audit_write_failed') console.error(JSON.stringify(record));
        else console.log(JSON.stringify(record));
      } catch { /* Log transport failure must not change ordinary access policy. */ }
    };
    const write = (phase: AuditPhase, status?: number) => {
      const actor = safeAuditActor(req);
      const event: AuditEvent = Object.freeze({ ...actor, action: `${endpoint.method} ${endpoint.endpoint}`,
        details: Object.freeze({ schemaVersion: 1, requestId, ...endpoint, phase,
          authentication: actor.userId === null ? 'not_established' : 'established',
          ...(phase === 'response_finished' && actor.userId !== null && status !== undefined && status >= 200 && status < 300
            ? terminalAuditScope(req, requestedScope) : {}),
          ...(status === undefined ? {} : { status, outcome: phase === 'response_aborted' ? 'aborted' : status < 400 ? 'success' : 'failure' }),
        }),
      });
      metrics.increment('auditWritesAttempted');
      // Catch both synchronous throws and rejected promises. Do not await before
      // next()/response, retry, queue indefinitely, or expose an error payload.
      void (async () => {
        try { await writer.write(event); metrics.increment('auditWritesSucceeded'); }
        catch { metrics.increment('auditWritesFailed'); log('audit_write_failed', phase, status); }
      })();
    };

    let ended = false;
    const end = (aborted: boolean) => {
      if (ended) return;
      ended = true;
      const phase = aborted ? 'response_aborted' : 'response_finished';
      metrics.increment(aborted ? 'requestsAborted' : 'requestsCompleted');
      log(aborted ? 'request_aborted' : 'request_complete', phase, res.statusCode);
      write(phase, res.statusCode);
    };
    res.once('finish', () => end(false));
    res.once('close', () => end(!res.writableFinished));
    metrics.increment('requestsStarted');
    log('request_started', 'request_received');
    write('request_received');
    next();
  };
}

export const auditLog = createAuditLog();
