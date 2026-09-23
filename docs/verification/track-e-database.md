# Track E — schema lifecycle, preflight, least-privilege tooling

> Publication update (2026-09-22): recorded passwords are redacted to placeholders. Historical passes below predate the credential refactor; fresh DB/browser verification is pending. See [the current credential handoff](publication-secretminimization.md).

## Scope / coordination (2026-09-20)

Implemented E1/E2/E3 only in [startup](../../backend/src/index.ts), new
[schema readiness](../../backend/src/db/schemaState.ts), [preflight](../../backend/src/db/preflight.ts),
[CLI](../../backend/src/db/cli.ts), [database-operation tests](../../backend/tests/database-operations.test.ts),
new role templates, and **scripts only** in [backend package](../../backend/package.json).
No edits to schema/migrations, routes/auth/client, app/config, CI, root lockfile,
dependencies, secret files, or final OPERATIONS. No cloud calls, commit, or push.
No dist builds during concurrent implementation; validation used `tsc --noEmit`.

**V3 correction/integration:** E readiness, preflight, CLI, owned operation tests
and this handoff now account for D's actor/operation/request-key uniqueness.
Migration logic remains entirely D-owned and unchanged by E. No manifest edits
were made during this correction; A/final integration owns test-bucket changes.

### Contract for the app/audit agent and `/ready`

Import `checkSchemaReady` from the new schema-state module. Contract:
`checkSchemaReady(database?: Pool): Promise<void>` — **resolve void = ready**;
reject `SchemaNotReadyError` with only `database_schema_not_ready` for missing or
unsupported versions, missing required objects, permission/connectivity failures.
Use `await` and `try/catch`, not a boolean test of the return value. Return the
existing generic HTTP 503 on failure; do not expose catalog state or errors.
The optional pool is a testing/operational seam; omitted means lazy app pool.
Importing these modules never connects. Each call uses a repeatable-read,
read-only transaction, 15-second statement timeout, and 5-second lock timeout.
No shared cached readiness result can hide a later schema/connectivity failure.

G now imports/awaits this contract for `/ready`; this track does not edit app code.
Production startup now awaits this contract and never initializes/migrates.
Development/test startup retains existing initialization/migration behavior.
The existing production config check still prohibits seeding. Tests verify
production failure never starts HTTP or calls schema, migration, or seed functions.

### Version extension rule

Existing migrations export only a function, not reusable declarations. The exact
expected set is explicitly **[1, 2, 3]**, not just `MAX(version)=3`. All versions
must exist; extra/duplicate versions reject. The checker also verifies an explicit
table/column contract in `current_schema()` (no readiness borrowed from a later
search-path schema), plus these structurally checked unique indexes:

- `sessions.idx_sessions_key`: exactly `(session_key)`.
- `clinical_write_keys.clinical_write_keys_actor_operation_request_key`:
  exactly `(actor_id, operation, request_key)`, **not** the retained patient-scoped
  v2 primary key. A version-3 marker alone is insufficient.

Both must belong to the intended ordinary table in `current_schema()`, be unique,
live, valid, ready, immediate/nondeferrable, nonpartial, nonexpression indexes with
exact ordered NOT NULL key columns and no extra/include columns. A same-named
nonunique, partial, expression, wrong-column/patient-scoped or deferred index
fails readiness. Catalog queries are read-only; no repair or index recreation.
`SchemaState.missingIndexes` is internal; preflight emits only an aggregate count.
This is **not** a complete types/FK/check-constraint/index diff.
Every future migration must extend the expected set, required-object contract,
role grants, and readiness/migration tests in the same release. Prefer deriving
versions from exported declarations once the migration owner adds that API.

## E2 preflight: report, never repair

`runPreflight(database?: Pool)` returns `{ outcome, checks }`, where each check
contains only a fixed `invariant`, decimal-string `count` (no bigint truncation),
and `severity`. No patient text/identifiers, bad values, roles found, raw query,
credential, URL, or driver error is printed. SQL returns aggregate counts only.

- Malformed JSONB *shape*: SQL NULL, JSON null, non-array, non-string/blank/too-long
  code elements, or more than 100 elements. Invalid JSON syntax cannot be stored
  in the current JSONB column; no casts/coercion to "fix" legacy text are attempted.
- Appointment status allowlist: scheduled/completed/cancelled/no-show; NULL flags.
- Application role allowlist: doctor/admin; NULL flags. This is not DB-role mapping.
- Vital measurements: eight `vital_signs.<column>_range` blocker counts mirror the
  **existing API** bounds in [validation](../../backend/src/middleware/validation.ts),
  not newly chosen clinical cutoffs: temperature 0–60; heart rate 0–400;
  systolic BP 0–400; diastolic BP 0–300; respiratory rate 0–150;
  oxygen saturation 0–100; weight 0–1000; height 0–300, inclusive.
  Heart rate, both BP fields and respiratory rate must also be integers.
  Each individual NULL is allowed; `vital_signs.measurement_required` counts
  rows with all eight measurements NULL, regardless of absent/empty/nonempty
  notes. Notes are not measurements. Range counts also reject SQL numeric NaN
  and infinities where the storage type allows them. Current DECIMAL(p,s)
  columns permit NaN but reject infinities; INTEGER columns reject both and
  cannot store fractions. Unavailable measurement columns produce the existing
  `.unavailable` review findings, never fabricated zero/clear counts.
- All declared user/patient references, plus v2 ledger resource/patient links,
  including a ledger claim with no completed resource. No identifiers returned.
- V3 collision groups/rows: `clinical_write_keys.scope_collision_groups` and
  `clinical_write_keys.scope_collision_rows`, blockers grouped by actor/operation/key.
  Rows count **all** rows in colliding groups (sizes 3 and 2 => groups 2, rows 5),
  not surplus rows. No keys/digests/actor/patient IDs leave the database. This
  read-only snapshot does not replace D's locked migration-time collision check.
- Non-null legacy `TIMESTAMP WITHOUT TIME ZONE` values, per known table/column,
  are **provenance review counts**, not proof that a specific time was wrong/DST.
  No timezone is assumed, offsets reconstructed, values converted, or rows changed.
  `DATE` and `TIMESTAMPTZ` are not reported as legacy wall timestamps.
- Missing schema versions/columns/required unique indexes give review findings and unavailable-check counts;
  a fresh or baseline schema can be inspected before migration. Unknown versions
  are blockers. An inaccessible/incompatible schema fails with a generic error,
  not a false clean report. This is not exhaustive data-quality validation.

CLI exits: **0** clear/check-ready/migration-complete; **1** usage, approval,
connectivity, schema-check, or execution failure; **2** preflight blocker;
**3** preflight needs review (including populated legacy wall timestamps).
Do not turn exit 3 into a blanket success or assume preflight grants production
approval. Record an approved timezone/provenance policy separately. The tool does
not change existing retention flags or implement deletion/repair/UTC conversion.

## E1 explicit CLI and release order (A coordinator to merge into runbook)

Production `db:check`, `db:preflight`, `db:migrate` scripts run the **compiled release
artifact**, so the runtime image needs no ts-node/dev dependencies. Build the
release artifact in the normal coordinated build job before using these scripts.
The `:source` variants execute this exact source with ts-node for no-build local
verification; do not deploy ts-node solely to run production migration commands.

All commands require a preexisting, explicitly supplied `DATABASE_URL`; no
dotenv/PGHOST/default connection fallback is permitted by the CLI guard. Import
is inert, unknown commands/flags reject, and `NODE_ENV=test` rejects CLI execution.
Production execution additionally requires `--approved-production`; migration
always requires `--confirm-migration`. **Production migration also requires the
exact environment value `RELEASE_MIGRATION_APPROVED=true`**, checked before pool
import/connection. Missing/empty, `false`, `1`, `TRUE`, and `yes` are rejected.
Read-only check/preflight and read-only production startup do not need that variable.
These flags and the release-only variable are operator acknowledgements,
not evidence of organizational authorization. Supply credentials through the
approved secret/environment mechanism, never argv literals or checked-in files.
Use verified TLS and an explicit approved schema/search_path for both principals.

1. Obtain change approval, encrypted backup and a verified isolated restore, and
   approve maintenance/traffic-drain and rollback windows. Clone-specific schema
   assessment remains necessary: synthetic fixtures do not certify real data.
2. Have the DBA review role ownership, PUBLIC/database/schema privileges, inherited
   roles and unsafe security-definer functions. The three templates below are
   **manual templates, not auto-applied production changes**. New schema provisioning
   must not be used to hide/adopt an existing production schema. Plan ownership
   changes for an existing schema separately and inventory every affected object.
3. Run read-only preflight on the approved environment. Resolve blockers through a
   separately approved clinical/operational process; preserve evidence. Review and
   record wall-time provenance; do not silently repair/coerce/delete any rows.
4. Run **one explicit migration job**, with the migration principal and runtime
   traffic drained as approved. Never give migration membership to runtime.
5. Verify schema version/object readiness; review/reapply runtime grants for every
   newly added object. Switch back to the separate runtime principal and verify
   actual login, reads, writes, atomic success audit, schema readiness, and denials.
6. Only then start production replicas (read-only schema checks, no DDL). Coordinate
   client/session rollout, re-login, and the audit-agent `/ready` integration.

Operator command forms (not executed against production):

```sh
# DATABASE_URL is already injected by the approved environment. No URLs here.
NODE_ENV=production npm run db:preflight --workspace=backend -- --approved-production
RELEASE_MIGRATION_APPROVED=true NODE_ENV=production npm run db:migrate --workspace=backend -- --approved-production --confirm-migration
NODE_ENV=production npm run db:check --workspace=backend -- --approved-production
# After switching the injected credential to the separate runtime principal:
NODE_ENV=production npm run db:check --workspace=backend -- --approved-production
# Launch the previously built release with runtime credentials, never migration credentials:
NODE_ENV=production npm run start --workspace=backend
```

Set the approval variable only on the explicit release job, not on replicas or
in checked-in/current secret files. The launch command performs no migration;
missing version 3 or a broken required index aborts startup before listening.

### Migration-3 collision diagnostic

The CLI now catches only D's typed `IdempotencyMigrationCollisionError`, validates
both counters as decimal strings and prints a fixed JSON diagnostic to stderr:
`event=database_migration_blocked`, `migration=3`,
`reason=idempotency_scope_collisions`, `collisionGroups`, `collisionRows`, and a
constant action pointing to [D's reconciliation procedure](track-d-idempotency.md).
Exit remains **1**; there is no migration-complete event. Existing baseline
initializer progress messages are fixed text. All other errors remain generic;
no error message, stack, query, SQL, URL, key, digest, identifier or clinical text
is forwarded. Preflight collisions return **2** and only aggregate findings.

Pause keyed creation and arrange authorized human reconciliation; do not delete
records, pick a winner, automatically rewrite keys, or forge the v3 marker. A
failed v3 migration leaves v2 records/history unchanged; repeated attempts stay
blocked until a separately approved record-preserving plan resolves ambiguity.

### Locks, blocking, interrupted migrations, rollback

- Existing initializer and migrations retain transaction advisory lock **73410291**.
  The CLI adds session **try-lock 73410292** around the entire explicit lifecycle;
  a second CLI migration exits rather than queues. A dedicated connection avoids
  starvation even with `DB_POOL_MAX=1` (budget one extra migration connection).
  Do not break locks automatically. Other scripts bypassing the CLI still rely on
  the existing transaction lock; do not run old startup-DDL deployments concurrently.
- Initializer and versioned migrations are **two separate transactions**, not a
  single all-or-nothing release. A failure can leave the baseline committed without
  versions. Keep traffic gated, inspect the sanitized failure/DB metrics privately,
  and safely rerun only after diagnosing; readiness rejects until versions match.
- Existing ALTERs and **non-concurrent index creation can block application traffic**.
  Advisory locks serialize cooperating migrators, not arbitrary clinical queries.
  Existing pool statement timeout is 15 seconds; cancellation can roll back the
  current migration transaction. Test approved clone size/lock budgets and use a
  maintenance window; no automatic timeout escalation or migration retry is added.
- Unsupported/holey migration history is rejected **before initializer DDL**.
  Do not delete version rows to force an older binary to start.
- **No down migration/data deletion.** Preserve v2/v3 retry keys, uniqueness and audit records;
  dropping them can create duplicate clinical writes or destroy evidence. Roll back
  application traffic only to a version compatible with retained v1/v2/v3 and secure
  session semantics. Newer versions deliberately reject older schema-check binaries.
  Restore only under the separately approved recovery plan (writes after a backup
  require reconciliation). Never blindly roll back to vulnerable session behavior.

## E3 least privilege and explicit limitations

- [00 database boundary](../../backend/scripts/migration-role/00-database-boundary.sql.template):
  DBA-reviewed dedicated-database removal of PUBLIC CREATE/TEMPORARY and public-schema
  CREATE. **Not executed in the shared local audit database** because that would
  change other agents' privileges. A role-level REVOKE cannot cancel PUBLIC grants.
- [01 provision](../../backend/scripts/migration-role/01-provision.sql.template):
  creates only new named NOLOGIN migration/runtime group roles and a new dedicated
  schema. No IF NOT EXISTS and no alteration of existing roles. Credentials/login
  membership are provisioned separately by the approved identity/DBA workflow.
- [02 runtime grants](../../backend/scripts/migration-role/02-runtime-grants.sql.template):
  schema usage, SELECT, explicitly enumerated INSERT/UPDATE operations and serial
  sequence usage/read. No clinical DELETE, schema CREATE, TRUNCATE, TRIGGER,
  sequence reset, migration-history mutation, audit UPDATE/DELETE, or grant option.
  No blanket default grants to future objects; reassess after every migration.
  `clinical_write_keys` INSERT/UPDATE is intentionally granted for atomic claim
  and completion; the protected migration ledger is `schema_migrations`. V3 adds
  no table/sequence, so no new runtime grant is necessary. Separate-login tests
  perform real v3 claim/completion and reject cross-patient duplicate keys.

Tests create only unique `ops_*` schema/role names in the exact loopback
`medapp_audit` database. A **separate authenticated login** receives only the new
runtime group; its random password exists only in process memory, never files/logs.
The suite does not alter existing roles or global PUBLIC grants. Fixtures and roles
remain as local synthetic evidence; dispose of the entire dedicated audit instance
separately, not by adding cleanup against existing patient data.

Verified: runtime can read/write patient/note data and append audit rows; cannot
create persistent tables/schemas/indexes, alter/drop app tables, change v1/v2/v3 migration rows,
reset audit sequence, mutate/truncate audit rows, or gain migration role. PostgreSQL
may warn rather than error on unauthorized GRANT, so tests compare ACLs and recheck
denial. Appending an audit is not proof of an immutable/off-host audit system;
schema owners/superusers retain power and runtime can submit new audit records.

**Boundary still requiring operator validation:** PostgreSQL grants TEMP to PUBLIC
by default. App-schema DDL denial is verified; universal DDL denial (including TEMP
and other schemas), provider login memberships, unsafe security-definer access,
and the database-wide template are not claimed verified on production. Apply/review
the database boundary in an approved dedicated environment and test the real login
before production. This track does not change shared database ACLs to fabricate a
"no DDL anywhere" local result.

The added runtime TEMP test reports effective permission and attempts only a
transaction-local synthetic temporary table, then rolls it back. If effective
TEMP is present, that is a **known boundary gap**, not a passing universal-denial
claim; if absent, it asserts denial. No existing role, database-wide ACL or PUBLIC
grant is modified to make the test pass. The real production login still needs
the separately approved dedicated-database boundary verification.

## Historical verification evidence (before D v3)

Node **v22.23.2** (cached executable), real local PostgreSQL **17**, fresh guarded
schemas. First focused run: 10/11 passed; corrected one *test assumption* about
PostgreSQL warning-only unauthorized GRANT. Second run at **15:51:24**: **12/12
passed**, 7.23 seconds; backend `tsc --noEmit` and focused ESLint also passed.
Retained passing schema: `ops_6213a42c259b4dc9b42194bf0b5ef53b`.
Final rerun at **15:53:49** after adding import-inertness coverage: **13/13 passed**,
7.23 seconds, fresh schema `ops_9c03a9db5c7a47db937a2c681cd968ee` retained.
Backend `tsc --noEmit`, focused ESLint, owned-file diagnostics and tracked diff
whitespace checks passed. No build, package install, or production connection ran.

Exact executed commands from repository root (no dist build, downloads, or installs):

```sh
PATH="/Users/girikmalik/.npm/_npx/5200f4f4f4f4f4f4/node_modules/node/bin:$PATH" node --version
PATH="/Users/girikmalik/.npm/_npx/5200f4f4f4f4f4f4/node_modules/node/bin:$PATH" npm run typecheck --workspace=backend
PATH="/Users/girikmalik/.npm/_npx/5200f4f4f4f4f4f4/node_modules/node/bin:$PATH" TEST_DATABASE_URL='postgresql://audit:<test-database-password>@127.0.0.1:55439/medapp_audit' npm run test:database-operations --workspace=backend
PATH="/Users/girikmalik/.npm/_npx/5200f4f4f4f4f4f4/node_modules/node/bin:$PATH" node node_modules/eslint/bin/eslint.js backend/src/index.ts backend/src/db/schemaState.ts backend/src/db/preflight.ts backend/src/db/cli.ts backend/tests/database-operations.test.ts
```

Coverage includes populated baseline migration, concurrent idempotent reruns and
row hashes (including audit, version timestamps, retention flags and v2 ledger),
fresh schema CLI migration, explicit approval gates, pool-size-one lifecycle lock,
preflight 0/2/3 exits, missing/future/holey schema versions, missing objects,
read-only enforcement, generic errors, dirty JSON/status/role/orphan fixtures,
unchanged ambiguous microsecond wall times and no PHI output, separate-login runtime
DML/audit grants and denial matrix, and production no-DDL startup behavior.

**Independent evaluator: PENDING main-orchestrator assignment.** This environment
has no nested evaluator/subagent tool. Implementer self-tests are not an independent
evaluation. Main should assign a separate evaluator to inspect role boundary caveats,
CLI gates, read-only queries, migration preservation and `/ready` integration.

## V3 correction verification and integration handoff

The original 13 tests are retained, with expected versions advanced to `[1,2,3]`
and role checks extended. Additional tests cover production release approval,
populated noncolliding/colliding v2, repeat abort preservation/count-only CLI
diagnostics, forged v3 index variants, search-path isolation, v1 session uniqueness
and the effective PUBLIC TEMP gap. Historical v2 fixtures use frozen original
v1/v2 DDL after baseline initialization, **never** an install-v3-and-downgrade shortcut.
The guard allows only the exact local synthetic URL and PostgreSQL **17.x**;
every run creates fresh schemas/roles and retains evidence. No build, real data,
cloud role changes, current environment/secret-file edits, or migration-logic edits.

Shared-terminal output from unrelated evaluators and interrupted invocations is
not counted as a pass. One interrupted E invocation exposed missing required
`visit_date` in newly added synthetic visits; the fixtures were corrected without
changing application schema or weakening assertions, and failed runtime test
transactions now roll back before returning their connection.

Final runtime: cached **Node 22.23.2**, Vitest **4.1.11**, real PostgreSQL **17.11**.

| Attributable check | Result | UTC start |
|---|---|---|
| E database operations, original 13 + additional 13 | **26/26 passed**, zero skipped, 23.91s | 2026-09-20 21:15:53 |
| G audit observability with real E readiness and controlled DB spies | **239/239 passed**, zero skipped, 1.12s | 2026-09-20 21:16:28 |
| Backend source `tsc --noEmit -p`, separate strict noEmit for E test, owned ESLint | **All passed**, exit 0 | 2026-09-20 21:16:43 |
| Read-only retained-fixture metadata probe | **Passed**, PostgreSQL 17.11; aggregates below | 2026-09-20 21:17:17 |

**265 distinct focused tests passed; this is not a full release gate or an
independent evaluation.** The effective runtime TEMP probe returned **true**:
the shared database's known PUBLIC TEMP gap remains, explicitly not remediated.

Retained evidence from the uninterrupted final E run:

| Fixture | Schema | End state |
|---|---|---|
| Original baseline/runtime role suite | `ops_4d1a16f2adbe4845811e0602202b43a1` | `[1,2,3]`; separate-login DML/claim/completion and denial matrix passed |
| Frozen v2 noncolliding | `ops_v2clean_0dd4590f2dea4f619408bde7badf9447` | `[1,2,3]`; all 3 keys / 3 visits / 3 audits preserved; original migration timestamps unchanged |
| Frozen v2 colliding | `ops_v2collision_eae28739a17c47d8829fb419816f3d81` | **`[1,2]`** after two blocked CLI attempts; all 6 keys / 6 visits / 6 audits preserved; 2 groups / 5 colliding rows |

Executed E test arguments were `vitest run --root <repository>/backend --config
<repository>/backend/vitest.config.ts <repository>/backend/tests/database-operations.test.ts
--reporter=verbose`, invoked via the cached Node 22 executable from the backend
working directory with `CI=1`, `TZ=UTC` and the exact approved synthetic
`TEST_DATABASE_URL` shown in the historical command block. The invocation was
labeled `TRACK-E V3 FINAL PG17 FULL26` and ended `EXIT 0` at **21:16:17.652 UTC**.
G was separately invoked with its single test file and `--reporter=dot`, no live
database requirement. No build/download/install, full-suite run, PG15 validation,
production connection, existing-data cleanup or shared ACL change was performed.

### Test classification for A / final integration (no manifest changes by E)

Any explicit backend integration file selection must include **all six** real-PG
suites below, not just the original API/session pair:

| Classification | Suites | Requirement |
|---|---|---|
| Real PostgreSQL integration | [API](../../backend/tests/api.test.ts), [session lifecycle](../../backend/tests/session-lifecycle.test.ts), [database operations](../../backend/tests/database-operations.test.ts), [pagination](../../backend/tests/pagination.test.ts), [idempotency](../../backend/tests/idempotency.test.ts), [validation/routing](../../backend/tests/validation-routing.test.ts) | Guarded synthetic DB; fresh isolated schemas. E also provisions unique local test roles and currently requires PG17.x. |
| Database-free backend behavioral/unit | [security](../../backend/tests/security.test.ts), [configuration](../../backend/tests/configuration.test.ts), [audit observability](../../backend/tests/audit-observability.test.ts) | G uses controlled DB spies and real app/readiness code, not live PG. Include G explicitly in whichever required bucket A owns; never omit it. |
| Database-free frontend/jsdom | [workflows](../../frontend/tests/workflows.test.tsx), [session client](../../frontend/tests/session-client.test.ts), [session provider](../../frontend/tests/session-provider.test.tsx), [draft editor](../../frontend/tests/draft-editor.test.tsx), [draft navigation](../../frontend/tests/draft-navigation.test.tsx), [draft patient async](../../frontend/tests/draft-patient-async.test.tsx), [idempotency](../../frontend/tests/idempotency.test.tsx), [pagination](../../frontend/tests/pagination.test.tsx) | All eight suites; API/identity/browser behavior mocked. Not browser E2E or live PG evidence. |
| Release configuration / browser | [release config](../../tests/config-release.test.mjs), [guide config](../../tests/config-guides.test.mjs), [workflow config](../../tests/config-workflows.test.mjs); [clinical E2E](../../tests/e2e/clinical.spec.ts) | Node tests are database-free; browser E2E has separate browser/server/synthetic DB prerequisites. |

The currently inspected [release runner](../../tests/release-runner.mjs) discovers
all backend suites except security/configuration, so it **already includes** the
new real-PG suites and G (although G is database-free). Any later explicit-list
runner or reclassification must preserve coverage above. E does not edit A's
runner/manifests/CI; PG15 matrix support is **not** claimed by this PG17-only run.

G follows `EXPECTED_SCHEMA_VERSIONS`; its controlled `SELECT EXISTS` catalog
responses cover the additional index query without an app-code change. A/main
should retain both G's HTTP/readiness tests and E's real structural regressions;
mock readiness by itself is not evidence that a physical unique index exists.

**Independent re-evaluation: pending main assignment.** No evaluator/subagent
tool is available in this session. Main should assign an independent E evaluator
for the v3 index contract, collision redaction/preservation, release approval gate,
runtime policy and explicit PUBLIC TEMP limitation. Self-tests are not approval.

## E2 measurement correction after independentE (2026-09-20)

IndependentE reported the existing **26 checks passed**, but its sixteen
out-of-range measurement rows and one all-NULL row produced only timestamp
review findings, with **zero blockers**. That omission is corrected in
[preflight](../../backend/src/db/preflight.ts); the original evaluation failure
is not erased or represented as a passing independent evaluation.

Correction ownership is limited to that preflight, the new
[measurement regressions](../../backend/tests/preflight-measurements.test.ts),
and this Track E document. No global validator, schema/readiness/CLI, migration,
role-template, manifest, release-runner, existing test, dist artifact or secret
file was edited for this correction. Preflight still uses the unchanged
repeatable-read/read-only wrapper with **15s statement / 5s lock** caps.
The existing CLI maps the new blocker findings to **exit 2** without CLI changes.

### Attributable self-verification (not independent approval)

Cached **Node 22.23.2**, Vitest **4.1.11**, real guarded PostgreSQL **17.x**.
Both invocations checked for an active test process before running, used one
worker with file parallelism disabled, and ran consecutively, not concurrently.
Only the exact approved loopback synthetic database was allowed. No dist build,
package install, cloud/production connection, repair, cleanup or shared ACL
change was performed.

| Check | Actual result | UTC start |
|---|---|---|
| Backend source noEmit, separate strict test noEmit, focused ESLint | **Passed**, exit 0 | 2026-09-20 22:14:13 |
| New measurement-only suite, one fresh schema | **5/5 passed**, zero skipped, 3.94s | 2026-09-20 22:14:25 |
| Existing database-operation suite, unchanged | **26/26 passed**, zero skipped, 22.24s | 2026-09-20 22:14:41 |

**31/31 focused tests passed.** The new measurement suite retained
`ops_measurements_486fb9c89b7340d3bfcbcd5b0fa72913` as synthetic evidence.
The existing-suite primary schema is
`ops_f55fdc5a596f4e9e8e5e7e367589d43a`; that suite also retained its usual new
version/index fixtures and test roles. No older evaluator schema was changed.

The new suite inserts only into its one fresh schema and checks these successive
states through both `runPreflight` and the source CLI, with matching reports:

| Measurement state | Per-field range counts | All-empty count | CLI |
|---|---|---|---|
| 22 valid rows: each field alone at zero/max, allowed decimal fractions, all-zero/all-max rows; NULL/empty/nonempty optional notes | All **0** | **0** | **3**, legacy timestamp review only |
| Add 16 rows: one below zero and one above maximum per field; add one all-NULL row | **2 per field**, exactly 16 flagged measurements | **1** | **2**, blocked |
| Add two all-NULL rows with empty/nonempty notes | Still **2 per field** | **3**, notes do not count as measurements | **2**, blocked |
| Add SQL NaN to each of temperature/oxygen/weight/height | **3** for each decimal field; **2** for each integer field | **3** | **2**, blocked |

Current INTEGER fields reject NaN, infinities and fractional text at storage;
current precision-limited DECIMAL fields reject both infinities but permit NaN.
Those storage rejections and unchanged row digests are asserted without widening
types or altering any migration. Preflight explicitly rejects all three
nonfinite representations if a compatible numeric type permits them; no claim
is made that current precision-limited columns can persist infinity.

Each report is restricted to the existing `{ outcome, checks }` structure with
fixed invariant names, decimal-string aggregate counts and severity. Tests check
the exact nine measurement findings, no unrelated blocker, no raw identifier,
notes, user data, URL/credential, timestamp, special numeric value or SQL in CLI
output, and unchanged patient/user/vital/audit/migration row digests. Ambiguous
microsecond wall times are preserved exactly. Existing role/version/approval,
read-only and redaction regressions remain passing.

**PUBLIC TEMP caveat preserved:** the existing runtime probe again returned
**true**. This correction does not revoke PUBLIC TEMP or claim universal DDL
denial; the approved dedicated-database boundary review remains required.

**Integration handoff:** the new measurement test is a real-PG integration
suite, not a database-free unit test. Any explicit final test-file selection
must include it in addition to the existing Track E database-operation suite.
No manifest or runner changes were made by E.

**IndependentE correction retest: PENDING MAIN.** These are implementer results
only. Main must rerun the independent sixteen-plus-empty reproduction and review
the count-only/read-only/boundary/NaN/preservation contract before clearing E2.

