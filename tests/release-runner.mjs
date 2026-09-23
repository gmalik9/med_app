import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertIntegrationReport, discoverBackendSuites } from './release-suites.mjs';
import { requireAuditDatabase } from './audit-database.cjs';
export { requireAuditDatabase };

const root = fileURLToPath(new URL('../', import.meta.url));

export function run(mode, env = process.env, execute = spawnSync) {
  if (mode === '--list-suites') {
    console.log(JSON.stringify(discoverBackendSuites(join(root, 'backend')), null, 2));
    return 0;
  }
  // Always check before typecheck/build/test so a missing prerequisite fails fast.
  requireAuditDatabase(env);
  const commands = {
    '--check-database': [],
    // New backend suites default to the required integration bucket. Only these
    // explicitly reviewed database-free suites belong in test:unit.
    '--integration': [['exec', '--workspace=backend', '--', 'vitest', 'run',
      '--exclude', 'tests/security.test.ts', '--exclude', 'tests/configuration.test.ts']],
    '--verify': [
      ['run', 'typecheck'], ['run', 'lint'], ['run', 'test:unit'],
      ['run', 'test:integration'], ['run', 'build'],
    ],
  }[mode];
  if (!commands) throw new Error('Unknown release runner mode');
  const suites = mode === '--integration' ? discoverBackendSuites(join(root, 'backend')).integration : [];
  const directory = mode === '--integration' ? mkdtempSync(join(tmpdir(), 'medapp-release-report-')) : null;
  try {
    for (const args of commands) {
      const reportPath = directory && join(directory, 'integration.json');
      // Keep human diagnostics AND machine evidence. JSON alone suppresses the
      // D/F HTTP traces. Only this invocation's private temporary report is removed.
      const reporters = reportPath ? ['--reporter=default', '--reporter=json', `--outputFile.json=${reportPath}`] : [];
      const child = execute(process.platform === 'win32' ? 'npm.cmd' : 'npm', [...args, ...reporters], {
        cwd: root, env, stdio: 'inherit',
      });
      if (child.error || child.signal || child.status !== 0) return child.status || 1;
      if (reportPath) {
        let report;
        try { report = JSON.parse(readFileSync(reportPath, 'utf8')); }
        catch { throw new Error('Required integration report missing or invalid'); }
        assertIntegrationReport(report, suites.map(file => join(root, 'backend', file)));
        console.log(`Required integration: ${suites.length} suites, ${report.numPassedTests} passed, zero skipped/todo.`);
      }
    }
    return 0;
  } finally {
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = run(process.argv[2]); }
  catch (error) { console.error(`Release prerequisite failed: ${error.message}`); process.exitCode = 1; }
}
