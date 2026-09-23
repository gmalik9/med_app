/**
 * READ-ONLY SOURCE CHECKS — NOT runtime security or compliance tests.
 * Reads only the explicit source/document allowlist below. No app imports,
 * environment loading, DB/network/process spawning, writes or credentials.
 * Exit 2 ALWAYS means policy/release gates remain blocked, even when artifacts
 * are structurally valid. Exit 1 means source drift or an artifact/check error.
 * There is deliberately no success exit claiming tenant/MFA/outbox implementation.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const decisions = [
  '0001-phi-access-model',
  '0002-identity-provisioning',
  '0003-browser-session-topology',
  '0004-audit-availability',
  '0005-clinical-versioning-retention',
  '0006-legacy-time',
  '0007-infrastructure-vendors',
].map(name => `docs/decisions/${name}.md`);
const reportPath = 'docs/verification/track-h-decisions.md';
const mounts = [
  ['backend/src/app.ts', 'app', ''],
  ...['auth', 'patients', 'notes', 'vitals', 'appointments', 'visits', 'templates', 'analytics']
    .map(name => [`backend/src/routes/${name}.ts`, 'router', `/api/${name}`]),
];
const sources = [...new Set([
  ...mounts.map(([path]) => path),
  'backend/src/middleware/auth.ts',
  'backend/src/middleware/auditLog.ts',
  'backend/src/middleware/safeAuditMetadata.ts',
  'backend/src/services/auditedWrite.ts',
  'backend/src/services/idempotency.ts',
  'backend/src/services/sessions.ts',
  'backend/src/services/stickerOcr.ts',
  'backend/src/db/schema.ts',
  'backend/src/db/migrations.ts',
  'backend/src/db/schemaState.ts',
  'backend/src/db/preflight.ts',
  'backend/src/db/index.ts',
  'backend/src/config.ts',
  'frontend/src/utils/apiClient.ts',
  'frontend/src/components/TemplatesAnalyticsPanel.tsx',
  'frontend/nginx.conf',
])];

function inspect() {
  if (process.argv.length !== 2) throw new Error('unsupported_arguments');
  const text = new Map([...sources, ...decisions, reportPath]
    .map(path => [path, readFileSync(resolve(root, path), 'utf8')]));
  const errors = [];
  const includes = (path, value) => text.get(path).includes(value);

  decisions.forEach((path, index) => {
    const doc = text.get(path);
    for (const required of [
      '**Status: PENDING — NOT IMPLEMENTED.**',
      `Question Q${index + 1}`, '## Negative acceptance specs — NOT RUN',
      '## Rollout and rollback', '## Unblocking evidence',
    ]) {
      if (!doc.includes(required)) errors.push(`ADR_${index + 1}_missing_required_label_or_section`);
    }
    if (!new RegExp(`\\| H${index + 1}\\.\\d+ \\|`).test(doc)) {
      errors.push(`ADR_${index + 1}_missing_acceptance_scenarios`);
    }
  });

  // Validate only local link targets in owned docs, without reading target files.
  // No HTTP fetches, broad directory scanning or secret/environment-file reads.
  let linkCount = 0;
  for (const path of [...decisions, reportPath]) {
    for (const match of text.get(path).matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = match[1].split('#')[0];
      if (!target || /^[a-z]+:/i.test(target)) continue;
      const absolute = resolve(root, dirname(path), decodeURIComponent(target));
      const rel = relative(root, absolute);
      if (rel.startsWith('..') || !existsSync(absolute)) errors.push(`broken_or_external_local_link_in_${path}`);
      linkCount++;
    }
  }

  // Lexical catalog of the current explicit Express declarations, not a router
  // execution test. Mounts are pinned below; dynamic routes require manual review.
  for (const [, , mount] of mounts.slice(1)) {
    if (!text.get('backend/src/app.ts').includes(`app.use('${mount}',`)) errors.push('route_mount_drift');
  }
  const routes = [];
  for (const [path, owner, prefix] of mounts) {
    const pattern = new RegExp(`\\b${owner}\\.(get|post|put|patch|delete|head|options)\\('([^']*)'`, 'g');
    for (const match of text.get(path).matchAll(pattern)) {
      routes.push(`${match[1].toUpperCase()} ${prefix}${match[2]}`);
    }
  }
  const matrix = [...text.get(decisions[0]).matchAll(/\| `(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) ([^`]+)` \|/g)]
    .map(match => `${match[1]} ${match[2]}`);
  const missing = routes.filter(route => !matrix.includes(route));
  const stale = matrix.filter(route => !routes.includes(route));
  if (missing.length || stale.length || new Set(matrix).size !== matrix.length) errors.push('endpoint_matrix_drift');

  // Positive lexical observations of known remaining gaps, never proofs of
  // absence of controls elsewhere. If anchors change, require human re-review.
  const observations = [
    ['Q1', 'Shared patient/history predicates remain; scope/role policy needs implementation',
      includes('backend/src/routes/patients.ts', 'FROM patients p WHERE patient_id = $1') &&
      includes('backend/src/routes/notes.ts', 'WHERE cn.patient_id = $1')],
    ['Q2', 'Local password login issues sessions; approved MFA/lifecycle not established by this check',
      includes('backend/src/routes/auth.ts', 'comparePassword(password, user.password_hash)') &&
      includes('backend/src/services/sessions.ts', 'accessToken, refreshToken')],
    ['Q3', 'Browser credentials are written to JavaScript-readable sessionStorage',
      includes('frontend/src/utils/apiClient.ts', "sessionStorage.setItem('accessToken', accessToken)") &&
      includes('frontend/src/utils/apiClient.ts', "sessionStorage.setItem('refreshToken', refreshToken)")],
    ['Q4', 'Request writer is non-awaited; finish events are not a durable pre-disclosure outbox',
      includes('backend/src/middleware/auditLog.ts', 'void (async () =>') &&
      includes('backend/src/middleware/auditLog.ts', "res.once('finish'") &&
      includes('backend/src/middleware/auditLog.ts', 'next();')],
    ['Q5', 'Note updates overwrite text; current-note revision counter is not historical snapshots',
      includes('backend/src/routes/notes.ts', 'SET note_text = EXCLUDED.note_text') &&
      includes('backend/src/db/schema.ts', 'ON DELETE CASCADE')],
    ['Q6', 'Legacy appointment wall timestamps and wall-time canonicalization persist',
      includes('backend/src/db/schema.ts', 'appointment_date TIMESTAMP NOT NULL') &&
      includes('backend/src/services/idempotency.ts', "$1::timestamp, 'YYYY-MM-DD")],
    ['Q7', 'Optional provider switch exists; external infrastructure/contracts remain UNVERIFIED',
      includes('backend/src/config.ts', "aiEnabled: process.env.ENABLE_EXTERNAL_AI === 'true'") &&
      includes('backend/src/app.ts', 'generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent')],
  ].map(([gate, finding, observed]) => ({ gate, finding, observed,
    assessment: observed ? 'NONCOMPLIANCE_WITH_PROPOSED_GATE_NOT_LEGAL_DETERMINATION' : 'SOURCE_DRIFT_REVIEW_REQUIRED',
    decision: 'PENDING_NOT_IMPLEMENTED', controlVerified: false }));
  if (observations.some(row => !row.observed)) errors.push('source_observation_drift');

  const scenarios = decisions.reduce((sum, path) => sum + [...text.get(path).matchAll(/\| H[1-7]\.\d+ \|/g)].length, 0);
  return {
    kind: 'READ_ONLY_SOURCE_CHARACTERIZATION_NOT_RUNTIME_TESTS',
    timestamp: new Date().toISOString(), node: process.version,
    artifactChecks: errors.length ? 'FAIL_REVIEW_REQUIRED' : 'PASS_DOCUMENT_STRUCTURE_ONLY',
    releaseGate: 'BLOCKED_ALL_Q1_Q7_PENDING',
    independentEvaluation: 'PENDING_MAIN_ASSIGNMENT',
    routesInventoried: routes.length, matrixRows: matrix.length, missing, stale,
    localLinksChecked: linkCount, acceptanceScenariosSpecified: scenarios,
    acceptanceScenariosExecuted: 0, runtimeControlsVerified: 0,
    observations, errors,
    sourceSha256: Object.fromEntries(sources.map(path => [path,
      createHash('sha256').update(text.get(path)).digest('hex')])),
  };
}

try {
  const report = inspect();
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.errors.length ? 1 : 2;
} catch {
  // Do not print source contents, filesystem errors, environment or stack traces.
  console.error('POLICY_SOURCE_CHECK_ERROR: explicit file/argument/format review required; no compliance result.');
  process.exitCode = 1;
}
