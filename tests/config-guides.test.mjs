import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const coordinated = new Set(['QUALITY_AUDIT.md', 'HARDENING_PLAN.md', 'OPERATIONS.md', 'AUDIT_API_INVENTORY.md']);
const guides = readdirSync(root).filter(file => file.endsWith('.md') && !coordinated.has(file));
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
    const text = readFileSync(new URL(file, root), 'utf8');
    // Report only location/rule, not the complete document or matched value.
    for (const pattern of banned) assert.ok(!pattern.test(text), `${file}: obsolete guidance rule ${pattern.source}`);
  }
});

test('setup explicitly distinguishes unit-friendly skips from required release integration', () => {
  const text = readFileSync(new URL('SETUP.md', root), 'utf8');
  for (const term of ['Node 22.12+', 'npm ci', 'repository root', 'test:unit', 'test:integration',
    'verify:release', 'exact origins', 'VITE_API_URL', 'same-origin', 'skips', 'fails',
    '55439/medapp_audit', 'America/New_York']) assert.ok(text.includes(term), `Missing setup contract: ${term}`);
});

test('new current guide links resolve locally (no network requests)', () => {
  const supplemental = [...coordinated, 'docs/verification/IMPLEMENTATION_STATUS.md',
    'docs/verification/track-i-integration.md', 'docs/verification/track-h-decisions.md'];
  for (const file of [...guides.filter(file => file !== 'API.md'), ...supplemental]) {
    const text = readFileSync(new URL(file, root), 'utf8');
    for (const [, href] of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      if (/^(?:https?:|#)/.test(href)) continue;
      assert.ok(existsSync(new URL(href.split('#')[0], new URL(file, root))), `${file}: broken local link`);
    }
  }
});

test('current operator docs require explicit approved migration and preserve blocked policy gates', () => {
  for (const file of ['OPERATIONS.md', 'RENDER_DEPLOYMENT.md', 'SETUP.md']) {
    const text = readFileSync(new URL(file, root), 'utf8');
    for (const term of ['--approved-production', '--confirm-migration', 'RELEASE_MIGRATION_APPROVED=true',
      'read-only', 'predeploy', 'Q1–Q7']) assert.ok(text.includes(term), `${file}: missing current CLI/policy contract`);
  }
  const ledger = readFileSync(new URL('docs/verification/IMPLEMENTATION_STATUS.md', root), 'utf8');
  for (const track of 'ABCDEFGH') assert.ok(ledger.includes(`**${track} —`), `Missing track ${track}`);
  for (const term of ['B3', 'C3', 'E2', '31 tests', '362/362', 'UNKNOWN', 'not release PASSED', 'PENDING']) {
    assert.ok(ledger.includes(term), `Ledger missing handoff distinction: ${term}`);
  }
});
