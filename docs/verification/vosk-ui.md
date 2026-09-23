# V2 — local note dictation UI

## Status and ownership

Implemented and corrected on 2026-09-22. **Original independent evaluation: FAIL — native ScriptProcessor tail loss despite 193 passing tests. Correction: fallback removed; 201 implementer tests PASS. Independent V2-R correction retest: PASS — 220 units and 25 native controls.** MAIN's later real-engine/Docker/full-release results are separately attributed below. No physical-microphone, clinical-accuracy or production approval is implied.

V2 owns these changes:

- [useVoskDictation](../../frontend/src/hooks/useVoskDictation.ts): browser capture and lifecycle.
- [NoteDictation](../../frontend/src/components/NoteDictation.tsx): controls, statuses, preview, errors and safety notices.
- [NoteEditor](../../frontend/src/components/NoteEditor.tsx): verified-load gating, draft appends, dirty guard and action locks; existing optimistic revision/conflict/AI safeguards retained.
- [Capture worklet](../../frontend/src/worklets/dictationCapture.worklet.js): **V2-added asset**, bundled by Vite via a lazy `?url&no-inline` import. It needs no public-directory copy, dependency, V1 worker change, or extra network origin. MAIN/V1 should retain this asset in the ordinary frontend source/build copy and verify its generated same-origin URL under the final CSP.
- [Capture tests](../../frontend/tests/vosk-dictation.test.tsx) and [editor tests](../../frontend/tests/vosk-note-editor.test.tsx).
- This receipt.

V2 did not change dependencies/lockfiles, Docker/nginx, V1's [local adapter](../../frontend/src/services/localVosk.ts), backend, AppPage, AuthContext, apiClient, or existing clinical tests. No package installation, model download, application build, Docker operation, database operation, or real audio capture was performed by V2. This correction changes only the hook, NoteDictation, NoteEditor, the two V2-owned test files and this receipt; the capture worklet asset itself is unchanged.

## Independent V2-R acceptance

MAIN's dedicated independent V2-R evaluator completed the correction retest under
**Node 22.23.2 / Chrome 153**: **220/220 units** (201 required plus 19 adapter)
and **25/25 native controls PASS**, without skips. The actual hook/editor/adapter
and capture worklet were exercised with a synthetic native audio source and a
substituted **engine-protocol worker, not Vosk/WASM recognition**. At both 44.1
and 48 kHz, supported capture delivered **128/128 and 6,000/6,000 frames** before
the final flush barrier; resource closure and unsupported-browser fail-closed
behavior passed. The over-limit full draft was preserved without a Save request;
explicit shortening and the exact 50,000-character boundary passed. Native stale
patient/session/cancellation, malformed-result, starvation and timeout controls
also passed. Types/scoped lint/worklet syntax passed; 110 protected hashes were
unchanged during that independent evaluation.

The original fallback-loss FAIL remains below. The external correction harness's
initial **23/25** result is also retained: its timeout assertion preceded the
drain barrier, and its 44.1 kHz AudioBuffer source produced 6,001 frames for a
6,000-frame request, reproduced in an independent source control. Only evaluator
input/assertion timing was corrected, not application assertions or capture code.
A passing run under an unintended Node 20 was not substituted for Node 22; the
final explicit Node 22 rerun passed 220 units and all 25 controls. The final
private evaluator evidence remains under
`/tmp/medapp-evaluator-v2r-20260922-node22/`; it is not copied into this receipt.

MAIN later independently rebuilt the app and passed **nine real-WASM synthetic
fake-microphone scenarios**, one **55.6-second** Playwright gate with capture
disabled and zero screenshot/receipt writes, plus **23 capture guards**. The
**Node 22 / PostgreSQL 17 / UTC full release passed 1,749 distinct cases**, both
builds/types/lint, and root npm audit zero. That total already includes **82 speech
units**, including V2's 36 capture + 27 editor tests; overlapping V2-R/focused
reruns are not additional distinct release cases. See [MAIN's final handoff](vosk-browser.md#main-final-handoff--2026-09-22)
for counts, log hashes, the separate historical V3 evidence-preservation FAIL and
unchanged fresh screenshot manifest.

The app remains **LEFT RUNNING**, three healthy local-development services, with
synthetic data and existing local registration only. [MFA/clinic pilot implementation](../decisions/APPROVED_PILOT_SCOPE.md)
and infrastructure acceptance remain pending; the [historical credential gate remains FAIL](FINAL_VERIFICATION.md#credentialsecurity-gate--still-fail),
not rerun or resolved. Physical microphones, uncontrolled accents, medical numbers
and clinical accuracy remain unverified. This update changes only documentation;
no source/tests/assets, screenshots, JSON receipts or service state were modified.

## Independent failure and bounded correction

The independent reviewer reproduced **native Chrome synthetic-PCM loss in ScriptProcessor capture**: 128 input samples delivered **0**, and 6,000 delivered **5,632** in the final reproduction. Stop removed the callback and closed capture before the native processor's pending block reached the hook. The recognizer could not flush audio it had never received. The UI nevertheless showed Stopped, enabled Save and showed no truncation alert. The same native evaluator delivered **128/128 and 6,000/6,000 on AudioWorklet**. These were native browser audio/worker tests with a synthetic engine-protocol driver, not actual Vosk recognition or human microphone evidence.

The original 193 passing tests did **not** disprove this defect: the fallback mock invoked already-delivered callbacks and did not model native buffering. The earlier claim that deprecated fallback dictation still worked is withdrawn.

The correction **disables ScriptProcessor entirely**, rather than attempting a timed sleep or fake flush. Start checks the AudioWorkletNode constructor before creating an AudioContext, then checks the context's audioWorklet/addModule before resuming it, requesting microphone access or importing/creating the approximately 36 MB model recognizer. Missing support shows an actionable AudioWorklet-required message with typing still available; it never enters Listening. A context created for the check is closed. Start remains available for an explicit supported retry; there is no alternate speech service.

Unit regressions prove missing node/context/addModule fail before audio/model acquisition, created-context closure, no Listening transition, no ScriptProcessor call, safe supported retry, and continued manual typing/reviewed Save. An existing module-load failure regression now also explicitly verifies acquired-track closure, recognizer disposal, aborted preparation and no Listening. The supported worklet queue, stop acknowledgment and last-block-before-recognizer-flush path are preserved; no fixed delay was added.

At the implementer handoff, the evaluator's external native harness was read only and left byte-identical. Its old fallback branches expected Listening, so MAIN/the independent evaluator needed to adapt their assertions to unsupported/no audio rather than treating disabled fallback as a working capture path. Its old note-overflow branch also expected a server rejection; the new optional UI guard instead blocks Save while retaining the full draft. **That implementer did not claim an independent PASS.** The later V2-R and separate actual-model V3 acceptance results are recorded above; no human microphone was used.

## Behavior and boundaries

- No automatic start. A named **Start dictation** click is required, after the current patient/date/session's existing-or-absent note has been verified. Note-load failure, saving, formatting, AI review, conflict reconciliation and template saving prevent start. A session-generation change requires a fresh note load.
- Statuses: **Loading model**, **Listening**, **Processing**, **Stopped**. Insecure contexts, unsupported capture, denied/missing microphones, model/capture failures and timeouts have bounded, content-free error messages and explicit retry via Start. No browser Web Speech or cloud fallback exists.
- The UI identifies English (India), the approximately 36 MB small Vosk model download, additional browser memory use, and the need to review medications/doses/dates. The general model is not clinically validated.
- Capture is mono at the **actual AudioContext sample rate**, sent to V1's `createLocalRecognizer(sampleRate, onResult, onError, signal)`. The adapter is imported only after the click. Inference/model assets remain V1's same-origin browser-local responsibility.
- **AudioWorklet is required; ScriptProcessor is disabled.** The same-origin worklet batches 4,096 samples, zeros output, permits at most one unacknowledged regular block plus its bounded current block, and stops on overflow. A zero-gain destination route keeps processing active without microphone feedback. Missing support fails before microphone/model acquisition; a worklet module failure disposes acquired resources and never selects another capture mechanism. The obsolete fallback warning is removed.
- Interims replace a visibly separate preview and never enter the note. Each nonempty final event appends one trimmed segment with a separating space only when needed. **There is deliberately no text-based deduplication:** identical consecutive final segments and repeated words can be legitimate. The adapter contract must deliver each segment once; it has no segment IDs from which the UI could distinguish a duplicate final from an intentional repeat. The UI does not append a preview again on Stop.
- Functional state updates preserve manual typing, including typing during finalization. Text receives a second patient/date generation and session check inside React's updater. No clinical-word inference, command interpretation, punctuation insertion, or autosave is added.
- The editor displays the full draft's character count and the existing **50,000-character save limit**. Above it, an explicit warning and both the Save button and handler prevent submission. Manual input and dictated segments are retained in full: no textarea maxlength, slicing, truncation or automatic deletion is added. Only a user's review/edit can shorten the draft; exactly 50,000 characters can be saved under the existing note/revision contract. The count uses JavaScript string length (including surrounding whitespace); the backend's existing trimmed-string validation is unchanged. Tests preserve dose/decimal/time text at and beyond the boundary and verify recovery by explicit editing.
- Model preparation, capture, processing and interim text participate in existing dirty navigation protection. Canceling date navigation leaves capture intact. **Confirmed date/patient navigation, session expiry, pagehide and unmount cancel without final flushing.** Date navigation remains available during finalization; a hung flush cannot trap the user. Existing save-in-flight date restrictions remain unchanged.
- Explicit Stop while listening immediately stops microphone tracks, drains the worklet's bounded final block, closes/disconnects capture, and awaits `flush()` before unlocking Save/AI/template replacement. Only this same-context Stop may append its final result. Late callbacks after completion/cancel, context changes or newer runs are ignored. Stop while preparing simply cancels.
- Synchronous refs protect competing Start/Save/Format/template actions before React rerenders. Save/AI/template replacement are disabled throughout preparation/listening/processing; manual note typing remains enabled when otherwise editable. Existing revision-zero rules, 409 comparison/reconciliation, pending code checks and separate AI review remain intact.
- Every owned run releases tracks, processor/port, source/gain, AudioContext and recognizer on stop/error/cancellation/unmount. Late permission grants are stopped, and late adapter creation is disposed. AbortSignal cancels model preparation. An active 250 ms lifecycle check catches silent session-generation changes in addition to every audio/result callback and the expiry event.
- Bounds: preparation 120 seconds; listening 5 minutes or 5 minutes of actual PCM; finalization 10 seconds; 20,000 callbacks; 16,000 characters per result; 100,000 finalized characters per run. Timeout/overflow/error discards unfinished preview, retains already-finalized/manual note text and requires an explicit restart. V1 separately owns its worker queue limits.
- No capture audio, preview, or draft persistence/network submission is added. Explicit existing Save Note is still the only note submission action; ordinary existing note/template GETs remain unchanged.

## Actual verification

### Correction run

Attributable correction run began **2026-09-22T06:06:28Z**, Node **22.23.2**, Vitest **4.1.11**. No skips or retries:

| Suite | Passed |
| --- | ---: |
| V2 capture/lifecycle/worklet (33 adjusted + 3 new) | 36 |
| V2 note-editor dictation (22 adjusted + 5 new) | 27 |
| Unchanged draft editor | 45 |
| Unchanged draft navigation | 20 |
| Unchanged draft patient async | 63 |
| Unchanged workflows | 10 |
| **Total (six files: 55 adjusted + 8 new + 138 unchanged)** | **201** |

Frontend source noEmit, explicit noEmit of both V2 test files, scoped ESLint of the three owned source files and two test files, unchanged capture-worklet JavaScript syntax, and tracked NoteEditor whitespace checks passed by **2026-09-22T06:06:47Z**. Editor diagnostics found no errors in those five TS/TSX files. The first correction test run and static checks passed; no clinical test or package change was required.

At **2026-09-22T06:08:21Z**, before/after SHA-256 comparison confirmed **87 protected files unchanged**, including all non-owned frontend source/tests, backend source, package manifests/lock, V1 worker/model assets and tools, capture worklet, configuration and the external native evaluator. Aggregate digest: `59e8c5b9a8c38491d242f057372ead6f9cd0d3079064271b0b5a8c9e4e223112`. Source inspection confirmed no ScriptProcessor creation/type/callback or fallback warning state remains in the hook. Owned-file terminal newlines and receipt links also passed validation.

Both V2 suites now use worklet protocol mocks, not ScriptProcessor callback mocks. The explicit drain case withholds the stopped acknowledgment, asserts capture context/port remain open and recognizer flush has not occurred, then sends the final 128 samples before the barrier. Other lifecycle cases use a mock acknowledgment, not a timer-based production flush. The two actual-source VM worklet algorithm tests remain unchanged. These checks prove the fallback is disabled and the specified UI/cleanup contracts hold in the test harness; they are **not** a new native scheduling, real-model, clinical-accuracy or broad application-health claim.

### Historical pre-correction run (not native acceptance)

The original attributable run began **2026-09-22T05:37:52Z**, Node **22.23.2**, Vitest **4.1.11**. No skips or retries:

| Suite | Passed |
| --- | ---: |
| New capture/lifecycle/worklet | 33 |
| New note-editor dictation | 22 |
| Existing draft editor | 45 |
| Existing draft navigation | 20 |
| Existing draft patient async | 63 |
| Existing workflows | 10 |
| **Total (six files)** | **193** |

Frontend source typecheck, an explicit TypeScript check of both new test files, V2-scoped ESLint, capture-worklet JavaScript syntax, and tracked NoteEditor whitespace validation passed in the same command chain. Editor diagnostics reported no errors in the owned TS/TSX files.

Coverage includes lazy click/load gating; 44.1/48 kHz actual rates; mute/mono routing; repeated interims and legitimate repeated final words; exact note text; preservation of manual edits; final Stop flush; cancellation and late permission/model/worklet readiness; old callbacks against newer runs; account switches before host rerender; session-expired/pagehide/unmount; StrictMode effect replay; permission/unsupported/insecure/missing-device errors; model/capture/device/flush failures; timeout/input/result bounds; worklet backpressure and its final-block barrier; dirty guards; same-render competing actions; 409 revision preservation and explicit AI review; absence of automatic persistence/submission.

All capture APIs and the adapter are mocked in UI tests. Two worklet tests execute the actual capture source in an isolated JavaScript VM using synthetic PCM arrays. **Neither is proof that a human microphone, browser AudioWorklet scheduling, Vosk WASM, model download or Docker CSP works end-to-end.**

Earlier self-test failures were test-harness issues and are retained here for accuracy: the first run had 187 passes and two failures because Vite rewrote a worklet file URL used by the VM harness. Importing the raw source corrected this; a subsequent 189-case run passed. Added lifecycle cases brought the total to 193; explicit test-only type checking then caught an overly broad mock type and unsupported `exact` role-query options. Those were corrected without changing assertions or existing tests; the final 193-case run and all listed checks passed.

## Historical MAIN handoff / acceptance now completed

The following requests describe the implementer handoff, not current pending
functional work. Independent V2-R and MAIN subsequently completed the synthetic
checks as recorded above; physical microphones and clinical suitability remain
unverified. The original requested acceptance scope is retained:

1. Assign an independent evaluator to retest this V2 correction. Preserve the original fallback failure evidence; adapt external fallback probes to require an unsupported message, zero microphone/model acquisition, context closure, no Listening, typing available and no ScriptProcessor use. Rerun supported native 128/128 and 6,000/6,000 capture/Stop probes. No independent correction PASS is claimed here.
2. Coordinate the V2 worklet source with V1's final frontend asset build. No adapter stub was created; tests consumed V1's actual module path with a test mock.
3. After parallel writers finish, verify the final bundled same-origin capture-worklet URL, V1 worker/model, CSP and Docker deployment together. No full build/Docker action was run by V2.
4. Run a real-engine browser case with an explicitly synthetic virtual microphone under V3, asserting exact capture/Stop-finalization behavior and absence of external/audio-upload requests. Retest the 50,000-character UI guard with exact dose/number preservation, no over-limit request and recovery after explicit editing. Human microphone use and clinical suitability remain unverified; do not capture real PHI for this acceptance step.
