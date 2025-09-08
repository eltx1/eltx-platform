-- ensure wallet_deposits has idempotent key and normalized data

-- normalize existing data
UPDATE wallet_deposits SET token_address='0x0000000000000000000000000000000000000000' WHERE token_address IS NULL;
UPDATE wallet_deposits SET tx_hash=CONCAT('legacy:', id) WHERE tx_hash IS NULL OR tx_hash='';

-- make columns non-null with defaults
ALTER TABLE wallet_deposits
  MODIFY token_address VARCHAR(64) NOT NULL DEFAULT '0x0000000000000000000000000000000000000000',
  MODIFY tx_hash VARCHAR(80) NOT NULL;

-- add log_index column if missing
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wallet_deposits' AND COLUMN_NAME = 'log_index');
SET @sql := IF(@col = 0, 'ALTER TABLE wallet_deposits ADD COLUMN log_index INT UNSIGNED NOT NULL DEFAULT 0 AFTER tx_hash', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- replace unique index
SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wallet_deposits' AND INDEX_NAME = 'uniq_wallet_deposits_chain_token_addr_tx_log');
SET @sql := IF(@idx = 0, 'ALTER TABLE wallet_deposits DROP INDEX IF EXISTS uniq_wallet_deposits_tx_token_addr, ADD UNIQUE KEY uniq_wallet_deposits_chain_token_addr_tx_log (chain_id, token_address, address, tx_hash, log_index)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- helper index for address lookups
SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wallet_deposits' AND INDEX_NAME = 'idx_addr_block');
SET @sql := IF(@idx = 0, 'ALTER TABLE wallet_deposits ADD INDEX idx_addr_block (address, block_number)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
