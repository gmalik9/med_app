import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const enabled = process.env.EVIDENCE_SCREENSHOTS === 'true';
const names = ['01-login', '02-patient-record', '03-draft-retained', '04-conflict-review', '05-ai-mocked-review', '06-history-load-more', '07-helpful-error', '08-idempotent-retry'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function fingerprint(directory) {
  const files = [];
  function walk(path) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile()) files.push([relative(root, child), sha(readFileSync(child))]);
    }
  }
  walk(join(root, directory));
  return sha(JSON.stringify(files.sort((a, b) => a[0].localeCompare(b[0]))));
}

// Deliberately no HTML/JSON report, raw console, URL, header, body, storage state,
// error call log or test attachment. Only fixed test labels and scalar counts.
export default class EvidenceReporter {
  results = [];
  globalErrors = 0;
  onBegin(_config, suite) {
    this.started = new Date().toISOString();
    this.total = suite.allTests().length;
    this.hashes = Object.fromEntries(['backend/src', 'frontend/src', 'backend/dist', 'frontend/dist'].map(path => [path, fingerprint(path)]));
    if (enabled) {
      const directory = join(root, 'docs/verification/screenshots');
      mkdirSync(directory, { recursive: true });
      for (const name of names) {
        const path = join(directory, `${name}.png`);
        if (existsSync(path)) unlinkSync(path);
      }
    }
    console.log(`SYNTHETIC browser gate: ${this.total} tests; built frontend; screenshot opt-in ${enabled}; no traces.`);
  }
  onTestEnd(test, result) {
    const annotations = result.annotations ?? test.annotations;
    const captures = annotations.filter(item => item.type === 'synthetic-screenshot').map(item => JSON.parse(item.description));
    const observation = annotations.find(item => item.type === 'synthetic-observation');
    const diagnostics = observation ? JSON.parse(observation.description) : null;
    this.results.push({ title: test.title, status: result.status, duration: result.duration, captures, diagnostics });
    console.log(`${result.status.toUpperCase()}: ${test.title} (${result.duration}ms)`);
    for (const error of result.errors) {
      // Only source locations; assertion values/HTTP call logs could hold tokens.
      const locations = [...(error.stack || '').matchAll(/clinical\.spec\.ts:\d+:\d+/g)].map(match => match[0]);
      console.log(`  Failure location: ${[...new Set(locations)].join(', ') || 'test setup/teardown'}; raw error intentionally omitted.`);
    }
    if (diagnostics) console.log(`  Safe diagnostic counts: ${JSON.stringify(diagnostics)}`);
  }
  onError() { this.globalErrors++; console.log('Browser runner/setup error; raw details intentionally omitted. Check safe harness preconditions.'); }
  onStdOut() {}
  onStdErr() {}
  onEnd(result) {
    const ended = new Date().toISOString();
    const counts = Object.fromEntries(['passed', 'failed', 'timedOut', 'skipped', 'interrupted'].map(status => [status, this.results.filter(test => test.status === status).length]));
    console.log(`SYNTHETIC browser result: ${result.status}; ${JSON.stringify(counts)}; runner errors ${this.globalErrors}.`);
    if (!enabled) return;
    const lines = [
      '# Synthetic browser evidence — Track J', '',
      '**SYNTHETIC DATA ONLY. Local verification, not production or clinical/provider certification.**', '',
      `- Run start (UTC): ${this.started}; end (UTC): ${ended}.`,
      `- Result: **${result.status.toUpperCase()}**; ${counts.passed}/${this.total} passed; failed ${counts.failed}; timed out ${counts.timedOut}; skipped ${counts.skipped}; interrupted ${counts.interrupted}; runner errors ${this.globalErrors}. No automatic retries.`,
      `- Node ${process.version}; browser channel ${process.env.PLAYWRIGHT_CHANNEL === 'chrome' ? 'installed Chrome (temporary Playwright profile)' : 'Playwright default Chromium'}; 1440 × 1100; en-US; UTC browser timezone.`,
      '- Built backend and Vite preview, not Vite dev source. Existing VITE_DEV_API_PROXY routes same-origin API requests to the guarded local backend. Each server start creates its own empty schema; initializes and checks exact migrations [1, 2, 3]; normal shutdown drops only that schema.',
      '- API fixtures are synthetic, created through authenticated real HTTP requests (no bulk SQL seeding). API remains at its real 600 requests/minute limit. No deployed service, provider key, production DB, or real PHI is used.',
      '- Invocation: cached Node 22 PATH prefix supplied by the orchestrator; root npm run build (serial), then TEST_DATABASE_URL set to the approved loopback audit fixture, PLAYWRIGHT_CHANNEL=chrome EVIDENCE_SCREENSHOTS=true npm run test:e2e. Default/non-opt-in runs do not change this manifest or PNGs.',
      '- Trace, video, automatic screenshots, persistent auth state, raw console/network logs and automatic retained failure output are disabled. Diagnostics below are counts only; expected failure responses are explicitly allowed per test; all other browser failures fail the test.',
      '', '## Executed cases', '', '| Case | Status | Duration ms |', '|---|---|---:|',
      ...this.results.map(test => `| ${test.title} | ${test.status} | ${test.duration} |`),
      '', '## Browser diagnostics (counts only)', '',
      ...this.results.map(test => `- ${test.title}: ${test.diagnostics ? JSON.stringify(test.diagnostics) : 'not available (setup failed or teardown not reached)'}.`),
      '', '## Asserted screenshots / run manifest', '',
      'Each capture follows awaited UI assertions and an empty-password assertion. A test-only visible caption identifies synthetic/mocked content; it is not application functionality. PNGs show UI states only. Backend claims rely on the accompanying real API assertions, not screenshots alone.', '',
    ];
    for (const test of this.results) for (const shot of test.captures) {
      if (!names.includes(shot.name)) throw new Error('Unexpected evidence filename');
      const path = join(root, 'docs/verification/screenshots', `${shot.name}.png`);
      const digest = sha(readFileSync(path));
      lines.push(`### ${shot.name}`, '', `![${shot.caption}](screenshots/${shot.name}.png)`, '',
        `- Caption: ${shot.caption}`, `- UTC: ${shot.at}; associated case: **${test.status}**.`, `- PNG SHA-256: ${digest}`, '');
    }
    lines.push('## Artifact/source fingerprints', '',
      'SHA-256 of sorted [workspace-relative path, file SHA-256] lists (source/build trees, not secret files):', '',
      ...Object.entries(this.hashes).map(([path, digest]) => `- ${path}: ${digest}`), '',
      '## Scope and limitations', '',
      '- AI review uses a browser-intercepted, explicitly labeled synthetic response only. The real disabled-provider endpoint is separately asserted 503. No live AI result, OCR, camera, provider quality or provider approval is claimed.',
      '- The acknowledgement-loss scenario commits a real API write then returns a test-only 503 to the browser. The retry must retain the same key/resource ID and leave exactly one history row. It is deterministic fault injection, not a claim to simulate every network failure.',
      '- Delayed patient update uses a real API response withheld by browser interception; no clinical payload is fabricated. Note conflicts use genuine second/third API writes while the editor is stale, including a write after comparison.',
      '- Readiness is real /ready plus harness verification of migrations [1, 2, 3]. This browser gate does not mutate schema/indexes to test unavailable readiness, certify deployed roles, or replace Track E tests.',
      '- Legacy clinical wall timestamps can display a different day/time from the UTC evidence caption (observed on synthetic last-saved/created labels). This is consistent with the documented unresolved legacy wall-time ambiguity; J did not investigate its root cause or change runtime code. Browser UTC does not establish backend/database timezone correctness; see decision 0006.',
      '- Shared-clinic patient/history reads remain intentional. Private-template filtering and appointment-owner mutation denial do not establish tenant/care-team isolation. No immutable note history, audit durability, retention, MFA, cookie/BFF, or live-provider guarantee is claimed.',
      '- Directory and note-history pagination cross real page boundaries with more than 50 synthetic rows; other history surfaces have create/reload assertions but their exhaustive paging matrix remains Track F scope.',
      '- Historical Track D/F intermittent harness failures remain documented in their track reports with unresolved historical causes. A green browser run does not erase them.',
      '- Implementer iteration history (2026-09-20): initial standalone tsc command omitted --types node and failed before browser execution; corrected invocation passed. First full browser run was 7/8: the new direct-retry fixture used non-UUID keys and was correctly rejected by the API. Fixture changed to randomUUID(), not a runtime fix or relaxed assertion. Initial seven cases had zero unexpected browser diagnostics; the final run above supersedes their PNGs.',
      '- Harness self-review: Playwright default termination may bypass schema cleanup; explicit SIGTERM gracefulShutdown was added before final checks. Five pre-existing e2e schemas were observed at that point (including possible early implementer runs); none were deleted because ownership was not durably recorded. The safety runner checks before/after catalog equality for its own subsequent run.',
      '- Independent J evaluator: **PENDING main-orchestrator assignment**. No nested evaluator tool is available in this implementation session. This is implementer evidence, not independent acceptance.', '',
    );
    const target = join(root, 'docs/verification/browser-evidence.md');
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, lines.join('\n'));
  }
}
