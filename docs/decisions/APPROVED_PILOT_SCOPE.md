# Approved synthetic pilot scope

Decision recorded: 2026-09-20 local, from the user's completed interactive choices.

**APPROVED FOR SYNTHETIC PILOT DESIGN.**
**IMPLEMENTATION PENDING.**
**INFRASTRUCTURE/CONTRACTUAL VERIFICATION PENDING.**

This is the current decision authority for the limited pilot, not a deployment,
provisioning instruction, passing test report, or authorization for real PHI or
production healthcare use. The seven ADRs retain their initial pending proposals
below clearly marked historical boundaries. Their current addenda and this document
supersede conflicting pilot options only; unselected alternatives are not approved.
Earlier verification reports remain historical evidence, not current approval records.

**SECURITY GATE FAIL — OWNER ACTION REQUIRED.** Treat the historical Google key as
**EXPOSED**. The user will review/revoke/replace it themselves; that action is still
**PENDING**. No key was provided for this decision, and validity/revocation was not
verified. The agent is not authorized to test the key, rotate credentials, rewrite
history, or change scanner allowlists/ignores. The existing
[history-secret findings](../verification/history-secret-findings.md) remain unchanged;
design approval does not clear this gate.

## Decision status by question

| Question | Current pilot decision status | Boundary still open |
| --- | --- | --- |
| [Q1 — access](0001-phi-access-model.md) | Pilot design unblocked: explicit clinic membership; all approved clinicians share patient access within each clinic; organizations isolated. | Server enforcement/RBAC pending. No legacy assignment or global administrator clinical access approved. |
| [Q2 — identity](0002-identity-provisioning.md) | Pilot design unblocked: invitation-only local accounts; TOTP for every user, including admins; recovery codes and controlled assisted reset. | Implementation, named operators/bootstrap identities and operational configuration pending; no public signup or sole-admin bypass. |
| [Q3 — browser/session](0003-browser-session-topology.md) | Pilot design unblocked: one Render HTTPS web service serves UI and API at the same origin, with PostgreSQL; HttpOnly session/refresh-cookie design plus CSRF. | Exact origin, proxy/cookie configuration, implementation and actual HTTPS verification pending. |
| [Q4 — audit](0004-audit-availability.md) | Pilot design unblocked: required durable audit fails closed for patient-record reads, writes and disclosure; no emergency/break-glass bypass. | Durable boundaries, privilege separation, capacity/alert configuration and failure verification pending. |
| [Q5 — records](0005-clinical-versioning-retention.md) | Pilot subset unblocked: every committed note save versioned; no application export/print/PDF/bulk export; no automatic deletion. | Signing/finalization **DEFERRED — NOT CLOSED**; production amendments, legal retention and real-PHI copies require separate approval. |
| [Q6 — time/data](0006-legacy-time.md) | Pilot new-write/display design unblocked: UTC instants, calendar DATE unchanged, new empty isolated synthetic database. | Legacy mapping/conversion **NOT APPROVED — NOT CLOSED**; ambiguous wall times stay preserved and flagged unverified. |
| [Q7 — infrastructure](0007-infrastructure-vendors.md) | **PARTIALLY RESOLVED**: hosting design and backup objectives selected; optional external services disabled; local OCR only. | Provider/plan/region capabilities, actual controls, backup retention, contracts and recovery evidence remain pending. No purchase or provisioning approval. |

Q1–Q6 are unblocked **only for their selected synthetic-pilot design options**, not
blanket closure of every original question. All implementation and acceptance gates
remain pending. Q7 is not fully closed; historical-key owner action remains blocked.

## Approved choices and constraints

### 1. Synthetic data only

Use synthetic users and records only. This approval does not cover real PHI, live
patient care, a production migration, or a compliance/healthcare authorization.
Separate user approval, applicable contracts and qualified review are required before
any expansion; a successful pilot does not confer that permission automatically.

### 2. Clinic membership and clinical permissions

All approved clinicians within **each** clinic share access to that clinic's patients
and clinical history; separate organizations remain isolated. Model explicit clinic
membership and separately granted roles. `created_by` is provenance, not ownership
or a substitute for clinic authorization. Do not invent a care-team assignment
requirement for this pilot or infer membership from email, creator or existing roles.

Enforce scope on the server for every lookup, list/search/count, child record, note
version, template, OCR match, derived result, cursor and idempotent replay. Validate
live membership and authorization at the durable read/write boundary; client-selected
clinic IDs and stale credentials are not grants. Retain existing self/author write
restrictions unless separately approved; shared patient access does not grant an
automatic ability to overwrite another author's note.

### 3. Historical credential exposure

The exposed-key treatment and pending user-owned review/revocation/replacement above
are mandatory. Never request the old or replacement key in chat or use it to test
validity. No security finding, historical failure or scanner gate is cleared here.

### 4. Invitation-only local authentication

No public signup. Local accounts require invitation and **TOTP MFA for every user,
including every administrator**, with single-use recovery codes. No password-only
clinical/admin session or pre-MFA refresh elevation. Invitations must be expiring,
one-time, intended-recipient/clinic/role bound and replay-safe. Protect factor secrets
with managed encryption keys and store recovery-code verifiers, not plaintext codes.

### 5. Clinic administration is not clinical access

Designated clinic admins manage invitations and deactivation within their clinic.
Admin authority alone grants no clinical-record permission, including old note text.
An admin can separately receive a clinician role through approved enrollment; do not
silently map admin to clinician or grant global clinical access. Preserve identity
attribution and revoke access/sessions on deactivation rather than deleting users.
First-admin setup must be controlled, explicit and MFA-enrolled, not public bootstrap
or automatic reuse/assignment of an existing user.

### 6. Same-origin Render topology

Selected design: **one Render HTTPS web service serving both UI and API at the same
origin, plus PostgreSQL**. Implement HttpOnly session/refresh-cookie transport with
Secure, host-scoped attributes, suitable SameSite settings and explicit CSRF defenses,
including login, refresh, logout, uploads and admin changes. Preserve server revocation,
session expiry and stale-response/account-switch protections; no JS-readable bearer
fallback. Exact origins, cookie/proxy details and cross-tab behavior must be documented
and evaluated during implementation. No BAA, provider eligibility, purchase, deployed
secret, actual TLS or deployed configuration has been verified by this choice.

### 7. Fail-closed durable audit

When a required durable audit operation fails, **do not perform the required
patient-record read/write/disclosure**. Do not release patient data or report a
successful mutation without the required durable boundary; mutation/version/audit
must commit atomically. Prepare and authorize a read response internally, durably
record its actual protected resource references, then release that prepared response.
No emergency or break-glass bypass exists in the pilot. Best-effort logs, a post-send
callback or an in-memory queue are not substitutes.

An authorized disclosure/`response_prepared` event does **not** prove a human read or
received it. Minimize restricted audit metadata; no note bodies, OCR payloads, secrets
or raw sensitive queries in ordinary logs/metrics. Keep sensitive full note versions
in separate protected clinical storage. Outbox/sink design, capacity thresholds,
privileges and operator escalation require implementation/verification; no external
sink or immutable-provider guarantee is selected or activated by this document.

### 8. Every committed note save is versioned

Retain a complete clinically relevant snapshot for **every committed note save**,
with server-attributed editor, UTC recorded time, revision and clinical calendar date.
Preserve optimistic conflict checks and atomicity: rejected/stale/failed saves must
not create a successful version or lose the prior head. Do not persist keystrokes or
unsaved drafts as extra versions silently. Same-clinic authorized clinicians may read
clinical history; membership-only admins/audit operators do not acquire that right.

Signing/finalization is **deferred**, not implied by a save or version hash. This is
not a production legal-amendment policy. No automatic revision purge. Previously
overwritten versions cannot be recovered by this feature and must never be fabricated.

### 9. UTC for new instants; preserve calendar dates and uncertainty

New timestamped events are stored and displayed in **UTC**, using explicit instant
types/API offsets and UTC labels; new ambiguous wall-time input is not silently
interpreted. UTC defines new timestamp-based day boundaries/default “today” for the
pilot. DOB, note-calendar date and other calendar-only DATE values remain unchanged
as dates, not midnight instants subject to timezone conversion.

Existing ambiguous wall times remain unchanged and **flagged unverified** wherever
legacy data is separately reviewed; do not infer an offset, append a misleading `Z`,
backfill or convert using a guessed zone. No legacy data enters the new pilot database.
Any later legacy reconciliation/migration requires distinct evidence and user approval.

### 10. Manual invitations and controlled MFA recovery

Deliver one-time invitations manually through an approved channel; **no email vendor
is selected**. Recovery codes are the first recovery route. Assisted MFA reset requires
**one other MFA-authenticated clinic administrator**: recent reauthentication,
documented identity verification and reason, a durable audit record, and revocation
of the affected user's sessions. Do not put verification secrets/documents in public
logs. No self-reset through the admin UI, self-approval or password-only recovery.

If recovery codes are unavailable and there is no other eligible clinic admin,
**remain blocked and escalate** for a separately approved process. Do not invent a
sole-admin bypass, emergency account or automatic factor reset.

### 11. Disable application export and print features

Disable application-provided export, print, PDF and bulk-export features, including
server paths and UI entry points, for this pilot. This cannot prevent a user from
browser printing, taking screenshots or copying data already displayed. Do not claim
that hiding a button enforces no-copy or that a prepared response proves a paper copy.

### 12. No automatic application-data deletion

No automatic deletion of application records, note versions or audit evidence; no
purge/cascade, retention flag or routine job may erase retained history. Deactivation
and session revocation are not record erasure. Reviewed manual cleanup requires a
**separate explicit authorization**; this decision gives no blanket deletion permission
and is not a permanent statutory retention determination or approval of crypto-erasure.

### 13. New empty isolated synthetic database

The pilot design starts with a **new, empty, isolated synthetic database**. Preserve
**all existing databases and schemas**. No automatic assignment of legacy users or
records, copying/migration of existing data, deleting old schemas, or repointing an
existing deployment. Actual database provisioning and bootstrap are not performed
or authorized by this documentation pass; target/configuration and the operational
action must be approved separately. Future bootstrap must refuse an existing/populated
target and must never fall back to a default clinic or old database.

### 14. Local OCR; optional external services off

External AI, email, analytics and PHI-bearing telemetry remain **disabled**. Local OCR
only, preferably with locally provisioned, pinned and verified assets; no runtime
external payload transmission or dependency on runtime asset downloads. Prove the
intended offline behavior later, or report OCR unavailable rather than falling back
to an external service. Minimized local operational diagnostics are not permission
to send clinical data externally. Hosting and PostgreSQL are still infrastructure
providers needing normal approval/configuration; “local OCR” does not mean there are
no infrastructure vendors or waive their controls.

### 15. Encrypted backups and recovery objectives

Target **daily encrypted backups**, **RPO 24 hours** and **RTO 4 hours**. These are
design objectives, **not guarantees**. A successful restore rehearsal with synthetic
data is required for pilot acceptance; check actual recovery point/time, record and
revision integrity, audit evidence, session revocations and safe key access in an
isolated destination without overwriting an existing database or enabling egress.
Provider ability, backup/key mechanism and implementation/verification remain pending.
No purchase, infrastructure change or production restore is authorized here.

### 16. No automatic backup expiry

No automatic backup expiration during the pilot. Any reviewed manual cleanup needs
separate explicit authorization. Monitor storage growth and capacity; verify that
the selected provider/plan and backup mechanism support the approved policy. Do not
claim Render provides infinite retention, silently expire copies or auto-delete to
fit limits. If a mechanism cannot satisfy this policy and the RPO/RTO objectives,
acceptance remains blocked pending a compatible separately approved mechanism or a
new user decision. Preserve keys needed for retained backups; no automatic destruction
that makes them unreadable.

## Remaining inputs and separate approvals

- Later non-sensitive deployment details: actual service origins, Render project,
  region and plan, PostgreSQL target/version/network choice, non-sensitive clinic
  display name and intended admin identifiers. These have **not** been supplied or
  verified; do not guess them or derive membership from them.
- Named clinic/backup/audit operators and approved manual invitation/identity-check
  procedure, controlled first-admin enrollment, reauthentication/session limits,
  audit-capacity/alert thresholds and escalation ownership. No missing operational
  setting permits a default bypass or changes the approved role boundaries.
- A chosen encrypted backup/key-custody mechanism that can meet daily/RPO24h/RTO4h,
  no automatic expiry and monitored growth; provider retention/capacity verification
  and a successful isolated restore rehearsal are still required.
- Actual secret-manager configuration: TOTP-encryption, session/CSRF, data-encryption
  and backup keys, database credentials, invitation tokens and recovery codes must
  be entered **directly through an approved secure channel, never chat**. Do not ask
  the user to paste secrets, reuse the historical key or include them in source/logs.
- User-owned exposed-key review/revocation/replacement remains pending. Any later
  remediation/verification requires its own authorization; no validity probe now.
- Actual provider controls/contracts, TLS, quotas and access evidence remain pending.
  Separate approval is required for purchases, provisioning/deployment, production,
  real PHI, existing-data migration or expanded external services. Approval of this
  design is not approval to perform those actions.

## Ordered implementation handoff — future pass, not executed here

The next autonomous orchestrator should assign **distinct implementer and evaluator**
roles per stage. An implementer submits changes, scope, acceptance criteria and actual
results; a separate evaluator challenges positive/negative/failure boundaries and
reports pass/fail/blocked. Failed work returns for correction and reevaluation before
acceptance. Do not relabel implementer self-checks as independent evaluation. If nested
evaluators are unavailable, MAIN must assign the independent review; otherwise the
stage stays evaluation-pending. Continue only separately safe work when another stage
is blocked, and never cross the approval/provisioning boundaries above.

| Order | Implementer handoff | Distinct evaluator gate required before acceptance |
| --- | --- | --- |
| 1 | Clinic/RBAC baseline and explicit new-empty-DB bootstrap design: clinician versus admin grants, complete server scoping, preservation-safe schema and target guards. No legacy assignment. | Same-clinic clinician sharing; cross-clinic/identifier/cursor/replay denial; admin-only clinical denial; revoked membership and concurrent scope changes; refusal of existing/populated targets with existing data untouched. |
| 2 | Same-origin UI/API routing, HttpOnly session/refresh cookies, CSRF and session/account-switch semantics. | Local HTTPS/browser and API checks for cookie secrecy, unsafe requests including login/refresh/logout/uploads, hostile origins/proxy headers, revocation and multi-tab stale responses; actual hosted TLS still needs separate evidence. |
| 3 | Manual invitations, local TOTP enrollment for everyone, recovery codes, deactivation and other-admin-assisted reset; no self-reset/public signup. | Expired/replayed/altered invites, no pre-MFA privileges, TOTP/code replay, admin/clinician separation, reauthentication and verified-reason audit, session revocation, blocked sole-admin/no-code recovery. |
| 4 | Required durable patient-read/write and security/admin audit; transactional mutation/version boundary, prepared-response resource evidence, restricted metadata/privileges. | Inject durable-write/commit/crash failures; no patient bytes or unaudited success; no break-glass; no false human-read claims; fail-closed admin/recovery mutations and append-only evidence privilege checks. |
| 5 | Complete committed note versions, conflict preservation, UTC new-instant contract/calendar DATE preservation, no signing, no application exports and no automatic deletion. | Concurrent/conflicting/failed saves, full version fidelity/authorized history, timezone-varied clients, unverified legacy fixtures preserved without migration, denied export/print/PDF/bulk paths and no purge/cascade. |
| 6 | Local OCR and offline asset supply; deny external AI/email/analytics/PHI-bearing telemetry and runtime asset fallback. | Synthetic OCR with external destinations denied; verify no payload/asset-download egress; disabled integrations cannot be reenabled accidentally; unavailable OCR fails explicitly. |
| 7 | Encrypted daily backup/restore procedure and no-expiry/storage monitoring; integrate policy acceptance criteria across prior stages. | Approved isolated synthetic restore meets measured target criteria and integrity/revocation checks; missing key/backup fails safely; verify actual mechanism retention/capacity, no silent expiry or overwrite, complete policy-boundary evidence. |

Dependencies matter: stages 1–3 are not usable pilot access until stage 4 protects
their security/clinical operations; stage 5 integrates with stage 4 atomically.
Stage 7 infrastructure execution waits for separate approved target/configuration
and operational authorization. No stage permits bypassing the failed security gate.

## Validation checklist — acceptance criteria, NOT a passing test report

All items below are **pending future implementation and independent evaluation**.
Historical ADR negative specifications remain historical/unexecuted design material,
not new test results; tailor future cases to the approved pilot rather than enabling
unselected IdP, care-team, signing, export or emergency options.

- [ ] Only synthetic identities/records and an explicitly approved new empty isolated
  target are used; existing databases/data/schemas remain untouched.
- [ ] All approved clinic clinicians share permitted patient/history access; every
  cross-clinic route/replay/derived response denies; admin-only is not clinical access.
- [ ] No public signup/password-only privileges; every user/admin completes TOTP;
  invitations/codes are one-use; assisted reset requires another authenticated admin,
  reauthentication, identity verification/reason, durable audit and session revocation;
  no-code/no-other-admin and self-reset cases stay blocked.
- [ ] Same-origin HttpOnly/Secure credentials and CSRF cover all unsafe operations;
  session revocation, expiry, account switches and stale multi-tab responses are safe.
- [ ] Required durable audit failure blocks record access/disclosure and successful
  mutation; no bypass, post-send-only evidence, sensitive log bodies or human-read claim.
- [ ] Every committed save preserves a full authorized version with editor/time and
  conflict checks; no fabricated old versions, signing/finalization or auto-purge.
- [ ] New instants store/display UTC, DATE stays calendar-only; ambiguous legacy
  wall times stay unchanged/flagged and no unapproved backfill or assignment occurs.
- [ ] Application export/print/PDF/bulk export is disabled, with browser-copy limits
  stated honestly; no automatic application/evidence deletion or blanket cleanup.
- [ ] Local OCR works with verified local assets or reports unavailable; external
  AI/email/analytics/PHI-bearing telemetry and runtime external payloads stay disabled.
- [ ] Daily encrypted backups, no automatic expiry, monitored growth, protected keys
  and a successful authorized isolated restore demonstrate the target RPO/RTO; actual
  provider retention/capacity/control evidence is reviewed, not inferred from branding.
- [ ] MAIN receives distinct evaluator evidence and unresolved-gate reporting; the
  historical-key gate remains FAIL until separately authorized owner remediation and
  verification. Real PHI/production/migration/contracts require separate user approval.

This documentation pass records choices only: no runtime/source/configuration changes,
cloud/database operations, app build/test execution or new passing-test claims. Nested
independent evaluator tooling is unavailable in this implementer session; MAIN can
review these documents separately. Documentation structural checks are not pilot acceptance.
