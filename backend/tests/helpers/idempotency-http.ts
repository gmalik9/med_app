import { createServer, type ClientRequest } from 'node:http';
import type { Express } from 'express';
import request, { type Response, type Test } from 'supertest';

// Test-only transport. One actual loopback listener, not one Supertest-owned
// listener (and server.close callback) per request. No retry/serialization.
export async function idempotencyHttp(app: Express, databaseSnapshot: () => Promise<unknown>) {
  type Trace = {
    index: number; batchIndex?: number; requestId?: string; status?: number;
    dispatchedMs?: number; socketMs?: number; connectedMs?: number; sentMs?: number;
    receivedMs?: number; bodyReceivedMs?: number; finishedMs?: number; closedMs?: number;
    responseMs?: number; endedMs?: number; settledMs?: number;
    outcome?: 'fulfilled' | 'rejected'; errorCode?: string;
  };
  const traces = new Map<number, Trace>();
  const requests = new WeakMap<Test, Trace>();
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  let sequence = 0;
  let batch = 0;
  const server = createServer((req, res) => {
    const trace = traces.get(Number(req.headers['x-test-request-index']));
    if (trace) {
      trace.receivedMs = elapsed();
      req.once('end', () => { trace.bodyReceivedMs = elapsed(); });
      res.once('finish', () => { trace.finishedMs = elapsed(); trace.status = res.statusCode; });
      res.once('close', () => { trace.closedMs = elapsed(); });
    }
    app(req, res);
    // The app replaces client correlation headers; retain only its random RID.
    const rid = res.getHeader('X-Request-ID');
    if (trace && typeof rid === 'string' && /^[0-9a-f-]{36}$/.test(rid)) trace.requestId = rid;
  });
  // Mirror src/index.ts, not a new production handler/transaction deadline.
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected loopback TCP listener');
  const base = `http://127.0.0.1:${address.port}`;
  const client = request(base);
  console.log(JSON.stringify({ event: 'idempotency_http_listener', host: '127.0.0.1', port: address.port,
    requestTimeoutMs: server.requestTimeout, headersTimeoutMs: server.headersTimeout,
    responseTimeoutMs: 20000, requestDeadlineMs: 22000 }));
  const errorCode = (error: unknown) => {
    const code = (error as { code?: unknown } | null)?.code;
    return typeof code === 'string' && /^(ECONNABORTED|ECONNREFUSED|ECONNRESET|EPIPE|ETIMEDOUT)$/.test(code)
      ? code : 'REQUEST_FAILED'; // Never serialize an Error/Request/body/header/token.
  };
  async function diagnose(reason: 'slow_batch' | 'rejected_batch' | 'failed_case') {
    let database: unknown;
    try { database = await databaseSnapshot(); }
    catch { database = { snapshot: 'unavailable' }; }
    console.log(JSON.stringify({ event: 'idempotency_http_diagnostic', reason, batch,
      requests: [...traces.values()], database }));
  }
  function track(test: Test) {
    const trace: Trace = { index: sequence++ };
    traces.set(trace.index, trace);
    requests.set(test, trace);
    test.set('X-Test-Request-Index', String(trace.index)).timeout({ response: 20000, deadline: 22000 });
    test.once('request', () => {
      trace.dispatchedMs = elapsed();
      const outgoing = test.req as ClientRequest; // HTTP/1, never the http2 overload.
      outgoing.once('socket', socket => {
        trace.socketMs = elapsed();
        if (!socket.connecting) trace.connectedMs = elapsed();
        else socket.once('connect', () => { trace.connectedMs = elapsed(); });
      });
      outgoing.once('finish', () => { trace.sentMs = elapsed(); });
    });
    test.once('response', (response: Response) => { trace.responseMs = elapsed(); trace.status = response.status; });
    test.once('end', () => { trace.endedMs = elapsed(); });
    test.once('error', (error: unknown) => { trace.errorCode = errorCode(error); });
    return test;
  }
  return {
    post: (path: string) => track(client.post(path)),
    put: (path: string) => track(client.put(path)),
    diagnose,
    async all(tests: Test[]): Promise<Response[]> {
      const batchId = ++batch;
      const batchTraces = tests.map((test, index) => {
        const trace = requests.get(test);
        if (!trace) throw new Error('Untracked concurrent request');
        trace.batchIndex = index;
        return trace;
      });
      // A single event-driven watchdog snapshot BEFORE PG's 15s statement
      // deadline. Not polling, not a sleep, and never a retry or success path.
      let slowSnapshot: Promise<void> | undefined;
      const watchdog = setTimeout(() => { slowSnapshot = diagnose('slow_batch'); }, 6000);
      try {
        // allSettled preserves every completion even if one transport fails.
        const settled = await Promise.allSettled(tests.map((test, i) => test.then(response => {
          Object.assign(batchTraces[i], { settledMs: elapsed(), outcome: 'fulfilled' });
          return response;
        }, (error: unknown) => {
          Object.assign(batchTraces[i], { settledMs: elapsed(), outcome: 'rejected', errorCode: errorCode(error) });
          throw new Error('Bounded HTTP request failed');
        })));
        console.log(JSON.stringify({ event: 'idempotency_http_batch', batch: batchId, requests: batchTraces }));
        if (settled.some(result => result.status === 'rejected')) {
          await diagnose('rejected_batch');
          throw new Error(`HTTP batch ${batchId} incomplete; see sanitized index/RID/SQL diagnostics`);
        }
        return settled.map(result => (result as PromiseFulfilledResult<Response>).value);
      } finally {
        clearTimeout(watchdog);
        await slowSnapshot;
      }
    },
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
        server.closeAllConnections();
      });
    },
  };
}
