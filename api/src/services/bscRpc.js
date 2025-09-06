const { ethers } = require('ethers');

const RPC_HTTP = process.env.RPC_HTTP || process.env.BSC_RPC_URL;
if (!RPC_HTTP) throw new Error('RPC_HTTP is not set');
const CHAIN_ID = Number(process.env.CHAIN_ID || 56);
const provider = new ethers.JsonRpcProvider(RPC_HTTP, CHAIN_ID);

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
