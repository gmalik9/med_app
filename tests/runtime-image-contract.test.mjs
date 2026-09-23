// Explicit image test: MEDAPP_RUNTIME_IMAGE must identify a locally built backend.
// Not part of config-* tests: source-only release tests must not silently skip an image gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const image = process.env.MEDAPP_RUNTIME_IMAGE;
assert.match(image || '', /^medapp-hardening-backend:[a-z0-9][a-z0-9_.-]*$/, 'set MEDAPP_RUNTIME_IMAGE to the explicitly built local backend tag');
const cli = process.env.CONTAINER_CLI || 'docker';
const run = args => spawnSync(cli, args, { encoding: 'utf8', timeout: 120000, maxBuffer: 2 * 1024 * 1024 });
const isolated = ['run', '--rm', '--pull=never', '--network=none', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges'];
const success = result => {
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
};

test('built image is nonroot, offline, package-manager/dev-dependency free, and retains native/OCR runtime assets', () => {
  const [metadata] = JSON.parse(success(run(['image', 'inspect', image])));
  assert.equal(metadata.Config.User, 'node');
  assert.deepEqual(metadata.Config.Entrypoint, ['docker-entrypoint.sh']);
  assert.deepEqual(metadata.Config.Cmd, ['node', 'backend/dist/index.js']);
  assert.match(metadata.Config.Healthcheck.Test.join(' '), /node -e .*\/ready/);
  assert.ok(metadata.Config.Env.includes('NODE_ENV=production'));

  // Entire probe runs inside the final image, without mounts, network or writes.
  const probe = async () => {
    const assert = require('node:assert/strict');
    const fs = require('node:fs');
    const { createRequire } = require('node:module');
    const { spawnSync } = require('node:child_process');
    assert.equal(process.getuid(), 1000);
    assert.equal(process.versions.node.split('.')[0], '22');
    const requireBackend = createRequire('/app/backend/package.json');
    for (const executable of ['npm', 'npx', 'corepack', 'yarn', 'yarnpkg', 'pnpm', 'pnpx', 'tsc', 'ts-node', 'vitest', 'nodemon']) {
      assert.equal(spawnSync(executable, ['--version']).error?.code, 'ENOENT', executable);
      for (const dir of process.env.PATH.split(':')) {
        assert.throws(() => fs.lstatSync(`${dir}/${executable}`), { code: 'ENOENT' }, `${dir}/${executable}`);
      }
    }
    for (const path of ['/usr/local/lib/node_modules/npm', '/usr/local/lib/node_modules/corepack', '/home/node/.npm', '/home/node/.cache', '/app/.npm', '/app/.cache']) {
      assert.throws(() => fs.lstatSync(path), { code: 'ENOENT' }, path);
    }
    assert.deepEqual(fs.readdirSync('/opt').filter(name => /yarn|corepack|pnpm|npm/.test(name)), []);
    const lock = JSON.parse(fs.readFileSync('/app/package-lock.json', 'utf8'));
    let absentDevPackages = 0;
    for (const [path, pkg] of Object.entries(lock.packages)) {
      if (pkg.dev === true) {
        assert.equal(fs.existsSync(`/app/${path}`), false, `dev dependency: ${path}`);
        absentDevPackages++;
      }
    }
    assert.ok(absentDevPackages > 0);
    const manifest = JSON.parse(fs.readFileSync('/app/backend/package.json', 'utf8'));
    for (const name of Object.keys(manifest.dependencies)) assert.ok(requireBackend.resolve(name), name);
    for (const name of ['typescript', 'ts-node', 'vitest', 'nodemon', 'supertest', 'eslint', 'concurrently']) {
      assert.throws(() => requireBackend.resolve(name), { code: 'MODULE_NOT_FOUND' }, name);
    }
    const sharp = requireBackend('sharp');
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#123456' } }).png().toBuffer();
    assert.equal((await sharp(png).metadata()).width, 2);
    assert.equal(typeof requireBackend('tesseract.js').createWorker, 'function');
    assert.ok(fs.existsSync(requireBackend.resolve('tesseract.js/src/worker-script/node/index.js')));
    const wasm = requireBackend.resolve('tesseract.js-core/tesseract-core.wasm');
    assert.equal(WebAssembly.validate(fs.readFileSync(wasm)), true);
    assert.ok(fs.existsSync('/app/backend/dist/index.js'));
    assert.ok(fs.existsSync('/app/backend/dist/db/cli.js'));
    console.log(JSON.stringify({ event: 'runtime_image_contract_pass', uid: process.getuid(), node: process.version, absentDevPackages, sharp: sharp.versions.sharp, ocrWasmValid: true }));
  };
  const output = success(run([...isolated, image, 'node', '-e', `(${probe.toString()})().catch(error => { console.error(error); process.exitCode = 1; })`]));
  assert.match(output, /runtime_image_contract_pass/);
});

test('root-owned package-manager caches are absent, including dangling launchers', () => {
  const probe = "const fs=require('node:fs');const assert=require('node:assert/strict');for(const p of ['/root/.npm','/root/.cache']) assert.throws(()=>fs.lstatSync(p),{code:'ENOENT'},p);";
  success(run([...isolated, '--user=0', image, 'node', '-e', probe]));
});

test('actual compiled database CLI runs with Node and refuses all commands without explicit operator environment', () => {
  for (const command of ['check', 'preflight', 'migrate']) {
    const result = run([...isolated, image, 'node', 'backend/dist/db/cli.js', command]);
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr.trim(), '{"event":"database_command_failed"}');
  }
});
