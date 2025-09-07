import { ethers } from 'ethers';

export const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');

interface TokenInfo {
  symbol: string;
  address: string | null;
  decimals: number;
}

const tokens: TokenInfo[] = [
  { symbol: 'BNB', address: null, decimals: 18 },
];

if (process.env.TOKEN_USDT) {
  tokens.push({ symbol: 'USDT', address: process.env.TOKEN_USDT.toLowerCase(), decimals: 18 });
}
if (process.env.TOKEN_USDC) {
  tokens.push({ symbol: 'USDC', address: process.env.TOKEN_USDC.toLowerCase(), decimals: 18 });
}

export const TOKENS_IN_SCOPE = tokens;
