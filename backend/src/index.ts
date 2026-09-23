import { createApp } from './app';
import { config, validateProductionConfig } from './config';
import pool from './db';
import { initializeDatabase } from './db/schema';
import { migrateDatabase } from './db/migrations';
import { seedDatabase } from './db/seed';
import { checkSchemaReady } from './db/schemaState';

async function startServer() {
  validateProductionConfig();
  if (config.nodeEnv === 'production') {
    // Migration credentials/DDL belong to the explicitly approved release job.
    await checkSchemaReady();
  } else {
    await initializeDatabase();
    await migrateDatabase();
  }
  if (process.env.SEED_DATABASE === 'true') await seedDatabase();
  const server = createApp().listen(config.port, config.host, () => console.log(JSON.stringify({ event: 'server_started', port: config.port })));
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  const shutdown = () => {
    const deadline = setTimeout(() => process.exit(1), 25000).unref();
    server.close(() => { void pool.end().then(() => { clearTimeout(deadline); process.exit(0); }); });
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
startServer().catch(() => { console.error('startup_failed: check configuration and database availability'); process.exit(1); });
