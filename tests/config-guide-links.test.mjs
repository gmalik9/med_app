import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishableInventory, resolveGuideLink, assertPublishableTarget } from './guide-links.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'medapp-guide-links-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // Local empty repository only: no inherited Git config, hooks, identity,
  // credentials, remotes or commits. Never change the application's index.
  const env = { PATH: process.env.PATH, HOME: root, GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0' };
  const git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
    cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  git('init', '--quiet', '--template=');
  mkdirSync(join(root, 'backend'));
  mkdirSync(join(root, 'docs'));
  writeFileSync(join(root, '.gitignore'), '.env.*\n!.env.example\nprivate/\n');
  writeFileSync(join(root, 'backend/.env.example'), '# Inert tracked configuration example\n');
  writeFileSync(join(root, 'docs/current.md'), '# Inert current guide\n');
  git('add', '--', '.gitignore', 'backend/.env.example', 'docs/current.md');
  const inventory = () => publishableInventory(root, env);
  const check = (href, document = 'docs/current.md') => {
    const target = resolveGuideLink(document, href);
    if (target !== null) assertPublishableTarget(root, target, inventory());
    return target;
  };
  return { root, env, inventory, check };
}

function actualGuideGate(t) {
  const f = fixture(t);
  mkdirSync(join(f.root, 'tests'));
  mkdirSync(join(f.root, 'docs/verification'));
  // Execute the unchanged production guide gate, not a duplicated link loop.
  for (const file of ['config-guides.test.mjs', 'guide-links.mjs']) {
    copyFileSync(new URL(file, import.meta.url), join(f.root, 'tests', file));
  }
  for (const file of ['QUALITY_AUDIT.md', 'HARDENING_PLAN.md', 'OPERATIONS.md', 'AUDIT_API_INVENTORY.md',
    'docs/verification/IMPLEMENTATION_STATUS.md', 'docs/verification/track-i-integration.md',
    'docs/verification/track-h-decisions.md', 'docs/verification/github-ci-fixes.md']) {
    writeFileSync(join(f.root, file), '# Inert guide fixture\n');
  }
  const run = href => {
    writeFileSync(join(f.root, 'README.md'), `[Fixture link](${href})\n`);
    const result = spawnSync(process.execPath, ['--test', '--test-name-pattern=^new current guide links ',
      'tests/config-guides.test.mjs'], { cwd: f.root, env: f.env, encoding: 'utf8', timeout: 10000 });
    assert.ifError(result.error);
    assert.match(result.stdout, /new current guide links exist in the publishable candidate inventory/);
    return result;
  };
  return { ...f, run };
}

test('an existing ignored-only fake target cannot satisfy published guide links', t => {
  const f = fixture(t);
  writeFileSync(join(f.root, '.env.private'), '# Inert ignored fixture, no credentials\n');
  assert.equal(existsSync(join(f.root, '.env.private')), true); // Old exists-only gate passed.
  assert.equal(f.inventory().has('.env.private'), false);
  assert.throws(() => f.check('../.env.private'), /absent from publishable inventory/);
});

test('ignored whitespace private paths stay excluded without hiding indexed descendants', t => {
  const f = fixture(t);
  writeFileSync(join(f.root, '.gitignore'), '.env.*\n!.env.example\nprivate/\nprivate notes/\nbackend/\n');
  mkdirSync(join(f.root, 'private notes'));
  writeFileSync(join(f.root, 'private notes/inert.txt'), 'inert\n');
  assert.equal(f.inventory().has('private notes/inert.txt'), false);
  for (const href of ['../private notes', '../private%20notes/', '../private%20notes/inert.txt']) {
    assert.throws(() => f.check(href), /absent from publishable inventory/);
  }
  // Ignore patterns do not unpublish a file already present in the index.
  assert.equal(f.inventory().has('backend/.env.example'), true);
  for (const href of ['../backend', '../backend/']) assert.equal(f.check(href), 'backend');
});

test('tracked configuration examples are valid, including unstaged working-tree edits', t => {
  const f = fixture(t);
  writeFileSync(join(f.root, 'backend/.env.example'), '# Updated inert tracked example\n');
  assert.equal(f.check('../backend/.env.example#configuration'), 'backend/.env.example');
});

test('eligible new files with encoded spaces resolve before staging or committing', t => {
  const f = fixture(t);
  writeFileSync(join(f.root, 'docs/new guide.md'), '# New eligible guide\n');
  assert.equal(f.check('new%20guide.md#heading'), 'docs/new guide.md');
});

test('missing targets fail even when still listed in the Git index', t => {
  const f = fixture(t);
  assert.throws(() => f.check('missing.md'), /absent from publishable inventory/);
  rmSync(join(f.root, 'backend/.env.example'));
  assert.equal(f.inventory().has('backend/.env.example'), true);
  assert.throws(() => f.check('../backend/.env.example'), { code: 'ENOENT' });
});

test('source-directory links require an existing publishable descendant', t => {
  const f = fixture(t);
  for (const href of ['../backend', '../backend/', '../backend//#configuration']) {
    assert.equal(f.check(href), 'backend');
  }
  mkdirSync(join(f.root, 'private'));
  writeFileSync(join(f.root, 'private/inert.txt'), 'inert\n');
  for (const href of ['../private', '../private/']) {
    assert.throws(() => f.check(href), /absent from publishable inventory/);
  }
  rmSync(join(f.root, 'backend/.env.example'));
  for (const href of ['../backend', '../backend/']) {
    assert.throws(() => f.check(href), /not a publishable file or source directory/);
  }
});

test('directory separators canonicalize without relaxing resolved-path guards', t => {
  const f = fixture(t);
  for (const href of ['docs', 'docs/', './docs//', 'docs%2F#heading', 'docs/#%ZZ']) {
    assert.equal(f.check(href, 'README.md'), 'docs');
  }
  for (const target of ['docs', 'docs/', 'docs//']) {
    assert.doesNotThrow(() => assertPublishableTarget(f.root, target, f.inventory()));
  }
  for (const target of ['', '/', '/docs/', '../docs/', 'docs/../', 'docs\\', 'docs\u0000/']) {
    assert.throws(() => assertPublishableTarget(f.root, target, f.inventory()), /invalid resolved/);
  }
});

test('repository root links are allowed only with an existing regular publishable child', t => {
  const f = fixture(t);
  for (const href of ['.', './', './/#heading']) assert.equal(f.check(href, 'README.md'), '.');
  assert.equal(f.check('../'), '.');
  for (const target of ['.', './', './/']) {
    assert.doesNotThrow(() => assertPublishableTarget(f.root, target, new Set(['docs/current.md'])));
    assert.throws(() => assertPublishableTarget(f.root, target, new Set()), /absent from publishable inventory/);
    assert.throws(() => assertPublishableTarget(f.root, target, new Set(['missing.md'])), /not a publishable/);
  }
  symlinkSync('current.md', join(f.root, 'docs/alias.md'));
  assert.throws(() => assertPublishableTarget(f.root, '.', new Set(['docs/alias.md'])), /not a publishable/);
});

test('actual guide gate accepts docs and docs/ with the same published child, plus root and fragments', t => {
  const f = actualGuideGate(t);
  writeFileSync(join(f.root, '.gitignore'), '.env.*\n!.env.example\nprivate/\nbackend/\n');
  writeFileSync(join(f.root, 'docs/.env.private'), '# Inert ignored fixture\n');
  assert.equal(f.inventory().has('docs/.env.private'), false);
  assert.equal(f.inventory().has('backend/.env.example'), true);
  for (const href of ['docs', 'docs/', 'docs//#heading', './', './/#%ZZ', 'docs/current.md#heading',
    'backend', 'backend/']) {
    const result = f.run(href);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /# pass 1\b/);
  }
});

test('actual guide gate rejects directories without published regular children, including ignored whitespace paths', t => {
  const f = actualGuideGate(t);
  mkdirSync(join(f.root, 'empty'));
  mkdirSync(join(f.root, 'private'));
  mkdirSync(join(f.root, 'private notes'));
  writeFileSync(join(f.root, '.gitignore'), '.env.*\n!.env.example\nprivate/\nprivate notes/\n');
  writeFileSync(join(f.root, 'private/inert.txt'), 'inert\n');
  writeFileSync(join(f.root, 'private notes/inert.txt'), 'inert\n');
  rmSync(join(f.root, 'backend/.env.example'));
  symlinkSync('private', join(f.root, 'alias'));
  for (const path of ['empty', 'private', 'private%20notes', 'backend', 'alias']) {
    for (const suffix of ['', '/', '/#heading']) {
      const result = f.run(path + suffix);
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.match(result.stdout, /unpublished, missing or unsafe local link/);
      assert.match(result.stdout, /# fail 1\b/);
    }
  }
});

test('pure resolution rejects malformed paths and traversal outside the repository', () => {
  for (const href of ['../../outside.md', '%2e%2e/%2e%2e/outside.md', '/etc/hosts',
    '//outside.invalid/file', 'file:///etc/hosts', 'data:text/plain,inert', 'C:/file',
    '..%5coutside.md', 'bad%00file', 'bad\nfile', '%ZZ', 'file.md?query=unused', '']) {
    assert.throws(() => resolveGuideLink('docs/current.md', href), /local link/);
  }
  assert.equal(resolveGuideLink('docs/current.md', '../backend/.env.example'), 'backend/.env.example');
  assert.equal(resolveGuideLink('docs/current.md', './current.md#heading'), 'docs/current.md');
});

test('HTTP links and same-document fragments need no local target or network access', () => {
  for (const href of ['https://example.invalid/guide', 'http://example.invalid/', '#heading']) {
    assert.equal(resolveGuideLink('docs/current.md', href), null);
  }
});

test('candidate symlinks and symlink ancestors cannot expose private or external targets', t => {
  const f = fixture(t);
  writeFileSync(join(f.root, '.env.private'), '# Inert ignored symlink target\n');
  symlinkSync('../.env.private', join(f.root, 'docs/alias.md'));
  assert.equal(f.inventory().has('docs/alias.md'), true);
  assert.throws(() => f.check('alias.md'), /symlink/);
  // An indexed descendant remains indexed even if its parent is replaced.
  mkdirSync(join(f.root, 'private'));
  writeFileSync(join(f.root, 'private/.env.example'), '# Inert private target\n');
  rmSync(join(f.root, 'backend'), { recursive: true });
  symlinkSync('private', join(f.root, 'backend'));
  assert.equal(f.inventory().has('backend/.env.example'), true);
  assert.throws(() => f.check('../backend/.env.example'), /symlink/);
  for (const href of ['../backend', '../backend/']) assert.throws(() => f.check(href), /symlink/);
  // No external file is read or needs to exist for this refusal.
  symlinkSync(join(f.root, '..', 'outside-inert.md'), join(f.root, 'docs/outside.md'));
  assert.throws(() => f.check('outside.md'), /symlink/);
});
