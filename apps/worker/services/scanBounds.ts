const DEFAULT_RECENT_BLOCKS = Number(process.env.USER_SCAN_RECENT_BLOCKS || 1000);

// Previous iterations of the worker attempted to persist per-address
// scan progress in a dedicated table. That table no longer exists and the
// worker simply rescans a recent window of blocks for every address on each
// loop. Any duplicate deposits are handled by the database via
// `ON DUPLICATE KEY` clauses in the upsert logic.
export async function getFromBlockForAddress(_addr: string, latestBlock: number): Promise<number> {
  const baseline = latestBlock - DEFAULT_RECENT_BLOCKS + 1;
  return Math.max(0, baseline);
}
