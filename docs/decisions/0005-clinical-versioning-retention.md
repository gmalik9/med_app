# ADR 0005 — clinical revisions, signing, retention and export (Q5 / P06)

## Current pilot status and scope addendum — 2026-09-20 local

**APPROVED FOR SYNTHETIC PILOT DESIGN; IMPLEMENTATION PENDING;
INFRASTRUCTURE/CONTRACTUAL VERIFICATION PENDING.** Q5's saved-version/no-export/
no-delete subset is unblocked; **signing/finalization DEFERRED — NOT CLOSED**.
See the [approved pilot scope](APPROVED_PILOT_SCOPE.md).

- Select saved versions without signing (initial option A). Version **every committed
	note save**, including complete clinically relevant data, editor, UTC recorded time
	and calendar date. Preserve expected-revision conflicts and atomic snapshot/current-
	head/audit commit; failed/stale saves must not invent successful versions. Do not
	silently persist keystrokes or unsaved drafts.
- Same-clinic approved clinicians share clinical-history access; admin-only/audit roles
	do not automatically receive old note text. Keep existing author/self write rules
	unless separately approved. No signing, finalization, attestation or amendment-law
	guarantee follows from a save/hash; production lifecycle policy remains separate.
- Disable application export, print, PDF and bulk-export features for the pilot,
	including UI/server surfaces. Browser printing, screenshots and copying displayed
	data cannot be prevented by removing these features; do not claim no-copy enforcement.
- No automatic deletion of app records, revisions or audit evidence. No automatic
	backup expiry during the pilot; monitor storage. Reviewed manual cleanup always
	needs separate explicit authorization. No purge, cascade or key destruction as a
	workaround; this is not a production legal retention/amendment approval.
- Use the new empty isolated synthetic database; leave existing data untouched. The
	historical baseline/backfill proposal is not approved for execution. Old overwritten
	note versions cannot be recovered and must never be fabricated.

The historical signing/export routes and specs below are unselected/deferred, not
pilot features or passing tests. The historical-key security gate remains FAIL.

## Historical initial proposal — retained unchanged

The remainder records the initial pending broader lifecycle/retention alternatives.
Its recommendation of finalization does not supersede the current pilot deferral.

<!-- BEGIN HISTORICAL ADR SNAPSHOT -->

**Status: PENDING — NOT IMPLEMENTED.** No historical snapshots, signed-note lifecycle or retention approval added.
Date: 2026-09-20. Owners to designate: clinical leadership, records/privacy, qualified legal/compliance, security.
Gate register: [Track H](../verification/track-h-decisions.md).

## Evidence and minimal decision

[Note save](../../backend/src/routes/notes.ts) updates `note_text`/codes in place and
increments `revision` on a successful expected-revision match. Patient “history” lists
different current note rows, **not past revisions**. [Schema](../../backend/src/db/schema.ts)
has one note/doctor/patient/day and cascading patient-to-clinical foreign keys.
[Migration 1](../../backend/src/db/migrations.ts) changes the retention default to false
without rewriting existing `auto_delete` rows. No deletion scheduler is implemented.
[Print/Export](../../frontend/src/components/TemplatesAnalyticsPanel.tsx) calls browser
print, not an authorized server export or durable copy inventory.

**Question Q5:** Approve (A) append-only saved drafts initially, with no signing claim,
or (B) saved drafts → signed/final → attributed amendments. Who may sign/view earlier
text/amend/export; what are the retention triggers/durations, legal holds and permitted
copies? Is clinician attestation sufficient or is a cryptographic signature required?

Recommend B for a clinically final record if the workflow/records policy is ready;
A is a staged capability, not equivalent finalization. No presumed statutory retention
duration, automatic deletion, irreversible “retain forever” policy, or fabricated
signature is selected. Approve whether one note per doctor/day is still acceptable;
don't silently change the clinical unit of documentation while adding versions.

## Schema proposal — design only

| Proposed object | Invariants |
| --- | --- |
| `clinical_note_revisions` | PK `(note_id,revision)`, org/patient/author FKs, complete clinically relevant snapshot: date, text, codes, type, diagnosis, treatment plan, follow-up date; editor, recorded instant, provenance, previous revision reference, amendment reason when required. Append-only, `ON DELETE RESTRICT`, never CASCADE. |
| Current note projection | Current revision pointer + optimistic-lock version + lifecycle (`draft`, `signed`, `amended`, `legacy_unclassified`). Projection must correspond to committed revision; all update paths use controlled transaction. Parent identity/author/patient cannot be reassigned to rewrite history. |
| `clinical_note_attestations` | Immutable attestation ID, exact `(note_id,revision)`, signer, verified assurance/auth time, signing intent/statement version, signing instant, canonical snapshot digest/algorithm. If cryptographic signing chosen, signature/key-version reference and independent verification contract. A hash by itself is **not** a digital signature. |
| Amendment lineage | New revision/attestation references original signed revision; preserves original signature/content. Reason/editor/time required; never replace the old signed snapshot. Draft amendment not presented as signed. |
| `retention_policies`, `legal_holds` | Approved version/authority, record classes, trigger, duration and scope; hold reason/issuer/start plus append-only release decision. Covers current notes, old revisions, attestations, audit, outbox, retry ledger, keys, backups and export copies. No purge worker in this proposal. |
| `clinical_exports` | Requester/approved purpose, exact revision manifest, org/scope, requested/completed/expiry instants, destination/copy classification and audit IDs; restricted storage. No public URL or audit-log body as an export substitute. |

Keys and identifiers are PHI-adjacent; keep revision content in protected clinical
storage, **not public audit or operator logs**. A signing key is separate from login
JWT secrets. Key destruction/rotation affecting signature verification or encrypted
records requires Q7 and records approval, not automatic credential rotation.

## Endpoint / transaction contract

Existing save stays author-scoped plus Q1 capability and must reject edits to signed
notes; current optimistic concurrency remains. Proposed new routes, all absent today:

| Proposed route | Required policy |
| --- | --- |
| `GET /api/notes/:noteId/revisions`, `GET /api/notes/:noteId/revisions/:revision` | `clinical.history.read` plus live patient/org/team scope; bounded pagination, explicit author/editor/provenance, Q4 durable read event. Not open to ordinary audit reviewers. |
| `POST /api/notes/:noteId/sign` | `note.sign`, approved author/delegation rule, recent Q2 step-up, exact expected revision and explicit signing intent; transactionally immutable attestation + Q4 event/outbox. |
| `POST /api/notes/:noteId/amendments` | Approved amendment role, original signed reference, reason and expected head; save a new revision without touching original. Signing amendment uses same assurance contract. |
| `POST /api/clinical-exports` | `clinical.export` and per-record scope at request/preparation/download; purpose, exact manifest, Q4 before disclosure. Scoped expiring authenticated delivery, no public object-store URL. |

Lock head/authorization state, compare expected revision, insert full next snapshot,
update projection, and append Q4 evidence/outbox **in one transaction**. Concurrent
saves/signs have one winning expected head; stale request gets 409 with no snapshot,
signature or success event. Persist actor from server, not body. Ensure direct-DB
runtime grants cannot update/delete snapshots/attestations or bypass signed-state
invariants; use narrowly scoped database operations/constraints and test actual
logins with [Track E](../verification/track-e-database.md). Application UI alone is
insufficient; a general UPDATE grant on note projection needs restriction/review.

AI output remains an explicitly reviewed draft: preserve original text in the UI,
never auto-save/sign/promote provider output. Each **committed** version is retained;
keystrokes/unsaved drafts are not silently persisted as new PHI. Printing after
authorized disclosure cannot be technically recalled; label version/author/signature
state and approved copy handling. `window.print()` does not prove a paper copy was
created, delivered, secured or destroyed.

## Legacy preflight and preservation

Inventory counts of notes/revisions, missing authors/patients, duplicate clinical
keys, invalid codes, old retention flags and cascade FKs. Backfill exactly the current
known snapshot at its existing revision, provenance `legacy_current_only`, capture time
separate from original recorded timestamps. Earlier revisions are explicitly unavailable;
**never manufacture revision 1..N, past editor/times, signatures or overwritten text**.
Legacy rows are `legacy_unclassified`, not silently signed/final. Future attestation of
a legacy snapshot occurs now with present intent; it does not certify a historical act.

Preserve existing retention rows (including true flags) as unapproved legacy metadata;
do not enable a scheduler from them. Replace cascade relationships with retention-safe
RESTRICT boundaries in an approved migration, including current clinical parents;
deactivate/archive identities rather than delete. Separate retention/destruction
design must respect holds, replicas/backups, restore and keys. No such deletion is
authorized now, even if a guessed retention date has elapsed.

## Negative acceptance specs — NOT RUN / controls absent

| ID | Scenario | Required result |
| --- | --- | --- |
| H5.1 | Two draft saves or save versus sign race on same expected revision; injected snapshot/audit failure | One committed winner or total rollback, no orphan snapshot/attestation and no stale success. |
| H5.2 | Edit/delete signed text/codes/date/author, direct runtime SQL or patient/user deletion | Deny; every earlier revision and attestation remains unchanged, no cascading history loss. |
| H5.3 | Amend another scope, missing reason, stale head, client-forged signer/assurance | Deny; valid amendment preserves original signed content and explicit lineage. |
| H5.4 | Ordinary audit reviewer or revoked care member requests old text/export; membership revoked before download | Deny before bytes; no clinical text appears in audit/metrics or public URLs. |
| H5.5 | Backfill current note at revision 7 with no past text; inspect after migration/rollback | Exactly one known baseline at 7, provenance visible, revisions 1–6 unavailable, no invented timestamps/signing. |
| H5.6 | Legal hold, legacy `auto_delete=true`, backup restore and signing-key unavailability | No automated deletion/crypto-erasure; retained evidence and hold state preserved; signing failure does not silently finalize. |
| H5.7 | AI returns altered/truncated text, user rejects or provider times out | Original committed snapshot untouched; no automatic save/sign; export shows actual approved revision. |

## Rollout and rollback

Approve lifecycle/roles/retention/copies first. Add tables and restricted grants;
rehearse count/hash-preserving baseline capture under locked heads/traffic drain,
then atomic versioned writer and clinical UI. Fence old overwrite-only binaries once
versioning/signing starts. Restrict new history access until Q1/Q4 policies implemented.
Retention remains no-delete pending a distinct approved implementation.

Rollback to a history-compatible writer or read-only/maintenance; retain tables,
snapshots, signing/hold/export records and keys. Do not “repair” by copying only latest
text and dropping history. An old app that overwrites signed notes is not a safe rollback.

## Unblocking evidence

Clinical/records/legal owners approve lifecycle, signer/delegation rules, old-text
visibility, amendment reasons, retention schedule/holds, copy/export handling and
attestation vs cryptographic signature. Real DB concurrency, delete-denial and export
tests H5 plus Q1/Q2/Q4/Q7 review are required. Lost pre-rollout versions remain lost.
