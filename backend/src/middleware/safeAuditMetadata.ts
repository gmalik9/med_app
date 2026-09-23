import type { Request } from 'express';
import { isIP } from 'node:net';

// Only application-owned constants may become endpoint labels. This catalog is
// descriptive, NOT an authorization/validation router. New/unknown routes still
// get audited under /api/unmatched, never under a user-supplied URL.
const endpointCatalog = {
  auth: ['/capabilities', '/register', '/login', '/refresh', '/logout', '/profile'],
  patients: ['', '/search', '/scan-sticker', '/create', '/:id', '/:id/active'],
  notes: ['/patient/:patientId', '/patient/:patientId/history'],
  vitals: ['/patient/:patientId', '/patient/:patientId/latest', '/patient/:patientId/history'],
  appointments: ['/create', '/upcoming', '/:appointmentId/status', '/patient/:patientId/history'],
  visits: ['/create', '/patient/:patientId', '/doctor/today'],
  templates: ['/create', '/list', '/category/:category'],
  analytics: ['/dashboard', '/patient/:patientId/trends', '/event'],
  'format-note': [''],
} as const;

export type EndpointSource = keyof typeof endpointCatalog | 'unmatched';
export type SafeMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'OTHER';
export interface SafeEndpointMetadata {
  readonly method: SafeMethod;
  readonly endpoint: string;
  readonly endpointSource: EndpointSource;
  readonly endpointResolution: 'catalog' | 'unmatched';
}

const endpoints = Object.entries(endpointCatalog).flatMap(([source, paths]) => paths.map(path => {
  const endpoint = `/api/${source}${path}`;
  // Operator labels contain constants only. Restricted references are handled
  // separately below and must never be spread into operator events.
  const pattern = endpoint.replace(/:[A-Za-z]+/g, '[^/]+');
  return { endpoint, source: source as EndpointSource, pattern: new RegExp(`^${pattern}/?$`, 'i') };
}));
const methods: readonly string[] = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

// Matches the /api mount boundary, including /API and bare /api. Do not gate on
// startsWith('/api/'): Express accepts case variants that that gate would miss.
export const isApiRequest = (req: Request): boolean => /^\/api(?:\/|$)/i.test(req.path);

export function safeEndpointMetadata(req: Request): SafeEndpointMetadata {
  const match = endpoints.find(entry => entry.pattern.test(req.path));
  return Object.freeze({
    method: methods.includes(req.method) ? req.method as SafeMethod : 'OTHER',
    endpoint: match?.endpoint ?? '/api/unmatched',
    endpointSource: match?.source ?? 'unmatched',
    endpointResolution: match ? 'catalog' : 'unmatched',
  });
}

// Restricted audit storage keeps the existing actor/IP fields. Operator logs
// and counters never receive them.
export function safeAuditActor(req: Request) {
  const userId = req.user?.userId;
  const ip = req.ip || req.socket.remoteAddress || '';
  return {
    userId: Number.isSafeInteger(userId) && userId! > 0 ? userId! : null,
    ipAddress: isIP(ip) ? ip : null,
  };
}

export interface RestrictedAuditScope {
  readonly resourceId?: string;
  readonly resourceType?: 'patient_identifier' | 'patient_record' | 'appointment';
  readonly referenceSource?: 'requested';
  readonly resolvedPatientId?: string;
  readonly resolvedResourceId?: number;
  readonly listScope?: Readonly<{
    kind: 'shared_patient_directory' | 'patient_history' | 'patient_trends' | 'actor_upcoming' | 'actor_today' | 'available_templates' | 'actor_dashboard';
    limit?: number;
    offset?: number;
    continuation?: boolean;
    filter?: 'all' | 'upcoming';
  }>;
}

// Match the nontransforming URL identifier contract. Never trim/case-fold or
// accept arrays, objects, controls, spaces, SQL punctuation or double decoding.
const patientReference = (value: unknown): value is string => typeof value === 'string'
  && value.length > 0 && value.length <= 50 && !/[^\p{L}\p{N}_.-]/u.test(value);
const recordReference = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9]{1,10}$/.test(value) && Number(value) <= 2147483647;
const resolvedReferences = new WeakMap<Request, Readonly<{ resolvedPatientId: string; resolvedResourceId?: number }>>();

// Called only by a handler AFTER its authorized query resolves a record. Pick
// explicit fields, never pass the row, response, clinical body or OCR result.
export function setResolvedAuditReference(req: Request, patientId: unknown, resourceId: unknown): void {
  if (!patientReference(patientId)) return;
  resolvedReferences.set(req, Object.freeze({ resolvedPatientId: patientId,
    ...(Number.isInteger(resourceId) && Number(resourceId) > 0 && Number(resourceId) <= 2147483647
      ? { resolvedResourceId: Number(resourceId) } : {}),
  }));
}

// Captured at the application boundary (before mounted routers change req.path).
// Only retained by the sink for successful authenticated terminal events. A
// requested reference is NOT a claim that a record exists or was disclosed.
export function requestedAuditScope(req: Request, endpoint: SafeEndpointMetadata): Readonly<RestrictedAuditScope> {
  const { method, endpoint: path } = endpoint;
  const read = method === 'GET' || method === 'HEAD';
  let resourceId: string | undefined;
  let resourceType: RestrictedAuditScope['resourceType'];
  let decoded: string | undefined;
  const template = path.split('/');
  const param = template.findIndex(part => part.startsWith(':'));
  if (param >= 0) {
    try { decoded = decodeURIComponent(req.path.split('/')[param]); } catch { /* Malformed URL: no reference. */ }
  }
  if (read && path === '/api/patients/search') {
    if (patientReference(req.query.patientId)) { resourceId = req.query.patientId; resourceType = 'patient_identifier'; }
  } else if ((read || ((method === 'POST') && ['/api/notes/patient/:patientId', '/api/vitals/patient/:patientId'].includes(path)))
      && template.includes(':patientId') && patientReference(decoded)) {
    resourceId = decoded; resourceType = 'patient_identifier';
  } else if ((read && path === '/api/patients/:id') || (method === 'PUT' && path === '/api/patients/:id')
      || (method === 'PATCH' && path === '/api/patients/:id/active')) {
    if (recordReference(decoded)) { resourceId = decoded; resourceType = 'patient_record'; }
    else if (read && patientReference(decoded)) { resourceId = decoded; resourceType = 'patient_identifier'; }
  } else if (method === 'PUT' && path === '/api/appointments/:appointmentId/status' && recordReference(decoded)) {
    resourceId = decoded; resourceType = 'appointment';
  }

  let listScope: RestrictedAuditScope['listScope'];
  if (read) {
    const history = ['/api/notes/patient/:patientId/history', '/api/vitals/patient/:patientId/history',
      '/api/appointments/patient/:patientId/history', '/api/visits/patient/:patientId'].includes(path);
    if (path === '/api/patients' || (history && resourceId !== undefined)) {
      const defaultLimit = path === '/api/patients' || endpoint.endpointSource === 'vitals' ? 50 : 30;
      const bounded = (value: unknown, fallback: number, min: number, max: number) => typeof value === 'string'
        && /^[0-9]{1,6}$/.test(value) && Number(value) >= min && Number(value) <= max ? Number(value) : fallback;
      listScope = { kind: history ? 'patient_history' : 'shared_patient_directory',
        limit: bounded(req.query.limit, defaultLimit, 1, 100), continuation: req.query.cursor !== undefined,
        ...(path === '/api/patients' ? { offset: bounded(req.query.offset, 0, 0, 100000) } : {}),
        ...(path === '/api/visits/patient/:patientId' ? { filter: req.query.filter === 'upcoming' ? 'upcoming' as const : 'all' as const } : {}),
      };
    } else if (path === '/api/appointments/upcoming') listScope = { kind: 'actor_upcoming', limit: 20 };
    else if (path === '/api/visits/doctor/today') listScope = { kind: 'actor_today', limit: 100 };
    else if (path === '/api/analytics/dashboard') listScope = { kind: 'actor_dashboard' };
    else if (path === '/api/analytics/patient/:patientId/trends' && resourceId) listScope = { kind: 'patient_trends' };
    else if (path === '/api/templates/list') listScope = { kind: 'available_templates', limit: 50 };
    else if (path === '/api/templates/category/:category') listScope = { kind: 'available_templates', limit: 100 };
  }
  return Object.freeze({ ...(resourceId === undefined ? {} : { resourceId, resourceType, referenceSource: 'requested' as const }),
    ...(listScope ? { listScope: Object.freeze(listScope) } : {}),
  });
}

export function terminalAuditScope(req: Request, requested: Readonly<RestrictedAuditScope>): Readonly<RestrictedAuditScope> {
  const resolved = resolvedReferences.get(req);
  // Resolved context cannot attach to an unknown route or an unrelated patient.
  const matches = requested.resourceId !== undefined && resolved
    && (requested.resourceType !== 'patient_identifier' || requested.resourceId === resolved.resolvedPatientId);
  return Object.freeze({ ...requested, ...(matches ? resolved : {}) });
}
