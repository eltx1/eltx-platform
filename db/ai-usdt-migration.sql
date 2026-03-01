-- AI billing migration: ELTX -> USDT
-- Safe to run multiple times.

-- 1) Ensure new setting key exists (platform_settings uses columns: name, value)
INSERT INTO platform_settings (name, value)
SELECT 'ai_message_price_usdt', ps.value
FROM platform_settings ps
WHERE ps.name = 'ai_message_price_eltx'
  AND NOT EXISTS (
    SELECT 1
    FROM platform_settings existing
    WHERE existing.name = 'ai_message_price_usdt'
  );

-- Fallback default if neither key exists
INSERT IGNORE INTO platform_settings (name, value)
VALUES ('ai_message_price_usdt', '1');

-- 2) Allow USDT charge_type in ai_message_ledger enum
ALTER TABLE ai_message_ledger
  MODIFY COLUMN charge_type ENUM('free','usdt','eltx') NOT NULL;
