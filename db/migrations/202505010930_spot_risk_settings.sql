-- Seed spot trading fee split and risk guardrails
INSERT INTO platform_settings (name, value)
VALUES
  ('spot_maker_fee_bps', '50'),
  ('spot_taker_fee_bps', '50'),
  ('spot_max_slippage_bps', '300'),
  ('spot_max_deviation_bps', '800'),
  ('spot_candle_fetch_cap', '3000')
ON DUPLICATE KEY UPDATE value = VALUES(value);
