# ADR 0004 — durable disclosure evidence and audit outages (Q4 / P08 activation)

## Current pilot status and scope addendum — 2026-09-20 local

**APPROVED FOR SYNTHETIC PILOT DESIGN; IMPLEMENTATION PENDING;
INFRASTRUCTURE/CONTRACTUAL VERIFICATION PENDING.** Q4's outage policy design is
unblocked; see the [approved pilot scope](APPROVED_PILOT_SCOPE.md).

- Select fail-closed: no required patient-record read/write/disclosure when its
   required **durable** audit operation fails. Prepare/authorize read responses before
   durable resource-scoped evidence and only then release bytes; mutation/version/audit
   commit atomically. Best-effort/post-response logging is not the required boundary.
- **No emergency or break-glass bypass in the pilot.** The alternate emergency journal,
   roles and successful emergency-drill option in the initial proposal are not selected;
   future acceptance must demonstrate denial, not implement an emergency exception.
- An authorized disclosure/response-prepared event is not proof of human read/receipt.
   Minimize protected metadata and keep full sensitive note versions separate from
   security logs. Auth/admin/enrollment/recovery events must also be durably integrated.
- No automatic deletion of audit evidence/outbox or related retained records. Reviewed
   manual cleanup requires separate explicit authorization, not a routine purge.
- Durable route coverage, crash/failure behavior, append-only grants, outbox/sink
   details, capacity thresholds and escalation remain implementation/verification work.
   No external sink/provider/immutability guarantee is approved or verified here.

Historical best-effort evidence remains historical; this addendum does not activate
fail-closed code or claim new passing tests. The historical-key security gate remains FAIL.

## Historical initial proposal — retained unchanged

The remainder preserves the original pending alternatives and unblocking requests.
The current pilot selection above supersedes the unselected emergency alternative.

<!-- BEGIN HISTORICAL ADR SNAPSHOT -->

**Status: PENDING — NOT IMPLEMENTED.** No outbox, fail-closed release boundary or emergency policy activated.
Date: 2026-09-20. Owners to designate: security, clinical safety, operations, privacy.
Gate register: [Track H](../verification/track-h-decisions.md).

## Evidence and minimal decision

[Track G](../verification/track-g-audit.md) added safe metadata, request-start/finish/abort
events and counters. [The writer](../../backend/src/middleware/auditLog.ts) is explicitly
non-awaited/best-effort; a start event does **not** mean durable persistence. Its fixed
endpoint label cannot identify which patients were disclosed. [Clinical writes](../../backend/src/services/auditedWrite.ts)
already atomically commit successful mutation/audit. OCR additionally awaits its own
scan event, but this is not a general release/outbox contract. Auth/profile/template
changes lack a universal transactional security-event requirement. No external immutable
sink is evidenced. Ordinary logging tests do not prove crash durability.

**Question Q4:** Choose (A) no PHI disclosure without durable local evidence, or
(B) A plus a specifically authorized emergency workflow with durable alternate evidence.
What outage duration/backlog size is acceptable, who responds, and when must intake stop?

Recommend A normally. External sink downtime may allow service only while the local
durable outbox and approved capacity/age limits remain healthy. Database/evidence-write
failure denies release with generic 503. B requires named emergency roles, patient scope,
reason, expiry, step-up where feasible, immediate alert and retrospective review; an
independently durable encrypted journal must be tested if the primary store is down.
If no durable emergency channel is approved/available, deny. Neither a boolean flag,
console log, best-effort fallback nor retrospective invented event is break-glass.

## Schema proposal — design only

| Proposed object | Contract |
| --- | --- |
| `security_audit_events` | Immutable UUID event ID, schema/policy version, server correlation ID, authenticated actor/session reference, organization, capability/scope/authorization version, canonical operation, phase/outcome, server `TIMESTAMPTZ`, resource references. No tokens, note text, OCR image/text, query strings or arbitrary errors. IDs/IP are restricted sensitive metadata, not public telemetry. |
| `audit_event_resources` | FK event ID + ordinal, resource kind, internal patient/resource ID and revision where applicable. Exact authorized page membership, bounded to actual response limits; explicit zero-result/aggregate query identity. No raw MRN search term. Unknown searched identifiers need a separately approved protected representation if required. |
| `audit_outbox_events` | Unique event ID FK, destination/config version, immutable canonical envelope or event reference + digest, created instant; inserted **in the same transaction** as required event/business change. No cascade deletion. |
| `audit_delivery_attempts` / delivery state | Append-only attempt metadata; mutable lease/next-attempt/ack state separate from immutable payload. Unique `(destination,event_id)` sink identity; bounded sanitized failure code, not provider errors. Worker can claim/update delivery state, never clinical/audit content. |

Use a bounded result manifest for larger future exports: persist all protected chunk
references before releasing each chunk; a hash alone without reconstructable protected
membership does not establish which records were disclosed. A client cursor or requested
patient ID is not trusted authorization evidence. Maintain Q5 clinical history separately;
security audit must not become a note-version store or public chart endpoint.

## Release and delivery contract

1. Authenticate and authorize under Q1/Q2/Q3. Prepare the **exact** response/projection
   and trusted resource manifest in memory from a consistent authorized DB view.
   No `res.write`, flush, streaming header/body or vendor PHI transmission yet.
2. Revalidate/serialize the authorization boundary as defined in Q1. In one transaction
   insert `authorized_response_prepared` + resources + outbox; for writes, include the
   business mutation, clinical revision and success/security event. Commit and await
   confirmed success. Reads use a transaction capable of appending audit evidence,
   not Track E's read-only preflight connection. Do not requery a different body after
   auditing. If the commit acknowledgement is uncertain, release **no PHI**; reconcile
   keyed writes safely rather than retrying blindly.
3. Only then release the prepared response or make the separately authorized external
   disclosure (e.g. AI input). Record completion/abort as supplementary evidence.
   `response_prepared` is an authorized disclosure attempt, not human receipt/read.
   A crash after commit but before send can leave an event without delivery; that is
   truthful. Adding an outbox insert inside `finish` is **too late**.
4. Deliver committed events at least once. Worker uses bounded leases/claim batches,
   exponential backoff with jitter, bounded per-attempt timeout and sanitized codes.
   Retry exhaustion is a retained blocked/quarantine state with alert, **not deletion**.
   Receiver deduplicates stable event IDs and acknowledges durable retention; an ack
   lost after sink commit must not create a second logical event on retry.
5. Set approved disk/backlog age/count and evidence-lag thresholds; reject new disclosure
   before exhausting durable capacity. Thresholds are **unset/pending**, not invented
   SLOs. Private fixed-cardinality counters and authenticated operational inspection;
   patient/org/session identifiers must not be metric labels or ordinary console output.

Auth/session issuance, enrollment, recovery, role/assignment changes, revocations and
template publication require S events atomically with state changes before returning
success/credentials. Denied attempts produce safe bounded security evidence when the
store is available; don't turn logging outage into disclosure or leak supplied IDs.
If logout/offboarding cannot durably revoke, return unavailable rather than claiming
completion; clearing a browser cookie is not successful server revocation. The outage
runbook must contain an approved traffic-denial/containment path until revocation is
confirmed, without inventing an audit-bypass or requiring disclosure to revoke access.
Every Q1 matrix D/S row, replay, HEAD existence check, future export/sign/history endpoint
and AI outbound boundary needs explicit handler coverage; generic middleware alone is
not sufficient.

## Least privilege and retention

Extend [Track E's separate-role work](../verification/track-e-database.md), not just
application role checks. Proposed runtime: INSERT required event/outbox rows, no
UPDATE/DELETE/TRUNCATE/DDL/grant option. Delivery principal: narrow event read and
delivery-state operations only, no patient/note access. Reviewer/exporter: approved
scoped evidence reads; migration owner distinct, not inherited by runtime/worker.
Current Track E SELECT grants are broader and must be reviewed for these new tables.
Test with actual separate logins, including PUBLIC/inherited/TEMP/owner privileges.
Append-only runtime privileges cannot constrain a DBA; Q7 sink immutability and
operator controls remain necessary. Q5 must approve event/outbox/key/backup retention
and legal holds; **no automatic purge or delivery-success deletion** is authorized.

## Negative acceptance specs — NOT RUN / controls absent

| ID | Fault/scenario at real HTTP/DB boundary | Required result |
| --- | --- | --- |
| H4.1 | Block event/outbox INSERT, exhaust pool, timeout or fail commit acknowledgement during each PHI route | No PHI bytes, no AI call, generic 503; failed transaction has no business/revision success; ambiguous commit reconciled, not blindly repeated. |
| H4.2 | Terminate API before durable commit, then immediately after commit and before send | Before: no PHI and no partial success. After: durable event/resources/outbox survives restart even if response never arrives. Use process termination, not only resolved spies. |
| H4.3 | Disconnect client during prepared response; compare event membership to actual prepared page/aggregate | Correct authorization scope and exact bounded manifest; no false “human read” claim, no duplicate phase mistaken for mutation. |
| H4.4 | Sink unavailable, duplicate delivery, ack loss, worker crash during lease; backlog threshold reached | Recover retained events, one logical sink ID, metrics/alert; block releases at approved limit, never drop old events. |
| H4.5 | Runtime/worker/reviewer tries to alter/delete evidence, read clinical text or acquire owner role | Privilege-specific denial under real logins; DBA power separately documented. |
| H4.6 | Unauthorized/expired emergency request, missing reason, durable alternate journal unavailable | Deny without bypass. Approved emergency drill has preserved evidence, expiry, alert and review, not just a success response. |

## Rollout and rollback

Approve Q4/Q5/Q7 first; schema + grants + sink contract, failure drills, synthetic
shadow comparison, then coordinated route integration and cutover. Shadow/best-effort
events cannot satisfy the activated gate. Block old binaries from serving PHI after
cutover. Readiness includes the durable path/capacity required by the approved policy.
External-sink failure does not require synchronous external ack for each response if
the approved local outbox envelope is durable and within limits.

Rollback drains clinical traffic or uses a pre-release-audit-compatible binary;
never revert to finish-only disclosure. Retain all events/outbox/acks, resume delivery
with the same IDs, and reconcile uncertain writes. No down-migration deletion.

## Unblocking evidence

Named owners approve outage/emergency policy, durability/failure boundary, capacity
and lag thresholds, on-call escalation, sink guarantees and retention. Implement H4
with real crash/DB/worker/sink drills and independently review every D/S boundary.
Track G's successful best-effort tests do not unblock P08 activation.
