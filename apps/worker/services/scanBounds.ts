import { sql } from './db';

const DEFAULT_RECENT_BLOCKS = Number(process.env.USER_SCAN_RECENT_BLOCKS || 1000);

export async function getScanBounds(
  addr: string,
  latestBlock: number
): Promise<{ fromBlock: number; toBlock: number }> {
  const baseline = latestBlock - DEFAULT_RECENT_BLOCKS + 1;
  const row = await sql.oneOrNone<{ max: number | null }>(
    'SELECT MAX(block_number) AS max FROM wallet_deposits WHERE LOWER(address)=?',
    [addr.toLowerCase()]
  );
  let from = baseline;
  const maxSeen = row?.max;
  if (maxSeen != null) {
    from = Math.max(baseline, Number(maxSeen) + 1);
  }
  if (from < 0) from = 0;
  return { fromBlock: from, toBlock: latestBlock };
}
