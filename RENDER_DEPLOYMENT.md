# Render deployment: engineering prerequisites and current configuration

> Do not deploy real ePHI until the unresolved controls in [QUALITY_AUDIT.md](QUALITY_AUDIT.md) are approved. This repository does not establish HIPAA compliance or eligibility of a particular Render/Google service or plan. Confirm the exact hosting/database/logging vendors, regions, contracts/BAAs and operational controls with qualified reviewers.

## Architecture

React/Vite static frontend → HTTPS Express API → PostgreSQL. Optional OCR executes on the API host. External Gemini note formatting is disabled by default. There is no managed queue, durable external audit sink, backup scheduler or tenant/care-team isolation in this repository.

## Build and start

Use the repository root and Node 22.12+ for both services; install using the **root** lockfile.

| Service | Build | Start / publish |
|---|---|---|
| Backend web service | `npm ci && npm run build --workspace=backend` | `npm start --workspace=backend` |
| Frontend static site | `npm ci && npm run build --workspace=frontend` | Publish `frontend/dist` |

Set `HOST=0.0.0.0` for the backend and use the platform-provided port. Use `/ready` for traffic readiness and `/health` for liveness. A successful static build is not a functional test.

## Backend environment

- `NODE_ENV=production`.
- `DATABASE_URL`: approved managed PostgreSQL connection with certificate-verified TLS. An internal URL alone is not proof of encryption. Never disable certificate verification to make a connection succeed.
- `JWT_SECRET` and `JWT_REFRESH_SECRET`: independent random secrets, each at least 32 characters, provisioned in the platform secret manager. No development defaults.
- `ALLOWED_ORIGINS`: the **exact HTTPS frontend origin**; comma-separate multiple known origins. Do not use regex/wildcard patterns or duplicate the variable.
- `ALLOW_SELF_REGISTRATION=false`; establish an approved account-provisioning process before use. There is no administrative enrollment UI or IdP integration yet.
- `SEED_DATABASE=false`. Production startup rejects seeding. **The public `/api/seed` endpoint has been removed.** Do not use the demo account to verify production.
- `ENABLE_EXTERNAL_AI=false`; do not provide a Gemini key until the exact provider/product and permitted PHI flow are approved. Approval is not established by an environment flag.
- `SESSION_TIMEOUT_MINUTES=15`; `DB_POOL_MAX=10` initially, subject to measured connection budget.
- `TRUST_PROXY_HOPS`: set only after verifying Render's actual proxy topology, forwarded-header handling and direct ingress restrictions. A guessed value can undermine rate limits.

See [OPERATIONS.md](OPERATIONS.md) for complete variable semantics and rollout requirements.

## Static frontend configuration

Set `VITE_API_URL` to the exact HTTPS API **origin**, without `/api`. It is embedded at build time. No backend secrets belong in `VITE_*` variables. If using a same-origin reverse proxy instead, leave the setting unset and explicitly route `/api` to the backend. Hostnames are no longer guessed.

Configure the static host's response headers: CSP restricted to the application and approved API origin, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, framing prohibition and an appropriate HTTPS/HSTS policy. The repository nginx configuration applies to the Docker frontend, **not automatically to Render Static Sites**. Verify actual headers after deployment.

## Database initialization and release

**Current integration supplement, 2026-09-20:** production startup performs a
read-only schema check, **not automatic initialization or migration**. It refuses
to listen unless exact versions **[1, 2, 3]**, required tables/columns and session/
actor+operation+key unique indexes are ready. A successful build is not a migration.

Use a separately approved **predeploy migration job** from the repository root
with the built backend and migration principal; do not give replicas DDL credentials.
The approved environment must inject `DATABASE_URL` with verified TLS and intended
schema/search_path. Do not paste production credentials into commands or this repo.

| Stage | Command (operator forms, not executed against Render) |
| --- | --- |
| Read-only preflight | `NODE_ENV=production npm run db:preflight -- --approved-production` |
| Explicit approved predeploy migration | `RELEASE_MIGRATION_APPROVED=true NODE_ENV=production npm run db:migrate -- --approved-production --confirm-migration` |
| Read-only schema verification, again after switching to runtime principal | `NODE_ENV=production npm run db:check -- --approved-production` |
| Normal start with runtime principal only | `npm start --workspace=backend` with `NODE_ENV=production` |

Set `RELEASE_MIGRATION_APPROVED=true` only on the migration job, not on the service.
Check/preflight require production approval flag but not that variable; migration
requires both flags and the exact environment value. Flags are acknowledgements,
not approval substitutes. If the selected platform plan lacks a suitable separately
controlled predeploy job, stop and arrange an approved release process; do not
append migrations to every replica's start command or switch to development mode.
No Render account/plan capability was verified in this pass.

Root scripts forward to backend compiled output under its dist/db directory;
`:source` equivalents use ts-node and are for installations with development tools,
not the production runtime image. See [complete command/layout and exit semantics](OPERATIONS.md#current-predeploy-cli-contract--2026-09-20).
Preflight exit 2 blocks, exit 3 requires review, and migration/schema failure exits 1.
Test both baseline and populated v2 upgrades on an approved clone. Initializer and
migrations are separate advisory-locked transactions; ALTER/non-concurrent index
operations can block. A v2 actor+operation+key collision across patients aborts v3
with aggregate-only diagnostics and preserves records. Pause keyed creation and
obtain human reconciliation; **never delete records, rewrite keys automatically,
forge version markers or reset the database to make deployment pass**.

Deploy frontend and backend together and require re-login. Retain v2/v3 ledger,
uniqueness and audit evidence through rollback; use compatible secure code or an
approved forward-fix/recovery plan. Old vulnerable authentication code is not a
safe rollback target. All Q1–Q7 approvals remain pending; see the
[overall ledger](docs/verification/IMPLEMENTATION_STATUS.md). Application container
pins and public registry proof are in [Track I](docs/verification/track-i-integration.md).

Back up to an approved encrypted location and restore into a separate non-production database before release. Assign retention, RPO/RTO and recovery owners. The successful synthetic restore in the audit is not evidence of configured Render production backups.

## Verification checklist

1. On Node 22.12+ (22 line), run root `npm ci` and the required `npm run verify:release` with the guarded synthetic `TEST_DATABASE_URL` from [SETUP.md](SETUP.md). Missing/unapproved test URLs fail; normal `npm test` excludes database integration and is not release evidence. See [track A evidence](docs/verification/track-a-release.md) for observed results and unexecuted hosted checks.
2. Verify HTTPS, database TLS, storage/backup encryption, private networking and least-privilege DB credentials in the actual environment.
3. Verify valid login, arbitrary/expired refresh rejection, logout revocation and denied cross-user private-template/appointment access using approved synthetic accounts.
4. Verify note revision conflicts, complete patient creation, audit metadata, readiness on DB failure, and alert routing.
5. Review the remaining shared-clinic PHI access model, browser token storage, asynchronous read-audit durability, vendor agreements and organizational policies before authorizing any real-data use.

Old cost estimates, free-tier production recommendations, wildcard origin examples and HTTP seed instructions in historical guides are superseded by this document. Confirm current platform capabilities directly; none were verified against a live cloud account during this audit.
