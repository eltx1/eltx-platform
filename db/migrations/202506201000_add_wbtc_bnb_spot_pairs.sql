-- Add WBTC and BNB spot trading markets
INSERT IGNORE INTO spot_markets (symbol, base_asset, base_decimals, quote_asset, quote_decimals, min_base_amount, min_quote_amount)
VALUES
  ('WBTC/USDT', 'WBTC', 18, 'USDT', 18, 0.00001, 0.1),
  ('BNB/USDT', 'BNB', 18, 'USDT', 18, 0.0001, 0.1);
