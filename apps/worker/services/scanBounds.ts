const DEFAULT_RECENT_BLOCKS = Number(process.env.USER_SCAN_RECENT_BLOCKS || 1000);
const SAFETY_BUFFER = Number(process.env.USER_SCAN_SAFETY || 12);

export async function getScanBounds(addr: string, latestBlock: number): Promise<{ fromBlock: number; toBlock: number }> {
  const baseline = latestBlock - DEFAULT_RECENT_BLOCKS + 1;
  const row = await sql.oneOrNone<{ max: number }>(
    'SELECT MAX(block_number) AS max FROM wallet_deposits WHERE to_address=?',
    [addr.toLowerCase()]
  );
  let from = baseline;
  if (row && row.max != null) {
    from = Math.max(Number(row.max) - SAFETY_BUFFER, baseline);
  }
  if (from < 0) from = 0;
  return { fromBlock: from, toBlock: latestBlock };
}
