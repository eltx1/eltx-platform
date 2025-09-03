-- wallet module schema (idempotent)

-- derivation index cursor per chain
CREATE TABLE IF NOT EXISTS wallet_index (
  chain_id INT UNSIGNED PRIMARY KEY,
  next_index INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE wallet_index
  ADD COLUMN IF NOT EXISTS chain_id INT UNSIGNED NOT NULL,
  ADD COLUMN IF NOT EXISTS next_index INT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
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
ALTER TABLE chain_settings ADD COLUMN IF NOT EXISTS chain_id INT UNSIGNED NULL;
ALTER TABLE chain_settings ADD COLUMN IF NOT EXISTS min_confirmations INT UNSIGNED NOT NULL DEFAULT 12;
UPDATE chain_settings SET chain_id = id WHERE chain_id IS NULL;
ALTER TABLE chain_settings DROP COLUMN IF EXISTS id;
ALTER TABLE chain_settings MODIFY COLUMN chain_id INT UNSIGNED NOT NULL;
ALTER TABLE chain_settings DROP PRIMARY KEY, ADD PRIMARY KEY (chain_id);
ALTER TABLE chain_settings MODIFY COLUMN min_confirmations INT UNSIGNED NOT NULL DEFAULT 12;
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

ALTER TABLE wallet_addresses
  ADD COLUMN IF NOT EXISTS chain_id INT UNSIGNED NOT NULL AFTER user_id,
  ADD COLUMN IF NOT EXISTS derivation_index INT UNSIGNED NOT NULL AFTER chain_id,
  ADD UNIQUE KEY IF NOT EXISTS uniq_user_chain (user_id, chain_id),
  ADD UNIQUE KEY IF NOT EXISTS uniq_addr (address),
  ADD INDEX IF NOT EXISTS idx_user (user_id);

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

ALTER TABLE wallet_deposits
  ADD COLUMN IF NOT EXISTS chain_id INT UNSIGNED NOT NULL AFTER user_id,
  ADD COLUMN IF NOT EXISTS confirmations INT UNSIGNED NOT NULL DEFAULT 0 AFTER amount_wei,
  ADD INDEX IF NOT EXISTS idx_user_chain (user_id, chain_id),
  ADD INDEX IF NOT EXISTS idx_addr (address);

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

