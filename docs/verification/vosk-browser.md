# V3 — Docker and real Vosk browser QA

## MAIN final handoff — 2026-09-22

**Final local synthetic functional verification: PASS. App LEFT RUNNING.** MAIN
independently reviewed the corrected capture harness and ran its exact default
gate against the rebuilt Docker app:
`VOSK_LOCAL_QA=medapp-vosk-local:55440 node node_modules/@playwright/test/cli.js test --config tests/vosk-browser.config.mjs`.
Result: **nine named scenarios PASS, one Playwright gate in 55.6 seconds**,
`capture=false`, `screenshotCount=0`, `receiptWritten=false`. This covers the
corrected default/no-file-overwrite path; it is not a new capture or a restoration
of the lost originals. MAIN also viewed the fresh canonical Listening and Saved
images below; this documentation pass rehashed all three PNGs and their receipt
without changing the manifest or artifacts.

The actual UI, native Chrome fake **SYNTHETIC** microphone, worker/WASM and model
were used, not injected recognition. Scenario identities:

1. `served-assets-and-csp`
2. `cold-real-mic-recognition-and-stop-barrier` (native fake device, not human mic)
3. `explicit-save-reload-patient-search`
4. `warm-idb-offline-recognition-online-save`
5. `missing-model-manual-recovery`
6. `native-permission-denied-manual-recovery`
7. `cancel-loading`
8. `patient-change-cancels-real-recognition`
9. `logout-cancels-real-recognition`

All observed external requests, audio uploads, unexpected requests, page/console
errors and unexpected HTTP/network errors were **zero**. The negative cases are
declared; **one expected model 404** is counted separately, not suppressed.
Offline recognition/Stop is verified **only after assets loaded**; connectivity
was restored before Save. No offline bootstrap/reload/Save claim is made.

### Completed release and independent checks

MAIN's full `npm run verify:release` used **Node 22 / PostgreSQL 17 / UTC** with a
fresh regression database container, separate from the running app database.

| Within that full release gate | Passed cases |
| --- | ---: |
| Root release contracts, including nine Vosk asset contracts | 32 |
| Backend units | 47 |
| Frontend, including 82 speech units (19 adapter + 36 capture + 27 editor) | 726 |
| Required integration: 11 suites, zero skipped/todo | 936 |
| Baseline real-browser cases, zero failures/skips/runner errors | 8 |
| **Distinct cases in this gate** | **1,749** |

Both frontend/backend builds, typechecks and lint **PASS**; root npm audit reports
**zero vulnerabilities**. Separate from that total: MAIN's **23/23 capture guards**
and the **nine actual-speech scenarios** above passed. The nine asset contracts
and 82 speech units are already included in 1,749; repeated focused runs and the
single Playwright wrapper are not additional distinct cases.

Earlier independent V1 evaluation passed **nine assets, 14 then-current guards,
82 focused units, five actual-model controls and the startup diagnostic**;
see [V1 status](vosk-runtime.md#independent-acceptance-and-final-main-follow-up).
Independent **V2-R: 220 units + 25 native controls PASS**, with its synthetic
engine-protocol boundary explicitly retained in [V2 status](vosk-ui.md#independent-v2-r-acceptance).
Those runs overlap other coverage and are not extra release totals. The original
V3 evaluator's **functional PASS / evidence-preservation FAIL** remains below;
neither the correction nor MAIN's pass erases it or claims original restoration.

### Parent log provenance

These are MAIN-observed runs, not new runs by this documentation finalizer. Exact
local log bytes were read and SHA-256 computed during finalization; only safe
counts/booleans were extracted. No raw full logs, secret values, tokens or audio
were copied into the repository. Temporary logs are not durable hosted evidence.

| Parent-owned local log | SHA-256 |
| --- | --- |
| `/tmp/medapp-vosk-full-regression-20260922.log` | `b4575fb8dc6f061a05448ae3a4ed32598c5364ffd528db4a0b9ca73798d3d7c3` |
| `/tmp/medapp-vosk-orchestrator-browser-20260922.log` | `716a44dff5336ef1db2048a013d72f699632746217c374903cec87c276a12704` |

### Local run state — LEFT RUNNING

MAIN independently completed
`POSTGRES_HOST_PORT=55440 SEED_DATABASE=false docker compose -p medapp-vosk-local up --build -d --wait`.
Locked dependency/pinned-stage builds passed; frontend/backend recreation and new
start IDs were expected. A documentation-finalizer **read-only** Compose/inspect
check confirmed the following, superseding older service snapshots below:

| Service | Current container ID | Endpoint | State |
| --- | --- | --- | --- |
| Frontend | `38da8b946537` | <http://localhost:5173> | running, healthy |
| Backend | `5fbc3d6662b7` | <http://localhost:5001> | running, healthy |
| Project PostgreSQL | `ec70e7877747` | `127.0.0.1:55440` | running, healthy; original container unchanged |

All three show zero restarts. MAIN stopped **only** the separate
`medapp-vosk-regression-20260922` container; read-only inspection confirms it is
exited. Host PostgreSQL **PID 1797 on 5432** remains listening and untouched.
This finalizer issued no service/database mutations, builds or tests. The app
must remain running for the user; no fixtures/volumes were removed.

**Boundaries:** this is LOCAL DEVELOPMENT with synthetic records and existing
local registration, not an approved clinic/MFA pilot deployment. The
[approved pilot design](../decisions/APPROVED_PILOT_SCOPE.md) still requires
implementation/infrastructure acceptance. Physical microphones, uncontrolled
speakers/accents, medical numbers, medication/dose accuracy and clinical use
remain unverified. The smallest English model is the **36M Indian-English**
general model, not universal or medically validated. Audio stays in the browser;
only explicit Save sends reviewed text. Worker-only `unsafe-eval` remains a
documented tradeoff; there is no runtime external model/WASM fetch.

The historical [credential/security gate remains FAIL](FINAL_VERIFICATION.md#credentialsecurity-gate--still-fail),
**not rerun/resolved** here. npm audit zero does not clear it. No GitHub action,
credential testing/rotation, history rewrite or scanner suppression was performed.
See the [final usage guide](../VOSK_DICTATION.md#using-local-dictation).

## Current correction — capture safety and evidence incident (2026-09-22)

**The original three proof PNGs were overwritten by the independent evaluator;
the original hashes below are STALE. No original restoration is claimed.** The
07:22:33 independent evaluation reported functional PASS (nine browser scenarios
twice, five real-engine controls, nine assets, 14 guards, 82 units, one startup
diagnostic, no skips/retries, npm audit zero), but **overall evidence-preservation
FAIL**. An in-memory Node output relocation applied in the Playwright parent/config
did not reach its worker. The old harness used fixed screenshot paths and captured
there during that invocation. Checked local caches did not yield exact originals.
Source, prior JSON receipts and the then-current document were unchanged by that
incident; the document's original screenshot digests no longer described the PNGs.

The evaluator's private directory is `/tmp/medapp-final-vosk-evaluator-20260922-hkJbQe`
(final evaluation, baseline, incident evidence, later safe temporary screenshots).
Those temporary images are **not copied/rebranded as this correction's run**.
Retain the three overwritten files as **superseded / UNVERIFIED original-history
proof**, not canonical captures:

| Superseded file | Current actual SHA256 (not original) |
|---|---|
| [screenshots/vosk-01-listening.png](screenshots/vosk-01-listening.png) | `61219cd68407ab49b61593b1a1818f9756b6b76278524b7c95c4fc1cf0e3ecca` |
| [screenshots/vosk-02-saved.png](screenshots/vosk-02-saved.png) | `a4b86447ef37108abd85f5c07a97200b959133f7297803eaa11539efbd03c067` |
| [screenshots/vosk-03-permission-denied.png](screenshots/vosk-03-permission-denied.png) | `027c76dac39abd918f275363493c95b2d0cfaa6c32e8dc3b15461e5e68f84ba2` |

### Correction policy and verification scope

- [Harness](../../tests/vosk-browser-qa.mjs), [settings](../../tests/vosk-browser-settings.mjs),
  [evidence writer](../../tests/vosk-browser-evidence.mjs), [config](../../tests/vosk-browser.config.mjs)
  and [spec](../../tests/vosk-browser.spec.mjs): **capture false by default**. Only
  exact `VOSK_CAPTURE_SCREENSHOTS=true` or explicit API `capture: true` enables it;
  API `capture: false` overrides inherited opt-in. Retired variable ignored,
  retired CLI flag rejected. No default receipt/screenshot/snapshot or raw auth/note output.
- `VOSK_EVIDENCE_DIR` is passed as serialized Playwright metadata to its worker.
  New directory only, exclusive file creation, restricted output locations,
  no traversal/source/assets/existing proof/symlink targets. Screenshot assertions
  run first; bytes stay in memory until all nine scenarios pass. Each explicit
  capture publishes its own dated receipt and actual PNG hashes. Playwright's
  cleanup/last-run bookkeeping uses separate OS-temp storage, never evidence.
  A final additional CLI safeguard rejects `--output`/`--output=...` overrides
  before Playwright deletes anything; both forms preserve an existing sentinel
  receipt in the configuration guard (added after the three-run capture check).
- [Guard tests](../../tests/vosk-browser-config.test.mjs): **23/23** (14 existing
  plus nine capture/path/write/real-worker controls); asset contracts **9/9**.
  This guard filename is not matched by the root config-*.test.mjs release glob;
  invoke it explicitly as shown in the [guide](../VOSK_DICTATION.md#reproducible-synthetic-qa).
- The [explicit preservation check](../../tests/vosk-browser-preservation-check.mjs)
  runs the real nine-stage gate default → fresh capture → default; hashes existing
  evidence/docs/manifests and new proof. **PASS at 07:35:15.487 UTC**, results below.
  No application source/build/restart/root manifests/core tests
  were changed by that correction. MAIN subsequently completed full regression,
  independent rebuild and correction review as recorded above; this docs-only
  finalizer did not spawn a nested evaluator or repeat those runs.

### Canonical fresh proof — current correction run

**Implementer correction PASS.** Node **22.23.2**, Chrome **153.0.8010.53**;
fresh captured run **07:33:26.072–07:34:20.369 UTC**. Real asserted synthetic
screenshots were generated by this run, not copied from the evaluator or originals.
All three were visually reviewed, have synthetic-only captions and no filled
passwords/auth tokens. The permission-denied state is **test-configured native
denial**, checked using actual browser permission/resource counters and unmocked
getUserMedia; it is not a human microphone/prompt test. There is no PHI.

| Current artifact | Actual SHA256 |
|---|---|
| [Listening: actual interim, empty final draft](screenshots/vosk-20260922-final/vosk-01-listening.png) | `dc25739bfa7114cacbc6d622fdc8aceef0450e8c07f56696412faa078bb53b72` |
| [Saved/reloaded: actual final text](screenshots/vosk-20260922-final/vosk-02-saved.png) | `27eeb0747aeffab057d092b9f190932e77b5f6bf2630643ceba0159fd644f42a` |
| [Test-configured native permission denial/manual editing](screenshots/vosk-20260922-final/vosk-03-permission-denied.png) | `ec6e32249ffb7a3ba480d293f8db72372692d2627daacf060d18cc479e078792` |
| [Dated receipt, all nine cases and PNG hashes](screenshots/vosk-20260922-final/receipt-2026-09-22T07-33-26.072Z.json) | `377e0c43191a253b146e810c90735bdcf433bfb2c25920eda56d3102dcee9ed9` |

| Current correction checks | Result |
|---|---|
| Default-before real Playwright gate | **1/1 gate, 9/9 scenarios**, zero screenshots/receipts; all 120 existing protected hashes and file inventory unchanged |
| Explicit fresh-directory capture gate | **1/1 gate, 9/9 scenarios**, exactly three PNGs + one new dated receipt; no existing protected file changed |
| Default-after real Playwright gate | **1/1 gate, 9/9 scenarios**, zero screenshots/receipts; all 120 existing files AND four new artifacts unchanged |
| Capture/settings/worker guards | **23/23** (14 existing + nine new); real Playwright child boundary included, no app used in that guard |
| Asset contracts | **9/9** |
| Focused runtime/capture/editor units | **82/82** = adapter 19 + capture 36 + editor 27 |
| Current npm audit, low threshold | **0 vulnerabilities**, existing UUID override 11.1.1 unchanged |
| Scoped harness lint / editor diagnostics | PASS |

No retries, skips or failed attempts in this correction's three browser runs.
These are **nine unique browser scenarios repeated three times**, not 27 distinct
requirements. The independent evaluator's earlier five engine controls and one
startup diagnostic remain separately attributed above, **not rerun/claimed as new**.
Full regression and new independent review/build were pending at this correction
handoff; MAIN has since completed them as recorded in the final handoff above.

Current capture cold/warm final text: **one two three four five**, 23 characters,
SHA256 `bb1262c1cf29a3e8785c91295f20c7e6b596ac739c3ac6052f2f023f2b3d72b6`.
Cold/warm readiness **1,618/902 ms**, Stop/release **126/217 ms**. Native captured
frames equaled adapter-delivered frames: **460,800/460,800** cold and
**486,144/486,144** warm. Explicit Save/API revision 1 and reload/search matched
the actual text for synthetic patients **VOSK-07ca79f3b86d / VOSK-0a105a431119**,
date **2026-09-22**. Medical codes, medications and conditions remained empty.

Captured run browser counts: **212 requests, three model requests** (cold success,
intentional 404, held/canceled), **six workers, three worklets, nine API writes**
(four logins, four explicit notes, one logout). Zero external/audio uploads,
unexpected requests, page/console/HTTP/network errors; one expected 404 counted
separately. IDB has **21 model keys**; warm engine requires zero extra model GETs.
Offline recognition/Stop after worker/worklet/model loading made **zero requests**;
browser returned online before Save. Backend stayed connected/running; no offline
app boot/reload/Save support is asserted.

The three complete runs created **12 synthetic accounts, 18 synthetic patients,
12 explicit notes**, via API only. No SQL, database reset/deletion, host-5432
connection, image rebuild or service restart. Existing synthetic fixtures remain.
The preserved 120-file inventory includes original PNGs, prior receipts/evidence,
docs as they stood during the run, app source/public assets/tools and manifests.
Only these two owned Markdown documents are updated afterward with run results;
the evidence PNGs/JSON are not edited. Private protection/count-only results are
under `/tmp/medapp-v3-correction-20260922-3FLPHG/browser-check`.

Historical pre-rebuild read-only check at **07:38:23.996 UTC**: **118/120 initial protected files
unchanged** across the entire correction; the two intended changes are this
document and the guide. All old/new PNGs and receipts unchanged since capture,
48 local documentation links/anchors valid, no auth token/password in the fresh
receipt. Frontend **b28d8334fda0** (5173), backend **5e899f519a39** (5001), and
project PostgreSQL **ec70e7877747** (55440) remain **RUNNING/healthy**, original
start times and port mappings, **zero restarts**. Backend readiness **200**.
Host PostgreSQL **PID 1797 / 5432** listener and start time unchanged. No image
or service action was performed during that correction. MAIN's later rebuild
recreated frontend/backend; the final service table above is current. Leave the
app running for the user.

Exact maintenance command (choose new leaves for any future run):

```sh
VOSK_LOCAL_QA=medapp-vosk-local:55440 VOSK_EVIDENCE_DIR=docs/verification/screenshots/vosk-20260922-final VOSK_PRESERVATION_DIR=/tmp/medapp-v3-correction-20260922-3FLPHG/browser-check node tests/vosk-browser-preservation-check.mjs
```

The evidence leaf now exists, so repeating that exact destination intentionally
fails before API/browser activity. Use the [default no-capture command](../VOSK_DICTATION.md#reproducible-synthetic-qa)
for read-only evidence verification. Test fixtures still add synthetic API records.

## Historical implementer acceptance — 07:02:56 UTC (superseded screenshots)

**Historical V3 implementer status: PASS, 2026-09-22 07:02:56 UTC.** Real deployed
NoteEditor + native Chrome fake microphone + unmodified Vosk worker/WASM/model
recognized **“one two three four five”**, cold and warm/offline, then explicitly
saved and reloaded the text. All **9/9 browser scenarios passed twice** on the
final harness; the captured Playwright run is **1/1 gate**, the standalone repeat
executes the same nine scenarios (not nine additional unique requirements).
Configuration guards **14/14**, dynamic startup diagnostic **1/1**, scoped lint,
syntax and editor checks pass. No skips or retries. **Independent evaluation and
full regression were PENDING MAIN at this historical handoff; their later
dispositions are above. Clinical accuracy and real speaker verified remain
false.** No production or real-patient authorization is implied.

### Historical acceptance evidence (not new correction measurements)

- Node **22.23.2** explicitly selected; installed Chrome **153.0.8010.52**.
- Final capture: **07:01:07.386–07:02:02.621**, 55.6-second Playwright gate.
  Historically recorded local receipt:
  `test-results/vosk-browser/receipt-2026-09-22T07-01-07.386Z.json`.
- Final no-capture repeat: **07:02:02.875–07:02:56.651**.
  Historically recorded local receipt:
  `test-results/vosk-browser/receipt-2026-09-22T07-02-02.875Z.json`.
  These ignored/local JSON artifacts are **not present in this checkout at final
  documentation validation**; their historical names are retained without broken
  links. They were not recreated, removed or edited by this finalizer. The
  human-readable history remains here; the canonical fresh receipt above is
  available and hash-verified. The historical repeat did not change any PNG hash
  at that time; the later overwrite incident remains separately recorded.
- [Focused Playwright config](../../tests/vosk-browser.config.mjs),
  [gate spec](../../tests/vosk-browser.spec.mjs),
  [reusable harness](../../tests/vosk-browser-qa.mjs),
  [strict settings](../../tests/vosk-browser-settings.mjs),
  [native observation](../../tests/vosk-browser-observer.mjs),
  [guard tests](../../tests/vosk-browser-config.test.mjs).
  Reproduction and strict loopback opt-ins: [development guide](../VOSK_DICTATION.md#reproducible-synthetic-qa).
- No app build, source/adapter/UI/worklet/nginx/package/lock/assets/Compose edit,
  model download from an external host, container recreation or SQL was needed.
  The already-fixed Docker frontend was tested as deployed.

| Stage | Result and actual evidence |
|---|---|
| Served assets/CSP | PASS; manifest-selected browser-v2 URL, 37,469,120 bytes, pinned SHA256; same worker URI, 4,332,931 bytes and new hash; no-store worker; immutable model; exact response headers checked |
| Cold microphone recognition | PASS; disposable browser model IDB explicitly cleared/empty; user Start → Loading model → Listening; actual interim words captured; draft empty until final; one model HTTP request |
| Stop/final barrier | PASS; capture-stop → native capture-drained → real flush request → tagged real FinalResult → worker termination → Stopped; Save disabled in Loading/Listening/Processing, enabled only after finalization |
| Save/reload/search | PASS; explicit UI Save, API revision 1 exact text, reload and patient search exact match; medical codes, medications and diagnoses unchanged/empty |
| Warm/offline | PASS; fresh worker uses 21 model-path IDB keys; zero additional model GET; take network offline only AFTER static worker/worklet loading; actual recognition/Stop with zero requests; restore online before Save/reload |
| Missing model | PASS; exact model response intentionally 404 in a fresh profile; safe error, all resources stopped, original manual text preserved, edited manual note saved/reloaded |
| Native permission denied | PASS; real browser permission state denied (not mocked getUserMedia); no worker/model request; manual editing and Save/reload usable |
| Cancel loading | PASS; hold exact model request, Stop while Loading, abort held response, track ended/context closed/worker terminated, original draft unchanged and Save usable; no note POST |
| Patient/session cancellation | PASS; actual partial recognition before confirmed Back to Search → next patient, and separately before confirmed Logout; all native resources closed, next-patient draft stable and unsaved on server, no preview/editor after logout |

The table groups related assertions; the receipt enumerates the **nine scenario
identities** exactly. Cancellation checks observe real partial results and native
termination, not synthetic late-result injection. The separate V2 receipt owns
adversarial late-callback/unit controls and other unsupported-browser guards.

### Actual audio, partials, final text and persistence

Offline macOS `say` Rishi (en_IN), 125 words/minute, then `afconvert`: unchanged
[fixture generator](../../tests/fixtures/vosk-synthetic-audio.mjs). Phrase is the
simple constant **“one two three four five”**, not diagnoses or medications.
48 kHz mono PCM16, **14.548333333 s**, including eight leading/four trailing
seconds of silence. SHA256
`c1018df69920214b0f5300bf81c40af0f99660591dd2f77ba079df12a2f0b459`.
Only Chrome's native fake-device WAV input is synthetic. No runtime encoder,
capture worklet, recognizer, result or app state is replaced. Browser observers
forward original native calls and never inject PCM or recognition messages.

The actual UI partial sequence included `one`, `one two`, `one two three`,
`one two three four`, `one two three four five`. Both final transcripts were
exactly **one two three four five** (23 characters, five tokens), SHA256
`bb1262c1cf29a3e8785c91295f20c7e6b596ac739c3ac6052f2f023f2b3d72b6`.
The test requires nonempty text and all expected tokens in order, records the
actual result, and never fills dictated text into the textarea itself.

| Captured run | Cold | Warm/offline |
|---|---:|---:|
| Start to Listening | 2,130 ms | 907 ms |
| Stop through final/released checks | 219 ms | 130 ms |
| Native captured frames = adapter-delivered frames | 451,584 = 451,584 | 483,328 = 483,328 |
| Model requests | 1 | 0 additional |
| Saved synthetic patient | VOSK-20442510f462 | VOSK-1e7b36253630 |
| Saved date/revision | 2026-09-22 / 1 | 2026-09-22 / 1 |

Both notes were verified by authenticated API readback and a reload followed by
UI patient search. No auto-save or generated medical codes/medications/conditions.
The final repeat independently saved the same phrase for **VOSK-16d4a64816d0**
and **VOSK-ccd8e68b6509**, revision 1; cold/warm readiness 2,083/910 ms, Stop
209/203 ms, exact frame equality 452,608/485,632 respectively.

All checked tracks ended, contexts closed, workers terminated exactly once and
worklet ports closed/disconnected. Cache observation enumerates keys only:
`/vosk`, 21 keys under the browser-v2 model namespace, no audio/transcript keys.
Warm recognition explicitly sets browser offline **after** Listening; no cold
offline boot, offline page reload or offline Save claim is made. The network is
restored before explicit Save; API failure is not suppressed.

### Network, served policy and safety

Each final run: **212 browser requests, 6 worker requests, 3 worklet requests,
9 browser API writes** (four logins, four explicit notes, one logout). Three
model requests include one successful cold load, one deliberately missing model
404 and one held/canceled request. Warm recognition itself requests no model.
**Zero external requests, audio uploads, unexpected writes/requests, page errors,
console warnings/errors, unexpected HTTP errors or failed requests.** One expected
404 is counted separately, not hidden. Offline window: requests/writes/model/
external all **zero**. Counts exclude Node's loopback asset/header and fixture API
probes; no probe uses a non-loopback URL or follows redirects.

Each complete run creates **four unique synthetic accounts, six unique patients,
four notes**, via the real API only. Earlier failed/interrupted-run fixtures remain
in this isolated project; nothing was reset, swept, dropped or overwritten.
No provider credentials, secrets file, production data or real microphone used.
No PCM/audio POST, audio recording, trace, video, auth header/token/password dump
or persistent authenticated browser profile is retained. Generated audio remains
in private temporary directories outside Git. Registration is existing local
development capability, not approval of production identity provisioning.

HTML, manifest, model and emitted AudioWorklet responses retain `script-src
'self'`; `unsafe-eval` is present **only** on the exact standalone worker response.
All checked policies include `worker-src 'self'` and `connect-src 'self'`; runtime
CSP violations **zero**. Actual non-inline worklet is
<http://localhost:5173/assets/dictationCapture.worklet-BFvot1Sa.js>, SHA256
`6dc4a3c02b3eeded13a9c62bd6556540d60a23bd6821a1141203c467f1c195f7`.
No blob/data worklet or global CSP relaxation was used.
Model/worker digests are the exact V1 handoff below. Licenses, attribution, locked
distribution and scoped UUID pins remain unchanged; first-TLS-acquisition trust
is not a publisher signature. General-model review warning remains visible.

### Original screenshot hashes — STALE / superseded

The following hashes describe the **lost original 07:01 capture**, NOT the current
files at these paths. Its original no-capture repeat preserved them at that time;
the later evaluator incident above supersedes that claim for today's bytes.
Original screenshots carried synthetic-only captions and were visually reviewed.
These retained links are historical, **not current acceptance proof**.

| Screenshot | SHA256 |
|---|---|
| [Listening with actual interim](screenshots/vosk-01-listening.png) | `950fc442884d08025915613cced0ed2e7dd612b90d139ca204905ad4fb18bcdd` |
| [Saved/reloaded actual final](screenshots/vosk-02-saved.png) | `8609ccf7b042bfd4aa0bee8df8f00b6216b98ac339dcca3f5e85b8089dab5812` |
| [Native permission denial/manual draft](screenshots/vosk-03-permission-denied.png) | `ad4f271accbb52f077c6cc774ce18bdc030690312d0a65f877258113954b2a97` |

### Failure chronology and ownership

- Original **06:26 V3 real-engine FAIL** remains below. V1 proved and corrected
  archive directory permissions/immutable URL versioning; no V3 runtime workaround.
- First resumed run **06:55:45** recognized the actual phrase and passed the native
  barrier, but strict diagnostics caught one **test observer** page error. An
  unauthenticated no-audio probe reproduced `getUserMedia` access on Playwright's
  initial insecure `about:blank`. Observer now skips only that blank document;
  real app diagnostics remain strict. Failed local receipt retained.
- Next attempt was **interrupted, not passed**: the old helper looked for a search
  input while still on the patient editor. Source/UI inspection confirmed the
  existing Back to Search button was required. Corrected only QA navigation,
  added bounded action/whole-run timeouts and safe stage progress. No application
  navigation guard was removed, mocked or changed. No complete receipt was emitted
  for that interruption; it is not included in pass counts.
- **06:59:01** all nine stages passed. Added explicit API checks that medications,
  diagnoses and cumulative codes remain empty; final **07:01** capture and **07:02**
  no-capture repeat then passed all nine again. The dynamic no-audio startup
  diagnostic independently reached ready/WASM/model true with six `40755` dirs.
- No application defect remains observed in the requested V3 synthetic flow.
  Any future gate failure must stop and be handed to the source/runtime owner;
  tests must not substitute speech results or weaken safety guards.

### Services preserved and remaining gates

All **77 protected files** (frontend/backend source, public assets/notices,
preparers, package/lock/config/Docker/Compose files and original audio fixture)
were hash-identical before/after QA. Aggregate SHA256
`ce73915d64e1a83aaaaaa346694e2481702ef685b150c8dbd9c898d6418bb961`.
Only V3 QA/settings/spec/config, this receipt/screenshots and the dictation guide
were edited. No full-source build or dependency operation was performed.

| Left RUNNING, healthy | Container | URL/port |
|---|---|---|
| Frontend | b28d8334fda0 | <http://localhost:5173> |
| Backend | 5e899f519a39 | <http://localhost:5001/ready> (200) |
| Project PostgreSQL | ec70e7877747 | 127.0.0.1:55440 |

IDs/start times remained 06:38:22.970022178Z / 06:23:04.211701752Z /
06:22:58.45202743Z respectively, zero restarts. Host PostgreSQL PID **1797** on
**5432** untouched. Model/worker assets retained. No shutdown requested/performed.
Independent V3/runtime-config evaluation and MAIN's full regression are pending.
Physical microphone/real speaker, clinical accuracy, other accents/noise,
medication/dose safety and production readiness remain **unverified**.

## Historical V1 handoff at 06:45 (before the V3 resume above)

- Current model URL: <http://localhost:5173/models/vosk-model-small-en-in-0.4-browser-v2.tar.gz>;
  **37,469,120 bytes**, SHA256
  `3bbe45dc4a1efcf4d316067697ed0f250dc348750a17e54038482dbcc512ca16`.
- Worker remains <http://localhost:5173/vosk/vosk-browser-0.0.8.worker.js>, no-store;
  **4,332,931 bytes**, SHA256
  `97e41235ef1de0deb14154259248a0931c77aabba7507b369862bfa6a9fff842`.
- Do **not** replace the retired immutable v1 URL with new bytes. It now returns
  404/no-store; v2 also gets a distinct URL-derived model cache namespace. MAIN/V3
  must update their owned harness constant (prefer reading the manifest).
- V1 ran the existing V3 startup diagnostic with only URL/output name retargeted
  **in memory**, under a 150-second parent deadline: `ready`, WASM true/model true,
  dirs `40755`, source files `100644`. Original diagnostic and failure evidence
  remain unchanged; new output is ignored
  `test-results/vosk-browser/startup-diagnostic-browser-v2.json`.
- V1's separate [runtime check](../../tests/vosk-runtime-browser-check.mjs) passed
  five real-engine controls. Its audio came only from the existing V3 offline WAV
  generator; it fed synthetic PCM directly, not native microphone/UI capture.
  No API writes, human microphone, screenshots or saved-note claims were made.
- Only frontend was rebuilt/recreated (`--no-deps`): current **b28d8334fda0** healthy
  at 5173. Backend **5e899f519a39** / 5001 and PostgreSQL **ec70e7877747** / 55440
  remain healthy with unchanged start times and zero restarts. Host PostgreSQL
  PID1797 / 5432 is untouched. The service table below is the **historical** handoff.

## Historical V3 receipt — unchanged failure chronology

## Environment and isolated startup

- Date: 2026-09-22 UTC. First real-browser attempt: 06:26:03.714–06:26:14.596.
- Docker Engine 28.5.1; project `medapp-vosk-local`; a new project network and
  `medapp-vosk-local_postgres_data` volume were created. No existing container or
  database was stopped, reset, or used.
- Existing host PostgreSQL PID 1797 remains on loopback port 5432, untouched.
- The only Compose change is the PostgreSQL host mapping
  `127.0.0.1:${POSTGRES_HOST_PORT:-5432}:5432`. Its default remains 5432.
- Started with `POSTGRES_HOST_PORT=55440 SEED_DATABASE=false docker compose
  --project-name medapp-vosk-local up --build -d --wait`.
- Both application images built successfully. The frontend build actually ran its
  Python checksum-pinned HTTPS model download/repack and worker preparation step;
  generated host assets are excluded by the existing Docker ignore rules.
- Installed Google Chrome 153.0.8010.52, headless temporary profile; macOS 13.
  Node **22.23.2 explicitly selected**. The initial shell actually resolved Node
  20.20.0; neither browser harness was run under that unsupported host version.
- Real nginx frontend and real Express/PostgreSQL API, not Vite or mock servers.
  Readiness returned 200. AI capability was false; local-development registration
  capability was true. Registration is existing development behavior, not an
  approved identity-provisioning or MFA control.

### Left running for the user

| Service | Container ID | Endpoint | State at handoff |
|---|---|---|---|
| frontend | `23a2f83513fc` | <http://localhost:5173> | healthy |
| backend | `5e899f519a39` | <http://localhost:5001> | healthy |
| PostgreSQL | `ec70e7877747` | `127.0.0.1:55440` → container 5432 | healthy |

These are synthetic-data local-development services, not a production deployment.
No secrets file, external provider credentials, production database, or real
microphone was read or used. One generated synthetic QA account/patient remains
in the new isolated database; no note was saved by the failed attempt.

## Real-engine attempt (not injected recognition)

Harness: [tests/vosk-browser-qa.mjs](../../tests/vosk-browser-qa.mjs).
Offline fixture: [tests/fixtures/vosk-synthetic-audio.mjs](../../tests/fixtures/vosk-synthetic-audio.mjs).

- The generator uses installed `/usr/bin/say`, voice Rishi (en_IN), 125 words/minute,
  phrase **“one two three four five”**, followed by `/usr/bin/afconvert`.
- Mono signed 16-bit PCM, 48,000 Hz, 14.492458333 seconds including eight seconds
  leading silence and four seconds trailing silence. Generated AIFF/WAV files stay
  in an OS temporary directory, outside Git; no third-party audio is copied.
- WAV SHA-256: `eebf552cf35c90ef294b8e35895531d63331ad1243ec03f308ab6ba92fbd3fdc`.
  Voice/OS changes may change regenerated bytes; this is an observation, not a
  cross-platform golden audio checksum.
- Chrome uses native `--use-fake-device-for-media-stream` and
  `--use-file-for-fake-audio-capture`; microphone permission is explicitly granted.
  The page's secure-context check passed on trusted HTTP localhost. This does not
  assert TLS: loopback HTTP is a browser secure-context exception.
- Actual UI login/patient lookup/Start dictation ran. Cold IDB was asserted empty.
  The app reached **Loading model**, then its safe error path, never Listening.
- Actual `vosk-browser` 0.0.8 worker and embedded WASM were served by nginx.
  No worker, recognizer, result, audio API, or application source was substituted.
- No transcript was produced. Acoustic accuracy, Stop finalization, Save, reload,
  warm cache, permission-negative recovery, navigation cancellation, and stale
  patient/session isolation are **NOT VERIFIED by V3**. The harness stops before
  downstream tests whenever real initialization fails; no unit/mock result is
  substituted for actual recognition.

### Served assets and CSP assertions (passed before startup failure)

| Asset | Bytes | SHA-256 |
|---|---:|---|
| Indian-English model tar.gz | 37,469,037 | `bec97982c2e1013a1d915d5a98b830f6ca24456b92849128b9245e3958bfbd10` |
| Versioned standalone worker | 4,332,909 | `018e3fab82c57bb8fee7ef34b094ed6c0c7be31f2984dbfcdc9355cc07380bc1` |

The complete model response matched the manifest checksum, and the complete
worker response matched the locally generated worker. HTML and model responses
have `script-src 'self'`; **only the exact versioned worker response** has
`script-src 'self' 'unsafe-eval'`. All three have `worker-src 'self'` and
`connect-src 'self'`. No global CSP relaxation was made. An AudioWorklet response
was not requested, so runtime worklet loading is not claimed.

### Count-only browser observations

First attempt: 20 requests; 1 worker; 1 model; 0 worklet; 1 browser API write
(login); 0 audio uploads; 0 external requests; 0 page errors; 0 console
warnings/errors; 0 HTTP errors; 0 failed network requests.

The first harness counted one **unexpected local asset**: the existing HTML's
`/vite.svg` favicon. The harness allowlist was corrected after confirming the
existing [frontend/index.html](../../frontend/index.html) reference. This test
classification error did not cause model startup failure. The initial receipt is
retained unchanged; acceptance was not rerun after the correction. No raw console
streams, request bodies, authorization headers, session storage, audio, automatic
screenshots, traces, or videos are retained in evidence.

## Exact startup failure and owner handoff

Diagnostic: [tests/vosk-browser-startup-diagnostic.mjs](../../tests/vosk-browser-startup-diagnostic.mjs).
It loads the same served worker in a separate temporary Chrome profile and calls
the original `runtime.load()` / `runtime.createRecognizer()` through DevTools
evaluation. This is **diagnosis, not the real UI acceptance test**. It does not
rewrite runtime source or CSP and receives no microphone, audio, auth, or patient
data. It reads model filesystem names/modes only, never file contents.

Observed twice after correcting diagnostic output serialization:

- WASM initialized: **true**.
- Model created: **false**.
- Failure inside original `runtime.load()`:
  **`Failed to sync file system: Error: FS error`**.
- Model root `/vosk/_models_vosk_model_small_en_in_0_4_tar_gz`: mode `40777`.
- Extracted README: mode `100644`, 51 bytes.
- Extracted `am` directory: mode **`40000`** (directory, permission bits `000`).
  Descendant inspection fails; no successful complete model cache is established.
- The actual generated tar has **14 regular-file entries, all mode 0644, and no
  directory entries**. WASM/extraction happen before persistent sync/model creation.

This strongly points to a packaging defect: implicit parent directories created
by the embedded archive extractor are inaccessible. **V1/model-preparation owner
must investigate and fix** [tools/prepare-vosk-model.py](../../tools/prepare-vosk-model.py)
and related owned checksums/tests, likely by explicitly emitting deterministic
0755 parent-directory entries before the regular files. That correction and a
new artifact digest require owner review and a fresh image rebuild. V3 did not
modify the preparer, manifest, generated assets, adapter, hook, NoteEditor,
nginx policy, package manifests, lockfile, or prior E2E framework. The precise
root cause is not claimed proven by an unperformed corrected-archive control.

The first diagnostic's Playwright serialization failed before a useful report;
JSON-scalar output and guarded filesystem inspection corrected the **harness**.
This was not a runtime fix. Subsequent two diagnostics reproduced the actual
filesystem-sync error. Diagnostic output is limited to initialization errors and
public model paths, never clinical content.

## Evidence status and pending work

- No screenshot manifest entries or PNGs were produced: the asserted Listening
  and persisted-note states were never reached. Existing other-track screenshots
  were not touched. **Do not replace requested success evidence with fabricated
  screenshots or screenshots of injected recognition.**
- Safe first receipt: ignored local `test-results/vosk-browser/receipt-2026-09-22T06-26-03.714Z.json`.
  Safe model diagnostic: ignored local `test-results/vosk-browser/startup-diagnostic.json`.
- After V1's correction, rerun the real gate first, then extend it for warm IDB
  (model paths only), missing/failed model fetch, native microphone denial and
  manual-save recovery, cancellation during loading, patient/session changes,
  and Stop's busy/final-tail boundary. Capture 2–4 asserted synthetic screenshots
  with captions and SHA-256 only after genuine recognition succeeds.
- General/accent-specific small-model speech quality is not medical accuracy.
  A five-word synthetic phrase, even perfectly recognized, cannot certify
  medications, doses, dates, noisy microphones, accent coverage, or clinical use.
- Full `npm run verify` remains MAIN's task. No full-suite pass is claimed here.
- **Independent V3 evaluator: PENDING MAIN assignment.** No nested evaluator tool
  is available in this session. This document is implementer evidence only.
