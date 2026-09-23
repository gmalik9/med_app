# GitHub CI fixes — current pre-push status, 2026-09-23

**Two CI defects corrected locally; hosted rerun PENDING. Full-history security
remains BLOCKED.** The fix commit has not been pushed; MAIN owns publication and
the later hosted-result update. This documentation-only summary records MAIN's
verification and independent-review handoff, not a new test run or release approval.
It supersedes earlier CI repository-secret prerequisites and review-pending
statements in the linked receipts, without rewriting their historical results.

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

## Verification and independent review

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
requirement. MAIN must publish the reviewed fix and record the new Verify/Security
run links and outcomes. **Hosted rerun PENDING; no green-CI or release claim.**
