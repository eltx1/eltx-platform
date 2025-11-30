-- Default swap and spot trading commissions (0.5%)
INSERT INTO platform_settings (name, value)
VALUES
  ('swap_fee_bps', '50'),
  ('spot_trade_fee_bps', '50')
ON DUPLICATE KEY UPDATE value = VALUES(value);

-- Expand ELTX spot pairs for BNB and ETH
INSERT IGNORE INTO spot_markets (symbol, base_asset, base_decimals, quote_asset, quote_decimals, min_base_amount, min_quote_amount)
VALUES
  ('ELTX/BNB', 'ELTX', 18, 'BNB', 18, 0.0001, 0.0001),
  ('ELTX/ETH', 'ELTX', 18, 'ETH', 18, 0.0001, 0.0001);
