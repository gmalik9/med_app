# Track I — serial integration and release contracts

> Publication update (2026-09-22): recorded passwords are redacted to placeholders. Historical passes below predate the credential refactor; fresh DB/browser verification is pending. The current guard requires a private supplied password, not the historical published one. CI requires the dedicated `TEST_DATABASE_PASSWORD` repository secret (owner setup pending). See [the current credential handoff](publication-secretminimization.md).

Date: **2026-09-20**. Initial-pass scope: root/backend **scripts only**, release helpers/config
contracts, verification workflow consistency, Dockerfile **FROM digest pins only**,
assigned root documentation, the overall ledger and minimal H staleness correction.
No runtime logic, schema/migrations, dependencies, lockfile, nginx/CSP, test-suite
ownership, shared dist or J browser evidence changes. No production/secret access,
container launch, commit or push. Independent evaluator tool is unavailable;
**I independent gate PENDING main assignment**. Main owns full integration/final counts.

The later, explicitly authorized four-suite PostgreSQL prerequisite correction is
recorded at the end of this document. Initial-pass limitations below are historical;
the correction's focused results are not a new full-release or hosted-CI pass.

## Suite classification

The inventory is executable with `npm run test:inventory` from the root; it does
not load app modules, connect to PostgreSQL or run tests. The runner continues to
select **all backend tests except security/configuration**. New nested .test.ts
suites default to integration; unsupported test/spec naming fails discovery until
the Vitest include contract is deliberately updated. Contract tests enumerate the
current inventory so additions also require a reviewed documentation/classification update.

| Suite | Bucket / reason |
| --- | --- |
| [security](../../backend/tests/security.test.ts) | Backend unit; reviewed database-free. |
| [configuration](../../backend/tests/configuration.test.ts) | Backend unit; mocked dotenv/configuration, no DB. |
| [api](../../backend/tests/api.test.ts) | Required integration; real PostgreSQL/HTTP/migrations/atomic writes. |
| [audit-observability](../../backend/tests/audit-observability.test.ts) | Required integration bucket, even though its app/DB dependencies are controlled mocks; not silently reclassified as unit. |
| [audit-references](../../backend/tests/audit-references.test.ts) | Required integration; real PostgreSQL persisted references/failure behavior. |
| [database-operations](../../backend/tests/database-operations.test.ts) | Required integration; schemas, production CLI, roles/logins, migrations/readiness. |
| [idempotency](../../backend/tests/idempotency.test.ts) | Required integration; real concurrency, durable keys, v2/v3 preservation. |
| [pagination](../../backend/tests/pagination.test.ts) | Required integration; real SQL and HTTP traversals (also utility cases). |
| [pagination-render](../../backend/tests/pagination-render.test.ts) | Required integration; **real-API frontend render** lives under backend tests, not a database-free frontend unit. |
| [pagination-sequences](../../backend/tests/pagination-sequences.test.ts) | Required integration; real DB/HTTP sequences and explicit protocol-negative controls. |
| [preflight-measurements](../../backend/tests/preflight-measurements.test.ts) | Required integration; real SQL range/anomaly counts and CLI exits. |
| [session-lifecycle](../../backend/tests/session-lifecycle.test.ts) | Required integration; real session/revocation/refresh races. |
| [validation-routing](../../backend/tests/validation-routing.test.ts) | Required integration; real authenticated HTTP/DB, parsers and date queries. |
| [frontend tests](../../frontend/tests) | DB-free component/client tests via frontend Vitest; distinct from the backend real-API render suite above. |
| [release contracts](../../tests/config-integration.test.mjs) and other config tests | DB-free Node test runner; script/discovery/report/doc/workflow/pin contracts. |

`npm test` now aliases root `test:unit` (release contracts + explicit backend units
+ frontend tests). Backend `test:unit` still selects **only** security/configuration.
`test:database-operations` now guards the exact URL and includes measurement preflight.
Neither unit-friendly command is release integration evidence.

`test:integration` / `verify` required the historical synthetic URL
`postgresql://audit:<test-database-password>@127.0.0.1:55439/medapp_audit` before
children run. CI used the same user/password/database and `55439:5432`, checking the
URL explicitly and prints inventory before matrix metadata. No connection options
or operator-selected schema override are allowed. Suites create fresh random schemas;
some retain them, others clean only their own. No existing-schema cleanup is added.

Integration uses both default and JSON reporters so D/F diagnostics remain visible.
A private OS-temporary report must list exactly all discovered integration files,
nonempty all-passed assertions, positive matching totals and zero failed/pending/todo.
Missing/invalid reports, omitted/duplicate suites and skipped/todo tests fail even
if Vitest's process returns zero. The runner removes **only its own temporary report
directory**, not test DB evidence. Human CI logs remain the evidence channel; no
clinical data/raw credential artifact upload is introduced.

## CLI, build layout and documentation reconciliation

No actual source/build-layout defect was found: backend rootDir is src, outDir is
dist; start executes its dist/index module and CLI its dist/db/cli module. Docker
copies backend dist under /app/backend/dist and starts the same compiled code.
Production images omit ts-node. **No runtime/layout source change or shared build
was necessary/performed.** Main must rebuild before executing current compiled CLI.

Root `db:check`, `db:preflight`, `db:migrate` and `:source` scripts now forward to
backend with explicit `--` so approval flags reach the CLI. Existing backend source/
compiled commands are unchanged. [OPERATIONS](../../OPERATIONS.md#current-predeploy-cli-contract--2026-09-20)
records exact root and workspace forms, source equivalents, injected credentials,
both production flags plus exact `RELEASE_MIGRATION_APPROVED=true`, exit 0/1/2/3,
baseline/v2 upgrade, collision abort, separate principals and no-delete rollback.
[Render](../../RENDER_DEPLOYMENT.md) now requires a separately controlled approved
predeploy job, not migration in replica startup. No platform capability is presumed.

[API inventory](../../AUDIT_API_INVENTORY.md) now includes public capabilities,
expired-access/refresh-based logout, strict optional UUID-v4 idempotency headers,
actor+operation+key scope, current-resource replay and actual pagination/filter
models. [README](../../README.md), [SETUP](../../SETUP.md),
[HARDENING_PLAN](../../HARDENING_PLAN.md) and [QUALITY_AUDIT](../../QUALITY_AUDIT.md)
have current supplements without erasing historic test results. H's stale [1, 2]
readiness and G assertion handoff are labelled historical/fixed by their owners.
[IMPLEMENTATION_STATUS](IMPLEMENTATION_STATUS.md) records all eight A–H tracks,
unexplained historical D/F failures and pending combined/independent/J gates.

## Registry-verified application image pins

The configured container CLI was consulted **before any container commands**:
`docker`, orchestrator `docker compose`. Only read-only registry inspections ran.
Existing tags were resolved, not guessed or replaced with another Node major.
Both are multi-platform **OCI index digests**, not a local image/config ID.

| Existing tag / use | Verified immutable index digest | Raw bytes / remote metadata |
| --- | --- | --- |
| `docker.io/library/node:22-alpine` — backend build/runtime, frontend build | `sha256:b6f26b36c8ff49624cfdac716b8ea1138d606df02586a77d364bb5536a634f85` | 6,406 bytes; all 5 Linux platform configs `NODE_VERSION=22.23.2`. |
| `docker.io/nginxinc/nginx-unprivileged:stable-alpine` — frontend runtime | `sha256:daa17b944bac2b578e962da4c61ad72a59233b3c63abea17113acaf4e6b9aea4` | 6,791 bytes; all 8 Linux platform configs `NGINX_VERSION=1.30.5`, inherited user `101`. |

Network sources: Docker Hub registry manifests at
[Node tag manifest](https://registry-1.docker.io/v2/library/node/manifests/22-alpine)
and [nginx tag manifest](https://registry-1.docker.io/v2/nginxinc/nginx-unprivileged/manifests/stable-alpine),
then the same registry paths by the immutable sha256 references above. Docker's
public-registry challenge handling was used; no token/credential was printed or
written into repository evidence. Metadata inspections returned
`application/vnd.oci.image.index.v1+json`. The raw bytes were read from the registry
**by pinned digest** and Python SHA-256 equality assertions matched both table values
at **2026-09-20T23:01:00Z**. Subsequent per-platform config inspection verified Node
22.23.2 / nginx1.30.5 user101. An initial single-config selector returned empty fields
because this API returns a platform-keyed map; corrected map traversal supplied the
version/user proof, not an assumption from the tag.

Exact registry command forms executed (from the repository root):

```sh
docker buildx imagetools inspect node:22-alpine
docker buildx imagetools inspect nginxinc/nginx-unprivileged:stable-alpine
docker buildx imagetools inspect node:22-alpine --format '{{json .Manifest}}'
docker buildx imagetools inspect nginxinc/nginx-unprivileged:stable-alpine --format '{{json .Manifest}}'
docker buildx imagetools inspect node:22-alpine@sha256:b6f26b36c8ff49624cfdac716b8ea1138d606df02586a77d364bb5536a634f85 --raw
docker buildx imagetools inspect nginxinc/nginx-unprivileged:stable-alpine@sha256:daa17b944bac2b578e962da4c61ad72a59233b3c63abea17113acaf4e6b9aea4 --raw
docker buildx imagetools inspect node:22-alpine@sha256:b6f26b36c8ff49624cfdac716b8ea1138d606df02586a77d364bb5536a634f85 --format '{{json .Image}}'
docker buildx imagetools inspect nginxinc/nginx-unprivileged:stable-alpine@sha256:daa17b944bac2b578e962da4c61ad72a59233b3c63abea17113acaf4e6b9aea4 --format '{{json .Image}}'
```

Raw commands above were piped to Python `hashlib.sha256` plus digest equality
assertions; `.Image` outputs were reduced to platform/version/user fields.
Node amd64 child manifest:
`sha256:b64da1de5a51067ab8e75f0bc8dbd0905d8894baa22261f439a4572f41291e50`;
arm64 child: `sha256:451d2ebc48dd4484ae9c3b865e2ed1a5ce2dd7be03d4344b506e41ed948e105d`.
nginx amd64 child:
`sha256:cc92c08186c41fba80d9ca5fdffe09458bbc4bc94e8025586add6806ba768719`;
arm64 child: `sha256:73295a68e76bc90691e408a8a3206db2ebdda35aebff071a756d605734b49773`.
Both indexes include amd64 and arm64; no platform narrowing was introduced.

Only FROM references changed in [backend/Dockerfile](../../backend/Dockerfile)
and [frontend/Dockerfile](../../frontend/Dockerfile). Build/install/artifact layout,
backend `USER node`, inherited nginx non-root user, health checks and proxy/CSP stay
unchanged. Pins improve reproducibility, **not vulnerability clearance**: rebuilt
image/native/OS scanning and served headers remain main/CI gates. Updating a pin
requires fresh registry proof and reviewed tests/scans, not invented SHA strings.

## Serial verification and limitations

No full integration, E2E, production CLI or container build ran in this pass.
Default shell Node20 is not used as evidence; cached Node **22.23.2** is selected
via PATH. No install or lockfile regeneration is needed for scripts/docs/pins.

### Actual short checks (not final combined counts)

At **23:03:27Z**, `npm run test:release` passed **17/17** Node contract tests
(including local doc links), inventory listed the 2 unit / 11 integration files,
then both source `tsc --noEmit` commands and root source ESLint passed serially.
At **23:04:16Z–23:04:19Z**, the **real** reviewed backend units passed **47/47**
(security12 + configuration35) with both default/JSON reporters; the new report
validator accepted Vitest4.1.11's actual JSON shape, matched both file names and
all assertions, and the private temporary report was removed. This validates report
compatibility using **DB-free units**, not database integration execution.
Focused frontend workflows10 + session-client17 passed **27/27**; release contracts
passed **17/17** again. No tests were skipped in these observed focused runs.

Exact command forms used after selecting the cached Node22 binary:

```sh
export PATH="/Users/girikmalik/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH"
node --version
npm run test:release
npm run test:inventory
npm run typecheck
npm run lint
npm exec --workspace=backend -- vitest run tests/security.test.ts tests/configuration.test.ts --reporter=default --reporter=json --outputFile.json="$REPORT"
npm exec --workspace=frontend -- vitest run tests/workflows.test.tsx tests/session-client.test.ts
npm run test:release
```

For the backend reporter invocation, a Node built-in wrapper created a unique
OS-temporary directory, set `DATABASE_URL=''`, `TEST_DATABASE_URL=''`,
`NODE_ENV=test`, ran that command, called `assertIntegrationReport` against the
two unit files, and removed only that temporary directory in `finally`.
`REPORT` denotes that generated absolute path, not a checked-in file or a new
environment prerequisite. Contract tests use fabricated reports/child executors
only for negative plumbing cases; their fake success line is suppressed and is
**not** counted as executed integration. The first contract run had printed that
mock line; it was removed to prevent evidence ambiguity, then checks reran.

Root source CLI forwarding was also executed for check/preflight/migrate with
`NODE_ENV=test DATABASE_URL='' TEST_DATABASE_URL='' RELEASE_MIGRATION_APPROVED=''`.
Forms were `npm run db:check:source -- --approved-production`,
`npm run db:preflight:source -- --approved-production`, and
`npm run db:migrate:source -- --approved-production --confirm-migration`.
All three returned the expected **exit1 `database_command_failed` before connection**,
and npm output confirmed flag forwarding. These are intentional inert refusal
tests, not migrations or database readiness passes. Compiled CLI awaits main's build.

Read-only `node tests/policy-boundaries.mjs` returned expected **exit2**,
`PASS_DOCUMENT_STRUCTURE_ONLY` / `BLOCKED_ALL_Q1_Q7_PENDING`, 36 routes,
42 specified scenarios, **0 runtime controls verified**, no checker errors.
Do not call this a release pass. Separate lexical API-inventory parity checked
36 source endpoints against 36 current inventory rows with no missing/stale route.
Editor diagnostics found no errors in owned edits. The first comprehensive
whitespace assertion found missing terminal newlines in existing edited scripts/
docs; those were normalized. Dockerfiles' pre-existing EOF style is intentionally
preserved to keep their changes **digest-only**, with no trailing whitespace added.

Protected baseline: **86** runtime/source/config/lock/existing-dist files,
canonical sorted path→SHA256-map digest
`23117b9e0d751c90bfa2c384717f65c6f131458734d3335395ee96c22fe6d4fe`.
Non-script manifest JSON digests: root
`91e519fd52e47ca291a9c79265898f916bd3c3768c2f8b5a3bacd602e6ae5afd`, backend
`69da398e27f8335eb6d32acb737afca7172c22808bd8d5ce61466976b1ba3413`.
Final self-check completed **2026-09-20T23:06:59Z**: release contracts **17/17**
again, runner/helper syntax checks, **36/36** API route parity, all **21** owned
files checked for trailing whitespace (and non-Docker EOF normalization), scoped
`git diff --check`, unchanged **86-file protected map**, and unchanged non-script
root/backend manifest digests. All completed successfully. Docker EOF remained
unchanged as required by digest-only scope. No runtime/config/dist/lock drift was
observed. These fingerprints are not a built-release signature.

All **Q1–Q7 remain blocked**. No HIPAA/ePHI-ready claim, guessed final counts,
historical-failure root cause, real production grants, hosted CI pass, image-scan
pass or J screenshot result is asserted. Main must assign independent I evaluation
and collect the combined build/integration/browser/security evidence serially.

## Main-found PG15 matrix failure and prerequisite-only correction

### Main's combined evidence (reported by main, not rerun here)

Main's PostgreSQL 17 / UTC `npm run verify:release` passed: **17 release contracts,
47 backend units, 642 frontend tests, 936 integration cases, 8 browser cases,
0 dependency-audit vulnerabilities**. Main then changed only the synthetic service
at the same approved loopback URL to **PostgreSQL 15.19**, with process/database
timezone **America/New_York**. That full gate correctly **FAILED**: four `beforeAll`
prerequisites required `server_version_num >= 170000 && < 180000`, but the actual
probe returned **150019**. Main reported **735 passed / 201 skipped** integration
cases. These skips were a setup-failure outcome, not acceptable release evidence.
The affected files were database operations, pagination sequences, measurement
preflight and validation routing. This was a test prerequisite mismatch with the
declared **[15, 17]** matrix, not evidence of a PostgreSQL SQL-feature incompatibility.

### Exact correction and fail-closed guards

Only the four suites' version-check imports/calls changed. Their URL checks,
schema/role isolation, setup/cleanup, functional assertions, timeouts, case names
and parameterizations are unchanged. [supportedPg.ts](../../backend/tests/helpers/supportedPg.ts)
is a **test helper**, not runtime code or a new test suite. It performs one actual
`SHOW server_version_num` query after each suite's existing URL/pool guard and before
schema/role DDL. The immutable accepted majors are exactly **15 and 17**; malformed
probe results and every undeclared major (including 16) fail. When
`EXPECTED_PG_MAJOR` is provided it must exactly match the observed supported major;
empty, padded, malformed or mismatched values fail without printing the raw value.
Absent means **undefined only**. There is no fallback, removed probe or skip path.

An existing [release contract](../../tests/config-release.test.mjs) now exercises the
actual helper using a query double: both supported majors and patch boundaries,
undeclared majors even when explicitly requested, malformed/empty probes,
missing rows, query rejection, matching/mismatching/empty environment settings,
and exactly one live-probe query per call. It compares the helper's matrix with
the explicit [CI matrix](../../.github/workflows/verify.yml) and verifies
`EXPECTED_PG_MAJOR` wiring and all four helper consumers. These are DB-free guard
assertions inside an existing contract, **not additional integration cases or a
claim of executing PostgreSQL 17 in this correction**. Release tests remain 17;
the backend unit/integration suite classification is unchanged.

The exact approved URL remains
`postgresql://audit:<test-database-password>@127.0.0.1:55439/medapp_audit`.
No accepted URL, port, production target or CI policy was added. The existing
release runner still rejects missing/unapproved URLs before children and requires
all discovered suites/assertions to pass with zero skips/todos. Workflow, inventory,
report validator and release scripts were not modified.

### Actual focused verification (2026-09-20, local only)

Cached **Node 22.23.2**, npm **10.8.2**, Vitest **4.1.11**; actual PostgreSQL
**15.19 / 150019**, database and parent process **America/New_York**. No container
command or service switch was issued; main's stopped PG17 service was untouched.
Metadata was read from the approved URL without a timezone connection override.
The pagination-sequence fixture's existing session-specific America/Los_Angeles
override and the CLI children's existing restricted environments were preserved.

| Check | Actual result |
| --- | --- |
| `npm run test:release` | **17/17 PASS**, zero failed/skipped/todo. |
| [database operations](../../backend/tests/database-operations.test.ts) | **26/26 PASS**. |
| [pagination sequences](../../backend/tests/pagination-sequences.test.ts) | **20/20 PASS**. |
| [measurement preflight](../../backend/tests/preflight-measurements.test.ts) | **5/5 PASS**. |
| [validation routing](../../backend/tests/validation-routing.test.ts) | **451/451 PASS**. |
| Four-suite run, **23:53:56.907Z–23:54:49.512Z** | **502/502 PASS**, zero failed/skipped/todo; existing strict report validator accepted the actual JSON. |
| Additional read-only actual-PG15 helper probes, **23:55:59.736Z** | **2 accepted / 9 correctly rejected** expected-major settings; schema/role catalog digest unchanged across these probes. |
| Explicit test/helper `tsc --noEmit`, scoped ESLint, release-contract syntax check | **PASS**, completed **23:56:02Z**; no build output emitted. |

SQL review read the unchanged readiness/preflight implementations. The actual
PG15 catalog probe confirmed **pg_index.indnkeyatts exists**. The 26 database tests
exercised exact unique-index readiness, read-only/repeatable-read preflight,
advisory locks, separate-login privilege checks and v2/v3 migrations/collision
preservation. The five measurement tests executed the real PG15 numeric
NaN/precision-limited Infinity/integer rejection behavior, aggregate counts,
CLI exits, unchanged row digests and legacy wall times. Thus no PG17-only SQL
requirement was encountered in these exercised paths; no SQL/feature assertion
was removed or weakened to obtain the result.

Commands executed from the repository root after selecting the cached Node22 PATH:

```sh
export TZ=America/New_York
export TEST_DATABASE_URL='postgresql://audit:<test-database-password>@127.0.0.1:55439/medapp_audit'
export EXPECTED_PG_MAJOR=15 EXPECTED_PG_TIMEZONE=America/New_York
node tests/release-runner.mjs --check-database
node tests/release-database-info.mjs
npm run test:release
npm exec --workspace=backend -- vitest run tests/database-operations.test.ts tests/pagination-sequences.test.ts tests/preflight-measurements.test.ts tests/validation-routing.test.ts --reporter=default --reporter=json --outputFile.json="$REPORT"
npm exec --workspace=backend -- vitest list --exclude tests/security.test.ts --exclude tests/configuration.test.ts --json="$INVENTORY"
node node_modules/typescript/bin/tsc --noEmit --target ES2021 --module commonjs --moduleResolution node --esModuleInterop --skipLibCheck --strict --ignoreDeprecations 6.0 --types node backend/tests/helpers/supportedPg.ts backend/tests/database-operations.test.ts backend/tests/pagination-sequences.test.ts backend/tests/preflight-measurements.test.ts backend/tests/validation-routing.test.ts backend/src/middleware/auditLog.ts
node node_modules/eslint/bin/eslint.js backend/tests/helpers/supportedPg.ts backend/tests/database-operations.test.ts backend/tests/pagination-sequences.test.ts backend/tests/preflight-measurements.test.ts backend/tests/validation-routing.test.ts
node --check tests/config-release.test.mjs
```

`REPORT` and `INVENTORY` above were external temporary evidence paths, not new
required environment settings. Raw logs, real Vitest JSON, read-only guard receipts
and before/after inventories are retained under
`/private/tmp/medapp-i-pgmatrix-20260920-vLZqxm/`. The external wrapper set
`DATABASE_URL=''`, cleared inherited PG*/dotenv options for test children, used
default + JSON reporters and did not retry tests. No dependency install or scanner ran.

**All 936 integration case identities and their multiplicities were preserved**
by before/after executable collection. Sorted full-file/name JSON identity digest
on this workspace: `5d2fd4e1fadc8cfba4b34ba8c6e772b04b1cf42def8d852b2154800e8cde56e3`.
Two external evidence-wrapper mistakes were corrected without changing tests:
the first collection omitted TEST_DATABASE_URL and therefore listed only 899 cases
because two existing suites use skipIf; providing the exact approved URL collected
936 without running hooks. After the successful 502-case run, comparing raw list
order failed because Vitest reordered files by cached duration. Sorted case-identity
comparison passed; this wrapper failure was not a suite failure or silently discarded
test run. No case/count change or assertion suppression was used.

Final scope/whitespace check at **23:57:07.805Z** passed: exactly the **seven**
authorized files changed, **199** other snapshotted files retained their bytes,
and normalized comparisons proved the four suite bodies differ only by the
version-check imports/calls. Protected files include runtime source, existing
dist, other tests, manifests/lockfile, workflows and Dockerfiles (including their
accepted EOF bytes). All seven owned files passed whitespace checks, including
untracked files. Release contracts then passed **17/17** again; editor diagnostics
reported no errors. No full integration rerun was hidden in these final checks.

**Stage: correction locally verified; combined main rerun and separate independent
evaluation PENDING.** The full `verify:release` gate was **not rerun here**. No new
PG17, frontend, browser, hosted CI, dependency/image scan or final release claim is
made. Runtime source, builds/dist, manifests/lockfile, scanners/workflow and known
accepted Docker EOF blank lines remain outside this correction's edit scope.
