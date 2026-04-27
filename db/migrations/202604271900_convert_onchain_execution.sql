-- Convert on-chain execution metadata and runtime settings

INSERT INTO platform_settings (`name`, `value`) VALUES
  ('convert_execution_mode', 'mock'),
  ('convert_slippage_bps', '120')
ON DUPLICATE KEY UPDATE `value`=VALUES(`value`);

ALTER TABLE convert_pairs
  ADD COLUMN token_address VARCHAR(42) NULL AFTER token_symbol,
  ADD COLUMN token_decimals TINYINT UNSIGNED NULL AFTER token_address;

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
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_convert_executions_user (user_id),
  KEY idx_convert_executions_pair (pair_id),
  KEY idx_convert_executions_status (status),
  CONSTRAINT fk_convert_executions_pair FOREIGN KEY (pair_id) REFERENCES convert_pairs(id) ON DELETE RESTRICT,
  CONSTRAINT fk_convert_executions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
