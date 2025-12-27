export type SpotMarket = {
  id: number;
  symbol: string;
  base_asset: string;
  base_decimals: number;
  quote_asset: string;
  quote_decimals: number;
  min_base_amount: string;
  min_quote_amount: string;
  last_price: string | null;
  price_precision?: number;
  amount_precision?: number;
  allow_market_orders?: boolean;
  min_price?: string | null;
  max_price?: string | null;
  price_min?: string | null;
  price_max?: string | null;
};

export type MarketsResponse = {
  markets: SpotMarket[];
  fees?: { maker_bps?: number | null; taker_bps?: number | null };
};
