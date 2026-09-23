# ADR 0002 — workforce identity, MFA and lifecycle (Q2 / P04)

## Current pilot status and scope addendum — 2026-09-20 local

**APPROVED FOR SYNTHETIC PILOT DESIGN; IMPLEMENTATION PENDING;
INFRASTRUCTURE/CONTRACTUAL VERIFICATION PENDING.** Q2's selected pilot design is
unblocked; see the [approved pilot scope](APPROVED_PILOT_SCOPE.md).

- Select invitation-only local accounts (initial option B), **TOTP MFA for every user
  including all admins**, and single-use recovery codes. No public signup, password-only
  privilege or pre-MFA clinical/admin session. Managed IdP/WebAuthn alternatives below
  are not selected requirements for this pilot.
- Designated clinic admins manage one-time invitations/deactivation within their
  clinic. Invitations go manually through an approved channel; no email vendor chosen.
  Admin is not a clinical grant; a clinician role needs separate approved enrollment.
- Recovery codes first. Assisted MFA reset requires **one other MFA-authenticated
  clinic admin**, recent reauthentication, documented identity verification and reason,
  durable audit and affected-session revocation. No admin-UI self-reset. With no codes
  and no other eligible admin, remain blocked/escalate; no sole-admin bypass.
- Controlled first-admin/MFA enrollment uses explicit synthetic identities on the new
  empty isolated database, not existing-user auto-assignment or a public bootstrap.
  Actual admin identifiers, operators, secure channel and operational timing inputs
  remain to be supplied; this does not reopen the selected identity design.
- TOTP/session/encryption secrets and recovery/invitation credentials are direct secure
  entry only, never chat/source/logs. Secret-manager and lifecycle controls still need
  implementation and distinct evaluation; no real invitations or resets occur now.

The historical provider-specific tests/legacy linkage rollout are unselected options,
not new pilot actions or passing results. No runtime identity control is activated by
this addendum. The historical-key security gate remains FAIL.

## Historical initial proposal — retained unchanged

The remainder records the initial pending alternatives/recommendations and absence
of approval at that time. Use the addendum above for the current pilot decision.

<!-- BEGIN HISTORICAL ADR SNAPSHOT -->

**Status: PENDING — NOT IMPLEMENTED.** No IdP, recovery policy or administrator approved.
Date: 2026-09-20. Owners to designate: workforce/IT identity, security, clinical operations.
Gate register: [Track H](../verification/track-h-decisions.md).

## Evidence and minimal decision

[Auth routes](../../backend/src/routes/auth.ts) implement local passwords, active-account
checks, rotating refresh and self-session logout, not MFA/invitations/recovery/offboarding.
[Configuration](../../backend/src/config.ts) disables signup in production by default,
but an explicit environment setting can enable it; this is not enforced enrollment
policy. [Session creation](../../backend/src/services/sessions.ts) returns bearer tokens.

**Question Q2:** Choose (A) approved managed OIDC/enterprise IdP with MFA and controlled
provisioning, or (B) invitation-only local accounts with funded MFA/recovery operations.
Who approves enrollment, privileged grants, lost-factor recovery and urgent offboarding,
and what MFA assurance, step-up freshness and revocation deadline are required?

- Recommend A if the exact product/tenant is approved under Q7. IdP MFA claims and
  provisioning availability must actually satisfy the chosen policy; an OIDC login
  is not proof of MFA. No email-domain auto-enrollment or email-only account linking.
- B avoids IdP dependency but requires maintained factor enrollment, replay-safe
  verification, recovery, abuse protection and a staffed secure admin process.
  Recommend phishing-resistant WebAuthn; any TOTP/recovery fallback is an explicit
  assurance downgrade requiring approval. No placeholder `mfa=true` control.

## Schema proposal — design only

| Object | Proposed invariant |
| --- | --- |
| `external_identities` | Unique `(issuer,subject)`, retained user FK, provider/tenant allowlist; email is a contact attribute, never the identity key. Controlled audited linking only. |
| `enrollment_requests` / `invitations` | Opaque random token stored as digest, intended org/user/roles, approver, expiry, one-use consumption, accepted/revoked times; transactionally unique redemption. No credential or invite token in logs. |
| `auth_assurance_events` | User, session, method, validated issuer/assurance, authentication time, policy version; append-only restricted metadata, not raw assertions/tokens. |
| Session extension | `auth_time`, `assurance_level`, `assurance_policy_version`, `revoked_at`, `credential_version`; no client-supplied assurance. Use explicit instant types for new fields; Q6 covers legacy fields. |
| Local factors, if B | WebAuthn credential ID/public key/user binding and replay policy; encrypted TOTP secret only if approved; hashed single-use recovery codes; append-only enrollment/recovery events. Key custody under Q7. |
| Lifecycle events | Enrollment/grant/recovery/suspension actor, target, reason, approvals, old/new authorization versions and durable Q4 event; retain user identity attribution rather than deleting users. |

MFA completion precedes creation of a PHI-capable session. Any pre-MFA session may
access only the challenge flow, not refresh into elevated assurance. Runtime principals
may not self-grant role membership; extend [Track E](../verification/track-e-database.md)
grants explicitly, preferably with a narrowly privileged identity-management path.

## Endpoint / enforcement proposal

All paths below are **new proposed routes**, not present functionality.

| Endpoint | Policy and transaction |
| --- | --- |
| `GET /api/auth/oidc/start`, `GET /api/auth/oidc/callback` (A) | Authorization code + PKCE, one-use state/nonce tied to browser, exact issuer/audience/redirect, signature/expiry checks, required verified assurance. Exchange code server-side under Q3, never return provider tokens to browser. |
| `POST /api/admin/invitations`, `POST /api/admin/memberships` | Scoped `membership.manage`, approved grant ceiling, recent step-up, CSRF, no self-approval for privilege elevation; S event/outbox in same transaction. |
| `POST /api/auth/invitations/accept` (B) | Single-use intended-person proof, expiry and revoked checks; no arbitrary org/role; factor enrollment before PHI access. |
| `POST /api/auth/factors/enroll`, `POST /api/auth/factors/verify` (B) | Recent existing assurance or controlled first-enrollment proof, one-use challenges, rate limits; cannot reset a factor with just a stolen session. |
| `POST /api/admin/recoveries`, `POST /api/admin/users/:id/suspend` | Authorized workforce operator, out-of-band identity proof and approved separation of duties for recovery, generic responses. Suspension revokes all sessions and memberships atomically; S. |

Existing profile update cannot grant roles or change the login identity. Refresh
rechecks active identity/membership/credential version and required assurance.
IdP logout alone is insufficient: revoke local sessions. Verified signed provisioning
events need replay deduplication, tenant binding and periodic reconciliation; define
fail-closed behavior if membership freshness exceeds the approved deadline. Handle
recovery, factor replacement and privilege change by revoking obsolete sessions and
requiring reauthentication. No public bootstrap administrator, shared admin, secret
in argv, real invitation/SSO email, or provider contact is part of this work.

## Negative acceptance specs — NOT RUN / controls absent

| ID | Synthetic real-boundary scenario | Required result |
| --- | --- | --- |
| H2.1 | Validly signed wrong issuer/audience/tenant; mismatched/replayed state/nonce/code; token without required MFA or stale `auth_time` | Deny before PHI session issuance; no auto-link by same email. |
| H2.2 | Expired/revoked invite, parallel double acceptance, altered role/org, self-elevation | No unauthorized grant; at most one accepted invitation, atomic S event. |
| H2.3 | Password-only or pre-MFA session calls every PHI route/refresh; replay factor challenge/recovery code | Deny; no assurance inferred from a client field or user-agent. |
| H2.4 | Offboard during login/refresh/in-flight write; replay old access and refresh after completed suspension | No new authorization after revocation boundary; H1 serialization semantics; events preserved. |
| H2.5 | Lost factor recovery, unavailable IdP, stale provisioning event, forged webhook | No silent password-only/shared-admin fallback; recovery follows approved proof and invalidates old sessions. |

Use a local protocol-conformance IdP and synthetic identities first, then an approved
staging tenant with test accounts only. Controlled JWT mocks alone cannot validate
provider MFA or workforce recovery. No real mail is sent by this scaffolding.

## Rollout and rollback

Approve provider/assurance/recovery first. Inventory and owner-verify legacy identity
bindings and admin role grants; quarantine ambiguous links without deleting identity
history. Rehearse enrollment, lost-factor recovery and offboarding. Pilot synthetic
accounts, then approved workforce enrollment and a coordinated session cutoff/re-login.
Do not rotate real credentials or manufacture enrollment automatically.

Rollback preserves bindings/factor evidence and revocations; use a compatible identity
release or maintenance, not public signup/password-only login as an availability hack.
Do not restore revoked sessions from a backup. Separately approve any emergency access.

## Unblocking evidence

Named owners approve A/B, provider/tenant, enrollment/grant matrix, assurance/freshness,
recovery proof and staffing, session/revocation deadlines and Q7 terms. Implement and
pass H2 plus real staging-provider assurance/lifecycle tests, Q1 scope and Q3 transport.
Record approvals, test results and independent evaluation; neither exists in this ADR.
