-- wallet module schema (idempotent)

-- derivation index cursor per chain
CREATE TABLE IF NOT EXISTS wallet_index (
  chain_id INT UNSIGNED PRIMARY KEY,
  next_index INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
SELECT COUNT(*) INTO @has_wallet_index_chain_id
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'wallet_index'
  AND COLUMN_NAME = 'chain_id';
SET @sql := IF(@has_wallet_index_chain_id = 0,
  'ALTER TABLE wallet_index ADD COLUMN chain_id INT UNSIGNED NOT NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @has_wallet_index_next_index
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'wallet_index'
  AND COLUMN_NAME = 'next_index';
SET @sql := IF(@has_wallet_index_next_index = 0,
  'ALTER TABLE wallet_index ADD COLUMN next_index INT UNSIGNED NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @has_wallet_index_updated_at
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'wallet_index'
  AND COLUMN_NAME = 'updated_at';
SET @sql := IF(@has_wallet_index_updated_at = 0,
  'ALTER TABLE wallet_index ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
UPDATE wallet_index SET chain_id = 56 WHERE chain_id IS NULL;
ALTER TABLE wallet_index
  DROP COLUMN IF EXISTS id,
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (chain_id);
INSERT IGNORE INTO wallet_index (chain_id, next_index) VALUES (56, 0);

CREATE TABLE IF NOT EXISTS chain_settings (
  chain_id INT UNSIGNED NOT NULL,
  min_confirmations INT UNSIGNED NOT NULL,
  PRIMARY KEY (chain_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
SELECT COUNT(*) INTO @has_chain_settings_chain_id
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'chain_settings'
  AND COLUMN_NAME = 'chain_id';
SET @sql := IF(@has_chain_settings_chain_id = 0,
  'ALTER TABLE chain_settings ADD COLUMN chain_id INT UNSIGNED NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @has_chain_settings_min_confirmations
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'chain_settings'
  AND COLUMN_NAME = 'min_confirmations';
SET @sql := IF(@has_chain_settings_min_confirmations = 0,
  'ALTER TABLE chain_settings ADD COLUMN min_confirmations INT UNSIGNED NOT NULL DEFAULT 12',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SELECT COUNT(*) INTO @has_chain_settings_id
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'chain_settings'
  AND COLUMN_NAME = 'id';
SET @sql := IF(@has_chain_settings_id > 0,
  'UPDATE chain_settings SET chain_id = id WHERE chain_id IS NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
ALTER TABLE chain_settings
  MODIFY COLUMN chain_id INT UNSIGNED NOT NULL,
  DROP COLUMN IF EXISTS id,
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (chain_id);
ALTER TABLE chain_settings
  MODIFY COLUMN min_confirmations INT UNSIGNED NOT NULL DEFAULT 12;
INSERT IGNORE INTO chain_settings (chain_id, min_confirmations) VALUES (56, 12);

-- last processed block cursor
CREATE TABLE IF NOT EXISTS chain_cursor (
  chain_id INT UNSIGNED PRIMARY KEY,
  last_block BIGINT UNSIGNED NOT NULL DEFAULT 0,
  last_hash VARCHAR(80) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO chain_cursor (chain_id, last_block) VALUES (56, 0);

-- derived address per user
CREATE TABLE IF NOT EXISTS wallet_addresses (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  chain_id INT UNSIGNED NOT NULL,
  address VARCHAR(64) NOT NULL,
  derivation_index INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_chain (user_id, chain_id),
  UNIQUE KEY uniq_addr (address),
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SELECT COUNT(*) INTO @has_wallet_addresses_chain_id
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'wallet_addresses'
  AND COLUMN_NAME = 'chain_id';
SET @sql := IF(@has_wallet_addresses_chain_id = 0,
  'ALTER TABLE wallet_addresses ADD COLUMN chain_id INT UNSIGNED NOT NULL AFTER user_id',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @has_wallet_addresses_derivation_index
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'wallet_addresses'
  AND COLUMN_NAME = 'derivation_index';
SET @sql := IF(@has_wallet_addresses_derivation_index = 0,
  'ALTER TABLE wallet_addresses ADD COLUMN derivation_index INT UNSIGNED NOT NULL AFTER chain_id',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @has_wallet_addresses_uniq_user_chain
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'wallet_addresses'
  AND INDEX_NAME = 'uniq_user_chain';
SET @sql := IF(@has_wallet_addresses_uniq_user_chain = 0,
  'ALTER TABLE wallet_addresses ADD UNIQUE KEY uniq_user_chain (user_id, chain_id)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @has_wallet_addresses_uniq_addr
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'wallet_addresses'
  AND INDEX_NAME = 'uniq_addr';
SET @sql := IF(@has_wallet_addresses_uniq_addr = 0,
  'ALTER TABLE wallet_addresses ADD UNIQUE KEY uniq_addr (address)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @has_wallet_addresses_idx_user
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'wallet_addresses'
  AND INDEX_NAME = 'idx_user';
SET @sql := IF(@has_wallet_addresses_idx_user = 0,
  'ALTER TABLE wallet_addresses ADD INDEX idx_user (user_id)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- deposits
CREATE TABLE IF NOT EXISTS wallet_deposits (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  chain_id INT UNSIGNED NOT NULL,
  address VARCHAR(64) NOT NULL,
  tx_hash VARCHAR(80) NOT NULL,
  block_number BIGINT UNSIGNED NOT NULL,
  block_hash VARCHAR(80) NOT NULL,
  token_address VARCHAR(64) NULL,
  amount_wei DECIMAL(65,0) NOT NULL,
  confirmations INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('seen','confirmed','swept','orphaned') NOT NULL DEFAULT 'seen',
  credited TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_tx (tx_hash),
  INDEX idx_user_chain (user_id, chain_id),
  INDEX idx_addr (address)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SELECT COUNT(*) INTO @has_wallet_deposits_chain_id
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'wallet_deposits'
  AND COLUMN_NAME = 'chain_id';
SET @sql := IF(@has_wallet_deposits_chain_id = 0,
  'ALTER TABLE wallet_deposits ADD COLUMN chain_id INT UNSIGNED NOT NULL AFTER user_id',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @has_wallet_deposits_confirmations
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'wallet_deposits'
  AND COLUMN_NAME = 'confirmations';
SET @sql := IF(@has_wallet_deposits_confirmations = 0,
  'ALTER TABLE wallet_deposits ADD COLUMN confirmations INT UNSIGNED NOT NULL DEFAULT 0 AFTER amount_wei',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @has_wallet_deposits_idx_user_chain
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'wallet_deposits'
  AND INDEX_NAME = 'idx_user_chain';
SET @sql := IF(@has_wallet_deposits_idx_user_chain = 0,
  'ALTER TABLE wallet_deposits ADD INDEX idx_user_chain (user_id, chain_id)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @has_wallet_deposits_idx_addr
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'wallet_deposits'
  AND INDEX_NAME = 'idx_addr';
SET @sql := IF(@has_wallet_deposits_idx_addr = 0,
  'ALTER TABLE wallet_deposits ADD INDEX idx_addr (address)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- user balances per asset
CREATE TABLE IF NOT EXISTS user_balances (
  user_id BIGINT UNSIGNED NOT NULL,
  asset VARCHAR(32) NOT NULL DEFAULT 'native',
  balance_wei DECIMAL(65,0) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, asset),
  INDEX idx_user_balances_user (user_id),
  CONSTRAINT fk_user_balances_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

