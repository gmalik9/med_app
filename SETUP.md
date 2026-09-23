# Setup and release commands — current contract

Use **Node 22.12+ on the Node 22 release line** and install with `npm ci` from the **repository root**. The root [package-lock.json](package-lock.json) is authoritative; do not install separately in the workspaces or regenerate the lockfile for script-only edits. PostgreSQL 15 and 17 are the CI compatibility targets, each in UTC and America/New_York. A configured matrix is not evidence of a successful hosted run.

Read [OPERATIONS.md](OPERATIONS.md) for the authoritative environment/security/rollout contract, [RENDER_DEPLOYMENT.md](RENDER_DEPLOYMENT.md) for Render configuration, and [QUALITY_AUDIT.md](QUALITY_AUDIT.md) for unresolved production blockers. This application is **not approved for real ePHI** by these instructions.

## Local synthetic development

1. Use a separate disposable local PostgreSQL database, never a retained clinical database. Supply its connection as `DATABASE_URL` through the process environment. **Development/test startup only** creates tables and applies additive migrations. Production startup performs read-only schema verification and requires an approved predeploy migration; see the CLI contract below.
2. Use `NODE_ENV=development`, `HOST=127.0.0.1`, `PORT=5000`, `ALLOWED_ORIGINS=http://localhost:5173`, `SEED_DATABASE=false`, and `ENABLE_EXTERNAL_AI=false`. Supply distinct local synthetic signing secrets. Do not load ignored secret files into tests.
3. Run `npm ci` and then `npm run dev`, both from the root. Vite serves the UI on port 5173 and proxies `/api` to loopback port 5000. Leave `VITE_API_URL` unset for this explicit dev proxy. `VITE_DEV_API_PROXY` changes only the development proxy target.
4. Local registration is enabled by default; create a unique synthetic account and synthetic records. There is no recommended shared/default login. Keep `ALLOW_SELF_REGISTRATION=false` on deployed healthcare instances; approved provisioning is still unresolved.

The local [docker-compose.yml](docker-compose.yml) is not a production template. Its loopback ports are for disposable synthetic data only; new launches require privately supplied `POSTGRES_PASSWORD`, `DATABASE_URL`, `JWT_SECRET` and `JWT_REFRESH_SECRET`, with no credential defaults. Supply them through the process environment or a private ignored root .env file, as detailed below. Do not attach a retained PostgreSQL volume to a different major version. The historical [app.sh](app.sh) and [deploy.sh](deploy.sh) helpers are not the supported release path; see [APP_MANAGER.md](APP_MANAGER.md). Never reset a volume to fix startup.

## Origins and secrets

- `ALLOWED_ORIGINS` is a comma-separated list of **exact origins**. Use HTTPS in production. No wildcards, credentials, paths, trailing slashes, query strings or fragments. CORS is not authorization.
- A separately hosted static frontend requires `VITE_API_URL` set to its actual HTTPS API origin **before building**, without `/api`. The application never guesses hostnames. Leave it unset only when an explicitly configured same-origin `/api` proxy exists. A static host alone does not provide that proxy.
- `VITE_*` values are public bundle content, never secrets. Provision independent random `JWT_SECRET` and `JWT_REFRESH_SECRET` values (at least 32 characters) with the approved backend secret manager.
- Production requires `DATABASE_URL`, certificate-verified database TLS, `NODE_ENV=production`, `SEED_DATABASE=false`, and normally `ALLOW_SELF_REGISTRATION=false` / `ENABLE_EXTERNAL_AI=false`. Do not bypass certificate verification or enable signup/AI to make a smoke test pass.
- `TRUST_PROXY_HOPS` defaults to 0. Set it only after verifying the ingress path, forwarded-header replacement, and denial of direct backend access.
- No public HTTP seed route exists. Local opt-in startup seeding can overwrite matching synthetic records; it is not part of this setup or any production release. Production rejects `SEED_DATABASE=true`.

## Unit-friendly versus required release verification

| Root command | Contract |
|---|---|
| `npm test` | Alias of `test:unit`; release contracts plus backend/frontend units; excludes database suites even when a test URL is set. Not release evidence. |
| `npm run test:unit` | Release/configuration checks, explicitly listed backend units, and frontend units. No database required. |
| `npm run test:release` | Dependency-free release prerequisite, documentation, and lock/manifest contract tests. |
| `npm run test:configuration --workspace=backend` | Isolated configuration tests; dotenv mocked, no DB connection. |
| `npm run test:integration` | All remaining backend suites, including API/migrations and session lifecycle. Missing or unapproved URL **fails**, never silently skips. |
| `npm run test:inventory` | Lists the unit/integration classification without connecting to a DB or running tests. |
| `npm run typecheck` / `npm run lint` | No-emit TypeScript checks / source lint. |
| `npm run verify` | Fail-fast DB prerequisite, types, lint, units, required integration, then both builds. |
| `npm run verify:release` | `verify`, browser tests, working-tree secret-pattern check, and low-threshold dependency audit. Requires a Playwright browser. |

The **only accepted release/integration URL shape** is `postgresql://audit:<test-database-password>@127.0.0.1:55439/medapp_audit`, assigned privately to `TEST_DATABASE_URL`. The angle-bracket text is a placeholder, not a usable credential. A nonempty, percent-encoded password is required; the exact protocol/user/host/port/database are fixed, and all query/search_path options, fragments and alternate targets are rejected. Locally, provision/authorize a disposable service separately with a fresh random password, then supply its connection URL through the environment without echoing it. These commands do not create/start/reset containers. Real-DB suites create random synthetic schemas; some retain evidence, others remove only their own newly created schemas. Never substitute production credentials or clean pre-existing schemas/volumes. Schema options are set internally only after validation. Connection failures fail integration.

CI requires a dedicated **`TEST_DATABASE_PASSWORD` GitHub Actions repository secret**, unrelated to any production credential. The PostgreSQL service and job use the same secret; `tests/configure-test-database.mjs` percent-encodes it into the runner's ephemeral `GITHUB_ENV` without printing the URL. CI setup is **pending until the owner configures that secret**; fork pull requests do not receive it and cannot pass required integration. Never use public run IDs, a published password, or `pull_request_target` as a workaround. Service identity remains `audit` / `medapp_audit`, mapping `55439:5432`.

For a **new local Compose deployment only**, privately supply `POSTGRES_PASSWORD`, `DATABASE_URL` (user `medapp`, hostname `postgres`, port `5432`, database `med_app_db`, same percent-encoded password), and independent random `JWT_SECRET` / `JWT_REFRESH_SECRET` (at least 32 characters each). Inject all four through the process environment, or privately populate the ignored root .env file that Compose loads automatically when invoked from the repository root. Do not echo, publish or stage the values; tracked environment examples are placeholders only. Compose has no credential fallbacks. Do not restart the current app or apply new settings to a running/persisted database without a separately authorized change. Existing running containers/accounts and their login remain unchanged; no credential rotation is part of this correction.

Development without explicit signing keys generates independent in-memory keys per process, so sessions do not survive a restart. Production requires explicit independent keys and rejects example placeholders. Explicit development seeding additionally requires `SEED_PASSWORD` (at least 12 characters, at most 72 UTF-8 bytes); it is never logged. Existing seeded accounts keep their passwords. Example environment files contain placeholders only, not values to copy unchanged.

## Database CLI and artifact contract

From the repository root, `npm run db:check`, `npm run db:preflight` and
`npm run db:migrate` forward to backend workspace scripts. Their `:source` variants
run the same CLI with ts-node, without a build. Compiled commands require the
coordinated `npm run build --workspace=backend` first; they execute
[backend/src/db/cli.ts](backend/src/db/cli.ts)'s emitted module under the backend
dist/db directory, not a root dist directory. Production images omit ts-node.
Do not use a stale existing dist as evidence for current source.

All CLI invocations require an explicitly injected `DATABASE_URL`; `NODE_ENV=test`
is rejected before connection. Production check/preflight require
`--approved-production`; migrate always needs `--confirm-migration`, and production
migration needs **both flags** plus exact `RELEASE_MIGRATION_APPROVED=true`.
Root argument forwarding uses `npm run db:check -- --approved-production` (and the
equivalent preflight/migrate flags). Exit 0 is clear/ready/complete, 1 is execution
or approval failure, 2 is a preflight blocker, 3 requires human review. None grants
release approval. See [the complete predeploy runbook](OPERATIONS.md#current-predeploy-cli-contract--2026-09-20)
for baseline/v2 upgrade, collision abort, separate principals and no-delete rollback.

The [current ledger](docs/verification/IMPLEMENTATION_STATUS.md) supersedes old totals
as a status index, without erasing historical results. Q1–Q7 remain pending; no
combined release count or J browser pass is claimed here.

For full release verification, install the lockfile-pinned Playwright browser with `npm exec -- playwright install chromium` in a suitable environment, then run `npm run verify:release` with the guarded URL. On the audited older macOS host, `PLAYWRIGHT_CHANNEL=chrome` used installed Chrome; host Node 20 results are supplemental, not the supported Node 22 baseline.

## Release evidence and rollback

Hosted verification must exercise Node 22, PostgreSQL 15/17, UTC/non-UTC, browser workflows, real served frontend headers/proxy behavior, migration reruns and a synthetic restore drill. Branch-protection configuration and observed workflow results remain repository-owner tasks. See [docs/verification/track-a-release.md](docs/verification/track-a-release.md) for actual results and explicit gaps, not assumed passes.

Review encrypted backup/restore evidence, migration locking, private networks, least-privilege DB roles and enrollment/access policies before any deployment. Coordinate backend/frontend rollout and require re-login. Never roll back to the old vulnerable refresh endpoint, enable seed/signup, or delete retained records as a rollback strategy. No hosting plan, including a free plan, is approved by this repository.
