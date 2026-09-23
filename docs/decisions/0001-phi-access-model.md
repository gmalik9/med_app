# ADR 0001 — PHI access and legacy assignment (Q1 / P03)

## Current pilot status and scope addendum — 2026-09-20 local

**APPROVED FOR SYNTHETIC PILOT DESIGN; IMPLEMENTATION PENDING;
INFRASTRUCTURE/CONTRACTUAL VERIFICATION PENDING.** Q1's selected pilot access design
is unblocked; the [approved pilot scope](APPROVED_PILOT_SCOPE.md) is authoritative.

- Select organization-scoped, clinic-wide access (the initial option B): all approved
  clinicians within each clinic share its patients/history; organizations are isolated.
  Explicit clinic membership and separate role grants must be enforced server-side on
  all routes, queries, derived data, versions, cursors, OCR matches and replay paths.
  `created_by` stays provenance, not owner policy. No care-team requirement is selected.
- Designated clinic admins manage invitations/deactivation, not clinical records by
  virtue of being admins. A separately approved clinician enrollment can grant an
  admin clinical access in that clinic; no global administrator clinical permission.
  Preserve existing author/self restrictions on writes unless separately approved.
- Start from a new empty isolated synthetic database; preserve all existing databases.
  No legacy user/record assignment, inferred default clinic, existing-data migration
  or old-schema deletion is approved. Historical mapping/clone/cutover proposals below
  are not the pilot bootstrap work order.
- UTC replaces the historical optional clinic display-zone proposal for new events.
  Signing is deferred; application exports/print/PDF/bulk export, external AI and
  break-glass are disabled, not capabilities enabled by the historical matrix.

The initial B/C matrix and negative specs below remain useful design inventory, not
implemented controls or fresh test results. Adapt only the selected B/pilot boundaries
in a future implementation/evaluator pass. Real PHI and any legacy migration require
separate approval. The historical-key security gate remains FAIL.

## Historical initial proposal — retained unchanged

The remainder is the pre-approval snapshot. Its PENDING wording, open alternatives,
unblocking requests and rollout steps describe that earlier state, not a withdrawal
of the limited pilot approval above.

<!-- BEGIN HISTORICAL ADR SNAPSHOT -->

**Status: PENDING — NOT IMPLEMENTED.** Recommendation only; no owner approval recorded.
Date: 2026-09-20. Owners to designate: clinical operations, privacy/security, data owner.
Gate register and evidence: [Track H](../verification/track-h-decisions.md).

## Evidence and minimal decision

[Patient routes](../../backend/src/routes/patients.ts) share the directory, search,
demographics and status across authenticated users. [Note routes](../../backend/src/routes/notes.ts)
scope today's editable note to its author, but share all clinicians' current notes in
patient history. `created_by` is provenance, **not ownership or a care assignment**.
[Authentication](../../backend/src/middleware/auth.ts) checks an active exact session;
its `authorize` helper is not used by the current route modules. Stored role names
therefore do not constitute a complete permission policy. Pagination and request
idempotency are not tenant authorization.

**Question Q1:** Is access (A) explicitly one shared clinic, (B) organization-scoped,
or (C) organization plus assigned care team? Who assigns existing users/patients and
which workforce roles may read, write, sign, export and administer?

- A preserves the current broad workflow, but needs an explicit single-clinic
  boundary and approved workforce privileges; it cannot serve unrelated clinics.
- B prevents cross-organization access but still permits approved clinic-wide care.
- C additionally limits within-clinic disclosure; unassigned urgent care needs the
  separately approved Q4 process, not an implicit override.
- Recommend B as the minimum if another clinic is possible; use C only with a
  staffed assignment workflow. The matrix below is a **candidate for B/C**, not an
  approval. Selecting A requires an explicit replacement matrix and deployment limit.

## Schema proposal — design only

| Proposed object | Keys, invariants and purpose |
| --- | --- |
| `organizations` | UUID PK, name, status, IANA display zone; no implicit default organization. |
| `organization_memberships` | PK `(organization_id,user_id)`, status, authorization version; FK to retained organization/user with `ON DELETE RESTRICT`. Role grants separate, unique `(organization_id,user_id,capability)`. Inactive membership denies all clinical scope. |
| `care_teams`, `care_team_memberships` | Team belongs to exactly one organization; composite FKs prevent cross-org membership; start/end and revocation recorded. |
| `patient_care_assignments` | Explicit patient/team/organization and read/write scope, grantor, reason, validity interval; membership and patient composite FKs in same org. Preserve closed assignments, do not delete provenance. |
| Patient/clinical scope | Add `organization_id` to patients, notes, vitals, appointments, visits, templates and write-key references; backfill only approved assignments. Use existing immutable internal patient PK for new composite `(organization_id,patient_pk)` references. Keep old business-ID links during expansion. |
| Identifier namespace | Eventually unique `(organization_id,patient_id)`; all lookup/join/FK/aggregate/cursor/replay paths must carry org and internal patient PK **before** dropping global MRN uniqueness. Until then, duplicate MRNs across orgs are blocked, never merged. Numeric MRN search remains distinct from internal IDs. |
| `assignment_batches` and entries | Batch UUID, source checksum, approvers, row-version predicates, counts, approval time; restricted mapping of old PK to approved org/team. No copied clinical text; unresolved rows explicitly marked, not guessed. |

No history FK may cascade-delete retained clinical versions/security evidence.
Unknown scope remains quarantined from normal access; archive access also requires
an approved scope. An org administrator is not automatically a clinical reader or
signer. Recommended capabilities: `patient.read`, `patient.manage`, `note.write`,
`note.sign`, `vital.write`, `visit.write`, `appointment.manage`, `template.publish`,
`clinical.history.read`, `clinical.export`, `membership.manage`, `audit.review`.
Clinical leadership must approve the role-to-capability grants (e.g. clinician,
nurse, scheduler, org administrator, records reviewer); don't map legacy `admin`
or `doctor` to every capability by default.

## Endpoint / policy enforcement matrix — proposed, not current controls

All clinical rows require live session + active org membership; B requires the
appropriate capability, C additionally a valid patient assignment. Self/author
restrictions remain **in addition to**, never instead of, scope checks. Membership
admin and audit-review privileges alone confer no PHI rights. `D` below means the
[Q4 pre-release durable event/outbox](0004-audit-availability.md), including reads,
derived data and replays; `S` means a durable security/administrative event.

| Method and existing endpoint | Proposed enforcement / disclosure boundary |
| --- | --- |
| `GET /health` | Public, process-only, no PHI or dependency detail. |
| `GET /ready` | Public generic ready/unavailable only; no catalog/role output. |
| `GET /api/auth/capabilities` | Public safe configuration only; no users/org enumeration. |
| `POST /api/auth/register` | Production self-registration remains denied; Q2 enrollment replacement must not reopen it. |
| `POST /api/auth/login` | Q2 MFA/enrollment and Q3 login-CSRF checks before issuing session; S. |
| `POST /api/auth/refresh` | Exact session + current approved assurance/membership state; CSRF; S. |
| `POST /api/auth/logout` | Revoke only possessed session, including expired access with valid revocation credential; CSRF; S. |
| `GET /api/auth/profile` | Self only, no role assignment surface; D for disclosed personal data. |
| `PUT /api/auth/profile` | Self allowlisted profile fields, never role/org/assurance changes; S and D. |
| `GET /api/patients/` | `patient.read`; SQL-filter before limit/count/aggregate/cursor; D covers actual page. |
| `GET /api/patients/search` | `patient.read`; search only within authorized scope; inaccessible behaves like absent; D. |
| `GET /api/patients/:id` | `patient.read`; both numeric internal and business-ID paths scoped; D. |
| `POST /api/patients/create` | `patient.manage`; server-selected approved org; assignment created transactionally if C; D. |
| `PUT /api/patients/:id` | `patient.manage`; demographics and clinical field grants separately approved; scoped update + D. |
| `PATCH /api/patients/:id/active` | `patient.manage`; inactive is not deletion, no access expansion; D. |
| `POST /api/patients/scan-sticker` | Authorized intake capability before upload/OCR, scoped match only; unauthorized match indistinguishable from absent; don't echo matched chart PHI; D before returning uploaded text or chart. |
| `GET /api/notes/patient/:patientId` | `patient.read`, existing author/day predicate retained; D. |
| `POST /api/notes/patient/:patientId` | `note.write` + author/draft-only under Q5; expected revision; D with snapshot transaction. |
| `GET /api/notes/patient/:patientId/history` | `patient.read` for current notes; old-version retrieval separately requires `clinical.history.read`; D. |
| `POST /api/vitals/patient/:patientId` | `vital.write`, server actor; reauthorize keyed replay and D before reply. |
| `GET /api/vitals/patient/:patientId/latest` | `patient.read`; scoped query + D. |
| `GET /api/vitals/patient/:patientId/history` | `patient.read`; scoped page + D. |
| `POST /api/appointments/create` | `appointment.manage`; preserve current self-doctor rule pending delegation approval; reauthorize replay + D. |
| `GET /api/appointments/upcoming` | Self doctor AND authorized patient scope, not a scope bypass; D. |
| `PUT /api/appointments/:appointmentId/status` | `appointment.manage` AND existing assigned-doctor condition; scoped transaction + D. |
| `GET /api/appointments/patient/:patientId/history` | `patient.read`; scoped page + D. |
| `POST /api/visits/create` | `visit.write`, server actor; scoped create/replay + D. |
| `GET /api/visits/patient/:patientId` | `patient.read`; all/upcoming filters and cursor scoped + D. |
| `GET /api/visits/doctor/today` | Self doctor AND authorized patient scope; clinic-day Q6 contract + D. |
| `POST /api/templates/create` | Creator scope; `template.publish` for org-shared templates. `is_public` must not mean cross-org; S. No patient text in reusable templates. |
| `GET /api/templates/list` | Active own/org-shared templates only; no other-org public-template leakage; D if legacy content may contain PHI. |
| `GET /api/templates/category/:category` | Same template policy, scoped category query; D as above. |
| `GET /api/analytics/dashboard` | Self AND scoped underlying notes/visits/appointments; audit-derived aggregate only, not raw audit access; D. |
| `GET /api/analytics/patient/:patientId/trends` | `patient.read`; scope every constituent query/aggregate; D. |
| `POST /api/analytics/event` | Authenticated actor/org, fixed event enum, no arbitrary event data; S if relied on as evidence. |
| `POST /api/format-note` | Q7 approval + approved clinical capability and patient context (currently text-only); D before vendor transmission AND before returning PHI, no auto-save. |

Implicit HEAD must enforce the corresponding GET policy without leaking existence;
OPTIONS/CORS must return no PHI. Apply case/trailing-slash/decoded-param handling
consistently. New revision/export/admin/IdP routes are proposals in other ADRs,
not present endpoints. No public audit-log endpoint is proposed. Browser print is
already possible after disclosure; removing a button cannot enforce no-copy.

Centralize `authorizeAction(actor, organization, action, resource, transaction)`;
never trust a client org header or a stale JWT claim without membership validation.
Scope every SQL branch before projection, counts, aggregates, cursor boundaries and
idempotency lookup. Cursor context must bind org, principal/authorization version,
patient, filters and sort; it is not a grant. Current replay rechecks existence,
not team access, and needs the same new enforcement. Linearize authorization with
membership/assignment changes: protected reads/writes lock or otherwise serialize
the relevant authorization version through the durable prepare/commit boundary;
revocation must acquire the matching serialization barrier. Document already-
authorized in-flight responses; do not promise recall of bytes already released.

## Legacy assignment preflight — read-only until separately approved

1. Use Track E's read-only/aggregate-only preflight pattern. Inventory every user,
   patient, clinical child, template, session, key ledger and audit reference;
   count orphans, unknown roles, missing/multiple mappings, stale row versions,
   cross-org children/actors, identifier collisions and cross-org public templates.
2. Data owner supplies a restricted mapping manifest with explicit provenance and
   signoff per batch. No inference from `created_by`, email/domain, MRN pattern,
   server timezone, note author or last login. Authors remain authors even where
   historical cross-clinic practice needs reconciliation; don't rewrite attribution.
3. Block cutover for any exposed record without exactly one approved organization
   and required team mapping. Quarantine requires an approved clinical continuity
   plan; do not silently make records disappear. Count-only console output; mapping
   IDs stay in controlled storage, never Git, CI artifacts or normal logs.
4. Recheck manifest checksum and row versions under the cutover lock/drain. Compare
   row counts, reference integrity and old-field hashes before/after; abort on drift.
   Do not execute assignment SQL as part of this scaffolding.

## Negative acceptance specs — NOT RUN / controls absent

Use synthetic orgs A/B, two teams in A, clinician, scheduler, membership-only admin,
revoked member and unassigned legacy patient; run real API + PostgreSQL tests.

| ID | When | Required result |
| --- | --- | --- |
| H1.1 | A user supplies B's internal ID/MRN via every matrix route, mixed case, query/body, OCR match, analytics or cursor | No B data/existence/count/template leakage; object reads/writes 404 (search retains absent response), lists filtered. No side effects. |
| H1.2 | Same org but wrong team under C; admin lacks clinical capability | Same denial; no implicit admin/break-glass privilege. |
| H1.3 | Replay a successful write key or continue paging after membership/team revocation | Denied before resource return; no second mutation; new read/replay audit only if authorized. |
| H1.4 | Forge org/actor/role fields or reuse numeric MRN across orgs | Server context wins, no confused-ID lookup or cross-org FK. |
| H1.5 | Missing/ambiguous mapping or concurrent edit during preflight/cutover | Cutover aborts with counts only, old rows unchanged; no creator/email auto-assignment. |
| H1.6 | Revoke concurrently with prepare/commit | Defined serialization order: revocation-first denies; already-authorized operation has durable scope/version evidence, not an unbounded cached grant. |

## Rollout and rollback

After approval: additive schema and scope adapters, approved manifest rehearsal on
an isolated clone, validated composite constraints/indexes, restricted pilot, then
coordinated drain/backfill/cutover. Reference [Track E](../verification/track-e-database.md)
for separate migration/runtime logins, explicit version/object/grant updates and
real-login denial tests. RLS may add defense in depth but is not implemented here;
if chosen, prove transaction-local scope cannot leak across pooled connections.

Before activation rollback can leave additive data intact. After scoped data exists,
**never route it through the old shared-clinic binary**. Drain to maintenance or a
scope-compatible release; preserve assignments/history and forward-fix. No destructive
down migration or reassignment-to-default rollback.

## Unblocking evidence

Named owners approve A/B/C, role matrix, delegation/urgent-care policy and complete
legacy manifest; implementation passes H1 against real routes/DB, every matrix row
is covered, and Q2/Q3/Q4/Q5/Q7 dependencies pass. Approval allows implementation;
it does not itself authorize ePHI release. Independent evaluator still required.
