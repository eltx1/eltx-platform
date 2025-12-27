-- Market maker defaults and spot market guardrails
ALTER TABLE spot_markets
  ADD COLUMN IF NOT EXISTS allow_market_orders TINYINT(1) NOT NULL DEFAULT 1 AFTER active,
  ADD COLUMN IF NOT EXISTS updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

-- Disable market orders for volatile pairs (limit-only until re-enabled by admin)
UPDATE spot_markets
   SET allow_market_orders = 0,
       updated_at = NOW()
 WHERE symbol IN ('ETH/USDT', 'WBTC/USDT', 'BNB/USDT');

-- Seed market maker runtime controls
INSERT INTO platform_settings (name, value)
VALUES
  ('market_maker_enabled', '0'),
  ('market_maker_spread_bps', '200'),
  ('market_maker_refresh_minutes', '30'),
  ('market_maker_user_email', 'info.eltx@gmail.com'),
  ('market_maker_pairs', 'ETH/USDT,WBTC/USDT,BNB/USDT'),
  ('market_maker_target_base_pct', '50')
ON DUPLICATE KEY UPDATE value = VALUES(value);
