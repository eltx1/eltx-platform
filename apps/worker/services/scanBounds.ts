import { sql } from './db.ts';

const DEFAULT_RECENT_BLOCKS = Number(process.env.USER_SCAN_RECENT_BLOCKS || 1000);
const SAFETY_BUFFER = Number(process.env.USER_SCAN_SAFETY || 12);

export async function getFromBlockForAddress(addr: string, latestBlock: number): Promise<number> {
  const row = await sql.oneOrNone<{ max_block: number }>(
    `SELECT MAX(block_number) AS max_block FROM wallet_deposits WHERE LOWER(to_address) = LOWER(?)`,
    [addr]
  );

  const baseline = latestBlock - DEFAULT_RECENT_BLOCKS + 1;
  const maxBlock = row?.max_block ? Number(row.max_block) : null;

  if (!maxBlock) {
    return Math.max(0, baseline);
  }

  const from = Math.max(baseline, maxBlock - SAFETY_BUFFER);
  return Math.max(0, from);
}
