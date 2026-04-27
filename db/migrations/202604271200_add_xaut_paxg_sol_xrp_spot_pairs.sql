-- Add new spot trading markets requested for metals and majors.
INSERT IGNORE INTO spot_markets (
  symbol,
  base_asset,
  base_decimals,
  quote_asset,
  quote_decimals,
  min_base_amount,
  min_quote_amount
)
VALUES
  ('XAUT/USDT', 'XAUT', 18, 'USDT', 18, 0.00001, 0.1),
  ('PAXG/USDT', 'PAXG', 18, 'USDT', 18, 0.00001, 0.1),
  ('SOL/USDT', 'SOL', 18, 'USDT', 18, 0.001, 0.1),
  ('XRP/USDT', 'XRP', 18, 'USDT', 18, 1, 0.1);

-- Ensure these pairs are enabled for trading and market orders.
UPDATE spot_markets
   SET active = 1,
       allow_market_orders = 1,
       updated_at = NOW()
 WHERE symbol IN ('XAUT/USDT', 'PAXG/USDT', 'SOL/USDT', 'XRP/USDT');
