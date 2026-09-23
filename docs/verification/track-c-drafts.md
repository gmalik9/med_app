# Track C — Batch B4+B5 clinical draft safety

Date: 2026-09-20. Implementation and self-evaluation complete; mandatory independent evaluator gate **NOT COMPLETE** (see below).

## Exact owned changes

- [frontend/src/components/NoteEditor.tsx](../../frontend/src/components/NoteEditor.tsx): dirty state, protected date/template changes, pending-code safety, explicit AI review, explicit conflict comparison/reconciliation, generation-safe asynchronous handling, submission locks, accessible controls/status/error messages.
- [frontend/src/pages/AppPage.tsx](../../frontend/src/pages/AppPage.tsx): navigation/identity/reset/manual-logout guard; stale search/scan response isolation; resolved-patient identity alignment.
- [frontend/src/hooks/useUnsavedChanges.ts](../../frontend/src/hooks/useUnsavedChanges.ts): new in-memory dirty notification, confirmation helper, native `beforeunload` prevention and cleanup.
- [frontend/tests/draft-editor.test.tsx](../../frontend/tests/draft-editor.test.tsx): 45 new synthetic component cases.
- [frontend/tests/draft-navigation.test.tsx](../../frontend/tests/draft-navigation.test.tsx): 20 new synthetic AppPage integration cases with the real Header and NoteEditor; unrelated clinical panels/auth/API mocked.
- This evidence report.

No other files were edited by Track C. Existing changes from other work were retained. No manifests, existing tests, client/auth/login files, backend, or other clinical components were edited.

## Interfaces and behavior

- `NoteEditor` retains `patientId: string | number`, adding optional `onDirtyChange?: (dirty: boolean) => void`. Existing standalone usage remains valid. The parent receives only a boolean, never draft text.
- `AppPage` supplies a stable callback and stores that boolean in a ref. It checks before changing page or patient identity and before calling the existing `logout()`. Canceled navigation leaves date, note text, codes, and patient identity unchanged.
- `useUnsavedChanges(dirty, onDirtyChange?)` returns a confirmation function; `confirmDiscardChanges(dirty)` is the shared boolean-returning confirmation helper. Neither stores anything outside component memory.
- `saveNote(patientId, noteText, date, medicalCodes, expectedRevision)` and `formatNote(text)` signatures are unchanged. New notes use revision 0 only after an explicit absent-note response; existing notes require a positive integer revision. Critical `Clinical note`, `Note date`, `Save Note`, and `Note saved successfully!` selectors/text are retained.
- Dirty protection covers text, added/removed/pending medical codes, unsaved template inputs, staged AI review, formatting/saving work, and unresolved conflicts. Clean/reverted/successfully saved notes do not generate unnecessary warnings. A pending code must be added or cleared before saving.
- Date changes and template replacement require confirmation when protected work exists. Dashboard, profile, patient list, search/title, reset, patient-identity changes, and manual logout pass through the parent guard. Full-document navigation/reload/close uses native `beforeunload` handling.
- Note text and medical-code mutation are locked during note load/failure/save/format. Synchronous locks prevent both duplicate requests and competing save/format actions before a rerender. Stale load/save/format/comparison successes, errors, and finalizers cannot update a different patient/date or unlock a newer request.

## Conflict reconciliation

1. A 409 preserves local text and medical codes and blocks further saves. Invalid successful-save response shapes also keep the draft and require comparison rather than treating an unverifiable response as saved.
2. **Load server version for comparison** fetches into a separate read-only view with server revision and codes. Loading never changes the local draft or its expected revision.
3. The user either confirms **Use server version**, or edits the local text/codes and explicitly chooses **Use reviewed draft with server revision**.
4. Only that explicit choice adopts the loaded revision. Keeping/merging the local version still requires a separate **Save Note** action. Another 409 reopens reconciliation; there is no automatic retry or overwrite.

This is optimistic-concurrency UI only, not an amendment/signing/history/retention policy.

## AI review and error handling

- The original sent for formatting and the returned proposal are rendered side by side on sufficient-width screens, stacking on narrow screens. Both comparison fields are labeled and read-only; the main editor remains the user's draft.
- **Accept AI draft** explicitly stages the proposal into the editor; **Discard AI draft** leaves the editor unchanged. Acceptance never saves. Editing the note after a proposal arrives disables acceptance of that now-stale proposal until it is discarded/reformatted.
- Empty/non-string results, explicit `truncated`/`incomplete` flags, result errors, and non-complete `finish_reason`/`finishReason` values are rejected. Complete markers `stop`/`STOP`, or the existing plain `{ text }` contract, can be reviewed. The UI cannot infer missing clinical facts or unmarked truncation from a plain string; clinician review remains mandatory.
- Rejected requests display the existing client response error or client `message`, with a fallback. Synthetic tests cover disabled-provider 503, the backend's incomplete-provider 502 error, and client timeout errors while retaining original text.
- No backend/configuration was changed or AI provider enabled. All tests mock formatting with synthetic strings; no external AI requests were made.

## Verification evidence

Environment: macOS; existing Node v20.20.0, npm 10.8.2, Vitest 4.1.11. No dependency installation or service startup.

Final run (15:06 local terminal time):

| Verification | Result |
| --- | --- |
| `npm run test --workspace frontend -- tests/draft-editor.test.tsx tests/draft-navigation.test.tsx tests/workflows.test.tsx` | **75/75 PASS**, 3 files, 2.72 seconds. 65 new tests + 10 existing regressions. |
| `npm run typecheck --workspace frontend` | **PASS**, `tsc --noEmit`; no dist build. |
| Installed ESLint over the five owned TS/TSX files | **PASS**, no errors/warnings. |
| `git diff --check` scoped to the two modified existing source files | **PASS**. |
| Editor diagnostics over the five owned TS/TSX files | No errors at the verification checkpoint. |

Coverage includes clean/dirty/reverted/unload behavior and listener cleanup; canceled/confirmed dates/navigation/logout; text/code/template changes; new-note revision zero and malformed existing revisions; template replacement; manual conflict merge/server choice/repeated conflict/comparison failure; AI accept/discard/staleness/truncation/client failures; duplicate save/format/comparison requests; stale patient/date success/error/finalizers; pending-search identity alignment; StrictMode effect replay; and no browser-storage/download writes during the tested draft/review/save workflow.

Browser persistence checks spy on `Storage.setItem`, `indexedDB.open`, and anchor downloads with the API mocked. Source inspection finds no draft persistence mechanism. No localStorage/sessionStorage/IndexedDB backup, export, or download was added. Auth credential storage remains outside this track.

## Mandatory self-evaluation and findings

Self-evaluation was performed after the initial green run (58 new tests, 10 existing tests, frontend noEmit). Source/async-path review and lint found:

1. **Competing save/format race:** separate duplicate-request locks did not initially block starting different operations in the same render. Two added regression cases reproduced this. Fixed with cross-operation ref checks used by the note mutation handlers; both cases now pass.
2. **Patient identity drift:** changing the search input while its earlier request was pending could show one patient's form identifier alongside the resolved patient's note. An added regression reproduced this. Fixed by aligning search/create/scan-edit entry with the resolved patient's identifier; the regression now passes.
3. **Strict-equality lint failures:** two null comparisons failed the repository's `eqeqeq` rule. Fixed and lint rerun successfully.

Additional coverage after review verifies absent-note revision zero, missing-revision fail-closed behavior, incomplete-provider client errors, and duplicate comparison loads. The final rerun above includes all fixes and added cases. No independent findings are claimed as self-review findings or vice versa.

## Separate evaluator result — NOT RUN

The requested next step was a separate generic `runSubagent` evaluator with read-only source access and permission to run tests. **No runSubagent/subagent delegation capability is exposed in this session.** It was therefore not possible to spawn that evaluator after self-review. No evaluator pass, approval, or independent review is claimed. Re-running local checks by the implementer is not a substitute.

The independent-evaluation acceptance gate remains unmet. A supervising agent with delegation available should run the read-only evaluator against these exact owned files and synthetic test commands, report actual findings, then have the implementer fix and rerun any substantive findings.

## Limitations and remaining risks

- Automatic inactivity logout, revoked/expired sessions, or forced auth unmount still discard in-memory drafts. Track C does not delay or override auth enforcement and does not persist PHI to compensate. The editor visibly warns about this risk. Manual logout is guarded before the existing logout call.
- Native unload dialogs are browser-controlled (generic text, user-activation requirements, and possible suppression on mobile/process termination). Browser crashes, process kills, forced auth unmount, and suppressed dialogs cannot guarantee recovery. These tests verify cancelable event behavior in jsdom, not real browser chrome.
- A save already sent may complete on the server after confirmed navigation/logout; confirmation explicitly warns about that. Generation guards suppress stale UI updates but are not transport cancellation or backend idempotency guarantees.
- Only the current AppPage-hosted editor is guarded. A future host that changes `patientId` directly or unmounts the editor must consult `onDirtyChange` before doing so. The current app uses local page state rather than SPA history routes; full-document browser navigation uses the unload guard.
- Existing database-backed browser E2E tests were inspected for selector compatibility but **not run**: the task prohibits running a database. No claims are made about full deployed E2E, actual AI quality, real-browser dialog appearance, or independent evaluator approval.
- No secret files were read; no database was started or accessed; no packages installed; no dist build, commit, or push performed.

## Independent evaluator C FAIL — corrections, 2026-09-20

This update supersedes the earlier **NOT RUN** evaluator status above: the supervising agent supplied an independent **FAIL** with two concrete async findings. The corrections below have implementer verification only. **Independent re-evaluation is PENDING; no evaluator PASS is claimed.** Nested subagent tools are unavailable here; the supervising agent will assign the evaluator.

### Supplied findings and root causes

1. **Demographic save can silently discard another patient's note.** Real `PatientForm` submits patient A, navigation opens B, a B note draft is entered, then A's save resolves. The prior `onCreated` callback compared the response with its captured patient A, not the currently displayed B. It called `setPatient(A)` with zero confirmations and unmounted B's draft.
2. **Status completion can change the wrong patient.** An A status request completes after navigation to B. The captured-A equality check passed, then a functional state updater spread the current B and applied A's `is_active` value.

The original navigation suite mocked `PatientForm` callbacks synchronously and therefore missed these real submit/await/callback paths. The new regression suite keeps **PatientForm, Header, and NoteEditor real** and defers API promises; no direct substitute for the form's async callbacks is used.

### Correction scope and behavior

Only these files were changed in this correction pass:

- [frontend/src/pages/AppPage.tsx](../../frontend/src/pages/AppPage.tsx).
- [frontend/tests/draft-patient-async.test.tsx](../../frontend/tests/draft-patient-async.test.tsx), new, **44 focused synthetic cases**.
- This evidence report.

No edits were made to client/auth public interfaces, PatientForm, other clinical components, backend, manifests, or existing tests. Track D's separate `getSessionGeneration` mock fix in [frontend/tests/workflows.test.tsx](../../frontend/tests/workflows.test.tsx) was left untouched and included in the final regression run.

- **Stable originating scope:** each form-render callback captures its navigation version plus both patient database ID and patient identifier. AppPage checks that scope against synchronously maintained live refs and mounted state **before** any async result/error mutates parent state or triggers a discard dialog. It never captures the generation anew inside a late form completion.
- **Navigation versus confirmation:** confirming permission alone does not change the generation. A rejected navigation is a no-op; selecting an already-selected page is a no-op. Accepted navigation/new request boundaries invalidate older work. Reopening A after leaving A still has a new generation, so identity equality alone cannot revive an old request.
- **Demographics/status/create:** same-patient saves still update demographics without remounting the note or prompting. Status completions update only the guarded originating patient, not an unchecked functional updater's current record. Stale status errors are neither stored in parent state nor rethrown into the new view. Form subtrees are keyed by navigation version and identity, isolating old form-local loading/error/status state from a reopened form, including create forms with the same identifier.
- **Search/OCR:** results, errors, and finalizers are scoped; stale finalizers cannot unlock a newer request. Photo encoding is checked again **before upload**, as well as after OCR. Search success explicitly commits its new navigation scope before opening the resolved patient/create view.
- **Camera:** stale permission results stop their returned tracks instead of reopening a camera. Navigation/cancellation/unmount release open tracks, pending attachment timers, and metadata handlers. Deferred attachment/metadata callbacks verify scope and stream identity; rejected playback promises are consumed without affecting a later view. Capture closes the stream without invalidating its own intended OCR; Cancel abandons the scope. Navigation clears captured preview/OCR state.

### Focused regression evidence

The 44 new cases cover:

- A demographic/status request resolving **or rejecting** after B is opened and a draft typed; B identity, active status, note/date, and confirmation count remain correct.
- A → away → A revisits (same identity, different generation), explicit accepted dirty navigation, and stale error isolation.
- Rejected Dashboard/Cancel/Logout/patient-list navigation retains rightful demographic/status results; rightful errors remain visible.
- Same-patient demographic saves, including StrictMode effect replay, do not reload/reset the note or prompt unnecessarily.
- Real pending create requests after B navigation and after reopening a same-identifier create form; current successful create still works.
- Old search/OCR success/error cannot replace B's draft or clear a newer request's loading state; same-page no-op navigation leaves a rightful search live.
- Deferred camera permission, encoding, OCR, attachment, and metadata completion; track cleanup on navigation/cancel/unmount; no obsolete upload after leaving an encoding operation.
- Storage/IndexedDB/download spies remain unused during the synthetic create/draft workflow. No PHI persistence was introduced.

The first new-suite run found seven **test harness selector failures**, all caused by the search page and Header both exposing “View All Patients.” The helper was scoped to the Header's `banner`. The subsequent draft-only run passed **109/109** (45 editor + 20 prior navigation + 44 new async cases). No failing harness run is counted as verification.

### Actual final commands and results

Environment: Node **v22.23.2**, Vitest **4.1.11**, macOS. Node 22 invoked ephemerally with `npx --yes --package=node@22`; no manifest/lockfile edits. Commands below are the actual final invocations, grouped by working directory.

From the frontend workspace:

```sh
npx --yes --package=node@22 node --version
npx --yes --package=node@22 node ../node_modules/vitest/vitest.mjs run tests/draft-editor.test.tsx tests/draft-navigation.test.tsx tests/draft-patient-async.test.tsx tests/workflows.test.tsx --reporter=dot
npx --yes --package=node@22 node ../node_modules/typescript/bin/tsc --noEmit
```

- Version: **v22.23.2**.
- Tests: **119/119 PASS**, **4/4 files**, final start **15:38:33 local**, duration **4.71 seconds**. This is 109 draft tests + 10 existing workflow regressions.
- Frontend source TypeScript `--noEmit`: **PASS**, exit 0, no dist build.

From the repository root:

```sh
npx --yes --package=node@22 node node_modules/eslint/bin/eslint.js frontend/src/pages/AppPage.tsx frontend/src/components/NoteEditor.tsx frontend/src/hooks/useUnsavedChanges.ts frontend/tests/draft-editor.test.tsx frontend/tests/draft-navigation.test.tsx frontend/tests/draft-patient-async.test.tsx
git diff --check -- frontend/src/pages/AppPage.tsx docs/verification/track-c-drafts.md
```

- Focused ESLint: **PASS**, exit 0, no findings.
- Tracked-source whitespace check: **PASS**; editor diagnostics for AppPage/new regressions: **no errors**.

No database/service startup or access, external AI invocation, real camera/image/PHI capture, screenshots, secret-file reads, commits, or pushes were performed. All responses, patients, notes, and camera images in these tests are synthetic mocks. A request already sent can still finish on the server after accepted navigation; UI guards do not claim cancellation of committed writes. The independent evaluator must now re-run the supplied failure scenarios and assess these corrections.

## Evaluator C2 — completed-scan identity correction, 2026-09-20

The supervising agent reports that the original late-callback correction passed **21 independent supplemental probes**. That is supplied evaluator evidence, not a run performed here. C2 additionally reproduced a pre-existing identity-mixing path: complete matched **or** unmatched sticker A → manually search missing B → B's create form receives A's OCR names. This section records the implementer's correction and actual local results. **Independent C2 re-evaluation remains pending**; no evaluator/delegation tool is available in this session, and the supervising agent will retest independently.

### Exact correction scope

Only [frontend/src/pages/AppPage.tsx](../../frontend/src/pages/AppPage.tsx), [frontend/tests/draft-patient-async.test.tsx](../../frontend/tests/draft-patient-async.test.tsx), and this report were edited in this pass. No PatientForm, API client, backend, manifests, other tests, or other track files were edited.

- **Identity-bound OCR:** a scan binding contains its navigation generation, resolved database ID (or null for an unmatched scan), resolved patient identifier, and parsed fields. Prefills are available only while all identity/generation checks match the current view. A matched record's resolved identifier wins over an OCR alias.
- **Manual intent clears old context:** accepted navigation, including manual Search even with the same ID, clears scan binding, preview, raw OCR, and scan decisions. Editing the search ID abandons the scan attempt immediately, including pending permission/encoding/OCR; a later response cannot restore A or override B. Ordinary manual-search resolved-ID behavior remains unchanged.
- **Explicit reviewed create:** only the existing **Create New Patient** action transfers a current unmatched scan into the new create generation. The ID is locked while sticker fields are present. **Clear sticker fields to correct Patient ID** explicitly removes the scan and remounts a blank form before enabling ID editing; it does not silently carry A's demographics to a corrected ID. A failed scan still supports clean manual creation; a no-ID scan can use the same explicit correction action.
- **Draft/callback preservation:** rejected navigation and same-page no-op navigation still do not advance the generation or clear legitimate state. Reviewed create remains usable, and its subsequently opened note retains the existing draft guard. Explicit ID correction invalidates a pending old create's parent callback. Memoized prefill props prevent an unrelated parent rerender from resetting reviewed form edits.

### Regression and verification results

The real PatientForm/Header/NoteEditor async suite now contains **63 cases**, including **19 new C2 cases**. New coverage includes matched/unmatched A → missing-B manual create with all fields clean and an asserted B-only save payload; same-ID manual searches; A → B → A search editing; delayed camera/OCR after changed input and delayed OCR success/error after manual search; legitimate reviewed scan creation; canceled Dashboard/Cancel/Logout with draft/date and rightful save retained; explicit clean ID correction; failed/no-ID fallback; resolved-ID aliases; stable reviewed edits after resize; and stale create success/error after explicit identity correction.

Before the source correction, the first 14 C2 cases produced **9 failed / 5 passed / 44 skipped**, confirming completed-scan leakage and related changed-ID behavior. Those failures are not counted as passing verification. Five additional cases were added during self-review.

Final attributable verification: **Node v22.23.2**, Vitest **4.1.11**, macOS; run label **TRACK-C2 ISOLATED VERIFICATION**, start **16:00:23 local**, duration **6.80 seconds**. Node 22 was invoked with `npx --yes --package=node@22 node`; installed tool paths and the frontend root/project were supplied as absolute paths to avoid shared-terminal cwd drift.

| Check | Actual result |
| --- | --- |
| Vitest: draft-editor, draft-navigation, draft-patient-async, workflows | **138/138 PASS**, **4/4 files** (45 + 20 + 63 + 10). |
| Frontend TypeScript `--noEmit -p frontend/tsconfig.json` | **PASS**; terminal printed `TRACK-C2 noEmit PASS`. No build output generated. |
| ESLint on AppPage and draft-patient-async | **PASS**, no findings; terminal printed `TRACK-C2 LINT AND WHITESPACE PASS`. |
| Scoped `git diff --check` plus direct whitespace/newline checks for the untracked test/report | **PASS** after adding missing final newlines to the test/report. |
| Editor diagnostics on the two owned TSX files | No errors. |

Earlier synchronous checks returned a wrong-cwd module error, unrelated Track B output, or were interrupted with exit 130 in the shared terminal; none is counted as a successful check. The isolated run above completed tests and noEmit. The workflow suite emitted an existing React list-key warning from VitalsCard; no out-of-scope component was changed.

All patients, OCR, camera streams/images, API writes, and notes were synthetic mocks. No database, service, external AI, real PHI, secret file, package manifest, commit, or push was used or changed. In-flight server writes still are not canceled by navigation; only their stale UI completions are ignored. Independent C2 approval is not claimed.
