# GitHub CI fixes — hosted follow-up and CI-C, 2026-09-23

**Hosted database startup, both security images and CodeQL SUCCESS; all four
Verify cells FAIL on a clean-checkout documentation link. Full-history security
remains BLOCKED (eight findings).** MAIN pushed the earlier CI-A/CI-B corrections
as `d6f02c8`; the CI-C correction below is local, not staged, committed or pushed.
Independent CI-C review **FAILED** directory trailing-separator handling; the
narrow local correction is verified below. Independent re-review and the next
full hosted verification remain **PENDING**.
Earlier local verification and independent-review handoffs below are retained as
historical evidence, not promoted into a green-CI or release claim.

## Hosted follow-up and CI-C clean-checkout correction

MAIN reports [Verify 35897608711](https://github.com/gmalik9/med_app/actions/runs/35897608711)
at [d6f02c8](https://github.com/gmalik9/med_app/commit/d6f02c8): all four matrix
databases started successfully, then all four Verify jobs failed in the root
configuration tests. Both security-image jobs and CodeQL succeeded; the historic
eight-finding secrets gate still failed as expected. CI-C did not rerun images,
CodeQL, database provisioning or the history scanner.

The existing redacted logs for jobs **107305340612** and **107305340143** both
identify `new current guide links resolve locally (no network requests)` and
`QUALITY_AUDIT.md: broken local link`. CI-C inspected only those failure excerpts
and publishable source. A path-only inventory audit of **233 candidate files /
790 inline local links** found exactly one unpublished file target: `secrets.env`
in [QUALITY_AUDIT.md](../../QUALITY_AUDIT.md). It exists in the developer workspace
but is ignored and absent from checkout. The other non-file target was the valid
source directory [frontend/tests](../../frontend/tests); no other root guide
needed a link repair. No private target contents were read, copied or printed.

The audit now describes the private local configuration without linking it and
links the tracked [backend/.env.example](../../backend/.env.example) instead.
The private file stays ignored and authoritative locally; it must not be staged
or published. Ignore rules, workflows and historical findings are unchanged.

[Guide checks](../../tests/config-guides.test.mjs) now require both membership in
`git ls-files --cached --others --exclude-standard -z` and on-disk existence.
This includes unstaged tracked edits and eligible new files before commit while
excluding ignored-only targets. Only candidate root guides are read. The
[helper](../../tests/guide-links.mjs) resolves relative paths without network
access, rejects malformed/absolute/escaping paths, and checks every path component
with `lstat` before descending (no symlink targets). Directory links require an
existing regular candidate descendant. Fragments retain the previous behavior:
local file validation only, not anchor validation. This is a trusted-checkout
documentation guard, not a defense against concurrent hostile filesystem mutation.

The original eight [regressions](../../tests/config-guide-links.test.mjs) use disposable minimal
Git repositories, no commits/remotes/authentication, empty templates, disabled
hooks and isolated Git config. They prove rejection of an existing ignored fake
target, absent/indexed-but-deleted targets, traversal, malformed paths and symlink
files/ancestors; tracked examples, unstaged edits, eligible new files with encoded
spaces, source directories and external/fragment links retain intended behavior.
Only the fixtures' own temporary indexes are populated; the application index is
untouched. Before the documentation fix, all eight regressions passed and the
strengthened real guide gate failed **only** on `QUALITY_AUDIT.md -> secrets.env`
(12/13 passed, one expected failure), despite the private file existing locally.

### Original CI-C implementer verification (not independent acceptance)

Completed **2026-09-23 17:53:34–17:54:05 UTC**, Node **22.23.2**, Python
**3.14.4** (meets the 3.11+ tooling requirement):

| Check | Result |
|---|---|
| Workspace root configuration contracts | **77/77**, zero skipped/todo: original 69 plus eight new regressions |
| Clean candidate export, fresh `npm ci` | **PASS**, fresh dependencies/cache, npm audit **0 vulnerabilities** |
| Clean export `npm run test:unit` | **77 configuration + 51 backend + 726 frontend = 854 passed**, zero skips |
| Clean export `npm run typecheck` and `npm run lint` | **PASS**, both workspaces; lint retains its existing source scope |
| `node --check` on all three changed/new test modules | **PASS** |
| Clean export working-tree candidate secret check | **PASS**, no findings; not a history scan |
| All candidate Markdown inline local links | **796 checked**, no unpublished/missing/unsafe targets |

**Export method:** enumerate the real source root with the exact NUL-delimited
candidate inventory above; validate regular paths before copying only those
**235 current candidate files** (including the two new modules) into a fresh
temporary directory. No recursive copy of the workspace, ignored files,
dependencies, generated assets, original Git config, index or history. Initialize
an empty local Git repository with empty templates and disabled hooks; do not
stage or commit the export. All its candidates are initially untracked but
eligible. Assert the real `git rev-parse --show-toplevel` for both roots, no export
remotes/index entries, and exact source/export candidate-inventory equality before
installation. The actual Git-dependent publication checks, strict audit helper,
CI database identity/metadata contracts and mock-only provisioning tests execute
normally; no helpers are stubbed to manufacture a checkout pass.

Use an isolated HOME, Git config and npm config/cache, Node22 first on PATH,
Python3.14 and `CI=true`; pass no application credentials or database URL.
Before installation, private `secrets.env`, `.env`, `.env.local`, `backend/.env`,
`frontend/.env`, and the secrets/dependency/build/evidence directories are absent.
Those private filenames remain absent afterward. This is a clean **candidate
export**, not a clone of an uncommitted revision and not a Linux hosted run.

Private local logs and per-file SHA256 receipt are under
`/var/folders/fp/vqlzzcv508q1tpv251j2pq6r0000gn/T/medapp-ci-c-export-XLOcRl/`
(`receipt.json`, `npm-ci.log`, `main-units.log`, `typecheck.log`, `lint.log`, syntax
and candidate-scan logs). The one-off export harness is
`/tmp/medapp-ci-c-clean-export-20260923.mjs`, not a publishable repository artifact.
All 235 source/export candidate hashes and the original application Git-index
hash were unchanged during verification. The evidence records the receipt before
this results-only documentation update. No app/database/container operation,
integration/browser test, build, staging, commit, push or credential access was
performed. The private current environment file remains untouched and out of Git.

MAIN's assigned independent reviewer must retest, then MAIN may publish only the
reviewed candidate and continue full hosted verification. This local repair does
not clear either the remaining test gates or the full-history security gate.

### CI-C2 — independent rejection and narrow correction

Independent review found that POSIX path normalization retained a final `/`, but
the inventory check appended another `/`: a valid directory link `docs/` searched
for `docs//` descendants and failed while `docs` passed. The original green local
checks above did not cover that case and do not override the independent **FAIL**.

The helper now canonicalizes trailing separators in both resolution and target
validation. Absolute paths and raw traversal components are rejected before target
normalization; repository containment, candidate inventory membership, existing
regular descendants and component-by-component symlink refusal remain enforced.
**Repository-relative `.` and `./` are explicitly allowed**, canonically `.`;
like any directory they require an existing regular candidate descendant. An
absolute `/` is still invalid. Fragment handling is unchanged: local targets are
checked, fragment-only and HTTP(S) links are skipped, and anchors are not validated.

All eight original helper regressions remain, with stronger slash-form checks.
Five additional tests cover canonical separators, root semantics, explicit ignored
whitespace paths, and two actual-guide-gate fixtures. The fixtures copy and execute
the unchanged real guide gate in isolated temporary Git repositories. They accept
both `docs` and `docs/` with the same published children, even alongside ignored
files, and accept an ignored-pattern directory when an indexed regular child is
still publishable. Both slash forms reject empty, ignored-only, indexed-but-deleted
and symlink directories, including encoded whitespace private paths. No real
private file is accessed; all fixture content is inert.

| Narrow correction check — Node 22.23.2, 2026-09-23 | Result |
|---|---|
| New slash/root checks against unchanged helper, before correction | **Expected FAIL: 7/12 pass, 5 fail**, including actual guide gate rejecting `docs/`; whitespace-only test added afterward |
| Corrected helper + actual guide contracts | **18/18 PASS** (13 helper/regressions + 5 guide contracts), zero skips/todos |
| All configuration contracts | **82/82 PASS**, zero skips/todos; no database/full release run |
| Fresh isolated candidate export, unchanged real guide gates | **18/18 PASS**, no dependency install needed for these built-in Node tests |
| All exported Markdown inline local links | **796 checked across 53 Markdown files**, no failures |
| Scope/integrity checks | **235 candidates copied; 232 non-owned source hashes and original Git-index hash unchanged**; source/export hashes unchanged during validation |
| Syntax, editor diagnostics and owned-file whitespace | **PASS**, including untracked helper/test files |

Only the helper, its new regression module and this receipt were edited for this
correction. The original audit-document secret-link repair, actual guide gate,
ignore rules, workflows and all other files are preserved. The fresh export has
an empty isolated Git repository, no remotes or indexed files, and exactly the
candidate inventory; no ignored/private files, original Git configuration/history,
dependencies or generated assets were copied. No credentials, app/database/container
operations, staging, commit or push were involved.

Private local evidence is under
`/var/folders/fp/vqlzzcv508q1tpv251j2pq6r0000gn/T/medapp-ci-c-trailing-fcDcTv/`:
negative and final configuration/focused logs, baseline preservation hashes, and
fresh `candidate-*` exports with guide logs and SHA256 receipts. The first export
completed at **18:08:03 UTC**; a fresh final export validates this results-only
receipt update as well. This is implementer evidence only; MAIN's already-assigned
independent source/table re-review and the next hosted run remain **PENDING**.

## Original hosted failures

Both original runs used commit
[abbf4cc](https://github.com/gmalik9/med_app/commit/abbf4cc5cab2155adefa6d72bd04de482af0e12c):
[Verify 35819755428](https://github.com/gmalik9/med_app/actions/runs/35819755428)
and [Security 35819755504](https://github.com/gmalik9/med_app/actions/runs/35819755504).

| Job evidence | Observed result / root cause |
|---|---|
| Verify: [PG15 UTC](https://github.com/gmalik9/med_app/actions/runs/35819755428/job/107048887373), [PG15 New York](https://github.com/gmalik9/med_app/actions/runs/35819755428/job/107048887079), [PG17 UTC](https://github.com/gmalik9/med_app/actions/runs/35819755428/job/107048887274), [PG17 New York](https://github.com/gmalik9/med_app/actions/runs/35819755428/job/107048887284) | All four **Initialize containers** steps failed before checkout/tests: missing `TEST_DATABASE_PASSWORD` repository-secret input left PostgreSQL without a nonempty `POSTGRES_PASSWORD`. |
| Security: [frontend image](https://github.com/gmalik9/med_app/actions/runs/35819755504/job/107048887297), [backend image](https://github.com/gmalik9/med_app/actions/runs/35819755504/job/107048887404) | Builds succeeded; both SBOM steps failed with `open /scan/image.tar: permission denied`. Runner-owned archives were mode 0600; scanner UID 0 with all capabilities dropped could not bypass Linux DAC. Vulnerability scans were skipped, not passed. |
| [CodeQL](https://github.com/gmalik9/med_app/actions/runs/35819755504/job/107048887426) | Already **SUCCESS**; no CodeQL repair was needed. |
| [Full-history secrets](https://github.com/gmalik9/med_app/actions/runs/35819755504/job/107048887382) | **FAIL, eight findings**; correctly remains blocking, independently of the two CI repairs. |

## Current corrections and safety boundaries

**CI-A — job-owned PostgreSQL.** After checkout and Node setup,
[Verify](../../.github/workflows/verify.yml) invokes the
[database helper](../../tests/ci-database.mjs), generating a fresh 32-byte random
password and registering masks before use. **No supplied CI repository secret is
required**, including for ordinary unprivileged pull requests. The unchanged
[strict audit guard](../../tests/audit-database.cjs) accepts only PostgreSQL user
`audit`, loopback `127.0.0.1:55439`, database `medapp_audit`, and a nonempty private
password; no alternate target or URL overrides. Pinned PG15/17 images and
UTC/America_New_York remain the matrix. Fresh tmpfs storage, bounded readiness and
resources, and SCRAM authentication avoid existing application data. Cleanup uses
a private non-secret ownership receipt, verified owner label and immutable
container ID, with an `always()` retry; it never prunes unrelated resources.
`GITHUB_ENV` and parent directories are trusted runner paths: these checks are
**not general filesystem containment** against hostile parent replacement.
See [ci-database-fix.md](ci-database-fix.md) for interfaces and earlier probes.

**CI-B — scanner identity, not relaxed permissions.** Both scanner steps in
[Security](../../.github/workflows/security.yml) now match the runner's numeric
UID/GID, preserving owner-only 0600 archives, `--cap-drop=ALL`,
`no-new-privileges`, read-only inputs and read-only root filesystem. Reports and
cache use separate owner-writable private directories; `HOME`, `TMPDIR` and the
cache path are explicit. SBOM inventory is offline with `--network=none`;
vulnerability scans retain database-download access and the unchanged
HIGH/CRITICAL gate, including unfixed findings. Only SBOMs are uploaded, for
**seven days**; archives/cache are not published.

Independent review **rejected the newly added recursive cleanup beneath
`RUNNER_TEMP`**: quoting does not validate deletion ownership. That cleanup and its
unsafe required-command assertion were removed, not waived. There is no host
filesystem deletion step or assumption that root-owned scanner metadata is safe
for recursive removal. Private synthetic files remain until **fresh GitHub-hosted
ephemeral VM disposal**, including on failure/cancellation; this is not verified
secure erasure and **is not a policy for persistent/self-hosted runners or secret
inputs**. See [ci-image-scan-fix.md](ci-image-scan-fix.md) for the rejection,
correction, negative control and native-Linux proof.

## Earlier local verification and independent review (before hosted follow-up)

MAIN's completed full local run used Node 22.23.2 and the isolated job database.
Private log, not a published artifact: /tmp/medapp-ci-main-verification-20260923.log.

| MAIN full-run component | Passed |
|---|---:|
| Release/configuration contracts | 69 |
| Backend units | 51 |
| Frontend units | 726 |
| Required integration, all 11 suites | 936 |
| Real-browser E2E | 8 |
| **Total, zero skips** | **1,790** |

Type checks, lint and build passed; npm audit reported **0 vulnerabilities**.
MAIN reports four helper masking operations (values withheld) and removal of only
the job-owned database. Existing local app/Vosk containers and data were unchanged.
This is not a new dedicated Vosk-recognition run or a GitHub-hosted matrix pass.

MAIN's independent-review handoff records:

- **CI-A PASS:** 42 focused contracts, 69 aggregate contracts, and a native
  PostgreSQL 17 / America_New_York probe; the trusted-parent-path limitation above
  is retained, not promoted into a containment guarantee.
- **CI-B2 PASS after cleanup removal:** 11 focused and 69 aggregate contracts;
  native-Linux checks reproduced the old root/DAC failure and obtained exit **0**
  for **both fixed SBOMs and both vulnerability scans**. The Alpine **3.24
  EOL-list warning remains**; this is not an all-severity or platform-support claim.

Focused checks are subsets of the 69 aggregate contracts. Repeated reviewer runs,
four-cell provisioning probes and scanner checks are **not added** to 1,790.
Earlier 67-contract / 9-focused-image receipts remain historical, as does the
first CI-B cleanup **FAIL**. This coordinator checked documentation links,
retained evidence summaries and original public job metadata; it did not rerun
runtime tests or scanners.

## Unresolved historical exposure and publication gate

The owner's statement that the API key is in private secrets rather than GitHub
does not resolve historical exposure. MAIN verified through the **public GitHub
API** that old commit `8553de892fc4bbe2f24cc0c56c926dc880de24e5` still returns a
Google-key-shaped value at historical [backend/.env.example](../../backend/.env.example)
line 8 and [docker-compose.yml](../../docker-compose.yml) line 35; these file links
are navigation only, not present-day line citations. See the location-only
[history inventory](history-secret-findings.md#sanitized-finding-inventory).
No value was printed or tested, and no revocation is confirmed. **Equality with
the current ignored/private key is UNKNOWN**; no secret file was inspected or
comparison authorized. A shape match does not establish credential validity.

All **eight** history findings (two Google-key-shaped locations and six truncated
documentation examples) remain unresolved scanner findings. No exception,
suppression, history rewrite, rotation or provider test is authorized by this
handoff. Local passes and the original CodeQL success cannot clear this gate.

The older [publication receipt](publication-secretminimization.md) is historical:
its pending CI repository-secret setup is **superseded**, not an outstanding
requirement. MAIN must obtain independent CI-C review, publish the reviewed
clean-checkout fix and record the next full Verify/Security results. **Next hosted
verification PENDING; no green-CI or release claim.**
