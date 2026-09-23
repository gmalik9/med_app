import { checkSchemaReady, readSchemaState, withReadOnlyDatabase } from './schemaState';
import { runPreflight } from './preflight';

export function parseDatabaseCommand(args: string[], env: NodeJS.ProcessEnv = process.env): 'check' | 'preflight' | 'migrate' {
  const [command, ...flags] = args;
  if (!['check', 'preflight', 'migrate'].includes(command) || flags.some(flag => !['--approved-production', '--confirm-migration'].includes(flag))) {
    throw new Error('database_command_usage: check|preflight|migrate [--approved-production] [--confirm-migration]');
  }
  // Do not fall back to dotenv, PGHOST, PGDATABASE, or a developer default.
  // Unit/test discovery cannot cause a connection or run a migration.
  if (!env.DATABASE_URL || env.NODE_ENV === 'test') throw new Error('database_command_requires_explicit_operator_environment');
  try {
    const url = new URL(env.DATABASE_URL);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname.length < 2) throw new Error();
  } catch { throw new Error('database_command_invalid_url'); }
  if (env.NODE_ENV === 'production' && !flags.includes('--approved-production')) throw new Error('database_command_requires_production_approval');
  if (command === 'migrate' && !flags.includes('--confirm-migration')) throw new Error('database_command_requires_migration_confirmation');
  if (command === 'migrate' && env.NODE_ENV === 'production' && env.RELEASE_MIGRATION_APPROVED !== 'true') {
    throw new Error('database_command_requires_release_migration_approval');
  }
  return command as 'check' | 'preflight' | 'migrate';
}

export async function runDatabaseCommand(args: string[]): Promise<number> {
  const command = parseDatabaseCommand(args);
  const pool = (await import('./index')).default;
  try {
    if (command === 'preflight') {
      const report = await runPreflight(pool);
      console.log(JSON.stringify(report));
      return report.outcome === 'blocked' ? 2 : report.outcome === 'review' ? 3 : 0;
    }
    if (command === 'migrate') {
      // Dedicated connection avoids starving a DB_POOL_MAX=1 application pool.
      const { Client } = await import('pg');
      const lock = new Client({ connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 5000, statement_timeout: 15000, application_name: 'medical-notes-migration-lock' });
      await lock.connect();
      try {
        // Separate session lock serializes the WHOLE explicit CLI lifecycle.
        // Existing schema/migrations keep their shared transaction lock 73410291.
        // A try-lock avoids an unbounded deploy queue; never break another lock.
        const result = await lock.query<{ locked: boolean }>('SELECT pg_try_advisory_lock(73410292) AS locked');
        if (!result.rows[0].locked) throw new Error('database_migration_already_running');
        const state = await withReadOnlyDatabase(readSchemaState, pool);
        if (state.unsupportedVersions.length || state.versions.some((version, i) => version !== i + 1)) {
          throw new Error('database_migration_unsupported_history');
        }
        await (await import('./schema')).initializeDatabase();
        const { migrateDatabase, IdempotencyMigrationCollisionError } = await import('./migrations');
        try { await migrateDatabase(); }
        catch (error) {
          // Never forward error.message, SQL/driver fields, linkage, or URLs.
          // Even typed error fields are checked before entering release logs.
          if (!(error instanceof IdempotencyMigrationCollisionError)
            || !/^\d+$/.test(error.collisionGroups) || !/^\d+$/.test(error.collisionRows)) throw error;
          console.error(JSON.stringify({ event: 'database_migration_blocked', migration: 3,
            reason: 'idempotency_scope_collisions', collisionGroups: error.collisionGroups, collisionRows: error.collisionRows,
            action: 'Pause keyed creation; arrange approved human reconciliation. Do not delete records or automatically rewrite keys. See docs/verification/track-d-idempotency.md.' }));
          return 1;
        }
      } finally {
        await lock.query('SELECT pg_advisory_unlock(73410292)').catch(() => undefined);
        await lock.end();
      }
    }
    await checkSchemaReady(pool);
    console.log(JSON.stringify({ event: `database_${command}_complete` }));
    return 0;
  } finally { await pool.end(); }
}

// Importing the CLI is inert, including from tests. No raw driver errors/URLs.
if (require.main === module) {
  runDatabaseCommand(process.argv.slice(2)).then(code => { process.exitCode = code; }).catch(() => {
    console.error(JSON.stringify({ event: 'database_command_failed' }));
    process.exitCode = 1;
  });
}
