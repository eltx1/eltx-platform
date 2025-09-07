import { createPool } from 'mysql2/promise';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL missing');
}

export const pool = createPool(process.env.DATABASE_URL);

async function query<T = any>(q: string, params: any[] = []): Promise<T[]> {
  const [rows] = await pool.query(q, params);
  return rows as T[];
}

async function oneOrNone<T = any>(q: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(q, params);
  return rows.length ? (rows[0] as T) : null;
}

export const sql = { query, oneOrNone };
