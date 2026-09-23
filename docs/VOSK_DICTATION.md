# Local Vosk dictation — development guide

**Scope: local synthetic development, not clinical use.** Real Chrome fake-device
audio → Vosk/WASM → Stop → explicit Save/API readback/reload recognized
**“one two three four five”** cold and warm. MAIN independently rebuilt the final
Docker app and passed the corrected default browser gate: **nine scenarios,
one Playwright gate, 55.6 seconds**, no screenshots or receipt writes. The full
Node 22 / PostgreSQL 17 / UTC release regression also **PASSED: 1,749 distinct
cases**, plus separately run **23 capture guards** and the **nine actual-speech
scenarios**. The nine asset contracts and 82 speech units are already included
in the release total; do not add them again. Both builds, types and lint passed;
root npm audit reported zero vulnerabilities. See [final results and log hashes](verification/vosk-browser.md#main-final-handoff--2026-09-22).

The earlier independent evaluator passed functional checks but overwrote three
original proof PNGs: its **evidence-preservation FAIL remains historical**, and
the old hashes are **stale, not restored**. Capture is now explicit opt-in into a
fresh directory. Default → fresh capture → default gates passed **9/9 each**,
preserving existing/new proof; MAIN reviewed the correction and the fresh actual
Listening/Saved states. [Canonical proof and incident history](verification/vosk-browser.md)
remain separate. **Physical microphones, uncontrolled speakers/accents and medical
numbers/clinical accuracy remain unverified.**

## Local deployment

The isolated project `medapp-vosk-local` is **LEFT RUNNING, all three services
healthy**, for synthetic-data local development:

- App: <http://localhost:5173>
- Backend: <http://localhost:5001>; readiness: <http://localhost:5001/ready>
- New isolated PostgreSQL: loopback port **55440**. Existing host PostgreSQL on
  port **5432** is untouched and must not be used for these tests.
- `POSTGRES_HOST_PORT=55440` overrides only the Compose host database port;
  omitting it preserves the existing 5432 default.
- `SEED_DATABASE=false` is explicit. Keep this synthetic-only project/volume
   separate from other databases. The QA harness must never load private environment
   or secret files.

**New deployment prerequisite:** Compose now requires privately supplied
`POSTGRES_PASSWORD`, `DATABASE_URL`, `JWT_SECRET` and `JWT_REFRESH_SECRET`; port
and seeding settings alone are insufficient. Inject all four through the process
environment, or privately populate an ignored root .env file that Compose loads
automatically when invoked from the repository root. The URL must use user `medapp`,
hostname `postgres`, port `5432`, database `med_app_db`, and the same password as
`POSTGRES_PASSWORD`, percent-encoded in the URL. Use distinct random signing keys
of at least 32 characters. Never echo, publish or stage these values; tracked
environment examples contain placeholders only. See [SETUP.md](../SETUP.md).

**Do not rerun the launch below on the current running project for this correction.**
Its existing containers, persisted credentials and login remain unchanged; no
restart, reset or credential rotation is required or performed. For a new isolated
deployment only, after privately provisioning those inputs, build/start from the
repository root with Docker running:

```sh
POSTGRES_HOST_PORT=55440 SEED_DATABASE=false docker compose -p medapp-vosk-local up --build -d --wait
```

The earlier MAIN build/start result used locked dependencies and pinned image
stages; it predates the current required-credential-input contract and is not a
rerun of these corrected instructions. Frontend/backend were recreated then; project
PostgreSQL remained unchanged. Only the separate regression database container was
stopped afterward, not this app. This documentation finalization performs no build,
restart or shutdown. No app source is mounted, so later app/model changes require
an image rebuild. [Final service state](verification/vosk-browser.md#local-run-state--left-running)
records the read-only container check.

**Assets before a non-Docker build/dev run:** use Node 22 (at least 22.12), Python 3,
and install root workspace dependencies with `npm ci`. There is currently **no root
npm asset-preparation helper or automatic prebuild/predev hook**. Run these manual
preparation commands before `npm run build` or `npm run dev`:

```sh
python3 tools/prepare-vosk-model.py
node tools/prepare-vosk-runtime.mjs
```

The [frontend Docker build](../frontend/Dockerfile) already runs both preparers.
A bare local npm build can succeed without ignored generated assets and later
serve model/worker **404s**. Verify the [model manifest](../frontend/public/models/manifest.json)
and its selected archive and worker URLs return 200; do not treat JS build success
as model availability. No package/script changes are part of this correction.

Local registration is enabled by the existing development Compose configuration.
This is **not** an approved production registration, MFA, clinic pilot, or access
control implementation. External AI is disabled. Use only synthetic accounts and
records; no real patient audio or notes have been used for this verification.
The [approved synthetic-pilot design](decisions/APPROVED_PILOT_SCOPE.md) still needs
MFA, clinic isolation and other implementation/infrastructure acceptance; the
local development database is not that pilot deployment. The historical
[credential/security gate remains FAIL](verification/FINAL_VERIFICATION.md#credentialsecurity-gate--still-fail),
not rerun or resolved by these tests or npm audit. No credential testing/rotation,
GitHub action, history rewrite or scanner suppression was performed here.

## Model and privacy design

The user-selected smallest English download is **vosk-model-small-en-in-0.4**,
approximately **36 MB** upstream, English (India), not an American-English or
medical-specialist model. Indian-accent selection does not validate general
medical or accent accuracy. The official
ZIP is 37,573,330 bytes; the corrected **browser-v2** runtime archive is
**37,469,120 bytes**, SHA256
`3bbe45dc4a1efcf4d316067697ed0f250dc348750a17e54038482dbcc512ca16`.
Its immutable URL is
<http://localhost:5173/models/vosk-model-small-en-in-0.4-browser-v2.tar.gz>.
Explicit `0755` directory entries fixed the real IDBFS sync failure; the retired
v1 immutable URL must never be overwritten and now returns 404/no-store.
Public model/license metadata lives in
[frontend/public/models/manifest.json](../frontend/public/models/manifest.json)
and [frontend/public/models/NOTICE.txt](../frontend/public/models/NOTICE.txt).

The frontend image build downloads only the pinned official HTTPS model URL and
checks its checksum. This pin represents first TLS acquisition, not a publisher
signature. Worker and embedded WASM are extracted from locked `vosk-browser`
**0.0.8** locally; neither model nor WASM is fetched from an external provider at
runtime. Generated model/worker files are ignored by Git and regenerated during
the image build. The first Start downloads/prepares the local model; allow extra
time and memory. Upstream's approximately **300 MB runtime memory** guidance for
small models is an estimate, **not a measurement of this browser/app**.

The verified synthetic runtime flow is local mono audio → AudioWorklet → same-origin worker
→ Vosk → interim preview → final draft. No audio recording or server audio upload
is part of that flow. Only explicit **Save Note** sends reviewed text through the
normal notes API. Browser IndexedDB held 21 model-path keys (six directories,
14 files, extraction marker); no transcript/audio keys were present. A new warm
worker restored the model with **zero additional model HTTP requests**. The
observer reads keys only, not IDB values. V1 separately verifies extracted bytes.

After worker/worklet/model assets loaded and Listening began, recognition and Stop also
passed with the browser network offline and **zero network requests**. The test
then restored connectivity before Save. **Offline Save, offline page reload and
offline cold start are not supported/verified claims**: the API needs a network
connection and the standalone worker response intentionally remains no-store.
Only the browser was made offline; the backend/database were **not disconnected**.

nginx keeps document `script-src 'self'` and `worker-src 'self'`. The legacy
Emscripten runtime needs `unsafe-eval`, allowed only on the exact versioned worker
response—not on HTML, application scripts, or AudioWorklet. Do not globally relax
CSP to work around model initialization errors.

## Using local dictation

**Quick use:** In current Chrome, select the intended default microphone in the
OS/browser settings, open the local app and a synthetic patient's note, click
**Start dictation**, allow microphone access and wait for **Listening**. Speak
synthetic text, click **Stop dictation**, wait for Processing to finish, review
and correct the entire draft, then explicitly click **Save Note** and reload to
check it. This is the usage path, not a claim that a physical microphone was tested.

1. Open <http://localhost:5173> in current Chrome with **AudioWorklet support**.
   AudioWorklet is required; there is no ScriptProcessor fallback. HTTP localhost
   is a Chrome secure-context exception, **not TLS**; non-loopback deployments
   require HTTPS and separate approval/testing.
2. Register a **synthetic-only** development account or log into an existing one.
   Open/create the intended synthetic patient and date. Select **Start dictation**
   and allow the browser microphone prompt. Permission and local model preparation
   precede Listening; nothing auto-starts. Local registration is not approved pilot MFA.
3. Wait for **Listening**. Interims are previews, not saved note text.
4. Select **Stop dictation** and wait through **Processing** for the final capture
   buffer and recognizer result. Save remains disabled until processing ends.
5. Review and correct every word before **Save Note**, then reload to verify the
   intended patient's saved note. Never rely on speech recognition for medication,
   dose, date, or clinical correctness.

Each listening session is limited to **five minutes**; review/Stop before the limit.
An unfinished preview can be discarded on safety-limit/cancellation paths. No
cloud speech, external audio API, audio upload or automatic note Save is used.

Missing-model and native permission-denial tests verified that existing text is
preserved, typing remains usable, and a reviewed manual note can be saved and
reloaded. Canceling loading, switching patients with confirmed discard, and
logging out during real recognition stopped resources and prevented stale text
from reaching the next patient. Do not troubleshoot with real patient data.
No medications, diagnoses or medical codes are inferred or filled automatically.
The general-model review warning remains visible. Separately scoped UI/native
tests are recorded in [verification/vosk-ui.md](verification/vosk-ui.md).

## Reproducible synthetic QA

Use Node 22 and installed Chrome (macOS 13 cannot use the current bundled
Playwright Chromium). The isolated Docker app must already be running.

The dedicated [Playwright config](../tests/vosk-browser.config.mjs) targets the
already-running app only: one worker, no retries, no web server/build/database
lifecycle/teardown. **Default: no screenshots, receipts, traces, videos or output
snapshots.** Assertions still run. Temporary synthetic audio and Playwright's
OS-temporary runner bookkeeping are not committed evidence. Default gate:

```sh
VOSK_LOCAL_QA=medapp-vosk-local:55440 node node_modules/@playwright/test/cli.js test --config tests/vosk-browser.config.mjs
```

Fresh evidence (change the versioned leaf if it already exists):

```sh
VOSK_LOCAL_QA=medapp-vosk-local:55440 VOSK_CAPTURE_SCREENSHOTS=true VOSK_EVIDENCE_DIR=docs/verification/screenshots/vosk-20260922-final node node_modules/@playwright/test/cli.js test --config tests/vosk-browser.config.mjs
```

The [standalone CLI](../tests/vosk-browser-qa.mjs) uses the same environment flags;
replace the Playwright invocation with `node tests/vosk-browser-qa.mjs`.
Only exact `VOSK_CAPTURE_SCREENSHOTS=true` enables CLI capture. The retired
`VOSK_QA_CAPTURE` is ignored and retired `--capture` is rejected. API callers can
use `runQa({ capture: true, evidenceDir: '/tmp/new-proof-directory' })`; explicit
`capture: false` overrides inherited environment opt-in. No double opt-in is needed.

`VOSK_EVIDENCE_DIR` is the **exact fresh output directory**, serialized through
Playwright metadata into its worker. Allowed: new descendants of workspace
test-results/vosk-browser or docs/verification/screenshots, or the OS temporary
directories; parent must exist. Traversal, URLs, source/public paths, symlink
parents and existing target directories/files fail closed. No selection while
capturing uses a unique OS-temp directory. Playwright cleanup uses a separate
unique temp directory, never evidence. CLI `--output` overrides are rejected before
Playwright cleanup (including on previews). Screenshot bytes stay in memory until all
nine real scenarios pass; then three PNGs and a dated SHA256 receipt are exclusively
created. A preview/failure never overwrites a prior receipt or emits screenshots.

`VOSK_QA_ORIGIN` optionally selects exactly `http://localhost:5173` (default) or
`http://127.0.0.1:5173`. Credentials, paths, queries, fragments, alternate ports
and non-loopback origins fail before any API/browser operation. Run the focused
[23 guards](../tests/vosk-browser-config.test.mjs) explicitly:
`node --test tests/vosk-browser-config.test.mjs`. These are **not automatically
included** by root `test:release` (its filename glob is config-*.test.mjs); the
dedicated browser gate is likewise not the root E2E gate. Root manifests were
intentionally not changed. Nine asset contracts can additionally be run with
`node --test tests/config-vosk-assets.test.mjs` (these ARE root-release classified).
Focused correction checks: **23 guards + nine assets + 82 focused units**, all
passed; three correction Playwright gates each execute the same nine scenarios,
no retries or skips. MAIN subsequently passed all 23 guards and independently ran
the corrected default gate, with `capture=false`, `screenshotCount=0` and
`receiptWritten=false`. Its full `npm run verify:release` passed **32 root
contracts + 47 backend units + 726 frontend + 936 integration + eight baseline
browser cases = 1,749**, including the nine assets and 82 speech units above.
All 11 required integration suites passed with zero skips. Separate focused/V1/V2
reruns overlap this coverage and must not be added as distinct release cases.
Current screenshot paths/full hashes and run details are in the
[canonical evidence table](verification/vosk-browser.md#canonical-fresh-proof--current-correction-run).
The project opt-in is **not automatic proof of database identity**: first verify
the Compose project/55440 mapping. Each completed run creates four unique
synthetic accounts, six unique patients and four explicit notes through the API.
Earlier fixtures are retained, never overwritten or deleted. No SQL, volume
reset, migration, drop or cleanup is performed by the harness.

The served manifest supplies the model URL. Strict version/length/digest and
runtime pins reject stale or unexpected assets; tests never accept the retired
URL or silently change expectations. The [startup diagnostic](../tests/vosk-browser-startup-diagnostic.mjs)
also uses this selector and timestamped output, preserving old failure evidence.

The fixture uses offline macOS `say`/`afconvert` and the installed Rishi Indian-
English voice. It never uses a human microphone, recorded third-party speaker,
external TTS, or a fabricated recognizer response. Audio stays in the OS temporary
directory. Chrome receives a fake-device WAV; the deployed UI/worker/WASM/model
remain real. Transparent observers forward native constructor/method calls and
record synthetic partial/final text, status changes, resource closure and frame
counts; they do not substitute audio, encoder, worker, recognizer or results.
Only negative tests intercept the exact model response (404 or held/canceled).
The denied-permission screen is **test-configured native denial**, with real
permission-state/resource counters and unmocked getUserMedia—not a human declining
a real microphone prompt. All captured speech is generated, with **no PHI**.
Temporary browser profiles are closed after testing; the entire app is left
running. Evidence excludes auth headers/tokens, passwords, PCM, raw console
streams, traces and videos. Screenshots contain an explicit SYNTHETIC test
caption, never an invented product feature. Generated WAV/AIFF files remain in
private OS temporary directories and are not committed or uploaded.

The gate stops on real initialization/recognition errors; it never substitutes
a mocked recognizer. Default/failure stdout includes only stage/count/location
diagnostics, not tokens, raw exceptions or note text. No failure snapshots are
written. The [preservation check](../tests/vosk-browser-preservation-check.mjs)
explicitly runs default → fresh capture → default and hashes existing/new proof.
The independent evaluator incident and original bootstrap filesystem failure
remain documented, not relabeled as success: V1 resolved archive-created mode-000
directories using explicit parent-first 0755 entries and a new immutable v2 URL.

Apache-2.0 attribution, model/worker notices, locked distribution/UUID dependency
pins and first-HTTPS-acquisition provenance are unchanged. The existing scoped
`vosk-browser` UUID override is **11.1.1**; the recorded npm audit is **0 vulnerabilities**.
It does not rewrite the published outer bundle (the extracted worker has no UUID).
See [V1 provenance and resolved bootstrap history](verification/vosk-runtime.md).
General/accent-specific
synthetic speech is not evidence for medication/dose accuracy, noisy or physical
microphones, other speakers or production readiness. `clinicalAccuracyVerified`
and `realSpeakerVerified` remain **false**. MAIN's independent correction review,
rebuild and full regression are **complete**, separately attributed in the
[final browser note](verification/vosk-browser.md#main-final-handoff--2026-09-22).
This docs-only finalization checked links/hashes and read-only service state; it
did not rerun tests or fabricate an additional independent evaluator.
