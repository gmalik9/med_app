import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';

export const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Invalid calendar date');
const text = (max: number) => z.string().max(max);
const optionalText = (max: number) => text(max).optional();
// URL values are already decoded by Express. Validate the exact string that
// reaches handlers: no trimming, case folding, Unicode normalization or decoding.
const patientIdentifier = z.string().min(1).max(50).refine(value => !/[^\p{L}\p{N}_.-]/u.test(value), 'Invalid patient identifier');
const internalId = z.string().min(1).max(10).refine(value => !/[^0-9]/.test(value) && Number(value) <= 2147483647, 'Invalid internal ID');
// Preserve existing create-body normalization only: parsed bodies replace the
// original req.body below, so handlers receive the validated, trimmed value.
const patientId = z.string().trim().pipe(patientIdentifier);
const optionalDate = z.union([calendarDate, z.literal(''), z.null()]).transform(v => v || null).optional();
const timestamp = z.string().max(40).refine(v => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) &&
  calendarDate.safeParse(v.slice(0, 10)).success && Number.isFinite(Date.parse(v)), 'Invalid timestamp');
const password = z.string().min(1).refine(v => Buffer.byteLength(v, 'utf8') <= 72, 'Password exceeds bcrypt byte limit');
const credentials = { email: z.email().max(255).trim(), password };
const patientFields = {
  firstName: optionalText(255), lastName: optionalText(255), gender: optionalText(50),
  dob: optionalDate, phone: optionalText(20), email: z.union([z.email().max(255), z.literal('')]).optional(),
  allergies: optionalText(10000), medicalConditions: optionalText(10000), medications: optionalText(10000),
};
const vital = (max: number, integer = false) => (integer ? z.number().int() : z.number()).min(0).max(max).nullable().optional();
const rules: ['post' | 'put' | 'patch', string, z.ZodType][] = [
  ['post', '/auth/register', z.object({ ...credentials, password: password.refine(v => v.length >= 12, 'Use at least 12 characters'), firstName: optionalText(255), lastName: optionalText(255) })],
  ['post', '/auth/login', z.object(credentials)],
  ['post', '/auth/refresh', z.object({ refreshToken: z.string().min(1).max(4096) })],
  ['post', '/auth/logout', z.object({ refreshToken: z.string().min(1).max(4096).optional() }).strict().optional()],
  ['put', '/auth/profile', z.object({ first_name: optionalText(255), last_name: optionalText(255), specialty: optionalText(255), license_number: optionalText(255), phone: optionalText(20), bio: optionalText(10000) })],
  ['post', '/patients/create', z.object({ patientId, ...patientFields })],
  ['put', '/patients/:id', z.object(patientFields)],
  ['patch', '/patients/:id/active', z.object({ is_active: z.boolean() })],
  ['post', '/notes/patient/:patientId', z.object({ noteText: z.string().trim().min(1).max(50000), date: calendarDate.optional(), medicalCodes: z.array(z.string().trim().min(1).max(50)).max(100).default([]), expectedRevision: z.number().int().min(0).default(0) })],
  ['post', '/vitals/patient/:patientId', z.object({ temperature: vital(60), heartRate: vital(400, true), bloodPressureSystolic: vital(400, true), bloodPressureDiastolic: vital(300, true), respiratoryRate: vital(150, true), oxygenSaturation: vital(100), weight: vital(1000), height: vital(300), notes: optionalText(10000) }).refine(v => Object.entries(v).some(([k, x]) => k !== 'notes' && x !== null && x !== undefined), 'At least one measurement is required')],
  ['post', '/appointments/create', z.object({ patientId, appointmentDate: timestamp, appointmentType: optionalText(100), reason: optionalText(10000) })],
  ['put', '/appointments/:id/status', z.object({ status: z.enum(['scheduled', 'completed', 'cancelled', 'no-show']) })],
  ['post', '/visits/create', z.object({ patientId, visitType: optionalText(50), chiefComplaint: optionalText(10000), diagnosis: optionalText(10000), treatmentProvided: optionalText(10000), followupInstructions: optionalText(10000), nextVisitDate: optionalDate })],
  ['post', '/templates/create', z.object({ templateName: z.string().trim().min(1).max(255), templateCategory: optionalText(100), templateText: z.string().trim().min(1).max(50000), isPublic: z.boolean().optional() })],
  // Analytics is an allowlisted counter, not an arbitrary PHI collection channel.
  ['post', '/analytics/event', z.object({ eventType: z.enum(['login', 'search', 'note_saved', 'template_used']), eventData: z.object({}).optional() })],
  ['post', '/format-note', z.object({ text: z.string().trim().min(1).max(20000) })],
];

const invalidRequest = (res: Response) => res.status(400).json({ error: 'Invalid request fields' });
const noteDateQuery = z.object({ date: calendarDate.optional() }).strict();

// Match the application's Express defaults using Express itself, not a second
// regex grammar: static route segments are case-insensitive, and a terminal slash
// is optional. The /api mount also uses these defaults (including /API).
// Never lowercase/rewrite req.url, identifiers, query keys, or business data.
// Express decodes parameters once; malformed encodings propagate as HTTP 400.
const validationRoutes = Router({ caseSensitive: false, strict: false });
validationRoutes.param('id', (_req, res, next, value: string) => {
  if (!internalId.safeParse(value).success) return invalidRequest(res);
  next();
});
validationRoutes.param('patientId', (_req, res, next, value: string) => {
  if (!patientIdentifier.safeParse(value).success) return invalidRequest(res);
  next();
});
// Cover patient parameters on both write routes and nested clinical reads.
validationRoutes.use([
  '/notes/patient/:patientId', '/vitals/patient/:patientId',
  '/appointments/patient/:patientId', '/visits/patient/:patientId',
  '/analytics/patient/:patientId',
], (_req, _res, next) => next());
// Only the single-note read accepts date (or no query for local today). An exact
// Express GET route also covers HEAD/case/slash variants, never /history or the
// directory/visit routes with their separate pagination/filter contracts.
validationRoutes.get('/notes/patient/:patientId', (req, res, next) => {
  const result = noteDateQuery.safeParse(req.query);
  const queryStart = req.url.indexOf('?');
  const supplied = new URLSearchParams(queryStart < 0 ? '' : req.url.slice(queryStart + 1));
  // Inspect the wire keys too: simple parsers retain date[x]/date.value, while
  // extended parsers may discard prototype-shaped keys. Neither is omission.
  // Decode the original query once, without rewriting what handlers receive.
  if (!result.success || [...supplied.keys()].some(key => key !== 'date') || supplied.getAll('date').length > 1 ||
    result.data.date !== (supplied.get('date') ?? undefined)) return invalidRequest(res);
  next();
});
validationRoutes.get('/patients/search', (req, res, next) => {
  if (req.query.patientId === undefined) return invalidRequest(res);
  next();
});
// This read accepts either a business ID or ASCII numeric internal ID. Search
// remains the unambiguous way to look up a numeric business ID outside int32.
validationRoutes.get('/patients/:patientId', (req, res, next) => {
  const value = String(req.params.patientId);
  if (!/[^0-9]/.test(value) && !internalId.safeParse(value).success) return invalidRequest(res);
  next();
});
for (const [method, path, schema] of rules) {
  validationRoutes[method](path, (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return invalidRequest(res);
    req.body = result.data;
    next();
  });
}

export function validateRequest(req: Request, res: Response, next: NextFunction) {
  const fail = () => invalidRequest(res);
  for (const field of ['limit', 'offset']) {
    const value = req.query[field];
    const min = field === 'limit' ? 1 : 0;
    const max = field === 'limit' ? 100 : 100000;
    if (value !== undefined && (typeof value !== 'string' || !/^\d+$/.test(value) || Number(value) < min || Number(value) > max)) return fail();
  }
  if (req.query.date !== undefined && !calendarDate.safeParse(req.query.date).success) return fail();
  if (req.query.patientId !== undefined && !patientIdentifier.safeParse(req.query.patientId).success) return fail();
  validationRoutes(req, res, next);
}
