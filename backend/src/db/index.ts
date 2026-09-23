import { Pool, PoolClient, types } from 'pg';
import { config } from '../config';

// SQL DATE is a calendar date, not a timezone-dependent midnight instant.
types.setTypeParser(1082, value => value);
const pool = new Pool({
  connectionString: config.databaseUrl,
  max: config.poolMax,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  statement_timeout: 15000,
  application_name: 'medical-notes',
});

pool.on('error', () => console.error('database_pool_error'));

// Never replay a write automatically after an uncertain connection failure.
export const query = (text: string, params?: any[]) => pool.query(text, params);
export const getClient = () => pool.connect();
export async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const value = await work(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
export default pool;
