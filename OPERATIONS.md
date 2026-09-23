# Verified setup and release runbook

This document and [QUALITY_AUDIT.md](QUALITY_AUDIT.md) supersede older deployment/security claims. The application is **not approved for production ePHI** by this audit. Complete the access-model, vendor, encryption, audit-retention and operational decisions first.

**SECURITY GATE FAIL — OWNER ACTION REQUIRED.** The pinned Gitleaks 8.30.1 all-ref
redacted scan reports **51 commits / eight findings / exit 1**: two historical
locations of one Google-key-shaped value, six truncated JWT examples. Credential
validity/revocation is **UNVERIFIED**. K's independent artifact-scoped triage PASS,
working-tree pattern scan0, npm audit0 and fresh image HIGH/CRITICAL0 are **not
full-history PASS**. The 51 scanned versus 53 reachable count remains unreconciled,
not proof of missing commits. Follow [owner-controlled remediation](docs/verification/history-secret-findings.md#owner-controlled-incident-and-remediation-plan):
preserve evidence, establish ownership/use, authorize containment/rotation/revocation
and coordinated repository remediation, then rerun/review the pinned full-history
gate. Do not test exposed values, add ignores, skip history, rewrite it or rotate
credentials without approval. No such actions were performed in this verification.
Ignored live environment/secret files were not read by the final coordinator.

Current local matrix, independent A–L dispositions, qualified image/SBOM evidence
and remaining Q1–Q7/hosted-CI/CodeQL/branch-protection blocks are recorded in
[FINAL_VERIFICATION.md](docs/verification/FINAL_VERIFICATION.md). Local success is
not cloud/TLS/vendor or production authorization. No real PHI/live AI was used.

## Local development / verification

- Use Node 22.12+ (Node 22 is used in images and CI). Final MAIN matrix tests used **22.23.2**; the initial audit host's Node 20.20 result is historical, not the supported production baseline.
- Install from the repository root with `npm ci`. The root lockfile is authoritative; the stale nested backend lockfile was removed.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, or `npm run verify`.
- Required integration **fails without an approved `TEST_DATABASE_URL`**, never accepts skips as success. The only accepted shape is `postgresql://audit:<test-database-password>@127.0.0.1:55439/medapp_audit`; supply a private nonempty percent-encoded password, no query parameters or fragments. Verify CI needs **no repository database secret**: after checkout/Node setup it generates and masks a fresh 32-byte random password, starts only a pinned job-owned disposable PostgreSQL container at `127.0.0.1:55439:5432`, and privately exports the guarded URL. Its `always()` cleanup validates ownership and removes only that container; existing containers/volumes are untouched. See [CI provisioning, cleanup and evidence](docs/verification/ci-database-fix.md). Suites isolate fresh synthetic schemas; some retain evidence and others remove only their own new schema. Never clean pre-existing schemas/volumes. `npm test` / `test:unit` exclude DB suites; [SETUP.md](SETUP.md) and [Track I](docs/verification/track-i-integration.md#suite-classification) define every bucket.
- `npm run test:e2e` requires `TEST_DATABASE_URL`, a prior build, and a Playwright browser (`npx playwright install chromium`). On the audited macOS 13 host, bundled Chromium was unsupported; `PLAYWRIGHT_CHANNEL=chrome` used installed Chrome with a fresh temporary profile.
- `node tests/performance.mjs` uses the same guarded test URL and creates 10,000 synthetic patients and 50,000 notes. Do not point it at production or expose the test server externally.
- `node tests/check-secrets.mjs` scans working-tree structured secret patterns, without printing values. It is not a full-history/high-entropy scanner.
- [docker-compose.yml](docker-compose.yml) is **local-only**, with loopback published ports and no credential defaults. New launches require private `POSTGRES_PASSWORD`, `DATABASE_URL`, `JWT_SECRET` and `JWT_REFRESH_SECRET` through the process environment or a private ignored root .env file; see [SETUP.md](SETUP.md) for the matching database URL and signing-key requirements. Never use it as production infrastructure. After provisioning those inputs for a new deployment, `npm run docker:up` runs PostgreSQL 15, the API and nginx. Existing running containers/logins are unchanged; do not restart them or rotate credentials for this documentation correction. Do not attach an existing PostgreSQL volume to a different major version. The isolated audit used PostgreSQL 17 separately.
- Native dev frontend proxies `/api` to `127.0.0.1:5000`. `VITE_DEV_API_PROXY` can override the development target. Docker nginx proxies `/api` to the backend. No hostname guessing is performed.
- Demo seed remains opt-in at local startup (`SEED_DATABASE=true`) and can overwrite matching demo notes; use only disposable synthetic databases. There is **no HTTP seed endpoint** and production seeding is rejected.
- The historical shell managers contain destructive `clean`/`rebuild` operations. Do not use them on data that must be retained; do not run them as production deployment automation.

## Environment contract

| Variable | Meaning / safe deployment requirement |
|---|---|
| `NODE_ENV` | `production` enables fail-closed startup checks and disables signup by default. |
| `HOST`, `PORT` | Host defaults to loopback; containers set `HOST=0.0.0.0`. Native port defaults to 5000. |
| `DATABASE_URL` | Required in production. Use provider-approved **certificate-verified TLS** configuration (e.g. `sslmode=verify-full` and trusted CA). The repository cannot prove provider storage/network encryption. Never use `rejectUnauthorized=false`. |
| `DB_POOL_MAX` | Default 10, allowed 1–100. Budget total connections across replicas and migration processes. |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Separate randomly generated secrets, at least 32 characters. Unset development keys are ephemeral per process; production requires explicit keys and rejects placeholders. Store in an approved secret manager; do not put keys in image layers or frontend settings. |
| `ALLOWED_ORIGINS` | Comma-separated exact origins, HTTPS in production; no wildcard or regex syntax. No trailing paths/slashes. CORS is not authorization. |
| `TRUST_PROXY_HOPS` | Default 0. Set only after verifying ingress overwrites forwarded headers and direct backend access is prevented. A wrong hop count permits spoofing or groups all users under one limit. |
| `SESSION_TIMEOUT_MINUTES` | Default 15, range 1–480. Server enforces inactivity on the exact session; frontend independently clears its view after 15 minutes of no interaction. |
| `ALLOW_SELF_REGISTRATION` | Defaults false in production. Keep false for healthcare use; provisioning must use an approved admin/IdP process (not implemented). Explicitly enabling it grants shared-clinic access to every registrant. |
| `ENABLE_EXTERNAL_AI` | Defaults false. Set true only after legal/privacy/security approval of the exact provider/product/contract, retention/training configuration and permitted data types. A flag is not a BAA or compliance certification. |
| `GEMINI_API_KEY` | Backend-only secret; never `VITE_*`. Sent as a header, not a URL parameter. Clinical text still leaves the application when enabled. |
| `SEED_DATABASE` | Must be false/unset in production; true causes production startup to fail. |
| `VITE_API_URL` | For a separate static frontend, explicit HTTPS backend **origin**, no `/api` suffix. Otherwise leave unset and provide a same-origin `/api` reverse proxy. Build-time setting; changing it requires rebuilding. |

## API changes for clients

- Calendar dates use `YYYY-MM-DD`; impossible dates are rejected (400), never silently replaced with today.
- Note GET/save includes `revision`. Send `expectedRevision=0` for a new note, and the last received revision for an update. Conflict returns 409; retain the draft, reload in another view, reconcile deliberately. No automatic overwrite/retry.
- Refresh now rotates tokens. Persist both returned tokens and serialize refresh requests; replay of the old token is rejected.
- Logout revokes the exact session with a valid access bearer or signed unexpired refresh credential. Refresh possession can revoke after rotation or access expiry; it cannot issue tokens without the current refresh hash. If both credentials are supplied, they must identify the same user/session. See [current auth details](AUDIT_API_INVENTORY.md#current-authentication-and-retry-contracts--2026-09-20). Legacy tokens issued before this release are invalid: **all users must sign in again**.
- Patient creation accepts all demographics/clinical fields in one transaction. Omitted DOB on update is preserved; explicit `null` clears it.
- Directory and note/vitals/appointments/visits histories now return bounded cursor pages with `hasMore`/`nextCursor`; directory retains legacy offset only without a cursor. Visit `filter=all|upcoming` is bound into its cursor. Dashboard/upcoming/today/trends/templates remain bounded summaries, not complete exports. See [pagination models](AUDIT_API_INVENTORY.md#current-pagination-models--2026-09-20).
- Vitals, appointment and visit creation accept an optional strict UUID-v4 `Idempotency-Key`; actor+operation+key is the namespace, patient is payload. Same intent replays the same resource's **current** representation; changed payload/patient returns 409. Preserve keys through ambiguous failures; do not automatically issue a fresh key or delete the ledger.
- `vitalSigns` is the vitals response key. Numeric measurements must be JSON numbers, in UI-labelled Celsius, bpm, mmHg, %, kg, cm units.
- Appointment statuses: `scheduled`, `completed`, `cancelled`, `no-show`; only the assigned doctor can change status.
- Error responses are generic `{error}`; server stdout uses request IDs, method, status and duration, not bodies or raw URLs.

## Migration and release safety

1. Back up using an approved encrypted destination; verify restore before release. Test a clone of the real schema/data for compatibility—synthetic verification is not sufficient for legacy production data.
2. Production startup **does not run DDL or migrations**. Run one explicitly approved predeploy CLI migration job with a separate migration principal. Initializer and versioned migration transactions are advisory-lock serialized but separate; indexes/ALTERs may block traffic. Follow the current contract below.
3. Readiness requires exact versions **[1, 2, 3]**, required tables/columns and structurally valid session/idempotency unique indexes in the selected schema. Migration 1 adds session UUID keys/revisions/indexes/retention defaults; 2 adds the durable clinical-write ledger; 3 adds actor+operation+key uniqueness while retaining v2 records and primary key. No purge or patient reassignment is authorized.
4. Deploy frontend and backend together because note revisions and rotating refresh are contract changes. Require re-login. Do not roll back to the old vulnerable refresh endpoint.
5. Probe `/health` (process liveness) and `/ready` (database readiness). Check login, authorized/denied access, a synthetic note save and conflict, safe audit events, and request metrics.
6. Verify HTTPS/HSTS at ingress, DB TLS/certificates, encryption at rest/backups, private networks, least-privilege runtime DB role (separate migration role), resource budgets, shared rate limiting, and alert delivery.
7. Do not assume startup completes after a DB outage: startup is fail-fast and relies on the orchestrator restart policy. Runtime reconnection was tested locally. Configure controlled restart/backoff and readiness-based routing externally.

## Current predeploy CLI contract — 2026-09-20

This section supersedes historical automatic-production-initialization advice.
Development/test bootstrap still initializes/migrates; do not use that mode to
bypass production readiness. [Track E](docs/verification/track-e-database.md)
documents the implemented checks and role templates. [Track D](docs/verification/track-d-idempotency.md)
documents v2/v3 preservation and retry semantics. All Q1–Q7 decisions remain blocked.

### Artifact and command forms

Build once in the coordinated release job from the root with
`npm ci && npm run build --workspace=backend`. The backend compiler maps its src
root to its dist directory; the CLI is emitted under backend dist/db and startup
under backend dist. Root wrappers forward commands and flags into that workspace.
The runtime Docker image keeps this layout under /app, uses the compiled CLI,
and does not contain ts-node/dev dependencies. **L also removed global npm/npx,
Yarn and Corepack launchers/trees/caches after the production install.** The npm
commands below are for repository/host release installations, **not inside the
final runtime image**. Build-stage/host npm remains available; do not reinstall
package managers into the runtime image. No root-level dist entrypoint exists.
`:source` scripts execute the same [CLI source](backend/src/db/cli.ts) using ts-node
in a development installation; do not install dev tools into production to run it.

The approved environment must already inject `DATABASE_URL` (certificate-verified
TLS and the intended schema/search_path). No literal production URL is shown or
loaded from a secret file by these instructions. The CLI refuses a missing explicit
URL and `NODE_ENV=test` before import/connection. Use separate migration/runtime
principals; do not leave migration credentials, role membership or the release
approval variable on replicas. Flags acknowledge intent; they do not grant approval.

| Phase, from repository root outside the runtime image | Compiled release command | No-build source equivalent |
| --- | --- | --- |
| Read-only preflight with approved principal | `NODE_ENV=production npm run db:preflight -- --approved-production` | `NODE_ENV=production npm run db:preflight:source -- --approved-production` |
| One approved migration job | `RELEASE_MIGRATION_APPROVED=true NODE_ENV=production npm run db:migrate -- --approved-production --confirm-migration` | `RELEASE_MIGRATION_APPROVED=true NODE_ENV=production npm run db:migrate:source -- --approved-production --confirm-migration` |
| Schema verification, repeat after switching to runtime principal | `NODE_ENV=production npm run db:check -- --approved-production` | `NODE_ENV=production npm run db:check:source -- --approved-production` |
| Launch built backend with runtime credentials only | `NODE_ENV=production npm start` | Not a production source-launch workflow |

Direct workspace forms remain valid in the repository/host installation: e.g.
`NODE_ENV=production npm run db:check --workspace=backend -- --approved-production`.
Nonproduction migration still requires `--confirm-migration`; production migration
also requires exact `RELEASE_MIGRATION_APPROVED=true` and `--approved-production`.
Check/preflight and production boot do not require the approval variable.

### Runtime image direct Node commands

From the image's existing `/app` working directory, use the compiled Node CLI:

| Operation | Command inside the image (or command arguments after its image name) |
| --- | --- |
| Read-only preflight | `node backend/dist/db/cli.js preflight --approved-production` |
| Single explicitly approved predeploy migration | `node backend/dist/db/cli.js migrate --approved-production --confirm-migration` |
| Read-only schema verification | `node backend/dist/db/cli.js check --approved-production` |
| Normal production startup | Default CMD: `node backend/dist/index.js` |

Inject approved `DATABASE_URL` and `NODE_ENV=production` through the deployment's
approved secret/environment mechanism. Migration additionally requires exact
`RELEASE_MIGRATION_APPROVED=true`, **both flags**, and a separate privileged migration
principal. No literal production URL/secret is supplied here. Verify schema again
with runtime credentials, and **omit migration credentials/role membership and the
approval variable from normal startup**. Flags acknowledge approved intent, not
authorization to migrate a real database. Do not use `npm start`, `npm run db:*`,
ts-node, package installation or source mounts inside this image.

MAIN exercised direct Node migration and startup against a new synthetic PG17 schema;
independent L also exercised approval refusals/read-only checks and a PG15 smoke.
Normal startup did not migrate. Health/readiness200, proxied patient401/signup403,
nonroot UIDs1000/101 and graceful exit0 are **local evidence only**; see
[final runtime evidence](docs/verification/FINAL_VERIFICATION.md#image-runtime-and-sbom-evidence).
Fresh scans report no HIGH/CRITICAL findings, but lower severities were not scanned
and Alpine3.24's EOL-list warning limits coverage. Do not equate that with production
security clearance or full offline OCR support.

### CLI exit codes

Exit codes: **0** clear/ready/migration complete, **1** usage/approval/connectivity/
schema/execution failure, **2** preflight blocker, **3** preflight needs review
(including legacy wall-time provenance). Do not blanket-ignore 2/3 or mark them
release passes. Preflight emits only invariant names, decimal counts and severity;
it does not repair data or prove the real schema is safe for migration.

### Approved sequence, baseline/v2 collision handling and rollback

1. Obtain organizational change approval, encrypted backup/isolated restore and
	clone compatibility evidence. Review roles, PUBLIC CREATE/TEMP, ownership,
	inherited privileges, security-definer functions and grants with the DBA.
	Local E tests still observed PUBLIC TEMP; universal runtime DDL denial is not
	established. Templates are manual proposals, not already-applied infrastructure.
2. Preflight the intended baseline/existing v2 schema, review count-only blockers
	and legacy timestamp provenance. Do not create a new empty schema to conceal an
	existing deployment, invent a v3 marker, coerce measurements or assume UTC.
3. Drain traffic as approved; run a single migration job. Session try-lock 73410292
	serializes the CLI lifecycle; transaction lock 73410291 remains in initializer/
	migrations. Budget the extra lock connection; do not break another migrator's
	lock. Non-concurrent indexes/ALTERs can block and time out. Baseline initialization
	can commit before the migration transaction fails: keep traffic gated and diagnose.
4. Existing v2 keys colliding across patients under actor+operation+key **abort v3**.
	Preflight reports collision groups/rows; the CLI emits fixed
	`database_migration_blocked` / `idempotency_scope_collisions` and aggregate counts,
	exits 1, and does not report completion. The locked check is authoritative, not
	an earlier read-only snapshot. Pause keyed creation and arrange approved human,
	record-preserving reconciliation. **Do not delete records, rewrite keys, choose
	an automatic winner, erase version rows or force startup.** Repeated attempts
	remain blocked until that approved process resolves ambiguity.
5. Verify [1, 2, 3] plus required objects/indexes, review grants, switch to the runtime
	principal, rerun `db:check`, then start replicas. Verify actual denied DDL, allowed
	DML/atomic audit and readiness with that login; a marker alone is insufficient.
6. Coordinate clients and re-login. Roll back only to secure code compatible with
	retained v1/v2/v3 schema and key uniqueness. No down migration or ledger/audit/
	clinical deletion is supplied. Forward-fix or restore only under an approved
	recovery plan with post-backup-write reconciliation; never the vulnerable refresh
	implementation. Shared-clinic, retention, cookie/identity and vendor policies
	still require the approvals in the [overall ledger](docs/verification/IMPLEMENTATION_STATUS.md).

## Backup / restore / incident operations

The audit streamed `pg_dump -Fc` from an isolated synthetic database into a **different** restore database using `pg_restore --exit-on-error`; 60 tables/60,562 rows had identical counts and row-content checksums. This proves that test snapshot restored, **not** that production backups exist or are encrypted/recoverable.

Before production, assign owners and approved RPO/RTO, backup cadence, encrypted off-host location, retention/legal hold, access controls, restore isolation and validation, and periodic restore drills. Do not store unencrypted ePHI dumps in this repository or CI artifacts. Restore tests must not send restored PHI to AI, email, analytics or other external services.

Investigate `audit_write_failed`, `database_pool_error`, sustained 401/429/5xx, readiness failures and latency. Mutating clinical records and their success audit commit atomically; request/read audit events are asynchronous and may be lost on abrupt crash. Durable external tamper-resistant audit retention and alert routing are still required.

If prior releases handled real data, assess historical credential/PHI-containing audit rows and default/demo account exposure. Do not purge evidence or rotate credentials automatically without an authorized incident/retention plan. Follow the organization's incident response and legal notification process.
