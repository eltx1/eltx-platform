-- wallet module schema (idempotent)

-- derivation index cursor per chain
CREATE TABLE IF NOT EXISTS wallet_index (
  chain_id INT UNSIGNED PRIMARY KEY,
  next_index INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE wallet_index
  DROP COLUMN IF EXISTS id,
  DROP PRIMARY KEY;
ALTER TABLE wallet_index
  ADD COLUMN IF NOT EXISTS chain_id INT UNSIGNED NOT NULL,
  ADD COLUMN IF NOT EXISTS next_index INT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  ADD PRIMARY KEY (chain_id);
INSERT IGNORE INTO wallet_index (chain_id, next_index) VALUES (56, 0);

-- chain settings
DROP TABLE IF EXISTS chain_settings;
CREATE TABLE IF NOT EXISTS chain_settings (
  chain_id INT UNSIGNED NOT NULL,
  min_confirmations INT UNSIGNED NOT NULL DEFAULT 12,
  PRIMARY KEY (chain_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO chain_settings (chain_id, min_confirmations) VALUES (56, 12);
-- last processed block cursor
CREATE TABLE IF NOT EXISTS chain_cursor (
  chain_id INT UNSIGNED PRIMARY KEY,
  last_block BIGINT UNSIGNED NOT NULL DEFAULT 0,
  last_hash VARCHAR(80) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE chain_cursor
  DROP COLUMN IF EXISTS chain,
  DROP PRIMARY KEY;
ALTER TABLE chain_cursor
  ADD COLUMN IF NOT EXISTS chain_id INT UNSIGNED NOT NULL,
  ADD COLUMN IF NOT EXISTS last_block BIGINT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_hash VARCHAR(80) NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  ADD PRIMARY KEY (chain_id);
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

ALTER TABLE wallet_addresses DROP INDEX uniq_user_chain;
ALTER TABLE wallet_addresses DROP INDEX uniq_addr;
ALTER TABLE wallet_addresses DROP INDEX idx_user;
ALTER TABLE wallet_addresses
  DROP COLUMN IF EXISTS chain,
  DROP COLUMN IF EXISTS status;
ALTER TABLE wallet_addresses
  ADD COLUMN IF NOT EXISTS chain_id INT UNSIGNED NOT NULL AFTER user_id,
  ADD COLUMN IF NOT EXISTS derivation_index INT UNSIGNED NOT NULL AFTER chain_id,
  ADD UNIQUE KEY uniq_user_chain (user_id, chain_id),
  ADD UNIQUE KEY uniq_addr (address),
  ADD INDEX idx_user (user_id);

-- deposits
CREATE TABLE IF NOT EXISTS wallet_deposits (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  chain_id INT UNSIGNED NOT NULL,
  address VARCHAR(64) NOT NULL,
  token_symbol VARCHAR(32) NOT NULL DEFAULT 'BNB',
  tx_hash VARCHAR(80) NOT NULL,
  log_index INT UNSIGNED NOT NULL DEFAULT 0,
  block_number BIGINT UNSIGNED NOT NULL,
  block_hash VARCHAR(80) NOT NULL,
  token_address VARCHAR(64) NOT NULL DEFAULT '0x0000000000000000000000000000000000000000',
  amount_wei DECIMAL(65,0) NOT NULL,
  confirmations INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('seen','confirmed','swept','orphaned') NOT NULL DEFAULT 'seen',
  credited TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_wallet_deposit (chain_id, token_address, address, tx_hash, log_index),
  INDEX idx_user_chain (user_id, chain_id),
  INDEX idx_addr_block (address, block_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE wallet_deposits
  DROP COLUMN IF EXISTS chain;
ALTER TABLE wallet_deposits
  ADD COLUMN IF NOT EXISTS chain_id INT UNSIGNED NOT NULL AFTER user_id,
  ADD COLUMN IF NOT EXISTS token_symbol VARCHAR(32) NOT NULL DEFAULT 'BNB' AFTER address,
  ADD COLUMN IF NOT EXISTS confirmations INT UNSIGNED NOT NULL DEFAULT 0 AFTER amount_wei,
  ADD INDEX IF NOT EXISTS idx_user_chain (user_id, chain_id),
  ADD INDEX IF NOT EXISTS idx_addr (address);


-- user balances per asset
CREATE TABLE IF NOT EXISTS user_balances (
  user_id BIGINT UNSIGNED NOT NULL,
  asset VARCHAR(32) NOT NULL,
  balance_wei DECIMAL(65,0) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, asset),
  INDEX idx_user_balances_user (user_id),
  CONSTRAINT fk_user_balances_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE user_balances DROP COLUMN IF EXISTS usd_balance;


ALTER TABLE user_balances
  DROP COLUMN IF EXISTS chain,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS usd_balance;

-- platform settings
CREATE TABLE IF NOT EXISTS platform_settings (
  name VARCHAR(64) PRIMARY KEY,
  value VARCHAR(255) NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO platform_settings (name, value) VALUES ('transfer_fee_bps', '0');
-- internal transfers between users
CREATE TABLE IF NOT EXISTS wallet_transfers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  from_user_id BIGINT UNSIGNED NOT NULL,
  to_user_id BIGINT UNSIGNED NOT NULL,
  asset VARCHAR(32) NOT NULL,
  amount_wei DECIMAL(65,0) NOT NULL,
  fee_wei DECIMAL(65,0) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_from_user (from_user_id),
  INDEX idx_to_user (to_user_id),
  CONSTRAINT fk_wallet_transfers_from FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_wallet_transfers_to FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

