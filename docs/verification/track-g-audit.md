# Track G — safe audit and operational foundation

## Scope and result (2026-09-20)

Owned changes only:

- [Application integration](../../backend/src/app.ts)
- [Ordinary request auditing](../../backend/src/middleware/auditLog.ts)
- [New metadata allowlist](../../backend/src/middleware/safeAuditMetadata.ts)
- [Shared safe diagnostics](../../backend/src/middleware/safeAudit.ts)
- [New process-local counters](../../backend/src/services/operationalMetrics.ts)
- [New focused tests](../../backend/tests/audit-observability.test.ts)
- [Restricted-reference PostgreSQL tests](../../backend/tests/audit-references.test.ts)
- [Original API search assertion and synthetic-schema guard/cleanup](../../backend/tests/api.test.ts)
- Limited logging-only changes in [auth middleware](../../backend/src/middleware/auth.ts),
   [auth routes](../../backend/src/routes/auth.ts),
   [vitals](../../backend/src/routes/vitals.ts),
   [appointments](../../backend/src/routes/appointments.ts),
   [visits](../../backend/src/routes/visits.ts),
   [templates](../../backend/src/routes/templates.ts),
   [analytics](../../backend/src/routes/analytics.ts).
- Logging and explicit resolved-reference capture in
   [patient](../../backend/src/routes/patients.ts) and
   [note](../../backend/src/routes/notes.ts) handlers.
- This evidence document.

No schema/migration/startup, configuration, manifest, frontend, infrastructure,
or secret-file edits. Clinical/auth query, authorization, transaction and response
semantics are unchanged; the logout diagnostic forwards to the same error handler.
No packages installed, dist build,
cloud/provider calls, production connections, commit or push. The existing
transactional clinical-write audit implementation and emergency-access policy
were not changed.

**Correction status:** the initial independent G evaluation was **FAIL** because
removing all patient identifiers broke patient-level audit usefulness, and
completion endpoint labels did not identify the component originating an error.
Those findings are addressed below. The earlier recommendation to remove the
original search `resourceId` assertion was wrong and is withdrawn. These results
are implementer evidence, **not** an independent re-evaluation pass.

**Latest integration-only correction:** Independent G2 confirmed the runtime in
29/29 supplemental probes, but its required current-source run failed 14 obsolete
single-note success fixtures after B intentionally made that query date-only.
This correction changes only the two G test files linked above and this document;
none of the runtime/original API changes listed in the historical scope were
edited again. The earlier **330/330 claim is superseded by the cross-track query
contract change**. Fresh implementer evidence is **362/362**, detailed below;
main's independent re-evaluation of the corrected tests remains pending.

### API coverage and safe endpoint source

The audit and request-log gate now uses the case-insensitive `/api` mount boundary,
including bare `/api`, `/API`, mixed case and terminal slash variants. The listener
is installed before CORS, rate limiting, JSON parsing, validation, authentication
and application routes, so their denials are correlated too. Non-API requests keep
the server-generated request ID and no-store header without generating API audits.

One fresh server UUID is used for `X-Request-ID`, restricted audit details and
operator events. Incoming request-ID headers are not trusted or copied. A fixed
catalog converts known path shapes into canonical endpoint constants, e.g.
`GET /api/notes/patient/:patientId`. The action never concatenates `req.baseUrl`,
raw user paths or `req.route.path`. Unknown paths use `/api/unmatched`; arbitrary
HTTP methods collapse to `OTHER`. IDs, query strings, body fields, credentials,
headers, cookies and error objects are not operator metadata.

`endpointSource` is a fixed application family (auth/patients/notes/vitals/
appointments/visits/templates/analytics/format-note/unmatched).
`endpointResolution=catalog` means only that the requested path has a catalogued
shape: it does **not** assert that a handler ran, that the method is supported,
that validation/auth passed, or that a record exists. A 404 can therefore retain
a safe catalog label. Static path matching follows case/trailing-slash defaults;
dynamic values never become operator labels. Separate restricted reference
extraction decodes a known parameter once and validates the exact value; it does
not trim, case-fold or decode again. The catalog cannot enable
routes or change business-ID case semantics. New routes remain audited under the
bounded fallback until their owner adds a reviewed catalog constant and fixture.

### Explicit event/sink contract and semantics

`AuditEventWriter.write(event): Promise<void>` is exercised by the real database
adapter, injected rejecting/throwing writers, and a deliberately unresolved writer.
The caller constructs and freezes fresh allowlisted records; it never passes an
Express request or a provider error to the sink. Default storage remains the
existing parameterized INSERT into `audit_log`.

Restricted database storage retains the existing numeric actor ID and a validated
IP in their dedicated columns, plus canonical action and these JSON details:

- `schemaVersion: 1` is the **event format**, not a database migration version.
- `requestId`, `method`, `endpoint`, `endpointSource`, `endpointResolution`.
- `phase`, `authentication`.
- Terminal events additionally have `status` and `outcome`.
- Successful (2xx), authenticated, normally finished requests can additionally
   retain `resourceId`, `resourceType`, `referenceSource`, explicit
   `resolvedPatientId`/`resolvedResourceId`, and bounded `listScope`, as below.

### Restricted references are intentional sensitive audit metadata

This is not a blanket identifier-redaction policy. Patient/resource references
belong in the **restricted database audit**, never general logs or metrics:

- `resourceId` with `referenceSource=requested` records a validated requested
   reference, **not** proof that the patient/record exists. The canonical
   `GET`/`HEAD /api/patients/search` accepts only its single scalar `patientId`
   query value, never the query object. Known patient path parameters on clinical
   reads/note and vitals writes are captured separately; an unrelated `patientId`
   query cannot override a path or attach to another endpoint.
- `resourceType=patient_identifier` preserves the business ID exactly: 1–50
   UTF-16 units, Unicode letters/numbers and `_.-` only. Arrays, objects, whitespace,
   controls, overlength and punctuation outside that grammar are rejected.
   `patient_record` and `appointment` distinguish bounded ASCII int32 URL keys
   from business patient IDs. Direct patient lookup distinguishes numeric internal
   IDs from the explicitly business-ID search query.
- Successful patient search/direct lookup and note read/write handlers explicitly
   capture only their returned row's validated patient ID and positive integer
   record ID. Those become `resolvedPatientId`/`resolvedResourceId`, separate from
   the requested reference. Empty successful search/note reads retain only the
   requested scope. Mismatched patient context and unmatched routes cannot attach
   resolved metadata. There is no generic response-body inspection or new query.
- List scope uses fixed categories for the shared patient directory, patient
   history/trends, actor-specific upcoming appointments/today's visits/dashboard,
   and available templates. Paged routes retain only a bounded limit (1–100),
   directory offset (0–100000), continuation boolean and the visits `all`/`upcoming`
   enum where applicable. Fixed-limit list routes use their existing constants.
   No cursor contents, result arrays, template category text, arbitrary filters,
   note dates or clinical bodies are retained. This describes requested list scope,
   **not an enumeration of every record returned**.
- Start, denied/invalid, unknown-route, public unauthenticated and aborted events
   do not retain resource references/list scope. Actor establishment alone is not
   resource authorization; the successful terminal/known-route restriction follows
   existing handler access rules, not a new care-team or ownership policy.

These fields, actor and IP remain sensitive restricted metadata. Operator logs and
metrics never receive them. Clinical text, email, session identifiers, tokens,
raw query/body, unknown URLs and error objects are excluded from ordinary audit
details too. Existing transactional clinical-write records retain their separately
owned references. No new retention period, export, outbox, DB grant or immutable
storage guarantee is introduced. Reference capture improves traceability but does
not establish durable patient-disclosure accounting.

| Phase / field | Actual meaning | Not evidence of |
| --- | --- | --- |
| `request_received` | Audit submission and request-start log occur before middleware/handler work. Usually no actor is established yet. | Authorization, completed DB persistence, PHI release, or a human read. |
| `response_finished` | Express/Node emitted `finish`; response was prepared and handed to the underlying transport. Status/outcome describe HTTP handling. | Client receipt, rendering, human reading, or a durable pre-disclosure authorization event. |
| `response_aborted` | Connection closed before normal finish; emitted at most once, with outcome `aborted`. | Successful delivery. Status can still be the default 200 and must not override the phase/outcome. |
| `authentication=established` | The request carries a validated positive numeric actor ID from application auth at event capture. | Authorization for a particular resource. An authenticated permission denial remains a failure. |
| `outcome=success` | HTTP status below 400 on normal finish. | A mutation commit, a record existing, or a person reading PHI. Public capabilities and preflight can succeed without an actor. |

**Best effort, not a durable outbox:** neither event write is awaited before
continuing ordinary request/response handling. Each submission catches synchronous
throws and promise rejection; no retry/delivery queue or fake outbox was added.
Writes may complete out of order, either event may be missing, and a crash can
lose events. Submission before a PHI read is not proof of persistence before
disclosure. The request/phase fields, not row insertion order, are the join keys.
Only the controlled tests with immediately resolving spies assert submission order.

Two ordinary request audit attempts now replace the former single finish-only
attempt. Clinical mutation audits remain separate and transactional. Consumers
counting all request rows must select terminal phases to avoid double counting;
legacy rows without a phase need an explicit compatibility rule. Normal start
rows precede authentication, so the existing actor-scoped dashboard does not gain
a second attributed event merely from the start record.

### Private operational signals

Lifecycle operator JSON events are `request_started`, `request_complete`,
`request_aborted`, and `audit_write_failed`. They contain only server UUID, safe endpoint/method/source,
phase and applicable status/elapsed milliseconds. Rejected writer/driver errors,
including their messages, stack, SQL, connection strings and properties, are never
serialized. Failure of the console transport is also contained without changing
ordinary access behavior.

The shared diagnostic helper emits only `event`, `sourceCategory`, and the same
server-generated `requestId`. Events map to fixed originating-component categories
at runtime; the helper accepts no error or data argument and rejects unknown event
keys. For example, session lookup failure while handling a notes URL emits
`authentication_unavailable` / `authentication`, while completion still identifies
the `notes` endpoint. Login, note read/write, other clinical-route catches, global
handling, and formatting failures use reviewed event constants. This distinguishes
failure origin without serializing SQL, exception messages/stacks, request payloads,
credentials or patient references. A failed console transport is contained here too.

Seven fixed, saturating in-memory counters track requests started/completed/aborted,
audit attempts/successes/failures and readiness failures. Snapshots are immutable
copies; there are no patient, actor, request-ID, endpoint or free-form metric
labels and no retained request list. Callers may hold an injected metrics instance
for private snapshots. The running default emits the safe request/failure events;
it does not install a metrics exporter or periodic snapshot job.

There is **no public metrics endpoint** and no new external data flow. Even aggregate
clinic activity needs protected operational access if exported later. Counters
are per-process, reset at restart, and are not an alert delivery or durability
guarantee. Audit DB saturation and the additional start write require coordinated
load/retention review; no throughput or bounded DB backlog claim is made.

### Schema-aware readiness: Track E contract consumed

`/ready` now awaits `checkSchemaReady()` from
[Track E's schema-state module](../../backend/src/db/schemaState.ts), rather than
executing `SELECT 1`. Resolve-void yields the existing 200 ready response; any
rejection yields only 503 `{"status":"unavailable"}` and increments the private
failure counter. No catalog/version/driver detail is returned or logged. `/health`
remains a separate liveness check. Every readiness request invokes the real
contract again: no successful readiness cache hides a later missing migration.

G runtime neither duplicates nor hardcodes the expected migration list. E's current
central contract is **[1, 2, 3]**, including required session/idempotency unique
indexes. The focused controlled-pool fixture now models those index probes
separately from the migration ledger and rejects a missing index or v3 migration.
The real PostgreSQL suites also verify v3 readiness. No E schema code was overwritten.

## Verification evidence

### Historical 330-test run — superseded, not current acceptance evidence

Environment: cached **Node v22.23.2**, **Vitest 4.1.11**, real synthetic
**PostgreSQL 17.11**, exclusively `127.0.0.1:55439`, database `medapp_audit`.
Both database suites enforce the exact synthetic URL (including account), create
random schemas and remove only their own schemas. No secret/environment files,
build, dependency installation, production data, cloud, real OCR or AI calls.

The earlier serial invocation ran **2026-09-20T21:29:57.415Z–21:30:02.450Z** (local
Vitest start 16:29:57), **exit 0**, Vitest duration **4.71s**:

| Suite | Result | Scope |
| --- | --- | --- |
| [audit-observability](../../backend/tests/audit-observability.test.ts) | **301/301 PASS** | Real app/routers/auth/readiness; controlled DB/config/OCR and error injection. |
| [audit-references](../../backend/tests/audit-references.test.ts) | **8/8 PASS** | Real PostgreSQL restricted reference persistence and audit INSERT rejection. |
| [original API](../../backend/tests/api.test.ts) | **21/21 PASS** | Existing API behavior plus restored patient-reference assertion by request ID/terminal phase. |
| Total | **330/330 PASS, zero skips** | Three files, file parallelism disabled; reserved serial slot. |

The final runner compared schema catalogs before/after: **no new schemas retained**.
SHA-256 and file-list comparisons of **58 backend source/existing backend and
frontend build-artifact files** were unchanged during the run. No dist build ran.
This is not least-privilege/immutable-sink or crash-durability certification.

An earlier correction run passed 330/330 at 16:28:39, 4.86s. Strict test-source
checking then found three test-only typing errors (read-only request path and
untyped mock callbacks); those were fixed, not bypassed. Source noEmit, strict
test noEmit and focused 17-file ESLint all passed at **21:29:38Z**, exit 0.
Earlier pre-correction 239-test evidence did not catch the independent findings
and does not validate the corrected contract.

Exact final CLI arguments: from the backend workspace, the cached Node 22 binary
invoked the existing Vitest CLI with
`run tests/audit-observability.test.ts tests/audit-references.test.ts tests/api.test.ts --reporter=default --silent --no-file-parallelism`.
`TEST_DATABASE_URL` was the fixed synthetic loopback target, not a loaded secret.
No other test suite ran concurrently. From repository root, source checking used
`--noEmit -p backend/tsconfig.json`; the three tests used
`--noEmit --strict --esModuleInterop --skipLibCheck --target ES2022 --module commonjs --moduleResolution node --ignoreDeprecations 6.0`.
ESLint covered the application, four middleware modules including authentication,
metrics, eight route modules and all three tests listed above (17 files total).

Coverage preserves six case/slash variants, early denials/CORS/rate limits,
unknown URLs, malformed JSON/URI, HEAD/preflight, forged IDs, sink throws/rejections/
non-blocking pending writes, abort deduplication and console failure. Corrections
add two distinct patient search/note reads, exact Unicode/numeric business IDs,
invalid/array/object identifiers, requested-versus-resolved/missing/internal IDs,
bounded list scope/cursor redaction, unrelated-query exclusion and real audit
INSERT failure without blocking the read. Injected auth DB failure identifies
`authentication` even at a notes endpoint; login, note write/read and the other
clinical catch paths identify their actual source with the same server UUID and
no provider error/SQL/PHI leakage. Readiness covers v3 and required indexes.

### G2 integration correction — fresh current-source implementer evidence

Independent G2's required run at **22:36:25.292Z–22:36:30.679Z** returned
**316/330, 14 failures, zero skips**: controlled **289/301**, real PostgreSQL
**6/8**, unchanged original API **21/21**. The failures were the six route
variants of each of two controlled success fixtures and the two real-patient
note fixtures. They supplied `private` and/or `patientId` extra query keys to
single-note GET while expecting 200. B's current validator deliberately accepts
only no query or one valid scalar `date`, and correctly returned correlated JSON
400 responses. G2's separate **29/29 supplemental probes passed** at
**22:39:07.118Z–22:39:09.341Z**, covering references, error origins, actual aborts
and readiness. Those results do not turn its failed required gate into a pass;
they identify a test-integration correction, not a reason to weaken validation.

Changes in this serial slot:

- Successful note reads now use either no query (today) or exactly
   `date=2026-09-20`. Both distinct patients still have successful search and note
   reads with exact requested/resolved patient and resource IDs. Response record
   IDs/patient IDs are now checked too; real PostgreSQL also checks the note date.
   Terminal events must remain authenticated 200 successes. Clinical/token/header/
   cookie redaction and operator/metric patient-ID exclusion remain intact.
- Four explicit malformed-query cases cover private/clinical keys, unrelated
   `patientId`, the former combined extra-key fixture, and a valid date with extra
   keys. Each runs over six case/slash variants in the controlled suite (**24 new
   tests**) and over both real patients (**8 new tests**). All must return exactly
   400 `Invalid request fields`, retain correlated start/failure-finish events,
   and exclude raw query/URL, clinical/secret markers and credentials from audit
   and logs. No resource/reference/list scope or actor establishment is allowed.
   Controlled cases also prove no authentication/clinical SQL or transaction ran.
   These events explicitly do **not** claim authorized disclosure.
- All previous 330 cases remain; no capabilities, permission/failure, privacy or
   useful patient-reference assertion was removed. Existing search/directory
   extra-query privacy tests remain because those are different endpoint contracts.
   No blanket status substitution, validator/runtime change, original API edit,
   timeout change, manifest change or build was made.

Fresh serial run: **2026-09-20T22:42:57.104Z–22:43:02.520Z**, cached
**Node v22.23.2 / Vitest 4.1.11 / PostgreSQL 17.11**, **exit 0**, Vitest duration
**5.11s**. Tests imported current source, not built output.

| Suite | Actual result | Change from historical suite |
| --- | --- | --- |
| [Controlled G](../../backend/tests/audit-observability.test.ts) | **325/325 PASS** | Original 301 retained; 24 separate malformed-query redaction cases. |
| [Real PostgreSQL G](../../backend/tests/audit-references.test.ts) | **16/16 PASS** | Original 8 retained; 8 separate malformed-query redaction cases. |
| [Original API](../../backend/tests/api.test.ts) | **21/21 PASS** | Unchanged, including meaningful patient-reference assertion. |
| Total | **362/362 PASS, zero failures/skips** | Three files, serial execution; not a full release or independent pass. |

Exact Vitest arguments, invoked with the cached Node 22 executable from the backend
workspace: `run tests/audit-observability.test.ts tests/audit-references.test.ts tests/api.test.ts --reporter=default --reporter=json --outputFile.json=/private/tmp/medapp-g-integration-correction-20260920/required.json --silent --no-file-parallelism --maxWorkers=1`.
The environment supplied only the fixed guarded synthetic loopback target and
test-only keys; no secret file was loaded. Both real suites created fresh random
schemas, cleaned up only their own schemas and asserted their absence. The
before/after schema catalogs were equal; unrelated existing schemas/records were
not changed. No parallel test process, deployed database, seed, provider or OCR
operation was used.

Backend source noEmit **22:43:02.522Z–22:43:03.626Z**, strict noEmit for all three
selected tests **22:43:03.626Z–22:43:04.977Z**, and scoped three-test ESLint
**22:43:04.978Z–22:43:05.755Z** each returned **exit 0**. Type-check arguments
were the same as the historical checks above. SHA-256/file-list checks covered
**183 workspace files**, excluding secrets/dependencies/cache: all were unchanged
during verification, and only the two owned test files differed from the pre-edit
baseline at that point. This document is the third and final permitted edit.
Application, validation, original API, configuration, manifests and existing build
artifacts remain unchanged. Raw runner commands, logs, JSON counts, baseline
copies/hashes and schema-catalog evidence are retained outside the repository in
the correction's temporary evidence directory. No durability, immutable retention,
least-privilege or full-release certification is inferred; Q4 remains pending.

## Remaining policy decisions and next owner contracts

1. **Q4 remains pending.** Ordinary read/request audit failure still does not block
   PHI responses, preserving the existing policy as explicitly requested. This is
   not a compliant emergency/break-glass mechanism. Select approved fail-closed vs
   explicitly authorized emergency behavior, pre-disclosure persistence boundary,
   evidence recovery, and incident response before claiming durable accountability.
2. A future **authorized-access/response-prepared** durable event needs the clinical
   route/authorization owners to supply trusted decision/resource context before
   release. G's pre-handler arrival plus finish events do not substitute for it.
   Any transactional outbox, immutable sink, delivery identities, retries,
   retention/legal holds and exports require approved scope/schema/data flows.
3. **E/D:** current [1, 2, 3] and index contract is consumed and verified here.
   Future migrations must update that central contract with their required objects;
   never weaken readiness to accommodate mismatched artifacts.
4. **API-test owner/main:** the original patient-reference expectation is restored,
   not weakened to resource absence. Search events are joined by server request ID
   and terminal phase; the full original API suite passes. Successful patient
   references are intentionally sensitive restricted metadata, not a redaction bug.
5. **Release-test manifest owner:** explicitly include the new focused suite in the
   coordinated verification job. G did not change manifests; the existing narrow
   unit-test script does not automatically include this file. Preserve default
   writer behavior and failure tests when composing release wiring.
6. **Endpoint/operations owners:** maintain the fixed catalog when adding routes,
   review request-event row volume and phase-aware aggregation, and authorize any
   future private metrics exporter/alert transport. No patient ID metric labels.

**Independent re-evaluation of this integration correction: PENDING main.** G2's
prior required-gate failure and supplemental pass are recorded above, not replaced
by an implementer claim of independence. No nested evaluator/subagent is available
in this session. Main should independently rerun the corrected required suites and
recheck distinct-patient search/note traceability, requested/resolved and list scope,
operator/metric redaction, actual error-origin correlation, original API compatibility,
uppercase mount coverage, separate malformed-query 400/no-disclosure behavior,
best-effort start/end/outage behavior and current v3 readiness.
