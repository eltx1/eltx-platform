-- Convert live eligibility flags + production mock fallback policy

SET @schema_name := DATABASE();

-- Add convert pair live eligibility fields (safe to re-run)
SET @has_live_enabled := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='convert_pairs' AND COLUMN_NAME='live_enabled'
);
SET @has_live_status := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='convert_pairs' AND COLUMN_NAME='live_status'
);
SET @has_last_live_probe_at := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='convert_pairs' AND COLUMN_NAME='last_live_probe_at'
);
SET @has_last_live_error := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='convert_pairs' AND COLUMN_NAME='last_live_error'
);

SET @alter_convert_pairs_live_sql := (
  SELECT TRIM(BOTH ', ' FROM CONCAT(
    'ALTER TABLE convert_pairs ',
    IF(@has_live_enabled = 0, 'ADD COLUMN live_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER active, ', ''),
    IF(@has_live_status = 0, 'ADD COLUMN live_status VARCHAR(24) NULL AFTER live_enabled, ', ''),
    IF(@has_last_live_probe_at = 0, 'ADD COLUMN last_live_probe_at DATETIME NULL AFTER live_status, ', ''),
    IF(@has_last_live_error = 0, 'ADD COLUMN last_live_error VARCHAR(255) NULL AFTER last_live_probe_at, ', '')
  ))
);
SET @alter_convert_pairs_live_sql := IF(@alter_convert_pairs_live_sql='ALTER TABLE convert_pairs', 'SELECT 1', @alter_convert_pairs_live_sql);
PREPARE alter_convert_pairs_live_stmt FROM @alter_convert_pairs_live_sql;
EXECUTE alter_convert_pairs_live_stmt;
DEALLOCATE PREPARE alter_convert_pairs_live_stmt;

UPDATE convert_pairs
SET live_enabled = COALESCE(live_enabled, 1),
    live_status = COALESCE(NULLIF(live_status, ''), 'unknown')
WHERE 1=1;

-- Make fallback policy explicit in production-capable setting
INSERT INTO platform_settings (`name`, `value`)
VALUES
  ('convert_mock_allowed_in_production', '1')
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);
