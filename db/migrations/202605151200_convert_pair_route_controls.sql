-- manual-safe migration for convert pair route controls
SET @schema_name := DATABASE();

SET @has_execution_provider := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='convert_pairs' AND COLUMN_NAME='execution_provider');
SET @has_route_mode := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='convert_pairs' AND COLUMN_NAME='route_mode');
SET @has_allowed_intermediate_tokens := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='convert_pairs' AND COLUMN_NAME='allowed_intermediate_tokens');
SET @has_allowed_fee_tiers := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='convert_pairs' AND COLUMN_NAME='allowed_fee_tiers');
SET @has_manual_buy_route_tokens := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='convert_pairs' AND COLUMN_NAME='manual_buy_route_tokens');
SET @has_manual_buy_route_fees := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='convert_pairs' AND COLUMN_NAME='manual_buy_route_fees');
SET @has_manual_sell_route_tokens := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='convert_pairs' AND COLUMN_NAME='manual_sell_route_tokens');
SET @has_manual_sell_route_fees := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='convert_pairs' AND COLUMN_NAME='manual_sell_route_fees');
SET @has_slippage_bps_override := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='convert_pairs' AND COLUMN_NAME='slippage_bps_override');
SET @has_min_usdt_override := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='convert_pairs' AND COLUMN_NAME='min_usdt_override');
SET @has_max_usdt_override := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='convert_pairs' AND COLUMN_NAME='max_usdt_override');

SET @sql := CONCAT(
  'ALTER TABLE convert_pairs ',
  IF(@has_execution_provider=0, "ADD COLUMN execution_provider VARCHAR(24) NOT NULL DEFAULT 'pancake_v3', ", ''),
  IF(@has_route_mode=0, "ADD COLUMN route_mode VARCHAR(24) NOT NULL DEFAULT 'auto', ", ''),
  IF(@has_allowed_intermediate_tokens=0, "ADD COLUMN allowed_intermediate_tokens VARCHAR(255) NULL, ", ''),
  IF(@has_allowed_fee_tiers=0, "ADD COLUMN allowed_fee_tiers VARCHAR(255) NULL, ", ''),
  IF(@has_manual_buy_route_tokens=0, "ADD COLUMN manual_buy_route_tokens VARCHAR(512) NULL, ", ''),
  IF(@has_manual_buy_route_fees=0, "ADD COLUMN manual_buy_route_fees VARCHAR(255) NULL, ", ''),
  IF(@has_manual_sell_route_tokens=0, "ADD COLUMN manual_sell_route_tokens VARCHAR(512) NULL, ", ''),
  IF(@has_manual_sell_route_fees=0, "ADD COLUMN manual_sell_route_fees VARCHAR(255) NULL, ", ''),
  IF(@has_slippage_bps_override=0, "ADD COLUMN slippage_bps_override INT NULL, ", ''),
  IF(@has_min_usdt_override=0, "ADD COLUMN min_usdt_override VARCHAR(32) NULL, ", ''),
  IF(@has_max_usdt_override=0, "ADD COLUMN max_usdt_override VARCHAR(32) NULL, ", '')
);
SET @sql := TRIM(TRAILING ', ' FROM @sql);
SET @sql := IF(@sql='ALTER TABLE convert_pairs', 'SELECT 1', @sql);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
