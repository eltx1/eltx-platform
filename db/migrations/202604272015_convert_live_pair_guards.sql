-- Convert live pair readiness guard + stablecoin-decimals-safe defaults

INSERT INTO platform_settings (`name`, `value`)
VALUES
  ('convert_execution_mode', 'live'),
  ('convert_live_fallback_mock', '1'),
  ('convert_require_pair_address_live', '1')
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);

-- Ensure quote asset token for convert rows is explicit and uppercase where possible
UPDATE convert_pairs
SET quote_asset = UPPER(quote_asset)
WHERE quote_asset IS NOT NULL;

-- Keep existing token_decimals if present; otherwise backfill from common defaults
UPDATE convert_pairs
SET token_decimals = CASE
  WHEN token_decimals IS NOT NULL THEN token_decimals
  WHEN UPPER(base_asset) IN ('USDT','USDC','XRP') THEN 6
  ELSE 18
END
WHERE token_decimals IS NULL;
