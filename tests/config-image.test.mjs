import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const dockerfile = read('backend/Dockerfile');
const stages = dockerfile.split(/^FROM /m).slice(1);
const runtime = stages.at(-1);
const pin = 'node:22-alpine@sha256:b6f26b36c8ff49624cfdac716b8ea1138d606df02586a77d364bb5536a634f85';

test('backend build and runtime retain the verified Node 22 digest and deterministic production install', () => {
  assert.equal(stages.length, 2);
  assert.equal(stages[0].split('\n')[0], `${pin} AS build`);
  assert.equal(runtime.split('\n')[0], pin);
  assert.match(stages[0], /RUN npm ci --workspace=backend --include-workspace-root=false/);
  assert.match(runtime, /COPY package\.json package-lock\.json \.\//);
  assert.match(runtime, /RUN npm ci --omit=dev --workspace=backend --include-workspace-root=false/);
  assert.doesNotMatch(runtime, /npm (?:install|update)|--ignore-scripts|--omit=optional/);
});

test('runtime removes only unused global package managers and caches after installing production dependencies', () => {
  const cleanup = runtime.match(/&& rm -rf ([\s\S]*?)\nCOPY /)?.[1];
  assert.ok(cleanup, 'package-manager cleanup must precede the compiled application copy');
  assert.deepEqual(cleanup.replace(/\\\n/g, ' ').trim().split(/\s+/), [
    '/usr/local/lib/node_modules/npm', '/usr/local/lib/node_modules/corepack',
    '/opt/yarn-v*', '/usr/local/bin/npm', '/usr/local/bin/npx', '/usr/local/bin/corepack',
    '/usr/local/bin/yarn', '/usr/local/bin/yarnpkg', '/usr/local/bin/pnpm', '/usr/local/bin/pnpx',
    '/root/.npm', '/root/.cache', '/home/node/.npm', '/home/node/.cache',
  ]);
  assert.ok(runtime.indexOf('npm ci --omit=dev') < runtime.indexOf('npm cache clean --force'));
  assert.ok(runtime.indexOf('npm cache clean --force') < runtime.indexOf('&& rm -rf'));
  assert.doesNotMatch(runtime.slice(runtime.indexOf('&& rm -rf')), /(?:RUN|&&)\s+(?:npm|npx|yarn|pnpm|corepack)\b/);
});

test('runtime startup, healthcheck and documented database administration use Node without package managers', () => {
  assert.match(runtime, /COPY --from=build --chown=node:node \/app\/backend\/dist \.\/backend\/dist/);
  assert.match(runtime, /^USER node$/m);
  assert.match(runtime, /^HEALTHCHECK .* CMD node -e .*127\.0\.0\.1:5000\/ready/m);
  assert.match(runtime, /^CMD \["node", "backend\/dist\/index\.js"\]$/m);
  assert.match(runtime, /node backend\/dist\/db\/cli\.js <command> <flags>/);
  const scripts = JSON.parse(read('backend/package.json')).scripts;
  for (const command of ['check', 'preflight', 'migrate']) {
    assert.equal(scripts[`db:${command}`], `node dist/db/cli.js ${command}`);
  }
});

test('root Docker build context excludes secrets, local dependencies and generated artifacts', () => {
  const excluded = read('.dockerignore').trim().split(/\r?\n/);
  for (const pattern of ['.git', '**/node_modules', '**/dist', '**/.env', '**/.env.*', 'secrets', 'secrets.env', '**/*.log', 'test-results']) {
    assert.ok(excluded.includes(pattern), `missing build-context exclusion: ${pattern}`);
  }
  assert.ok(excluded.every(pattern => !pattern.startsWith('!')), 'no secret exclusion overrides');
});
