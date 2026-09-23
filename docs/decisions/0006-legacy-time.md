# ADR 0006 — calendar dates, instants and uncertain legacy time (Q6 / P10 conversion)

## Current pilot status and scope addendum — 2026-09-20 local

**APPROVED FOR SYNTHETIC PILOT DESIGN; IMPLEMENTATION PENDING;
INFRASTRUCTURE/CONTRACTUAL VERIFICATION PENDING.** Q6's new-time/display contract is
unblocked; **legacy mapping/conversion NOT APPROVED — NOT CLOSED**.
See the [approved pilot scope](APPROVED_PILOT_SCOPE.md).

- Store and display **new timestamped events in UTC**, with explicit instant types,
   API offsets and UTC labels. UTC governs new timestamp-based day boundaries/default
   today. Preserve DOB/note-calendar and other DATE fields as calendar dates, never
   midnight instants shifted through local timezone conversion.
- Keep existing ambiguous wall-time values unchanged and **flagged unverified** on
   any separately authorized legacy review surface. No inferred UTC/offset, guessed
   conversion, backfill or authoritative `Z` serialization. Original history remains
   uncertain until a separately approved evidence-backed mapping exists.
- Start with a **new empty isolated synthetic database** and preserve all existing
   databases/schemas. No existing-data movement, legacy user/record assignment or old-
   schema deletion. The new-database choice avoids a pilot legacy migration; it does
   not approve mapping or make uncertain historical times verified.
- The initial configurable clinic-zone/future wall-time/DST design below is not the
   selected UTC pilot contract. Preserve historical proposals/specs for possible later
   review; do not implement a legacy cast or treat old test specifications as results.

Implementation still needs timezone-varied validation of UTC instants, calendar DATE,
conflicts/cursors/retries and unchanged unverified legacy fixtures without migrating
real data. The historical-key security gate remains FAIL.

## Historical initial proposal — retained unchanged

The remainder is the initial pending legacy-time proposal. Current pilot new-time
approval above is deliberately narrower than that historical conversion work order.

<!-- BEGIN HISTORICAL ADR SNAPSHOT -->

**Status: PENDING — NOT IMPLEMENTED.** No legacy timezone chosen and no values converted.
Date: 2026-09-20. Owners to designate: data steward, scheduling/clinical operations, DBA.
Gate register: [Track H](../verification/track-h-decisions.md).

## Evidence and minimal decision

[Schema](../../backend/src/db/schema.ts) uses `DATE` for DOB/note/follow-up dates, but
wall-clock `TIMESTAMP` for appointment/visit/vital, session and other event fields.
[DB parser](../../backend/src/db/index.ts) preserves DATE as text.
[Current keyed appointments](../../backend/src/services/idempotency.ts) intentionally
preserve legacy timestamp semantics: offset suffixes do not establish a retained UTC
instant. [Track E preflight](../../backend/src/db/preflight.ts) counts populated legacy
timestamps without converting them. [Notes](../../backend/src/routes/notes.ts) default
to server-local today; doctor summaries use DB-local day boundaries. Host/browser/DB
timezone agreement or previous API ISO output is not reliable historical provenance.

**Question Q6:** For each deployment/record cohort, is there trustworthy evidence for
(A) UTC, (B) a specific IANA zone/offset with DST resolution, or (C) unknown time? Which
clinic zone defines scheduling and “today,” and who resolves ambiguous appointments?

Recommend evidence-based A/B only, C otherwise. A single default clinic zone cannot
reinterpret every historical value. C preserves uncertainty and may prevent automatic
chronological scheduling; it is safer than silently shifting encounters. Define whether
future appointments follow clinic wall time or an absolute instant if zone rules change.

## Schema and API proposal — design only

| Type | Proposed contract |
| --- | --- |
| Calendar date | Keep `DATE` and strict `YYYY-MM-DD` for DOB, note day and date-only follow-up. No midnight UTC conversion. Explicit approved clinic zone used to choose a default today. |
| New clinical event instant | Add explicit `TIMESTAMPTZ` column; accept RFC3339 with offset where client-entered, validate zone/offset consistency where applicable. Server-created vital/visit events use server instant. Return explicit offset/UTC, not ambiguous local strings. |
| Future appointment | Store intended wall datetime, IANA zone, selected offset/DST fold, resolved instant and tzdb version/provenance. Reject nonexistent local times; require explicit choice between two folds, never guess. Zone rule updates cannot silently reschedule an approved appointment. |
| Legacy provenance | Retain original wall value unchanged; nullable resolved instant, status `unresolved`/`verified`/`ambiguous`/`nonexistent`, source/evidence reference, proposed zone/offset, resolver/reviewer, resolution instant, migration batch and row version. Constraint: unresolved/ambiguous/nonexistent has no authoritative instant. |
| Reconciliation ledger | Append-only old/proposed mapping metadata, evidence/approver references and subsequent corrections; no destructive overwrite of original value. Controlled access because event times/IDs are sensitive. |

New endpoint contract must distinguish original wall value, resolution state and
authoritative instant. For uncertain rows return explicit uncertainty; do **not** emit
`Z`, infer an offset or use JavaScript `Date` serialization as evidence. UI/export/history
show “timezone unresolved,” and urgent clinical scheduling reconciliation is manual.
Use separate resolved-instant ordering and unresolved views; do not mix unknown wall
times into a falsely precise global instant order. Counts must still include unresolved
records visibly. Scope every view under Q1. Version cursors when the ordering changes;
return a clear reload-required 400 for legacy cursors, never silently skip records.

New timestamp input validation must precede Track D fingerprinting. Preserve committed
retry-key digests/resources: define a canonicalization version and compatibility path
for existing keys; don't recompute old fingerprints or turn a time-contract change into
a duplicate write. Keep old-format replay semantics until explicitly retired safely.
Session/audit legacy times need their own evidence plan; prefer approved reauthentication
for ambiguous active sessions, not silently extending expiry with guessed conversion.

## Read-only preflight and staged conversion

1. Inventory every `timestamp without time zone` field, including auth/audit/analytics,
   not only appointments. Use [Track E](../verification/track-e-database.md) read-only
   counts; an exit requiring review is not clean. Preserve microsecond precision/nulls.
2. Data owner supplies provenance by deployment/period/cohort, including historic DB,
   app and ingress settings and any known writer/import changes. Current host zone,
   an MRN/email/creator or apparent ISO suffix is not evidence. Restricted row manifest
   for approved work only; console/CI output aggregate counts, never PHI values.
3. Detect unknown cohorts, DST folds/gaps, invalid zone/offset combinations, mapping
   collisions, changed rows and range anomalies; unresolved entries block automatic
   conversion. A default UTC cast is prohibited. Calendar dates are excluded.
4. After approval, add nullable columns/ledger and compatible new-write paths, capture
   original hashes/counts, then conditional backfill by approved manifest under bounded
   locks. Verify exact wall round-trip plus intended instant and unchanged date fields.
   Process unresolved rows only by separate reviewed reconciliation, never coercion.
5. Dual-read uses resolved instant only when verified; otherwise explicit legacy state.
   Dual-write preserves the approved wall representation and provenance. Switch queries,
   filters, dashboards, print/export, cursor order and clients together after rehearsal.
   Never run a blind `ALTER ... TYPE TIMESTAMPTZ` over populated legacy data.

## Negative acceptance specs — NOT RUN / conversion absent

| ID | Synthetic scenario | Required result |
| --- | --- | --- |
| H6.1 | New appointment `2026-03-08 02:30` in America/New_York (gap), `2026-11-01 01:30` (fold) | Gap rejected; fold needs explicit valid offset/choice; never silently shifted. |
| H6.2 | Same original legacy fold/gap with no trustworthy zone; deployment previously changed zone | Original preserved, authoritative instant null, uncertainty visible; no default UTC. |
| H6.3 | Run DB/app/browser UTC and non-UTC combinations; microseconds, leap-day DATE and offsets | Calendar dates and verified instants stable, intended appointment wall time unchanged. |
| H6.4 | Partial backfill failure, concurrent edit, duplicate manifest resolution, timezone database rule change | Conditional update abort/review; original and ledger retained, no automatic reschedule or fabricated provenance. |
| H6.5 | Old cursor and pre-conversion idempotency key retried after migration | Explicit cursor reload; one clinical mutation and valid original-key replay, no rewritten ledger digest. |
| H6.6 | Old client sends ambiguous new datetime; uncertain event in today/upcoming/export | Input denied under new contract; existing uncertainty remains visible, not omitted or mislabeled UTC. |

## Rollout and rollback

Approve cohorts/zone semantics and reconciliation owner before implementation. Rehearse
on synthetic fixtures, then an authorized isolated clone. Track E migration principal,
readiness versions/object contracts and explicit grants must move together. Require
clinician confirmation of scheduled wall-time comparison before cutover.

Retain original columns/mapping ledger. Roll back readers/writers only to a version
that preserves new instant and unresolved state; otherwise drain to maintenance.
Never reverse-convert verified instants into guessed old wall times, drop provenance,
or restore a backup over intervening appointments without approved reconciliation.

## Unblocking evidence

Named data/clinical owners approve cohort provenance, display/scheduling zones, DST
policy, unresolved-record workflow and manifest. All automatically converted rows
have verified mappings; others remain explicitly unresolved under an approved workflow.
H6 passes across timezone matrix and compatibility/retry paths, with independent review.
Track E's read-only preflight does not itself approve P10 conversion.
