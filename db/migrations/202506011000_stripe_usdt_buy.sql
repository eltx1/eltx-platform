-- Add USDT pricing support for Stripe card purchases
ALTER TABLE stripe_pricing
  ADD COLUMN IF NOT EXISTS price_usdt DECIMAL(36,18) NOT NULL DEFAULT 1 AFTER price_eltx;

UPDATE stripe_pricing
SET price_usdt = CASE
  WHEN price_usdt IS NULL OR price_usdt <= 0 THEN price_eltx
  ELSE price_usdt
END,
updated_at = NOW()
WHERE id = 1;

-- Store the purchased asset on fiat_purchases
ALTER TABLE fiat_purchases
  ADD COLUMN IF NOT EXISTS asset VARCHAR(32) NOT NULL DEFAULT 'ELTX' AFTER status,
  ADD COLUMN IF NOT EXISTS asset_decimals INT UNSIGNED NULL AFTER asset,
  ADD COLUMN IF NOT EXISTS price_asset DECIMAL(36,18) NOT NULL DEFAULT 0 AFTER amount_charged_minor,
  ADD COLUMN IF NOT EXISTS asset_amount DECIMAL(36,18) NOT NULL DEFAULT 0 AFTER price_eltx,
  ADD COLUMN IF NOT EXISTS asset_amount_wei DECIMAL(65,0) NOT NULL DEFAULT 0 AFTER eltx_amount;

UPDATE fiat_purchases
SET
  asset = COALESCE(NULLIF(asset, ''), 'ELTX'),
  asset_decimals = COALESCE(asset_decimals, 18),
  price_asset = CASE WHEN price_asset IS NULL OR price_asset = 0 THEN price_eltx ELSE price_asset END,
  asset_amount = CASE WHEN asset_amount IS NULL OR asset_amount = 0 THEN eltx_amount ELSE asset_amount END,
  asset_amount_wei = CASE WHEN asset_amount_wei IS NULL OR asset_amount_wei = 0 THEN eltx_amount_wei ELSE asset_amount_wei END,
  updated_at = NOW()
WHERE asset IS NULL
  OR asset = ''
  OR price_asset IS NULL
  OR price_asset = 0
  OR asset_amount IS NULL
  OR asset_amount = 0
  OR asset_amount_wei IS NULL
  OR asset_amount_wei = 0;
