-- wallet module schema

-- derivation index cursor per chain
CREATE TABLE IF NOT EXISTS wallet_index (
  chain VARCHAR(32) PRIMARY KEY,
  last_index INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO wallet_index (chain, last_index) VALUES ('bsc-mainnet', 0);

-- chain settings
CREATE TABLE IF NOT EXISTS chain_settings (
  chain VARCHAR(32) PRIMARY KEY,
  min_confirmations INT UNSIGNED NOT NULL DEFAULT 12,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO chain_settings (chain, min_confirmations) VALUES ('bsc-mainnet', 12);

-- last processed block
CREATE TABLE IF NOT EXISTS chain_cursor (
  chain VARCHAR(32) PRIMARY KEY,
  last_block BIGINT UNSIGNED NOT NULL DEFAULT 0,
  last_hash VARCHAR(80) NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- derived address per user
CREATE TABLE IF NOT EXISTS wallet_addresses (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  chain VARCHAR(32) NOT NULL,
  derivation_index INT UNSIGNED NOT NULL,
  address VARCHAR(64) NOT NULL,
  status ENUM('active','archived') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_chain (user_id, chain),
  UNIQUE KEY uniq_addr (address),
  INDEX idx_chain_index (chain, derivation_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- deposits (BNB only)
CREATE TABLE IF NOT EXISTS wallet_deposits (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  chain VARCHAR(32) NOT NULL,
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
  INDEX idx_user_chain_created (user_id, chain, created_at),
  INDEX idx_addr (address)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- user balances per asset
CREATE TABLE IF NOT EXISTS user_balances (
  user_id BIGINT UNSIGNED NOT NULL,
  asset VARCHAR(32) NOT NULL DEFAULT 'native',
  balance_wei DECIMAL(65,0) NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, asset),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
