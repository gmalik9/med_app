# CI-B: image scanner identity and archive permissions

## Original failure (not a vulnerability finding)

GitHub security run **35819755504**, 2026-09-23: frontend job **107048887297**
and backend job **107048887404** both built successfully, then failed the
Generate image SBOM step with exit **1**: `open /scan/image.tar: permission denied`.
The subsequent OCI `index.json: not a directory` message is the fallback archive
reader, not evidence that the successful build produced a corrupt archive.
The redacted local job logs were examined; neither image reached its vulnerability gate.

The pinned Trivy image defaults to UID 0. A runner-owned `docker save -o` archive
has mode 0600. With all capabilities dropped, UID 0 has no `CAP_DAC_OVERRIDE`
and cannot read a file owned by another UID. macOS bind-mount ownership behavior
can conceal this Linux DAC failure; native Linux-volume verification is required.

## Scoped correction

Only the `images` job in [security.yml](../../.github/workflows/security.yml) changes:

- Both scanners use the runner's numeric UID/GID; capabilities remain dropped and
  `no-new-privileges` remains enabled. No Docker socket, credential mount, chmod
  workaround, Dockerfile change, or scanner-image upgrade.
- The owner-only input directory is mounted read-only in **both** steps. Reports
  and the shared cache are separate runner-local directories, created mode 0700.
  The scanner root filesystem is also read-only. Explicit `HOME`, `TMPDIR` and
  `--cache-dir` avoid the inaccessible default root home/cache.
- CycloneDX inventory is offline. The vulnerability scan retains network access
  for registry databases and the unchanged HIGH/CRITICAL gate, including unfixed
  findings. No database-skip, ignore, or success-forcing flags are added.
- Only the existing SBOM artifact is uploaded, with seven-day retention. There
  is **no custom filesystem cleanup**: local files remain private until the
  GitHub-hosted ephemeral runner is disposed of. The artifact path is unchanged,
  so CI-A's existing assertion needs no update.

Full-history secrets, CodeQL and aggregate-job logic are unchanged. **The eight
known full-history findings remain legitimate release blockers**; this fix does
not allowlist, suppress, rotate, or otherwise remediate them.

## Verification ledger

- Before workflow correction, the new
  [scanner contracts](../../tests/config-image-scanner.test.mjs) failed the five
  permission/isolation/lifecycle cases; existing release-discovery contract passed.
- Final Node **22.23.2** focused image/workflow contracts: **9/9 passed**. Final
  automatically discovered config suite, including concurrent CI-A additions:
  **67/67 passed**, zero skipped/todo. These are historical pre-cleanup-review
  counts, not evidence that the deletion boundary was safe. Earlier cross-track checks were **8/9**
  (verification-matrix assertion during CI-A edits) and **65/66** (CI-A's CLI
  source assertion matched a comment); these failures were not suppressed or
  edited by CI-B and are superseded by the final full passing run.
- Editor diagnostics and scoped whitespace checks passed. Non-image security
  job text, application Dockerfiles and root package scripts were compared with
  HEAD and are byte-identical. CI-A's verification workflow and assertions were
  not edited by CI-B; no SBOM-path assertion adjustment was necessary.
- Independent evaluation must be assigned by MAIN; nested delegation is unavailable.
  A fresh GitHub run is required after the owner publishes the fix. No commit/push
  or GitHub green-run claim is made here.

### Independent cleanup rejection and minimal correction

Independent review passed the actual Linux permission fix but **failed** the
new final cleanup step. Quoting and `--` prevent splitting/option interpretation;
they do not validate the deletion boundary. An unset, empty, root, relative,
unknown or symlinked `RUNNER_TEMP` could select directories not created by this
job. The original test compounded the problem by requiring that unsafe command.

The correction chooses **removal**, not a new deletion helper. All three actual
build/scanner shell bodies remain unchanged, as do the numeric UID/GID, read-only
input/root filesystem, separate private output/cache, dropped capabilities,
image/action pins and HIGH/CRITICAL gate. There is no filesystem deletion step,
trap or helper left in the image job, so there is no prefix-based ownership claim
or deletion guard to bypass. Docker's `--rm` still removes its own scanner
container, not host directories. Other security jobs and CI-A files are untouched.

This is acceptable **only for the existing fresh GitHub-hosted `ubuntu-24.04`
ephemeral runners and synthetic, non-secret image inputs**. Archives/cache/reports
occupy runner disk until platform disposal, including after failure/cancellation;
they are not promptly erased by the workflow. The archive and cache are never
uploaded or restored by a cache action; only the explicit SBOM artifact persists
for seven days. Platform disposal is relied upon, not independently verified
secure erasure. Moving to persistent/self-hosted runners or secret/clinical image
inputs requires revisiting this lifecycle policy. A future explicit cleanup must
validate an exact created directory/ownership receipt and stable non-symlink
identity before deleting allowed children, never the runner-temp parent.

The unsafe cleanup assertion is replaced by a hosted-runner/no-deletion contract.
Two additional executable tests exercise the actual workflow shell with inert
container and deletion interceptors: both matrix workspaces, 12 temp-value cases
(including unset/empty/root/relative/unknown/symlink/dangerous directories), and
success plus build/save/SBOM/vulnerability failures (**120 combinations**). All
mkdir calls are intercepted for these unsafe values; this tests absence of
deletion, **not rejection of invalid build paths**. A separate real-filesystem
fixture executes mkdir and a synthetic save only under fresh test-owned temp
directories, checks 0700/0600 modes, retained archive/report bytes and unchanged
parent/sibling/symlink-target markers on success and scanner failures. Fixture
teardown verifies its exact captured directory identity; it never removes an
existing real runner directory. No image rebuild, scan, database or app action is
needed for this cleanup-only correction.

Correction verification on **2026-09-23**, Node **22.23.2**:

- Focused image/workflow contracts: **11/11 passed** (8 scanner + 3 workflow).
  This replaces the historical 9-case focused result, not 9 additional passes.
- Full automatically discovered config suite: **69/69 passed**, zero failed,
  skipped or todo. It includes all 11 focused cases; do not add the counts.
- The 120 intercepted combinations are iterations inside one test, not 120
  additional top-level cases. The real-filesystem cases are the other new test.
- An in-memory negative control restored the exact rejected cleanup: the new
  lifecycle contract correctly failed while the other seven scanner contracts
  passed. The unsafe command was not executed and no source was changed.
- Workflow shell syntax and editor diagnostics passed. The native Linux scan
  proof below is prior evidence, not rerun or included in these totals.
- All **229 non-owned source files** retained their pre-edit aggregate SHA256
  **41480b8200314c363d78cb09ba496a8e016e7adba2f96254e858c18035d6be2b**;
  non-image security job text is byte-identical to HEAD. Local document links,
  JavaScript syntax and scoped whitespace checks passed. The initial blanket
  final-newline assertion rejected the workflow's pre-existing missing newline;
  the corrected check preserves that EOF style rather than editing another job.

Independent re-evaluation remains **MAIN's assignment** (no nested evaluator
available). No new hosted run or overall release PASS is claimed.

### Real Linux DAC and scanner proof

The explicit [Docker proof harness](../../tests/ci-image-scan-permissions.mjs)
ran **2026-09-23 17:03:58–17:05:32 UTC**, Docker **28.5.1**, Linux/aarch64.
It used the existing synthetic images, without rebuilding or launching the app.
Actual host `docker save -o` produced UID:GID **501:20**, mode **0600**. The
archive bytes were copied into newly created **native Linux Docker volumes**,
owned by fixture UID:GID **1001:1001**, still mode **0600**. No macOS bind mount
was used for the scanner's permission test.

The original root/cap-drop SBOM invocation failed for **both** images with the
exact `open /scan/image.tar: permission denied` diagnostic and exit **1**. The
fixed commands were extracted from the workflow itself; only mount sources and
the host UID/GID substitution were mapped to the Linux fixture. The input parent
directory was then tightened to **0700**, matching the corrected workflow.

| Existing image | Original SBOM exit | Fixed SBOM exit | CycloneDX components | HIGH/CRITICAL scan exit |
| --- | ---: | ---: | ---: | ---: |
| medapp-vosk-local-backend:latest | 1 | 0 | 172 | 0 |
| medapp-vosk-local-frontend:latest | 1 | 0 | 71 | 0 |

Both SBOMs are real CycloneDX **1.7**, with OS and library components. Both
vulnerability scans reported **zero HIGH/CRITICAL findings** with the unchanged
severity/exit-code flags and no unfixed-finding exclusion. The initially empty
cache downloaded the vulnerability database from `mirror.gcr.io/aquasec/trivy-db:2`;
the subsequent scan reused that writable cache. Both scans emitted the existing
warning **“This OS version is not on the EOL list” (Alpine 3.24)**. This is not a
claim about all severities, unrecognized packages, EOL support or amd64 images.

Native probes confirmed **CapEff=0**, **NoNewPrivs=1**, owner-writable report/cache
directories, no Docker socket, failure to write to the read-only input and
failure to write under the root home. Archive hashes were unchanged after both
real scans. All three fixture volumes and both full host archives were removed;
only private logs, SBOM content and the exit-code receipt remain. The existing
frontend/backend/PostgreSQL services remained running and healthy; no credential
file or live database was accessed.

Private evidence directory (outside the repository):
/var/folders/fp/vqlzzcv508q1tpv251j2pq6r0000gn/T/medapp-ci-image-permissions-2bAAnT

Receipt SHA256: **81228b46afca4473c5ca192532b08d78e0a7f502454821c7f8159f5db5bbbd99**.

| Evidence | SHA256 |
| --- | --- |
| Backend image ID | bacb7f1b1f812ed55c2370470c5c19348b33f8ee9fb5b5271814247aa2136409 |
| Frontend image ID | 81fd81378f0e83929d175509e7c8b52d83fa4bc7be660052f2cf3a00e552aa98 |
| Backend archive (before = after) | 3b186dc38cb57251a7f6c777e732b1b1d60ce02f60a41c48d668e01430a9da24 |
| Frontend archive (before = after) | 6be3995825ff64b1be5682f3b787393377471c39a1690e62909d486de4656048 |
| Backend SBOM | 54e5f5d27b5efa50721da03229ca2f1a36ea7e789adea37129d6bf9b943caacc |
| Frontend SBOM | 1af84306f3b3c8710f2e3f2869212cbb69d79aaff3a7432dba2453608784d92c |

