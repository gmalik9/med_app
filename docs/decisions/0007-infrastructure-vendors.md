# ADR 0007 — infrastructure, vendor and operational evidence (Q7 / P13 vendors)

## Current pilot status and scope addendum — 2026-09-20 local

**APPROVED FOR SYNTHETIC PILOT DESIGN; IMPLEMENTATION PENDING;
INFRASTRUCTURE/CONTRACTUAL VERIFICATION PENDING.** Q7 is **PARTIALLY RESOLVED**, not
fully closed: hosting/objectives selected, provider capabilities/contracts/controls
not verified. See the [approved pilot scope](APPROVED_PILOT_SCOPE.md).

- Select one Render HTTPS web service serving UI/API at the same origin plus
  PostgreSQL, synthetic data only. Exact origins/project/region/plan, DB/network/TLS,
  actual controls and operators remain inputs; no provisioning, purchases, deployed
  secrets, provider healthcare eligibility or BAA claim is authorized or verified.
- External AI/email/analytics/PHI-bearing telemetry are disabled. Manual invitations
  use an approved channel, no email vendor. Local OCR only, preferably locally supplied
  pinned/verified assets, no runtime external payload or asset-download fallback.
  Hosting/DB still require normal infrastructure approval/configuration; no provider-
  free or verified-offline claim follows merely from choosing local OCR.
- Target **daily encrypted backups; RPO 24 hours / RTO 4 hours**. A successful isolated
  synthetic restore rehearsal is required for pilot acceptance. Objectives are not
  guarantees; implementation/provider capability, encryption/key custody and measured
  restoration evidence are pending. Existing synthetic evidence is not a new rehearsal.
- **No automatic backup expiry during the pilot**; monitor storage growth. Verify the
  selected provider/plan/mechanism supports this and the objectives. Do not promise
  Render infinite retention or auto-delete to fit limits. If incompatible, block
  acceptance pending an approved mechanism/new decision; manual cleanup requires
  separate explicit authorization. No automatic record/version/audit deletion either.
- Protect all existing databases; the pilot's new empty isolated DB design is not an
  authorization to provision now, migrate existing data or remove old schemas.
- Secret-manager TOTP/session/encryption/backup keys and credentials are direct secure
  entry only, never chat. Treat the historical Google key as **EXPOSED**: user-owned
  review, revocation and replacement are required. Current validity and revocation remain
  unverified. No agent key test/rotation/history rewrite/allowlist change authorized.
  **SECURITY GATE FAIL — OWNER ACTION REQUIRED** remains unchanged.

The evidence register below is still unverified. Its historical “all values pending”
applies to the initial snapshot: daily/RPO24h/RTO4h are now selected objectives, while
other unset operational thresholds and actual capability/contract evidence remain
pending. No new test, deployment or restore result is claimed.

## Historical initial proposal — retained unchanged

The remainder preserves the initial unapproved provider/options snapshot. The addendum
updates only pilot design choices; it does not retroactively certify its evidence rows.

<!-- BEGIN HISTORICAL ADR SNAPSHOT -->

**Status: PENDING — NOT IMPLEMENTED.** No provider approved, external service activated or contract inferred.
Date: 2026-09-20. Owners to designate: platform/DBA, security/privacy/legal, procurement, clinical operations.
Gate register: [Track H](../verification/track-h-decisions.md).

## Evidence and minimal decision

[Application](../../backend/src/app.ts) has an optional HTTPS call sending clinical text
to Gemini `v1/models/gemini-2.5-flash:generateContent`. The enable flag/key is not approval
of that exact product or processing terms. [OCR](../../backend/src/services/stickerOcr.ts)
processes images locally but `createWorker('eng', ...)` does not establish pinned/offline
language-asset availability. [DB configuration](../../backend/src/db/index.ts) accepts a
connection string; source cannot prove deployed TLS, encryption/backups or role grants.
[Operations](../../OPERATIONS.md) records synthetic local restore evidence, not a
production backup/recovery guarantee. Historical Render guidance is not evidence that
a particular deployment/product/region is approved or even in use.

**Question Q7:** Which exact products/accounts/regions/subprocessors and permitted data
classes are approved for hosting, DB, audit, IdP, AI, backups, telemetry and OCR assets?
Who operates them, and what numeric RPO/RTO, outage/backlog limits and contract/key
controls must be met? Choose (A) approved managed services, (B) owned/self-managed
infrastructure with equivalent evidence, or (C) keep optional egress disabled and defer
real ePHI until mandatory infrastructure is approved.

Recommend only evidence-backed A/B; C for optional AI until exact permitted use is
approved. Self-hosting is not exemption from security/operations duties. No marketing
page, environment flag, mock test, encrypted connection alone or generic provider BAA
proves that the exact service/feature/account and use are covered. Legal determinations
remain with qualified owners, not this ADR.

## Evidence register proposal — document schema, not runtime tables

Each entry requires service/product/version, account/tenant, environment/region,
data categories/direction, purpose/minimization, subprocessors, storage/training/retention,
contract/BAA/DPA applicability and exceptions, approved configuration fingerprint,
key/secret custodian, operator/on-call owner, change/incident terms, evidence date/expiry,
approver and residual risks. Store contracts/screenshots/reports in restricted approved
storage; only sanitized references/digests in release records, never credentials/PHI in
Git. **Every row below remains PENDING; blank numeric requirements are blockers.**

| Service / data flow | Required evidence before use |
| --- | --- |
| Hosting, TLS ingress and API/BFF | Exact region/plan, HTTPS/cert rotation ownership, HSTS/proxy trust, no direct backend bypass, private-network policy, operator access, resource quotas and measured replica/rate-limit behavior. Q3 browser tests on actual ingress. |
| PostgreSQL | Certificate/hostname-verified TLS and negative invalid-CA/hostname tests, encryption-at-rest/key controls, supported version/patching, connection budgets, restore/PITR limits; actual separate migration/runtime login denials per Track E. URL text is not proof. |
| Audit sink | Retention lock/WORM or equivalent approved immutability including privileged access model; stable event IDs/deduplication/durable ack, region, exporter privilege, evidence export, capacity and alert drills. Q4 local outbox first. |
| IdP and enrollment/recovery delivery | Exact tenant/issuer/assurance and provisioning terms, MFA/recovery evidence, minimal personal data, no clinical text in notifications, operator separation and offboarding deadlines; Q2. |
| AI formatting | Exact API/product/model, permitted PHI, data residency, prompt/output retention and training controls, human review, complete-response validation and incident/subprocessor terms. Current disabled behavior stays; no real notes/provider calls in H. |
| OCR assets/worker | Pinned verified language/runtime artifacts and licenses, local asset supply chain, bounded memory/time, no image/text egress or retained temp files; prove operation with outbound network denied. Asset download does not by itself prove images leave, but offline assurance is currently missing. |
| Backups and keys | Encrypted off-host copies and protected keys, separately controlled access, immutability/holds/retention, scheduled restore drills and reconciliation of writes after restore point; numeric RPO/RTO, schedule and restore ownership approved. No auto-delete/key destruction. |
| Telemetry, alerting, support and CI artifacts | Data minimization, no note/token/query/URL PHI in logs/labels; protected metrics, real approved alert receiver/on-call drill, artifact access/retention and support export controls. Local counters are not alert delivery. |

## Enforcement / operating contract

- Approved data-flow inventory covers browser → ingress → API/BFF → DB, API → AI,
  worker asset supply, DB/outbox → sink, backup/key and operational support paths.
  Default deny unnecessary outbound destinations at the deployment network boundary;
  validate exact intended hosts and certificate chains, not unrestricted HTTPS.
- Keep current optional AI disabled until Q1/Q4/Q5/Q7 all permit transmission; a text-only
  endpoint currently lacks patient scope context. Design must add appropriate context,
  trusted authorization and pre-egress audit, not just flip the existing enable flag.
- Scope job credentials independently: runtime, migration, outbox delivery, backup,
  restore drill and reviewer. [Track E](../verification/track-e-database.md) templates
  and synthetic login tests are references, not proof of provider ACL application.
  Verify PUBLIC/inherited roles, owner/superuser escape and network exposure in staging.
- Restore into isolated approved environment with AI/mail/telemetry external delivery
  denied. Validate counts/hashes/referential integrity, signed revisions/holds, outbox
  IDs and session revocations before routing traffic. Preserve post-backup writes via
  the approved recovery procedure; don't duplicate external audit deliveries.
- Assign numeric RPO, RTO, backup frequency, drill interval, audit backlog limits,
  connection/resource budget and escalation deadlines; **all values pending**.
  Actual timestamps/artifacts establish measured recovery, not a promised SLO from
  small synthetic benchmarks. Avoid real secrets in command arguments/artifacts.

## Negative acceptance specs — NOT RUN / external evidence unverified

| ID | Approved staging or isolated synthetic drill | Required result |
| --- | --- | --- |
| H7.1 | Missing/expired/wrong-product contract evidence or unapproved region/subprocessor | Release blocked; optional egress remains off. No automatic vendor contact or assertion of compliance. |
| H7.2 | Invalid TLS CA/hostname, forged forwarding headers, public DB/API bypass | Connection/request denied, no insecure `rejectUnauthorized=false` fallback. Evidence from actual ingress/driver. |
| H7.3 | Outbound network disabled while OCR processes synthetic image; AI not approved | OCR works using verified local assets or explicitly unavailable; no external image/text; AI never invoked. |
| H7.4 | Isolated encrypted restore with unavailable key, missing backup or retained legal hold | Safe failure if unrecoverable; successful rehearsal meets approved RPO/RTO and preserves history/holds/evidence; no unexpected egress. |
| H7.5 | Sink/DB outage, backlog saturation, failed alert delivery and on-call absence | Detect/route escalation and apply Q4 stop policy; undelivered alert is a failed drill, not pass. |
| H7.6 | Unauthorized runtime/exporter/backup operator attempts PHI/evidence mutation/access | Privilege-specific denial under real deployed logins; approved custodians and privileged exceptions documented. |

Tests use synthetic data and approved sandbox accounts. Actual contract review cannot
be replaced by executable tests. H will not load secrets, rotate credentials, send real
SSO/email, contact vendors, provision cloud services or run production restores.

## Rollout and rollback

Approve/register products and data flows, then implement configuration/egress controls
and staging drills, collect dated redacted artifacts and independent review. Production
change approval is separate from this design. Re-evaluate when region/product/model,
retention, subcontractor or privileges change; a stale approval is not transferable.

Rollback disables optional disclosure and drains to approved infrastructure or
maintenance, preserving clinical/evidence/backup/key state. Don't switch to an unapproved
vendor, overwrite production from a backup or purge evidence for expediency. Incident
containment/key rotation requires the named authorized response process, not automation
by this track.

## Unblocking evidence

Named owners sign the completed evidence register and numeric operational requirements;
actual deployment TLS/ACL/backup/restore/immutable-sink/alert evidence and applicable
contracts are independently reviewed. H7 and dependent Q1–Q6 release criteria pass.
This is neither certification nor unconditional production authorization.
