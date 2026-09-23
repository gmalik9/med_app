# V1 — local Vosk assets and runtime

Current status (2026-09-22): **V1 runtime correction and independent reevaluation PASS**.
Real Chrome/WASM cold and warm startup, all extracted source hashes, synthetic
speech and tagged FinalResult, historical-archive failure control, and recovery
passed. The original V1 unit PASS did **not** prove engine startup: V3 subsequently
found a real filesystem failure. Both histories are retained below.
Scoped UUID 11.1.1 override remains unchanged; low-severity npm audit is zero.
**MAIN's final independent rebuild, V3 UI/save gate and full regression are complete.**
This is synthetic functional evidence, not clinical accuracy or production approval.

## Independent acceptance and final MAIN follow-up

The independent V1/V3 evaluator passed **nine asset contracts, 14 then-current
browser guards, 82 focused units, five actual-model controls and one startup
diagnostic**. Actual extraction matched all **14 official source files**, with
six readable `0755` directories; the exact historical mode-000 archive still
failed, and the corrected archive recovered without patching the engine. These
are independently observed results, not a relabeling of the earlier unit-only
PASS. The same evaluator's unrelated V3 screenshot overwrite remains an
**evidence-preservation FAIL**, with no original restoration claimed; see the
[retained incident](vosk-browser.md#current-correction--capture-safety-and-evidence-incident-2026-09-22).

MAIN subsequently reviewed the corrected capture harness, passed **23 guards**,
rebuilt both app images from locked/pinned stages, and passed **nine real-WASM
synthetic-microphone scenarios in one 55.6-second gate**, capture disabled with
zero screenshot/receipt writes. Its **Node 22 / PostgreSQL 17 / UTC full release
gate passed 1,749 distinct cases**; nine asset contracts and 82 speech units are
already included, not additional cases. Both builds/types/lint passed and root
npm audit was zero. [Final counts, parent log hashes and current services](vosk-browser.md#main-final-handoff--2026-09-22)
are authoritative over pending handoffs and old container IDs below. The isolated
local app is **LEFT RUNNING**, all three services healthy; its original project
PostgreSQL and host PostgreSQL were untouched.

Only the Markdown receipt is updated here: no runtime, dependency, model, asset,
test, screenshot or JSON receipt changes; no new build/test/install was performed.
The manual root asset-preparation requirement below still applies outside Docker;
Docker runs both preparers. Python uses the standard library; no pip installation
is claimed. The 36M Indian-English general model, first-HTTPS acquisition trust,
worker-only eval tradeoff, browser-only audio and explicit reviewed-text Save
boundaries remain. Physical microphones, uncontrolled accents and medical-number
accuracy remain unverified. The [historical credential gate is still FAIL](FINAL_VERIFICATION.md#credentialsecurity-gate--still-fail),
not rerun or resolved by this acceptance; [pilot implementation](../decisions/APPROVED_PILOT_SCOPE.md)
and infrastructure acceptance remain pending.

## Runtime correction — actual engine failure and fix

### Verified root cause (not just a tar listing)

V3's 06:26 failure is preserved in [the browser receipt](vosk-browser.md).
The old tar had 14 regular files, no directory entries. The exact installed
vosk-browser 0.0.8 bundle and decoded worker were inspected:

1. `RecognizerWorker.load()` derives its cache path from the model URL, mounts
   `/vosk` as IDBFS, restores persistent storage, downloads/extracts the archive,
   calls `syncFilesystem(false)`, and only then constructs `new Vosk.Model`.
2. Its `downloadAndExtract()` calls the WASM `ArchiveHelper.Extract` with
   `stripFirstComponent=true`. The upstream
   [ArchiveHelper implementation](https://github.com/ccoreilly/vosk-browser/blob/4b8eb257503108d96819854d3984372903c2259e/src/utils.cc)
   uses libarchive `archive_write_disk` with `ARCHIVE_EXTRACT_PERM`, ACL and FFLAGS.
   This immutable source revision corroborates the shipped WASM's observed
   behavior; it is not a claimed reproducible-build attestation for that binary.
3. The exact packaged `IDBFS.getLocalSet()` recursively stats descendants before
   writing IDB. `FS.nodePermissions()` returns errno 2 when the requested access
   bit is absent. The implicit `am` directory becomes mode `40000` (permissions
   `000`), so its child cannot be statted and sync rejects with
   `Failed to sync file system: Error: FS error` before model construction.
4. Controlled real-engine A/B evidence now proves the packaging cause: the same
   new served worker/WASM, under separate empty browser storage partitions, fails
   on the exact historical tar but succeeds on the explicit-directory tar. All
   source file bytes are identical. No FS implementation, permission enforcement,
   `chmod`, error handling, WASM bytes, recognizer or inference result was patched
   or mocked. No second engine defect was observed after this correction.

The [preparer](../../tools/prepare-vosk-model.py) now emits six explicit USTAR
directories, all mode `0755`, size zero: `model/`, `model/am/`, `model/conf/`,
`model/graph/`, `model/ivector/`, `model/graph/phones/`. Ordering is depth then name,
parents before children and **all directories before any file**. The 14 files
remain sorted, mode `0644`, with all bytes unchanged. Metadata remains uid/gid 0,
empty owner/group names, mtime 0, deterministic gzip and USTAR. Existing traversal,
symlink, encryption, duplicate, expansion and bounded-download controls remain;
file/directory-prefix collisions are additionally rejected.

### Cache migration and exact current artifacts

The old URI had one-year immutable HTTP caching. It must **never** be overwritten
with changed packaging. The model name remains `vosk-model-small-en-in-0.4`, Indian
English, official catalog size **36M**. Only the browser packaging is versioned.

| Artifact | Exact bytes | SHA256 |
| --- | ---: | --- |
| Unchanged official ZIP | 37,573,330 | `20663dcac4d5cb783a579c54d98339344a688e4ec6e1b4a4b059fd1235454cc7` |
| **browser-v2 gzip/USTAR** | **37,469,120** | `3bbe45dc4a1efcf4d316067697ed0f250dc348750a17e54038482dbcc512ca16` |
| Updated standalone worker | 4,332,931 | `97e41235ef1de0deb14154259248a0931c77aabba7507b369862bfa6a9fff842` |

- Model: <http://localhost:5173/models/vosk-model-small-en-in-0.4-browser-v2.tar.gz>.
- Worker (same URI, already **no-store**): <http://localhost:5173/vosk/vosk-browser-0.0.8.worker.js>.
- Manifest: <http://localhost:5173/models/manifest.json>.
- New IDB model namespace: `/vosk/_models_vosk_model_small_en_in_0_4_browser_v2_tar_gz`.
  No clearing users' databases, touching notes, or adding cache-query exceptions.
- The retired v1 model URI now explicitly returns **404/no-store**, even if an
  ignored old artifact remains on the host. It is not copied into the image.
- Manifest, adapter `MODEL_URL`, worker fetch allowlist/load argument, exact nginx
  static/cache locations and V1 tests agree on v2. Existing wildcard model ignore
  patterns cover both names; no wider ignore rule was introduced. Worker requests
  still reject other paths, old URI, foreign origins, queries, fragments and
  redirects, and omit credentials. Only the exact worker response permits eval;
  HTML/model/manifest/API policies remain strict. Real 200/206/304 immutable model
  responses, no-store worker/404s and range gzip magic were verified.
- [Manifest provenance](../../frontend/public/models/manifest.json) remains the
  **first trusted HTTPS download**, not an invented publisher-signed digest. The
  new archive digest was computed from that pinned ZIP before updating the manifest.
  Host preparation and fresh Docker-build download/repack matched exactly.

### Actual corrected verification (2026-09-22 UTC)

- Original 27 focused cases retained: adapter **19/19**, prior config/bridge **8/8**.
  Added real tar-extraction regression **1/1**: current total **28/28**, no skips.
  The [Python self-test](../../tests/fixtures/vosk-model-repack-check.py) checks raw
  USTAR headers, directory modes/trailing slashes, parent ordering, deterministic
  gzip, extracted filesystem permissions, file-byte equality and collision rejection.
  Existing 13 archive/source safety assertions also pass. Root release contracts
  **32/32** (includes the nine config cases); scoped lint, source/test noEmit,
  worker syntax and editor diagnostics pass. Audit at low threshold: **zero**;
  package manifests/lock and UUID 11.1.1 override were not changed in this correction.
- V3's [startup diagnostic](../../tests/vosk-browser-startup-diagnostic.mjs) ran
  under an explicit 150-second parent-process deadline. Only its hard-coded model
  URL and output filename were retargeted **in memory**. The V3 file and prior
  failure artifact were not changed. New output: `stage=ready`, `wasmLoaded=true`,
  `modelCreated=true`; all model directories `40755`, all source files `100644`.
  Evidence: ignored `test-results/vosk-browser/startup-diagnostic-browser-v2.json`.
- Owned [real-engine regression](../../tests/vosk-runtime-browser-check.mjs), Node
  **22.23.2**, Chrome **153.0.8010.52**, final run **06:45:22.751–06:45:40.362**:
  **5/5 PASS** with a 180-second process bound and 120-second startup bound:
  1. Fresh IDB, actual bridge `ready`: **1,492 ms** including inspection; six
     readable directories, all 14 runtime-extracted file lengths/SHA256 equal
     the official ZIP; expanded model file bytes **56,700,192**.
  2. Actual partial/final recognition of **“one two three four five”**, then the
     genuine tagged `FinalResult`. Input is PCM from V3's unchanged
     [offline synthetic WAV generator](../../tests/fixtures/vosk-synthetic-audio.mjs),
     not a physical microphone or fake recognizer. 48 kHz mono, 14.548333 seconds,
     SHA256 `c1018df69920214b0f5300bf81c40af0f99660591dd2f77ba079df12a2f0b459`.
     Its temporary WAV path is recorded in the receipt; audio is not committed.
     This direct-PCM runtime test does not replace V3's native capture/UI test.
  3. Fresh worker in the warm context: **596 ms**, identical extracted inventory,
     **no second model HTTP request**. IDB keys: six dirs, 14 source files, one
     engine `extracted.ok` marker; no audio or transcript records.
  4. Separate nonce-labeled context, IDB asserted empty, reconstructed exact old
     tar SHA `bec97982…` substituted only as the archive response: original
     **FS sync exception reproduced**, WASM true/model false, `am=40000`, descendant
     errno 2, permissions enforced. No successful model records persisted. This
     explicitly prevents warm-cache success from masking the old exception.
  5. Remove that negative fixture response, create another unchanged worker in
     the failed context: real v2 model starts successfully with full matching
     inventory. No cache deletion or runtime workaround required.
  Successful positive and negative/recovery contexts each recorded **zero external
  requests, API writes, page errors and console warnings/errors**. The negative
  tar is rebuilt from the pinned ZIP in a private temporary directory and removed;
  it is never installed at either production model URI.
  Receipt: ignored `test-results/vosk-browser/v1-runtime-2026-09-22T06-45-22.751Z.json`.

### Failures retained and scope boundaries at the V1 implementer handoff

- First frontend-only rebuild exited before nginx became healthy: the longer
  versioned cache-map key exceeded nginx's default 64-byte bucket. Explicit
  `map_hash_bucket_size 128` fixed it; the second frontend-only rebuild passed.
- Initial new browser regression at 06:41:18 passed actual startup/speech, then
  incorrectly compared cold tar insertion order against warm IDB key order.
  Sorting diagnostic filesystem names fixed the **test**, not the engine; all
  path/mode/size/hash checks remain. Failed receipt is retained beside both later
  passing runs (06:41:45 and final 06:45:22).
- A later raw-header self-test edit introduced embedded Python indentation drift;
  the suite reported **8/9**, not a pass. Moving that test to the standalone Python
  fixture repaired it; the unchanged assertions reran **9/9** successfully.
- Only `POSTGRES_HOST_PORT=55440 docker compose -p medapp-vosk-local build frontend`
  and `… up -d --no-deps --wait frontend` were used for service changes. No Compose
  file, Dockerfile, backend, database, V2 hook/editor/worklet, package or V3 harness
  was edited. No real microphone, PHI, secrets, provider or external recognizer used.
- At that handoff, frontend **b28d8334fda0**, healthy at 5173, image index
  `sha256:19a89f451382588a4b5b2b28bd06ccf280fdaf59570fafb81f0155ae58ad5ed8`.
  Backend **5e899f519a39**, healthy 5001, started **06:23:04.211701752Z**, restarts 0;
  PostgreSQL **ec70e7877747**, healthy 55440, started **06:22:58.45202743Z**, restarts 0.
  Their IDs/start times were unchanged. Host PostgreSQL PID **1797**, port **5432**,
  remains untouched. Services are left running for the user.
- The handoff required MAIN/V3 to retarget their owned QA model constant to the
  manifest's new URL before full UI/capture/save acceptance. Independent V1
  reevaluation was then pending; no nested evaluator was available to V1. That
  implementer run did not claim full `verify`, UI acceptance, saved-note or
  screenshot success. Later independent/MAIN results are recorded above; medical
  accuracy is still unverified.

## Historical V1 implementation and dependency receipt (before runtime correction)

The remainder records the initial implementation and UUID follow-up. Its old
artifact hashes and pending-engine statements describe that earlier point in time,
not the current browser-v2 runtime. They are preserved rather than relabeled as
real-engine successes.

## Scope and exact interface

V1 changed only the exact frontend dependency/root lock, new runtime adapter,
asset preparation tools/public attribution, frontend Docker/nginx configuration,
model/runtime artifact ignore entries, its own tests, and this receipt. No editor,
hook, application/backend/auth/database/Compose/root package-script changes were
made. Existing concurrent changes were preserved. No secrets/environment files,
patient data, provider credentials, or production services were read or used.
No commit/push or shared frontend build was performed.

The dependency follow-up changes only [root overrides](../../package.json), the
[root lock](../../package-lock.json), the existing
[V1 asset/config tests](../../tests/config-vosk-assets.test.mjs), and this receipt.
The runtime generator was executed again, producing byte-identical worker output.
No model source/assets, V2 UI/source/tests, compiler, runtime adapter/generator,
nginx/CSP, Dockerfile, root scripts, or integration inventory changed in this follow-up.

[Adapter](../../frontend/src/services/localVosk.ts) exports the requested interface,
unchanged:

- `LocalRecognition { text: string; final: boolean }`.
- `LocalRecognizer.acceptAudio(buffer: AudioBuffer): void`.
- `LocalRecognizer.flush(): Promise<void>`.
- `LocalRecognizer.dispose(): void`.
- `createLocalRecognizer(sampleRate, onResult, onError, signal?)`.
- Optional `MODEL_NAME`, `MODEL_URL`, and `WORKER_URL` constants.

There is one owned native Worker/model per session. Startup is bounded to 120s;
finalization to 15s. Abort/dispose synchronously calls `Worker.terminate()` and
detaches listeners, even while downloading/initializing. Old-worker events cannot
reach a newer recognizer. Error callbacks contain fixed messages, never upstream
payloads. Invalid sample rates/audio and excessive pending chunks fail closed.

UI handoff: stop/drain the capture graph and pass its last buffer to `acceptAudio`
**before** invoking `flush`; await `flush`, then `dispose`. `flush` is an end-of-session
operation: subsequent audio is ignored, repeated calls share the same promise.
The serialized worker processes all accepted chunks, calls the original 0.0.8
`retrieveFinalResult`, tags that response, and runs the final `onResult` callback
before resolving the promise. An ordinary utterance-final result cannot acknowledge
flush. Empty final text is a valid acknowledgement. Cancellation rejects pending
startup/flush with `AbortError`, without reporting a recognition error.

## Model provenance and format

[Official catalog](https://alphacephei.com/vosk/models), checked 2026-09-22:
`vosk-model-small-en-in-0.4`, **Indian English, 36M, Apache 2.0**. This is the
smallest English recognition model listed there; US English small 0.15 is 40M.
The 13M speaker-identification model is not an English transcription model.
This is accent-specific/general-purpose, not a medical model. Review every draft.

| Artifact | Exact bytes | SHA256 |
| --- | ---: | --- |
| Official source ZIP | 37,573,330 | `20663dcac4d5cb783a579c54d98339344a688e4ec6e1b4a4b059fd1235454cc7` |
| Generated gzip/USTAR model | 37,469,037 | `bec97982c2e1013a1d915d5a98b830f6ca24456b92849128b9245e3958bfbd10` |
| Installed vosk-browser 0.0.8 distribution | — | `29504515526e974f4cb053cf08811c4de5fb2a74007c0a5a957db50eaa8d5d0c` |
| Generated standalone worker | — | `018e3fab82c57bb8fee7ef34b094ed6c0c7be31f2984dbfcdc9355cc07380bc1` |

The official ZIP was actually downloaded from
https://alphacephei.com/vosk/models/vosk-model-small-en-in-0.4.zip and hashed locally.
**Trust begins at that first verified-TLS download; this is not a publisher-signed
digest.** Subsequent downloads and repacks must match both pinned hashes/lengths.
[Manifest](../../frontend/public/models/manifest.json) records this provenance.

The package's actual README/source requires **tar.gz, not ZIP**. The tool preserves
all source file bytes, including README, under one `model/` root, which the runtime
strips on extraction. Expanded file bytes total 56,700,192. Ordering, timestamps,
uid/gid, permissions, USTAR format and gzip header are deterministic. Archive entries
are streamed, never extracted onto the build filesystem. The tool rejects traversal,
absolute/backslash paths, duplicate members, symlinks/special files, encryption,
excessive counts/sizes/ratios and source checksum/length mismatch. HTTPS download
allows no redirects, has three bounded attempts, 30s socket and 180s per-attempt
elapsed checks, and rejects bytes beyond the pinned length. A blocking read can
extend an elapsed deadline by up to its socket timeout. Atomic replacement prevents
a failed download/repack from installing a partial asset.

Public [NOTICE](../../frontend/public/models/NOTICE.txt) and
[Apache license](../../frontend/public/models/LICENSE-APACHE-2.0.txt) accompany the
model. The official ZIP has a README but no separate LICENSE/NOTICE; license evidence
is the official catalog. The npm package metadata declares Apache-2.0, not MIT.

## Runtime source inspection and security tradeoff

The exact installed 0.0.8 source was inspected, including its base64-embedded worker:

- `Model.terminate()` merely posts `terminate`; it cannot guarantee immediate
  cancellation during loading. The adapter instead owns a native worker directly.
- Normal results and `FinalResult` responses both have `event: "result"`; the new
  serialized bridge tags only the response to finalization, avoiding timer guesses
  or misidentifying a previously queued final.
- `Logger.error()` ignores log level. A worker-only prelude silences console methods
  before runtime initialization; log level is also set to -2. Error/rejection handlers
  suppress default reporting and send only a fixed error event. The application-wide
  console is not modified.
- WASM is already embedded in the npm distribution. The build tool extracts the
  package worker, retains its notices/WASM, removes its automatic instantiation, and
  adds the serialized bridge around the original methods. A narrow source-guarded
  change skips the unnecessary data-URL fetch and decodes the embedded WASM locally.
- The generated worker's fetch wrapper accepts **only** the exact same-origin model
  path; it omits credentials/referrer and rejects redirects, foreign origins, other
  paths, query strings and fragments. No runtime CDN, cloud recognition, Web Speech
  API, audio upload, telemetry, or transcript persistence was added. IndexedDB is
  the library's model-only IDBFS cache; PCM and recognition text stay in memory.

**Proven CSP exception:** this exact Emscripten build uses both
`createNamedFunction` → `new Function("body", ...)` and `craftInvokerFunction` →
`new_(Function, args1)` during initialization/binding. `'wasm-unsafe-eval'` alone
does not authorize these JavaScript operations. Rebuilding/forking Emscripten to
remove dynamic execution was outside this exact-package integration.

Rather than weaken the application document for the package's default Blob worker,
the tool creates a standalone same-origin worker. nginx scopes `script-src 'self'
'unsafe-eval'` to **that exact worker response only**. HTML, API responses and all
other assets retain `script-src 'self'`. The document adds only `worker-src 'self'`;
`blob:` is unnecessary for this path and is not added to worker policy. Worker
response policies govern that worker independently of the document's script policy.
There is no need to add `'wasm-unsafe-eval'` alongside the broader worker-only
exception. This is an explicit remaining security tradeoff, not an eval-free runtime.

Immutable cache headers apply only to 200/206/304 responses for the exact pinned
model. Model errors/missing assets, worker scripts, HTML and PHI APIs remain
`no-store`. Missing model/worker assets return 404, never SPA fallback HTML. Existing
non-root image pins, typed build, security headers and disabled raw access logs remain.

## Preparation and focused checks

From the repository root, with Node 22, installed locked dependencies, and Python
3.11+ (standard library only):

```sh
python3 tools/prepare-vosk-model.py
node tools/prepare-vosk-runtime.mjs
node --test tests/config-vosk-assets.test.mjs
npm test --workspace=frontend -- tests/vosk-runtime.test.ts
npm run typecheck --workspace=frontend
npx tsc --noEmit --target ES2022 --lib ES2022,DOM --module ESNext --moduleResolution bundler --types vitest/globals --skipLibCheck frontend/tests/vosk-runtime.test.ts
npx eslint frontend/src/services/localVosk.ts frontend/tests/vosk-runtime.test.ts tools/prepare-vosk-runtime.mjs tests/config-vosk-assets.test.mjs
```

Run both preparation commands **before** a local Vite dev/build/preview. They are
not new npm hooks/root scripts. The frontend Dockerfile explicitly copies only
these two tools, installs build-stage Python/CA certificates, downloads/verifies/
repacks the model, generates the worker, then runs the existing typed frontend
build. Python/build caches are not copied into the runtime image.

The source ZIP cache, generated tar.gz, and generated worker are ignored by both
Git and Docker context. They are generated inside the Docker build, not committed
or sent from the host context. Model manifest/notice/license remain tracked inputs.

After UI integration is ready, the coordinator can build the complete frontend
image with the existing root context (not run by V1):

```sh
docker build -f frontend/Dockerfile -t medapp-vosk-frontend .
```

## Actual V1 evidence

- `npm install --workspace=frontend --save-exact vosk-browser@0.0.8 --ignore-scripts`:
  compared lock entries before/after; added only vosk-browser 0.0.8 and uuid 9.0.0;
  **no existing version/integrity changes or removals**.
- Asset/source/worker-bridge suite: **8/8 PASS**, no skips. Includes real generated
  worker evaluation with only expensive inference methods mocked; delayed audio
  proves the final cannot overtake it. Python negative suite asserts 13 archive/
  source failure conditions. This does not claim real WASM recognition coverage.
- Adapter suite: **19/19 PASS**, no skips; synthetic Float32 buffers only. It covers
  scaling/copy/transfer, partial/final events, queued-result vs flush acknowledgement,
  empty final, repeated flush, abort before/during load, stale generation, startup/
  flush deadlines, sanitization, worker errors, rate validation, backpressure, and
  cancellation during final delivery. Repeated focused runs passed.
- Frontend source noEmit, explicit new-test noEmit, scoped lint, generated worker
  `node --check`, and editor diagnostics: **PASS**. The first standalone test typecheck
  caught an incomplete synthetic AudioBuffer cast; the fixture was made structurally
  complete and the same command rerun successfully. No application code was changed
  to accommodate a fixture failure.
- Model repacked twice on macOS with matching pinned output. Independently ran
  `docker run --rm` with the unchanged pinned Node Alpine base, read-only tooling/
  manifest mounts, fresh HTTPS download and Python 3.14.7: **identical 37,469,037-byte
  output and SHA256**. No frontend build or database was involved.
- Isolated pinned nginx image, public-assets/config read-only mounts, loopback-only
  random port, unused `backend` hostname mapped to loopback: **PASS** actual `nginx -t`,
  UID101, model HEAD200/length/immutable, range206/gzip magic/immutable, worker200 with
  worker-only eval CSP and no-store, public manifest strict document CSP/no-store,
  missing model/worker404 and unavailable synthetic API proxy no-store/strict CSP.
  Its container was stopped in `finally`; both isolated probes used `--rm`.
- **Historical baseline — npm audit --audit-level=low: FAIL (2 moderate findings)**.
  Reproduced before this follow-up. Exact dependency uuid
  9.0.0 is deprecated and covered by
  [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq)
  (missing buffer bounds checks in v3/v5/v6 with supplied buffer); vosk-browser is
  reported as its dependent. npm reports no fix for this exact dependency chain.
  The generated worker path does not import uuid (recognizer ID is session-local),
  but that does **not** erase the audit finding or constitute a formal reachability
  assessment. The initial implementation added no override, suppression, audit
  downgrade or unrelated upgrade; the authorized follow-up below now fixes the
  installed dependency without erasing this failed baseline.

## Dependency follow-up — verified 2026-09-22

### Minimal fix and compatibility boundary

The root manifest now declares only `overrides: { "vosk-browser": { "uuid": "11.1.1" } }`.
This is scoped to Vosk, not a global UUID override. The frontend still depends on
exact `vosk-browser` 0.0.8; its unmodified upstream metadata still requires UUID
9.0.0. The [advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq) identifies
11.1.1 as a fixed version for the v3/v5/v6 caller-buffer bounds defect. No audit
suppression, severity relaxation, package removal, hidden ZIP dependency, upstream
fork or runtime rewrite was used.

UUID 9 and 11.1.1 both provide named `v4` through Node and browser CJS/ESM exports.
Their physical Node/CJS paths differ; callers should use the public entry point,
not old deep paths. The installed 11.1.1 modules were actually exercised through
all four declared entry points: zero-argument `v4()`, deterministic random bytes,
valid caller buffer/offset, and the retained v1/v3/v4/v5/parse/stringify/validate/
version exports. These module probes ran under Node, including the browser entry
modules; they are not browser-engine or real-recognition tests. For v3/v5/v6,
undersized buffers, negative offsets and overflowing
offsets now throw `RangeError` without modifying caller storage. Valid buffer
outputs are also checked. No compatibility wrapper is needed for Vosk's observed
`v4()` usage. This is a deliberate major-version override tested for this surface,
not a claim of complete UUID 9-to-11 API compatibility or upstream certification.

**Scanner fix is not a prebuilt-bundle rewrite.** The published distribution still
inlines an old UUID implementation in its **outer Model wrapper**, including `v4`
and the shared v3/v5 generator without the new buffer checks. Inspection found no
separate authoritative embedded UUID version stamp; the package declares 9.0.0
and the inlined v4 matches the inspected UUID 9 implementation. npm overrides do
not rebuild that distribution. The outer wrapper's recognizer IDs call `v4()`
without buffer arguments, but that observation alone is not a general reachability
or safety proof for the package. Importing/shipping the outer wrapper in future
requires another review; audit zero must not be interpreted as patching its bytes.

The application adapter instead uses only the extracted standalone worker, which
contains **no UUID implementation or import** and uses the literal session-local
recognizer ID `local`. Its source, embedded worker and generated worker hashes are
unchanged. Extended tests assert both the old inlined outer-wrapper code and the
absence of UUID in the generated worker; they also reject introducing a UUID/Vosk
package import into the adapter. This documents the deployed path separately from
the actual installed dependency remediation; it does not dismiss the old finding.

No UUID code is redistributed in the extracted worker, so an additional UUID
third-party NOTICE is not required for this artifact. The installed UUID package's
MIT license remains intact and is checked. The worker's embedded Microsoft helper
copyright/permission notice is retained and asserted; the existing public
[NOTICE](../../frontend/public/models/NOTICE.txt) and
[Apache license](../../frontend/public/models/LICENSE-APACHE-2.0.txt) are unchanged.
If the outer wrapper is ever distributed, include/review its UUID and other
third-party license notices as well. Document `script-src 'self'` and the exact
worker-only eval exception are unchanged; there is no global CSP weakening.

### Actual commands, failures and passing evidence

Node **22.23.2**, npm **10.8.2**; final audit/asset receipt at
**2026-09-22T05:49:25.261Z**:

- Initial `npm install --ignore-scripts` after the override returned success but
  retained UUID 9 and the two findings. The before/after assertion correctly failed;
  `npm ls uuid vosk-browser` then exited nonzero for invalid UUID 9. This was **not**
  accepted as a fix. Targeted `npm update uuid --ignore-scripts` resolved 11.1.1.
- Compared every lock entry in memory before/after the targeted update: **only
  the UUID entry changed; all 587 other package entries and top-level lock metadata
  were identical**. No additions/removals or unrelated version/integrity churn.
  TypeScript stays **6.0.2**. npm lock v3 does not store root `overrides`; the test
  guards the root declaration plus the installed/locked effective UUID resolution,
  while retaining the upstream Vosk `uuid: "9.0.0"` dependency declaration.
- `npm ci --ignore-scripts --dry-run`: **PASS** install-plan/manifest-lock validation;
  no cold reinstall or fresh application image is claimed. Lock bytes stayed unchanged.
  `npm ls uuid vosk-browser typescript`: **PASS**, UUID 11.1.1 explicitly overridden,
  Vosk 0.0.8 and the existing TypeScript 6.0.2 resolution retained.
- Actual `node tools/prepare-vosk-runtime.mjs`: **PASS**, output SHA256
  `018e3fab82c57bb8fee7ef34b094ed6c0c7be31f2984dbfcdc9355cc07380bc1`, identical to
  the baseline and rechecked from the generated file. `node --check` on that output:
  **PASS**. Embedded worker SHA256 remains
  `7ba6b482f49ff3d49290b85f4ca13d5c6a5787b237cac1c6d15129668d36f529`.
- Existing adapter suite: **19/19 PASS**; existing asset/config suite extended in
  place: **8/8 PASS**, with no removed cases, skips or retries. Worker bridge tests
  evaluate actual generated code but still mock expensive inference methods.
- Root `npm run test:release`: **31/31 PASS** (includes those eight, not 31 more).
  Existing manifest/dependency declarations, default-test/release script separation,
  database refusal guards, and integration inventory checks all pass unchanged.
  `npm run test:inventory`: unchanged **2 unit / 11 required integration suites**;
  no database connection or integration run performed.
- Root `npm run typecheck` (both workspaces, noEmit), explicit adapter-test noEmit,
  scoped V1 lint, and editor diagnostics: **PASS**.
- Root `npm audit --audit-level=low`: **PASS, zero vulnerabilities**; repeated with
  `--json --audit-level=low`, exit **0**, all info/low/moderate/high/critical counts
  **0**, empty findings. This fixes the earlier two findings in the installed npm
  tree; it is not a full source/binary security scan or application release approval.
- The before/after hash map of **101 protected files** (all frontend/backend source
  and tests, model assets, preparation tools, workspace manifests, nginx/Dockerfile,
  and existing release runner/inventory/manifest contracts) remained identical:
  aggregate SHA256 `e08926ae6c03005eb5fd4bed6720c29442b5851b84fd6b5f4f74237dc533d2c4`.
  No model preparation/download, V2 edits, build, browser/microphone recognition,
  provider access, secrets/PHI reads, database operation or Git action was performed.

Lock SHA256 before: `9735e055a9ba96da5da2d903d54905c9d943c93f377745e0e5e81a05d42c6111`.
After: `40686307b7db0520d6a348568e0f940aab6c89f68940d73d7529db5d5abaa867`.
These are execution receipts, not signatures or replacements for independent review.

## Coordinator / independent evaluator checklist

1. Independently repeat the unchanged low-severity audit gate and scoped override/
   lock/UUID compatibility checks. Review the worker-only eval tradeoff and the
   distinction between the now-fixed installed UUID and unchanged outer bundle.
   Preserve both historical failures; do not infer application acceptance from audit zero.
2. Run real browser worker/WASM/model startup behind the actual nginx CSP, not only
   Vite, using synthetic silence/speech. Assert result/partial/final and no console
   or external requests; inspect IndexedDB for model-only files. Test a cold cache,
   warm cache, canceled startup, failed model fetch, and late flush cancellation.
3. Run the complete image build/application locally after UI changes settle. V1's
   isolated base-image/asset probes are not a full image or clinical-note E2E claim.
4. Verify UI capture draining, stale patient/session suppression, explicit text
   review and save/reload/conflict behavior. V1 did not edit the UI or auth lifecycle.
5. Independently repeat the focused checks. No delegated evaluator was available
   within this V1 tool set; main must assign the independent review.
