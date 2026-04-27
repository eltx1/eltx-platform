-- Convert on-chain execution metadata and runtime settings (schema-compatible)

SET @schema_name := DATABASE();

-- platform_settings column compatibility (`key` or `name`)
SET @settings_key_col := (
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='platform_settings' AND COLUMN_NAME='key'
    ) THEN 'key'
    WHEN EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='platform_settings' AND COLUMN_NAME='name'
    ) THEN 'name'
    ELSE NULL
  END
);

SET @upsert_convert_settings_sql := IF(
  @settings_key_col IS NULL,
  'SELECT ''platform_settings missing expected key/name column'' AS warning_message',
  CONCAT(
    'INSERT INTO platform_settings (`', @settings_key_col, '`, `value`) VALUES ',
    '(''convert_execution_mode'', ''mock''),',
    '(''convert_slippage_bps'', ''120''),',
    '(''convert_live_fallback_mock'', ''1'') ',
    'ON DUPLICATE KEY UPDATE `value`=VALUES(`value`)'
  )
);
PREPARE upsert_convert_settings_stmt FROM @upsert_convert_settings_sql;
EXECUTE upsert_convert_settings_stmt;
DEALLOCATE PREPARE upsert_convert_settings_stmt;

-- convert_pairs schema updates (safe on re-run / mixed envs)
SET @has_token_address := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='convert_pairs' AND COLUMN_NAME='token_address'
);
SET @has_token_decimals := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='convert_pairs' AND COLUMN_NAME='token_decimals'
);

SET @alter_convert_pairs_sql := (
  SELECT TRIM(BOTH ', ' FROM CONCAT(
    'ALTER TABLE convert_pairs ',
    IF(@has_token_address = 0, 'ADD COLUMN token_address VARCHAR(42) NULL AFTER token_symbol, ', ''),
    IF(@has_token_decimals = 0, 'ADD COLUMN token_decimals TINYINT UNSIGNED NULL AFTER token_address, ', '')
  ))
);
SET @alter_convert_pairs_sql := IF(@alter_convert_pairs_sql='ALTER TABLE convert_pairs', 'SELECT 1', @alter_convert_pairs_sql);
PREPARE alter_convert_pairs_stmt FROM @alter_convert_pairs_sql;
EXECUTE alter_convert_pairs_stmt;
DEALLOCATE PREPARE alter_convert_pairs_stmt;

UPDATE convert_pairs
SET token_address = CASE UPPER(base_asset)
  WHEN 'BNB' THEN '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c'
  WHEN 'USDT' THEN '0x55d398326f99059ff775485246999027b3197955'
  WHEN 'WBTC' THEN '0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c'
  ELSE token_address
END,
    token_decimals = COALESCE(token_decimals, 18)
WHERE token_address IS NULL OR token_decimals IS NULL;

CREATE TABLE IF NOT EXISTS convert_executions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  pair_id BIGINT UNSIGNED NOT NULL,
  side ENUM('buy','sell') NOT NULL,
  status ENUM('processing','completed','failed') NOT NULL DEFAULT 'processing',
  amount_wei VARCHAR(80) NOT NULL,
  amount_decimals TINYINT UNSIGNED NOT NULL,
  quote_without_fee_wei VARCHAR(80) NOT NULL,
  quote_decimals TINYINT UNSIGNED NOT NULL,
  fee_wei VARCHAR(80) NOT NULL DEFAULT '0',
  debit_asset VARCHAR(16) NOT NULL,
  debit_wei VARCHAR(80) NOT NULL,
  credited_asset VARCHAR(16) NULL,
  credited_wei VARCHAR(80) NULL,
  tx_hash VARCHAR(120) NULL,
  fail_reason VARCHAR(500) NULL,
  idempotency_key VARCHAR(128) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_convert_executions_user (user_id),
  KEY idx_convert_executions_pair (pair_id),
  KEY idx_convert_executions_status (status),
  KEY idx_convert_executions_idempotency (user_id, idempotency_key),
  CONSTRAINT fk_convert_executions_pair FOREIGN KEY (pair_id) REFERENCES convert_pairs(id) ON DELETE RESTRICT,
  CONSTRAINT fk_convert_executions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @has_exec_idempotency_col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='convert_executions' AND COLUMN_NAME='idempotency_key'
);
SET @alter_convert_exec_sql := IF(
  @has_exec_idempotency_col = 0,
  'ALTER TABLE convert_executions ADD COLUMN idempotency_key VARCHAR(128) NULL AFTER fail_reason',
  'SELECT 1'
);
PREPARE alter_convert_exec_stmt FROM @alter_convert_exec_sql;
EXECUTE alter_convert_exec_stmt;
DEALLOCATE PREPARE alter_convert_exec_stmt;


SET @has_exec_idempotency_idx := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA=@schema_name
    AND TABLE_NAME='convert_executions'
    AND INDEX_NAME='idx_convert_executions_idempotency'
);
SET @add_convert_exec_idempotency_idx_sql := IF(
  @has_exec_idempotency_idx = 0,
  'ALTER TABLE convert_executions ADD KEY idx_convert_executions_idempotency (user_id, idempotency_key)',
  'SELECT 1'
);
PREPARE add_convert_exec_idempotency_idx_stmt FROM @add_convert_exec_idempotency_idx_sql;
EXECUTE add_convert_exec_idempotency_idx_stmt;
DEALLOCATE PREPARE add_convert_exec_idempotency_idx_stmt;

