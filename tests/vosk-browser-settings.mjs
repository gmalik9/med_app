// Only the already-running synthetic Docker project is eligible. No dotenv.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const worker = '/vosk/vosk-browser-0.0.8.worker.js';
export const expectedModel = Object.freeze({
  name: 'vosk-model-small-en-in-0.4', packagingVersion: 'browser-v2',
  assetBytes: 37469120, assetSha256: '3bbe45dc4a1efcf4d316067697ed0f250dc348750a17e54038482dbcc512ca16',
});
export const expectedWorkerSha = '97e41235ef1de0deb14154259248a0931c77aabba7507b369862bfa6a9fff842';
export const phrase = 'one two three four five';
export function evidencePath(value) {
  // Deliberately narrow write locations, never a source/assets folder or the
  // existing proof directory itself. Errors must not echo untrusted input.
  assert.ok(typeof value === 'string' && value.length > 0 && value.length <= 512
    && /^[a-zA-Z0-9_./ -]+$/.test(value) && !value.split('/').some(p => p === '..' || p === '.'), 'Unsafe evidence directory');
  const output = resolve(root, value);
  const bases = [resolve(root, 'test-results/vosk-browser'), resolve(root, 'docs/verification/screenshots'),
    '/tmp', '/private/tmp', tmpdir()];
  const base = bases.find(base => {
    const child = relative(base, output);
    return child && !child.startsWith('..') && !isAbsolute(child);
  });
  assert.ok(base, 'Unsafe evidence directory');
  return { output, base };
}
export function settings(env = process.env, options = {}) {
  assert.ok(env.VOSK_LOCAL_QA === 'medapp-vosk-local:55440', 'Explicit isolated-project opt-in required');
  const origin = options.origin ?? env.VOSK_QA_ORIGIN ?? 'http://localhost:5173';
  // Exact serialization prevents credentials, redirects, paths, alternate ports,
  // DNS suffixes and ambiguous loopback spellings. Never include input in errors.
  assert.ok(['http://localhost:5173', 'http://127.0.0.1:5173'].includes(origin), 'Only approved loopback origin allowed');
  assert.ok(env.VOSK_CAPTURE_SCREENSHOTS === undefined || ['true', 'false'].includes(env.VOSK_CAPTURE_SCREENSHOTS), 'Invalid capture setting');
  assert.ok(options.capture === undefined || typeof options.capture === 'boolean', 'Invalid capture option');
  // Explicit API false is authoritative, even with an inherited true env flag.
  // The retired VOSK_QA_CAPTURE variable has no effect.
  const capture = options.capture ?? (env.VOSK_CAPTURE_SCREENSHOTS === 'true');
  const selected = options.evidenceDir ?? env.VOSK_EVIDENCE_DIR;
  const previewOutput = resolve(root, 'test-results/vosk-browser');
  const output = !capture && selected === previewOutput ? previewOutput : selected !== undefined ? evidencePath(selected).output : capture
    ? resolve(tmpdir(), `medapp-vosk-capture-${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}`)
    : previewOutput;
  return { origin, output, capture };
}
export function selectModel(manifest) {
  for (const [key, value] of Object.entries(expectedModel)) assert.equal(manifest[key], value, `Selected model ${key} differs`);
  assert.equal(manifest.runtimePackage, 'vosk-browser@0.0.8');
  assert.equal(manifest.license, 'Apache-2.0');
  assert.equal(manifest.assetUrl, `/models/${manifest.name}-${manifest.packagingVersion}.tar.gz`);
  return manifest.assetUrl;
}
