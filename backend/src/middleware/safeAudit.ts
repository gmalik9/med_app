import type { Request } from 'express';

// Finite event -> originating component map. Endpoint family is not error origin:
// authentication may fail while handling a notes URL. No error/data argument.
const diagnosticSources = {
  authentication_unavailable: 'authentication',
  registration_failed: 'auth', login_failed: 'auth', refresh_failed: 'auth', logout_failed: 'auth',
  profile_fetch_failed: 'auth', profile_update_failed: 'auth',
  note_read_failed: 'notes', note_write_failed: 'notes', note_history_failed: 'notes',
  patients_list_failed: 'patients', patient_search_failed: 'patients', patient_read_failed: 'patients',
  patient_create_failed: 'patients', patient_update_failed: 'patients', patient_status_failed: 'patients', sticker_scan_failed: 'patients',
  vitals_write_failed: 'vitals', vitals_read_failed: 'vitals', vitals_history_failed: 'vitals',
  appointment_write_failed: 'appointments', appointments_read_failed: 'appointments',
  appointment_status_failed: 'appointments', appointment_history_failed: 'appointments',
  visit_write_failed: 'visits', visit_history_failed: 'visits', visits_today_failed: 'visits',
  template_write_failed: 'templates', templates_read_failed: 'templates', templates_category_failed: 'templates',
  analytics_read_failed: 'analytics', patient_trends_failed: 'analytics', analytics_write_failed: 'analytics',
  formatting_failed: 'format-note', request_failed: 'application',
} as const;

export function safeDiagnostic(req: Request, event: keyof typeof diagnosticSources): void {
  if (!Object.prototype.hasOwnProperty.call(diagnosticSources, event)) return;
  const requestId = typeof req.requestId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(req.requestId)
    ? req.requestId : undefined;
  try { console.error(JSON.stringify({ event, sourceCategory: diagnosticSources[event], requestId })); }
  catch { /* Operator transport failure never changes application behavior. */ }
}
