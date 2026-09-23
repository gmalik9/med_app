import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const workflow = readFileSync(new URL('.github/workflows/security.yml', root), 'utf8');
const images = workflow.split('\n  images:\n')[1].split('\n  security-required:\n')[0];
const steps = images.split('      - name: ');
const build = steps.find(step => step.startsWith('Build synthetic application image,'));
const sbom = steps.find(step => step.startsWith('Generate image SBOM,'));
const scan = steps.find(step => step.startsWith('Fail on high or critical'));

function script(step) {
  const [, style, body] = step.match(/\n        run: (\||>-)\n([\s\S]+)/);
  const lines = body.trimEnd().split('\n').map(line => line.replace(/^          /, ''));
  return lines.join(style === '|' ? '\n' : ' ');
}

// Fixture teardown uses only the exact fresh directory retained in this closure,
// never RUNNER_TEMP or a prefix match. No real runner directory is touched.
function fixture(t) {
  const directory = mkdtempSync(join(realpathSync(tmpdir()), 'medapp-ci-b-lifecycle-'));
  const original = lstatSync(directory);
  t.after(() => {
    const current = lstatSync(directory);
    assert.ok(current.isDirectory() && !current.isSymbolicLink());
    assert.equal(realpathSync(directory), directory);
    assert.equal(current.dev, original.dev);
    assert.equal(current.ino, original.ino);
    rmSync(directory, { recursive: true });
  });
  return directory;
}

// Execute the workflow's actual shell, but never a container command. For unsafe
// path cases mkdir is also intercepted, so even '/' cannot cause a host write.
// Deletion is always intercepted; a regression must fail without deleting data.
const interceptors = `
docker() {
  local operation="$1"
  if [[ "$1" == run ]]; then
    case " $* " in *" --format cyclonedx "*) operation=sbom ;; *) operation=scan ;; esac
  fi
  printf 'docker:%s\\n' "$operation" >> "$CALL_LOG"
  if [[ "$FAIL_OPERATION" == "$operation" ]]; then return 42; fi
  if [[ "$REAL_FILES" == 1 && "$operation" == save ]]; then
    printf 'synthetic archive only\\n' > "$4"
  fi
}
mkdir() {
  printf 'mkdir\\n' >> "$CALL_LOG"
  if [[ "$REAL_FILES" == 1 ]]; then command mkdir "$@"; fi
}
rm() { printf 'DELETE:rm\\n' >> "$CALL_LOG"; return 99; }
rmdir() { printf 'DELETE:rmdir\\n' >> "$CALL_LOG"; return 99; }
unlink() { printf 'DELETE:unlink\\n' >> "$CALL_LOG"; return 99; }
shred() { printf 'DELETE:shred\\n' >> "$CALL_LOG"; return 99; }
`;

function execute(directory, commands, { runnerTemp, workspace = 'backend', failure = '', realFiles = false } = {}) {
  const log = join(directory, 'calls');
  writeFileSync(log, '', { mode: 0o600 });
  // A deliberately small environment avoids startup files and inherited secrets.
  const env = { PATH: '/usr/bin:/bin', HOME: directory, CALL_LOG: log, WORKSPACE: workspace,
    TRIVY_IMAGE: 'intercepted-only', FAIL_OPERATION: failure, REAL_FILES: realFiles ? '1' : '0' };
  if (runnerTemp !== undefined) env.RUNNER_TEMP = runnerTemp;
  const result = spawnSync('/bin/bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c',
    `${interceptors}\n${commands.map(script).join('\n')}`], { cwd: directory, env, encoding: 'utf8', timeout: 10_000 });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  const calls = readFileSync(log, 'utf8');
  assert.doesNotMatch(calls, /DELETE:/, 'the workflow must not invoke filesystem deletion');
  assert.equal(result.status, failure ? 42 : 0, result.stderr);
  return calls;
}

test('both pinned image scanners use the archive owner, without DAC bypass or a Docker socket', () => {
  assert.match(images, /workspace: \[backend, frontend\]/);
  assert.match(images, /TRIVY_IMAGE: aquasec\/trivy:0\.74\.0@sha256:62b1e65e8869bc4b4c6aa4fa2b21595256c7c2f6018a9d9ad61caf87187c1969/);
  for (const step of [sbom, scan]) {
    assert.match(step, /--user "\$\(id -u\):\$\(id -g\)"/);
    assert.match(step, /--cap-drop=ALL --security-opt=no-new-privileges/);
    assert.match(step, /docker run --rm --read-only/);
    assert.doesNotMatch(step, /--privileged|--cap-add|docker\.sock|--user(?:=|\s+)root/);
  }
});

test('the private archive is read-only in both scans, and never shares a writable report mount', () => {
  assert.match(images, /docker save "medapp-scan:\$WORKSPACE" -o "\$RUNNER_TEMP\/image-scan-input\/image\.tar"/);
  assert.doesNotMatch(images, /chmod|chown|sudo/);
  for (const step of [sbom, scan]) {
    assert.match(step, /-v "\$RUNNER_TEMP\/image-scan-input:\/scan:ro"/);
    assert.match(step, /image --input \/scan\/image\.tar/);
    assert.doesNotMatch(step, /-v "\$RUNNER_TEMP:\/|image-scan-input:\/[^"\s]*:rw/);
  }
  assert.match(sbom, /-v "\$RUNNER_TEMP\/image-scan:\/reports"/);
  assert.match(sbom, /--format cyclonedx --output \/reports\/image\.cdx\.json/);
  assert.doesNotMatch(scan, /\/reports/);
});

test('both scans have explicit owner-writable HOME, temporary storage and the same Trivy cache', () => {
  assert.match(images, /umask 077\s+mkdir -m 700 "\$RUNNER_TEMP\/image-scan-input" "\$RUNNER_TEMP\/image-scan"\s+mkdir -m 700 "\$RUNNER_TEMP\/image-scan-cache" "\$RUNNER_TEMP\/image-scan-cache\/tmp"/);
  for (const step of [sbom, scan]) {
    assert.match(step, /-e HOME=\/cache -e TMPDIR=\/cache\/tmp/);
    assert.match(step, /-v "\$RUNNER_TEMP\/image-scan-cache:\/cache"/);
    assert.match(step, /--cache-dir \/cache\/trivy/);
    assert.doesNotMatch(step, /\/root|--tmpfs/);
  }
});

test('SBOM stays offline while the vulnerability gate can fetch databases and includes unfixed findings', () => {
  assert.match(sbom, /--network=none/);
  assert.doesNotMatch(scan, /--network|--offline-scan|--skip-db-update|--skip-java-db-update/);
  assert.match(scan, /--scanners vuln --severity HIGH,CRITICAL --exit-code 1 --no-progress/);
  assert.doesNotMatch(images, /--ignore-unfixed|--ignorefile|--ignore-policy|--exit-code 0|continue-on-error|\|\|\s*true/);
});

test('only the SBOM is uploaded for seven days; hosted runner disposal replaces custom deletion', () => {
  const upload = steps.find(step => step.startsWith('Retain SBOM only;'));
  assert.match(upload, /if: always\(\) && steps\.sbom\.outcome == 'success'/);
  assert.match(upload, /path: \$\{\{ runner\.temp \}\}\/image-scan\/image\.cdx\.json\s+if-no-files-found: error\s+retention-days: 7/);
  assert.match(images, /runs-on: ubuntu-24\.04\n/);
  assert.doesNotMatch(images, /self-hosted/);
  assert.match(images, /No custom filesystem cleanup:[\s\S]*ephemeral runner/);
  assert.equal(steps.length, 5, 'checkout, build, SBOM, vulnerability gate, upload only');
  assert.equal((images.match(/^        run:/gm) ?? []).length, 3);
  assert.deepEqual([...images.matchAll(/uses: ([^\s@]+)@/g)].map(match => match[1]),
    ['actions/checkout', 'actions/upload-artifact']);
  // Include absolute paths and shell builtins; --rm (container removal) is not
  // filesystem cleanup. No new helper/action/always() deletion step is permitted.
  assert.doesNotMatch(images, /(?:^|[\s;&|/])(?:rm|rmdir|unlink|shred|find|trap|source|eval|exec)\b/m);
  assert.doesNotMatch(images, /\b(?:node|python\d*|bash|sh)\s/);
});

test('the new scanner contracts participate in the existing release discovery without script changes', () => {
  const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
  assert.equal(pkg.scripts['test:release'], 'node --test tests/config-*.test.mjs');
});

test('unsafe temp values cannot invoke deletion on success or any build/scanner failure (intercepted)', t => {
  const directory = fixture(t);
  const target = join(directory, 'sentinel-target');
  mkdirSync(target);
  writeFileSync(join(target, 'keep'), 'untouched');
  const link = join(directory, 'symlink-temp');
  symlinkSync(target, link);
  const values = [undefined, '', '/', '.', '..', 'relative-temp', '/etc', '/home/runner',
    '/home/runner/work', '/home/runner/work/_temp', join(directory, 'unknown'), link];
  for (const workspace of ['backend', 'frontend']) {
    for (const runnerTemp of values) {
      for (const failure of ['', 'build', 'save', 'sbom', 'scan']) {
        const calls = execute(directory, [build, sbom, scan], { runnerTemp, workspace, failure });
        assert.ok(calls.includes(`docker:${failure || 'scan'}\n`));
      }
    }
  }
  assert.equal(readFileSync(join(target, 'keep'), 'utf8'), 'untouched');
  assert.ok(lstatSync(link).isSymbolicLink());
});

test('real private temp files remain until fixture disposal, including after scanner failure', t => {
  const directory = fixture(t);
  const target = join(directory, 'outside-runner-temp');
  mkdirSync(target);
  writeFileSync(join(target, 'keep'), 'untouched');
  for (const workspace of ['backend', 'frontend']) {
    const runnerTemp = join(directory, workspace);
    mkdirSync(runnerTemp);
    const original = lstatSync(runnerTemp);
    execute(directory, [build], { runnerTemp, workspace, realFiles: true });
    const archive = join(runnerTemp, 'image-scan-input/image.tar');
    const report = join(runnerTemp, 'image-scan/image.cdx.json');
    writeFileSync(report, '{"synthetic":true}\n', { mode: 0o600 });
    symlinkSync(target, join(runnerTemp, 'image-scan-cache/sentinel-link'));
    for (const failure of ['', 'sbom', 'scan']) {
      execute(directory, [sbom, scan], { runnerTemp, workspace, failure });
      assert.equal(readFileSync(archive, 'utf8'), 'synthetic archive only\n');
      assert.equal(statSync(archive).mode & 0o777, 0o600);
      assert.equal(readFileSync(report, 'utf8'), '{"synthetic":true}\n');
      for (const child of ['image-scan-input', 'image-scan', 'image-scan-cache', 'image-scan-cache/tmp']) {
        assert.equal(statSync(join(runnerTemp, child)).mode & 0o777, 0o700);
      }
      assert.equal(lstatSync(runnerTemp).ino, original.ino);
      assert.equal(lstatSync(runnerTemp).dev, original.dev);
      assert.ok(lstatSync(join(runnerTemp, 'image-scan-cache/sentinel-link')).isSymbolicLink());
      assert.equal(readFileSync(join(target, 'keep'), 'utf8'), 'untouched');
    }
  }
});

