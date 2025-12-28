-- Dedicated Stripe pricing table to decouple from swap asset pricing
CREATE TABLE IF NOT EXISTS stripe_pricing (
  id TINYINT UNSIGNED NOT NULL DEFAULT 1,
  price_eltx DECIMAL(36,18) NOT NULL,
  price_usdt DECIMAL(36,18) NOT NULL DEFAULT 1,
  min_usd DECIMAL(36,18) NOT NULL DEFAULT 10,
  max_usd DECIMAL(36,18) DEFAULT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE stripe_pricing
  ADD COLUMN IF NOT EXISTS price_eltx DECIMAL(36,18) NOT NULL AFTER id,
  ADD COLUMN IF NOT EXISTS price_usdt DECIMAL(36,18) NOT NULL DEFAULT 1 AFTER price_eltx,
  ADD COLUMN IF NOT EXISTS min_usd DECIMAL(36,18) NOT NULL DEFAULT 10 AFTER price_eltx,
  ADD COLUMN IF NOT EXISTS max_usd DECIMAL(36,18) NULL DEFAULT NULL AFTER min_usd,
  ADD COLUMN IF NOT EXISTS updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER max_usd;

-- seed a neutral row; actual Stripe pricing should be configured explicitly via admin/API
INSERT INTO stripe_pricing (id, price_eltx, price_usdt, min_usd, max_usd)
SELECT 1, 1, 1, 10, NULL
WHERE NOT EXISTS (SELECT 1 FROM stripe_pricing WHERE id=1);
