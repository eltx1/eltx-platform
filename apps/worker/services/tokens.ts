import { ethers } from 'ethers';

export const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');

export interface TokenInfo {
  symbol: string;
  address: string | null;
}

export function getTokensInScope(): TokenInfo[] {
  const list: TokenInfo[] = [{ symbol: 'BNB', address: null }];
  if (process.env.TOKEN_USDT) list.push({ symbol: 'USDT', address: process.env.TOKEN_USDT.toLowerCase() });
  if (process.env.TOKEN_USDC) list.push({ symbol: 'USDC', address: process.env.TOKEN_USDC.toLowerCase() });
  return list;
}

export function checksum(addr: string): string {
  return ethers.getAddress(addr);
}

export function hexToDec(hex: string | bigint): string {
  return BigInt(hex).toString();
}
