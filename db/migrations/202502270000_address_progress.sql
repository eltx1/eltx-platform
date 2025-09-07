CREATE TABLE IF NOT EXISTS address_scan_progress (
  address VARCHAR(64) NOT NULL PRIMARY KEY,
  last_scanned_block BIGINT NULL,
  last_seen_balance_wei DECIMAL(65,0) NULL,
  last_scan_at DATETIME NULL,
  next_eligible_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_wallet_deposits_tx_token_addr
  ON wallet_deposits (tx_hash, token_address_norm, to_address);
