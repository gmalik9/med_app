// Source checks run in test:release. The explicit image gate additionally requires
// MEDAPP_RUNTIME_IMAGE, MEDAPP_RUNTIME_IMAGE_ARCHIVE and MEDAPP_RUNTIME_SCAN_REPORT.
// Partial opt-in fails; no missing image/archive/report is treated as a skipped pass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { isAbsolute } from 'node:path';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const runtime = read('backend/Dockerfile').split(/^FROM /m).at(-1);
const instructions = runtime.replace(/\\\r?\n\s*/g, ' ').split(/\r?\n/);

test('production installation and global-tool removal are one fail-closed instruction', () => {
  const runs = instructions.filter(line => line.startsWith('RUN '));
  assert.equal(runs.length, 1, 'no later install may restore global package managers');
  const commands = runs[0].slice(4).split(/\s+&&\s+/);
  assert.equal(commands.length, 3);
  assert.equal(commands[0], 'npm ci --omit=dev --workspace=backend --include-workspace-root=false');
  assert.equal(commands[1], 'npm cache clean --force');
  assert.deepEqual(commands[2].split(/\s+/), [
    'rm', '-rf', '/usr/local/lib/node_modules/npm', '/usr/local/lib/node_modules/corepack',
    '/opt/yarn-v*', '/usr/local/bin/npm', '/usr/local/bin/npx', '/usr/local/bin/corepack',
    '/usr/local/bin/yarn', '/usr/local/bin/yarnpkg', '/usr/local/bin/pnpm', '/usr/local/bin/pnpx',
    '/root/.npm', '/root/.cache', '/home/node/.npm', '/home/node/.cache',
  ]);
});

test('runtime cannot copy host dependencies, global tools or secrets back after cleanup', () => {
  assert.deepEqual(instructions.filter(line => /^(?:COPY|ADD) /.test(line)), [
    'COPY package.json package-lock.json ./',
    'COPY backend/package.json ./backend/',
    'COPY frontend/package.json ./frontend/',
    'COPY --from=build --chown=node:node /app/backend/dist ./backend/dist',
  ]);
  assert.ok(instructions.indexOf('USER node') > instructions.findIndex(line => line.startsWith('RUN ')));
  assert.equal(instructions.filter(line => line.startsWith('CMD ')).length, 1);
  assert.ok(instructions.includes('CMD ["node", "backend/dist/index.js"]'));
  assert.equal(JSON.parse(read('package.json')).scripts['test:release'], 'node --test tests/config-*.test.mjs');
});

const image = process.env.MEDAPP_RUNTIME_IMAGE;
const archive = process.env.MEDAPP_RUNTIME_IMAGE_ARCHIVE;
const reportPath = process.env.MEDAPP_RUNTIME_SCAN_REPORT;
if ([image, archive, reportPath].some(value => value !== undefined)) {
  assert.match(image || '', /^medapp-hardening-backend:[a-z0-9][a-z0-9_.-]*$/, 'explicit local backend tag required');
  assert.ok(archive && isAbsolute(archive), 'absolute image archive path required');
  assert.ok(reportPath && isAbsolute(reportPath), 'absolute Trivy JSON path required');
  // No shell, Docker socket mount, source mount, image pull, network, or writes.
  const cli = process.env.CONTAINER_CLI || 'docker';
  const execute = (binary, args) => {
    const result = spawnSync(binary, args, { encoding: 'utf8', timeout: 120000, maxBuffer: 2 * 1024 * 1024 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, 'read-only image contract command failed');
    return result.stdout;
  };
  const docker = args => execute(cli, args);
  const isolated = ['run', '--rm', '--pull=never', '--network=none', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges'];
  const probe = body => docker([...isolated, image, 'node', '-e', `(${body.toString()})()`]);

  test('archive, local runtime and HIGH/CRITICAL scan identify the same image and retained application packages', () => {
    // Read only named metadata entries to stdout; never unpack paths into the host.
    const entry = name => execute('tar', ['-xOf', archive, name]);
    const manifest = JSON.parse(entry('manifest.json'));
    assert.equal(manifest.length, 1);
    assert.ok(manifest[0].RepoTags.includes(image));
    assert.match(manifest[0].Config, /^blobs\/sha256\/[a-f0-9]{64}$/);
    const configText = entry(manifest[0].Config);
    const configDigest = `sha256:${createHash('sha256').update(configText).digest('hex')}`;
    assert.equal(manifest[0].Config, `blobs/sha256/${configDigest.slice(7)}`);
    const config = JSON.parse(configText);
    const [local] = JSON.parse(docker(['image', 'inspect', image]));
    const index = JSON.parse(entry('index.json'));
    assert.ok(index.manifests.some(item => item.digest === local.Id), 'archive index must match the current local tag');
    assert.deepEqual(config.rootfs.diff_ids, local.RootFS.Layers);
    assert.equal(config.config.User, 'node');
    assert.equal(local.Config.User, config.config.User);
    assert.deepEqual(config.config.Cmd, ['node', 'backend/dist/index.js']);
    assert.deepEqual(local.Config.Cmd, config.config.Cmd);
    assert.deepEqual(local.Config.Healthcheck, config.config.Healthcheck);
    assert.match(config.config.Healthcheck.Test.join(' '), /node -e .*\/ready/);
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    assert.equal(report.Metadata.ImageID, configDigest);
    assert.deepEqual(report.Metadata.DiffIDs, config.rootfs.diff_ids);
    assert.equal(report.Metadata.OS.Family, 'alpine');
    assert.ok(report.Results.some(result => result.Type === 'alpine' && result.Packages?.length > 0));
    const nodes = report.Results.filter(result => result.Type === 'node-pkg');
    assert.equal(nodes.length, 1);
    assert.ok(nodes[0].Packages.length > 0, 'do not pass a report without application inventory');
    for (const pkg of nodes[0].Packages) {
      // Trivy also inventories the three manifests deliberately copied for npm ci.
      if (['app/package.json', 'app/backend/package.json', 'app/frontend/package.json'].includes(pkg.FilePath)) {
        const manifest = JSON.parse(read(pkg.FilePath.slice(4)));
        assert.equal(pkg.Name, manifest.name);
        assert.equal(pkg.Version, manifest.version);
      } else {
        assert.match(pkg.FilePath, /^app\/(?:backend\/)?node_modules\//);
      }
    }
    for (const name of ['sharp', 'tesseract.js', 'tesseract.js-core', 'pg']) {
      assert.ok(nodes[0].Packages.some(pkg => pkg.Name === name), `retained runtime package: ${name}`);
    }
    const findings = report.Results.flatMap(result => result.Vulnerabilities || []);
    assert.equal(findings.filter(item => ['HIGH', 'CRITICAL'].includes(item.Severity)).length, 0);
  });

  test('compiled production configuration rejects weak secrets, unsafe origins and seeding without connecting', () => {
    const body = () => {
      const assert = require('node:assert/strict');
      const { randomBytes } = require('node:crypto');
      const path = '/app/backend/dist/config.js';
      const base = {
        NODE_ENV: 'production', DATABASE_URL: 'postgresql://synthetic.invalid/medapp_audit',
        JWT_SECRET: randomBytes(48).toString('base64url'), JWT_REFRESH_SECRET: randomBytes(48).toString('base64url'),
        ALLOWED_ORIGINS: 'https://synthetic.invalid', SEED_DATABASE: 'false',
      };
      let rejected = 0;
      for (const changes of [
        { DATABASE_URL: '' }, { JWT_SECRET: '' }, { JWT_REFRESH_SECRET: '' },
        { JWT_SECRET: 'short' }, { JWT_REFRESH_SECRET: 'short' },
        { JWT_SECRET: 'dev-secret-change-me'.repeat(3) }, { JWT_REFRESH_SECRET: base.JWT_SECRET },
        { ALLOWED_ORIGINS: 'http://synthetic.invalid' }, { ALLOWED_ORIGINS: 'https://*.invalid' },
        { ALLOWED_ORIGINS: 'https://synthetic.invalid/path' }, { SEED_DATABASE: 'true' },
      ]) {
        Object.assign(process.env, base, changes);
        delete require.cache[require.resolve(path)];
        assert.throws(() => require(path).validateProductionConfig());
        rejected++;
      }
      Object.assign(process.env, base);
      delete require.cache[require.resolve(path)];
      assert.doesNotThrow(() => require(path).validateProductionConfig());
      console.log(JSON.stringify({ rejected, accepted: 1 }));
    };
    assert.deepEqual(JSON.parse(probe(body)), { rejected: 11, accepted: 1 });
  });

  test('default production CMD fails closed without signing secrets and emits only the safe startup diagnostic', () => {
    const result = spawnSync(cli, [...isolated,
      '--env', 'DATABASE_URL=postgresql://synthetic.invalid/medapp_audit',
      '--env', 'ALLOWED_ORIGINS=https://synthetic.invalid', image,
    ], { encoding: 'utf8', timeout: 15000 });
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr.trim(), 'startup_failed: check configuration and database availability');
  });

  test('compiled Node database parser enforces every production approval boundary without database access', () => {
    const body = () => {
      const assert = require('node:assert/strict');
      const { parseDatabaseCommand } = require('/app/backend/dist/db/cli.js');
      const base = { NODE_ENV: 'production', DATABASE_URL: 'postgresql://synthetic.invalid/medapp_audit' };
      let refused = 0;
      for (const command of ['check', 'preflight', 'migrate']) {
        assert.throws(() => parseDatabaseCommand([command], base), /requires_production_approval/);
        refused++;
      }
      assert.throws(() => parseDatabaseCommand(['migrate', '--approved-production'], base), /requires_migration_confirmation/);
      refused++;
      for (const approval of [undefined, 'false', 'TRUE', '1']) {
        assert.throws(() => parseDatabaseCommand(['migrate', '--approved-production', '--confirm-migration'], {
          ...base, RELEASE_MIGRATION_APPROVED: approval,
        }), /requires_release_migration_approval/);
        refused++;
      }
      for (const command of ['check', 'preflight']) {
        assert.equal(parseDatabaseCommand([command, '--approved-production'], base), command);
      }
      assert.equal(parseDatabaseCommand(['migrate', '--approved-production', '--confirm-migration'], {
        ...base, RELEASE_MIGRATION_APPROVED: 'true',
      }), 'migrate');
      console.log(JSON.stringify({ refused, accepted: 3 }));
    };
    assert.deepEqual(JSON.parse(probe(body)), { refused: 8, accepted: 3 });
  });
}
