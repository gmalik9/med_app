# Track D — retry-safe clinical writes (Batch C1–C3)

> Publication update (2026-09-22): recorded passwords are redacted to placeholders. Historical passes below predate the credential refactor; fresh DB/browser verification is pending. See [the current credential handoff](publication-secretminimization.md).

Date: 2026-09-20. Implementer D. **Evaluator D rejected the original patient-scoped namespace. Corrected to actor + operation + request key with additive migration 3; mandatory dedicated re-evaluation pending.** Earlier verification results below are historical, not approval of the rejected scope. C4/history pagination is not implemented by this track.

## Scope and baseline

- Read the plan, existing validation, session-hardened client, database/audit helpers and the three write flows before editing. The working tree already contained substantial previous-agent changes. No reset, commit, push, deployment, secret-file read, external AI call, package/manifest edit or distribution build was performed.
- Changes are confined to the assigned migration, new idempotency service, composable audit helper, appointment/visit/vitals creation handlers, three optional client method arguments, new submission hook, the cards' write portions, new focused tests and this evidence file. GET handlers and history/load logic were left for the pagination owner.
- Follow-up explicitly extended ownership to the existing [API tests](../../backend/tests/api.test.ts) and [workflow tests](../../frontend/tests/workflows.test.tsx). Only those two test files and this evidence file were changed during the follow-up; no runtime-source fix was needed. Track B validation/session code and Track C AppPage were not edited.
- Existing authentication generation, refresh coalescing, logout credential capture, capabilities and session-storage logic in the API client were preserved.
- Baseline lack of a durable retry ledger was established by source inspection. No pre-implementation red test run is claimed.

## API contract

Affected operations:

| Operation | Endpoint | Existing response envelope |
|---|---|---|
| `CREATE_APPOINTMENT` | POST /api/appointments/create | `appointment` |
| `CREATE_VISIT` | POST /api/visits/create | `visit` |
| `RECORD_VITALS` | POST /api/vitals/patient/:patientId | `vitalSigns` |

- Optional `Idempotency-Key`: exactly 36 ASCII characters in UUID v4 format. Uppercase hex is accepted and canonicalized to lowercase. Empty/malformed/oversized values, comma lists and duplicate header occurrences are rejected with 400. Keys must be random, not patient identifiers.
- Missing header preserves ordinary creation: identical clinical values with different keys or without keys can legitimately create different rows. No natural clinical uniqueness rule was introduced.
- Uniqueness scope is **authenticated actor + fixed operation + request key**. Patient is part of the canonical validated payload, **not** a namespace. Same actor/operation/key with another patient returns 409 without a second resource or business success audit. Another actor or operation remains independent, not access to the first scope's response.
- First success returns 201 and the existing envelope; matching replay returns 201, the same resource ID and its **current** representation. For example, a completed appointment replays as completed. `Idempotency-Replayed` is `false`/`true`, respectively. Clients do not depend on reading that diagnostic header cross-origin; no CORS configuration was changed.
- Same scoped key with changed canonical validated fields returns 409. A recorded resource no longer available under its original actor/patient scope returns 409, never a replacement creation.
- Authentication and active-session/user checks execute before every creation/replay. Patient existence/current shared-clinic access is checked transactionally before claim/replay. The referenced resource is retrieved using actor, patient and resource ID predicates. This does not invent tenant isolation or reinterpret patient creator provenance as ownership.
- Session revocation after a request has already authenticated retains the existing in-flight authorization semantics; this feature does not add a second session check at transaction commit.
- Replay window is indefinite while the ledger/resource are retained. **No TTL, purge, clinical deletion, key eviction or automatic retry policy was added.** Retention policy requires a separate decision.

## Schema, atomicity and fingerprints

[Migration](../../backend/src/db/migrations.ts) preserves the original version-1 and version-2 SQL/history. Version 3 adds `UNIQUE (actor_id, operation, request_key)` without dropping the historical version-2 primary key, rewriting keys/digests or adding clinical natural constraints. All versions run under the existing transaction/advisory lock; migration 3 additionally locks ledger writers during collision preflight and constraint creation. See the collision/reconciliation procedure below before deployment.

Version 2 adds `clinical_write_keys`:

| Column | Meaning |
|---|---|
| `actor_id` | user FK; part of historical PK and version-3 unique scope |
| `operation` | allowlisted creation operation; part of historical PK and version-3 unique scope |
| `patient_id` | patient FK/canonical payload; retained in historical PK but **not** version-3 unique scope |
| `request_key` | UUID; part of historical PK and version-3 unique scope |
| `request_digest` | 64-character SHA-256 request fingerprint |
| `resource_id` | integer resource reference, populated before transaction commit |
| `created_at` | TIMESTAMPTZ claim time |

There are no clinical text, vitals values, appointment dates, request bodies, response JSON or credentials in the ledger. Reference metadata **is still sensitive clinical linkage**, not an anonymized/public table. Digests are not an authorization mechanism. Access/backup protections remain necessary.

[Service](../../backend/src/services/idempotency.ts) fingerprints fixed-order, allowlisted INSERT values after existing request validation; absent SQL values normalize to null. Unknown body properties are stripped by the existing validator. Patient normalization and integer/numeric validation happen before hashing. Patient is already the first canonical INSERT value in all three operations; **the digest format is unchanged from version 2**, so noncolliding historical keys remain replayable. Actor/operation/key scope is enforced by the version-3 unique constraint and the claim/replay/completion predicates. Patient metadata is also compared defensively before replay. Server-generated visit/vitals timestamps are not request fields and are not regenerated on replay.

One transaction contains:

1. Current patient scope check and canonicalization.
2. Unique INSERT claim with `ON CONFLICT DO NOTHING` (not SELECT-then-INSERT). This deliberately covers **both** the retained v2 PK and v3 unique index. Naming only the v3 index can raise `23505` on the retained PK during concurrent speculative insertion; this was reproduced during correction verification. The v3 unique constraint—not the older PK—enforces actor/operation/key uniqueness, and all replay/completion lookups use that scope.
3. Business INSERT and successful clinical audit INSERT using the **same** client.
4. Resource-reference completion and commit.

On a competing claim, PostgreSQL waits for commit/rollback; the following READ COMMITTED query sees committed metadata. A failed owner releases the claim so a waiter can become the sole writer. Audit or metadata failure rolls back all three records. Nullable `resource_id` is an internal uncommitted reservation; the helper cannot successfully commit an incomplete reservation. Direct SQL bypass of this application invariant is not claimed to be prevented. Polymorphic resource references are checked on replay rather than backed by a cross-table FK. Generic request/read audit events may still occur for every HTTP attempt; **the business success audit** occurs once.

## Date/time contract — no historical reinterpretation

- Appointments retain the existing PostgreSQL `TIMESTAMP WITHOUT TIME ZONE` **wall-clock** contract. Input is canonicalized inside PostgreSQL with timestamp conversion and a fixed six-digit fractional format; omitted seconds and equivalent fractions hash identically.
- PostgreSQL ignores timezone suffixes when assigning this existing column type. Thus 01:30 and 01:30-04:00 preserve the same wall fields; this implementation does **not** silently convert either to UTC or claim they are timezone-aware instants. Existing accepted offset input behavior is characterized, not redesigned. The UI still sends its datetime-local wall value.
- Calendar `nextVisitDate` stays an SQL DATE/string, not JavaScript midnight conversion. Missing/empty optional date follows existing validated null normalization.
- Existing server `NOW()` write behavior and legacy timestamp read serialization remain unchanged. The migration never rewrites a historical timestamp. A pre-existing synthetic DST-overlap wall timestamp with microseconds is checked unchanged after upgrade.
- Node process timezone tests cover UTC and America/New_York; database timezone during these runs was UTC. This is **not** a full PostgreSQL timezone matrix or a resolution of Batch E/Q6.

## UI behavior

[Hook](../../frontend/src/hooks/useIdempotentSubmission.ts) and the three card submission paths:

- Generate a random key for a genuinely new submission; lock duplicate clicks synchronously, before async hashing/HTTP.
- Retain the matching key and an in-memory digest/identity scope after an uncertain result. Offer **Retry same submission**, using the original key only for unchanged fields, patient and authentication generation.
- Block changed fields/patient/identity while an unresolved intent remains. Clinicians may restore the original fields for retry or explicitly reconcile history before beginning a new intent. A confirmation is required to abandon the pending key. Even definitive HTTP failures are handled conservatively; no failure automatically re-keys a submission.
- Recheck identity after the last fingerprinting await and rely on the preserved API generation checks during HTTP/refresh. A stale patient failure cannot set a new patient's error; an old successful response cannot clear newer edits. If edits changed while pending, they remain and a message says only the submitted version was saved.
- Persist **only the random key** in operation-specific sessionStorage. No payload, patient identifier, digest, PHI draft, localStorage entry, IndexedDB or download is added. In-memory form fields remain ordinary React state.
- After reload/remount the key alone cannot prove which fields/patient/identity it belongs to. The UI explicitly says a matching retry cannot be identified and **refuses blind resubmission**. It requires history reconciliation/confirmation before a new key, rather than guessing or persisting a draft. Recovery of the original payload from key-only storage is not possible.
- A sessionStorage write failure blocks HTTP. Confirmed success clears the pending marker. Separate tabs/devices do not share this tab-local intent; lost browser storage/new tabs cannot recover a lost key. Server guarantees still hold whenever the caller retains and sends the original key.
- History-refresh failure after confirmed POST success is not classified as an uncertain POST. GET/load/pagination behavior otherwise remains unchanged.

## Historical verification before evaluator D's scope rejection

Runtime observed: Node **22.23.2**, Vitest **4.1.11**, PostgreSQL **17.11**, DB timezone **UTC**. Approved synthetic database only: loopback port 55439, database medapp_audit. Each focused backend run creates new randomly named `idem_*` schemas; the original API suite uses fresh `audit_*` schemas. All are retained without cleanup/deleting existing data. The first observed run used schema `idem_58efa68b0b25496e8a7fff95fe34532e`; subsequent runs use fresh scopes, including a second blank-schema migration fixture.

Focused sources: [backend tests](../../backend/tests/idempotency.test.ts), [frontend tests](../../frontend/tests/idempotency.test.tsx).

| Check | Observed result |
|---|---|
| Backend focused suite, initial implementation | 18/18 passed |
| Final backend suite including blank-schema install, v1 upgrade and metadata-failure concurrency, UTC | 20/20 passed |
| Same final backend suite, America/New_York process timezone | 20/20 passed |
| Frontend hook/card/header tests, final session-hash guard | 16/16 passed |
| Scoped ESLint over owned source/test files | Passed |
| Backend `typecheck` (noEmit) | Passed |
| Frontend `typecheck` (noEmit) | Passed |
| Editor diagnostics for changed source/test files | No errors reported |
| Focused diff whitespace check | Passed |

Final backend executions were explicitly labeled TRACK-D FINAL-20, at 20:26:49 UTC and 16:26:52 America/New_York; both passed. No test was skipped.

Historical backend coverage included 20 parallel same-key requests **for each of the three operations**; discarded/lost-response retry; changed-payload conflict; 20 competing changed payloads; actor/operation isolation; unauthenticated, disabled-user and revoked-session replay; changed resource scope; malformed key/body rejection; no-header compatibility; separate genuine intents; current-resource replay; no clinical payload in the ledger; audit failure rollback; and 20 concurrent requests where the first owner's completion fails after business/audit insertion (one 500, nineteen 201, one committed resource/key/success audit). **The former cross-patient test incorrectly expected 201; that expectation and the implementation are corrected below.**

Frontend coverage includes same-key retry/new-intent rotation, key-only storage, changed fields blocking, original-field restoration, duplicate clicks, body edits while pending, missing matching fingerprint on remount, explicit reconciliation, patient/account changes, stale failure callbacks, storage failure, identity changes during hashing, each card's actual submission wiring, all three optional headers and preservation of the key through same-session refresh.

Lost-response testing uses a discarded successful HTTP response plus controlled client promise rejection, not a proxy-induced TCP crash. No real-browser E2E, distribution build, full-suite run, cross-device retry test, PostgreSQL 15 run or deployment was performed for this ownership-restricted track.

One terminal response returned unrelated evaluator text; it was **not** counted as test evidence. Focused checks were rerun with absolute paths and Track-D labels. An initial metadata probe from repository root could not resolve the workspace-local PostgreSQL dependency; rerunning from the backend workspace succeeded. These were verification invocation issues, not successful test claims.

## Follow-up — legacy regression compatibility (2026-09-20)

Reproduced both failures before editing under cached Node 22, with `TZ=UTC` and the approved synthetic database supplied to the backend:

- 20:34:04 UTC: original API suite **20 passed, 1 failed**; the migration rerun test expected count 1 and received 2.
- 20:34:07 UTC: original workflows **9 passed, 1 failed**; the vitals test failed because the API mock lacked `getSessionGeneration()`.

Corrections preserve and strengthen the original coverage:

- [Migration rerun regression](../../backend/tests/api.test.ts): the historical follow-up asserted **[1, 2]**; the evaluator correction now asserts **[1, 2, 3]**. Retain the two-user assertion and compare complete ordered migration rows (including `applied_at`) and user rows before/after rerun. Matching counts alone cannot hide replacement or mutation of existing records. Track E's separate readiness version contract is owned by E and must be updated before integration.
- [Workflow regression](../../frontend/tests/workflows.test.tsx): initialize the mock's stable numeric session generation to 1 after every mock reset, clear tab storage between tests, and exercise the real submission hook. Preserve rendered vitals history, numeric `heartRate: 75`, and null temperature checks; additionally require a UUID-v4 third argument, exactly one write, success-driven form clearing and removal of the pending key. Existing stale-patient, failed-note-load, revision/conflict-draft and API-destination tests remain intact. No tests were skipped, removed, cast away or replaced with a mocked submission hook.

### Post-correction executions

Commands ran sequentially (no distribution build). The exact test invocations were:

```sh
cd /Users/girikmalik/Documents/girik_academic_resources/personal_projects/med_app/backend
TZ=UTC TEST_DATABASE_URL='postgresql://audit:<test-database-password>@127.0.0.1:55439/medapp_audit' npm exec --offline --package=node@22 -- node /Users/girikmalik/Documents/girik_academic_resources/personal_projects/med_app/node_modules/vitest/vitest.mjs run /Users/girikmalik/Documents/girik_academic_resources/personal_projects/med_app/backend/tests/idempotency.test.ts /Users/girikmalik/Documents/girik_academic_resources/personal_projects/med_app/backend/tests/api.test.ts --reporter=verbose --silent
cd /Users/girikmalik/Documents/girik_academic_resources/personal_projects/med_app/frontend
TZ=UTC npm exec --offline --package=node@22 -- node /Users/girikmalik/Documents/girik_academic_resources/personal_projects/med_app/node_modules/vitest/vitest.mjs run /Users/girikmalik/Documents/girik_academic_resources/personal_projects/med_app/frontend/tests/idempotency.test.tsx /Users/girikmalik/Documents/girik_academic_resources/personal_projects/med_app/frontend/tests/workflows.test.tsx --reporter=verbose --silent --no-file-parallelism
```

| Exact suite | Result | Run start (UTC) |
|---|---|---|
| [Backend D idempotency](../../backend/tests/idempotency.test.ts) | **20/20 passed** | 20:34:48, combined backend run |
| [Original API integration](../../backend/tests/api.test.ts) | **21/21 passed** | 20:34:48, combined backend run |
| [Frontend D idempotency](../../frontend/tests/idempotency.test.tsx) | **16/16 passed** | 20:34:54, combined frontend run |
| [Original frontend workflows](../../frontend/tests/workflows.test.tsx) | **10/10 passed** | 20:34:54, combined frontend run |

**67/67 tests passed; zero skipped.** Backend configuration disables file parallelism; frontend used `--no-file-parallelism`. Backend and frontend commands were chained on success, not run concurrently. This is the four requested suites, not the full release gate. Frontend tests run in jsdom with synthetic mocks; only backend tests connect to PostgreSQL.

A read-only, loopback/database-guarded PostgreSQL probe confirmed version **17.11**, database **medapp_audit**, timezone **UTC**, and these retained fresh schemas from the successful backend run:

| Fixture | Schema | Migration application times (UTC) |
|---|---|---|
| Original API | `audit_342d87a8411348b4a2099cfaaec72442` | v1/v2: 20:34:49.015 |
| D populated-v1 upgrade | `idem_b7153e872cd94c1bacc167a19a6ec0d5` | v1: 20:34:51.817; v2: 20:34:51.839 |
| D blank-schema install | `idem_fresh_a101af3ae5694cfe8110e90fd4c903fe` | v1/v2: 20:34:52.721 |

Focused ESLint passed under cached Node 22 for all four test files. Editor diagnostics reported no errors in the two corrected files. Independent evaluation remains **pending**; these are implementer results only.

## Release handoff and migration rollback implications

- The current [release runner](../../tests/release-runner.mjs) integration bucket includes every backend suite except explicitly excluded database-free suites, so the new test is discovered without a manifest change. Direct focused runs require TEST_DATABASE_URL; this suite fails instead of silently skipping when absent.
- **Legacy test follow-up resolved:** the explicitly reassigned [API migration assertion](../../backend/tests/api.test.ts) now verifies intended versions and preservation on rerun; the [workflow mock/assertions](../../frontend/tests/workflows.test.tsx) now honor stable session generation and keyed writes. Both original suites and both D suites passed together as documented above. The full release gate and independent verdict remain outstanding.
- Deploy through **migration 3** before enabling the corrected helper/keyed clients. Cross-patient uniqueness requires the version-3 unique constraint; the helper must not serve against v2. Existing clinical tables/data are unchanged. The version-2 FKs can prevent manual deletion of referenced actor/patient metadata; retention/deletion remains policy-controlled.
- Rolling deployment must not route keyed retries to older server code that ignores keys. Rollback to an old binary removes retry guarantees even if the ledger is retained. Prefer forward-fix or disable creation traffic while reconciling.
- Do **not** drop the ledger or delete its version marker during rollback: losing prior keys permits duplicate retries. Leave the additive schema and evidence intact. No down migration or automatic deletion policy is supplied.
- No claim of tenant isolation, comprehensive PHI-free metadata, immutable audit infrastructure, timezone migration, production authorization or independent approval is made.

## Evaluator-D correction: legacy collisions, rollback and human reconciliation

The rejected version-2 design allowed the same actor/operation/key to refer to multiple patients. Version 3 does **not** choose a winner or change existing records:

- Acquire the existing transaction advisory lock, then `SHARE ROW EXCLUSIVE` on `clinical_write_keys`. This blocks concurrent ledger inserts/updates until transaction end, closing the check-to-constraint race even with older writers. Use an approved maintenance window; this is a blocking migration, not an online-index claim.
- Group by `actor_id, operation, request_key`. If any group contains more than one row, throw `IdempotencyMigrationCollisionError` with decimal-string `collisionGroups` and `collisionRows`. Rows count **all rows in colliding groups**, not only surplus rows. Example: group sizes 3 and 2 produce groups=2, rows=5.
- The sanitized error identifies migration 3, counts, the blocked state, human reconciliation and this runbook. It contains no actor/patient identifiers, keys, digests, clinical fields, driver details or connection URL. The migration transaction rolls back; an existing v2 database remains at `[1,2]`, with its original PK and all ledger/business/audit rows and migration timestamps intact. Repeated attempts remain blocked without changing records.
- On noncolliding v2, add the named constraint `clinical_write_keys_actor_operation_request_key` and record version 3. Constraint DDL and version marker commit atomically. A forced version-marker failure is tested to roll back the constraint as well as leave all historical rows intact; a retry then succeeds.

Operator procedure when blocked:

1. Pause keyed creation across all old/new instances and retain an approved backup of complete migration, ledger, clinical and audit history. Do not drop a table, delete a version marker, choose a latest/first row, or blindly issue new keys to bypass the conflict.
2. Have authorized database and clinical/data-steward owners inspect the colliding groups in a secured environment. Counts alone are safe diagnostics, **not** enough to determine whether the underlying resources represent duplicate work or distinct clinical intents. Do not put row identifiers or clinical contents in deployment logs/tickets.
3. Agree on a separately reviewed, record-preserving reconciliation plan for the ambiguous legacy retry mappings and affected callers. Preserve original key-to-resource associations, business records, audits and provenance (including protected legacy history if an approved active-ledger repair requires it). No automated deletion, key rewriting, clinical deduplication or reconciliation tool is supplied or executed by this patch. **Remain blocked if no approved unambiguous mapping can be established.**
4. Rehearse the approved plan and migration on an authorized clone, verify collision counts are zero and all required history is preserved, then retry in the controlled release window. Do not treat a failed attempt or a manually inserted version-3 marker as completion.
5. Roll back application traffic by pausing creation or forward-fixing, not by undoing migration 3 or discarding keys. Retain the v2/v3 history and unique constraint; older code cannot promise the new 409 behavior and must not serve keyed retries during rollback.

### Track E / orchestrator contract (not edited by D)

- [Schema-state contract](../../backend/src/db/schemaState.ts) currently expects `[1,2]`; E must update it to **`[1,2,3]`** and account for the actor/operation/request-key unique constraint in the readiness/preflight contract. There are no new tables or columns in v3. Missing v3 cannot support the corrected helper.
- The migration guard itself performs locked preflight. E's separate [operator preflight](../../backend/src/db/preflight.ts) is not changed here. E may expose the same aggregate collision counts in its read-only preflight; never include collision rows/keys.
- [CLI](../../backend/src/db/cli.ts) currently reduces top-level errors to `database_command_failed`. The exported typed error/message is sanitized and actionable for callers, but **the unchanged CLI does not yet display its counts**. E/orchestrator must decide how to surface only this approved diagnostic safely; D did not change the CLI or claim its output includes the message.
- No E-owned schema-state/preflight/database tests, backend CLI, packages or manifests were edited. Do not run the full release gate until E's contract is reconciled. The API migration assertion is now `[1,2,3]`; its existing record-preservation checks remain intact.

### Correction verification

- Red regression, 2026-09-20 **20:57:10 UTC**: all three corrected cross-patient tests failed against the old helper (`expected 409, got 201`); 17 unrelated tests were filtered out. Fresh retained schema: `idem_b3267da11e44437fab9a3207cb7ff126`.
- The focused suite now contains **32** tests: the previous 20 corrected/strengthened, populated-v2 noncollision/legacy replay, multi-group collision rollback, marker-failure DDL rollback, and three additional cases per operation (20 competing cross-patient requests; actual SQL uniqueness/conflict target; unavailable patient linkage without replacement).
- Two attempted post-fix invocations at 20:59 UTC and a second-timezone attempt at 21:02 UTC were interrupted with exit 130 and are **not** counted as passing verification. Terminal responses containing unrelated Track B/G/pagination output were also excluded, not attributed to D's checks.
- Initial UTC correction run at **21:00:41** passed 32/32, but the subsequent New York run at **21:03:26 UTC** failed 3 concurrency cases. A diagnostic run at **21:04:39 UTC** reproduced `23505 clinical_write_keys_pkey` (2 failing cases). This exposed the dual-index speculative-insert race described above, not a timezone normalization failure. The helper was corrected to handle both unique indexes, temporary diagnostics removed, and no assertions weakened. Final results follow.
- Stable resource identity vs representation: matching replay returns the same ID with current fields. A scheduled appointment later marked completed replays as completed, not the original scheduled response. Ledger contents are metadata/digests, not a clinical response snapshot. Unavailable original actor/patient linkage returns 409, never a substitute resource.

### Final correction results (cached Node 22.23.2; PostgreSQL 17.11)

All commands used `npm exec --offline --package=node@22 -- node`, Vitest 4.1.11, the guarded synthetic loopback URL, and fresh randomly named schemas. No full-suite run, build, deployment, cleanup, secret-file access or change to other database data was performed.

| Focused check | Result | Start (UTC) |
|---|---|---|
| [Idempotency + migration tests](../../backend/tests/idempotency.test.ts), final both-index helper, `TZ=UTC` | **32/32 passed**, zero skipped | 21:05:28 |
| Same final suite, `TZ=America/New_York` (DB remains UTC) | **32/32 passed**, zero skipped | 21:05:38 |
| [API migration rerun assertion](../../backend/tests/api.test.ts), `TZ=UTC`, selected by `-t 'preserves schema and records on migration rerun'` | **1/1 selected passed**, 20 unrelated tests filtered out | 21:02:33 |
| Final backend `tsc --noEmit --project` | Passed | After final helper correction |
| ESLint over the four owned TypeScript files | Passed | After final helper correction |

Vitest invocations used `run`, absolute backend `--root` and [config](../../backend/vitest.config.ts), the single selected test file, and `--reporter=verbose --silent`; `CI=1` and the approved `TEST_DATABASE_URL` were explicit. Final outputs were labeled `TRACK-D V3 FINAL BOTH-INDEX UTC32` / `NY32`. These are **65 passing test executions across 33 distinct tests**, not the complete API/backend release gate. Frontend code/tests were unchanged by this correction.

Read-only post-run metadata confirmed these retained New York-run fixtures (all times UTC):

| Fixture | Schema | End state |
|---|---|---|
| Populated v1 + HTTP/concurrency | `idem_0093ab40fbcd4881bb933727fa065e0f` | `[1,2,3]`; v2/v3 at 21:05:39.289 |
| Fresh baseline install | `idem_fresh_835908b72c85462aaa09042e020613a7` | `[1,2,3]`; all at 21:05:40.401 |
| Noncolliding populated v2 | `idem_v2_270a5c6841cf48c5b5f581b76ff58b18` | `[1,2,3]`; 3 keys / 3 visits / 3 creation audits retained |
| Colliding populated v2 | `idem_v2_877b53b993a541cd87609bc828da003e` | **`[1,2]`**; all 6 keys / 6 visits / 6 creation audits retained; 2 collision groups / 5 colliding rows |
| Forced marker failure, then retry | `idem_v2_a640862d383b449a83774e6bd665b605` | `[1,2,3]` after verified rollback/retry; 1 key / 1 visit / 1 creation audit retained |

The final UTC collision fixture `idem_v2_c1049259fa0f4c25a937d65a4bc896eb` likewise remains at `[1,2]` with all 6/6/6 records. Failed/interrupted run schemas were retained rather than deleted.

## Evaluator status

**runSubagent unavailable in this session; no nested evaluator was invoked. Orchestrator must assign dedicated evaluator.**

The initial dedicated evaluator verdict was **FAIL** for patient being part of the key namespace. Implementer checks are not a replacement independent verdict. **Mandatory dedicated re-evaluation remains pending main/orchestrator assignment.** Retest corrected cross-patient conflicts and SQL uniqueness, populated-v2 collision/noncollision/rollback fixtures, preserved legacy replay, concurrency, current-auth replay and current-representation semantics before integration.

## Independent D2 intermittent timeout investigation (2026-09-20)

**Classification: original cause unresolved / not reproduced.** The reported independent run had 19 received/completed requests (ten 201, nine 409) before its 30-second mixed-payload case timeout. Version-3 scope/migration probes had passed. This investigation does not relabel that timeout as a pass or claim to have fixed a proven production defect.

### Retained evidence and deadline analysis

- Inspected only the approved synthetic database at `127.0.0.1:55439/medapp_audit`. The retained `idem_ddabd0c29ed34acc8730508ce5d1f31b` schema was accessed inside `BEGIN READ ONLY`; no DDL/DML or cleanup touched it. Before/after SHA-256 comparisons of ordered row representations across **all 13 tables** were equal at **22:02:29 UTC**. No row values were logged.
- It contains `[1,2,3]`, zero incomplete ledger entries, and zero received audit events without a terminal event. The changed-payload scenario has exactly one business row, one complete matching ledger reference, one business success audit, and the correct canonical SHA-256 fingerprint (compared privately, not printed). Those facts corroborate committed-data integrity, not the fate of an unobserved twentieth client request. Request auditing is best-effort, so absence of an audit record alone cannot prove a transport failure.
- Inspection of the installed Supertest implementation confirmed `request(app)` creates/listens on a new HTTP server for each request and waits for its `server.close` callback before settling. The previous concurrent test therefore exercised twenty ephemeral listeners, not twenty requests to one listener. This is an unnecessary transport/lifecycle variable, **not a reproduced explanation** of the timeout.
- [Application pool](../../backend/src/db/index.ts): max 10 by default, acquisition/connection timeout **5 seconds**, per-statement timeout **15 seconds**, idle pool timeout **30 seconds**. Runtime PostgreSQL reported `statement_timeout=15s`, `lock_timeout=0`, `idle_in_transaction_session_timeout=0`. Per-statement limits are not a total transaction/handler deadline; rollback is also a query.
- [Production listener](../../backend/src/index.ts): `requestTimeout=30000`, `headersTimeout=10000`. These concern receiving the request/headers, **not a 30-second end-to-end Express handler deadline**. Shutdown has a separate 25-second forced-exit deadline. The test previously called `createApp()` directly, so it did not apply the entrypoint's HTTP settings.

### Exact repository changes in this follow-up

1. New test-only [HTTP harness](../../backend/tests/helpers/idempotency-http.ts): one ephemeral listener bound explicitly to loopback for the **whole suite**, mirroring the existing production listener settings; explicit listener teardown. All suite HTTP calls use that listener. No retries, request throttling, or concurrency reduction.
2. Every request has **20-second response / 22-second total client deadlines**, below the unchanged **30-second** case timeout. The harness records deterministic suite index and batch index, random server RID, socket/connect/send, server receive/body-end/finish/close, client response/end, settlement, status, and bounded transport error code. It never serializes requests, exceptions, credentials, bodies, patient/actor/key identifiers, or fingerprints.
3. Concurrent groups use `Promise.allSettled` and log **all twenty outcomes** before rejecting any failed group. A one-shot 6-second watchdog collects transport state plus an independently bounded PostgreSQL observer snapshot (pool total/idle/waiting, PID/state/wait event/blockers/query and transaction ages/lock types and modes). Rejected groups and failed cases also produce safe diagnostics. No SQL text or bind values are emitted. Observer connection/statement/client-query limits are 2/2/2.5 seconds; it never waits behind the application pool. No sleeps or polling were added.
4. [D32 tests](../../backend/tests/idempotency.test.ts): stronger exact synthetic host/port/database/user guard, fresh schemas preserved. All twenty mixed-payload requests remain concurrently in flight. Whichever payload wins, **all ten matching indices must be 201 and all ten changed indices 409**; verify one initial success plus nine replays, common identity/payload, exact conflict bodies, one actual business-row/audit/ledger increment, complete resource reference, and the exact canonical persisted fingerprint. Existing migration, cross-patient and rollback assertions remain.
5. [Original workflow fixture](../../frontend/tests/workflows.test.tsx): add stable numeric `id`, `hasMore: false`, `nextCursor: null` to the vitals history response. No pagination validator/mock-hook/runtime change. All prior display, numeric submission, UUID-key and clearing assertions remain.
6. [Frontend D test](../../frontend/tests/idempotency.test.tsx): type the existing deferred mock as `(key: string) => Promise<unknown>` so strict test noEmit can validate its existing key argument assertion. No assertion or runtime behavior changed; restored terminal newline.

**Production changes: none.** Before/after hashes of 58 backend/frontend source and Vitest configuration files are unchanged. No migration/helper/route/session/pagination/runtime/manifest edits, builds, deployment, package installation or other-agent source edits were made. The only repository changes in this follow-up are the four test/helper files above and this evidence document.

### Serial verification and diagnostic calibration

Environment: cached Node **22.23.2**, Vitest **4.1.11**, PostgreSQL **17.11**, `TZ=UTC`. The serial slot was used throughout. Every database run created new random synthetic schemas; prior schemas were never reused or mutated. New schemas remain as evidence.

| Check | Actual result / UTC |
|---|---|
| Old harness, selected changed-payload case, three fresh serial processes | **3/3 passed**, 21:53:05–21:53:10; 31 unrelated tests filtered per run. Original timeout not reproduced. |
| Original workflows before fixture correction | **9 passed / 1 failed**, 21:53:10; missing rendered 72 bpm due to obsolete page envelope. |
| Instrumented full D32 initial run | **32/32 passed**, zero skipped. JSON-only reporter did not retain console traces; not counted as stress trace evidence. |
| Final harness: **ten serial full D32 repetitions** | **320/320 passed**, zero failed/skipped, **21:58:04.715–21:58:31.619**. Ten fresh application schemas plus forty fresh migration fixtures. |
| Explicit transport evidence from those repetitions | **80 batches / 1,600 fulfilled concurrent requests**, every index/RID/socket/connect/send/server receive/body-end/finish/client response/end/settlement present. Exactly one listener per run; no slow-watchdog events. All ten changed-payload batches were ten 201 + ten 409, with per-index assertions and DB/fingerprint checks; maximum individual mixed-batch duration **43 ms**. Both payloads won across runs (opposite winner in repetition 6). |
| Frontend D + original workflows | **16 + 10 = 26/26 passed**, zero skipped, **21:58:53.264–21:58:55.713**, file parallelism disabled. |
| Backend and frontend source `tsc --noEmit`; explicit focused test noEmit; four-file scoped ESLint | **Passed**, immediately before frontend run. Test compiler uses ES2022/Node types (Node 22); source compiler retains project ES2020 settings. |
| Temporary deliberate SQL-lock and missing-response calibration | **2/2 passed**, **22:01:04.910–22:01:47.525**; details below. These are diagnostic probes, not reproduction of the original intermittent fault. |

The temporary calibration used the real production app/pool/helper in its own fresh schema. A held ledger table lock was visible at the 6-second snapshot as `wait_event_type=Lock`, `wait_event=relation` with its blocker PID. Releasing that **probe-owned** lock from the observer allowed normal 201 completion at **6,066 ms**. A second lock was deliberately held through the unchanged PostgreSQL deadline: actual app returned **500 at 15,036 ms**, before the 20-second client response deadline, and committed no second business/ledger row. No automatic write retry occurred.

A separate synthetic HTTP handler deliberately withheld one response. The harness rejected at **20,002 ms**, preserving nineteen fulfilled peers and one rejected index/RID, with server receipt but no server finish and no SQL sessions/locks. This demonstrates that a future missing completion fails below the global case timeout with actionable distinctions rather than discarding peer outcomes or passing the test.

### Reproducible evidence and limitations

Raw output and scripts are retained **outside the repository**, under the temporary directory `/private/tmp/medapp-d2-investigation-20260920`: baseline reports, initial instrumented report, `stress-01` through `stress-10` verbose logs/JSON reports, stress runner and per-index/RID summary, frontend before/after reports, controlled diagnostic probe source/config/logs, retained-schema before/after row hashes and runtime hashes. They contain synthetic data only; diagnostics exclude tokens and clinical contents. Use verbose plus JSON reporters (and `NO_COLOR=1`) to retain console trace evidence; JSON-only reporting hides it.

Stress invocation: cached Node runs the existing Vitest entrypoint from the backend directory with `run tests/idempotency.test.ts --reporter=verbose --reporter=json --outputFile.json=<temporary report> --no-file-parallelism`, ten child processes **sequentially**, `CI=1`, `TZ=UTC`, approved `TEST_DATABASE_URL`. The temporary runner additionally asserts 32 passing tests, eight complete twenty-request trace sets, exact status distributions and five fresh schema names on every repetition. Frontend uses its existing configuration with only D idempotency and workflows selected and file parallelism disabled.

Initial explicit-test compiler attempts used the source ES2020 library (incompatible with the pre-existing fixture's `replaceAll`) and omitted Node types; these were invocation issues, not source regressions. Corrected compiler flags and the narrowly typed D mock passed; no config was weakened. Terminal-newline checks caught missing newlines in the two owned frontend tests; both were restored.

**No broad timeout increase, suppressed failure, weakening of mixed-payload concurrency, or production fix is claimed.** Removing per-request listeners makes the harness representative and diagnostics finite, but old-harness baseline runs also passed. Historical evidence cannot distinguish a never-dispatched request, listener/socket delay, callback lifecycle issue, or another transient cause; the original timeout remains unresolved/not reproduced. **Main's independent evaluation is still required.**

## Combined-UI regression correction — main PG15/UTC gate (September 20 local / September 21 UTC)

### Main failure and independent causes

Main's exact retained failure log: `/tmp/medapp-orchestrator-release-pg15-utc-20260920.log`.

- At **2026-09-21 00:38:51 UTC**, the release-default frontend run reported **641 passed / 1 failed out of 642**, before the integration bucket. The failing case was `write card integration > createVisit preserves edits made before the old successful response` in [the D frontend suite](../../frontend/tests/idempotency.test.tsx): immediate `getByRole('status')` could not find a notice. Its DOM still had diagnosis `74`, **Save Visit disabled**, and the separate history alert/retry controls. Earlier PG17/UTC and PG15/New York full passes were reported by main; they were not rerun or counted as evidence for this correction.
- An unmodified standalone **16/16** run at **00:40:13 UTC** and an unmodified full **642/642** run at **00:40:35 UTC** passed. Thus the original intermittent scheduling occurrence did **not** recur naturally in these baseline runs.
- Source review found that [submission](../../frontend/src/hooks/useIdempotentSubmission.ts) awaits the latest edited-form WebCrypto digest **after** the POST promise succeeds and the pending storage key is removed. Only then does it publish the preserved-edit notice and clear `pending` in `finally`. Resolving the HTTP deferred inside a partial `act` does not await an outstanding native WebCrypto operation. The old assertion was at the wrong completion boundary; a disabled submit button is evidence the submission has not settled, not evidence of lost edits.
- Separately, all three D paginated-history defaults omitted `hasMore` and `nextCursor`. [F's strict validator](../../frontend/src/utils/pagination.ts) rejects those pages; [the reader](../../frontend/src/components/PatientHistory.tsx) exposes an independent load alert/retry. A direct validator probe verified rejection of **each** old appointments/visits/vitals envelope and acceptance of **each** corrected terminal envelope. This explains the history error in main's DOM but is **not required** to cause the premature preservation assertion.

### Controlled reproduction, correction and regressions

Only [the D frontend tests](../../frontend/tests/idempotency.test.tsx) and this document changed in this follow-up. **No production source, write hook, card write handler, F read/pagination logic, other-agent test/document, configuration, dependency, policy or AI code changed.**

1. Added a controlled visit probe with a valid, fully settled initial history page. It delegates fingerprinting to real WebCrypto but holds completion of **only the edited draft's digest** behind an explicit deferred promise. At **00:41:40 UTC**, retaining the original immediate status assertion produced the same `Unable to find ... role "status"` failure: diagnosis `74` preserved, POST key already cleared, Save Visit disabled, **no history alert**. This is a deterministic reproduction of the invalid test timing assumption, not a claim to reproduce the original OS scheduling delay. The selected red run had **1 failure / 16 other cases filtered**, and is retained rather than counted as a pass.
2. Corrected every paginated-history fixture to include its rows plus `hasMore: false, nextCursor: null`. The nonpaginated latest-vitals response remains its real `{ vitalSigns: null }` contract. Card setup waits for valid history completion and asserts no alert; vitals history is explicitly opened so its read errors cannot be hidden by collapsed UI.
3. Retained all sixteen original cases and their meaningful draft `74` / notice `kept` assertions. The three original preservation cases now first require the submit button to become enabled after previously observing it disabled. They also assert exactly one POST, no uncertain-write retry, no read alert, and a cleared pending key. Same-key retry cases retain their key-equality/form-clearing assertions and now check settled valid history and cleared bookkeeping. **No timeout, retry-on-failure, assertion suppression, fake timer, worker limit or file-parallelism setting was added.**
4. The finalized controlled-digest regression asserts the legitimate intermediate state (disabled save, preserved `74`, absent notice), releases the digest explicitly, then requires the enabled save, unchanged draft, exact message **“The submitted version was saved. Current edits were not submitted and have been kept.”**, no alert and exactly one POST. It runs the real card, hook and reader.
5. Added a second deterministic regression for an actual history **GET rejection after confirmed POST success**. The successful POST clears its submitted form/key; a newer `74` draft is then entered while refresh is pending. Rejection must show **Unable to load records**, never **Failed to save visit**, an uncertain-save message, same-submission retry or reconciliation controls. Explicit **Retry loading records** must fetch the same initial boundary, render the saved `73` record, preserve the new `74` draft, leave save enabled and the key absent, and keep the POST count at **one**. Existing production behavior passes; no committed-write UI defect was found in this path.

### Final verification — default release workers, three fixed serial runs

Node **22.23.2**, Vitest **4.1.11**, `TZ=UTC`, jsdom and synthetic API mocks only. The frontend's existing config and normal `npm run test --workspace frontend` command were used, with default concurrent file workers **within** each run; the three full suite processes were launched **serially**, fail-fast, not retried. Only default+JSON reporters/output paths were added for retained evidence. No database query, timezone change, backend test, browser run, build, package installation, secret-file read, deployment or external provider call was performed.

| Check | Result | Start (2026-09-21 UTC) |
|---|---|---|
| Unmodified D16 baseline | **16/16 passed** | 00:40:13 |
| Unmodified full frontend baseline | **642/642 passed**, 8 files | 00:40:35 |
| Controlled old-assertion reproduction, valid page | **1 expected failure**, 16 unrelated cases filtered | 00:41:40 |
| Final standalone D suite: original 16 + 2 new regressions | **18/18 passed**, zero skips | 00:42:31 |
| Final full frontend repetition 1 | **644/644 passed**, 8 files, zero failed/skipped/todo | 00:43:00.217 |
| Final full frontend repetition 2 | **644/644 passed**, 8 files, zero failed/skipped/todo | 00:43:14.067 |
| Final full frontend repetition 3 | **644/644 passed**, 8 files, zero failed/skipped/todo | 00:43:27.781 |
| Frontend source noEmit; strict focused-test noEmit; changed-test ESLint | **Passed** | After repetition 3 |
| Editor diagnostics; explicit owned-file whitespace checks | **Passed** | Final checks |

The three final full runs give **1,932 passing test executions** across the same **644 distinct test identities**, compared as sorted file/full-name lists from JSON reports. The suite grew from 642 to 644 solely through the two added D regressions; no original case was removed. No source/test edit occurred between these three runs. D test SHA-256 for each run and final checks: `c9b85ced2ed7738b7f9eeb8c4bd2e59f95164cf6e07e9b99481f275fbd609094`. A read-only before/after inventory confirmed **106 protected runtime/configuration/other-test files byte-identical**, including the write hook, three cards, F reader/validator and Vitest configuration.

Retained external evidence (synthetic only, not checked into the repository):

- `/tmp/medapp-d-ui-pg15utc-baseline-d16-20260920.log`
- `/tmp/medapp-d-ui-pg15utc-baseline-full-20260920.log`
- `/tmp/medapp-d-ui-pg15utc-controlled-red-20260920.log`
- `/tmp/medapp-d-ui-pg15utc-final-d18-20260920.log`
- `/tmp/medapp-d-ui-pg15utc-pagination-contract-20260920.log`
- `/tmp/medapp-d-ui-pg15utc-final-full-{1,2,3}-20260920.log` and corresponding `.json` reports
- `/tmp/medapp-d-ui-pg15utc-protected-before-20260920.json`

**Independent evaluation and release handoff:** the same [D test file](../../frontend/tests/idempotency.test.tsx) now contains **18** cases for the future independent evaluator. No independent verdict is claimed. Main must rerun the combined release gate and relevant real-browser coverage in its assigned slot. The original main PG15/UTC full gate remains a historical failure until that gate is rerun; these frontend-only checks do not certify integration, database/timezone behavior, browser behavior, or resolve the separate historical D2 backend timeout.

