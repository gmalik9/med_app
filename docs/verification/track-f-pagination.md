# Track F — Batch C4 pagination

> Publication update (2026-09-22): recorded passwords are redacted to placeholders. Historical passes below predate the credential refactor; fresh DB/browser verification is pending. See [the current credential handoff](publication-secretminimization.md).

## Scope and interfaces

Only the owned cursor utility, directory/history GET handlers, history displays, GET client signatures, two new focused tests, and this evidence file were changed. No migrations, idempotency helper, POST tests/handlers, write submission hooks, global validation, authentication, readiness declarations, manifests, AppPage, or NoteEditor edits.

All routes below accept optional query `limit` (integer 1–100) and `cursor` (one opaque, unpadded base64url string, at most 1024 characters). Omit `cursor` on the first page. Send the returned `nextCursor` unchanged for the next page. Page size may change between pages. Every query fetches at most `limit + 1` rows; the extra row is not returned. Existing array keys and row fields are retained. Each response adds `hasMore: boolean` and `nextCursor: string | null`; terminal/empty pages return `false` / `null`.

| GET endpoint | Array key | Default limit | Descending key |
| --- | --- | --- | --- |
| `/api/patients/` | `patients` | 50 | `(created_at, id)`, null timestamps first |
| `/api/notes/patient/:patientId/history` | `notes` | 30 | `(note_date, id)` |
| `/api/vitals/patient/:patientId/history` | `vitalSigns` | 50 | `(recorded_date, id)` |
| `/api/visits/patient/:patientId` | `visits` | 30 | `(visit_date, id)` |
| `/api/appointments/patient/:patientId/history` | `appointments` | 30 | `(appointment_date, id)` |

- Directory retains response `limit` and `offset`. Legacy requests may supply `offset` (0–100000), but **any explicit offset plus cursor, including offset=0, is HTTP 400**. Cursor requests report offset=0; this is compatibility metadata, not a row position. History routes reject offset.
- Visits additionally accept `filter=all|upcoming`, default `all`. `upcoming` retains the existing UI meaning of future **visit_date**, not next_visit_date. Filtering is now performed before pagination in SQL using `LOCALTIMESTAMP`, not against a truncated client-side window. Other histories have no filters. Exact MRN `/api/patients/search?patientId=...` remains a singleton lookup, unchanged.
- Malformed types, repeated cursor parameters, bracket/dot object keys, noncanonical base64url, oversized tokens, invalid JSON/schema/version/IDs/dates, and mismatched scope return generic HTTP 400. No payload is echoed.

Exact client method signatures in [apiClient.ts](../../frontend/src/utils/apiClient.ts):

- `getPatients(limit = 50, offset?: number, cursor?: string)`
- `getNoteHistory(patientId: string | number, limit?: number, cursor?: string)`
- `getVitalsHistory(patientId: string | number, limit?: number, cursor?: string)`
- `getAppointmentHistory(patientId: string | number, limit?: number, cursor?: string)`
- `getVisitHistory(patientId: string | number, limit?: number, cursor?: string, filter: 'all' | 'upcoming' = 'all')`

The directory UI calls `getPatients(50, undefined, cursor)`; it never combines an offset with a cursor. Existing positional limit/offset callers still work. B's session generations/interceptors and D's optional Idempotency-Key handling are unchanged.

## Cursor contract and precision

[pagination.ts](../../backend/src/utils/pagination.ts) validates a strict JSON object with exactly `v: 1`, `s: string`, `t: string | null`, `id: integer`. `s` is a SHA-256 digest of endpoint, patient, actor (when access-scoped), and sorted active filters. These five endpoints intentionally retain authenticated shared-clinic reads: they are **not** creator/doctor-owned queries, so actor is absent. Utility tests additionally verify actor-bound scopes. Visit filter changes require a new first page.

The cursor is unsigned, opaque to clients, **not encrypted, not an authorization token, and not a snapshot**. Its hash prevents accidental reuse across scopes, not deliberate fabrication. Requests still authenticate independently, and fixed SQL patient/filter predicates come from the request's validated route/filter, never the token. Fabricating a valid boundary cannot widen the authorized query. Treat cursors as sensitive transport data; do not persist or log them in client storage.

SQL `to_char(..., 'YYYY-MM-DD"T"HH24:MI:SS.US')` provides the cursor timestamp directly from the stored value. Six fractional digits are retained, including tied timestamps separated only by microseconds. Cursor dates are validated arithmetically (years 0001–9999, real calendar days, hours 00–23, minutes/seconds 00–59); no JavaScript Date or timezone conversion participates in ordering. Notes use their existing DATE ordering with midnight cursor time. Legacy nullable directory created_at values use explicit null-first continuation. Existing response date fields retain their previous serialization; the internal `_cursor_timestamp` alias is stripped.

This does not guess a timezone for legacy TIMESTAMP columns. Tests use a non-UTC PostgreSQL session and ambiguous DST wall fields to detect conversion/precision mistakes. A database-wide UTC/schema migration remains outside this batch.

## UI behavior and consistency limits

[PatientHistory.tsx](../../frontend/src/components/PatientHistory.tsx) houses shared `useHistoryPage` and `HistoryPaging` read-only helpers, reused only from owned files. Notes, appointment/visit cards, vitals card/history, scheduled visits, analytics vitals, and patient directory expose load-more, refresh, loading, safe error/retry, and explicit completion. Former five-row display slices are removed. Pages append by stable ID with overlap deduplication; backend memory remains bounded and does not accumulate a complete directory.

Patient, filter, or session changes reset rows and cursor immediately. Request epochs ignore late success/error after patient/filter changes, refresh, new-data events, or unmount. Initial failures retry page one; continuation failures keep existing rows and retry the same boundary. Duplicate load-more clicks are blocked. Successful existing card history-refresh callbacks dispatch `clinical-data-updated`, restarting sibling reads without changing write bodies, keys, or submission hooks. Existing note-save events are also consumed. Latest-vitals and analytics reads have the same stale-response guards. Following the F2 correction below, same-scope refresh/new-data reads keep the prior rows until a valid replacement arrives; failed replacement requests retry page one, not the saved continuation. Identity/filter changes still immediately hide prior-scope rows.

UI explicitly says **“Live records, not a snapshot. Refresh to see new or changed records.”** Fixed-baseline tests prove ordinary newer inserts do not shift or duplicate unchanged existing rows. They do **not** claim snapshot consistency: backdated inserts below a boundary can appear on later pages; inserts above it require refresh; deletes disappear; changed sort keys can move records across a boundary (possibly skipping or revisiting them). Client ID dedupe suppresses repeated rendering, but cannot recover a moved/skipped row. Upcoming-filter membership can change with the clock. Refresh is the recovery path. External changes are not pushed; manual refresh is available.

## Index handoff (no migration edits)

- Existing `idx_patients_created(created_at DESC, id DESC)` matches directory ordering, including PostgreSQL's default DESC null-first order.
- Existing `idx_notes_patient_date`, `idx_vitals_patient_date`, and `idx_visits_patient_date` support patient/date access but omit the final ID tie-break. Recommend owner-managed replacement/additional `(patient_id, <date> DESC, id DESC)` indexes for large tied groups. Current queries can require a sort/incremental sort for ties.
- Appointments currently have separate patient/date indexes and an actor-scoped scheduled index, not a complete patient-history keyset index. Recommend `(patient_id, appointment_date DESC, id DESC)`.
- These are performance follow-ups, not correctness prerequisites. No indexes or global readiness requirements were introduced. No claim of production-scale EXPLAIN/performance verification is made.

## Verification evidence (2026-09-20)

Node **22.23.2**, cached executable; source tests/noEmit only, **no dist build**. All database tests hard-fail unless TEST_DATABASE_URL names loopback **medapp_audit:55439**. Fixtures are synthetic; fresh schemas are retained for evidence. No secrets file, deployed DB, PHI, or external AI calls.

- Backend [pagination.test.ts](../../backend/tests/pagination.test.ts): **21/21 PASS**, 16:03:59, 2.55s. Schema `pagination_dfaf089677c14e4eb6a49979f09d4a09`. Latest migration function applied versions **1, 2, 3**, read/logged dynamically, not hardcoded in assertions. Includes >100 rows per list, timestamp ties/microseconds, SQL-baseline equality across concurrent newer inserts, null timestamps, scope/actor/filter rejection, malformed/bounded cursors, unauthenticated/inactive/revoked denials, unchanged fields/search, offsets, exact-size and empty terminal pages.
- Frontend [pagination.test.tsx](../../frontend/tests/pagination.test.tsx): **62/62 PASS**, plus unmodified D idempotency **16/16** and B session-client **17/17**: **95/95 PASS** across three files, 16:05:50, 3.86s. Covers every owned display, >100 records, duplicate overlap, loading/error/retry/end states, stale success/failure, new-data resets, filter/patient/session changes, related-panel refresh after keyed writes, and exact GET client parameters/session headers.
- Both backend and frontend `tsc --noEmit` passed after the concurrent operational-metrics owner corrected an unrelated initial library-target error. Final checks recorded below.
- Self-review found/fixed Express simple-query bracket keys being ignored as absent cursors; focused backend rerun passed. Existing write regression tests caught an extra completion `role=status`; completion now uses a polite live region without changing old tests or write-status markup.
- Shared-terminal output contention caused interrupted/unattributable early attempts. These are **not counted as passes**; results above are attributable runs with the focused test names/schema.

Final attributable static run: **2026-09-20T21:07:21.446Z**, Node 22.23.2. Backend noEmit exit **0**, frontend noEmit exit **0**, lint of all 16 owned TypeScript source/test files exit **0**. Editor diagnostics also reported no errors in changed files.

Historical cross-track handoff at the original final read: [schemaState.ts](../../backend/src/db/schemaState.ts) declared `EXPECTED_SCHEMA_VERSIONS = [1, 2]`, while the latest migration function applied v3 in the fresh F fixture. **Resolved by E before F2:** the current declaration is `[1, 2, 3]`. F did not edit readiness or migrations. This is not a claim of global readiness/release approval.

**Original independent evaluation: FAIL**, with the two UI defects corrected below. **Independent F2 re-evaluation: frontend PASS, backend intermittent FAIL** (historical results preserved below; F3 investigation appended). **F3 independent re-evaluation: PENDING main assignment.** No independent sign-off is claimed.

## F2 — independent findings and corrections (2026-09-20)

### Runtime changes (F-owned UI only)

1. [PatientsListPage.tsx](../../frontend/src/pages/PatientsListPage.tsx) no longer dereferences `.length` on untrusted dates. Null, missing, unparseable, and invalid calendar dates display **Not available**. Calendar validation rejects impossible days/leap days before JavaScript can roll them forward. Valid date-only values retain the old local-midnight display; valid timestamps retain the old instant/local display. Existing missing-DOB wording remains unchanged. The shared editor callback's nominal type is unchanged; actual wire values are checked as `unknown`, avoiding edits to C's AppPage contract.
2. [pagination.ts](../../frontend/src/utils/pagination.ts) validates the complete response envelope before any state commit: required records array (at most 100), positive int32 stable row IDs, a real boolean `hasMore`, and an explicit `nextCursor`. Terminal pages require exactly null; nonterminal pages require nonempty rows and a nonempty canonical unpadded base64url string of at most 1024 characters. Padding, invalid characters/length/trailing bits, nonstring tokens, and a repeated request boundary reject the entire page. Cursors remain opaque: the frontend does not reinterpret backend scope/timestamp JSON, normalize the token, or use it for authorization.
3. [PatientHistory.tsx](../../frontend/src/components/PatientHistory.tsx) validates before appending/replacing rows or changing the cursor. Invalid initial/continuation/refresh responses show the safe retry error, never **No more records**. Prior rows and the last accepted cursor survive validation errors; retries use the failed request's exact boundary, including no cursor for failed refreshes. No candidate rows are partially accepted. Completion is also hidden during loading. All seven paginated displays use this hook: notes, appointments, visits, vitals, scheduled visits, analytics vitals, directory.
4. Nonpaged latest-vitals/analytics adapters in [VitalsCard.tsx](../../frontend/src/components/VitalsCard.tsx) and [TemplatesAnalyticsPanel.tsx](../../frontend/src/components/TemplatesAnalyticsPanel.tsx) explicitly construct terminal envelopes. No fallback accepting malformed paginated responses was added.

**No backend runtime correction was necessary:** actual backend envelopes passed the stricter consumer. No backend handlers, cursor utility, global validation, API-client methods, G catches/audits, auth whitespace, database/migrations/readiness, manifests, or write paths were edited in F2.

### Regression evidence

- Expanded [frontend pagination tests](../../frontend/tests/pagination.test.tsx): **457/457 PASS** (62 previous + 395 new). All seven real displays exercise 25 malformed envelope variants on both initial and continuation pages, plus repeated-boundary and failed-refresh retry cases. Tests assert no false completion, no candidate-row partial commit, preservation of existing rows, and exact retry arguments. Additional cases cover envelope/ID bounds, the 1024-character cursor boundary, invalid calendars/null dates, and unchanged valid-date display. Valid synthetic cursors now have real canonical base64url encoding rather than arbitrary labels.
- New [pagination-render.test.ts](../../backend/tests/pagination-render.test.ts): **7/7 PASS** in each serial repeat. It creates a fresh synthetic schema on guarded loopback PostgreSQL, initializes/migrates through the existing functions, inserts an actual nullable `created_at` row plus 50 dated rows, obtains unmodified authenticated API responses, and renders the real directory through the real API client with only Axios transport mocked. It traverses both real pages and renders all 51 rows. Three invalid-date and three pagination-contradiction mutations of that real response verify safe rendering/error/retry. Only these mutations are adversarial; the null fixture is an actual DB/API result. The schema is dropped after each render suite.
- Existing [backend pagination tests](../../backend/tests/pagination.test.ts): **21/21 PASS** in all three repeats, unmodified. Both suites together: **28/28 × 3 = 84 successful test executions, 28 distinct tests**, zero skips, no unexpected 400/timeouts reproduced. Existing backend timeout settings were not changed.
- Focused frontend command: pagination **457**, unchanged D idempotency **16**, unchanged B session-client **17** = **490/490 PASS**, started 16:37:11 local (21:37:11Z), duration **9.38s**.
- Full frontend serial check: **641 PASS / 1 FAIL / 0 skipped**, eight files, 21:39:50.855–21:40:14.115Z. The sole failure is the separately owned pre-pagination mock in [workflows.test.tsx](../../frontend/tests/workflows.test.tsx#L52-L58), described in the required handoff below. All C draft suites (45 + 20 + 63), D16, B31, and F457 passed. **Do not report the full frontend suite green.**
- Final backend source noEmit, frontend source noEmit, explicit F test noEmit, and seven-file focused lint: **all exit 0**, final timestamp **21:40:45.045Z**, Node **22.23.2**. No dist build was run. Editor diagnostics also clean.

Serial backend runs, cached Node **22.23.2**, PostgreSQL **17.11**, 2026-09-20:

| Run | UTC completion | Duration | Result | Existing backend fixture schema (retained synthetic evidence) |
| --- | --- | --- | --- | --- |
| 1 | 21:38:17.474Z | 5.44s | 28/28, exit 0 | `pagination_768098527d1b4431bf02194c57dcb928` |
| 2 | 21:38:22.759Z | 5.07s | 28/28, exit 0 | `pagination_c3350ad33083486dbc60cfa706d216fb` |
| 3 | 21:38:27.844Z | 4.89s | 28/28, exit 0 | `pagination_716890a2aedf407ebb16a2ef0ef73fc4` |

Render-suite schemas ended in `8902db1627504a66bfb6b38aca66f274`, `7001865261a147d08d2a10f0920ba2ad`, and `80836ae6ff0f46ea98a94bfb1c08c755`, all under `pagination_render_` and dropped by the suite. Initial harness-only run failed seven tests because its mock transport allowlist omitted `/api`; correcting the test to the existing client's actual `/api/patients/` URL fixed it without any runtime change. That failure log is retained, not counted as a pass. An initial typecheck also caught the separately owned editor callback's nonnullable nominal date type; F preserved that existing interface and validated the wire value at display time instead. Final noEmit passed.

### Actual verification commands and retained output

Executed from the workspace root using the cached executable below. The backend invocations were spawned **one at a time** with separate complete stdout/stderr and JSON files; the three-repeat window was **21:38:11.687–21:38:27.845Z**. The following shows their actual executable arguments/environment (log redirection was supplied via file descriptors by the serial runner):

```sh
NODE=/Users/girikmalik/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node

"$NODE" node_modules/vitest/vitest.mjs run --root frontend tests/pagination.test.tsx tests/idempotency.test.tsx tests/session-client.test.ts --reporter=dot

# Executed separately for i=1, i=2, i=3, with no overlap:
TEST_DATABASE_URL='postgresql://audit:<test-database-password>@127.0.0.1:55439/medapp_audit' "$NODE" node_modules/vitest/vitest.mjs run --root backend tests/pagination.test.ts tests/pagination-render.test.ts --reporter=default --reporter=json --outputFile.json=/private/tmp/medapp-f2-corrections-20260920/backend-serial-${i}.json

"$NODE" node_modules/vitest/vitest.mjs run --root frontend --no-file-parallelism --reporter=default --reporter=json --outputFile.json=/private/tmp/medapp-f2-corrections-20260920/frontend-all.json

"$NODE" node_modules/typescript/bin/tsc --noEmit -p backend/tsconfig.json
"$NODE" node_modules/typescript/bin/tsc --noEmit -p frontend/tsconfig.json
"$NODE" node_modules/typescript/bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution bundler --jsx react-jsx --esModuleInterop --skipLibCheck --types vite/client frontend/tests/pagination.test.tsx backend/tests/pagination-render.test.ts
"$NODE" node_modules/eslint/bin/eslint.js frontend/src/utils/pagination.ts frontend/src/components/PatientHistory.tsx frontend/src/components/VitalsCard.tsx frontend/src/components/TemplatesAnalyticsPanel.tsx frontend/src/pages/PatientsListPage.tsx frontend/tests/pagination.test.tsx backend/tests/pagination-render.test.ts
```

Complete output, including the initial harness failure, all three serial backend runs, the full frontend failure, and separate static results, is retained under /private/tmp/medapp-f2-corrections-20260920/. No prior logs were discarded or overwritten. Only synthetic loopback data was used; no real PHI, secrets-file reads, external AI, dependency installs, or dist builds.

### Required main/orchestrator handoffs

1. **Independent F2 re-evaluation PENDING.** These are implementer results, not independent sign-off.
2. **Existing workflow mock update required:** [workflows.test.tsx](../../frontend/tests/workflows.test.tsx#L52-L58) supplies a vitals history row without `id` and an envelope without `hasMore`/`nextCursor`. The actual backend supplies all three. Its owner should add a positive row ID and explicit `hasMore: false, nextCursor: null`, preserving the existing rendering/numeric-write assertions. F did not edit this separately owned test or weaken validation to accommodate it. This is the sole full-frontend failure above.
3. **A/release manifest:** classify [pagination-render.test.ts](../../backend/tests/pagination-render.test.ts) as a required real-PostgreSQL integration suite, not a no-DB unit suite. It hard-fails without the exact loopback synthetic database URL and creates/drops its own schema.
4. **B-owned date query validation:** independent F also reported `date[x]` and `date.value` being ignored as if today's date had been requested. Per orchestrator this is already assigned to B. F neither edited global validation nor folded it into pagination; main must collect B's correction/evidence.
5. **Index follow-up remains advisory:** patient-history date indexes lack final ID tie keys, and appointments need a complete patient/date/ID history index. Recommendations above remain; no migration is needed for this UI correction scope. Current migration-v3 readiness is fixed by E; G resource audits are also outside F2 and left untouched.

## F3 — targeted serial backend HTTP investigation (2026-09-20)

### Historical failure, not overwritten by later passes

Independent F2 evidence remains intact under /private/tmp/medapp-evaluator-f2-20260920/. Its backend run 1 was **26 PASS / 2 FAIL**: unauthenticated vitals expected 401 but received 400 (5.66ms), and valid visit traversal expected 200 but received 400 (14.20ms). Run 2 was **27 PASS / 1 FAIL**: malformed-note-cursor case timed out after **30006ms**. Run 3 was 28/28. The user reports frontend 490 + old workflows 10 and real-API render 7 × 3 passed; this investigation does not rerun or modify frontend.

Historical request logs for the vitals failure contain only the first successful 200 request, not an application 400 event for the subsequent unauthenticated request. The failed visit case contains two completed 200 requests, not an application 400 event. The timed-out note case contains its initial 200 and first expected 400 completion, with no subsequent received event in that case. This is **consistent with a failure outside the observed Express request path**, but those logs did not capture response headers/body, socket events, or parser errors. Missing logs alone do not prove where it happened. The actual historical unexpected-400 body/headers cannot be reconstructed.

**Root cause remains unproven / intermittent symptom NOT REPRODUCED under instrumentation.** Neither port reuse, stale agent reuse, an Express query-validation defect, nor the old Supertest close callback is established as the cause. In particular, every measured request used a fresh client socket (`reusedSocket=false`), so these runs do not support a client-agent reuse claim. No application validation correction or B-owned change is justified by this evidence.

### Test-only changes and safety boundaries

- New [pagination-http.ts](../../backend/tests/helpers/pagination-http.ts) follows D's stable-listener pattern without modifying D's helper/tests. The default is **one actual 127.0.0.1 listener per suite**, owned/closed by the suite. Supertest targets its URL and does not start/close a server for each call. HTTP request/header receipt limits match [index.ts](../../backend/src/index.ts): 30s/10s. Each request has a **20s response timeout / 22s total request deadline**, and a one-shot 6s diagnostic watchdog. Global Vitest 30s test / 60s hook limits are unchanged. No assertion retry, fallback, skip, rate-limit bypass or exception-to-success conversion exists.
- Both [pagination.test.ts](../../backend/tests/pagination.test.ts) and [pagination-render.test.ts](../../backend/tests/pagination-render.test.ts) use that lifecycle. All original 200/401/400 and functional assertions remain. Original authenticated GETs additionally require a valid application `X-Request-ID`, so a parser-level 400 cannot silently satisfy an expected validation 400. The original 21 + 7 test count is preserved.
- Diagnostics retain per-request index, sanitized endpoint category, dispatch/socket/connect/send/receive/finish/close/response/assertion-callback timings, ports, status, application RID, allowlisted response headers and fixed generic error bodies. Sent/received query diagnostics contain keys, lengths, SHA-256 value fingerprints and only bounded numeric/fixed-filter values; **no raw cursor, URL, patient identifier, clinical body, token, cookie, password or raw parser packet**. Expected HTTP errors are not mislabeled as transport failures. Normal traces are buffered until teardown; missing-RID responses, parser events, slow requests and transport errors emit immediately. Failed cases additionally emit their last 45 traces.
- Parser observation wraps the server's event emission and preserves its original return value. It deliberately does **not** attach a `clientError` listener (which would replace Node's default rejection behavior). Parser diagnostics contain only code, byte counts and port correlation.
- `PAGINATION_HTTP_LIFECYCLE=per-request` is an explicit test-only comparison control, using the original Supertest-created listener lifecycle; it is **not** selected automatically on failure. Default/unset or `suite` uses the stable listener. Invalid mode values fail.
- Only these two existing test files, two new test/helper files and this document changed. Runtime source, B configuration/query validation, all frontend files, D tests/helper, migrations, manifests, global timeouts and existing dist outputs were untouched. Protected-file hashes for **102 files** match across all investigation phases. No dist build, secrets-file read, external AI or deployed database access.

### Actual 400 diagnostics and 20 independent sequences

New [pagination-sequences.test.ts](../../backend/tests/pagination-sequences.test.ts): **20/20 PASS**, four independent sequences per resource (notes/vitals/visits/appointments/directory). Each has a newly registered synthetic session and freshly fetched boundary, not another sequence's token/cursor state. Each makes **13 requests** with asserted statuses `201,200,200,401,401,400,400,400,400,400,400,200,200`: registration, initial/baseline reads, unauthenticated/invalid-token denials, three cursor-shape/offset rejections, global limit rejection, wrong-scope rejection, deliberate protocol rejection, and exact next/final pages. Duplicate/dot/oversized/padded cursor variants rotate across the sequences; bracket-object and cursor+offset rejection occur in each. No failed assertion is retried. The subsequent valid pages are distinct functional steps, checked against exact baseline ID slices and terminal metadata.

Observed discriminator controls (these **are not reproductions of the historical defect**):

| Case | Actual response/body | App/server evidence |
| --- | --- | --- |
| `limit=0`, numeric length 1 | 400, `{"error":"Invalid request fields"}`, JSON content type, length 34 | Matching application RID plus receive/finish trace; sent/received query hashes/lengths match |
| malformed or wrong-scope cursor | 400, `{"error":"Invalid pagination parameters"}`, JSON content type, length 41 | Matching application RID and receive/finish trace |
| unauthenticated valid cursor | 401, `{"error":"No authorization token"}` | Matching application RID and receive/finish trace |
| **Deliberately invalid** `Content-Length: not-a-number` | 400, **empty body**, `connection: close`, **no content-type or application RID** | **`HPE_INVALID_CONTENT_LENGTH`**, no Express receive/finish event; correlated by client/server ports |

One actual global-validator trace: final run 1, request index 41, RID `5aa04702-9c35-41ca-8681-6afb547f711d`, dispatch/receive/finish 800ms and response/assertion 801ms, status 400, `limit` value `0`, one byte, target length 46. One actual parser control: sequence 0, request index 10, server port 65509 / client port 65522, `bytesParsed=776`, packet length 811, empty-body 400 with no application RID. Its next valid continuation returned 200 and correct rows. **All 20 deliberately induced parser errors were asserted and preserved**, not suppressed or counted as ordinary validation errors.

Adversarial run: **22:29:18.225–22:29:25.555Z**, Node **22.23.2**, PostgreSQL **17.11**, exit 0, no skips. All **260 request traces** captured: 20 × 201, 80 × 200, 40 × 401, 100 application 400s, 20 deliberately induced parser 400s. All 240 application responses have matching RID/receive/finish evidence and unchanged query transfer. One listener for the suite. Synthetic schema retained: `pagination_sequences_80a8fa17fbf4409caaba6e1e6def5e02`.

### Old/new comparison and required final serial repetitions

Every invocation ran alone with `--no-file-parallelism --maxWorkers=1`, default plus JSON reporters, **no retry option and zero skipped tests**. Each repeat starts a fresh synthetic schema, runs actual initialization/migrations, and uses guarded PostgreSQL 17 at **127.0.0.1:55439/medapp_audit** with the audit role. Original pagination schemas are retained; render fixtures drop only their own schemas. The database was not reset or unrelated schemas touched.

| Phase / evidence label | UTC window | Result | Observation |
| --- | --- | --- | --- |
| `legacy-control` | 22:24:34.691–22:25:29.349 | 28/28 × 10 | Initial per-response diagnostic version; no symptom reproduced |
| `legacy-buffered` | 22:27:24.213–22:28:18.474 | 28/28 × 10 | Buffered normal diagnostics reduce timing disturbance; no symptom reproduced |
| `stable-final` | 22:28:25.674–22:29:18.136 | 28/28 × 10 | Stable server, before the additional RID assertion |
| **`stable-rid-final`** | **22:30:36.566–22:31:30.299** | **28/28 × 10 = 280 PASS** | **Final code**, including additional RID assertions; no unexpected 400, parser event, slow request or timeout |

Old lifecycle traces show **281 different destination ports** in the pagination suite and 3 in the render fixture per repetition. Stable traces show **one destination port per suite**, establishing the intended lifecycle change, not the cause of the historical failure. Each ten-repeat phase contains 2,840 requests with identical status totals: **30 × 201, 930 × 200, 1,720 × expected application 400, 160 × expected 401**. Final-code traces all have matching application RID, send/receive query lengths/hashes, status and receive/finish/close/assertion-callback evidence; maximum request completion observed was **349ms**. These are bounded observations, **not proof of perpetual stability**.

Final 28-test repetitions (all exit 0, all tests passed):

| Run | UTC completion | Retained synthetic pagination schema |
| --- | --- | --- |
| 1 | 22:30:42.550 | `pagination_341445b868504b29b3a075d003225e56` |
| 2 | 22:30:48.105 | `pagination_ce7df79adebc4fbf9b70ac06cea6365a` |
| 3 | 22:30:53.362 | `pagination_771c34e7dc1040c7aee363f87343944c` |
| 4 | 22:30:58.582 | `pagination_6abf6afd11104a008429c0ecebccf494` |
| 5 | 22:31:04.061 | `pagination_d79debfa71d744548690c19b40dcef7c` |
| 6 | 22:31:09.409 | `pagination_2e7bacc7bb824f14bacdb1f6f5a1c752` |
| 7 | 22:31:14.640 | `pagination_51c6720bf1874bfc96661243de068571` |
| 8 | 22:31:19.772 | `pagination_f0b1aff2eda441db8d35eb70abfefec4` |
| 9 | 22:31:25.005 | `pagination_f1873634439d404fa0da809ebc292d78` |
| 10 | 22:31:30.299 | `pagination_6576261d1c094be28d19c4332be8ffb5` |

Raw evidence directory: **/private/tmp/medapp-f3-rootcause-20260920/**. Separate immutable stdout/stderr/JSON artifacts exist for every labeled invocation, plus per-phase executable/argument records, before/after schema names and protected-file hashes. The initial diagnostic version's `pagination_http_error` events include normal Superagent 400/401 notifications; those runs nevertheless passed their unchanged assertions. Final diagnostics distinguish these as `httpRejectionEvent`, not transport failure. Initial helper typecheck found incorrect Node overload annotations; corrected before the first test execution, with no runtime workaround. Terminal output retrieval failed once, but all ten corresponding reports and logs were verified directly; no run was inferred from that terminal response. Captured logs were scanned for JWTs and the synthetic password/Authorization values; none found.

Final source `tsc --noEmit`, explicit four-test/helper `tsc --noEmit` (ES2022/bundler/react-jsx), and focused four-file ESLint all exited **0** immediately before the final ten repetitions. No application or frontend build was run.

### Main / independent evaluator handoff

**Ready for independent F3 re-evaluation; not independently approved.** Re-run the original two suites (28 tests) and the new 20-sequence suite serially against fresh guarded PostgreSQL schemas. The new sequence suite is a **required real-PostgreSQL integration suite**, not a DB-free unit suite; manifest classification belongs to A/main and was not changed here. Keep the controlled 20 parser rejections separate from unexpected application failures when reading diagnostics.

No proven B-owned application validation/configuration bug was found, so none was changed. If an unexpected application-RID 400 recurs, hand its safe body/query/RID/trace to B/main before any global validation edit. If a response has no RID, correlate the parser/socket trace instead. The old timeout's cause is still unknown; do not cite the deliberately invalid-header controls as its cause or claim the stable-server change proves a root-cause fix.

