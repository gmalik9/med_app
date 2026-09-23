# Implementation status — final coordination ledger

> **Current status — 2026-09-23: HISTORY SCAN PASS, rewritten advertised history only.**
> See [authorized remediation and evidence](history-remediation-20260923.md), which
> supersedes the historical gate FAIL below without changing its recorded facts.
> Revocation is **owner attestation, not provider-verified**. Old-commit API lookup
> still returned **HTTP 200**; GitHub cleanup and retained-copy risks remain unwaived.
> Hosted Security succeeded; Verify was in progress at handoff, not a final PASS.
> **Q1–Q7 production gates remain open**: the selected synthetic-pilot design is
> approved, **not implemented or accepted**. No production/ePHI authorization.
> All following results and statuses are preserved historical evidence, not new runs.

**SECURITY GATE FAIL — OWNER ACTION REQUIRED.** The pinned full-history scan still
reports eight findings; local tests, working-tree scan zero and image scan zero do
not clear it. See [credential triage](history-secret-findings.md) and the
[final verification report](FINAL_VERIFICATION.md).

**2026-09-22 Vosk follow-up (documentation-only):** MAIN completed the independent
locked/pinned Docker rebuild, corrected default real-WASM synthetic browser gate
(nine scenarios, one 55.6-second gate, no screenshot/receipt writes), 23 capture
guards and Node 22 / PostgreSQL 17 / UTC full release: **1,749 distinct cases**
(32 + 47 + 726 + 936 + 8; nine assets and 82 speech units already included).
V1 independent checks and V2-R 220 units/25 native controls passed; prior failures
remain historical. **The new `medapp-vosk-local` app is LEFT RUNNING, all three
services healthy**, unlike the older audit stacks discussed below. Only the
separate regression container was stopped; original project/host PostgreSQL were
untouched. [Final Vosk handoff, log hashes and service state](vosk-browser.md#main-final-handoff--2026-09-22)
and [usage guide](../VOSK_DICTATION.md) record the current scope. This is synthetic
local development, not [approved-pilot implementation](../decisions/APPROVED_PILOT_SCOPE.md)
or clinical acceptance. The historical credential/security gate remains **FAIL**,
not rerun/resolved; no rotation, GitHub action, history rewrite or suppression.
The dated A–L evidence and counts below remain unchanged historical records.

Work date: **2026-09-20 local; final evidence extends into 2026-09-21 UTC**.
Owner: final documentation coordinator, implementation-I follow-up. This ledger
supersedes the earlier I handoff's pending statuses, not the retained failure history.

## Independence and acceptance

Implementer environments **could not spawn nested evaluator tools**. MAIN assigned
**dedicated, distinct read-only/testing evaluators for each track**. Failed work was
returned to its implementer, corrected and re-evaluated before acceptance; D/F
acceptance explicitly retains unresolved historical flakes. No implementer self-PASS
is relabelled independent. Independent verdicts below are MAIN's final handoff,
cross-checked against available receipts; MAIN separately owns the combined runs,
browser recapture and rebuilt-image evidence. This documentation pass did not rerun
those gates or spawn an evaluator. MAIN's independent documentation cross-check is
**COMPLETED**: four full-PASS logs/counts, browser outcomes, PNG hashes/dimensions,
final image JSON and six documents' relative file links checked; MAIN also read the
final report and viewed the real-app conflict screenshot. MAIN's audit-PG17 UTC
reset/stop is **COMPLETED**; audit PG17, hardening PG15 and final API/web are all
stopped, exit 0, with volumes/fixtures/images/synthetic databases retained. See the
[closure receipt](FINAL_VERIFICATION.md). Older track receipts saying evaluator pending describe their handoff
time; this ledger and the final report supply the later acceptance status.

## Final per-track status

| Track | Independent disposition / implemented result | Qualification and evidence |
| --- | --- | --- |
| **A — release/contracts** | **PASS**, with I: corrected migration-count assertions and PostgreSQL 15/17 matrix prerequisites; required integration fails closed on absent/skipped results. | [A evidence](track-a-release.md), [I correction](track-i-integration.md), [MAIN matrix](FINAL_VERIFICATION.md#parent-owned-release-matrix). Hosted CI/CodeQL/branch protection remain unverified. |
| **B — sessions/validation** | **B3 PASS**; session generations, refresh/logout/capabilities and validation safeguards. Later strict single-note date queries: **451 routing + 12 lifecycle** run green in final MAIN integration. | [B evidence](track-b-sessions.md). B3 preceded that addition; final coverage is separately attributed to MAIN. Browser-readable credentials, Q2/Q3 remain. |
| **C — clinical drafts/identity** | **C3 PASS**; unsaved navigation, async originating identity, conflict reconciliation and explicit AI review. | [C evidence](track-c-drafts.md), [browser evidence](browser-evidence.md). No live AI certification or persistent PHI draft store. |
| **D — idempotency** | **D3 PASS WITH HISTORICAL FLAKE; D4 frontend PASS**. Implementer **32 × 10** stress passed with **1,600 completed requests**; independent **32 × 3** passed. D4 separately passed **18 focused frontend cases under Node22**, source and **106 protected files unchanged**. | [D chronology](track-d-idempotency.md). Original one-HTTP-timeout cause **UNKNOWN / NOT REPRODUCED**. Separate later MAIN UI failure: async WebCrypto settlement and invalid pagination fixtures corrected **TEST ONLY**; D18 and final full frontend **644** pass. D4 accepted actual async settlement and two meaningful additions, without sleeps/retries/timeout inflation. Not a fix or explanation of the old backend timeout. |
| **E — database lifecycle** | **E2 PASS, 31 tests** (26 operations + 5 measurement preflight). Read-only production boot/readiness; exact **[1, 2, 3]** and structural uniqueness; explicit approved migration CLI. | [E evidence](track-e-database.md). V2 collisions abort with rows preserved. Deployed roles/TLS unverified; local PUBLIC TEMP allowed; Q6 unresolved. |
| **F — pagination** | **F3 PASS WITH HISTORICAL FLAKE**. Independent **48 × 3 backend** and **490 frontend** pass after correction; single HTTP server with **20s response / 22s deadline** instrumentation. | [F chronology](track-f-pagination.md). Prior unexpected HTTP 400/timeouts retained, historical cause **UNKNOWN**. Controlled parser errors are not old-failure reproductions; no snapshot guarantee. |
| **G — audit/observability** | **G3 PASS: 362/362 required + 29 independent probes**; safe diagnostics, request/terminal metadata and restricted successful resource references. | [G evidence](track-g-audit.md). Earlier failures/corrected assertions retained. Ordinary read auditing remains best effort; no durable-before-disclosure/outbox/immutable retention guarantee. |
| **H — decisions/scaffolding** | **PASS for policy/ADR structure only**. Seven Q1–Q7 ADRs **PENDING — NOT IMPLEMENTED**; **42 specs NOT RUN**, zero runtime policy controls verified. | [H evidence](track-h-decisions.md). Checker exit **2 BLOCKED is not release PASSED**. Approval and implementation still required. |
| **I — serial integration** | **Independent PASS, 17 contracts** at evaluation; L subsequently adds six, giving **23** in final MAIN release runs. | [I evidence](track-i-integration.md). PostgreSQL guard now accepts exactly [15,17], probes the actual server, honors optional strict `EXPECTED_PG_MAJOR`. No new production-version support inferred beyond that matrix. |
| **J — real browser evidence** | **Independent PASS, 8 cases**, all mocks declared and source unchanged. MAIN independently recaptured **8/8**, unchanged schema catalog/120 protected files; eight PNG hashes valid. | [Browser manifest](browser-evidence.md). Real API/DB plus explicit synthetic AI interception and acknowledgement/delay injection; no real AI/PHI. Q6 clinical display ambiguity remains. |
| **K — secret triage** | **Independent artifact-scoped PASS**, **not secret-gate PASS**. Sanitized locations/classification/provenance reviewed. | [K evidence](history-secret-findings.md). Full-history scan **FAIL**: two occurrences of one Google-key-shaped historical value and six truncated JWT examples. Validity/revocation **UNVERIFIED**; authorized owner action required. |
| **L — runtime image security** | **Independent PASS: 23 source + 9 explicit cases**, two overlap. Fresh Trivy **0 HIGH / 0 CRITICAL** after 11 baseline global-npm findings; MAIN independently rebuilt/rescanned and ran **3/3** runtime cases. | [L evidence](track-l-image-security.md), [MAIN artifacts](FINAL_VERIFICATION.md#image-runtime-and-sbom-evidence). Removed unused global npm/Yarn/Corepack only after production install. Lower severities unscanned; Alpine 3.24 EOL-list coverage warning retained. |

## MAIN combined verification

All four **Node 22.23.2 / PostgreSQL 15 or 17 / UTC or America/New_York** cells
have observed full local release passes, at the revisions/counts below. Do not
retroactively assign newer test counts to earlier runs.

| PostgreSQL / timezone | Contracts | Backend units | Frontend | Integration | E2E |
| --- | ---: | ---: | ---: | ---: | ---: |
| 17 / UTC | 17 | 47 | 642 | 936 | 8 |
| 15 / America/New_York, corrected rerun | 17 | 47 | 642 | 936 | 8 |
| 15 / UTC, corrected rerun | 23 | 47 | 644 | 936 | 8 |
| 17 / America/New_York, final | 23 | 47 | 644 | 936 | 8 |

Latest full run: **1,658 test cases = 23 + 47 + 644 + 936 + 8**. Repeated matrix,
stress, focused, evaluator and browser runs are **not extra distinct coverage**.
Each full pass includes strict types, lint, build and npm audit **0**. Each checked
integration receipt explicitly reports **11 suites, 936 passed, zero skipped/todo**.
Earlier PG15/New York **735 passed / 201 skipped / four suite setup failures** and
PG15/UTC **641 frontend passed / one failed** remain failures, not partial passes;
see [failure chronology and log hashes](FINAL_VERIFICATION.md#retained-failure-chronology).

## Remaining release boundaries

- Required integration covers every backend suite except the two reviewed
  security/configuration unit suites. [Suite classification](track-i-integration.md#suite-classification)
  includes API-to-frontend render, audit references, pagination sequences and
  measurement preflight. Only the exact guarded synthetic URL is accepted;
  missing/failed/skipped/todo results or missing suites fail the gate.
- Use the [approved predeploy CLI](../../OPERATIONS.md#current-predeploy-cli-contract--2026-09-20):
  direct **Node CLI inside the runtime image**, repository npm wrappers outside it.
  Migration requires both flags and release-only `RELEASE_MIGRATION_APPROVED=true`;
  startup uses runtime credentials without privileged migration environment.
  Preserve ledger/audit/clinical rows; no destructive rollback or forced v3 marker.
- **History-secret FAIL** requires owner/security review, approved containment and
  repository remediation, then a reviewed full-history rescan. **51 scanned versus
  53 reachable** is unreconciled, not proof of missing commits. No key testing,
  rotation, history rewrite or ignore addition was performed.
- Q1 access model, Q2 identity, Q3 browser topology, Q4 audit availability,
  Q5 clinical versioning/retention, Q6 legacy time and Q7 vendors/infrastructure
  remain **PENDING**. Local containers/scans/tests are not cloud/TLS evidence,
  ePHI authorization, production readiness or HIPAA certification.
