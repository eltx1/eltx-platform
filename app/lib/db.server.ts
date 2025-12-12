import { createPool, Pool } from 'mysql2/promise';

let pool: Pool | null = null;

export function getDb(): Pool {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not configured');
  }
  pool = createPool(url);
  return pool;
}
