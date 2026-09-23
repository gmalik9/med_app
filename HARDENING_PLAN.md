# Follow-up hardening: autonomous execution plan

## Current decision status — approved synthetic pilot design

Decision addendum: 2026-09-20 local, recording the user's completed interactive choices.
**APPROVED FOR SYNTHETIC PILOT DESIGN; IMPLEMENTATION PENDING;
INFRASTRUCTURE/CONTRACTUAL VERIFICATION PENDING.** The authoritative
[approved pilot scope](docs/decisions/APPROVED_PILOT_SCOPE.md) contains the full choices,
remaining inputs, ordered implementer/evaluator handoff and unexecuted acceptance
checklist. This is not real-PHI/production authorization, provisioning or a test report.

| Decision | Current approved pilot subset | Still open |
| --- | --- | --- |
| [Q1](docs/decisions/0001-phi-access-model.md) | Clinic-wide access for all approved clinicians, explicit membership, isolated organizations; admin is not automatically clinical. | Server/RBAC implementation; no legacy assignment or creator-as-owner policy. |
| [Q2](docs/decisions/0002-identity-provisioning.md) | Invitation-only local accounts; TOTP for everyone/admins; manual one-time invites, recovery codes, other-admin-assisted reset with reauthentication/proof/reason/audit/revocation. | Implementation and actual admin/operator inputs; no public signup, admin-UI self-reset or sole-admin bypass. |
| [Q3](docs/decisions/0003-browser-session-topology.md) | One Render HTTPS UI/API service at the same origin plus PostgreSQL; HttpOnly session/refresh-cookie design with CSRF. | Exact origins/configuration, implementation and actual TLS/provider verification. |
| [Q4](docs/decisions/0004-audit-availability.md) | Fail closed on required durable audit failure for patient reads/writes/disclosure; no break-glass. | Durable boundaries/capacity/privileges/evidence implementation; prepared disclosure is not human read. |
| [Q5](docs/decisions/0005-clinical-versioning-retention.md) | Every committed save versioned; no application export/print/PDF/bulk export; no automatic record/version/audit deletion. | Signing/finalization **DEFERRED — NOT CLOSED**; no production amendment/retention approval; browser copying cannot be prevented. |
| [Q6](docs/decisions/0006-legacy-time.md) | New instants stored/displayed UTC, calendar DATE unchanged; new empty isolated synthetic DB, all existing DBs preserved. | Legacy mapping **NOT APPROVED — NOT CLOSED**; ambiguous wall times preserved/flagged unverified, no conversion/backfill/data movement. |
| [Q7](docs/decisions/0007-infrastructure-vendors.md) | **PARTIALLY RESOLVED**: hosting design; local OCR/optional external services off; daily encrypted backups, target RPO24h/RTO4h, no automatic backup expiry. | Actual provider/retention/capacity/contracts/controls and successful restore rehearsal pending; no infinite-retention promise, purchase or provisioning. |

Q1–Q6 are design-unblocked only for the selected pilot subsets. Implementations and
distinct evaluator gates remain pending; no prior evidence counts or failures change.
No automatic application/evidence/backup deletion: reviewed manual cleanup needs
separate explicit authorization. Actual service/project/region/plan, clinic display
name/admin identifiers, backup mechanism and operating details are supplied later;
TOTP/session/encryption/backup secrets belong in secure direct entry, never chat.

**SECURITY GATE FAIL — OWNER ACTION REQUIRED:** treat the historical Google key as
**EXPOSED**. User review/revocation/replacement remains **PENDING**; no key was provided
and validity/revocation is unverified. No agent key testing, rotation, history rewrite
or scanner allowlist changes authorized. Existing findings remain unchanged. Real
PHI, production, legacy migration and contracts require separate user approval/review.

## Historical plan snapshot — retained without revision

Everything below this boundary is the earlier execution-status/work-order snapshot.
Its “current,” Q1–Q7 PENDING and decision-unresolved language describes that historical
state; use the current summary and approved scope above for pilot decisions only.
Historical security findings, evidence counts, QA/report history and failed gates
are not rewritten or cleared by this addendum.

<!-- BEGIN HISTORICAL PLAN SNAPSHOT -->

Date: 2026-09-20 local; final coordination extends into 2026-09-21 UTC.
Status: **autonomous implementation/local verification executed within scope;
credential, policy and production-infrastructure gates BLOCKED**.

## Current execution status — final documentation coordination

**SECURITY GATE FAIL — OWNER ACTION REQUIRED:** eight all-ref history findings remain;
key validity/revocation is unverified. [K triage](docs/verification/history-secret-findings.md)
passing independent artifact review does not clear the scanner. No rotation, history
rewrite, ignores or real-provider tests were authorized/performed.

The detailed plan below is the **historical work order**, not a claim that all gaps
still exist or that all proposals were implemented. Use the current
[A–L ledger](docs/verification/IMPLEMENTATION_STATUS.md) and
[final evidence](docs/verification/FINAL_VERIFICATION.md). Implementer environments
could not spawn nested evaluator tools; MAIN assigned distinct dedicated read-only/testing
evaluators per track and returned failed work for correction before acceptance.
No self-PASS is relabelled independent. MAIN's document cross-check remains pending.

| Plan scope | Executed / observed evidence | Still blocked or not executed |
| --- | --- | --- |
| P01 / P14, Batch A and F1/F2 | Guides/contracts, pinned image/workflow references, fail-closed 11-suite integration; MAIN's Node22 × PG15/17 × UTC/New_York full local passes. Latest **23 + 47 + 644 + 936 + 8 = 1,658** cases, strict types/lint/build, npm audit0. Independent A/I PASS. | Historical failures retained; earlier cells had 17 contracts/642 frontend. Hosted CI, CodeQL and branch protection unverified; history-secret gate FAIL. |
| P02 / Batch B session safety | Independent **B3 PASS**; later strict date-query **451 + lifecycle12** confirmed green in MAIN release. | Q2 enrollment/MFA/recovery and Q3 browser-readable credential topology unresolved. |
| Batch B clinical UI safety | Independent **C3 PASS**; navigation/draft, async originating identity, conflict reconciliation and explicit AI review. Independent **J8 PASS**; MAIN separate eight-case recapture/PNG proof. | No real AI/PHI/provider-quality claim. Q5 clinical lifecycle and Q6 legacy display ambiguity remain. |
| P07 / Batch C retry safety | Independent **D3 PASS WITH HISTORICAL FLAKE**; actor+operation+key transactional ledger, v3 collision-safe upgrade, current-resource replay. Stress32×10/1,600 completions and independent32×3. Later frontend test-only correction **D18/full644**, MAIN reruns pass. | Original backend one-HTTP-timeout cause UNKNOWN; not explained by the separate WebCrypto test race. No ledger purge/automatic collision repair. |
| P09 / Batch C paging | Independent **F3 PASS WITH HISTORICAL FLAKE**; keyset history/directory, strict envelopes/identity-safe refresh; 48×3 backend +490 frontend pass. | Prior HTTP400/timeouts UNKNOWN; summaries are not exports, no snapshot/production-scale guarantee. |
| P10 / P11, Batch E1–E3 scope | Independent **E2 PASS31**; read-only production boot/readiness, exact [1,2,3]/unique indexes, approved CLI, measurement/collision preflight and preserved upgrade fixtures. | Legacy timezone conversion/new-time contract **not implemented**, Q6 pending; deployed roles/TLS/universal DDL denial not certified; local PUBLIC TEMP allowed. |
| P08 / Batch D, F3 observability scope | Independent **G3 PASS362 +29 probes**; safe diagnostics, request/terminal events and restricted resource references; clinical mutation audits atomic. | Read audit best effort. Q4 pre-disclosure durability, outbox, immutable sink/privilege separation and real alert delivery not implemented/verified. |
| P03–P06 / H decisions | Independent **H structural PASS**: seven ADRs and 42 negative specifications. | Q1–Q7 **PENDING — NOT IMPLEMENTED**, **42 specs NOT RUN**. Access assignments, identity, cookie/BFF, full note-version retention require decisions and implementation. Checker exit2 BLOCKED is not release PASSED. |
| P14 image hardening / L | Independent **L PASS23 source +9 explicit (two overlap)**. MAIN rebuild/rescan0 HIGH/CRITICAL and runtime3/3; frontend0; CycloneDX1.7 inventories172/71. Removed only unused runtime global package tooling after production install. | Original11 global-npm findings retained. Lower severities unscanned; Alpine3.24 EOL-list warning qualifies coverage. Image success does not clear secrets or prove production infrastructure. |
| P12 / P13 / remaining F4/F5 | Local production-mode stack smoke, denied routes, headers, nonroot users and graceful stop verified by MAIN. Historical synthetic restore/load evidence retained. | No new production restore/SLO, multi-replica limiter/OCR queue/offline asset or cloud/TLS/vendor-contract claim. Q7 and real operational ownership/evidence remain blocked. |

Current operator commands supersede automatic-production-DDL advice in the old plan:
see [approved predeploy](OPERATIONS.md#current-predeploy-cli-contract--2026-09-20)
and [direct Node runtime commands](OPERATIONS.md#runtime-image-direct-node-commands).
The runtime image no longer has npm/Yarn/Corepack; host/build wrappers remain.
No collision repair may delete data, rewrite keys automatically or forge schema
markers. Completing autonomous code work does not authorize real ePHI/HIPAA claims.

### Historical work order and initial audit snapshot below

This plan builds on [QUALITY_AUDIT.md](QUALITY_AUDIT.md), [AUDIT_API_INVENTORY.md](AUDIT_API_INVENTORY.md) and [OPERATIONS.md](OPERATIONS.md). The previous audit recorded 33 backend, 10 frontend and 2 browser tests passing. Those are prior results, not a claim that a new suite ran during this planning pass.

Current manifest check: [backend/package.json](backend/package.json) matches its root lockfile dependency declarations; TypeScript resolves to 6.0.2 in the lockfile. Preserve the user's existing modifications. Do not restart a dependency-upgrade sweep or overwrite the current working tree.

## 1. What is still missing?

**The largest gap is the production security/clinical operating model, not compilation.** Several useful safeguards now work locally, but approved identity/access, clinical lifecycle, durable accountability and real infrastructure evidence remain incomplete.

| ID / priority | Gap and current evidence | Proposed treatment | Can proceed autonomously? |
|---|---|---|---|
| P01 / immediate | [RENDER_QUICK_START.md](RENDER_QUICK_START.md) still recommends wildcard CORS, hostname guessing, free-plan assumptions, demo credentials and old install commands. Other historical guides may repeat them. | Reconcile every entry-point guide with the current contract; add executable setup/configuration smoke checks. | Yes: documentation and regression checks, no deployment. |
| P02 / high investigation | [frontend/src/utils/apiClient.ts](frontend/src/utils/apiClient.ts) handles delayed 401s using the **current** refresh credential; [AuthContext](frontend/src/context/AuthContext.tsx) has bootstrap/login callbacks not uniformly bound to an identity generation. Logout calls a route requiring a currently valid access token. | Deterministically test account-switch, refresh/logout, stale response, expired-access logout and transient-outage sequences; fix only reproduced failure paths. | Yes. These are **control-flow concerns to reproduce**, not newly proven authentication bypasses. |
| P03 / high before broader use | Shared patient lookup/edit/history has no clinic/tenant/care-team policy; roles are stored but there is no complete privilege model. [Patient routes](backend/src/routes/patients.ts), [schema](backend/src/db/schema.ts). | Approve an access matrix, then central server authorization, appropriate memberships/assignments and negative tests everywhere. | Inventory/test scaffolding now; policy and existing-record assignments require approval. |
| P04 / high before production | Public production signup is disabled, but no approved invitation/admin/IdP enrollment, MFA, account recovery or offboarding workflow exists. [Auth routes](backend/src/routes/auth.ts). | Choose identity/provisioning model; implement enrollment, MFA/step-up, recovery and session revocation with privilege separation. | Design and synthetic tests now; provider/roles/recovery policy require approval. |
| P05 / high before ePHI | Browser access/refresh tokens remain JavaScript-readable in sessionStorage. [API client](frontend/src/utils/apiClient.ts). | Prefer an approved same-origin deployment with HttpOnly session/refresh cookies or a BFF; explicitly design CSRF and session semantics. | Prepare design/tests; select deployment topology before changing the transport contract. |
| P06 / high integrity priority | `revision` detects conflicting note edits, but earlier note content is overwritten. [Notes](backend/src/routes/notes.ts), [migration](backend/src/db/migrations.ts). | Design a protected revision-history store separate from security logs, with transactional snapshots and authorized retrieval; preserve originals during AI review. | Schema/test prototype is safe; expanded PHI retention, author visibility and clinical amendment/finalization policy need approval. |
| P07 / medium correctness | Appointment/visit/vital creation has no durable request idempotency. Submit disabling does not prevent duplicates after a lost response. [Appointments](backend/src/routes/appointments.ts), [visits](backend/src/routes/visits.ts), [vitals](backend/src/routes/vitals.ts). | Scoped idempotency keys and request fingerprints enforced transactionally; consistent replay response and conflict behavior. | Yes, backwards-compatible implementation on synthetic DBs; deployment and cleanup/retention separately reviewed. |
| P08 / high accountability priority | [Read/request auditing](backend/src/middleware/auditLog.ts) happens after `finish`; events can be lost. Clinical write audits are atomic, but this does not cover every security/administrative mutation. | Persist an authorized-access/response-prepared event before PHI release; transactional outbox for external delivery; separate DB privileges and defined outage handling. | Metadata schema, writer/outbox tests and role scripts now; availability policy and external immutable sink require approval. |
| P09 / medium correctness | Directory uses offset pages; most histories expose only a recent bounded window. [API inventory](AUDIT_API_INVENTORY.md). | Stable keyset pagination with bounded validated cursors, metadata and complete UI navigation; do not mistake recent rows for full clinical history. | Yes, preserving existing response fields and access rules. |
| P10 / medium integrity | Events use legacy timestamp-without-timezone columns; API/browser/DB may interpret local times differently. Schema also lacks some direct-DB shape/range constraints. [Schema](backend/src/db/schema.ts). | Date/time characterization tests and read-only data preflight; approved timezone-aware new-write contract and staged migration; cautious constraints. | Tests/preflight yes; interpreting/converting existing timestamps requires a timezone/data-owner decision. |
| P11 / medium reliability | Startup performs DDL using the runtime connection. Pool timeouts exist, but migration/runtime role separation, schema-readiness checks and upgrade rehearsals are incomplete. [Bootstrap](backend/src/index.ts), [DB](backend/src/db/index.ts). | Dedicated versioned migration command, privileged release role and DML-only runtime role; compatible deploy sequence and migration preflight. | Code/scripts and isolated tests yes; granting/revoking deployed roles requires approval. |
| P12 / medium scalability | Limits and OCR admission are per-process; no durable OCR queue or offline language-asset guarantee. [App](backend/src/app.ts), [OCR](backend/src/services/stickerOcr.ts). | First measure replica/scan workload; shared limiter and trusted ingress; pinned/local OCR assets; introduce isolated workers/queue only if justified. | Local adapters, fixtures and benchmarks yes; hosted stores/queues and vendor choices require approval. |
| P13 / high deployment assurance | No verified production DB TLS, encrypted backup policy, restoration RPO/RTO, immutable audit service, alert delivery or vendor agreements. | Supply testable deployment/runbook controls and collect actual staging/provider evidence; commission contractual/organizational review. | Local tooling/docs yes; real infrastructure, credentials, contracts and legal determinations no. |
| P14 / medium release assurance | [CI](.github/workflows/verify.yml) has useful gates, but actions/images use mutable references, secret scanning is narrow, no full SAST/image scan, and integration tests may skip without their test URL. | Explicit required integration job, full-history redacted secret scanning, appropriate SAST/image/SBOM checks, pinned references with update automation, compatibility matrix. | Yes locally/in workflow files; hosted CI execution/branch protection require repository access. |

### Important distinctions

- An SQL `UPDATE` already takes a row lock. The current refresh and logout paths do **not** warrant an invented “needs advisory lock” vulnerability claim. Test that neither old nor newly issued tokens authorize requests **after completed logout**, regardless of ordering. In-flight operations that authorized before logout need explicitly documented semantics.
- Writing an outbox row from the same post-response `finish` callback would **not** repair read-audit loss. The durable write must happen before disclosure/commit where required.
- Missing retention rules do **not** authorize adding automatic PHI deletion. No purge schedule will be invented.
- A natural unique key such as patient+doctor+appointment time can reject legitimate clinical records. Use scoped request idempotency, not unapproved clinical deduplication rules.
- A keyset cursor does not magically provide snapshot isolation across mutable sort fields/backdated inserts. Define ordering, tie-breakers and refresh behavior, and test those semantics.
- Do not convert historical timestamp values to UTC by assuming what timezone they originally represented.

## 2. Autonomous operating contract

For each work item:

1. Inspect the current diff, preserve unrelated edits, and record the baseline.
2. Write an executable reproduction or characterization test. Classify evidence as confirmed, likely or unverified.
3. Make the smallest coherent change, with an additive migration if needed. No broad rewrite.
4. Run the failing case, related unit/integration tests, full relevant suite, type checks/lint/build and affected browser workflows.
5. Exercise concurrency, rollback and authorization boundaries—not only happy-path responses.
6. Document API/migration/operational changes and update the audit with observed results and remaining risks.
7. Review the diff for PHI/secrets, destructive behavior, contract breaks and test omissions; stop at the approval boundaries below, while continuing independent safe work.

Use synthetic users/data, loopback-only guarded test databases, fresh schemas and disposable services. Never load the local ignored key for testing, call enabled external AI with real records, change production data, rotate real credentials or delete production/retained audit data. Do not automatically commit, push or deploy without an applicable instruction.

No deadline estimate is asserted before reproductions, workload requirements and the identity/access decisions are known. Deliver in small reviewable batches with explicit tests and rollback notes.

## 3. Execution batches and acceptance gates

### Batch A — Reproducible baseline and safe deployment guidance

**Tasks A1–A4; no product decision needed. Start here.**

- A1: Re-run clean root installation and verification on supported Node 22; assert the manifest/lock relationship and require integration tests to run rather than silently skip in a release check.
- A2: Reconcile quick-start, Render auto-detection/fix guides, general deployment instructions and shell-manager usage. Keep one authoritative environment/command contract; clearly archive superseded material.
- A3: Test exact-origin configuration rejection, default-secret rejection, required API destination, production signup/AI gates, reverse-proxy headers, and real response headers on built frontend assets. Do not merely build the assets.
- A4: Establish a test matrix for PostgreSQL 15 (current local Compose) and 17 (previous audit/CI), UTC and a non-UTC timezone. Make synthetic restore tests and final evidence collection reproducible, without destroying existing databases.

**Exit:** clean install, strict types/lint/build, unit/integration/browser tests; explicit failure when an integration prerequisite is missing; documentation no longer recommends removed seed routes, guessed hosts or demo production access; supported-version matrix recorded.

### Batch B — Session lifecycle and clinical UI safety

**Tasks B1–B5; autonomous after Batch A.**

- B1: Use deterministic deferred HTTP responses to test old-session 401 arriving after a new login, refresh finishing after logout, delayed bootstrap/profile results, duplicate-tab refresh, server idle expiry, expired-access logout and network outages.
- B2: If reproduced, bind pending requests/responses to a client auth generation; cancel/drop stale work and never replay an old session's clinical write under a new identity. Preserve explicitly captured logout credentials against interceptor replacement.
- B3: Specify/rework logout so valid refresh/session possession can revoke the exact session even when the access token has expired; fail closed, avoid reopening registration, and keep same-session authorization checks. Do not expand the revocation endpoint's powers to arbitrary session IDs.
- B4: Warn on unsaved note/date/patient navigation and template replacement; preserve the local draft during conflict reconciliation; offer explicit original-versus-AI draft review. Do not silently persist PHI drafts in localStorage, IndexedDB or downloaded files.
- B5: Make remaining load failures visible, separate configuration-disabled AI/signup from generic errors, and test other data components for stale responses after patient changes. Derive safe public capabilities/session limits from the server rather than leaking config/secrets.

**Exit:** no stale callback restores old identity or clears a new one; no cross-identity request replay; after logout completion all tokens for that session fail; network failure does not silently overwrite/drop a draft; unauthorized/disabled states remain denied. Do not claim these concerns fixed before tests reproduce and verify them.

### Batch C — Retry-safe writes and complete history access

**Tasks C1–C4; autonomous, with non-destructive local migrations.**

- C1: Introduce an idempotency record scoped by authenticated actor, operation and client-generated random key. Add a canonical request fingerprint and uniqueness constraint; create business row, success audit and replay metadata in one transaction. Avoid duplicating clinical payloads unnecessarily in replay storage.
- C2: On same key/same payload, return the same resource/defined response; on same key/different payload, 409. Concurrent duplicate keys must have one committed mutation. Authentication/authorization must still run on every replay. Do not use select-then-insert without a race-safe DB constraint/transaction.
- C3: Have the UI retain only the non-PHI request key through an uncertain retry of the same intent, and generate a new key for a genuinely new submission. Set/document key length, scope and replay window; do not autonomously purge committed clinical records.
- C4: Add stable cursor pagination to note/vitals/visit/appointment histories and eventually the directory; validate cursor shape/length and ownership/filter context, preserve current payload keys, and add clear Next/Previous/Load more states. Index actual query order and measure plans on representative synthetic histories.

**Exit:** timeout-after-commit plus retry creates one row; concurrent replay one mutation/audit; changed-payload reuse 409; no cross-user replay disclosure; full history reachable across tied timestamps and concurrent inserts; no silent truncation mistaken for a complete record.

### Batch D — Durable accountability and clinical history design

**Tasks D1–D5; safe scaffolding now, activation behind decisions Q4/Q5 below.**

- D1: Enumerate PHI read/search/list/export and authentication/admin mutation events. Include actor, operation, resource identifiers or bounded result references, authorized scope, time, outcome and correlation ID; never token/password/note bodies. A directory page is not audited sufficiently by merely knowing someone requested “patients.”
- D2: Choose the audited disclosure boundary. Recommended default: prepare the response, durably record an authorized disclosure attempt/response-prepared event, then release PHI. A response-prepared event does not prove that a human read it. Track completion separately without claiming guaranteed receipt.
- D3: Store external-delivery outbox metadata in the same transaction as the required audit/business change, then deliver at least once with deduplicated event IDs, bounded retries, backlog metrics and graceful recovery. Do not keep `finish` as the sole durable write point.
- D4: Supply an append-only runtime audit role and separate migration/exporter roles; test denial of UPDATE/DELETE on audit evidence. External immutability, privileged DBA access, retention and sink approval remain infrastructure responsibilities.
- D5: Propose clinical revision snapshots containing full clinically relevant fields/codes, editor, revision and timestamp, separate from security telemetry. Backfill only the current known state with explicit provenance; never manufacture overwritten history. Snapshot and current-note update must commit together. No automatic revision deletion, public access expansion or silent AI promotion.

**Exit:** injected crash/failure cannot release PHI before the required durable event under the approved policy; outbox retries do not duplicate sink events; audit role cannot alter evidence; approved revision prototype preserves every subsequent committed version with no snapshot on a failed conflict. Previous versions lost before rollout cannot be recovered by this feature.

### Batch E — Schema lifecycle, time semantics and least-privilege runtime

**Tasks E1–E4; prepare autonomously, gate legacy conversion on Q6.**

- E1: Add a distinct migration command using a privileged release role; runtime verifies required schema version and uses DML-only credentials. Plan safe initial deployment and rollback/forward-fix sequencing before disabling runtime DDL.
- E2: Build read-only preflight reports for unexpected JSON shapes in `medical_codes`, unsupported role/status values, impossible measurements, orphaned relations and timezone ambiguity. Existing anomalies must be reported, not silently erased/coerced or hidden by a query fallback.
- E3: Stage new constraints against approved invariants, validate only after compatibility checks, and avoid long blocking index creation in normal request startup. Test idempotent migrations, lock contention, rollback-on-failure and older schema upgrades with populated synthetic fixtures.
- E4: Define calendar dates versus instants and clinic display timezone. Introduce an explicit new-write timestamp contract, with a dual-read/write/backfill plan if appropriate. Rehearse DST transitions and verify no appointment changes wall time unexpectedly. Historical conversion requires a trustworthy mapping and approval.

**Exit:** runtime can serve/write/audit with no CREATE/ALTER permission; missing/incompatible schema fails readiness safely; migration failure preserves prior data; preflight catches dirty legacy fixtures; no unapproved timezone reinterpretation or destructive data repair.

### Batch F — Operational evidence, CI and measured scaling

**Tasks F1–F5; code/local tests autonomous, cloud execution gated.**

- F1: Add full-history redacted secret scanning, suitable SAST, dependency update automation, image/native-library scans and SBOM generation. Pin CI actions and images to reviewed immutable revisions with an update process; do not blindly use unknown hashes. Scan/retain artifacts without PHI.
- F2: Require the intended checks in CI; add tests for real production frontend headers/proxy paths, migrations and restore procedure. A hosted CI workflow is not proven until its remote run is observed.
- F3: Add PHI-free operational metrics for latency/error/timeout, pool saturation, audit delivery failures/backlog, OCR queue/busy counts and auth rate-limit events. Do not use patient IDs, clinical text or tokens as metric labels. Add local alert tests and operator runbooks; actual pager delivery needs configured credentials and ownership.
- F4: Verify horizontal rate-limit behavior and trusted ingress. Introduce a shared limiter only with a defined storage/failure policy; protect hospital NAT users from indiscriminate global lockout. Pin/vendor OCR language assets and test denied outbound network access. Add a durable isolated OCR queue only when measured workload/SLOs justify it.
- F5: Turn backup/restore and load tests into repeatable guarded tooling; exercise slow DB, exhausted pools, process termination, outbox restart, delayed clients, concurrent writes and representative long histories. Report throughput/percentiles/errors/CPU/RSS alongside exact environment and data volume. No production capacity promise from a small loopback benchmark.

**Exit:** local gates pass; no known untriaged high-impact reachable advisory; supported image/runtime evidence recorded; synthetic restore and failure drills repeatable; multi-instance abuse controls verified if introduced; cloud readiness remains blocked until actual operational/contractual evidence is approved.

## 4. Decisions that must not be invented

These are explicit decision requests for the relevant owner when their batch is reached; they do not prevent Batches A–C or independent tests/scaffolding.

| Decision | Options and recommendation | Why approval matters |
|---|---|---|
| Q1 — PHI access model | A: explicit single-clinic shared records. B: organizations with cross-org denial. C: organization + assigned care-team permissions and break-glass. Recommend at least explicit organization membership if more than one clinic is possible; select care-team scope from actual workflow. | Existing `created_by` is provenance, not an assignment. Retroactively making it ownership can deny appropriate care. Legacy records/users need an approved assignment plan; do not auto-assign by email/domain. |
| Q2 — Identity/provisioning | A: approved managed OIDC/enterprise IdP with MFA/provisioning. B: invitation-only local accounts with explicitly designed admin/MFA/recovery. Managed identity is preferred when an approved provider exists. | Provider contracts, available accounts, admin roles, account recovery and workforce lifecycle are not known. No hard-coded shared administrator or public bootstrap endpoint. |
| Q3 — Browser deployment/session topology | A: same-origin frontend/API or BFF with HttpOnly session/refresh credentials. B: separately hosted browser/API with carefully specified cookie/token, CORS and CSRF behavior. Prefer same-origin to reduce cross-site cookie complexity. | Cookie `Secure`, `HttpOnly`, `SameSite`, domain/path, CSRF tokens and Origin checks must fit the actual deployment; an unplanned cookie switch can break login or introduce CSRF. |
| Q4 — Audit outage and emergency access | A: no PHI disclosure without durable audit. B: policy-defined emergency/break-glass behavior with explicit authorization, preserved evidence and incident follow-up. Recommend fail-closed normally, with no invented bypass. | Audit availability is a clinical/security tradeoff. A silent best-effort fallback is not a compliant emergency-access policy. |
| Q5 — Clinical versioning/retention/export | Decide draft versus signed/final note behavior, amendment reasons, who sees old text, legal holds, export authorization, retention of versions/keys/audit/outbox and print copies. Prototype append-only snapshots without deletion. | Versioning creates additional PHI; deletion or immutable long-term retention cannot be justified from code alone. Policies and qualified compliance/legal review are required. |
| Q6 — Legacy time data | Identify original timezone per deployment/record where trustworthy; define clinic display zones. Uncertain records need explicit reconciliation rather than assumed UTC. | An automatic `TIMESTAMP`→`TIMESTAMPTZ` conversion can silently reschedule encounters. Preserve original data and approve backfill/migration. |
| Q7 — Infrastructure/vendor evidence | Identify approved hosting/DB/audit/IdP/AI/backup products, regions, TLS/key controls, quotas, RPO/RTO, operators and contracts. Keep AI disabled until exact product/data use is approved. | A setting or provider marketing page is not proof of storage encryption, permitted PHI use, BAA coverage or successful recovery. Requires credentials/owners/contractual review, not autonomous claims. |

For any blocked decision, produce a short architecture decision record with evidence, alternatives, recommendation, affected records/users, migration and rollback consequences, and acceptance tests. Continue independent safe work rather than waiting indefinitely or guessing.

## 5. Suggested first autonomous work order

1. **A1–A4:** stable test/release baseline, documentation repair and compatibility tests.
2. **B1–B5:** reproduce/fix session/UI edge cases and protect unsaved clinical work.
3. **C1–C4:** transactional request idempotency and full history navigation.
4. **F1/F2 plus E1/E2:** release/security scanners, reproducible migrations and read-only integrity preflight.
5. Prepare **D/Q1–Q7** decision records and prototypes in parallel; implement approved access, identity, durable audit and clinical lifecycle contracts only after the relevant decisions.
6. **E3/E4/F3–F5:** compatibility-tested constraints/time migration and staging operational/scale verification as approvals and infrastructure become available.

This order is for **safe autonomous execution**, not a ranking that makes tenant/identity/vendor/audit blockers optional. Those approvals remain prerequisites for real ePHI even while low-risk fixes ship locally.

## 6. Completion criteria for the follow-up pass

- Every implemented item has a test that would fail before the fix, plus its concurrency/failure/authorization cases where relevant.
- Clean root install on supported Node, type checks, lint, unit/integration/E2E, builds, image/security checks and applicable migrations/restore drills pass. Missing required infrastructure causes an explicit blocked/failed result, not a silent integration skip.
- Documentation and API contracts match observed behavior; no obsolete quick-start remains an apparently valid production path.
- No production data modification, secret exposure, destructive cleanup, guessed tenant assignment, unapproved timezone conversion, automatic PHI deletion or external disclosure occurred.
- Each finding is marked fixed, remaining, decision-blocked or unable to verify with evidence. New test counts and measured results replace, rather than assume, the prior audit baseline.
- Actual deployment controls, contracts and organizational safeguards are independently reviewed before an ePHI production authorization. Completing this plan alone is **not** a HIPAA certification or unconditional production-readiness declaration.
