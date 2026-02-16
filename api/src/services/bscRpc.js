const { ethers } = require('ethers');

const RPC_HTTP = process.env.RPC_HTTP || process.env.BSC_RPC_URL;
const isDemoMode = process.env.DEMO_MODE === 'true' || process.env.NODE_ENV === 'test';
const CHAIN_ID = Number(process.env.CHAIN_ID || 56);
let provider;
if (!RPC_HTTP) {
  if (!isDemoMode) throw new Error('RPC_HTTP is not set');
  console.warn('[bscRpc] DEMO_MODE enabled; using stubbed RPC provider.');
  provider = {
    getBlockNumber: async () => 0,
    getLogs: async () => [],
    getBlock: async () => null,
  };
} else {
  provider = new ethers.JsonRpcProvider(RPC_HTTP, CHAIN_ID);
}

async function getLatestBlockNumber() {
  return provider.getBlockNumber();
}

async function getLogs(params) {
  return provider.getLogs(params);
}

async function getBlocksWithTxsBatch(blockNumbers = []) {
  const blocks = [];
  for (const num of blockNumbers) {
    const block = await provider.getBlock(num, true);
    if (block) blocks.push(block);
  }
  return blocks;
}

module.exports = { getLatestBlockNumber, getLogs, getBlocksWithTxsBatch };
