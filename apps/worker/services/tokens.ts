import { ethers } from 'ethers';

export const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');

export type TokenInfo = {
  symbol: string;
  address: string | null;
};

export function getTokensInScope(): TokenInfo[] {
  const list: TokenInfo[] = [{ symbol: 'BNB', address: null }];
  const usdt = (process.env.TOKEN_USDT || '0x55d398326f99059ff775485246999027b3197955').toLowerCase();
  const usdc = (process.env.TOKEN_USDC || '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d').toLowerCase();
  list.push({ symbol: 'USDT', address: usdt });
  list.push({ symbol: 'USDC', address: usdc });
  return list;
}

export function checksum(addr: string): string {
  return ethers.getAddress(addr);
}

export function hexToDec(hex: string | bigint): string {
  return BigInt(hex).toString();
}

export function decodeTransfer(log: { data: string; topics: string[] }) {
  const from = '0x' + log.topics[1].slice(26);
  const to = '0x' + log.topics[2].slice(26);
  const amount = hexToDec(log.data);
  return { from, to, amount };
}
