# Current verification and deployment guidance

Read [QUALITY_AUDIT.md](QUALITY_AUDIT.md), [OPERATIONS.md](OPERATIONS.md), and [RENDER_DEPLOYMENT.md](RENDER_DEPLOYMENT.md) before use. They supersede historical setup, seeding and security claims below and in older summary guides. The application has been locally hardened and tested, but is **not established as production-ready for ePHI or HIPAA compliant**. Public HTTP seeding was removed; production signup and external AI default off. Use the root lockfile and Node 22.12+.

# Medical Notes

A React/TypeScript frontend and Express/PostgreSQL backend for synthetic verification of patient, note, vital, appointment, visit and template workflows. Prior blanket claims of field encryption, complete access auditing, full RBAC and production readiness are retired; see the audit for observed controls and remaining gaps.

## Start here

Follow [SETUP.md](SETUP.md), the current command contract. Use **Node 22.12+ on the Node 22 line** and run `npm ci` once at the **repository root**. Do not install in each workspace. PostgreSQL 15/17 and UTC/America/New_York are CI targets, not an assertion that every combination has run remotely.

For disposable local development, supply explicit synthetic backend environment settings and run `npm run dev` at the root. The frontend on port 5173 uses the configured `/api` development proxy to port 5000. Create a unique synthetic account; there is no recommended shared/default login. Do not connect development or test tools to retained clinical data.

## Configuration boundaries

- Backend `ALLOWED_ORIGINS` accepts comma-separated **exact origins**, HTTPS in production. No wildcards, credentials, query strings, fragments, paths or trailing slashes.
- A separately hosted frontend needs an explicit build-time `VITE_API_URL` containing the actual HTTPS API origin without `/api`. Leave it unset only with a deliberately configured same-origin `/api` reverse proxy. Hostnames are never guessed.
- Backend secrets must not appear in `VITE_*` settings. Use separate random signing secrets of at least 32 characters; deployment requires certificate-verified DB TLS and reviewed infrastructure controls.
- Keep deployed `SEED_DATABASE=false`, `ALLOW_SELF_REGISTRATION=false` and `ENABLE_EXTERNAL_AI=false`. There is no public HTTP seed endpoint. Approved enrollment is unresolved, not a reason to expose signup or demo accounts.
- Local [docker-compose.yml](docker-compose.yml) is for disposable synthetic data, not production. New launches require privately supplied `POSTGRES_PASSWORD`, `DATABASE_URL`, `JWT_SECRET` and `JWT_REFRESH_SECRET`, with no credential defaults; use the process environment or a private ignored root .env file as described in [SETUP.md](SETUP.md). Existing running containers and logins are unchanged. Do not delete/reset retained volumes or use legacy helper scripts as deployment automation.

## Verification

### Integration supplement — 2026-09-20

The [overall implementation ledger](docs/verification/IMPLEMENTATION_STATUS.md)
separates historical, implementer and independent evidence for tracks A–H.
[Track I](docs/verification/track-i-integration.md) records integration contracts
and registry-verified application image pins. Final combined release results and
J's browser evidence are **pending**, not inferred from earlier totals.

Production boot performs **read-only** schema verification requiring versions
**[1, 2, 3]** plus required objects/unique indexes. It never initializes/migrates.
An approved predeploy migration job is mandatory before starting replicas; see
[OPERATIONS.md](OPERATIONS.md#current-predeploy-cli-contract--2026-09-20).
Root `db:check`, `db:preflight`, `db:migrate` commands use the compiled backend;
`:source` variants require development tooling. Approval flags are not authorization.
All Q1–Q7 decisions remain blocked; local safeguards do not establish HIPAA readiness.

| Command (repository root) | Purpose |
|---|---|
| `npm test` | Alias of `test:unit`, including release contracts; database suites excluded, not release evidence. |
| `npm run test:unit` | Release contract checks plus backend/frontend unit suites, no DB required. |
| `npm run test:integration` | Required API/migration suite; absent/unapproved `TEST_DATABASE_URL` fails clearly. |
| `npm run test:inventory` | Read-only suite classification; no DB connection or tests executed. |
| `npm run typecheck` / `npm run lint` | No-emit checks / source lint. |
| `npm run verify` | Guarded types, lint, units, required integration and builds. |
| `npm run verify:release` | Adds browser tests, working-tree secret-pattern check and dependency audit. |

The guarded synthetic URL, browser prerequisites, new-schema behavior and no-concurrent-build rule are in [SETUP.md](SETUP.md). [Track A release evidence](docs/verification/track-a-release.md) records actual commands/results and unexecuted hosted checks. A skipped integration suite is **not** a release pass.

## Documentation

- [OPERATIONS.md](OPERATIONS.md): environment, migration, backup/restore and incident contract.
- [RENDER_DEPLOYMENT.md](RENDER_DEPLOYMENT.md) / [RENDER_QUICK_START.md](RENDER_QUICK_START.md): explicit separate-service configuration; no plan/vendor is preapproved.
- [AUDIT_API_INVENTORY.md](AUDIT_API_INVENTORY.md): current API/auth boundaries and limitations.
- [QUALITY_AUDIT.md](QUALITY_AUDIT.md) / [HARDENING_PLAN.md](HARDENING_PLAN.md): evidence, decisions and remaining work.
- [INDEX.md](INDEX.md): navigation and retired guide entrypoints.

Current shared-clinic record access, browser-readable token storage, asynchronous read auditing and incomplete identity/retention/infrastructure policies remain material production blockers. A workflow file, passing local test or vendor marketing statement is not ePHI authorization or compliance certification.
