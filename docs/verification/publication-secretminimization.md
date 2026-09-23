# Publication credential minimization — 2026-09-22

> **Current publication status:** the [current final verification](#current-final-publication-status)
> below supersedes earlier fresh-DB/browser and restaging-pending statements.
> This document is authoritative for this publication pass; earlier receipts below
> and in linked documents retain their historical scopes, results and failures.

## Current final publication status

MAIN reports the following completed verification on **2026-09-22**, recorded in
its private full-release verification and final staged-scan logs. This documentation-only
update records those results; it does not rerun tests, builds, scans or Git operations.

| Final verification | Result and scope |
|---|---|
| Full release verification on Node 22 | **PASS, exit 0** against a fresh disposable database with a private, randomly generated in-memory password. The disposable database was stopped in `finally` cleanup. |
| Root release/configuration contracts | **43/43 PASS** |
| Backend unit tests | **51/51 PASS** |
| Frontend unit tests | **726/726 PASS** |
| Required database-backed integration | **936/936 PASS**, all **11 suites**, zero skips |
| Real-browser release cases | **8/8 PASS** |
| Full-release total | **1,764/1,764 PASS**, zero skips; the focused follow-up below is not added to this total. |
| Type checking, lint and application build | **PASS** |
| npm dependency audit | **0 vulnerabilities** |
| Changes after the full-release pass | Only API documentation placeholders, two prose false-positive rewordings and names of two audit tests changed; assertions and runtime behavior were unchanged. This status update is documentation-only. |
| Focused verification after those corrections | **43/43 root contracts**, **325/325 mocked audit tests**, and explicit audit-test TypeScript no-emit **PASS**. The mocked run is not a second real-DB pass. |
| MAIN's final exact-index secret scan | All **217 changes** restaged before the scan; Gitleaks **8.30.1**, **1.90 MB** scanned, **exit 0, zero findings, no allowlists**. This covers that exact staged snapshot, not subsequent edits or Git history. |
| Publication exclusions | Private secrets/dotenv files, keys, generated models/workers, build output, dependencies and editor files were **not staged**. Placeholder-only environment examples remain eligible. |
| Image verification | Application/container images were **not rebuilt or reverified in this publication pass**; earlier image evidence remains historical. |
| Full-history security gate | **FAILED / unresolved**: existing history is already on `origin/camera`; the old Google-key exposure is not cleaned or rotated. Current validity is unverified. A clean staged snapshot does **not** establish a clean Git history. |
| Hosted CI prerequisite | Owner configuration of the dedicated `TEST_DATABASE_PASSWORD` repository secret is **PENDING**; no cloud-secret automation was performed. |
| Commit/push and post-push result | **PENDING MAIN / post-push status UNKNOWN**. No commit or push is claimed. MAIN must stage this documentation update and rescan the resulting exact index before committing. |

Dummy/disposable synthetic data and fixtures are intentionally included, as authorized.
Positive credentials remain privately generated or supplied through private environment
inputs; no positive password values, real keys or old local-account passwords are
published here. Historical full-scope whitespace warnings are cosmetic and accepted;
no whitespace cleanup is required for this publication pass.

## Scope and boundaries — original refactor (historical)

This source/test/documentation refactor removes reusable positive passwords and signing keys from the candidate publication tree. Credentials are generated with cryptographic randomness in process memory or required through explicit environment inputs. No dependency or lockfile changes were made by this pass. No clinical routing, authorization policy, MFA, schema or business logic was changed.

No Git staging/commit/push, history rewriting, key rotation, database connection, account password update, container operation, image change or global-tool modification was performed. Ignored secrets/environment files were not inspected. The running Vosk account and containers retain their current settings and prior login; new QA accounts use a fresh password per creation, with the same in-memory value used for their corresponding login.

Historical verification receipts remain historical: their recorded passwords are redacted, not their pass/failure facts. Earlier DB/browser passes do not verify this changed source. The already-published historical Google-key finding is not remediated by this pass; no assertion about its current validity is made.

## Current credential contracts

- `TEST_DATABASE_URL` is required for database-backed runs. The shared guard permits only protocol `postgresql:`, user `audit`, host `127.0.0.1`, port `55439`, database `medapp_audit`, and a privately supplied nonempty percent-encoded password. It rejects placeholders, missing passwords, alternate targets, normalization aliases, query/operator/search_path parameters and fragments without echoing the URL. Suites add their own random schema options only after validation. Existing SQL guards/role fixtures remain intact.
- CI uses the dedicated `TEST_DATABASE_PASSWORD` GitHub Actions repository secret for its service and job. The helper writes only the runner's ephemeral `GITHUB_ENV`, with URL encoding and no URL logging. **Repository-secret setup is pending owner action.** Fork PRs without secrets cannot satisfy the required integration matrix; no privileged-trigger or public-password workaround is added. Never use a production credential.
- New local Compose launches require `POSTGRES_PASSWORD`, `DATABASE_URL`, `JWT_SECRET` and `JWT_REFRESH_SECRET`. The URL must target the `postgres` service with the same percent-encoded password. Existing persisted database credentials are not changed by editing Compose. See [SETUP.md](../../SETUP.md).
- Missing nonproduction signing keys become independent random per-process values; restarts invalidate their old sessions. Production gets no random fallback, requires explicit strong distinct keys, and rejects example placeholders.
- Development seed creation requires explicit `SEED_PASSWORD` (12 characters minimum, 72 UTF-8 bytes maximum). It never prints the password and does not overwrite an existing account's password on conflict. Production seeding still fails before database work.
- Positive test registrations/login pairs use shared in-memory randomness. The case-sensitive bcrypt boundary fixture is still exactly 72 UTF-8 bytes and guarantees a distinct lowercase negative. Vosk QA uses fresh per-created-account passwords. Vitest disables dotenv-file loading, including early config imports.
- Deployment help prints only placeholders; it no longer writes or displays generated keys in a shared temporary file. Environment examples contain placeholders only.

## Intentionally retained synthetic vectors

- Empty/short passwords, wrong passwords, oversized ASCII/multibyte inputs and wrong-case login inputs test rejection, not usable account credentials.
- Wrong signing-key, malformed/corrupt token and provider-error markers are only negative verification/redaction inputs; they are not active signing keys or API credentials.
- Fake non-bcrypt `password_hash` strings in legacy SQL fixtures cannot authenticate. Those fixtures preserve migration/role semantics and are not converted into live users.
- Rejected development-key/short/equal-key configuration vectors remain necessary to prove production fails closed. Positive configuration keys are random.
- URL user-info on invalid destinations or disallowed browser origins tests refusal and is never used to connect. Documentation angle-bracket placeholders are not credentials.

## Verification for the original refactor (historical)

Initial checks: both application no-emit checks passed; 40 then-current release contracts and 50 backend units passed. Explicit test compilation caught three incomplete edits (missing helper import/URL declarations); the mocked audit suite exposed the same missing import. Those were corrected, not suppressed. The first explicit test compiler command also used CommonJS without JSX for the intentional backend-to-frontend render import; the corrected command uses ESNext/bundler resolution and JSX.

Final checks on Node **22.23.2**, with database credentials and image/browser opt-ins removed from child environments:

| Check | Result |
|---|---|
| All release/configuration contracts | **42/42 PASS**, no skips; includes ten new publication contracts |
| Backend unit suites | **51/51 PASS** (12 security + 39 configuration) |
| Audit observability suite with mocked DB/provider | **325/325 PASS**; this is not a real-DB integration pass |
| Frontend unit suites | **726/726 PASS**, 11 files, no skips |
| Backend and frontend application TypeScript no-emit | **PASS** |
| All backend test files + cross-workspace render import, explicit ESNext/bundler/JSX no-emit | **PASS** |
| Clinical browser fixture explicit TypeScript no-emit | **PASS**; no browser launched |
| Application source lint | **PASS** |
| Shell syntax only (application/deployment helpers) | **PASS**; scripts not executed |
| Structured candidate-tree secret-pattern scan | **0 matches**; ignored files and Git history not inspected |
| Positive credential assignment + PostgreSQL URL publication scans | **PASS**, value-free failure diagnostics; no fixed positive password/signing-key assignments or reusable DB URL credentials found |
| Actual Vosk `setup()` run twice with inert API/page stubs | **PASS**: distinct per-account passwords, registration/login match, no password returned; no running account accessed |
| Changed-file manifest and owned whitespace check | **49 distinct existing paths**, **8 newly added files**, no missing paths; **PASS** |

Full database-backed integration, real browser/Vosk recognition, fresh images and hosted CI were **not run in this original refactor pass**. MAIN's subsequent full-release DB/browser results are recorded in the [current final status](#current-final-publication-status); they do not imply a new dedicated Vosk-recognition or image-verification run. Database-backed runs require a separately authorized disposable DB with a fresh private runtime password; do not query existing databases for credentials or reuse a published password. Supply the URL through the private runtime environment without echoing it or passing secrets through the model. Hosted CI additionally needs the dedicated repository secret described above. Existing full-regression tasks that embed an old credential are not suitable for reuse; no ignored editor task/settings files were read or modified.

## Independent acceptance and final minor correction — 2026-09-22 (historical)

The independent publication evaluator reported **PASS** for the original **49-file
manifest** and **225 publishable candidates scanned**, with three nonblocking LOW
findings: stale public-credential statements in README, SETUP and OPERATIONS.
This is the evaluator's pre-correction acceptance, not a claim that this follow-up
reran that evaluation or the full application suite.

This seven-file follow-up corrects those statements and the Vosk launch prerequisite:
new Compose deployments require private `POSTGRES_PASSWORD`, `DATABASE_URL`,
`JWT_SECRET` and `JWT_REFRESH_SECRET` through the process environment or an ignored
root .env file. No usable credential values or echo commands are supplied. Existing
running containers, persisted settings and login remain unchanged; no restart,
credential rotation or account update was performed.

The root ignore rules now include `.env.*`, `!.env.example` and `!**/.env.example`.
Only example-named dotenv variants are eligible for tracking, and examples must
remain placeholder-only. Direnv configuration is not automatically secret, so
.envrc remains eligible. Source/fixtures are not broadly excluded; generated
model/worker ignore rules are unchanged. Ignore rules do not untrack previously
tracked files or remediate historical exposures.

| Follow-up path | Correction |
|---|---|
| [.gitignore](../../.gitignore) | Root/nested dotenv variants ignored; example exceptions preserved. |
| [README.md](../../README.md) | Remove stale public-credential claim. |
| [SETUP.md](../../SETUP.md) | Document four private inputs and environment/root dotenv provisioning. |
| [OPERATIONS.md](../../OPERATIONS.md) | Correct local Compose prerequisite; preserve current app/login. |
| [docs/VOSK_DICTATION.md](../VOSK_DICTATION.md) | New-launch prerequisite and no-restart boundary; earlier build evidence remains historical. |
| [tests/config-publication.test.mjs](../../tests/config-publication.test.mjs) | One narrow path-only ignore regression guard; no other test semantics changed. |
| [docs/verification/publication-secretminimization.md](publication-secretminimization.md) | Attributed acceptance and scoped follow-up results. |

Follow-up verification on **Node 22.23.2**:

- The new guard **failed before the ignore fix**, detecting the unignored root,
	backend, frontend and deeper dotenv variants; it **passes after the fix**.
- Root `test:release` command body (`node --test tests/config-*.test.mjs`):
	**43/43 PASS**, zero skips, including **11 publication contracts**. The earlier
	42-contract result above remains historical, not overwritten or added to this total.
	Only HOME/PATH were inherited by the test process; no DB/image/browser opt-ins.
- Git ignore probes use `--no-index` and path names only, including
	.env.production, backend/.env.test and frontend/.env.staging, root/nested examples,
	direnv configuration, source/fixture candidates and generated Vosk assets.
	They work for nonexistent paths without creating, reading or staging those files.
- Changed-document links: **120 local links / 12 heading anchors PASS** across five
	documents. All seven follow-up paths passed whitespace/terminal-newline checks;
	the original manifest remains **49 paths / 8 originally new files**.

No backend/frontend source, credential semantics, dependency/lockfile, generated
assets or build output was changed by this follow-up. No ignored private files
were read, no database or running service was accessed, and no build, full suite,
browser/image verification, staging/commit/push or credential rotation was run.
MAIN's separately authorized fresh-DB/full release work is not attributed here.

## Staged-scan follow-up — 2026-09-22 (historical)

MAIN's exact staged-snapshot Gitleaks **8.30.1** scan reported **10 findings**,
all under `generic-api-key`. Only location/rule metadata was taken from its
redacted report; no match values are reproduced here. Source inspection classified
the ten occurrences as follows, not as ten usable credentials:

| Count | Candidate | Classification and minimal correction |
|---|---|---|
| 6 | [API.md](../../API.md) | Incomplete JWT documentation examples replaced with opaque `<access-token>` / `<refresh-token>` placeholders. |
| 2 | [audit-references](../../backend/tests/audit-references.test.ts) and [audit-observability](../../backend/tests/audit-observability.test.ts) | False positives spanning a case label and a synthetic patient query, not token values. Rename only the labels to parameter terminology. |
| 1 | [Infrastructure decision](../decisions/0007-infrastructure-vendors.md) | Prose false positive. Reword required owner review/revocation/replacement while retaining unverified validity and the failing security gate. |
| 1 | [Quality audit](../../QUALITY_AUDIT.md) | Threat-model prose false positive. Change only the signed-out actor adjective; retain every asset, actor category and boundary. |

The synthetic distractor query and all password, clinical-body, token, URL,
audit/log/metric non-disclosure assertions are **unchanged**. No random token
substitution was needed because the flagged test fields were not credentials.
No tests were dropped or skipped and no ignore/allowlist rules changed.
Exact replacement checks against the supplied snapshot passed for all five files.
The original seven-file cosmetic follow-up was not broadened or normalized again.

Verification for this follow-up, on **Node 22.23.2**:

- Source contracts: **43/43 PASS**, zero skips. Command equivalent:
	`npm run test:release`.
- Mocked audit: **325/325 PASS**, zero skipped/pending tests. Command equivalent:
	`npm exec --workspace=backend -- vitest run tests/audit-observability.test.ts`.
	Only HOME/PATH were inherited; no database credentials or browser/image opt-ins.
- Both audit test files: explicit strict TypeScript no-emit **PASS**, targeting
	ES2022 for the existing test-library APIs. An initial ES2020-only compiler harness
	rejected existing `replaceAll` use; the harness was corrected, not the fixture.
- Pinned Gitleaks **8.30.1** candidate scan: **exit 0, 0 findings**, scanning only
	the five files above via individual read-only container mounts. The container
	used no network, no capabilities, a read-only root and disposable tmpfs;
	scanner output was captured with full redaction and only counts/metadata shown.
	Image digest: `sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f`.
	Earlier candidate attempts retained one threat-model prose finding; only the
	final corrected wording achieved zero. This is **not** an exact-index scan,
	a whole-tree scan, or a full-history scan.

The existing index and original snapshot/report were not modified by this
historical five-file follow-up. Its original ten-finding result is not
retroactively changed by the working-candidate pass. MAIN subsequently restaged
all 217 changes and completed the zero-finding exact-index scan recorded in the
[current final status](#current-final-publication-status). MAIN also completed
the fresh-private-DB full-release verification recorded there; it is no longer
pending. No database was started/queried or container credentials inspected by
this follow-up, and existing app/Vosk services and login were untouched.
No ignored secret reads, staging, commit, push, credential rotation or history
rewrite was performed by this follow-up or this documentation-only update.
Earlier passes remain valid only for their recorded scopes.

**Final pending status:** MAIN must stage and rescan this documentation update
before commit/push; **post-push verification is UNKNOWN**. Owner CI-secret setup
remains pending. Historical exposure review/remediation, authorized rotation and
a passing full-history rescan remain unresolved; the history security gate is
still **FAILED**, independent of the clean staged-snapshot result.

## Files changed by the original refactor

**49 files: 41 modified existing candidates and 8 new files.** This original manifest
is preserved for the evaluator's acceptance above; the seven-path follow-up is
listed separately. Neither list represents all pre-existing working-tree changes.

- [backend/src/config.ts](../../backend/src/config.ts)
- [backend/src/db/seed.ts](../../backend/src/db/seed.ts)
- [backend/.env.example](../../backend/.env.example)
- [backend/vitest.config.ts](../../backend/vitest.config.ts)
- [frontend/vitest.config.ts](../../frontend/vitest.config.ts)
- [docker-compose.yml](../../docker-compose.yml)
- [.github/workflows/verify.yml](../../.github/workflows/verify.yml)
- [app.sh](../../app.sh)
- [deploy.sh](../../deploy.sh)
- [backend/tests/api.test.ts](../../backend/tests/api.test.ts)
- [backend/tests/audit-observability.test.ts](../../backend/tests/audit-observability.test.ts)
- [backend/tests/audit-references.test.ts](../../backend/tests/audit-references.test.ts)
- [backend/tests/configuration.test.ts](../../backend/tests/configuration.test.ts)
- [backend/tests/database-operations.test.ts](../../backend/tests/database-operations.test.ts)
- [backend/tests/idempotency.test.ts](../../backend/tests/idempotency.test.ts)
- [backend/tests/pagination-render.test.ts](../../backend/tests/pagination-render.test.ts)
- [backend/tests/pagination-sequences.test.ts](../../backend/tests/pagination-sequences.test.ts)
- [backend/tests/pagination.test.ts](../../backend/tests/pagination.test.ts)
- [backend/tests/preflight-measurements.test.ts](../../backend/tests/preflight-measurements.test.ts)
- [backend/tests/session-lifecycle.test.ts](../../backend/tests/session-lifecycle.test.ts)
- [backend/tests/validation-routing.test.ts](../../backend/tests/validation-routing.test.ts)
- [backend/tests/helpers/auditDatabase.ts](../../backend/tests/helpers/auditDatabase.ts) — new
- [backend/tests/helpers/syntheticSecrets.ts](../../backend/tests/helpers/syntheticSecrets.ts) — new
- [backend/tests/helpers/environment.ts](../../backend/tests/helpers/environment.ts) — new
- [tests/audit-database.cjs](../../tests/audit-database.cjs) — new
- [tests/synthetic-secrets.mjs](../../tests/synthetic-secrets.mjs) — new
- [tests/configure-test-database.mjs](../../tests/configure-test-database.mjs) — new
- [tests/config-publication.test.mjs](../../tests/config-publication.test.mjs) — new
- [tests/release-runner.mjs](../../tests/release-runner.mjs)
- [tests/config-integration.test.mjs](../../tests/config-integration.test.mjs)
- [tests/config-release.test.mjs](../../tests/config-release.test.mjs)
- [tests/config-workflows.test.mjs](../../tests/config-workflows.test.mjs)
- [tests/config-guides.test.mjs](../../tests/config-guides.test.mjs)
- [tests/start-test-server.mjs](../../tests/start-test-server.mjs)
- [tests/evidence-safety.mjs](../../tests/evidence-safety.mjs)
- [tests/performance.mjs](../../tests/performance.mjs)
- [tests/e2e/clinical.spec.ts](../../tests/e2e/clinical.spec.ts)
- [tests/vosk-browser-qa.mjs](../../tests/vosk-browser-qa.mjs)
- [API.md](../../API.md)
- [SETUP.md](../../SETUP.md)
- [OPERATIONS.md](../../OPERATIONS.md)
- [docs/verification/FINAL_VERIFICATION.md](FINAL_VERIFICATION.md)
- [docs/verification/track-a-release.md](track-a-release.md)
- [docs/verification/track-d-idempotency.md](track-d-idempotency.md)
- [docs/verification/track-e-database.md](track-e-database.md)
- [docs/verification/track-f-pagination.md](track-f-pagination.md)
- [docs/verification/track-i-integration.md](track-i-integration.md)
- [docs/verification/track-l-image-security.md](track-l-image-security.md)
- [docs/verification/publication-secretminimization.md](publication-secretminimization.md) — new
