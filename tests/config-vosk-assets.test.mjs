import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { buildWorker, SOURCE_SHA256 } from '../tools/prepare-vosk-runtime.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(resolve(root, path), 'utf8');
const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const runtimePackage = require.resolve('vosk-browser/package.json');
const source = readFileSync(resolve(dirname(runtimePackage), 'dist/vosk.js'), 'utf8');
const manifest = JSON.parse(read('frontend/public/models/manifest.json'));

test('exact runtime dependency, package integrity and model provenance are pinned', async () => {
  const frontend = JSON.parse(read('frontend/package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(frontend.dependencies['vosk-browser'], '0.0.8');
  assert.equal(lock.packages['node_modules/vosk-browser'].version, '0.0.8');
  // npm lock v3 does not serialize overrides: guard the root declaration AND
  // the effective locked/installed resolution, without changing upstream's spec.
  assert.deepEqual(JSON.parse(read('package.json')).overrides, { 'vosk-browser': { uuid: '11.1.1' } });
  const runtimeRequire = createRequire(runtimePackage);
  const runtimeMetadata = JSON.parse(readFileSync(runtimePackage, 'utf8'));
  assert.deepEqual(runtimeMetadata.dependencies, { uuid: '9.0.0' });
  assert.deepEqual(lock.packages['node_modules/vosk-browser'].dependencies, runtimeMetadata.dependencies);
  const uuidPackage = runtimeRequire.resolve('uuid/package.json');
  const uuidRoot = dirname(uuidPackage);
  const uuid = JSON.parse(readFileSync(uuidPackage, 'utf8'));
  const uuidLock = lock.packages[relative(root, uuidRoot).split('\\').join('/')];
  assert.equal(uuid.version, '11.1.1');
  assert.equal(uuidLock.version, uuid.version);
  assert.equal(uuidLock.resolved, 'https://registry.npmjs.org/uuid/-/uuid-11.1.1.tgz');
  assert.equal(uuidLock.integrity, 'sha512-vIYxrBCC/N/K+Js3qSN88go7kIfNPssr/hHCesKCQNAjmgvYS2oqr69kIufEG+O4+PfezOH4EbIeHCfFov8ZgQ==');
  assert.equal(uuid.license, 'MIT');
  assert.match(readFileSync(resolve(uuidRoot, 'LICENSE.md'), 'utf8'), /Permission is hereby granted/);
  assert.equal(lock.packages['node_modules/typescript'].version, '6.0.2');

  // 9 -> 11 retains named v4 in all four public Node/browser entry points.
  // Test the actual installed modules, not a mocked UUID or just its version.
  const entry = uuid.exports['.'];
  assert.equal(runtimeRequire.resolve('uuid'), resolve(uuidRoot, entry.node.require));
  for (const api of [runtimeRequire('uuid'),
    await import(pathToFileURL(resolve(uuidRoot, entry.node.import)).href),
    await import(pathToFileURL(resolve(uuidRoot, entry.browser.import)).href),
    runtimeRequire(resolve(uuidRoot, entry.browser.require))]) {
    for (const name of ['parse', 'stringify', 'v1', 'v3', 'v4', 'v5', 'validate', 'version']) {
      assert.equal(typeof api[name], 'function', name);
    }
    assert.equal(api.NIL, '00000000-0000-0000-0000-000000000000');
    assert.match(api.v4(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(api.v4({ random: new Uint8Array(16) }), '00000000-0000-4000-8000-000000000000');
    const valid = new Uint8Array(20).fill(0xaa);
    assert.equal(api.v4({ random: new Uint8Array(16) }, valid, 4), valid);
    assert.deepEqual([...valid.slice(0, 4)], [0xaa, 0xaa, 0xaa, 0xaa]);
    assert.equal(api.stringify(valid, 4), '00000000-0000-4000-8000-000000000000');
    // GHSA-w5hq-g745-h8pq: undersized, negative and overflowing output ranges
    // must throw BEFORE partially overwriting caller storage (v3/v5/v6).
    for (const generate of [
      (buf, offset) => api.v3('synthetic', api.v3.DNS, buf, offset),
      (buf, offset) => api.v5('synthetic', api.v5.DNS, buf, offset),
      (buf, offset) => api.v6({}, buf, offset),
    ]) {
      const valid = new Uint8Array(20).fill(0xaa);
      assert.equal(generate(valid, 4), valid);
      assert.ok(api.validate(api.stringify(valid, 4)));
      for (const [length, offset] of [[8, 4], [16, -1], [16, 1]]) {
        const buf = new Uint8Array(length).fill(0xaa);
        assert.throws(() => generate(buf, offset), RangeError);
        assert.ok(buf.every(byte => byte === 0xaa));
      }
    }
  }
  assert.equal(JSON.parse(readFileSync(runtimePackage, 'utf8')).license, 'Apache-2.0');
  assert.equal(createHash('sha256').update(source).digest('hex'), SOURCE_SHA256);
  assert.equal(manifest.sourceUrl, 'https://alphacephei.com/vosk/models/vosk-model-small-en-in-0.4.zip');
  assert.equal(manifest.sourceBytes, 37573330);
  assert.equal(manifest.sourceSha256, '20663dcac4d5cb783a579c54d98339344a688e4ec6e1b4a4b059fd1235454cc7');
  assert.equal(manifest.packagingVersion, 'browser-v2');
  assert.equal(manifest.assetUrl, '/models/vosk-model-small-en-in-0.4-browser-v2.tar.gz');
  assert.equal(manifest.assetBytes, 37469120);
  assert.equal(manifest.assetSha256, '3bbe45dc4a1efcf4d316067697ed0f250dc348750a17e54038482dbcc512ca16');
  assert.ok(read('frontend/src/services/localVosk.ts').includes(`export const MODEL_URL = '${manifest.assetUrl}'`));
  assert.match(manifest.sourceTrust, /not a publisher-signed digest/);
  assert.match(read('frontend/public/models/NOTICE.txt'), /Ciaran O'Reilly/);
  assert.match(read('frontend/public/models/LICENSE-APACHE-2.0.txt'), /END OF TERMS AND CONDITIONS/);
});

test('generated worker is deterministic and rejects even single-byte package drift', () => {
  assert.equal(buildWorker(source), buildWorker(source));
  assert.throws(() => buildWorker(source + '\n'), /Unexpected vosk-browser source/);
  const generated = buildWorker(source);
  assert.equal(createHash('sha256').update(generated).digest('hex'), '97e41235ef1de0deb14154259248a0931c77aabba7507b369862bfa6a9fff842');
  assert.ok(generated.includes(`runtime.load('${manifest.assetUrl}')`));
  const encoded = source.match(/var WorkerFactory = createBase64WorkerFactory\('([^']+)'/)[1];
  const embedded = Buffer.from(encoded, 'base64').toString('utf8');
  assert.equal(createHash('sha256').update(embedded).digest('hex'), '7ba6b482f49ff3d49290b85f4ca13d5c6a5787b237cac1c6d15129668d36f529');
  // An npm override does NOT rebuild the published bundle. Its outer wrapper
  // still inlines the old UUID implementation; the extracted worker does not.
  const wrapper = source.replace(encoded, '');
  assert.match(wrapper, /function v35\(name, version, hashfunc\)/);
  assert.match(wrapper, /function v4\(options, buf, offset\)/);
  assert.match(wrapper, /this\.id = v4\(\);/);
  assert.match(wrapper, /v35\('v3', 0x30, md5\)/);
  assert.match(wrapper, /v35\('v5', 0x50, sha1\)/);
  assert.doesNotMatch(generated, /\buuid\b|\brandomUUID\b|function v(?:4|35)\(/i);
  assert.match(generated, /recognizerId: 'local'/);
  assert.doesNotMatch(read('frontend/src/services/localVosk.ts'), /(?:from\s*|import\s*\(|require\s*\()\s*['"](?:uuid|vosk-browser)(?:\/|['"])/);
  // Preserve the worker's actual embedded third-party permission notice.
  assert.match(generated, /Copyright \(c\) Microsoft Corporation/);
  assert.match(generated, /Permission to use, copy, modify, and\/or distribute this software/);
  assert.match(generated, /new Function\("body"/); // Proven Emscripten eval requirement.
  assert.match(generated, /new_\(Function,args1\)/);
  assert.match(generated, /!wasmBinary&&!isDataURI\(wasmBinaryFile\)/);
  assert.doesNotMatch(generated, /new RecognizerWorker\(\);/);
  assert.match(generated, /flushId: message.flushId/);
});

function harness() {
  const listeners = new Map();
  const events = [];
  const logs = [];
  const requests = [];
  const self = {
    location: new URL('https://local.invalid/vosk/vosk-browser-0.0.8.worker.js'),
    addEventListener(type, fn) { listeners.set(type, fn); },
    postMessage(message) { events.push(message); },
    fetch: (...args) => { requests.push(args); return Promise.resolve({ ok: true }); },
  };
  const console = Object.fromEntries(['log', 'info', 'warn', 'error', 'debug', 'trace', 'assert'].map(key => [key, value => logs.push(value)]));
  const sandbox = { self, console, URL };
  runInNewContext(buildWorker(source), sandbox, { timeout: 5_000 });
  const prototype = sandbox.worker_code.RecognizerWorker.prototype;
  // Real packaged class/loader is evaluated; only expensive inference/model
  // methods are replaced. The production serialized bridge runs unchanged.
  prototype.load = async () => {};
  prototype.createRecognizer = async () => {};
  const send = data => listeners.get('message')({ data });
  const settle = () => new Promise(resolve => setImmediate(resolve));
  return { self, events, logs, requests, prototype, send, settle, listeners };
}

test('actual generated bridge serializes pending audio before the tagged FinalResult reply', async () => {
  const h = harness();
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  let chunks = 0;
  h.prototype.processAudioChunk = async () => {
    chunks++;
    if (chunks === 1) await waiting;
    return { event: chunks === 1 ? 'result' : 'partialresult', result: chunks === 1 ? { text: 'synthetic segment' } : { partial: 'synthetic tail' } };
  };
  let finals = 0;
  h.prototype.retrieveFinalResult = async () => { finals++; return { event: 'result', result: { text: 'synthetic tail' } }; };
  h.send({ action: 'init', sampleRate: 16_000 }); await h.settle();
  h.send({ action: 'audioChunk', data: new Float32Array(16) });
  h.send({ action: 'audioChunk', data: new Float32Array(16) });
  h.send({ action: 'retrieveFinalResult', flushId: 1 }); await h.settle();
  assert.equal(finals, 0);
  assert.equal(h.events.length, 1);
  release(); await h.settle();
  assert.deepEqual(h.events.map(event => event.event), ['ready', 'result', 'partialresult', 'result']);
  assert.equal(h.events.at(-1).flushId, 1);
  assert.equal(h.events.at(-1).result.text, 'synthetic tail');
  assert.equal(finals, 1);
  assert.equal(h.logs.length, 0);
});

test('worker errors/logging are sanitized and failed queues stop processing audio', async () => {
  const h = harness();
  h.prototype.load = async () => { throw new Error('synthetic sensitive error'); };
  h.send({ action: 'init', sampleRate: 16_000 }); await h.settle();
  h.send({ action: 'audioChunk', data: new Float32Array(16) }); await h.settle();
  assert.equal(h.events.length, 1);
  assert.equal(JSON.stringify(h.events), '[{"event":"error"}]');
  assert.equal(h.logs.length, 0);
  let prevented = false;
  h.listeners.get('error')({ preventDefault() { prevented = true; }, message: 'synthetic payload' });
  assert.equal(prevented, true);
  assert.equal(JSON.stringify(h.events.at(-1)), '{"event":"error"}');
});

test('worker network wrapper accepts only the public same-origin model without cookies or redirects', async () => {
  const h = harness();
  await h.self.fetch('https://local.invalid' + manifest.assetUrl);
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0][1].credentials, 'omit');
  assert.equal(h.requests[0][1].redirect, 'error');
  for (const target of ['https://outside.invalid/model.tar.gz', '/api/notes', '/models/vosk-model-small-en-in-0.4.tar.gz', manifest.assetUrl + '?text=synthetic', manifest.assetUrl + '#fragment', 'data:text/plain,x']) {
    await assert.rejects(h.self.fetch(target), /Blocked non-model request/);
  }
  assert.equal(h.requests.length, 1);
});

test('Docker pins, typed build, narrow COPY and secret exclusions are retained', () => {
  const dockerfile = read('frontend/Dockerfile');
  assert.deepEqual([...dockerfile.matchAll(/^FROM (\S+)/gm)].map(match => match[1]), [
    'node:22-alpine@sha256:b6f26b36c8ff49624cfdac716b8ea1138d606df02586a77d364bb5536a634f85',
    'nginxinc/nginx-unprivileged:stable-alpine@sha256:daa17b944bac2b578e962da4c61ad72a59233b3c63abea17113acaf4e6b9aea4',
  ]);
  assert.match(dockerfile, /COPY tools\/prepare-vosk-model\.py tools\/prepare-vosk-runtime\.mjs \.\/tools\//);
  assert.match(dockerfile, /python3 tools\/prepare-vosk-model\.py/);
  assert.match(dockerfile, /node tools\/prepare-vosk-runtime\.mjs/);
  assert.match(dockerfile, /RUN npm run build --workspace=frontend/);
  assert.match(JSON.parse(read('frontend/package.json')).scripts.build, /tsc --noEmit/);
  assert.doesNotMatch(dockerfile, /COPY \. /);
  for (const pattern of ['.cache/vosk', 'frontend/public/models/*.zip', 'frontend/public/models/*.tar.gz', 'frontend/public/vosk/*.worker.js']) {
    assert.ok(read('.gitignore').includes(pattern)); assert.ok(read('.dockerignore').includes(pattern));
  }
  for (const pattern of ['**/.env', '**/.env.*', 'secrets', 'secrets.env']) assert.ok(read('.dockerignore').split('\n').includes(pattern));
});

test('nginx scopes eval to the standalone worker and immutable cache to the model, not PHI', () => {
  const nginx = read('frontend/nginx.conf');
  assert.match(nginx, /map_hash_bucket_size 128;/);
  assert.match(nginx, /map \$uri \$vosk_script_policy\s*\{\s*default "'self'";\s*\/vosk\/vosk-browser-0\.0\.8\.worker\.js "'self' 'unsafe-eval'";\s*\}/);
  assert.match(nginx, /worker-src 'self';/);
  assert.match(nginx, /connect-src 'self';/);
  assert.match(nginx, /default "no-store";/);
  assert.match(nginx, /map "\$status:\$uri" \$vosk_cache_control/);
  for (const status of [200, 206, 304]) {
    assert.ok(nginx.includes(`"${status}:${manifest.assetUrl}" "public, max-age=31536000, immutable";`));
  }
  assert.ok(nginx.includes(`location = ${manifest.assetUrl} { try_files $uri =404; }`));
  assert.ok(nginx.includes('location = /models/vosk-model-small-en-in-0.4.tar.gz { return 404; }'));
  assert.doesNotMatch(nginx, /"\d+:\/models\/vosk-model-small-en-in-0\.4\.tar\.gz"/);
  assert.doesNotMatch(nginx, /"404:[^"]+" "public/);
  assert.match(nginx, /add_header Cache-Control \$vosk_cache_control always;/);
  assert.match(nginx, /location \/models\/ \{ try_files \$uri =404; \}/);
  assert.match(nginx, /location \/vosk\/ \{ try_files \$uri =404; \}/);
  assert.match(nginx, /location \/api\/ \{\s*proxy_pass http:\/\/backend:5000;/);
  assert.match(nginx, /access_log off;/);
  assert.match(nginx, /error_log \/dev\/stderr crit;/);
});

test('model tooling rejects traversal, links, encryption, duplicates, expansion bombs and source tampering', () => {
  const script = `
import importlib.util, io, json, pathlib, stat, tempfile, zipfile
spec = importlib.util.spec_from_file_location('prepare', 'tools/prepare-vosk-model.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
name = 'vosk-model-small-en-in-0.4'
class Archive:
    def __init__(self, entries): self.entries = entries
    def infolist(self): return self.entries
def entry(path, size=1, kind=stat.S_IFREG, flags=0):
    z = zipfile.ZipInfo(path); z.file_size=size; z.compress_size=1
    z.external_attr=(kind | 0o644)<<16; z.flag_bits=flags; return z
bad = [
    [entry(name+'/../outside')], [entry('/absolute')], [entry(name+'/a/../../outside')],
    [entry(name+'/a\\\\b')], [entry(name+'/link', kind=stat.S_IFLNK)],
    [entry(name+'/pipe', kind=stat.S_IFIFO)], [entry(name+'/encrypted', flags=1)],
    [entry(name+'/same'), entry(name+'/same')], [entry(name+'/bomb', size=m.MAX_MEMBER+1)],
    [entry(name+'/ratio', size=1001)], [entry(name+'/file'+str(i)) for i in range(257)],
]
for entries in bad:
    try: m.validate_members(Archive(entries), name)
    except ValueError: pass
    else: raise AssertionError('unsafe archive accepted')
with tempfile.TemporaryDirectory() as tmp:
    source=pathlib.Path(tmp)/'bad.zip'; source.write_bytes(b'synthetic')
    manifest=json.loads(pathlib.Path('frontend/public/models/manifest.json').read_text())
    for length in (manifest['sourceBytes'], source.stat().st_size):
        manifest['sourceBytes']=length
        try: m.verify_source(source, manifest)
        except ValueError: pass
        else: raise AssertionError('tampered source accepted')
print('13 safety assertions passed')
`;
  const result = spawnSync('python3', ['-B', '-c', script], { cwd: root, encoding: 'utf8', timeout: 15_000 });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /13 safety assertions passed/);
});

test('actual repack/extraction preserves bytes and emits explicit 0755 parent-first USTAR directories', () => {
  const result = spawnSync('python3', ['-B', 'tests/fixtures/vosk-model-repack-check.py'], {
    cwd: root, encoding: 'utf8', timeout: 15_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /directory ordering, extraction permissions/);
});
