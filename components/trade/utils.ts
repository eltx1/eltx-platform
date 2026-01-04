export function resolveSpotMarketSymbol(symbol: string): string {
  const upper = symbol.toUpperCase();
  const known: Record<string, string> = {
    ELTX: 'ELTX/USDT',
    BTC: 'BTC/USDT',
    ETH: 'ETH/USDT',
    BNB: 'BNB/USDT',
    SOL: 'SOL/USDT',
    WBTC: 'WBTC/USDT',
  };

  if (known[upper]) return known[upper];
  return `${upper}/USDT`;
}
