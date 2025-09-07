import { createPool } from 'mysql2/promise';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL missing');
}

const pool = createPool(process.env.DATABASE_URL);

export const sql = {
  async query<T = any>(q: string, params: any[] = []): Promise<T[]> {
    const [rows] = await pool.query(q, params);
    return rows as T[];
  },
  async oneOrNone<T = any>(q: string, params: any[] = []): Promise<T | null> {
    const rows = await this.query<T>(q, params);
    return rows.length ? (rows[0] as T) : null;
  },
};
