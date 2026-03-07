ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_premium TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS premium_expires_at DATETIME NULL;

INSERT INTO platform_settings (name, value)
VALUES
  ('premium_monthly_price_usdt', '1'),
  ('social_feed_premium_ratio', '80'),
  ('social_feed_regular_ratio', '20')
ON DUPLICATE KEY UPDATE value = VALUES(value);
