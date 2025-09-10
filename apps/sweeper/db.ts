import { createPool, Pool } from "mysql2/promise";
import { config as dotenv } from "dotenv";
import path from "path";

dotenv({ path: path.join(__dirname, "../../.env") });

let pool: Pool | null = null;

export async function getPool(): Promise<Pool> {
  if (pool) return pool;
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing");
  pool = createPool(process.env.DATABASE_URL);
  return pool;
}
