# Final verification — locally tested, release authorization blocked

> **Current status — 2026-09-23: HISTORY SCAN PASS, rewritten advertised history only.**
> See [authorized remediation and evidence](history-remediation-20260923.md), which
> supersedes the historical gate FAIL below without changing its recorded facts.
> Revocation is **owner attestation, not provider-verified**. Old-commit API lookup
> still returned **HTTP 200**; GitHub cleanup and retained-copy risks remain unwaived.
> Hosted Security succeeded; Verify was in progress at handoff, not a final PASS.
> **Q1–Q7 production gates remain open**: the selected synthetic-pilot design is
> approved, **not implemented or accepted**. No production/ePHI authorization.
> All following results and statuses are preserved historical evidence, not new runs.

> Publication update (2026-09-22): recorded passwords are redacted to placeholders. Historical passes below predate the credential refactor; fresh DB/browser verification is pending. See [the current credential handoff](publication-secretminimization.md).

**SECURITY GATE FAIL — OWNER ACTION REQUIRED.** The pinned all-ref history scan
exited **1** with **eight findings**. Working-tree pattern scan zero, npm audit zero,
passing tests and corrected image scans do **not** clear this gate. Credential
validity/revocation is **UNVERIFIED**. Q1–Q7 policy/infrastructure decisions also
remain blocked. **Not production-ready for real ePHI; not HIPAA certification.**

Work date: **2026-09-20 local**, with final runs/artifacts on **2026-09-21 UTC**.
This is the implementation-I follow-up **documentation-only** reconciliation.
MAIN owns the observed full release, browser recapture, rebuild/scan and final local
stack evidence. This coordinator read safe summaries/counts and verified hashes;
it did not execute those earlier runs or invent additional test statistics.

## Independent acceptance and implemented features

Implementer environments **could not spawn nested evaluator tools**. MAIN assigned
**dedicated, distinct read-only/testing evaluators to every track A–L**. Failed
work was returned to implementers and corrected before acceptance. Qualified D/F
passes preserve unresolved historical failures; H and K have deliberately limited
acceptance scopes. No nested evaluator or implementer self-PASS is fabricated.
Verdicts are MAIN's final handoff, supported by available retained receipts, not a
new evaluation by this documentation coordinator. MAIN's independent documentation
cross-check is **COMPLETED**; see the closure receipt below. Older track documents' evaluator-pending statements
are historical handoffs superseded by this report and the [ledger](IMPLEMENTATION_STATUS.md).

| Track | Final independent disposition | Implemented / verified scope and limitation |
| --- | --- | --- |
| A | **PASS**, release/contracts with I | Corrected migration-count assertions, fail-closed integration inventory, Node22 and PG15/17 matrix. [A receipt](track-a-release.md). |
| B | **B3 PASS** | Generation-bound session handling, refresh/logout/capabilities and strict validation. Later date-query correction independently covered by MAIN's final **451 routing + 12 lifecycle** cases; B3 itself predates that addition. [B receipt](track-b-sessions.md). |
| C | **C3 PASS** | Unsaved-draft navigation, originating patient/session identity across async forms, conflict comparison/reconciliation and explicit AI accept/discard before separate save. [C receipt](track-c-drafts.md). |
| D | **D3 PASS WITH HISTORICAL FLAKE; D4 frontend PASS** | Transactional actor+operation+key idempotency for vitals/appointments/visits; patient is payload, changed intent 409, replay keeps resource identity/current representation. **32 × 10** stress with **1,600 completed requests**, then independent **32 × 3**. Old HTTP timeout cause **UNKNOWN**. Separate later frontend test-only correction gives **D18 / full frontend644**. D4 independently passed **18 focused frontend cases under Node22**; source and **106 protected files unchanged**, actual async settlement and two meaningful additions, no sleeps/retries/timeout inflation. This does not explain the historical backend timeout. [D chronology](track-d-idempotency.md). |
| E | **E2 PASS, 31 tests** | Read-only production schema checks, migrations **[1,2,3]**, structural indexes, approval-gated CLI, count-only measurement/collision preflight. Existing v2 collisions abort without deleting rows. Actual deployed roles/TLS and universal DDL denial remain unverified; PUBLIC TEMP was allowed locally. [E receipt](track-e-database.md). |
| F | **F3 PASS WITH HISTORICAL FLAKE** | Scope-bound keyset directory/history paging, strict response envelopes, identity/epoch-safe UI retry/refresh. Independent **48 × 3 backend + 490 frontend** pass using one HTTP server, **20s response / 22s deadline** diagnostics. Old HTTP400/timeouts remain unexplained; no snapshot-isolation claim. [F chronology](track-f-pagination.md). |
| G | **G3 PASS** | **362/362 required + 29 independent probes**; safe request/terminal metadata, restricted patient/resource references and PHI-minimized diagnostics. Read auditing still best effort, not durable-before-disclosure or immutable retention. [G receipt](track-g-audit.md). |
| H | **PASS — ADR/policy structure only** | Seven pending ADRs and **42 negative specs NOT RUN**. Q1–Q7 **PENDING — NOT IMPLEMENTED**; checker exit **2 BLOCKED**, not release success. [H receipt](track-h-decisions.md). |
| I | **PASS — 17 contracts at evaluation** | Integration classification/strict result checks, runbooks and image provenance; corrected exact PG **[15,17]** test prerequisite. L adds six source contracts, giving final **23**, not retroactively 23 at I's evaluation. [I receipt](track-i-integration.md). |
| J | **PASS — 8 real-browser cases** | Independent prior capture, all mocks declared, source unchanged. MAIN separately recaptured eight cases and verified eight PNGs, 120 protected files and unchanged schema catalog. [Browser manifest](browser-evidence.md). No live AI/real PHI. |
| K | **PASS — artifact-scoped triage only** | Sanitized historical locations/classification/hash review, **not secret-gate PASS**. Owner containment/remediation and rescanning remain required. [K triage](history-secret-findings.md). |
| L | **PASS — 23 source + 9 explicit cases** | Two cases overlap: **30 distinct in those two evaluator runs**, not 32. Fresh independent image scan zero HIGH/CRITICAL after 11 global-npm findings; MAIN independently rebuilt/rescanned and ran three runtime cases. [L receipt](track-l-image-security.md). Coverage warning retained below. |

## Parent-owned release matrix

All runs use **Node 22.23.2**, guarded loopback synthetic PostgreSQL and local Chrome
for E2E. PG majors/timezones were supplied by MAIN's controlled environment; test
summaries and per-run hashes below were read from its actual logs. These are local
full release passes, **not successful hosted CI or full security clearance**.

| MAIN full-pass environment | Root contracts | Backend units | Frontend | Required integration | E2E | Types / lint / build / npm audit |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| PostgreSQL 17 / UTC | 17 | 47 | 642 | 936 | 8 | PASS / PASS / PASS / 0 advisories |
| PostgreSQL 15 / America/New_York, corrected rerun | 17 | 47 | 642 | 936 | 8 | PASS / PASS / PASS / 0 advisories |
| PostgreSQL 15 / UTC, corrected rerun | 23 | 47 | 644 | 936 | 8 | PASS / PASS / PASS / 0 advisories |
| PostgreSQL 17 / America/New_York, final | 23 | 47 | 644 | 936 | 8 | PASS / PASS / PASS / 0 advisories |

**Latest full total: 1,658 test cases = 23 + 47 + 644 + 936 + 8.** Earlier cells
precede six L contracts and two D frontend regressions. No claim that those newer
cases ran in the earlier cells. Do not sum repeated matrix/stress/focused/evaluator
runs as distinct coverage. Every full-pass log explicitly confirms **11 required
integration suites, 936 passed, zero skipped/todo**, followed by eight E2E passes
with zero failed/timed-out/skipped/interrupted cases and zero runner errors. The
strict date-query451 and lifecycle12 suites are present in each full-pass log.

### Retained failure chronology

1. Earlier cross-track/evaluator failures were returned for correction: migration
   assertions/readiness needed all three versions; B routing/validation, C async
   identity, D key namespace/dual-index concurrency, E measurement preflight,
   F paging fixtures/envelopes and G audit references/assertions were re-evaluated.
   Individual track reports retain their detailed red/green chronology.
2. **PG15/New York initial full gate FAILED:** **735 passed, 201 skipped** out of
   936 integration cases, with **four suite setup failures** caused by PG17-only
   prerequisites. This is not 235 passes and not a release pass. The test helper was
   corrected to probe the actual server and accept exactly **[15,17]**, with strict
   optional `EXPECTED_PG_MAJOR`; the complete rerun passed without skips.
3. **PG15/UTC initial full gate FAILED before integration:** frontend **641 passed /
   one failed** out of 642. The D assertion ran before async native WebCrypto digest
   settlement; separately, obsolete history fixtures lacked valid pagination
   metadata. A controlled delayed-digest probe reproduced the invalid assertion
   boundary with a valid page. **TEST-ONLY** fixture/settlement corrections retained
   original assertions and added two regressions: **D18**, full frontend **644**.
   MAIN subsequently reran the complete PG15/UTC and PG17/New York gates green.
4. **D's older backend one-request timeout remains UNKNOWN / NOT REPRODUCED.**
   The 1,600 complete stress requests and independent 32 × 3 pass are stability
   evidence, not its root cause. The later explained frontend test race is distinct.
5. **F's old unexpected HTTP400/timeouts remain UNKNOWN / NOT REPRODUCED.** Retain
   the initial 26/28, then 27/28, then 28/28 sequence. Later single-server diagnostics,
   deliberate malformed-HTTP controls, 48 × 3 and frontend490 passes do not establish
   why the original failures occurred or justify deleting them.
6. J's first 7/8 browser run used an invalid non-UUID retry fixture; corrected to
   UUIDv4 without relaxing API validation. L/evaluator external harness prerequisite,
   workspace-manifest inventory and unpublished-port representation errors were
   corrected and rerun; their failed receipts remain in the L chronology. The
   original **11 image HIGH/CRITICAL findings** and **eight history findings** remain
   recorded; only the image policy has a passing fresh scan.

### Release log provenance

Local-only paths, not repository attachments or durable hosted artifacts. Logs were
not copied into the repository; only safe summaries and SHA-256 are retained here.

| Run / local log | SHA-256 |
| --- | --- |
| PG17 UTC PASS: `/tmp/medapp-orchestrator-release-pg17-20260920.log` | `500a1101ff256d123e30a97aceea53a1f5b2495e847631d31c1ef508656f79e0` |
| PG15 NY FAILED: `/tmp/medapp-orchestrator-release-pg15-ny-20260920.log` | `e4a7ca89b172b9ff63a6cc046547a2f4927c7c51bdba2180ce7b971dce41fe5b` |
| PG15 NY PASS: `/tmp/medapp-orchestrator-release-pg15-ny-final-20260920.log` | `701686200d35b9855337afef6a1d0e25153482d3212da42139889a03d36f0366` |
| PG15 UTC FAILED: `/tmp/medapp-orchestrator-release-pg15-utc-20260920.log` | `a17b9d3f95072fbe0f03d3fac9249ce956d06611ba0d79d10db1038ab5052f1a` |
| PG15 UTC PASS: `/tmp/medapp-orchestrator-release-pg15-utc-final-20260920.log` | `a61d8259cb9c7d75a5c5bdde86c7bc4227686110faf479111d517bd1dfa7dd68` |
| PG17 NY PASS: `/tmp/medapp-orchestrator-release-pg17-ny-final-20260920.log` | `5b77f1f9a72b21a50b618f42de87dc4200921c5c2559d94c2a560e92673f1add` |

## Browser proof

- **Independent J: eight real-browser cases PASS**, prior capture; all mocks declared,
  protected source unchanged. **MAIN independent recapture: 8/8 PASS** at the actual
  **2026-09-20T23:45:33.932Z–23:45:50.893Z** manifest timestamps. It predates the later
  two test-only D additions; later full-release E2E passes are separately in the matrix.
- MAIN safety proof: zero page errors, unexpected console/HTTP events, failed or
  external requests; unchanged schema catalog and **120 protected files**; all
  **eight PNG hashes/dimensions valid**. Expected negative HTTP/console events are
  declared, not misleadingly counted as absent. No trace/auth-state/raw PHI capture.
- [Conflict review — real HTTP409](screenshots/04-conflict-review.png),
  [AI review — explicitly MOCKED, NOT LIVE AI](screenshots/05-ai-mocked-review.png),
  [History — real database cursor page](screenshots/06-history-load-more.png).
  Full captions, UTC timestamps and hashes: [unchanged manifest](browser-evidence.md).
- AI success is a synthetic browser interception; disabled real provider returns
  503. Delayed real responses and acknowledgement loss are explicit test injections.
  No live AI, real PHI, camera/OCR clinical-quality or vendor-approval claim.
- **Legacy timestamp display ambiguity remains Q6 and a high-clinical-use gate.**
  Browser UTC/green screenshots and PG timezone tests do not determine the meaning
  of historical wall timestamps or fix their display. No unapproved conversion.
- Local proof `/tmp/medapp-orchestrator-browser-proof-20260920.log`, SHA-256
  `5280c0a12c62d35cc916b87f9f58981dfc929d1cce60a501afe7777499727f78`.

## Image runtime and SBOM evidence

MAIN's original backend scan found **10 HIGH + 1 CRITICAL at seven global npm
package paths**, not application dependencies covered by root npm audit. L removed
unused global npm/Yarn/Corepack launchers/trees/caches **after** deterministic
production installation, only in the runtime image. Build-stage/host npm remains;
application dependencies, native/OCR assets and compiled output were independently
checked unchanged. This removes final-filesystem tooling, not historical layer bytes.

Independent L used pinned Trivy **0.74.0**, executed a fresh scan **0 HIGH / 0 CRITICAL**,
and passed **23 source / 9 explicit overlapping cases** plus a fresh PG15 lifecycle.
MAIN then independently rebuilt `medapp-hardening-backend:verified`, freshly scanned
it **0 HIGH / 0 CRITICAL**, and ran the actual-image contract **3/3 PASS**. Frontend
scan also reports **0 HIGH / 0 CRITICAL**. The mutable `verified` tag was previously
the vulnerable baseline: distinguish scans by their hashes/config IDs, not tag alone.
Final backend Trivy ImageID:
`sha256:9799f0152b53f4c6e843b90e569202c4d18c2698392b707a399350bb02003d6c`.

**Coverage qualification:** only HIGH/CRITICAL were scanned, not lower severities.
Both logs retain the **Alpine 3.24 “not on the EOL list” warning**. Zero does not
certify full OS/native coverage, EOL support, other architectures, future advisory
databases, full offline OCR recognition or production security.

MAIN's final local Docker stack used **PG17, fresh synthetic schema
`orchestrator_final_smoke_20260921`**. Direct compiled Node migration required
`--approved-production --confirm-migration` and `RELEASE_MIGRATION_APPROVED=true`.
Normal production startup omitted privileged migration environment. MAIN observed:

- `/health` **200**, `/ready` **200**; nginx index and compiled JS asset **200**,
  CSP and `Cache-Control: no-store` present.
- Proxied unauthenticated patient read **401**; production self-registration **403**.
- API/web UIDs **1000 / 101**; graceful stops **exit 0**, **no OOM**.
- Local HTTP/synthetic PostgreSQL only: **no cloud deployment, production TLS,
  deployed least-privilege role or real-data migration claim**.

MAIN's cleanup is **COMPLETED**: only audit PG17 was reset to **UTC** with
`ALTER SYSTEM` and `pg_reload_conf`, then stopped. Docker inspection confirmed audit
PG17, hardening PG15 and final API/web all **running=false, exit 0**. No volumes or
retained fixtures were deleted; built images and synthetic databases remain retained.
This documentation closure performed no container/database actions.

All following artifacts remain under `/tmp/medapp-orchestrator-security-20260920/`:

| Artifact | Result | SHA-256 |
| --- | --- | --- |
| `backend-vulnerabilities.json` | Baseline 10 HIGH / 1 CRITICAL, all global npm | `31cd0f7e396f423ffa6b3552703d15590df750eb540ae7a2b69b6cb65e39dd00` |
| `backend-final-vulnerabilities.json` | MAIN fresh 0 HIGH / 0 CRITICAL | `4976fd48fa07c700c90136a7898392a81362b0e4106162c664bf46d10785d951` |
| `backend-final-scan.log` | Coverage warning retained | `5cb28b95b2fa7c6a48fb12f177734e61d84124fd639f01bd4849ee33ea1ab7c3` |
| `frontend-vulnerabilities.json` | 0 HIGH / 0 CRITICAL | `d064568eb0fe476d13dc8b0e4dbca04605714bf67678d1feaff295f9871e0b70` |
| `frontend-scan.log` | Coverage warning retained | `91ca5e2e95d4b39bb65413be7d023502dba5a89341c23b0ae942c4ebc2453675` |
| `backend-final.cdx.json` | CycloneDX **1.7**, **172 components** | `105d3beaf12188c9418176d9529f5f95f6e033aa93256799903b0be44ced0009` |
| `frontend-final.cdx.json` | CycloneDX **1.7**, **71 components** | `b3e55ef6806bcd1a9b3c005a424d5ccaf72de852a0c4899c2594f9899157f503` |

SBOM component counts describe inventories, not extra tests or absence of all
vulnerabilities. Archives, reports and SBOM binaries/JSON were not copied into Git.

## Credential/security gate — still FAIL

MAIN used pinned **Gitleaks 8.30.1**, all local refs (`--log-opts=--all`),
`--redact=100`, **network none**; logged **51 commits scanned, eight findings,
exit 1**. K's **53 reachable commits** count differs and is **not reconciled**;
that difference alone is **not proof of missing commits**. Neither remote-only refs
nor unreachable objects/forks/clones are certified covered.

- Two occurrences of **one Google-key-shaped historical value** at commit
  `8553de892fc4bbe2f24cc0c56c926dc880de24e5`: historical example environment line 8
  and Compose line 35. Exposure of the literal is confirmed; authenticity, key
  ownership/use, validity and revocation remain **UNVERIFIED**.
- Six truncated JWT documentation examples at commit
  `57771fb7f785557dcbfb7fc94a941497e9a8c41a`, historical API lines
  42/43/68/69/81/88. They are not complete JWTs as written, **not a waiver**.
  Full sanitized commit/location inventory and owner plan: [K triage](history-secret-findings.md).
- Independent K **artifact-scoped PASS** verifies triage, not scanner clearance.
  Current-tree pattern scan **0 is not full-history PASS**. Ignored current
  environment/secret files were never read by this coordination pass; no real key
  tested, external provider contacted, rotation/revocation, history rewrite or
  ignore/allowlist change performed.
- Required owner actions: preserve restricted evidence; establish ownership,
  restrictions and exposure/use from approved administrative evidence; authorize
  containment/rotation/revocation as appropriate; coordinate repository remediation
  without erasing required evidence; rerun the pinned all-ref scan with documented
  scope/count reconciliation and independent review. Do not change exit codes,
  silently skip history, suppress findings or claim legal incident conclusions.

Local redacted report `/tmp/medapp-orchestrator-security-20260920/history-redacted.json`:
SHA-256 `5552e73118497ccf36ca53354e6b003de999beeca86cb38a13723d78fc7e85ed`.
Log `/tmp/medapp-orchestrator-security-20260920/history-scan.log`:
SHA-256 `f6920c8e0099208b4004bfd2ed56908baae636376bc18ede78fadc6255a3dba6`.
No raw finding values/Match fields, historical source blobs or logs are reproduced.

## Remaining policy and operational blocks

| Owner decision / unverified control | What remains blocked |
| --- | --- |
| [Q1 — access model](../decisions/0001-phi-access-model.md) | Shared-clinic records are intentional, not tenant/care-team isolation; approve memberships/legacy assignment. |
| [Q2 — identity](../decisions/0002-identity-provisioning.md) | Approved enrollment/IdP, MFA, recovery and offboarding. |
| [Q3 — browser sessions](../decisions/0003-browser-session-topology.md) | Credentials remain JavaScript-readable; choose topology and designed cookie/BFF/CSRF contract. |
| [Q4 — audit availability](../decisions/0004-audit-availability.md) | Durable pre-disclosure event/outbox, immutable sink, privilege separation, emergency/outage policy. |
| [Q5 — clinical lifecycle](../decisions/0005-clinical-versioning-retention.md) | Full immutable revision history, amendments/finalization, retention/legal holds/export; no invented deletion. |
| [Q6 — legacy time](../decisions/0006-legacy-time.md) | Historical timezone provenance and clinical display ambiguity; no assumed UTC or unapproved backfill. |
| [Q7 — infrastructure/vendors](../decisions/0007-infrastructure-vendors.md) | Actual cloud/DB TLS, encrypted backups, restore/RPO/RTO, alert delivery, approved hosting/AI/IdP contracts and vendor/organizational review. |
| Repository/operations owners | Hosted CI, CodeQL results and required branch protection still **unverified**. Process-local limits/OCR admission, scaling and real production restore evidence remain separate from local tests. |

All seven ADRs remain **PENDING — NOT IMPLEMENTED**, **42 proposed specs NOT RUN**.
Structural acceptance is not verification of those runtime controls. Historical
synthetic restore/performance observations in [QUALITY_AUDIT.md](../../QUALITY_AUDIT.md)
are not new production evidence or newly repeated benchmarks.

## Reproduction and documentation-only scope

Use supported Node22, the installed dependencies and an already approved synthetic
database/browser. Commands below were exercised by MAIN/evaluators; this coordinator
previously reran only the source release contracts/link checks, **not a full build or
matrix**. This final documentation closure executes no tests or artifact regeneration.

| Scope | Tested command / requirements |
| --- | --- |
| Source/documentation release contracts | `npm run test:release` — final **23**, no database/image opt-in required. |
| Full local release | `TEST_DATABASE_URL='postgresql://audit:<test-database-password>@127.0.0.1:55439/medapp_audit' PLAYWRIGHT_CHANNEL=chrome npm run verify:release` with the intended PG15/17 and UTC/New_York already configured by MAIN. Setting process `TZ` alone does not change database timezone. |
| MAIN browser capture proof | `TEST_DATABASE_URL='postgresql://audit:<test-database-password>@127.0.0.1:55439/medapp_audit' PLAYWRIGHT_CHANNEL=chrome EVIDENCE_SCREENSHOTS=true node tests/evidence-safety.mjs --capture` — requires prior build and **both** opt-ins; regenerates manifest/PNGs, so **not rerun by this coordinator**. Without `--capture`, the safety runner forces capture off. |
| MAIN final actual-image check | `MEDAPP_RUNTIME_IMAGE=medapp-hardening-backend:verified node --test tests/runtime-image-contract.test.mjs` — **3/3**, needs the inspected local image/container CLI. |
| L explicit source/archive/image check | `node --test tests/config-runtime-image.test.mjs tests/runtime-image-contract.test.mjs` with **all three** image/archive/fresh-report inputs from [L receipt](track-l-image-security.md); **9/9**, including two source overlaps. No implicit image success. |
| Production image database CLI | [Direct Node commands and approval/exit contract](../../OPERATIONS.md#runtime-image-direct-node-commands); no runtime npm/Yarn/Corepack. Real migrations still need authorized environment, backup and data-owner approval. |

Earlier coordinator-owned delta: this new report, [implementation ledger](IMPLEMENTATION_STATUS.md),
[browser status text only](browser-evidence.md), current top supplements in
[quality audit](../../QUALITY_AUDIT.md) and [hardening plan](../../HARDENING_PLAN.md),
plus [operations](../../OPERATIONS.md). No application/test/config/dependency/lock,
image, secret, screenshot, browser hash row or other-track receipt edits. The
user-accepted cosmetic Dockerfile EOF is untouched. Pre-existing all-code worktree
changes belong to the implementers, not this documentation delta. Final document
checks and MAIN's independent document review are separate from the 1,658-case total.

### Coordinator validation receipt — earlier documentation pass

- **Node22.23.2 source release contracts: 23/23 PASS**, zero failures, cancelled,
  skipped or todo, with all actual-image opt-in variables unset. No full build,
  database suite, browser recapture, scan or container lifecycle run in this pass.
- **155 local link/anchor occurrences checked**, all resolve; six owned files pass
  trailing-whitespace/final-newline checks and editor diagnostics.
- Browser capture manifest/hash rows and source/build fingerprint section are
  **byte-for-byte unchanged**; section SHA-256
  `084afef61b1a30f3513dc82dab668eb75c170a0a2c991361952714fd913afab6`.
  **8/8 PNG hashes, signatures and 1440 × 1100 dimensions verified unchanged**.
- **203 eligible non-owned workspace files unchanged** against the pre-edit
  fingerprint (source/tests/configuration, other docs, generated app build output
  and screenshots included). SHA-256 of the sorted JSON path/hash inventory:
  `43c08c02ab9725eec12fe9971ba1b26dae24e49997604bbbca840e99d0ff55a6`.
  Environment/secret paths, dependency directories and Git internals were excluded,
  not read or certified by this inventory. No claim about excluded-file contents.
- **Documentation-only scope verified. MAIN independent document review COMPLETED.**
  MAIN parsed all four full-PASS logs: **(47, 642, 936)** for earlier PG17/UTC and
  PG15/New York, **(47, 644, 936)** for final PG15/UTC and PG17/New York; each records
  **eight browser passes, zero skips and npm audit 0**. MAIN independently matched
  all **eight PNG SHA-256 values and 1440 × 1100 dimensions** to the manifest,
  confirmed final image JSON **0 HIGH / CRITICAL**, and resolved all relative file
  links in the six final documents. MAIN read this report and viewed the real-app
  conflict screenshot. These checks do not clear the history-secret, policy or
  production-authorization blocks or claim legal HIPAA compliance.

