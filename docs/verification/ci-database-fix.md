# CI-A — ephemeral Verify database provisioning

## Observed failure and scope

GitHub run **35819755428**, September 23, 2026: all four PostgreSQL 15/17 ×
UTC/America_New_York Verify jobs failed during **Initialize containers**, before
checkout or any test step. The public redacted log for job **107048887079**
reports an uninitialized database with no nonempty `POSTGRES_PASSWORD`.
The workflow referenced an unset repository secret. This was not a test failure.

This change removes that prerequisite without publishing a credential or adding
an owner-secret setup dependency. It changes only Verify provisioning, its
contract tests, and current setup guidance. No application authentication,
production credentials, existing containers, security workflow, history scan
exceptions, commit or push are part of CI-A.

## Interfaces and safety boundaries

- [Verify workflow](../../.github/workflows/verify.yml): after pinned checkout and
  Node 22 setup, `node tests/ci-database.mjs start`; after the required release
  checks, `if: always()` runs `node tests/ci-database.mjs cleanup`.
- [Runtime helper](../../tests/ci-database.mjs) exports `startCiDatabase(env, hooks)`
  and `cleanupCiDatabase(env, hooks)` for inert tests. CLI accepts only `start` or
  `cleanup`, without arbitrary flags, image arguments or configuration files.
- Inputs: exact `EXPECTED_PG_MAJOR` (`15` or `17`), `CI_DATABASE_IMAGE` (the matching
  pinned OCI index), `EXPECTED_PG_TIMEZONE` and matching `TZ` (`UTC` or
  `America/New_York`), numeric `GITHUB_RUN_ID`/`GITHUB_RUN_ATTEMPT`, exact
  `GITHUB_JOB=required-integration`, absolute `RUNNER_TEMP`, and absolute
  `GITHUB_ENV` for startup. PR actor, labels, arbitrary URLs and supplied database
  credentials never choose Docker resources. Ordinary `pull_request` stays
  unprivileged, with read-only repository permissions and no repository secrets.
- Names: `medapp-ci-audit-<run>-<attempt>-<major>-<utc|ny>-<24-random-hex>`.
  A separate random ownership label must match before removal by full immutable
  container ID. IDs and labels are resource metadata, not passwords.
- The exclusive mode-0600 ownership receipt is named **medapp-ci-database.json**
  inside `RUNNER_TEMP`. It contains version, identity, name and owner label only,
  never a password or URL. Existing receipts are not overwritten; malformed,
  symlink, cross-job and ownership-mismatched receipts fail closed. An absent
  receipt is an idempotent no-op. Failed cleanup retains its receipt for retry.
- Password: `randomBytes(32).toString('hex')` in-process for every launch; GitHub
  `::add-mask::` is registered before any use. Docker receives `--env
  POSTGRES_PASSWORD` with the value only in the child's environment, never argv.
  No credential is returned or written to `GITHUB_OUTPUT`, logs or artifacts.
- [URL writer](../../tests/configure-test-database.mjs) keeps manual compatibility:
  an explicitly supplied private `TEST_DATABASE_PASSWORD` plus `GITHUB_ENV`.
  It percent-encodes the password, validates the unchanged
  [strict audit guard](../../tests/audit-database.cjs), masks raw/encoded password
  and URL, then appends exactly one environment line, refusing symlink targets.
  Integration still rejects all alternate protocols/users/hosts/ports/databases,
  missing passwords, query parameters, fragments and line injection.
- Docker is invoked without a shell, only the allowlisted pinned image, fixed
  commands and validated tokens. Port is exactly `127.0.0.1:55439:5432`; host
  authentication is SCRAM, never trust. The container has CPU/memory/PID limits,
  disabled Docker log storage, and a fresh bounded tmpfs data directory, with no
  named/bind/persistent volume and no existing application network attachment.
- Readiness: fixed TCP `pg_isready -h 127.0.0.1` (not the temporary init server's
  Unix socket), Docker health interval 1 second/retries 60,
  at most 60 status-only checks with Node timers and a 90-second deadline; Docker
  launch/pull has a 120-second timeout and metadata/removal calls 10 seconds.
  SQL matrix metadata is still checked by the existing release step. No full
  environment inspection, health log dump or PostgreSQL log dump is performed.
- Startup failure or SIGINT/SIGTERM attempts immediate owned cleanup. The
  workflow's `always()` step retries after subsequent failures/cancellation.
  This is best-effort: forced runner destruction, SIGKILL or Docker failure can
  prevent cleanup; receipt retention allows a same-job safe retry while the
  runner remains available. Nothing prunes unrelated containers or volumes.

## Local verification

[Inert tests](../../tests/config-ci-database.test.mjs) cover fresh distinct
credentials, mask ordering, private URL writes, injection/allowlist rejections,
bounded health, failed/partial launches, cancellation, ownership mismatch,
existing-resource preservation, redacted errors and cleanup retry. They require
no Docker and are included automatically by `npm run test:release`.

[Disposable matrix probe](../../tests/ci-database-probe.mjs) is opt-in, never a
default test: `CI_DATABASE_PROBE=disposable-local-only node
tests/ci-database-probe.mjs`. It requires free loopback port 55439 and Docker,
uses the actual start/cleanup CLI in separate processes for all four pinned
cells, captures masking commands only in memory, checks private environment
permissions, authenticates SQL, rejects a different random password, creates and
removes only a new synthetic schema, and compares existing container IDs/states
and volume names before/after. Never stop another service to run it.

Observed locally on September 23, 2026 with **Node 22.23.2**:

- Focused contracts: **42/42 passed**, zero skips/failures (including 16 new
  inert provisioning tests). Backend and frontend `tsc --noEmit`: passed.
- Full `npm run test:unit`: passed, including **67 release/configuration
  contracts** in the combined working tree (including CI-B's new tests),
  **51 backend units** and **726 frontend units**. Includes Vosk tooling tests
  using `python3` without fetching a model.
- Direct no-emit type checks of all backend test/helper and eight-case E2E
  sources: passed (ESNext/bundler, ES2022, React JSX, Node/Vite types).
- Real separate-process startup/cleanup probe: **4/4 matrix cells passed** on
  Docker 28.5.1, including authenticated SQL and wrong-password rejection,
  guarded private URL/masks, isolated writes, and owned cleanup. Existing
  container identities/states and volume names compared equal before/after;
  no probe container retained. Existing app and stopped audit containers were
  not restarted, stopped or removed. The supported local Node process is macOS;
  the PostgreSQL containers are Linux. This is not an Ubuntu-hosted run.
- Working-tree structured secret-pattern check: **0 matches**, without reading
  ignored configuration. This does not replace the failing full-history gate.

The initial live probe failed at its combined authentication/metadata stage with
redacted diagnostics; the exact initial cause was not established. A retry
passed three cells before shared-terminal interruption, so it was not counted
as a complete matrix pass. No owned resources remained. TCP readiness was then
made explicit to exclude PostgreSQL's temporary Unix-socket-only init server.
The final attributable four-cell run completed with `CI_A_MATRIX_EXIT=0`.

Potential later gates were inspected, not bypassed: the root release suite
executes source TypeScript through ts-node and model-tool safety checks through
`python3`; both passed locally. Root build does not prepare ignored Vosk assets.
The default eight E2E cases do not click dictation Start, and runtime/model
loading is user-triggered, so no speculative model download or E2E change was
made. No new default-unit/source failure was reproduced. Full Linux Node 22
release/browser execution remains a separate hosted/MAIN gate.

No independent evaluator tool is available to CI-A; MAIN must assign the
independent review/evaluation and any eventual commit/push. No hosted CI pass,
new full integration run or fresh browser pass is claimed here.

## Unchanged release blockers

The history-secret gate remains **FAIL: eight findings** (two historical
Google-key-shaped locations and six truncated documentation examples).
Credential validity/revocation remains unverified; no exception, revocation,
rotation, ignore rule, history rewrite or credential API test was authorized.
See [existing history findings](history-secret-findings.md). This database fix
does not grant release or real-PHI approval. Hosted CI must be rerun and observed
after an independently reviewed, separately authorized publication.
