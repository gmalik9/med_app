# Track A — Batch A / F1 / F2 release evidence

> Publication update (2026-09-22): recorded passwords are redacted to placeholders. Historical passes below predate the credential refactor; fresh DB/browser verification is pending. See [the current credential handoff](publication-secretminimization.md).

Date: 2026-09-20. Implementer A. **Scoped implementation and local checks complete; independent evaluation and hosted release execution remain blocked/unverified. Not production approval.**

## Scope and preservation

Owned changes are root Markdown deployment/setup/README entrypoints (excluding the four coordinated audit/plan/runbook/inventory documents), root/backend manifest **scripts only**, new release/configuration tests, GitHub workflows/Dependabot, and the proven exact-origin defect in [backend configuration](../../backend/src/config.ts). No dependency declarations, shared lockfile, application bootstrap, database implementation, routes, frontend source or existing test files were edited by this track. The pre-existing README verification notice was preserved verbatim; the pre-existing Render guide received only a release-command update. Superseded guide bodies were intentionally retired, not silently retained as runnable alternatives.

The starting tree already contained extensive user/other-track edits. No reset, commit, push, production contact, ignored secret-file read, secret rotation or existing database/volume reset is authorized. Only the supplied loopback synthetic URL may be used; tests create new schemas. Existing data and prior schemas are retained.

## Acceptance criteria for an independent evaluator

An evaluator must independently inspect and execute focused checks, read-only except for test-created synthetic schemas:

1. Inspect [package.json](../../package.json), [backend/package.json](../../backend/package.json), [release runner](../../tests/release-runner.mjs), [release tests](../../tests/config-release.test.mjs) and [guide tests](../../tests/config-guides.test.mjs). Confirm manifests changed only in scripts, root lock matches, missing/unsafe URLs fail before child commands, no environment values leak, unit and integration interfaces differ, and required API tests actually run against the approved synthetic URL.
2. Inspect [configuration tests](../../backend/tests/configuration.test.ts) and [configuration](../../backend/src/config.ts). Execute the tests and verify wildcard, credentials, query/fragment/path rejection, production secret/default/distinctness/DB/seed checks, registration/AI defaults and proxy-hop bounds. Confirm only the reproduced wildcard-origin runtime change was made.
3. Inspect every owned root guide: no executable old installs, wildcard CORS, guessed hosts, HTTP seed calls, shared production credentials, free-plan approval or destructive reset procedure remains. Use Node 22.12+, root `npm ci`, actual exact origins and explicit API destination/proxy. Run `npm run test:release`.
4. Inspect [verification workflow](../../.github/workflows/verify.yml), [security workflow](../../.github/workflows/security.yml), [Dependabot](../../.github/dependabot.yml), [workflow contracts](../../tests/config-workflows.test.mjs) and [matrix metadata check](../../tests/release-database-info.mjs). Verify four PG15/17 × UTC/America/New_York matrix cells, required integration and aggregate gates, minimal permissions/no pull_request_target, full fetched-history redaction, verified pins, no raw finding/image/env artifacts, and no silent continue-on-error.
5. Run focused no-emit checks and the new tests; independently execute required integration with `postgresql://audit:<test-database-password>@127.0.0.1:55439/medapp_audit`. Never run competing shared dist builds, read ignored secrets, contact deployed services or alter existing DB/volumes. Report actual failures and unexecuted hosted/image/restore checks separately.

## Evaluator availability

**Independent evaluator unavailable.** This session exposes no `runSubagent` tool or equivalent delegated-agent capability. No separate agent was spawned, and implementer self-checks must not be described as an independent evaluation. The exact acceptance criteria/files above are ready for the orchestrator to supply to a generic read-only evaluator (tests allowed). No independent PASS verdict is claimed; final handoff must remain evaluation-blocked until one executes the focused checks.

## Reproduction and initial focused evidence

Host: macOS, Node 20.20.0, npm 10.8.2. This is **not** the supported Node 22 production baseline. No packages were installed or lockfiles regenerated.

| Command / action | Actual result |
|---|---|
| `npm exec --workspace=backend -- vitest run tests/configuration.test.ts` before fix | **3 failed, 32 passed**: production wildcard subdomain, embedded wildcard hostname and development wildcard origin were accepted. Other rejection/gate cases passed. |
| One-line `origin.includes('*')` addition in production configuration validator | Exact-origin runtime change authorized by the reproduced failures. Applies to all environments; does not widen CORS or alter signup/AI/seed policies. |
| `npm run test:configuration --workspace=backend` after fix | **35 passed**, 0 skipped. dotenv mocked; no secret-file read or database connection. |
| Initial `npm run test:release` | **4 passed**, including missing/unapproved URL subprocesses, lock/manifest parity and script contracts. Later additions require a final rerun below. |
| Editor diagnostics on initial four new/changed JS/TS files | No errors found. |

## Verified immutable reference provenance

Public metadata was fetched without credentials. Python's default TLS store initially failed with `CERTIFICATE_VERIFY_FAILED`; system `curl` succeeded with certificate verification **enabled**. No insecure TLS override was used.

| Reference | Verified result / source |
|---|---|
| actions/checkout v4 | `11d5960a326750d5838078e36cf38b85af677262`, commit from [GitHub tag metadata](https://api.github.com/repos/actions/checkout/git/ref/tags/v4) |
| actions/setup-node v4 | `49933ea5288caeca8642d1e84afbd3f7d6820020`, commit from [GitHub tag metadata](https://api.github.com/repos/actions/setup-node/git/ref/tags/v4) |
| github/codeql-action v3 | Annotated tag `ed1a0fa18ac745d017ca370dd4ef08bba3b4f504`, [peeled to commit](https://api.github.com/repos/github/codeql-action/git/tags/ed1a0fa18ac745d017ca370dd4ef08bba3b4f504) `3ea06614dafe36dec890db3446326e0d40ce53d4` |
| actions/upload-artifact v4 | `ea165f8d65b6e75b540449e92b4886f43607fa02`, commit from [GitHub tag metadata](https://api.github.com/repos/actions/upload-artifact/git/ref/tags/v4) |
| postgres:15-alpine | OCI index `sha256:a46e076249ce434e41203b8c1dadfaa025b9726331d72390df038385d6dc29cd` |
| postgres:17-alpine | OCI index `sha256:f02121de6f74d30d8a94cd1d9584125e2178d7e6c377d8130112d4e52d867995` |
| ghcr.io/gitleaks/gitleaks:v8.30.1 | OCI index `sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f`; version verified from [public release metadata](https://api.github.com/repos/gitleaks/gitleaks/releases/latest) |
| aquasec/trivy:0.74.0 | OCI index `sha256:62b1e65e8869bc4b4c6aa4fa2b21595256c7c2f6018a9d9ad61caf87187c1969`; version verified from [public release metadata](https://api.github.com/repos/aquasecurity/trivy/releases/latest) |

Image digests were resolved with `docker buildx imagetools inspect <reference> --format '{{json .Manifest}}'` in the listed order; metadata inspection did not execute or install the scanner images. Verified existence is not a full supply-chain audit. Review scanner provenance/advisories before authorizing hosted execution.

Dependabot proposes reviewed root npm, action and Dockerfile updates; no auto-merge. It may not update service/scanner references embedded in workflow shell steps. Review those digests weekly alongside public release/advisory metadata, resolve new manifests/commits, update this evidence and regression expectations, then require an observed scan/matrix pass. Existing application Dockerfile base tags are outside this track's ownership and remain mutable until their owner pins reviewed digests.

## Hosted gates and limitations

- Verification provisions four isolated synthetic PostgreSQL jobs, sets both process and database timezone, asserts actual server version/timezone, and runs `verify:release`. `Release required` fails if the matrix fails or skips. No hosted job has been observed during this track.
- Security runs full fetched history with Gitleaks `--redact=100` and `--log-opts=--all`, CodeQL JS/TS `security-extended` without building untrusted code, and image OS/native/language vulnerability scans plus CycloneDX SBOMs. No scanner downloads or arbitrary package installs occurred locally. Image scans fail on HIGH/CRITICAL including unfixed findings. Only SBOMs are uploaded (7-day retention), not image archives, secret findings, environments or clinical data.
- CodeQL analysis success is not equivalent to “no alerts.” Repository owners must enable appropriate Code Security support and code-scanning merge rules/severity policy, inspect findings and handle fork-upload restrictions. `security-events: write` is limited to the CodeQL job; no `pull_request_target`, repository secrets or persisted checkout token is used.
- Repository owners must configure required checks `Release required` and `Security required` and code-scanning rules. Merely naming a job “required” does not enforce branch protection.
- Real built-frontend response headers/proxy checks, an isolated synthetic restore rehearsal, clean Node 22 installation/build/browser execution, and the full PG/timezone matrix need observed execution/coordinated F2 ownership. No full Batch A/F1/F2 completion is claimed by the scoped implementation alone.
- No production TLS/encryption/backups, vendor agreements, account provisioning, identity/access policy or ePHI approval was verified. Keep AI/signup/production seeding disabled.

## Final local verification

All commands below ran on host **Node 20.20.0**, not Node 22. No shared dist build or clean installation was run by this track. The synthetic database reported **PostgreSQL 17, server timezone UTC**. The non-UTC run changes the Node process timezone only; it is not evidence for the non-UTC database or PG15 matrix cells.

| Actual command / check | Result |
|---|---|
| `npm run test:release` (final reruns) | **10 passed**, 0 failed/skipped. Covers all owned root guides, local links, setup contract, guarded URL subprocesses, fail-fast behavior, root lock parity, scripts, verified action pins, matrix/gate structure and scanner redaction/artifact policy. |
| `npm run test:configuration --workspace=backend` | **35 passed** after the reproduced one-line wildcard fix. |
| `env -u TEST_DATABASE_URL npm run test:unit` | **10 release checks + 47 backend units + 106 frontend units passed**, no DB needed. Frontend count includes parallel-track suites, not work authored by Implementer A. |
| `env -u TEST_DATABASE_URL npm test` | **47 backend units + 106 frontend units passed**. Final ordinary test contract intentionally excludes all DB suites, even if a test URL exists. |
| Guarded URL + `TZ=UTC node tests/release-database-info.mjs` | Read-only metadata check passed: PG17, server UTC, process UTC. No DDL. |
| Guarded URL + `TZ=UTC npm run test:integration` | **33 passed**, 0 skipped: existing API/migration suite (21) plus parallel-track session suite (12). Fresh schemas only. |
| Guarded URL + `TZ=America/New_York npm run test:integration` | **33 passed**, 0 skipped; existing server remains UTC. |
| `npm run typecheck` | Both workspace `tsc --noEmit` checks passed, including a rerun after integration. |
| `npm run lint` | Passed. |
| `env -u TEST_DATABASE_URL npm run verify` | **Expected exit 1**: “Release prerequisite failed: TEST_DATABASE_URL is required; integration tests must not skip.” No build/test child ran. Unsafe URL cases also fail in subprocess tests without printing values. |
| Ruby standard-library `YAML.parse_file` on both workflows and Dependabot | All three syntax checks passed. This is not hosted Actions/actionlint execution. |
| Editor diagnostics on owned new/changed JS/TS, manifests and YAML | No errors found. |
| Scoped `git diff --check` | Passed. No whitespace errors. |

The full commands for DB-backed checks use only `TEST_DATABASE_URL='postgresql://audit:<test-database-password>@127.0.0.1:55439/medapp_audit'` as documented in [SETUP.md](../../SETUP.md). Existing API schemas were retained; the other track's session suite drops only its own newly randomized schema. No pre-existing schema/record/volume was modified. Before invoking tests that import dotenv, existence-only checks confirmed that root/backend/frontend dotenv files were absent; ignored secret values were never read.

### Failures encountered and resolved

- Initial configuration regression: **3 failures** (wildcards accepted); fixed only the demonstrated origin-validation defect, then **35/35 passed**.
- Guide replacement tooling reported successful delete/add but retained old editor-buffer content after the new guide. The first new guide test caught this; explicit in-place replacements removed the unsafe tails. A residual old index tail needed a further explicit truncation. Final guide tests and on-disk inspection passed. Unsafe procedures were not intentionally archived beneath disclaimers.
- Workflow regression initially overmatched the job identifier `history-secrets.result` as a secret expression. Restricted the rule to actual `${{ secrets.* }}` references; final checks passed. Guide regression diagnostics now report file/rule only, not full document content.
- The first `test:unit` attempt picked up a newly added parallel-track session integration suite; **47 units passed but the session suite failed its missing-URL prerequisite**. Replaced the “exclude only API” approach with an explicit security/configuration unit allowlist. All other backend suites now default to required integration. No other track's tests were edited. Reran units, ordinary tests and both integration timezone checks successfully.
- One combined terminal invocation returned “Failed to retrieve command output,” and its returned execution ID was no longer available. It is **not counted as evidence**. Separate labeled unit and integration reruns produced the results above.
- Public metadata lookup initially failed using Python's CA store; system TLS verification succeeded without insecure bypass, as recorded above.

## Exact files changed by Implementer A

### Root guides (18)

[README.md](../../README.md), [SETUP.md](../../SETUP.md), [APP_MANAGER.md](../../APP_MANAGER.md), [DEPLOYMENT.md](../../DEPLOYMENT.md), [DEPLOYMENT_GUIDE.md](../../DEPLOYMENT_GUIDE.md), [PRODUCTION_DEPLOYMENT_GUIDE.md](../../PRODUCTION_DEPLOYMENT_GUIDE.md), [RENDER_DEPLOYMENT.md](../../RENDER_DEPLOYMENT.md), [RENDER_QUICK_START.md](../../RENDER_QUICK_START.md), [RENDER_AUTO_DETECTION.md](../../RENDER_AUTO_DETECTION.md), [RENDER_DEPLOYMENT_FIX.md](../../RENDER_DEPLOYMENT_FIX.md), [QUICK_FIX_RENDER.md](../../QUICK_FIX_RENDER.md), [BUILD_SUMMARY.md](../../BUILD_SUMMARY.md), [IMPLEMENTATION_SUMMARY.md](../../IMPLEMENTATION_SUMMARY.md), [INDEX.md](../../INDEX.md), [VERIFICATION_CHECKLIST.md](../../VERIFICATION_CHECKLIST.md), [FEATURES_GUIDE.md](../../FEATURES_GUIDE.md), [CLINICAL_NOTES_DATE_FIX.md](../../CLINICAL_NOTES_DATE_FIX.md), [DASHBOARD_SUMMARY_FIX.md](../../DASHBOARD_SUMMARY_FIX.md).

### Scripts, configuration and tests (9)

[package.json](../../package.json) (scripts only), [backend/package.json](../../backend/package.json) (scripts only), [backend/src/config.ts](../../backend/src/config.ts) (one wildcard rejection condition), [backend/tests/configuration.test.ts](../../backend/tests/configuration.test.ts), [tests/release-runner.mjs](../../tests/release-runner.mjs), [tests/release-database-info.mjs](../../tests/release-database-info.mjs), [tests/config-release.test.mjs](../../tests/config-release.test.mjs), [tests/config-guides.test.mjs](../../tests/config-guides.test.mjs), [tests/config-workflows.test.mjs](../../tests/config-workflows.test.mjs).

### Automation and evidence (4)

[.github/workflows/verify.yml](../../.github/workflows/verify.yml), [.github/workflows/security.yml](../../.github/workflows/security.yml), [.github/dependabot.yml](../../.github/dependabot.yml), [docs/verification/track-a-release.md](track-a-release.md).

## Changed interfaces and coordination handoff

- Root additions: `test:unit`, `test:release`, `test:integration`, `verify:release`; `verify` now invokes the fail-fast required release runner. Existing root `test` still delegates to workspace tests.
- Backend additions: `test:unit`, `test:integration`, `test:configuration`; backend `test` now delegates to database-free `test:unit`. New backend suites default to required integration; reclassify only after confirming they need no database.
- Runner CLI: `--check-database` validates the one approved synthetic URL without connecting; `--integration` executes all non-unit backend suites; `--verify` guards first, then types/lint/units/integration/build. Missing or different URL is a nonzero failure with no URL echo. No dotenv/config/application import is used by the guard.
- CI-only metadata interface: optional `EXPECTED_PG_MAJOR` and `EXPECTED_PG_TIMEZONE` validate actual server metadata; `TZ` characterizes process timezone. No server settings are mutated.
- Orchestrator should reconcile the coordinated [OPERATIONS.md](../../OPERATIONS.md), [QUALITY_AUDIT.md](../../QUALITY_AUDIT.md), [HARDENING_PLAN.md](../../HARDENING_PLAN.md) and [AUDIT_API_INVENTORY.md](../../AUDIT_API_INVENTORY.md) later. In particular, the old “normal tests skip integration without a URL” sentence should now say normal tests explicitly exclude integration; required entrypoints fail instead.
- Remaining release work: independently evaluated verdict; observed clean Node22 install/no-emit/lint/build/browser release; all four PG/timezone CI cells; hosted CodeQL/full-history/image scans/SBOMs; reviewed Dockerfile base-image pins; served frontend header/proxy tests and isolated restore drill coordinated with their owners; branch-protection/code-scanning policy and production infrastructure/identity/access/vendor approvals. No cloud execution or production authorization is implied by these local passes.

**Evaluator verdict: UNAVAILABLE / NOT EXECUTED (no runSubagent capability). Implementer self-check verdict: PASS for the scoped local checks above, not an independent evaluation and not full Batch A/F1/F2 completion.**
