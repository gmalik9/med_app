import { createHash } from 'node:crypto';
import { createServer, type ClientRequest, type RequestListener, type Server } from 'node:http';
import type { EventEmitter } from 'node:events';
import type { Express } from 'express';
import request, { type Response, type Test } from 'supertest';

// Test-only: never log bodies, auth/cookie headers, raw URLs/packets or cursors.
// The legacy mode is an explicit investigation control, never a fallback/retry.
export async function paginationHttp(app: Express) {
  const lifecycle = process.env.PAGINATION_HTTP_LIFECYCLE ?? 'suite';
  if (!['suite', 'per-request'].includes(lifecycle)) throw new Error('Invalid pagination test lifecycle');
  type Trace = Record<string, unknown> & { index: number };
  const traces = new Map<number, Trace>();
  const servers = new Set<Server>();
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  const digest = (value: string) => createHash('sha256').update(value).digest('hex');
  const emit = (event: string, data: unknown) => console.log(JSON.stringify({ event, lifecycle, data }));
  const safeCode = (error: unknown) => {
    const code = (error as { code?: unknown } | null)?.code;
    return typeof code === 'string' && /^(HPE_[A-Z_]+|ECONNABORTED|ECONNREFUSED|ECONNRESET|EPIPE|ETIMEDOUT)$/.test(code) ? code : 'REQUEST_FAILED';
  };
  function querySummary(raw: string) {
    const url = new URL(raw, 'http://127.0.0.1');
    return [...url.searchParams].map(([key, value]) => ({
      key: /^(cursor|limit|offset|filter)(\[(bad)?\]|\.value)?$/.test(key) ? key : 'other',
      length: value.length, bytes: Buffer.byteLength(value), sha256: digest(value),
      // Only nonclinical fixed enum/numeric query values may be printed.
      value: /^(limit|offset)$/.test(key) && /^-?[0-9.]{1,8}$/.test(value) ? value :
        key === 'filter' && ['all', 'upcoming', 'invalid'].includes(value) ? value : '[redacted]',
    }));
  }
  const listener: RequestListener = (req, res) => {
    const trace = traces.get(Number(req.headers['x-test-pagination-index']));
    if (trace) {
      Object.assign(trace, { receivedMs: elapsed(), serverPort: req.socket.localPort,
        peerPort: req.socket.remotePort, receivedQuery: querySummary(req.url ?? '/'),
        receivedTargetBytes: Buffer.byteLength(req.url ?? '') });
      res.once('finish', () => {
        Object.assign(trace, { finishedMs: elapsed(), serverStatus: res.statusCode });
      });
      res.once('close', () => { trace.closedMs = elapsed(); });
    }
    app(req, res);
    const rid = res.getHeader('X-Request-ID');
    if (trace && typeof rid === 'string' && /^[0-9a-f-]{36}$/.test(rid)) trace.serverRequestId = rid;
  };
  function observe(server: Server, trace?: Trace) {
    servers.add(server);
    // Observe emit rather than adding a clientError listener: Node's default
    // parser-error response depends on emit returning false. Preserve it exactly.
    const originalEmit: EventEmitter['emit'] = server.emit;
    server.emit = function (event: string | symbol, ...args: any[]) {
      if (event === 'clientError') {
        const [error, socket] = args;
        emit('pagination_http_parser_error', { index: trace?.index, code: safeCode(error),
          bytesParsed: error.bytesParsed, packetBytes: error.rawPacket?.length,
          serverPort: socket.localPort, peerPort: socket.remotePort });
      }
      return originalEmit.call(this, event, ...args);
    };
    server.once('close', () => { servers.delete(server); if (trace) trace.listenerClosedMs = elapsed(); });
  }
  let base: string | undefined;
  if (lifecycle === 'suite') {
    const server = createServer(listener);
    observe(server);
    // Match src/index.ts without changing any application/global test deadline.
    server.requestTimeout = 30000;
    server.headersTimeout = 10000;
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); });
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected loopback HTTP server');
    base = `http://127.0.0.1:${address.port}`;
    emit('pagination_http_listener', { host: '127.0.0.1', port: address.port,
      responseTimeoutMs: 20000, deadlineMs: 22000 });
  }
  function track(method: 'get' | 'post', path: string) {
    const trace: Trace = { index: traces.size, method,
      endpoint: path.replace(/\/patient\/[^/]+/, '/patient/:patientId') };
    traces.set(trace.index, trace);
    const test: Test = request(base ?? listener)[method](path);
    if (!base) observe(test.app as Server, trace);
    test.set('X-Test-Pagination-Index', String(trace.index)).timeout({ response: 20000, deadline: 22000 });
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    test.once('request', () => {
      const outgoing = test.req as ClientRequest;
      Object.assign(trace, { dispatchedMs: elapsed(), sentQuery: querySummary(test.url),
        sentTargetBytes: Buffer.byteLength(outgoing.path), reusedSocket: outgoing.reusedSocket });
      outgoing.once('socket', socket => {
        trace.socketMs = elapsed();
        const connected = () => Object.assign(trace, { connectedMs: elapsed(), clientPort: socket.localPort, targetPort: socket.remotePort });
        if (socket.connecting) socket.once('connect', connected); else connected();
      });
      outgoing.once('finish', () => { trace.sentMs = elapsed(); });
      watchdog = setTimeout(() => emit('pagination_http_slow', trace), 6000);
    });
    test.once('response', (response: Response) => {
      const allowedErrors = ['Invalid request fields', 'Invalid pagination parameters', 'No authorization token',
        'Invalid or expired token', 'Session expired', 'Request rejected', 'Too many requests; try again later'];
      const error = response.body?.error;
      Object.assign(trace, { responseMs: elapsed(), status: response.status,
        headers: Object.fromEntries(['x-request-id', 'content-type', 'content-length', 'connection', 'keep-alive']
          .filter(key => response.headers[key] !== undefined).map(key => [key, response.headers[key]])),
        body: response.status < 400 ? '[success body omitted]' : response.text === '' ? '' :
          allowedErrors.includes(error) ? { error } : '[non-allowlisted body omitted]',
        responseBytes: Buffer.byteLength(response.text ?? ''),
        responseClass: response.headers['x-request-id'] ? 'application' : 'no-application-request-id',
      });
      // Keep normal-path timing close to the original harness. Complete traces
      // are emitted once at teardown; missing-RID responses are immediate.
      if (!response.headers['x-request-id']) emit('pagination_http_response', trace);
    });
    test.once('end', () => { trace.endedMs = elapsed(); });
    test.once('error', (error: unknown) => {
      // Superagent emits error for ordinary expected 400/401 responses too.
      // Only a response-less error is a transport failure; assertions still run.
      if (trace.status !== undefined) { trace.httpRejectionEvent = true; return; }
      clearTimeout(watchdog);
      trace.errorCode = safeCode(error);
      emit('pagination_http_error', trace);
    });
    // This callback runs on the existing assertion path, before user assertions;
    // it does not catch/retry/replace them. Legacy close stalls remain visible.
    test.expect(() => { clearTimeout(watchdog); trace.assertionCallbackMs = elapsed(); });
    return test;
  }
  return {
    get: (path: string) => track('get', path),
    post: (path: string) => track('post', path),
    diagnose: () => emit('pagination_http_case_failure', [...traces.values()].slice(-45)),
    async close() {
      await Promise.all([...servers].map(server => new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
        server.closeAllConnections();
      })));
      emit('pagination_http_summary', [...traces.values()]);
    },
  };
}
