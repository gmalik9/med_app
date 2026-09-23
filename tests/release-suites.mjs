import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Only these reviewed suites are DB-free. New suites default to integration.
export const backendUnitSuites = Object.freeze(['tests/security.test.ts', 'tests/configuration.test.ts']);

export function discoverBackendSuites(backendRoot) {
  const suites = [];
  function visit(directory) {
    for (const entry of readdirSync(resolve(backendRoot, directory), { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) visit(path);
      else if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) {
        // Keep discovery aligned with backend/vitest.config.ts; do not silently
        // omit a newly named JS/TSX/spec suite that Vitest would not discover.
        if (!entry.name.endsWith('.test.ts')) throw new Error('Unsupported backend suite naming; update discovery and Vitest together');
        suites.push(path);
      }
    }
  }
  visit('tests');
  for (const unit of backendUnitSuites) {
    if (!suites.includes(unit)) throw new Error('Required backend unit suite is missing');
  }
  return { unit: [...backendUnitSuites], integration: suites.filter(path => !backendUnitSuites.includes(path)).sort() };
}

export function assertIntegrationReport(report, expectedFiles) {
  const fail = () => { throw new Error('Required integration report incomplete: missing, failed, skipped or todo tests'); };
  if (!report || report.success !== true || !Number.isInteger(report.numTotalTests) || report.numTotalTests < 1
    || report.numPassedTests !== report.numTotalTests || report.numFailedTests !== 0
    || report.numPendingTests !== 0 || report.numTodoTests !== 0 || !Array.isArray(report.testResults)) fail();
  const names = report.testResults.map(file => typeof file.name === 'string' ? resolve(file.name) : '');
  const expected = expectedFiles.map(file => resolve(file));
  if (names.length !== expected.length || new Set(names).size !== names.length || expected.some(name => !names.includes(name))) fail();
  let count = 0;
  for (const file of report.testResults) {
    if (file.status !== 'passed' || !Array.isArray(file.assertionResults) || !file.assertionResults.length
      || file.assertionResults.some(test => test.status !== 'passed')) fail();
    count += file.assertionResults.length;
  }
  if (count !== report.numTotalTests) fail();
}
