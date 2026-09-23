# Track L — backend runtime image security remediation

> Publication update (2026-09-22): recorded passwords are redacted to placeholders. Historical passes below predate the credential refactor; fresh DB/browser verification is pending. See [the current credential handoff](publication-secretminimization.md).

## Status and scope

**Implementer verification PASS; independent evaluator PENDING MAIN assignment.**
No independent-agent/evaluator tool is available in this session. MAIN must independently
rebuild/rescan and evaluate the image contracts and production-mode smoke test before
accepting this track. This receipt is not independent evaluation or production approval.

## Retry after agent network failure — current implementer receipt

Evidence captured **2026-09-21 UTC** (local work date September 20). Before editing,
inspected the working tree, all 11 baseline vulnerability paths, and retained image,
test files, scan and smoke receipts. The earlier attempt had already completed the
narrow [backend/Dockerfile](../../backend/Dockerfile) fix. It was **preserved without
another Dockerfile edit**. The baseline's seven affected paths all belong to global
npm, including critical tar CVE-2026-59873; none is an application dependency.

The requested [tests/config-runtime-image.test.mjs](../../tests/config-runtime-image.test.mjs)
and requested coordinator archive were absent. Added that test file and updated
this receipt only. The prior attempt's
[tests/config-image.test.mjs](../../tests/config-image.test.mjs) and
[tests/runtime-image-contract.test.mjs](../../tests/runtime-image-contract.test.mjs)
already existed and were left unchanged, not deleted or renamed. No other workspace
files were edited in this retry. The earlier receipt below is historical evidence;
the retry's counts, current tag identity and archive location are authoritative here.

### Repeat verification

- Backend-only rebuild **PASS**, using existing BuildKit cache; same runtime config
  and layers, new build-attestation/index digest. This is an implementer repeat,
  **not** MAIN's independent rebuild or evaluator approval.
- **23/23 source release contracts PASS**, zero skips/todos: retained 21 plus two
  new fail-closed install/removal and copy-boundary contracts.
- **9/9 explicit source/image cases PASS**, zero skips/todos: the two source cases
  again, four new runtime cases, and three retained actual-image cases. Do not add
  23 and 9 as distinct cases: two source cases are counted in both runs.
  - Archive config content SHA256, OCI index, local image layers and Trivy ImageID
    must agree; scan inventory must retain application/native/OCR dependencies and
    exclude all global package paths. Archive metadata is read to stdout, never
    unpacked onto the host or loaded as an image by the tests.
  - Compiled production validation: **11 rejected / one accepted** configuration;
    real default CMD rejects absent signing secrets with only the safe diagnostic.
  - Compiled Node CLI parser: **eight rejected / three accepted** approval cases,
    import-inert and no DB access. Retained CLI process checks also refuse all three
    commands without explicit operator environment.
  - Read-only/no-network/no-mount runtime checks confirm Node **22.23.2**, UID **1000**,
    missing package-manager binaries/trees/caches, production-only dependencies,
    working Sharp **0.35.4**, and Tesseract **6.0.1** worker/WASM assets.
- Negative controls **PASS as expected rejections**: partial image opt-in fails
  before Docker execution; original vulnerable image still gives **two failures /
  one pass** in the three retained actual-image tests.
- Fresh PostgreSQL **15.19** smoke **PASS**, **00:22:35.013–00:23:36.965Z**,
  schema `image_l_66d3759f373c485480c99a10cd759f04`. Exact approved loopback audit URL,
  fresh schema, owned internal network/backend container, existing PG15 alias only.
  Three approval refusals and unready default startup create zero tables; approved
  Node migration reaches **[1,2,3]**; check/preflight then pass. Production default
  startup with read-only DB/rootfs gives `/health` **200**, `/ready` **200**, exact
  Node healthcheck **0**, PID 1 Node, nonroot user, no migration approval variable,
  and graceful shutdown **0**. Own schema/container/network removed; schema catalog
  unchanged. PG17 remains stopped. No compose startup or volume removal occurred.
- App dependency and compiled-output byte inventories still match the original
  image exactly (same hashes in the historical table below). All **153** application
  package name/version/path tuples match baseline; global removal changes Node
  inventory **351 → 153**.
- Final Node syntax and editor diagnostics **PASS**. The first new image-gate run
  was **7/8**, caused by a test assertion excluding Trivy's three copied workspace
  manifests. Corrected to permit only those exact paths and matching manifest
  name/version pairs, not arbitrary non-application packages. The initial log is
  retained; final expanded run is **9/9**. No runtime change or scan suppression.

The new test file always runs its two source cases during `test:release`. To add
its four actual-image cases, set **all three** explicit variables:
`MEDAPP_RUNTIME_IMAGE=medapp-hardening-backend:security-fixed`,
`MEDAPP_RUNTIME_IMAGE_ARCHIVE=/tmp/medapp-orchestrator-security-20260920/backend-fixed.tar`,
and `MEDAPP_RUNTIME_SCAN_REPORT=/tmp/medapp-l-image-security-retry-20260920/output/backend-fixed-vulnerabilities.json`.
Run it alongside the retained actual-image test file with Node's test runner.
Source-only success is **not** an image-gate pass. Missing/partial image inputs fail;
no missing-image condition is silently skipped. Configured container CLI: `docker`.

### Retry pinned scan and artifacts

- Exported requested archive: `/tmp/medapp-orchestrator-security-20260920/backend-fixed.tar`.
- Tag: `medapp-hardening-backend:security-fixed`, **linux/arm64**.
- Current index ID: `sha256:58371fdde70ab55481428bd2e1c0a8ce6d278320f6030ddefbf398e7d2f26b4f`.
- Config / Trivy ImageID: `sha256:9799f0152b53f4c6e843b90e569202c4d18c2698392b707a399350bb02003d6c`.
- Actual scanner: `aquasec/trivy:0.74.0@sha256:62b1e65e8869bc4b4c6aa4fa2b21595256c7c2f6018a9d9ad61caf87187c1969`.
- Scan completed **2026-09-21T00:21:11.764747877Z**, exit **0**,
  **0 HIGH / 0 CRITICAL** (baseline **10 HIGH / 1 CRITICAL**).
- Archive-only read-only input; fresh writable cache/output and temporary tmpfs;
  no Docker socket or repository mount. Flags preserved: `--scanners vuln`,
  `--severity HIGH,CRITICAL`, `--exit-code 1`, JSON output. No advisory suppression,
  ignore-unfixed flags, dependency upgrades or vulnerability DB modification.
- DB updated **2026-09-20T19:19:55.870896177Z**, downloaded
  **2026-09-21T00:21:09.700932792Z**. Alpine **3.24.2**, 18 APK packages observed.
  Warning persists: **“This OS version is not on the EOL list”**, Alpine **3.24**.
  Zero is limited to the reported HIGH/CRITICAL policy, not comprehensive OS/native
  coverage, EOL support validation, other architectures or full OCR recognition.

Retry logs/receipt are retained separately under
`/tmp/medapp-l-image-security-retry-20260920/`; no first-attempt evidence was overwritten.

| Artifact | SHA256 |
| --- | --- |
| Requested coordinator backend-fixed.tar | 94c0f0203f3c157033c4f014995b9dd92dd599e7cda948df6c50da40001970f3 |
| Retry output/backend-fixed-vulnerabilities.json | 959a0bb26d256878aba8058348359fd66dce280ea42ea51dff9bcd6360e8d40d |
| Retry scan.log | 89ea26e509cc4c5858362f39ee91214d8aa379bde44a806df4a7ff03ebb92947 |
| Retry runtime-receipt.json | 8a1e91c62fb881e40c28b230d7c12ac448087d4c2975776a22e81718150b1e8c |

**MAIN handoff:** assign independent evaluator, independently rebuild/rescan, then
have the documentation coordinator update shared runtime operation instructions
to direct Node CLI commands. No nested evaluator tool was available. Full-history
gitleaks remains **FAIL / owner action**; not rerun, allowlisted, rotated or rewritten.
Root npm audit/frontend scan zero were coordinator reports and were not rerun by L.
No overall production/ePHI approval is implied.

## Historical first-attempt scope (retained)

First-attempt evidence captured on **2026-09-21 UTC**. Only
[backend/Dockerfile](../../backend/Dockerfile) was changed in runtime configuration;
new files are [source contracts](../../tests/config-image.test.mjs),
[actual-image contracts](../../tests/runtime-image-contract.test.mjs), and this receipt.
Existing application source, root/workspace manifests and locks, frontend Dockerfile,
secret files, ignore lists and other agents' files were not edited. The frontend was
not rebuilt or rescanned. Git's Dockerfile diff includes earlier agents' changes;
L's delta is the final-stage cleanup/comment and terminal newline only.

## Verified baseline provenance — all 11 findings

Read MAIN's complete JSON and scan log under
`/tmp/medapp-orchestrator-security-20260920/`, and verified its supplied archive's
manifest/index mapping (not just a similarly named current tag):

- Tag: `medapp-hardening-backend:verified`, **linux/arm64**.
- OCI index / Docker image ID: `sha256:88b16833fc5f931209369d0bb84798c6aa2c06d7235d6449f299c9505056b86e`.
- Archive config / Trivy `Metadata.ImageID`: `sha256:35ac9cd74a64616e7b4de02a3e16d7428da1b420f25c34cf3bf5343266d399a2`.
- Baseline report SHA256: `31cd0f7e396f423ffa6b3552703d15590df750eb540ae7a2b69b6cb65e39dd00`.
- Every row: **Target `Node.js`, Class `lang-pkgs`, Type `node-pkg`**.
- Every row belongs to base layer digest `sha256:b0bbcd0d28f0ad1d7456c3eeac7fd2c977392e50e7d4d1efe63c3d5bafb9a8bc`,
  DiffID `sha256:75779f0bd2348ccc630312ab6ab389bfcfc4fb1b2b0c2482353257343983a3e4`.

| Vulnerability | Severity | Installed | Actual Trivy PkgPath |
| --- | --- | --- | --- |
| CVE-2026-13149 | HIGH | 2.0.2 | usr/local/lib/node_modules/npm/node_modules/brace-expansion/package.json |
| CVE-2026-14257 | HIGH | 2.0.2 | usr/local/lib/node_modules/npm/node_modules/brace-expansion/package.json |
| CVE-2026-69152 | HIGH | 2.0.2 | usr/local/lib/node_modules/npm/node_modules/brace-expansion/package.json |
| CVE-2026-69192 | HIGH | 10.1.0 | usr/local/lib/node_modules/npm/node_modules/ip-address/package.json |
| CVE-2026-9496 | HIGH | 19.0.2 | usr/local/lib/node_modules/npm/node_modules/pacote/package.json |
| CVE-2026-9496 | HIGH | 20.0.1 | usr/local/lib/node_modules/npm/node_modules/@npmcli/metavuln-calculator/node_modules/pacote/package.json |
| CVE-2026-33671 | HIGH | 4.0.3 | usr/local/lib/node_modules/npm/node_modules/picomatch/package.json |
| CVE-2026-48815 | HIGH | 3.1.0 | usr/local/lib/node_modules/npm/node_modules/sigstore/package.json |
| CVE-2026-59873 | CRITICAL | 7.5.11 | usr/local/lib/node_modules/npm/node_modules/tar/package.json |
| CVE-2026-59874 | HIGH | 7.5.11 | usr/local/lib/node_modules/npm/node_modules/tar/package.json |
| CVE-2026-73566 | HIGH | 7.5.11 | usr/local/lib/node_modules/npm/node_modules/tar/package.json |

Thus **10 HIGH + 1 CRITICAL**, seven distinct package paths, all within **global npm**,
not application dependencies or Corepack's own package tree. Root npm audit's zero
did not cover these base-image global packages. Corepack and Yarn were separately
observed unused tooling (1.2 MB and 5.1 MB respectively); their removal is surface
reduction, not a claim that these 11 findings originated there.

## Minimal remediation

Both stages retain exactly
`node:22-alpine@sha256:b6f26b36c8ff49624cfdac716b8ea1138d606df02586a77d364bb5536a634f85`.
Observed Node version remains **22.23.2**, Alpine **3.24.2**.

The final stage still executes the deterministic root-lock install
`npm ci --omit=dev --workspace=backend --include-workspace-root=false`, including
normal install scripts and optional native dependencies. **After successful install**,
the same RUN cleans npm's cache and removes only global npm/Corepack directories,
the bundled Yarn directory, npm/npx/corepack/yarn/yarnpkg/pnpm/pnpx launcher paths,
and root/node npm/cache directories. It does not remove anything under application
node_modules or dist. Build-stage npm/TypeScript remains available for compilation.
Alpine's OS package database/tools are unchanged; this is not a distroless image.

The existing `docker-entrypoint.sh`, `USER node`, Node CMD and Node readiness
HEALTHCHECK remain unchanged. No dependency upgrade, scanner suppression, ignore
addition, vulnerability DB modification or manifest/lock change was used.
Layered removal hides the tools from the final runtime filesystem; base-layer
bytes remain in the archive. This is **not** a claim of erasing historical layers.

### Runtime operations handoff to MAIN

The final image intentionally has **no JavaScript package-manager commands**.
Repository/development npm wrappers still work outside the image. From the image's
existing `/app` working directory, use the compiled Node CLI directly:

| Operation | Image command (after image name, not an npm script) |
| --- | --- |
| Read-only preflight | `node backend/dist/db/cli.js preflight --approved-production` |
| Explicit approved migration job | `node backend/dist/db/cli.js migrate --approved-production --confirm-migration` |
| Verify schema | `node backend/dist/db/cli.js check --approved-production` |
| Normal startup | Default CMD, `node backend/dist/index.js` |

Supply explicit approved `DATABASE_URL` and `NODE_ENV=production`; migration also
requires exact `RELEASE_MIGRATION_APPROVED=true`, both flags, and appropriate DB
privileges. Do **not** pass migration approval/credentials to runtime replicas.
The synthetic smoke used strong, distinct random ephemeral keys and the exact
HTTPS origin `https://synthetic.invalid`; no real secret was read or printed.
Preflight exit 3 is **review**, not success; exit 2 is blocked. MAIN should incorporate
this image-only command distinction in [OPERATIONS.md](../../OPERATIONS.md); that
shared document was deliberately not edited by L.

## Regression tests and actual runtime verification

1. **21/21 source release contracts PASS**, zero skips/todos: previous 17 plus
   **four** new cases selected by the existing `tests/config-*.test.mjs` script.
   No root script or existing count assertion was changed. Tests constrain the
   exact digest, deterministic production install, narrowly allowlisted cleanup,
   Node launch/health/DB command contract, and protected root build context.
2. **3/3 explicit actual-image contracts PASS**, zero skips/todos. Invocation:
   `MEDAPP_RUNTIME_IMAGE=medapp-hardening-backend:security-fixed node --test tests/runtime-image-contract.test.mjs`.
   These tests require an explicit local tag; they are intentionally separate from
   source-only tests and do not silently skip if Docker/image is missing. The
   configured CLI is `docker` (optional `CONTAINER_CLI` executable override).
   Containers have no network/mounts, read-only rootfs, all capabilities dropped,
   no-new-privileges and no image pulls. Assertions cover UID 1000, Node 22,
   actual absence of JS package-manager executables **and dangling PATH launchers**,
   manager trees/caches (root caches checked separately as root), **398** absent
   dev-only lockfile paths, dev module resolution failures, all direct runtime
   dependency resolution, compiled entrypoints, actual Sharp PNG processing,
   Tesseract worker presence and valid WASM asset bytes, and all three compiled
   DB commands refusing missing explicit operator environment through Node.
3. **Negative control:** the same actual-image suite against the original `verified`
   tag exits 1 with **two failures / one pass**. Global tooling and root caches fail;
   the unchanged CLI refusal passes. This is expected regression evidence, not a
   hidden failed acceptance run.
4. **Production-mode synthetic PostgreSQL smoke PASS**, 00:13:08.159–00:13:45.746Z:
   exact host guard `postgresql://audit:<test-database-password>@127.0.0.1:55439/medapp_audit`,
   actual PostgreSQL **15.19**, existing pinned PG15 container on loopback 55439.
   Created only fresh schema `image_l_5c319784a4764f65aa55bc981bd1b3ed` plus a unique
   internal network/backend container; used schema-scoped URLs inside that network.
   No production connection, existing-row mutation, secret-file read or external AI.
   - Missing approval flags/confirmation/release approval: **three refusals**;
     fresh schema remains empty.
   - Before migration: `check` exits 1; actual `preflight` exits **3 / review**;
     production default startup exits 1 and creates **zero tables**.
   - Approved `node backend/dist/db/cli.js migrate --approved-production --confirm-migration`
     with release approval exits 0; actual versions **[1,2,3]** queried.
   - Subsequent Node `check` exits 0; Node `preflight` exits **0 / clear** on this
     empty synthetic migrated schema (not a production-data claim).
   - Default startup, PID 1 **node**, UID **1000**, no release approval variable,
     read-only rootfs and DB `default_transaction_read_only=on`: `/health` **200**,
     `/ready` **200**, exact configured healthcheck command exits **0**.
   - Internal-only network and failed registry HTTP reachability verify startup
     without package-manager/network installation; no source/dependency mounts.
   - SIGTERM stop exits **0**; own container/network/schema removed, PostgreSQL
     disconnected only from the temporary network; before/after schema catalog equal.
5. Node syntax checks and editor diagnostics: PASS for both new test files. Owned
   whitespace checks include untracked tests/receipt, not only tracked Git diff.

The smoke harness is retained outside the repository at
`/tmp/medapp-l-image-security-20260920/verify-runtime.cjs`. Its initial prerequisite
assumption used an unpinned PG image string; **two invocations stopped before any
DB access/schema/network creation** because the actual PG container is digest-pinned.
The harness was corrected to require that exact observed pin; the final serial run
above passed. These failed prerequisite logs are retained, not rewritten.

### Application assets preserved byte-for-byte

Compared sorted path/type/content SHA256 inventories from original and fixed
images (including symlink targets). Both sides matched exactly:

| Image tree | File/link entries | Aggregate SHA256 |
| --- | ---: | --- |
| /app/node_modules | 2168 | c5cdeac32a603b77d3666d96e56c38359da3941f53f26b74ee88c61afcff743d |
| /app/backend/node_modules | 216 | dc74d61179c9489b5cb1220d3f53811ea4de8fa0c0d00052ddba68ab0949b9ba |
| /app/backend/dist | 31 | db85bc6a4e818ac4c12ebe48c5030eeba94fe1fce99e16a039aea01f76692d5b |

Sharp **0.35.4** executes native image processing; Tesseract **6.0.1** resolves and
its WASM validates. This does **not** test full OCR recognition or trained-language
downloads; no traineddata assets were deleted or added.

## Actual pinned rescan

- Built backend only: `medapp-hardening-backend:security-fixed`, **linux/arm64**.
- Image index ID: `sha256:959e6ce46b05cfae7535f667441dec7db21688464e3572d9ae5feb3afb4c56b1`.
- Config / Trivy ImageID: `sha256:9799f0152b53f4c6e843b90e569202c4d18c2698392b707a399350bb02003d6c`.
- Scanner: `aquasec/trivy:0.74.0@sha256:62b1e65e8869bc4b4c6aa4fa2b21595256c7c2f6018a9d9ad61caf87187c1969`.
- Scan completed **2026-09-21T00:10:46.596992046Z**, exit **0**.
- Flags: archive `--input`, `--scanners vuln --severity HIGH,CRITICAL --exit-code 1`
  with JSON output, no-progress and 5-minute timeout. Archive mounted **read-only**;
  only separate temporary output/cache directories writable. **No Docker socket or
  repository mount**; no source write access. Container capabilities dropped and
  no-new-privileges enabled. Scanner networking was used to download its public DB,
  unlike offline runtime probes.
- Vulnerability DB updated **2026-09-20T19:19:55.870896177Z**, downloaded
  **2026-09-21T00:10:44.365973836Z**.
- Result: **0 HIGH / 0 CRITICAL** across reported Alpine and Node targets.
  Node inventory shrank **351 → 153**; every remaining Node package path is under
  app, and the complete **153 application name/version/path tuples are identical**
  to baseline. Thus the result is not caused by hiding application packages.

### Important coverage limitations / unchanged blockers

The scan explicitly warns **“This OS version is not on the EOL list”**, Alpine
**3.24**. It identifies Alpine 3.24.2 and evaluates **18** APK packages, but this
warning remains unresolved: do **not** call this comprehensive OS/C/native-library
coverage, EOL validation, or proof of absence of all vulnerabilities. Only the
specified HIGH/CRITICAL vulnerability policy and actual inventories were tested;
lower severities, all architectures, full native dependency coverage, production
infrastructure and full OCR behavior are not established here. No suppression or
ignore was added. App nonroot/read-only/offline testing is not a production network
or database-privilege guarantee; the read-only DB was an explicit synthetic setting.

MAIN's reported **full-history gitleaks remains FAIL**: two Google-key-shaped
findings plus six truncated JWT-shaped findings need owner action. L did not rerun
that history scan, rotate/delete credentials, rewrite history, or add ignores.
The coordinator-reported frontend scan zero/root npm audit zero do not replace this
image scan and were not re-executed by L. Overall ePHI/organizational policy release
blocks remain unchanged.

## Retained evidence (outside repository)

Directory: `/tmp/medapp-l-image-security-20260920/`.

| Evidence | SHA256 |
| --- | --- |
| input/backend.tar | 2692b8a8fe26ba894a776f496fb063dae39a4000099a2bd9a400b4e30df1d077 |
| output/backend-vulnerabilities.json | b0684624fa2e17c3d4dc2d70118dc6997105424995e06d943c4fa6273163b1cc |
| scan.log | e2e7600e2c7d241b38eb25439b84be3547e57762e69c4446df684fa14bb980cc |
| runtime-receipt.json | 8c3846d0d88c773b7674f253351fd70b3cd538a84be4a97f7bc939c7cb999e80 |

Additional logs: build, source contracts, final image contracts, expected failing
baseline contracts, initial harness prerequisite failures and final synthetic runtime
run. Image/archive and evidence are retained for MAIN; only uniquely owned temporary
runtime resources were removed. Independent evaluator and MAIN rebuild/rescan are
**pending**, not waived.
