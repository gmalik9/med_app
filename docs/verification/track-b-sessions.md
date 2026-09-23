# Track B — bearer session lifecycle verification

Date: 2026-09-20. Scope: B1–B3 and the authentication/capabilities portion of B5.

**Implementation/self-tests: PASS. Mandatory distinct evaluator: BLOCKED, not performed.**
The available agent toolset does not expose `runSubagent`; no independent evaluator
was launched and no independent approval is claimed. See the evaluator handoff below.

**Latest status (final cross-track note-date query correction): implementer checks
PASS; ready for final combined validation; independent re-evaluation PENDING.** The dated correction sections below
supersede the original evaluator status. No independent acceptance is claimed.

## Scope and baseline

The working tree already contained substantial user/other-agent changes. Those
were retained. Track B changed only:

- [frontend/src/utils/apiClient.ts](../../frontend/src/utils/apiClient.ts)
- [frontend/src/context/AuthContext.tsx](../../frontend/src/context/AuthContext.tsx)
- [frontend/src/pages/LoginPage.tsx](../../frontend/src/pages/LoginPage.tsx)
- [backend/src/routes/auth.ts](../../backend/src/routes/auth.ts)
- [backend/src/utils/auth.ts](../../backend/src/utils/auth.ts)
- [backend/src/middleware/validation.ts](../../backend/src/middleware/validation.ts)
- [frontend/tests/session-client.test.ts](../../frontend/tests/session-client.test.ts)
- [frontend/tests/session-provider.test.tsx](../../frontend/tests/session-provider.test.tsx)
- [backend/tests/session-lifecycle.test.ts](../../backend/tests/session-lifecycle.test.ts)
- This verification document.

No changes to package manifests/lockfiles, configuration, app/startup, database
schema/migrations, existing tests, or clinical components. Session creation and
access-authentication middleware did not need changes. No commits, pushes,
deployments, secret-file reads, real patient data, or external AI calls.

## Reproductions and results

Before implementation, the initial deferred-client suite had **6 failures / 1
pass**, and the initial PostgreSQL suite had **1 failure**:

| Deterministic sequence | Baseline evidence | Result |
| --- | --- | --- |
| Send old-account clinical write; switch account; complete old request with 401 | Started refresh using new account credentials | Old completion rejected; no refresh/replay |
| Start refresh; login to another account; complete old refresh | Cleared new credentials | New identity/token pair preserved |
| Start refresh; login to another account; fail old refresh with network error | Cleared new credentials | New identity/token pair preserved |
| Refresh fails during network outage | Cleared credentials | Credentials retained; caller receives failure |
| Capture logout; login before interceptor dispatch | Logout bearer overwritten with new bearer | Captured access and refresh remain unchanged |
| Old successful profile arrives after account switch | Delivered old profile | Stale response rejected |
| Expired access + valid refresh logout | 401; session remained active | 204; all subsequent access/refresh attempts denied |

Refresh finishing after local logout already passed the initial narrow test; this
is retained as regression coverage, not represented as a new baseline failure.

Expanded coverage includes delayed bootstrap success/failure, overlapping login,
late login/registration after logout, bootstrap retry without trusting cached user
data, visible offline revocation failure, old expiration events, coalesced refresh,
late old-access 401 after refresh, old refresh-finalizer isolation, authoritative
401 versus network/429/503 failures, signup visibility and the configured inactivity
limit. Time-dependent UI tests use a fake clock, not sleeps.

Self-review additionally reproduced **1 failing test**: a delayed 401 from an
already-retried request cleared credentials rotated again in the same generation.
Fixed by refusing to expire a token pair on rejection of a different access token;
the bounded request still fails rather than retrying indefinitely. Self-review also
added a late-capabilities test and retained elapsed activity time so loading settings
does not grant a fresh inactivity window. These are self-review findings, not an
independent evaluator's findings.

Final observed results:

- Client: **17/17 passed**.
- Provider/login UI: **14/14 passed**.
- Synthetic PostgreSQL lifecycle: **12/12 passed**, none skipped.
- Frontend and backend TypeScript `--noEmit`: **passed**, run serially.
- Changed files: no editor diagnostics reported at verification.
- Broad suites, builds, E2E and deployment checks were intentionally not run by
  Track B, per the focused-test/no-build instruction.

## API and client contract

Existing clinical API client method names, argument lists and Axios return shapes
are unchanged. Refresh still accepts a string and returns an Axios response; it now
owns the atomic generation-checked token-pair commit and coalesces requests in the
same generation. Supplying a refresh token from a different/currently absent local
session is rejected rather than adopted. `setAccessToken` remains available and
starts a new generation when its value changes. Login/register start generations
before dispatch; logout and credential clearing invalidate pending work immediately.

Additive client methods: `getSessionGeneration()`, `beginSession()`,
`setSessionTokens(accessToken, refreshToken, generation)`, `getCapabilities()`.
The pair setter returns false for a stale generation. The provider exposes additive
`capabilities: AuthCapabilities | null`; null means unknown, not permission to sign up.

### Public capabilities (exact payload)

`GET /api/auth/capabilities`, public, `Cache-Control: no-store`:

```ts
{
  allowRegistration: boolean;
  aiEnabled: boolean;
  sessionTimeoutMinutes: number; // integer, 1–480
}
```

`apiClient.getCapabilities()` returns `Promise<AxiosResponse<AuthCapabilities>>`;
consume those three fields on `response.data`. No wrapper, credentials, provider
keys, URLs, or unrelated config are included. `aiEnabled` is the configured feature
gate, not a guarantee of provider/key readiness or approval. AI component integration
is owned separately. Server registration/AI enforcement is not weakened.

### Logout

`POST /api/auth/logout` accepts an optional JSON body containing only
`refreshToken?: string` (1–4096 characters), plus the existing optional bearer header.
At least one valid credential is necessary. Success remains 204.

- Access-only clients remain supported with a currently valid access JWT.
- A signed, purpose/issuer/audience-verified, unexpired refresh JWT may revoke only
  its signed user/session, including after refresh-token rotation. It cannot issue
  tokens or grant access. Requiring the current hash for revocation would lose logout
  when rotation won first; refresh issuance **still requires the current stored hash**.
- When both credentials exist, the access signature/purpose/issuer/audience must
  verify and both actor **and session** must match. Only access expiry is ignored,
  and only for this binding check with a valid refresh JWT.
- Arbitrary session IDs, mixed actors/sessions, forged/wrong-purpose credentials,
  expired refresh, disabled users and DB-expired sessions are rejected. Unknown
  body fields are rejected. No session-ID selector or all-sessions revocation exists.
- The existing row-locking SQL UPDATE is sufficient; no advisory lock was added.
  Deterministic SQL-completion barriers cover refresh-commit → logout → delayed
  refresh-response and logout-commit → refresh denial → delayed logout-response.
  Fresh and old tokens cannot authorize new requests after logout completion.
- Requests already in flight/authorized before revocation are not transactionally
  cancelled or undone. This is not a clinical-write cancellation protocol.

## Safe test setup and repeatable commands

Runtime: Node 22 through an ephemeral npm runner, because the terminal's default
runtime was Node 20. No dependency manifest changes or builds were needed.

Integration requires `TEST_DATABASE_URL` to be set to the supplied synthetic audit
connection at loopback port 55439, database `medapp_audit`. The credential is omitted
from this document. The suite rejects a missing URL, non-loopback host, wrong DB,
wrong protocol or connection-override query parameters; it never silently skips.
It disables external AI and mocks dotenv loading to prevent environment-file reads.
Each run creates a cryptographically random `session_b_…` schema, sets the search
path to that schema alone, initializes it, and drops only that generated schema on
cleanup. It never reads/changes existing public-schema records. Auth routes are
mounted with real validation/middleware against real PostgreSQL; unrelated AI/OCR
and request-audit handlers are not mounted in this focused harness.

From the workspace root, run serially:

```sh
npx --yes --package=node@22 node node_modules/vitest/vitest.mjs run --root frontend tests/session-client.test.ts tests/session-provider.test.ts
TEST_DATABASE_URL="$TEST_DATABASE_URL" npx --yes --package=node@22 node node_modules/vitest/vitest.mjs run --root backend tests/session-lifecycle.test.ts
npx --yes --package=node@22 node node_modules/typescript/bin/tsc --noEmit -p frontend/tsconfig.json
npx --yes --package=node@22 node node_modules/typescript/bin/tsc --noEmit -p backend/tsconfig.json
```

Two shared-terminal responses initially contained other-agent output instead of
Track B results. They were not counted as verification. The suites and no-emit
checks were rerun with absolute paths and attributable output as summarized above.

## Independent evaluator handoff — mandatory gate still open

Required tool: `runSubagent`, generic evaluator, distinct from the implementer.
Unavailable in this toolset; **verdict: NOT EVALUATED / BLOCKED**, not PASS.

Evaluator specification:

1. Read the scoped source/tests and B1–B3/B5 in the hardening plan; source is read-only.
   Do not read secret files, change source/config/dependencies, run builds, enable AI,
   commit/push, or touch existing public/production data.
2. Execute only the focused commands above on the guarded synthetic audit DB.
3. Inspect request-time generation capture, response/retry guards, atomic token pair
   updates, delayed bootstrap/login/logout, transient errors and capability-derived
   inactivity/registration. Confirm all existing clinical signatures remain intact.
4. Challenge exact-session refresh-assisted logout, mixed-actor/same-actor different
   session rejection, signature/purpose/expiry/active-DB checks, single-use refresh
   hashing, and both deterministic refresh/logout interleavings. No invented need
   for advisory locking; no sleep-based success assumptions.
5. Return concrete reproducible findings, commands/results, uncovered risks and a
   truthful PASS/FAIL/BLOCKED verdict. The implementer must fix real findings and
   rerun the focused checks before independent acceptance is claimed.

## Remaining limits / rollback

Bearer credentials are still JavaScript-readable tab storage; cookies/BFF/MFA and
tenant policy are outside approval/scope. Duplicated tabs sharing copied refresh
credentials have one rotation winner; the loser must sign in again, without
silently reusing another identity. There is no new cross-tab token-sharing design.
Offline logout clears this tab immediately but cannot promise server revocation;
the UI explicitly warns. Unknown capabilities hide registration and show retry
feedback; server idle enforcement remains authoritative while settings are unavailable.

Rollback must coordinate the additive capabilities consumer/API together. Do not
reset the dirty working tree or revert other agents' work; revert only this track's
scoped edits if required. No data migration rollback is necessary. Independent
evaluation and combined orchestrator-level verification remain outstanding.

## Evaluator B correction — validation route matching (2026-09-20)

**This update supersedes the original evaluator-status paragraph above.** The
orchestrator supplied a dedicated EVALUATOR B verdict of **FAIL**. The correction
below has passing implementer self-tests; **independent evaluator rerun is PENDING**.
No nested evaluator was launched and no independent PASS is claimed. The main
orchestrator owns the distinct evaluator rerun and acceptance decision.

### Finding and reproduction

The global validator used exact-case, exact-terminal-slash regular expressions,
while the application and its Express routers accept case-insensitive static
segments and an optional terminal slash. Evaluator B reported:

- Short registration password: canonical `POST /api/auth/register` returned 400,
  but `/api/auth/register/` and `/api/auth/REGISTER` returned 201.
- Registration passwords exceeding bcrypt's 72-byte limit also returned 201 on
  accepted noncanonical paths, allowing bcrypt truncation.
- Logout with an unknown `sessionId` field and valid session proof: canonical
  path returned 400, but `/api/auth/logout/` returned 204.

The same mismatch affected clinical body schemas and path-dependent ID/search
checks, not just authentication. Before the production fix, the initial new
184-case suite observed **132 failed / 52 passed**. That initial harness shared a
logout credential, so its failure count includes cascades after an incorrectly
accepted logout; it is not a count of 132 independent vulnerabilities. Each
logout regression now uses its own session.

### Correction and shared semantics

Only these three files changed in this correction:

- [backend/src/middleware/validation.ts](../../backend/src/middleware/validation.ts)
- [backend/tests/validation-routing.test.ts](../../backend/tests/validation-routing.test.ts)
- [docs/verification/track-b-sessions.md](track-b-sessions.md)

All 16 existing body schemas are now attached to string routes on an Express
validation router with explicit `caseSensitive: false, strict: false`. This uses
the same matching engine/default semantics as the application's `/api` mount and
business routers, rather than reimplementing Express routing with regexes.
Express parameter callbacks validate numeric internal IDs and decoded business
patient IDs; a matching search route requires the case-sensitive `patientId`
query key. Global date, patient-ID and pagination query checks remain in place.

- Accepted static case variants and a terminal slash receive the same schema,
  including `POST /API/auth/register` and uppercase/mixed-case clinical routes.
- No URL/path, identifier, password, token, query key or business data is
  lowercased. Existing schema transforms are unchanged. Distinct `Syn-MiXeD-01`
  and `syn-mixed-01` records remain distinct on reads and writes.
- Express decodes path parameters once. Encoded numeric digits receive both ID
  and body validation; encoded separators, NUL, double-encoded separators and
  malformed URI sequences are rejected. Malformed URI decoding propagates 400,
  not an uncaught validator `decodeURIComponent` error.
- Unsupported static paths (encoded literal route names, extensions, repeated
  terminal slashes) remain unmatched rather than being normalized into routes.
- Future route/schema additions must maintain this shared contract. Changing
  application/router case or strict-routing settings requires updating this
  validator and the regression matrix together.

No auth-route special case was needed. No other agent files, migrations,
configuration, dependencies, or existing API tests were edited. In particular,
the migration-v2 count assertion in
[backend/tests/api.test.ts](../../backend/tests/api.test.ts) remains owned by D;
that suite was not run or changed for this correction.

### Focused test evidence

Runtime **Node v22.23.2**, Vitest **4.1.11**, supplied synthetic PostgreSQL **17**
only. The new suite requires the exact supplied loopback audit connection,
rejects URL overrides, verifies the PostgreSQL major version and schema-only
search path, and creates/drops a fresh random `validation_b_…` schema. The existing
lifecycle suite uses its own fresh `session_b_…` schema. Dotenv is mocked; OCR is
stubbed to throw if invoked; external AI is disabled. No secret files,
production connection, existing public-schema records, builds or deployments
were used.

Final full focused runs, both exit 0 with **no skips**:

| Check | Observed result |
| --- | --- |
| Routing matrix and synthetic integration | **240/240 passed** |
| Existing exact-session lifecycle | **12/12 passed** |
| Combined final run | **252/252 passed**, 2 files, 13.06 s |
| Repeat against fresh random schemas | **252/252 passed**, 2 files, 13.01 s |
| Backend TypeScript `--noEmit` | Exit 0 |
| ESLint, two changed TypeScript files only | Exit 0 |
| Editor diagnostics, two changed TypeScript files | None |

The matrix covers all 16 body schemas and seven clinical read paths under seven
path variants (canonical lowercase, lowercase + slash, uppercase endpoint,
uppercase whole route, uppercase + slash, uppercase `/API` only, mixed case +
slash). It includes ASCII/multibyte >72-byte credentials, exact-72-byte login,
password case sensitivity, strict logout unknown fields with valid proof,
clinical status casing, impossible note dates, malformed/encoded internal and
business IDs, malformed/duplicate queries, successful variant refresh/logout,
and case-preserving persisted clinical records.

Verification caveats retained rather than hidden: four terminal replies contained
another track's output and were excluded. An intermediate expanded-matrix run
had 3 failures (two request timeouts and one unexpected HTTP 400); the three
cases passed in isolation. The harness now reuses explicitly closed loopback
listeners instead of opening/closing a port per request. The two final complete
runs above passed after that change; no production change was made to mask these
test-harness failures.

Repeat from the workspace root with `TEST_DATABASE_URL` set only to the supplied
synthetic audit URL (the credential is not repeated here):

```sh
TEST_DATABASE_URL="$TEST_DATABASE_URL" npx --yes --package=node@22 node node_modules/vitest/vitest.mjs run --root backend tests/validation-routing.test.ts tests/session-lifecycle.test.ts --reporter=dot --silent
npx --yes --package=node@22 node node_modules/typescript/bin/tsc --noEmit -p backend/tsconfig.json
npx --yes --package=node@22 node node_modules/eslint/bin/eslint.js backend/src/middleware/validation.ts backend/tests/validation-routing.test.ts
```

### Additional self-review handoff outside ownership

Source review found pre-existing case-sensitive `req.path.startsWith('/api/')`
checks in [backend/src/app.ts](../../backend/src/app.ts) (request-completion
logging) and [backend/src/middleware/auditLog.ts](../../backend/src/middleware/auditLog.ts)
(request-audit listener). Consequently uppercase `/API` skips those listeners
even though Express accepts it. Validation now covers `/API` correctly; this
separate observability/request-audit issue was not changed because those files
belong to other tracks. Successful clinical transactional audits use a separate
write service. The orchestrator should assign the listener-gating follow-up;
this correction does not claim to resolve it or to pass independent evaluation.

## IndependentB2 final identifier correction (2026-09-20)

**Ready for independent re-evaluation; status PENDING, not independently PASS.**
The orchestrator supplied independentB2's result: authentication body case/slash
fixes passed 709 probes and 283 suite cases, but identifier validation still
failed. Those are supplied evaluator results, not runs claimed by this correction.
Nested evaluation tooling remains unavailable; the orchestrator owns the rerun.

### Finding, ownership and fix

The shared patient-ID schema trimmed before validating. Path/query callbacks
checked only `safeParse(...).success`, then handlers consumed the original,
untrimmed value. Consequently decoded leading tabs, terminal LF/CRLF and 60
spaces followed by a valid ID could pass validation despite violating the
allowlist or original length bound.

Only these files were edited for this final correction:

- [backend/src/middleware/validation.ts](../../backend/src/middleware/validation.ts)
- [backend/tests/validation-routing.test.ts](../../backend/tests/validation-routing.test.ts)
- [docs/verification/track-b-sessions.md](track-b-sessions.md)

The URL contract is now explicit:

- Path and query patient IDs use a **nontransforming string schema**, length
  1–50 in JavaScript UTF-16 code units (the existing length convention), allowing
  only Unicode letters/numbers plus `_`, `.` and `-`. Every decoded character is
  checked. No trimming, control removal, case folding, Unicode normalization or
  extra percent decoding occurs. Validation and handlers see the same string.
- Both clinical patient paths and the direct patient lookup receive that check.
  Patient search uses the same schema for its case-sensitive `patientId` query
  key; the existing duplicate/object/missing-query checks remain intact.
- Numeric internal IDs on patient updates/status, appointment status and numeric
  direct patient lookup are nontransforming strings of 1–10 ASCII digits, bounded
  above by 2147483647. Leading zeroes within this raw length limit remain intact;
  previously unbounded leading-zero strings are now rejected. Zero retains its
  existing numeric semantics. Numeric business IDs up to 50 code units remain
  valid on clinical paths and search, independent of the internal integer bound.
- **Intentional body compatibility:** patient, appointment and visit create
  bodies retain their existing trim-before-validation behavior. This is safe
  from the reported mismatch because `req.body` is replaced with parsed output;
  downstream handlers receive the normalized identifier, never the original.
  Tests explicitly preserve this contract, including persisted patient creation.
- Express still performs its normal single path/query decode. Encoded valid
  characters are accepted without changing case; double-encoded identifiers
  retain a forbidden `%` after Express decoding and are rejected. No manual
  `decodeURIComponent` was introduced. Static case/slash matching is unchanged.

No application/audit files were edited or evaluated for the separately assigned
audit-case issue. No other source, tests, manifests or configuration were edited;
no existing assertions were weakened.

### Regression and verification evidence

Before changing production validation, the new database-free identifier matrix
observed **112 failed / 21 passed**, with the 240 original routing cases excluded
by the targeted filter. Failures included `%09Syn-MiXeD-01` reaching handlers with
200 and unbounded zero-padded internal IDs. A narrower initial title filter
matched no cases and is not counted as execution evidence.

The final additions cover all seven existing Express case/slash variants:

- Every ASCII control (C0 and DEL) at both identifier boundaries, spaces, CRLF,
  selected Unicode whitespace/invisible characters, embedded whitespace,
  separators, non-allowlisted symbols, empty queries, and overlong ASCII/Unicode
  IDs. Explicit 60-space padding catches the original pre-trim length bypass.
- All seven clinical read paths, both clinical path-ID write schemas, direct
  patient lookup, search and a clinical query endpoint, plus all three internal-ID
  write paths. Query `+` whitespace, malformed encodings, double-encoded letters,
  digits, controls and separators are rejected.
- Unchanged mixed/lowercase distinctions, legitimate Unicode letters/numbers,
  exactly 50-character IDs, numeric business IDs outside int32, encoded ASCII
  internal IDs and permitted leading zeroes. Probe handlers assert the exact
  identifier and original URL rather than just accepting a 200 response.
- Real PostgreSQL patient lookup/search and note writes, with no-note-insert and
  unchanged patient/appointment row assertions after rejected identifiers.

Completed run: **Node v22.23.2**, **Vitest 4.1.11**, start **16:01:13 local**,
duration **22.34 s**, exit **0**, with **no skipped tests**:

| Check | Actual result |
| --- | --- |
| Routing matrix + guarded PostgreSQL integration | **395/395 passed** |
| Existing exact-session lifecycle | **12/12 passed** |
| Combined existing 252 + new 155 regressions | **407/407 passed**, 2 files |
| Backend TypeScript `--noEmit` | Exit 0 |
| ESLint, two owned TypeScript files only | Exit 0 |
| Editor diagnostics, two owned TypeScript files | None |

Several earlier shared-terminal responses were mismatched or interrupted and are
excluded from these results. The completed run also produced a dedicated JSON
report outside the repository. No incomplete dots-only output was counted as a
pass. Optional frontend checks and broad backend/build/release suites were not
run for this narrowly scoped correction.

The routing integration retains its exact URL/credential/port guard for the
supplied loopback `127.0.0.1:55439` synthetic `medapp_audit` database, PG17 check,
random `validation_b_…` schema, schema-only search path and own-schema cleanup.
Lifecycle tests use their separate random `session_b_…` schema. Existing user
data/public-schema tables, secret files, external AI/OCR and deployments were
not accessed. The focused repeat commands in the preceding section remain valid.

Independent evaluator should rerun the full focused pair and challenge the
reported `%0a`, `%09`, `%0d%0a` and 60-space examples across read/write/query
variants, including encoded numeric IDs and no-double-decode cases. **Independent
re-evaluation is still PENDING.**

## Final cross-track correction — note-date query boundary (2026-09-20)

**Implementer PASS; ready for final full combined validation. Independent acceptance
remains the main orchestrator's responsibility.** No nested evaluator was available
or launched. This section supersedes earlier implementer counts, not independent
evaluation or release gates.

### Reproduction and scoped correction

Evaluator F reported that a single-note GET rejected `?date=2035-02-30` but
accepted `?date[x]=2035-02-30` and `?date.value=2035-02-30`, returning today's
note. Express's simple query parser preserves bracket/dot keys literally, so the
old global check saw `req.query.date === undefined`. The extended parser also
leaves dot keys literal and can discard some prototype-shaped input.

Only these three files changed for this correction:

- [backend/src/middleware/validation.ts](../../backend/src/middleware/validation.ts)
- [backend/tests/validation-routing.test.ts](../../backend/tests/validation-routing.test.ts)
- [docs/verification/track-b-sessions.md](track-b-sessions.md)

The existing case-insensitive, optional-terminal-slash Express validation router
now attaches a strict `{ date?: calendarDate }` query schema to the **single-note
GET only**. It accepts an empty query as documented process-local today, or exactly
one scalar, valid calendar `date`. Empty, repeated, nested, bracket/dot, incorrectly
cased, alternate-selector and unknown keys fail with the existing generic HTTP
400 response. Original wire query keys are checked with `URLSearchParams`, including
duplicate detection and agreement with the validated parsed date, so discarded
parser input cannot become legitimate omission. There is no URL rewrite, business
ID case folding, additional decoding of parsed values or mutation of `req.query`.

The exact Express route does **not** apply that schema to note history, other
history routes, the directory or visits. Existing `limit,cursor`, visit
`filter=all|upcoming`, and directory `limit,offset,cursor` semantics (including
cursor/offset exclusion) remain owned by their existing handlers. Authentication,
sessions, config, manifests, note/date defaults, API authority and all unrelated
source are unchanged. The accepted cosmetic auth blank was not touched.

### Real HTTP evidence

The new **56 tests** run through loopback HTTP, real validation/auth/clinical
routers and fresh synthetic PostgreSQL data, using both Express simple and extended
parsers under all seven existing case/slash variants. Two case-distinct patient IDs
each have separate process-local-today, requested-day (2035-02-28) and leap-day
(2036-02-29) notes. Invalid responses must be exactly the generic 400 payload,
without a note object or any fixture note content. Valid requests verify the exact
patient ID and intended note; genuinely omitted dates return only today's note;
a valid date without a note returns `{ exists: false, note: null }`.

Coverage includes invalid calendars, empty/bare/null/boolean/numeric/JSON-like date
values, duplicate same/different dates, nested objects/arrays, encoded key shapes,
prototype-shaped nested keys, whitespace/control suffixes, case-sensitive query
keys, valid percent-encoded dates/IDs, and unsupported single-note selectors.
Compatibility cases traverse actual note-history, filtered-visit and directory
cursors; exercise offset, other history routes and accepted visit filters; and
retain malformed-pagination rejection.

Clean pre-fix reproduction at **21:46:42.995Z**: **14 failed / 42 passed**, with
395 unrelated existing tests excluded by the focused title filter. Failures were
the seven route variants under each parser returning 200 for the malformed date
shape. An earlier harness run additionally expected unsupported `filter=past` to
succeed; that fixture was corrected to the existing `all|upcoming` contract before
the clean reproduction. Production visit filtering was not changed.

Final supported runtime: **Node v22.23.2 / Vitest 4.1.11 / PostgreSQL 17.11**,
supplied loopback synthetic audit database only, no secret/environment-file reads,
real PHI, external AI/OCR, build, deployment or full-suite execution.

| Check | Observed result |
| --- | --- |
| Complete router suite | **451/451 passed** |
| Existing backend session lifecycle | **12/12 passed** |
| Combined backend pair, 21:47:11.520Z | **463/463 passed**, no skips, 25.13 s |
| Fresh-schema repeat, 21:49:22.934Z | **463/463 passed**, no skips, 25.19 s |
| Frontend session client + provider, 21:47:56.662Z | **17 + 14 = 31/31 passed**, no skips |
| Backend TypeScript `--noEmit` | Exit 0 |
| Explicit regression-test TypeScript `--noEmit` | Exit 0 with existing Express augmentation included |
| ESLint, two owned TypeScript files | Exit 0 |
| Editor diagnostics, two owned TypeScript files | None |

JSON reports are retained outside the repository. The final repeat compared schema
metadata before/after and confirmed **no new retained validation/session schemas**
at **21:49:48.154Z**. Six previously existing session schemas were left untouched;
an initial blanket assertion that the shared audit DB had none was incorrect and
was replaced by this per-run check. No existing schema records were read or changed.
The first standalone test type-check omitted the application's Express `requestId`
augmentation; including existing
[backend/src/middleware/auditLog.ts](../../backend/src/middleware/auditLog.ts) in
that read-only check resolved the four resulting type errors without any source
change. The normal backend project type-check had already passed.

The focused backend pair and frontend session commands documented above remain
valid. Main may now run the final combined validation and assign the distinct
evaluator; this implementer does not claim either gate has completed.
