import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publishableInventory, resolveGuideLink, assertPublishableTarget } from './guide-links.mjs';

const root = new URL('../', import.meta.url);
const rootPath = fileURLToPath(root);
const inventory = publishableInventory(rootPath);
const readGuide = file => {
  assertPublishableTarget(rootPath, file, inventory);
  return readFileSync(join(rootPath, file), 'utf8');
};
const coordinated = new Set(['QUALITY_AUDIT.md', 'HARDENING_PLAN.md', 'OPERATIONS.md', 'AUDIT_API_INVENTORY.md']);
const guides = [...inventory].filter(file => !file.includes('/') && file.endsWith('.md') && !coordinated.has(file));
const banned = [
  /npm install\b/i,
  /ALLOWED_ORIGINS=[^\n`]*\*/,
  /doctor@hospital\.com/,
  /curl[^\n]*(?:\/api\/seed|\n[^\n]*\/api\/seed)/i,
  /\.\/app\.sh (?:clean|rebuild|start dummy|restart dummy)|docker-compose down -v/,
  /Node(?:\.js)?\s*(?:\*\*)?\s*:?\s*v?(?:16|18)\+/i,
];

test('all owned root guides reject obsolete runnable deployment advice', () => {
  for (const file of guides) {
    const text = readGuide(file);
    // Report only location/rule, not the complete document or matched value.
    for (const pattern of banned) assert.ok(!pattern.test(text), `${file}: obsolete guidance rule ${pattern.source}`);
  }
});

test('setup explicitly distinguishes unit-friendly skips from required release integration', () => {
  const text = readGuide('SETUP.md');
  for (const term of ['Node 22.12+', 'npm ci', 'repository root', 'test:unit', 'test:integration',
    'verify:release', 'exact origins', 'VITE_API_URL', 'same-origin', 'skips', 'fails',
    '55439/medapp_audit', 'America/New_York']) assert.ok(text.includes(term), `Missing setup contract: ${term}`);
});

test('current Verify CI guidance documents masked ephemeral provisioning rather than owner-secret setup', () => {
  for (const file of ['SETUP.md', 'OPERATIONS.md']) {
    const text = readGuide(file);
    for (const term of ['no repository database secret', '32-byte random password',
      '127.0.0.1:55439:5432', 'job-owned', 'docs/verification/ci-database-fix.md']) {
      assert.ok(text.includes(term), `${file}: missing ephemeral CI contract: ${term}`);
    }
    assert.doesNotMatch(text, /TEST_DATABASE_PASSWORD.{0,60}repository secret|owner setup pending|fork pull requests do not receive it/);
  }
});

test('new current guide links exist in the publishable candidate inventory (no network requests)', () => {
  const supplemental = [...coordinated, 'docs/verification/IMPLEMENTATION_STATUS.md',
    'docs/verification/track-i-integration.md', 'docs/verification/track-h-decisions.md',
    'docs/verification/github-ci-fixes.md'];
  const failures = [];
  for (const file of [...guides.filter(file => file !== 'API.md'), ...supplemental]) {
    const text = readGuide(file);
    for (const [, href] of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      let target;
      try {
        target = resolveGuideLink(file, href);
        if (target !== null) assertPublishableTarget(rootPath, target, inventory);
      } catch {
        // Report filenames only, never document contents or raw URLs/queries.
        failures.push(`${file}: unpublished, missing or unsafe local link${target ? ` -> ${target}` : ''}`);
      }
    }
  }
  assert.deepEqual(failures, []);
});

test('current operator docs require explicit approved migration and preserve blocked policy gates', () => {
  for (const file of ['OPERATIONS.md', 'RENDER_DEPLOYMENT.md', 'SETUP.md']) {
    const text = readGuide(file);
    for (const term of ['--approved-production', '--confirm-migration', 'RELEASE_MIGRATION_APPROVED=true',
      'read-only', 'predeploy', 'Q1–Q7']) assert.ok(text.includes(term), `${file}: missing current CLI/policy contract`);
  }
  const ledger = readGuide('docs/verification/IMPLEMENTATION_STATUS.md');
  for (const track of 'ABCDEFGH') assert.ok(ledger.includes(`**${track} —`), `Missing track ${track}`);
  for (const term of ['B3', 'C3', 'E2', '31 tests', '362/362', 'UNKNOWN', 'not release PASSED', 'PENDING']) {
    assert.ok(ledger.includes(term), `Ledger missing handoff distinction: ${term}`);
  }
});
