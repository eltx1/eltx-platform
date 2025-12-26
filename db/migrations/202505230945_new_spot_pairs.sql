-- Add new spot trading markets for cross-stable and ETH pairs
INSERT IGNORE INTO spot_markets (symbol, base_asset, base_decimals, quote_asset, quote_decimals, min_base_amount, min_quote_amount)
VALUES
  ('USDT/USDC', 'USDT', 18, 'USDC', 18, 0.1, 0.1),
  ('ETH/USDT', 'ETH', 18, 'USDT', 18, 0.0001, 0.1),
  ('MCOIN/USDT', 'MCOIN', 18, 'USDT', 18, 0.0001, 0.1);
