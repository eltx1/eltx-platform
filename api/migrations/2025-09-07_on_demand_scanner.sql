-- Migration: On-Demand Scanner tables and indexes

-- A) wallet_deposits adjustments
ALTER TABLE wallet_deposits
  ADD COLUMN IF NOT EXISTS token_address_norm VARCHAR(42)
    AS (IFNULL(token_address, '0x0000000000000000000000000000000000000000')) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_wallet_deposits_tx_token_addr
  ON wallet_deposits (tx_hash, token_address_norm, address);

ALTER TABLE wallet_deposits
  ADD COLUMN IF NOT EXISTS source ENUM('worker','on_demand') NOT NULL DEFAULT 'worker',
  ADD COLUMN IF NOT EXISTS scanner_run_id VARCHAR(36) NULL,
  ADD COLUMN IF NOT EXISTS last_update_at TIMESTAMP NULL
    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_wallet_deposits_user_created
  ON wallet_deposits (user_id, created_at DESC);

-- B) user_scan_progress table
CREATE TABLE IF NOT EXISTS user_scan_progress (
  user_id BIGINT NOT NULL PRIMARY KEY,
  last_scanned_block BIGINT NULL,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- C) user_scan_jobs queue table
CREATE TABLE IF NOT EXISTS user_scan_jobs (
  id CHAR(36) NOT NULL PRIMARY KEY,   -- UUID
  user_id BIGINT NOT NULL,
  from_block BIGINT NOT NULL,
  to_block BIGINT NOT NULL,
  status ENUM('queued','running','done','failed','canceled') NOT NULL DEFAULT 'queued',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP NULL,
  finished_at TIMESTAMP NULL,
  error TEXT NULL,
  KEY idx_jobs_user_status (user_id, status),
  KEY idx_jobs_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
