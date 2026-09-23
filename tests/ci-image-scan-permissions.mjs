// Explicit local integration proof, not part of the Docker-free config-* suite.
// Uses only the two existing synthetic application images and fresh Linux volumes.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, createReadStream, mkdtempSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const workflow = readFileSync(new URL('../.github/workflows/security.yml', import.meta.url), 'utf8');
const images = workflow.split('\n  images:\n')[1].split('\n  security-required:\n')[0];
const scanner = images.match(/TRIVY_IMAGE: (\S+)/)[1];
const steps = images.split('      - name: ');
const command = prefix => steps.find(step => step.startsWith(prefix)).split('run: >-\n')[1].trim().replace(/\s*\n\s*/g, ' ');
const sbom = command('Generate image SBOM,');
const scan = command('Fail on high or critical');
const directory = mkdtempSync(join(tmpdir(), 'medapp-ci-image-permissions-'));
const prefix = `medapp-ci-image-${randomUUID()}`;
const volumes = { input: `${prefix}-input`, reports: `${prefix}-reports`, cache: `${prefix}-cache` };
const created = [];
const receipt = { startedAt: new Date().toISOString(), passed: false, scanner, fixtureIdentity: '1001:1001', checks: [], images: [] };
const persist = () => writeFileSync(join(directory, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
persist();
console.log(`Private evidence: ${directory}`);

function execute(label, executable, args, options = {}) {
  const result = spawnSync(executable, args, { encoding: 'utf8', timeout: 600_000, maxBuffer: 32 * 1024 * 1024, ...options });
  const record = { label, executable, args, exitCode: result.status, signal: result.signal, error: result.error?.code };
  writeFileSync(join(directory, `${label}.log`), `${result.stdout ?? ''}${result.stderr ?? ''}`, { mode: 0o600 });
  receipt.checks.push(record);
  persist(); // Always retain actual failure/exit status before making any assertion.
  return { ...result, text: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

function docker(label, args, options) {
  return execute(label, 'docker', args, options);
}

function ok(result, description) {
  assert.equal(result.status, 0, `${description}: inspect private evidence; ${result.error?.code ?? `exit ${result.status}`}`);
  return result;
}

const sandbox = ['run', '--rm', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges'];
const mounted = ['-v', `${volumes.input}:/scan:ro`, '-v', `${volumes.reports}:/reports`, '-v', `${volumes.cache}:/cache`];
function shell(label, script, user = '1001:1001') {
  return docker(label, [...sandbox, '--network=none', '--user', user, ...mounted, '--entrypoint', 'sh', scanner, '-ec', script]);
}

// Execute the actual workflow scanner commands, changing only the host mount
// sources to Linux volumes and the runner's identity to the fixture's owner.
function nativeCommand(text) {
  assert.ok(text.includes('--user "$(id -u):$(id -g)"'));
  return text.replace('--user "$(id -u):$(id -g)"', '--user "1001:1001"')
    .replaceAll('$RUNNER_TEMP/image-scan-input', volumes.input)
    .replaceAll('$RUNNER_TEMP/image-scan-cache', volumes.cache)
    .replaceAll('$RUNNER_TEMP/image-scan', volumes.reports)
    .replaceAll('"$TRIVY_IMAGE"', `"${scanner}"`);
}

async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

let failure;
try {
  receipt.daemon = ok(docker('daemon', ['info', '--format', '{{.OSType}}/{{.Architecture}}']), 'Docker daemon').stdout.trim();
  assert.match(receipt.daemon, /^linux\//);
  const config = JSON.parse(ok(docker('scanner-identity', ['image', 'inspect', scanner, '--format', '{{json .Config.User}}']), 'scanner identity').stdout);
  assert.ok(config === '' || config === 'root' || config === '0', 'negative control requires default-root scanner');
  for (const volume of Object.values(volumes)) {
    ok(docker(`create-${volume.split('-').at(-1)}`, ['volume', 'create', volume]), 'create fresh fixture volume');
    created.push(volume);
  }
  // CHOWN is restricted to fixture setup, never granted to either scanner.
  ok(docker('fixture-setup', [...sandbox, '--network=none', '--cap-add=CHOWN', '--user', '0:0',
    '-v', `${volumes.input}:/input`, '-v', `${volumes.reports}:/reports`, '-v', `${volumes.cache}:/cache`,
    '--entrypoint', 'sh', scanner, '-ec',
    'mkdir /cache/tmp; chmod 755 /input; chmod 700 /reports /cache /cache/tmp; chown -R 1001:1001 /input /reports /cache']), 'fixture setup');

  for (const workspace of ['backend', 'frontend']) {
    const image = `medapp-vosk-local-${workspace}:latest`;
    const archive = join(directory, `${workspace}.tar`);
    const evidence = { workspace, image };
    receipt.images.push(evidence);
    evidence.imageId = ok(docker(`${workspace}-image`, ['image', 'inspect', image, '--format', '{{.Id}}']), 'existing synthetic image').stdout.trim();
    ok(docker(`${workspace}-save`, ['save', image, '-o', archive]), 'docker save');
    const stat = statSync(archive);
    evidence.savedArchive = { uid: stat.uid, gid: stat.gid, mode: (stat.mode & 0o777).toString(8), sha256: await sha256(archive) };
    persist();
    assert.equal(stat.uid, process.getuid());
    assert.equal(evidence.savedArchive.mode, '600', 'verify actual docker save permissions, not an assumed chmod');
    const fd = openSync(archive, 'r');
    try {
      ok(docker(`${workspace}-copy-native`, [...sandbox, '--network=none', '--user', '1001:1001', '-i',
        '-v', `${volumes.input}:/input`, '--entrypoint', 'sh', scanner, '-ec',
        'chmod 755 /input; umask 077; cat > /input/image.tar; stat -c "%u:%g %a %n" /input/image.tar; sha256sum /input/image.tar'],
      { stdio: [fd, 'pipe', 'pipe'] }), 'copy archive to Linux filesystem');
    } finally {
      closeSync(fd);
      rmSync(archive); // Full archives are never retained with evidence.
    }
    const permissions = ok(shell(`${workspace}-native-metadata`,
      'stat -c "%u:%g %a" /scan/image.tar; sha256sum /scan/image.tar; grep -E "^(Uid|Gid|CapEff|NoNewPrivs):" /proc/self/status'), 'native permissions');
    assert.match(permissions.stdout, /1001:1001 600/);
    assert.ok(permissions.stdout.includes(evidence.savedArchive.sha256));
    assert.match(permissions.stdout, /CapEff:\s+0+\s/);
    assert.match(permissions.stdout, /NoNewPrivs:\s+1/);

    // Original production command: root, dropped capabilities, writable /scan.
    const before = docker(`${workspace}-before-sbom`, ['run', '--rm', '--cap-drop=ALL', '--security-opt=no-new-privileges',
      '-v', `${volumes.input}:/scan`, scanner, 'image', '--input', '/scan/image.tar', '--format', 'cyclonedx', '--output', '/scan/image.cdx.json']);
    evidence.beforeSbomExit = before.status;
    persist();
    assert.equal(before.status, 1);
    assert.match(before.text, /open \/scan\/image\.tar: permission denied/);

    ok(docker(`${workspace}-private-input`, [...sandbox, '--network=none', '--user', '1001:1001',
      '-v', `${volumes.input}:/input`, '--entrypoint', 'sh', scanner, '-ec', 'chmod 700 /input']), 'match production directory permissions');
    ok(shell(`${workspace}-isolation`,
      'stat -c "%u:%g %a %n" /scan /scan/image.tar /cache /cache/tmp /reports; ' +
      'test -r /scan/image.tar; test -w /cache; test -w /cache/tmp; test -w /reports; ' +
      'if touch /scan/should-not-write; then exit 91; fi; if touch /root/should-not-write; then exit 92; fi; ' +
      'test ! -S /var/run/docker.sock; grep -E "^(Uid|Gid|CapEff|NoNewPrivs):" /proc/self/status'), 'scanner isolation');

    const after = execute(`${workspace}-after-sbom`, '/bin/bash', ['-e', '-c', nativeCommand(sbom)]);
    evidence.afterSbomExit = after.status;
    persist();
    ok(after, 'fixed real SBOM');
    const report = ok(shell(`${workspace}-sbom`, 'cat /reports/image.cdx.json'), 'read SBOM');
    const bom = JSON.parse(report.stdout);
    assert.equal(bom.bomFormat, 'CycloneDX');
    assert.ok(bom.components.length > 0, 'SBOM must contain actual image packages');
    assert.ok(bom.components.some(component => component.type === 'operating-system'));
    assert.ok(bom.components.some(component => component.type === 'library'));
    evidence.sbom = { bomFormat: bom.bomFormat, specVersion: bom.specVersion, components: bom.components.length,
      sha256: createHash('sha256').update(report.stdout).digest('hex') };
    const vulnerability = execute(`${workspace}-vulnerabilities`, '/bin/bash', ['-e', '-c', nativeCommand(scan)]);
    evidence.vulnerabilityExit = vulnerability.status;
    evidence.warnings = vulnerability.text.split('\n').filter(line => /WARN/.test(line));
    const unchanged = ok(shell(`${workspace}-after-hash`, 'sha256sum /scan/image.tar'), 'archive integrity');
    assert.ok(unchanged.stdout.includes(evidence.savedArchive.sha256));
    evidence.archiveUnchanged = true;
    persist();
  }
  assert.ok(receipt.images.every(image => image.vulnerabilityExit === 0), 'real vulnerability gate failed; retain actual findings or infrastructure errors, never force green');
} catch (error) {
  failure = error;
  receipt.failure = error.message;
} finally {
  for (const workspace of ['backend', 'frontend']) rmSync(join(directory, `${workspace}.tar`), { force: true });
  for (const volume of created.reverse()) {
    const result = docker(`remove-${volume.split('-').at(-1)}`, ['volume', 'rm', volume]);
    if (result.status !== 0) failure ??= new Error(`Fixture cleanup failed: ${volume}`);
  }
  receipt.finishedAt = new Date().toISOString();
  receipt.passed = !failure;
  persist();
}
console.log(JSON.stringify({ evidenceDirectory: directory, passed: receipt.passed, images: receipt.images }, null, 2));
if (failure) throw failure;
