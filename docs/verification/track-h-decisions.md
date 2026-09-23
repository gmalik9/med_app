# Track H — policy-dependent design and test scaffolding

Date: 2026-09-20. **All decisions PENDING — NOT IMPLEMENTED. No approval recorded.**
This track implements documentation/source-characterization scaffolding only, not
tenant controls, MFA, cookies, an outbox, clinical signing, time conversion or vendor
approval. It does not certify legal compliance or production ePHI readiness.

## Owned artifacts and Q1–Q7 gate coverage

| Gate / blocked work | Artifact and concrete deliverable | Gate status |
| --- | --- | --- |
| Q1 / P03 | [0001 access model](../decisions/0001-phi-access-model.md): explicit current shared-clinic vs proposed org/team access; capability/schema proposal, complete current endpoint matrix, assignment preflight, H1 negative specs, scope-safe rollback. | PENDING — NOT IMPLEMENTED |
| Q2 / P04 | [0002 identity](../decisions/0002-identity-provisioning.md): OIDC vs invitation-only local, MFA/recovery/offboarding assurance, identity schema, protected endpoints, H2 negatives. | PENDING — NOT IMPLEMENTED |
| Q3 / P05 | [0003 browser topology](../decisions/0003-browser-session-topology.md): same-origin/BFF vs same-site/cross-site; Secure/HttpOnly/SameSite, CSRF/CORS, SSO and multi-tab contracts, H3 negatives. | PENDING — NOT IMPLEMENTED |
| Q4 / P08 activation | [0004 audit availability](../decisions/0004-audit-availability.md): fail-closed vs approved emergency, exact resources, durable event/outbox BEFORE release, delivery/privilege design, H4 crash/failure specs. | PENDING — NOT IMPLEMENTED |
| Q5 / P06 | [0005 clinical lifecycle](../decisions/0005-clinical-versioning-retention.md): append-only full snapshots/attestations, amendments, retention/holds/export, truthful legacy baseline, H5 concurrency/no-cascade specs. | PENDING — NOT IMPLEMENTED |
| Q6 / P10 conversion | [0006 legacy time](../decisions/0006-legacy-time.md): dates vs instants, provenance/uncertainty, reviewed mapping and dual-read/write/retry compatibility, H6 DST/rollback specs. | PENDING — NOT IMPLEMENTED |
| Q7 / P13 vendors | [0007 infrastructure/vendors](../decisions/0007-infrastructure-vendors.md): evidence-register schema, exact product/data flow requirements, TLS/backup/RPO/RTO/role/alert drills, H7 negatives. | PENDING — NOT IMPLEMENTED |

Every ADR contains the minimal owner question with alternatives/consequences,
recommended design (not selected policy), affected records/users, implementation
contract, negative acceptance specs, rollout/rollback and explicit unblocking evidence.
Approvers and numeric operational thresholds are deliberately unassigned/unset.
Approval permits the next implementation step, **not** automatic deployment/activation.

Additional owned artifact: [read-only source checks](../../tests/policy-boundaries.mjs).
No runtime source, schema, migrations, feature flags, configuration, manifest,
workflow, existing test/report or role template was changed by H. The starting tree
already had many other tracks' modified/untracked files; those remain owned elsewhere.

## Observed baseline and coordination

Reviewed [HARDENING_PLAN](../../HARDENING_PLAN.md) Q1–Q7 and actual route/auth/client,
schema/migration/preflight, audit, OCR/provider and proxy code rather than assuming
older inventory or memory findings still describe this tree.

- Current patient/chart access is shared-clinic, not a newly discovered requirement
  to make `created_by` ownership. Current self-note/appointment-owner/private-template
  rules must be preserved when adding approved scope; they are not tenant isolation.
- Track B exact-session/account-generation fixes, Track D v3 retry keys and Track F
  cursors are independent safeguards, not evidence for H's pending policy controls.
- [Track G](track-g-audit.md) remains best effort even with a request-start event;
  audit writes are not awaited before ordinary disclosure. No durable read outbox exists.
- [Track E](track-e-database.md) supplies read-only preflight, explicit migrations and
  real-login least-privilege scaffolding. H references it; deployed grants, exporter
  separation and append-only clinical-history privileges need further approved work.
- **Historical inspection note:** readiness then declared `[1, 2]` while migrations
  included v3; G also had a legacy API-audit assertion handoff. Those observations
  are not current blockers: E now requires exact **[1, 2, 3]** and structural unique
  indexes in [readiness](../../backend/src/db/schemaState.ts); G restored/corrected
  the meaningful API-audit reference assertions (see [Track G](track-g-audit.md)).
  These fixes were not made or verified by H. G's latest reevaluation and the
  combined release gate remain separate; H's document checks do not establish them.
- No independent evaluator/subagent tool is available. **Independent evaluator:
  PENDING main assignment.** Implementer source review is not independent evaluation.

## Acceptance harness handoff

H1–H7 tables are implementation-ready Given/When/Then-equivalent specifications,
**NOT RUN**, not passing mocked tenant/MFA/outbox tests. Each row must become a real
failure/negative test when the control is implemented. The endpoint matrix expands
H1 and H4 over every clinical route, casing/trailing slash, implicit HEAD, all query
branches, derived data, replay and future exports; one happy-path route is insufficient.

Use synthetic orgs/teams/workforce roles and a loopback-only disposable database;
no environment-file/secret loading or real patient data. Exercise actual separate
DB logins, crash/restart/ambiguous commit, preserved rows/hashes and process boundary
failures. For cookie/identity use real local HTTPS/browser/protocol fixtures, then
approved staging test accounts for actual provider evidence. Mocks alone cannot prove
DB durability, MFA, cross-org denial, deployed TLS or a vendor contract.

Approval workflow: designate owner → record signed decision and restricted evidence
reference → separately implement and test → independent evaluator → approve controlled
rollout. If A/B/C changes the recommendation, update the matrix/specs before coding.
Do not relabel a pending ADR implemented simply because its proposal was accepted.
All Q1–Q7 gates and general release checks apply before real ePHI; local code progress
must not make any approval optional.

## Read-only check contract and verification evidence

[Source checker](../../tests/policy-boundaries.mjs) uses only Node built-ins and an
explicit source/document allowlist. It reads no secret/environment files, imports no
runtime modules, starts no process/server, opens no DB/network connection, and writes
no files. It checks pending labels/sections, local link targets and lexical parity of
current explicit Express routes with the Q1 matrix; it reports positive source anchors
for known gaps and source SHA-256 fingerprints. This is **not** exhaustive authorization
analysis: dynamic routes/mounts and controls elsewhere require human review.

Run with the Node executable and the checker path (no install/build required).
Exit **2** is the expected **BLOCKED/NONCOMPLIANCE WITH PROPOSED GATES** outcome,
even if document structure passes. Exit **1** means source drift, invalid arguments,
missing files/labels/links or checker failure requiring review. There is intentionally
no release-pass exit 0 and no bypass flag. “Noncompliance” here means unmet proposed
technical gates, **not a legal determination**. Do not wrap exit 2 into a green
production check; it is a design/known-gap report, not part of the release test suite.

Initial implementer validation at **2026-09-20T21:18:05.848Z**, cached **Node v22.23.2**:

- Node syntax check of the source checker completed without errors.
- Read-only report: **PASS_DOCUMENT_STRUCTURE_ONLY**; **36** explicit source endpoints
  and **36** matrix entries, no missing/stale entries; **53** local link targets exist;
  **42** negative acceptance scenario rows specified; all seven known-gap source
  anchors observed. Source fingerprints are emitted with the report, not a claim of
  a frozen or independently evaluated release artifact.
- Report verdict **BLOCKED_ALL_Q1_Q7_PENDING**, expected exit **2**. This is not a
  failed attempt to implement the controls and not a release/security test pass.
- Editor diagnostics on the checker and report found no errors. Full application
  tests/builds were not run: H changed only docs and an inert standalone source check.

Final artifact self-check at **2026-09-20T21:19:44.484Z** (same Node runtime) confirmed
the same 36 routes / 53 links / 42 specified scenarios, expected blocked exit **2**,
invalid-argument exit **1**, syntax and whitespace validity across all **9** owned
files, and unchanged hashes of **55** runtime source/proxy files before/after this
read-only execution. An earlier self-check stopped on a missing terminal newline in
a newly added ADR; explicit newline fixes were applied to the owned files and the
entire self-check rerun. This was an artifact-format defect, not a runtime test failure.

Runtime acceptance scenarios executed by H: **0**. Runtime controls verified by H:
**0**. No production connection, provider call, cloud change, SSO email, vendor contact,
credential rotation, deletion, reassignment, timezone conversion, commit or push.

## Main evaluator assignment

Independently review the seven ADRs against the current source and H's strict file
scope. Check the matrix for indirect disclosure paths, the assignment/revocation
barrier, BFF cookie/CSRF topology, pre-release event/outbox transaction, signed-history
non-cascade protection, uncertain-time/retry semantics and evidence-only vendor gates.
Confirm all Q1–Q7 remain pending with named-owner questions and measurable unblocking
requirements; rerun the read-only checker expecting exit 2, not “tests passed.”
Report factual/spec defects separately from genuinely missing external decisions.
