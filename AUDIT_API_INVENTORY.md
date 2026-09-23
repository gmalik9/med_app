# Audited API inventory

Current source contract; see [QUALITY_AUDIT.md](QUALITY_AUDIT.md) for test evidence and unresolved shared-clinic access. This supersedes conflicting examples in historical API documentation.

**Common controls:** JSON responses; bearer access token plus exact active DB session on protected clinical routes; logout has the revocation-only credential exception below; `Cache-Control: no-store`; request correlation ID; exact CORS; global 600 requests/minute/IP; login/register/refresh 30/15 minutes/IP; OCR/AI 10/minute/IP. Limits are process-local. JSON max 128 KiB. Request errors use `{error}` (400 validation, 401 auth, 403 configured denial, 404 not found/unauthorized object, 409 conflict, 413 size, 415 image, 429 rate limit, 500 generic unexpected failure, 502 external AI failure, 503 disabled/unavailable). Some route-local DB failures still return 500 rather than a specialized retry status. Business writes are not automatically retried on ambiguous network/server failure; the client may replay once after successful same-generation authentication refresh.

**Permission abbreviations:** public = no bearer; self = current clinician/session; shared = any authenticated clinician in the existing shared-clinic model, **not tenant/care-team isolation**. Mutation audit means successful clinical write and audit commit in one DB transaction. API request-start and terminal metadata events are best effort, not awaited before disclosure. Restricted DB terminal events retain validated patient/resource references and bounded list scope; stdout/metrics do not contain clinical identifiers, raw queries/cursors or bodies. No durable read outbox is implemented.

| Method and path | Access | Request / validation | Response, DB action, side effects |
|---|---|---|---|
| GET `/health` | Public | None | `{status:ok}`; no DB query, no PHI |
| GET `/ready` | Public | None | Read-only schemaState: exact [1, 2, 3], required objects and unique indexes; ready200 / generic unavailable503 |
| GET `/api/auth/capabilities` | Public | None | `{allowRegistration,aiEnabled,sessionTimeoutMinutes}`; safe configuration summary, no secrets; no-store |
| POST `/api/auth/register` | Public, production disabled by default | Email ≤255; password ≥12 characters, ≤72 UTF-8 bytes; optional names ≤255; client role discarded | 201 `{user,accessToken,refreshToken}`; user+session transaction; 409 duplicate |
| POST `/api/auth/login` | Public | Email, nonempty password ≤72 bytes | `{user,accessToken,refreshToken}`; active-user password check, session insertion; 401 generic invalid credentials |
| POST `/api/auth/refresh` | Public but requires valid refresh credential | String ≤4096; signature/purpose/session/hash/lifetime/idle/account verification | `{accessToken,refreshToken}`; atomic one-time rotation; old token replay 401 |
| POST `/api/auth/logout` | Self session, revocation only | Valid access bearer OR signed unexpired `refreshToken`; if both, same user/session; access may be expired only with valid refresh | 204 exact session revoked; invalid/mismatched/expired-refresh/already-revoked401; previously rotated refresh may revoke but cannot refresh |
| GET `/api/auth/profile` | Self | Valid bearer | `{user}` including identity/role/contact/profile, no hash |
| PUT `/api/auth/profile` | Self | Bounded name/specialty/license/phone/bio strings | `{user}`; current-user update; PUT replacement-style semantics, not partial PATCH |
| GET `/api/patients/` | Shared | Limit1–100 default50; cursor OR legacy offset0–100000 | `{patients,hasMore,nextCursor,limit,offset}`; created_at/id descending, null-first; cumulative medical-code aggregate |
| GET `/api/patients/search` | Shared | Required `patientId` query, 1–50 identifier characters | `{exists,patient}`; exact MRN/business-ID lookup; search resource ID audited |
| GET `/api/patients/:id` | Shared | Numeric ID interpreted as internal integer; nonnumeric as business ID | `{patient}` /404; for all-numeric MRNs use search to avoid ambiguous ID namespace |
| POST `/api/patients/create` | Shared | Business patientId; bounded names/gender/phone/email/allergies/conditions/medications; valid calendar DOB/null | 201 `{patient}`; complete patient+mutation audit transaction; duplicate409 |
| PUT `/api/patients/:id` | Shared | Internal numeric ID; bounded patient fields; omitted DOB preserved, explicit null clears | `{patient}` with cumulative codes; mutation audit; 404 missing |
| PATCH `/api/patients/:id/active` | Shared | Internal numeric ID; boolean `is_active` | `{patient,message}`; mutation audit; **not deletion** |
| POST `/api/patients/scan-sticker` | Shared | Multipart `image`, JPEG/PNG/WebP; actual decoder check; 8MiB, 12MP, single file | `{text,parsed,exists,patient}`; local OCR; optional lookup and metadata audit; no automatic patient creation/image storage; review warnings |
| GET `/api/notes/patient/:patientId` | Self note for shared patient | Optional valid calendar `date`, default server-local today | `{exists,note}`; current doctor/day; note includes revision |
| POST `/api/notes/patient/:patientId` | Self note for shared patient | Nonblank `noteText` ≤50000; optional date; ≤100 bounded code strings; expectedRevision integer≥0 | `{note}`; revision-checked upsert+mutation audit; 409 stale update, 404 missing patient; one note/doctor/patient/day |
| GET `/api/notes/patient/:patientId/history` | Shared | Limit1–100 default30; optional cursor | `{notes,hasMore,nextCursor}`; note_date/id descending, all clinicians |
| POST `/api/vitals/patient/:patientId` | Shared write, actor attributed | At least one nonnegative bounded numeric vital, integer counts; optional notes ≤10000; optional strict Idempotency-Key | 201 `{vitalSigns}`; atomic insert+audit+key, replay current resource; 404 missing patient |
| GET `/api/vitals/patient/:patientId/latest` | Shared | Business patient ID | `{vitalSigns}` or null; latest reading |
| GET `/api/vitals/patient/:patientId/history` | Shared | Limit1–100 default50; optional cursor | `{vitalSigns:[],hasMore,nextCursor}`; recorded_date/id descending |
| POST `/api/appointments/create` | Current doctor, shared patient | Patient ID, valid datetime, type≤100/reason≤10000; optional strict Idempotency-Key | 201 `{appointment}`; atomic insert+audit+key, replay current resource |
| GET `/api/appointments/upcoming` | Self doctor | None | `{appointments}`; next 20 scheduled appointments |
| PUT `/api/appointments/:appointmentId/status` | Assigned doctor only | Numeric ID; scheduled/completed/cancelled/no-show enum | `{appointment}`; owner-scoped mutation+audit; missing/other-user404 |
| GET `/api/appointments/patient/:patientId/history` | Shared | Business patient ID; limit1–100 default30; optional cursor | `{appointments,hasMore,nextCursor}`; appointment_date/id descending, clinician attribution |
| POST `/api/visits/create` | Current clinician, shared patient | Patient ID, bounded type/text fields, optional valid follow-up date (empty→null); optional strict Idempotency-Key | 201 `{visit}`; atomic insert+audit+key, replay current resource |
| GET `/api/visits/patient/:patientId` | Shared | Limit1–100 default30; optional cursor; filter=all or upcoming | `{visits,hasMore,nextCursor}`; visit_date/id descending; upcoming means future visit_date, not follow-up date |
| GET `/api/visits/doctor/today` | Self doctor | None | `{visits}`; today using server/DB time, max100 |
| POST `/api/templates/create` | Current creator | Name≤255, text≤50000, category≤100, boolean isPublic | 201 `{template}`; private by default; public text must not contain PHI |
| GET `/api/templates/list` | Active public or own | None | `{templates}`; max50; private other-user templates excluded |
| GET `/api/templates/category/:category` | Active public or own | Category path string; parameterized SQL | `{templates}`; matching category, max100 |
| GET `/api/analytics/dashboard` | Self doctor | None | Counts and recent action aggregates from notes/appointments/visits/audit; five queries |
| GET `/api/analytics/patient/:patientId/trends` | Shared | Business patient ID | `{trends:{vitals,visitFrequency}}`; 10 vitals /12 months |
| POST `/api/analytics/event` | Current clinician | Event type login/search/note_saved/template_used; arbitrary eventData keys discarded | `{success:true}`; local DB event only, no external analytics |
| POST `/api/format-note` | Authenticated; external approval gate | Nonblank text≤20000; approval flag plus backend key | `{text}` only if complete provider response; default503. Enabled path transmits note over HTTPS to Gemini; 20s timeout, no retry, no save; clinician review required |

Removed: POST `/api/seed` returns404. No password reset, MFA, admin, patient DELETE, download/object-store URL, server export or authorization-management endpoints exist. Route presence does not establish a clinically complete workflow. Tests cover all route families and successful core CRUD/read paths, but do not fuzz every field combination or exercise enabled Gemini against a provider.

## Current authentication and retry contracts — 2026-09-20

- Capabilities are public UI hints, not permission grants or provider approval.
	Server-side gates still apply. Browser credentials remain JavaScript-readable
	sessionStorage; approved cookie/BFF/CSRF topology, MFA and provisioning are not implemented.
- Logout may use refresh possession without an access header after access expiry.
	A supplied access header must be validly signed, purpose/issuer/audience-bound
	and same-session; only its expiry is relaxed when paired with valid refresh.
	An unexpired rotated refresh may revoke its session regardless of stored hash
	so a refresh/logout race cannot resurrect it. Refresh issuance still requires
	the current hash and idle/lifetime/active-account checks. Revocation checks an
	active user and unexpired DB session; it is not an arbitrary session-ID API.
	Completed logout denies that session's tokens; already-authorized in-flight
	requests are not claimed cancelled. Client generations prevent stale identity
	callbacks and cross-account replay; a network logout failure is not proof of revocation.
- Single-note `date` is optional strict `YYYY-MM-DD`; omission means server-local
	today. Impossible dates, repeated parameters, arrays and bracket/dot variants
	are rejected, not treated as omission. Shared history is a different endpoint.
- Only the three create routes above implement `Idempotency-Key`: optional for
	old clients, but when present exactly one UUID-v4 header (36 ASCII characters,
	case-insensitive canonical lowercase key). Empty, duplicate/list, non-v4 or
	arbitrary identifier headers return 400. Generate random keys, not clinical IDs.
- Namespace is **authenticated actor + operation + key**, never patient. Patient
	belongs to the canonical validated payload/digest. Same key/different payload
	or patient gives 409. Same intent gives the same resource ID and **current resource
	representation**, not a frozen original snapshot (e.g. appointment status can change).
	Both first create and replay return 201 with `Idempotency-Replayed: false|true`.
	Authentication and current patient/resource access run on every attempt. Missing
	original resource gives 409 for deliberate reconciliation, not replacement creation.
- Claim, one clinical write, success audit and resource linkage commit together;
	same-intent concurrent attempts create one row, with no extra mutation audit on
	replay. Unkeyed clients remain non-idempotent. No TTL/automatic ledger purge is
	implemented; retain through rollback pending retention approval. Preserve a key
	for uncertain retries; issue another only for genuinely new intent.
- Appointment canonicalization preserves existing PostgreSQL TIMESTAMP wall fields,
	including ignored offset suffixes; it does **not** implement a UTC conversion.
	V3 migration collision handling and approval flags are in [OPERATIONS.md](OPERATIONS.md#current-predeploy-cli-contract--2026-09-20).

## Current pagination models — 2026-09-20

The five paged collections retain their original array/row keys and add
`hasMore: boolean` / `nextCursor: string | null`. Limits are 1–100; defaults and
descending `(date, id)` ordering appear above. Omit cursor for page one; send the
returned value unchanged for continuation. Terminal/empty pages return false/null.
Directory retains `limit`/`offset`; any explicit offset with cursor (even zero)
returns 400, and histories reject offsets. Cursor requests report offset=0 as
compatibility metadata, not a count of prior rows. Nullable directory created_at
sorts first with explicit null continuation; notes use DATE at midnight.

Cursor is canonical unpadded base64url, at most 1024 characters, strict versioned
shape bound to endpoint/patient/active filters (and actor only for actor-scoped
queries). These five reads remain shared-clinic, not newly actor-isolated.
Repeated parameters, object/bracket/dot forms, invalid scope/dates/IDs/encoding
return 400. Microsecond wall fields are retained without JavaScript Date rounding.
Cursor is unsigned, not encrypted, **not authorization and not a snapshot**.
Never log/persist it as harmless telemetry. Server query predicates still enforce
the current access/filter model independently of a fabricated boundary.

Only visit history adds `filter=all|upcoming` (default all); upcoming compares
`visit_date > LOCALTIMESTAMP`, not `next_visit_date`. Filter changes restart page one.
Other history routes do not define new filters. Backdated inserts, changing sort
keys/deletes and clock-dependent membership can alter traversal; refresh to see
new/changed rows. UI validates complete envelopes before replacing/appending,
deduplicates IDs, preserves accepted data/boundary on same-scope failure and offers
explicit retry/refresh/load-more. Latest vitals, trends, doctor-today, upcoming
appointments, dashboard and templates remain separate bounded summary models,
not complete archival exports. See [Track F](docs/verification/track-f-pagination.md).

All Q1–Q7 policy gates remain **PENDING — NOT IMPLEMENTED**. See the
[current ledger](docs/verification/IMPLEMENTATION_STATUS.md); no final combined
test total or compliance/production approval follows from this source inventory.
