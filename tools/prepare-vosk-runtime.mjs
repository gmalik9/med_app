// Extract the locked package's embedded worker/WASM; do not fetch runtime code.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../frontend/package.json', import.meta.url));
export const SOURCE_SHA256 = '29504515526e974f4cb053cf08811c4de5fb2a74007c0a5a957db50eaa8d5d0c';

export function buildWorker(source) {
  if (createHash('sha256').update(source).digest('hex') !== SOURCE_SHA256) {
    throw new Error('Unexpected vosk-browser source; review runtime bridge before updating');
  }
  const encoded = source.match(/var WorkerFactory = createBase64WorkerFactory\('([^']+)'/);
  if (!encoded) throw new Error('Missing embedded worker');
  let worker = Buffer.from(encoded[1], 'base64').toString('utf8');
  function replaceOnce(before, after) {
    if (worker.split(before).length !== 2) throw new Error('Unexpected Vosk worker structure');
    worker = worker.replace(before, after);
  }
  replaceOnce('new RecognizerWorker();', '// Instantiated by the serialized local bridge below.');
  // Embedded WASM is decoded locally, not fetched as a data: URL (which would
  // violate connect-src self and cause an unnecessary CSP report).
  replaceOnce('if(!wasmBinary&&(ENVIRONMENT_IS_WORKER))',
    'if(!wasmBinary&&!isDataURI(wasmBinaryFile)&&(ENVIRONMENT_IS_WORKER))');
  const prelude = `// Generated from vosk-browser 0.0.8 (Apache-2.0); see /models/NOTICE.txt.
// Modified: worker-only logging suppression, local WASM decode, serialized bridge.
for (const method of ['log', 'info', 'warn', 'error', 'debug', 'trace', 'assert']) {
  console[method] = () => {};
}
const reportFailure = () => self.postMessage({ event: 'error' });
self.addEventListener('error', event => { event.preventDefault(); reportFailure(); });
self.addEventListener('unhandledrejection', event => { event.preventDefault(); reportFailure(); });
const nativeFetch = self.fetch.bind(self);
self.fetch = (input) => {
  const url = new URL(String(input), self.location.href);
  if (url.origin !== self.location.origin || url.pathname !== '/models/vosk-model-small-en-in-0.4-browser-v2.tar.gz'
      || url.search || url.hash) return Promise.reject(new Error('Blocked non-model request'));
  return nativeFetch(url.href, { credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' });
};
`;
  const bridge = `
// All calls use the original 0.0.8 RecognizerWorker methods, serialized so
// FinalResult cannot overtake queued audio. Only model files touch IDBFS.
const runtime = new worker_code.RecognizerWorker();
runtime.logger.setLogLevel(-2);
let queue = Promise.resolve();
let initialized = false;
let failed = false;
let sampleRate;
runtime.handleMessage = ({ data: message }) => {
  queue = queue.then(async () => {
    if (failed) return;
    if (message.action === 'init' && !initialized) {
      sampleRate = message.sampleRate;
      await runtime.load('/models/vosk-model-small-en-in-0.4-browser-v2.tar.gz');
      await runtime.createRecognizer({ recognizerId: 'local', sampleRate });
      initialized = true;
      self.postMessage({ event: 'ready' });
    } else if (message.action === 'audioChunk' && initialized) {
      const result = await runtime.processAudioChunk({ recognizerId: 'local', data: message.data, sampleRate });
      self.postMessage(result);
    } else if (message.action === 'retrieveFinalResult' && initialized) {
      const result = await runtime.retrieveFinalResult('local');
      self.postMessage({ ...result, flushId: message.flushId });
    } else {
      throw new Error('Invalid local recognition state');
    }
  }).catch(() => { failed = true; reportFailure(); });
};
`;
  return prelude + worker + bridge;
}

export async function prepareRuntime() {
  const packagePath = require.resolve('vosk-browser/package.json');
  const metadata = JSON.parse(await readFile(packagePath, 'utf8'));
  if (metadata.version !== '0.0.8' || metadata.license !== 'Apache-2.0') {
    throw new Error('Unexpected Vosk runtime version/license');
  }
  const output = resolve(root, 'frontend/public/vosk/vosk-browser-0.0.8.worker.js');
  const source = await readFile(resolve(dirname(packagePath), 'dist/vosk.js'), 'utf8');
  const worker = buildWorker(source);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, worker);
  console.log(JSON.stringify({ worker: '/vosk/vosk-browser-0.0.8.worker.js',
    sha256: createHash('sha256').update(worker).digest('hex') }));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await prepareRuntime();
}
