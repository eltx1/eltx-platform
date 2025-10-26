import { ethers } from 'ethers';

const RPC_HTTP = process.env.RPC_HTTP?.trim();
if (!RPC_HTTP) {
  throw new Error(
    'RPC_HTTP missing. Make sure apps/worker/.env or project .env is loaded before imports. ' +
      'See README for required ENV and copy command for apps/worker/.env.'
  );
}
const CHAIN_ID = Number(process.env.CHAIN_ID);

export const rpcProvider = new ethers.JsonRpcProvider(RPC_HTTP, CHAIN_ID);

export async function getLatestBlockNumber(): Promise<number> {
  return await rpcProvider.getBlockNumber();
}

export async function getLogs(params: ethers.Filter): Promise<ethers.Log[]> {
  return await rpcProvider.getLogs(params);
}

export async function getBlocksWithTxsBatch(blockNumbers: number[]): Promise<ethers.Block[]> {
  const results: ethers.Block[] = [];
  const batches = [];
  const size = 50;
  for (let i = 0; i < blockNumbers.length; i += size) {
    batches.push(blockNumbers.slice(i, i + size));
  }
  for (const batch of batches) {
    const promises = batch.map((n) => rpcProvider.getBlock(n, true));
    const blocks = await Promise.all(promises);
    results.push(...blocks.filter((b): b is ethers.Block => !!b));
  }
  return results;
}
