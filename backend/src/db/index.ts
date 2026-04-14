import { Pool } from 'pg';
import { config } from '../config';

const pool = new Pool({
  connectionString: config.databaseUrl,
});

pool.on('error', (err: Error) => {
  console.error('Unexpected error on idle client', err);
});

// Retry logic for database connections
async function queryWithRetry(text: string, params?: any[], retries = 3, delayMs = 1000): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      return await pool.query(text, params);
    } catch (err: any) {
      if (i === retries - 1) throw err;
      
      // Only retry on connection errors
      if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.message?.includes('does not exist')) {
        console.warn(`Database connection attempt ${i + 1} failed, retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        delayMs *= 2; // Exponential backoff
      } else {
        throw err;
      }
    }
  }
}

export const query = (text: string, params?: any[]) => {
  return queryWithRetry(text, params);
};

export const getClient = () => {
  return pool.connect();
};

export default pool;
