-- manual-safe migration for convert pair route controls (idempotent)
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
SET @has_last_route_probe_status := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='convert_pairs' AND COLUMN_NAME='last_route_probe_status');
SET @has_last_route_probe_error := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='convert_pairs' AND COLUMN_NAME='last_route_probe_error');
SET @has_last_route_probe_at := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='convert_pairs' AND COLUMN_NAME='last_route_probe_at');
SET @has_last_working_buy_route_json := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='convert_pairs' AND COLUMN_NAME='last_working_buy_route_json');
SET @has_last_working_sell_route_json := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='convert_pairs' AND COLUMN_NAME='last_working_sell_route_json');

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
  IF(@has_min_usdt_override=0, "ADD COLUMN min_usdt_override DECIMAL(36,18) NULL, ", ''),
  IF(@has_max_usdt_override=0, "ADD COLUMN max_usdt_override DECIMAL(36,18) NULL, ", ''),
  IF(@has_last_route_probe_status=0, "ADD COLUMN last_route_probe_status VARCHAR(32) NULL, ", ''),
  IF(@has_last_route_probe_error=0, "ADD COLUMN last_route_probe_error VARCHAR(500) NULL, ", ''),
  IF(@has_last_route_probe_at=0, "ADD COLUMN last_route_probe_at DATETIME NULL, ", ''),
  IF(@has_last_working_buy_route_json=0, "ADD COLUMN last_working_buy_route_json LONGTEXT NULL, ", ''),
  IF(@has_last_working_sell_route_json=0, "ADD COLUMN last_working_sell_route_json LONGTEXT NULL, ", ''),
  'ADD COLUMN _tmp_convert_route_controls_marker INT NULL'
);
SET @sql := REPLACE(@sql, ', ADD COLUMN _tmp_convert_route_controls_marker INT NULL', '');
SET @sql := IF(@sql='ALTER TABLE convert_pairs ADD COLUMN _tmp_convert_route_controls_marker INT NULL', 'SELECT 1', @sql);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_cat_active_live := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='convert_pairs' AND INDEX_NAME='idx_convert_pairs_category_active_live');
SET @idx_symbol := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='convert_pairs' AND INDEX_NAME='idx_convert_pairs_symbol');
SET @idx_exec_route := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='convert_pairs' AND INDEX_NAME='idx_convert_pairs_exec_route');
SET @sql_idx1 := IF(@idx_cat_active_live=0, 'CREATE INDEX idx_convert_pairs_category_active_live ON convert_pairs(category, active, live_enabled)', 'SELECT 1');
PREPARE stmt1 FROM @sql_idx1; EXECUTE stmt1; DEALLOCATE PREPARE stmt1;
SET @sql_idx2 := IF(@idx_symbol=0, 'CREATE INDEX idx_convert_pairs_symbol ON convert_pairs(symbol)', 'SELECT 1');
PREPARE stmt2 FROM @sql_idx2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;
SET @sql_idx3 := IF(@idx_exec_route=0, 'CREATE INDEX idx_convert_pairs_exec_route ON convert_pairs(execution_provider, route_mode)', 'SELECT 1');
PREPARE stmt3 FROM @sql_idx3; EXECUTE stmt3; DEALLOCATE PREPARE stmt3;
