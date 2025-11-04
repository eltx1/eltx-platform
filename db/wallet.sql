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
INSERT IGNORE INTO wallet_index (chain_id, next_index) VALUES (1, 0);

-- chain settings
DROP TABLE IF EXISTS chain_settings;
CREATE TABLE IF NOT EXISTS chain_settings (
  chain_id INT UNSIGNED NOT NULL,
  min_confirmations INT UNSIGNED NOT NULL DEFAULT 12,
  PRIMARY KEY (chain_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO chain_settings (chain_id, min_confirmations) VALUES (56, 12);
INSERT IGNORE INTO chain_settings (chain_id, min_confirmations) VALUES (1, 12);
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
INSERT IGNORE INTO chain_cursor (chain_id, last_block) VALUES (1, 0);

-- derived address per user
CREATE TABLE IF NOT EXISTS wallet_addresses (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  chain_id INT UNSIGNED NOT NULL,
  address VARCHAR(64) NOT NULL,
  derivation_index INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_chain (user_id, chain_id),
  UNIQUE KEY uniq_addr (chain_id, address),
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
  ADD UNIQUE KEY uniq_addr (chain_id, address),
  ADD INDEX idx_user (user_id),
  MODIFY COLUMN user_id INT NOT NULL;

-- deposits
CREATE TABLE IF NOT EXISTS wallet_deposits (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
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
  ADD COLUMN IF NOT EXISTS source ENUM('worker','on_demand','stripe') NOT NULL DEFAULT 'worker' AFTER credited,
  ADD COLUMN IF NOT EXISTS scanner_run_id VARCHAR(36) NULL AFTER source,
  ADD COLUMN IF NOT EXISTS last_update_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at,
  ADD INDEX IF NOT EXISTS idx_user_chain (user_id, chain_id),
  ADD INDEX IF NOT EXISTS idx_addr (address),
  MODIFY COLUMN user_id INT NOT NULL;

ALTER TABLE wallet_deposits
  MODIFY COLUMN source ENUM('worker','on_demand','stripe') NOT NULL DEFAULT 'worker';


-- user balances per asset
CREATE TABLE IF NOT EXISTS user_balances (
  user_id INT NOT NULL,
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
  DROP COLUMN IF EXISTS usd_balance,
  MODIFY COLUMN user_id INT NOT NULL;

-- centrally managed asset prices for ELTX swaps
CREATE TABLE IF NOT EXISTS asset_prices (
  asset VARCHAR(32) NOT NULL,
  price_eltx DECIMAL(36,18) NOT NULL,
  min_amount DECIMAL(36,18) NOT NULL DEFAULT 0,
  max_amount DECIMAL(36,18) DEFAULT NULL,
  spread_bps INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (asset)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE asset_prices
  ADD COLUMN IF NOT EXISTS price_eltx DECIMAL(36,18) NOT NULL AFTER asset,
  ADD COLUMN IF NOT EXISTS min_amount DECIMAL(36,18) NOT NULL DEFAULT 0 AFTER price_eltx,
  ADD COLUMN IF NOT EXISTS max_amount DECIMAL(36,18) NULL DEFAULT NULL AFTER min_amount,
  ADD COLUMN IF NOT EXISTS spread_bps INT UNSIGNED NOT NULL DEFAULT 0 AFTER max_amount,
  ADD COLUMN IF NOT EXISTS updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER spread_bps;
INSERT IGNORE INTO asset_prices (asset, price_eltx, min_amount, spread_bps) VALUES ('ELTX', 1, 0, 0);
INSERT IGNORE INTO asset_prices (asset, price_eltx, min_amount, spread_bps) VALUES ('USDT', 1, 1, 0);
INSERT IGNORE INTO asset_prices (asset, price_eltx, min_amount, spread_bps) VALUES ('USDC', 1, 1, 0);
INSERT IGNORE INTO asset_prices (asset, price_eltx, min_amount, spread_bps) VALUES ('BNB', 0, 0.01, 25);
INSERT IGNORE INTO asset_prices (asset, price_eltx, min_amount, spread_bps) VALUES ('ETH', 0, 0.005, 25);

-- fiat purchases via card (Stripe)
CREATE TABLE IF NOT EXISTS fiat_purchases (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  stripe_session_id VARCHAR(191) NULL,
  stripe_payment_intent_id VARCHAR(191) NULL,
  status ENUM('pending','succeeded','failed','canceled','expired','refunded') NOT NULL DEFAULT 'pending',
  currency VARCHAR(8) NOT NULL DEFAULT 'USD',
  usd_amount DECIMAL(12,2) NOT NULL,
  usd_amount_minor BIGINT UNSIGNED NOT NULL,
  amount_charged_minor BIGINT UNSIGNED NULL,
  price_eltx DECIMAL(36,18) NOT NULL,
  eltx_amount DECIMAL(36,18) NOT NULL,
  eltx_amount_wei DECIMAL(65,0) NOT NULL,
  credited TINYINT(1) NOT NULL DEFAULT 0,
  wallet_deposit_id BIGINT UNSIGNED NULL,
  failure_code VARCHAR(64) NULL,
  failure_message TEXT NULL,
  metadata JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  credited_at DATETIME NULL,
  INDEX idx_fiat_purchases_user_status (user_id, status),
  UNIQUE KEY uniq_fiat_purchase_session (stripe_session_id),
  UNIQUE KEY uniq_fiat_purchase_intent (stripe_payment_intent_id),
  CONSTRAINT fk_fiat_purchases_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- staking configuration
CREATE TABLE IF NOT EXISTS staking_plans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(32) NOT NULL,
  duration_days INT NOT NULL,
  apr_bps INT NOT NULL,
  stake_asset VARCHAR(32) NOT NULL DEFAULT 'ELTX',
  stake_decimals INT NOT NULL DEFAULT 18,
  min_deposit_wei DECIMAL(65,0) DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE staking_plans
  ADD COLUMN IF NOT EXISTS name VARCHAR(32) NOT NULL AFTER id,
  ADD COLUMN IF NOT EXISTS duration_days INT NOT NULL AFTER name,
  ADD COLUMN IF NOT EXISTS apr_bps INT NOT NULL AFTER duration_days,
  ADD COLUMN IF NOT EXISTS stake_asset VARCHAR(32) NOT NULL DEFAULT 'ELTX' AFTER apr_bps,
  ADD COLUMN IF NOT EXISTS stake_decimals INT NOT NULL DEFAULT 18 AFTER stake_asset,
  ADD COLUMN IF NOT EXISTS min_deposit_wei DECIMAL(65,0) NULL DEFAULT NULL AFTER stake_decimals,
  ADD COLUMN IF NOT EXISTS is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER min_deposit_wei,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER is_active,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

CREATE TABLE IF NOT EXISTS staking_positions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  plan_id INT NOT NULL,
  stake_asset VARCHAR(32) NOT NULL DEFAULT 'ELTX',
  stake_decimals INT NOT NULL DEFAULT 18,
  amount DECIMAL(36,18) NOT NULL,
  amount_wei DECIMAL(65,0) NOT NULL,
  apr_bps_snapshot INT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  daily_reward DECIMAL(36,18) NOT NULL,
  accrued_total DECIMAL(36,18) NOT NULL DEFAULT 0,
  status ENUM('active','matured','cancelled') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (plan_id) REFERENCES staking_plans(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE staking_positions
  ADD COLUMN IF NOT EXISTS stake_asset VARCHAR(32) NOT NULL DEFAULT 'ELTX' AFTER plan_id,
  ADD COLUMN IF NOT EXISTS stake_decimals INT NOT NULL DEFAULT 18 AFTER stake_asset,
  ADD COLUMN IF NOT EXISTS amount DECIMAL(36,18) NOT NULL AFTER stake_decimals,
  ADD COLUMN IF NOT EXISTS amount_wei DECIMAL(65,0) NOT NULL AFTER amount,
  ADD COLUMN IF NOT EXISTS apr_bps_snapshot INT NOT NULL AFTER amount_wei,
  ADD COLUMN IF NOT EXISTS daily_reward DECIMAL(36,18) NOT NULL AFTER end_date,
  ADD COLUMN IF NOT EXISTS accrued_total DECIMAL(36,18) NOT NULL DEFAULT 0 AFTER daily_reward,
  ADD COLUMN IF NOT EXISTS status ENUM('active','matured','cancelled') NOT NULL DEFAULT 'active' AFTER accrued_total,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER status,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at,
  MODIFY COLUMN amount DECIMAL(36,18) NOT NULL,
  MODIFY COLUMN daily_reward DECIMAL(36,18) NOT NULL,
  MODIFY COLUMN accrued_total DECIMAL(36,18) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS staking_accruals (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  position_id BIGINT NOT NULL,
  accrual_date DATE NOT NULL,
  amount DECIMAL(36,18) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_accrual (position_id, accrual_date),
  FOREIGN KEY (position_id) REFERENCES staking_positions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE staking_accruals
  ADD COLUMN IF NOT EXISTS accrual_date DATE NOT NULL AFTER position_id,
  ADD COLUMN IF NOT EXISTS amount DECIMAL(36,18) NOT NULL AFTER accrual_date,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER amount,
  ADD UNIQUE KEY IF NOT EXISTS uniq_accrual (position_id, accrual_date);

INSERT INTO staking_plans (id, name, duration_days, apr_bps, stake_asset, stake_decimals, is_active)
VALUES
  (1, '30d', 30, 600, 'ELTX', 18, 1),
  (2, '6m', 180, 1000, 'ELTX', 18, 1),
  (3, '1y', 365, 1600, 'ELTX', 18, 1)
ON DUPLICATE KEY UPDATE
  name=VALUES(name),
  duration_days=VALUES(duration_days),
  apr_bps=VALUES(apr_bps),
  stake_asset=VALUES(stake_asset),
  stake_decimals=VALUES(stake_decimals),
  is_active=VALUES(is_active);

-- stored swap quotes
CREATE TABLE IF NOT EXISTS trade_quotes (
  id CHAR(36) NOT NULL,
  user_id INT NOT NULL,
  asset VARCHAR(32) NOT NULL,
  asset_decimals INT UNSIGNED NOT NULL,
  target_decimals INT UNSIGNED NOT NULL,
  asset_amount_wei DECIMAL(65,0) NOT NULL,
  eltx_amount_wei DECIMAL(65,0) NOT NULL,
  price_eltx DECIMAL(36,18) NOT NULL,
  price_wei DECIMAL(65,0) NOT NULL,
  spread_bps INT UNSIGNED NOT NULL DEFAULT 0,
  fee_bps INT UNSIGNED NOT NULL DEFAULT 0,
  fee_asset VARCHAR(32) NOT NULL DEFAULT 'ELTX',
  fee_amount_wei DECIMAL(65,0) NOT NULL DEFAULT 0,
  status ENUM('pending','completed','expired','cancelled','failed') NOT NULL DEFAULT 'pending',
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  executed_at DATETIME NULL,
  PRIMARY KEY (id),
  INDEX idx_trade_quotes_user (user_id),
  INDEX idx_trade_quotes_status (status),
  CONSTRAINT fk_trade_quotes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE trade_quotes
  ADD COLUMN IF NOT EXISTS asset_decimals INT UNSIGNED NOT NULL AFTER asset,
  ADD COLUMN IF NOT EXISTS target_decimals INT UNSIGNED NOT NULL AFTER asset_decimals,
  ADD COLUMN IF NOT EXISTS asset_amount_wei DECIMAL(65,0) NOT NULL AFTER target_decimals,
  ADD COLUMN IF NOT EXISTS eltx_amount_wei DECIMAL(65,0) NOT NULL AFTER asset_amount_wei,
  ADD COLUMN IF NOT EXISTS price_eltx DECIMAL(36,18) NOT NULL AFTER eltx_amount_wei,
  ADD COLUMN IF NOT EXISTS price_wei DECIMAL(65,0) NOT NULL AFTER price_eltx,
  ADD COLUMN IF NOT EXISTS spread_bps INT UNSIGNED NOT NULL DEFAULT 0 AFTER price_wei,
  ADD COLUMN IF NOT EXISTS fee_bps INT UNSIGNED NOT NULL DEFAULT 0 AFTER spread_bps,
  ADD COLUMN IF NOT EXISTS fee_asset VARCHAR(32) NOT NULL DEFAULT 'ELTX' AFTER fee_bps,
  ADD COLUMN IF NOT EXISTS fee_amount_wei DECIMAL(65,0) NOT NULL DEFAULT 0 AFTER fee_asset,
  ADD COLUMN IF NOT EXISTS status ENUM('pending','completed','expired','cancelled','failed') NOT NULL DEFAULT 'pending' AFTER fee_amount_wei,
  ADD COLUMN IF NOT EXISTS expires_at DATETIME NOT NULL AFTER status,
  ADD COLUMN IF NOT EXISTS created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER expires_at,
  ADD COLUMN IF NOT EXISTS executed_at DATETIME NULL AFTER created_at,
  ADD INDEX IF NOT EXISTS idx_trade_quotes_user (user_id),
  ADD INDEX IF NOT EXISTS idx_trade_quotes_status (status),
  MODIFY COLUMN user_id INT NOT NULL;

-- executed swaps
CREATE TABLE IF NOT EXISTS trade_swaps (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  quote_id CHAR(36) NOT NULL,
  user_id INT NOT NULL,
  asset VARCHAR(32) NOT NULL,
  asset_decimals INT UNSIGNED NOT NULL,
  target_decimals INT UNSIGNED NOT NULL,
  asset_amount_wei DECIMAL(65,0) NOT NULL,
  eltx_amount_wei DECIMAL(65,0) NOT NULL,
  price_wei DECIMAL(65,0) NOT NULL,
  gross_eltx_amount_wei DECIMAL(65,0) NOT NULL DEFAULT 0,
  fee_asset VARCHAR(32) NOT NULL DEFAULT 'ELTX',
  fee_amount_wei DECIMAL(65,0) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_trade_swaps_user (user_id),
  INDEX idx_trade_swaps_quote (quote_id),
  CONSTRAINT fk_trade_swaps_quote FOREIGN KEY (quote_id) REFERENCES trade_quotes(id) ON DELETE CASCADE,
  CONSTRAINT fk_trade_swaps_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE trade_swaps
  ADD COLUMN IF NOT EXISTS quote_id CHAR(36) NOT NULL AFTER id,
  ADD COLUMN IF NOT EXISTS user_id INT NOT NULL AFTER quote_id,
  ADD COLUMN IF NOT EXISTS asset VARCHAR(32) NOT NULL AFTER user_id,
  ADD COLUMN IF NOT EXISTS asset_decimals INT UNSIGNED NOT NULL AFTER asset,
  ADD COLUMN IF NOT EXISTS target_decimals INT UNSIGNED NOT NULL AFTER asset_decimals,
  ADD COLUMN IF NOT EXISTS asset_amount_wei DECIMAL(65,0) NOT NULL AFTER target_decimals,
  ADD COLUMN IF NOT EXISTS eltx_amount_wei DECIMAL(65,0) NOT NULL AFTER asset_amount_wei,
  ADD COLUMN IF NOT EXISTS price_wei DECIMAL(65,0) NOT NULL AFTER eltx_amount_wei,
  ADD COLUMN IF NOT EXISTS gross_eltx_amount_wei DECIMAL(65,0) NOT NULL DEFAULT 0 AFTER price_wei,
  ADD COLUMN IF NOT EXISTS fee_asset VARCHAR(32) NOT NULL DEFAULT 'ELTX' AFTER gross_eltx_amount_wei,
  ADD COLUMN IF NOT EXISTS fee_amount_wei DECIMAL(65,0) NOT NULL DEFAULT 0 AFTER fee_asset,
  ADD COLUMN IF NOT EXISTS created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER fee_amount_wei,
  ADD INDEX IF NOT EXISTS idx_trade_swaps_user (user_id),
  ADD INDEX IF NOT EXISTS idx_trade_swaps_quote (quote_id),
  MODIFY COLUMN user_id INT NOT NULL;

-- centralized liquidity pools for swaps
CREATE TABLE IF NOT EXISTS swap_liquidity_pools (
  asset VARCHAR(32) NOT NULL,
  asset_decimals INT UNSIGNED NOT NULL,
  asset_reserve_wei DECIMAL(65,0) NOT NULL,
  eltx_reserve_wei DECIMAL(65,0) NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (asset)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE swap_liquidity_pools
  ADD COLUMN IF NOT EXISTS asset_decimals INT UNSIGNED NOT NULL AFTER asset,
  ADD COLUMN IF NOT EXISTS asset_reserve_wei DECIMAL(65,0) NOT NULL AFTER asset_decimals,
  ADD COLUMN IF NOT EXISTS eltx_reserve_wei DECIMAL(65,0) NOT NULL AFTER asset_reserve_wei,
  ADD COLUMN IF NOT EXISTS updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER eltx_reserve_wei;
INSERT IGNORE INTO swap_liquidity_pools (asset, asset_decimals, asset_reserve_wei, eltx_reserve_wei)
VALUES
  ('USDT', 18, 1000000000000000000000000, 1000000000000000000000000),
  ('USDC', 18, 1000000000000000000000000, 1000000000000000000000000);

-- spot trading markets
CREATE TABLE IF NOT EXISTS spot_markets (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  symbol VARCHAR(32) NOT NULL,
  base_asset VARCHAR(32) NOT NULL,
  base_decimals INT UNSIGNED NOT NULL,
  quote_asset VARCHAR(32) NOT NULL,
  quote_decimals INT UNSIGNED NOT NULL,
  min_base_amount DECIMAL(36,18) NOT NULL DEFAULT 0,
  min_quote_amount DECIMAL(36,18) NOT NULL DEFAULT 0,
  price_precision INT UNSIGNED NOT NULL DEFAULT 18,
  amount_precision INT UNSIGNED NOT NULL DEFAULT 18,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_symbol (symbol)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE spot_markets
  ADD COLUMN IF NOT EXISTS base_asset VARCHAR(32) NOT NULL AFTER symbol,
  ADD COLUMN IF NOT EXISTS base_decimals INT UNSIGNED NOT NULL DEFAULT 18 AFTER base_asset,
  ADD COLUMN IF NOT EXISTS quote_asset VARCHAR(32) NOT NULL AFTER base_decimals,
  ADD COLUMN IF NOT EXISTS quote_decimals INT UNSIGNED NOT NULL DEFAULT 18 AFTER quote_asset,
  ADD COLUMN IF NOT EXISTS min_base_amount DECIMAL(36,18) NOT NULL DEFAULT 0 AFTER quote_decimals,
  ADD COLUMN IF NOT EXISTS min_quote_amount DECIMAL(36,18) NOT NULL DEFAULT 0 AFTER min_base_amount,
  ADD COLUMN IF NOT EXISTS price_precision INT UNSIGNED NOT NULL DEFAULT 18 AFTER min_quote_amount,
  ADD COLUMN IF NOT EXISTS amount_precision INT UNSIGNED NOT NULL DEFAULT 18 AFTER price_precision,
  ADD COLUMN IF NOT EXISTS active TINYINT(1) NOT NULL DEFAULT 1 AFTER amount_precision,
  ADD COLUMN IF NOT EXISTS created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER active;
INSERT IGNORE INTO spot_markets (symbol, base_asset, base_decimals, quote_asset, quote_decimals, min_base_amount, min_quote_amount)
VALUES
  ('ELTX/USDT', 'ELTX', 18, 'USDT', 18, 0.0001, 0.1),
  ('ELTX/USDC', 'ELTX', 18, 'USDC', 18, 0.0001, 0.1);

-- spot order book
CREATE TABLE IF NOT EXISTS spot_orders (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  market_id INT UNSIGNED NOT NULL,
  user_id INT NOT NULL,
  side ENUM('buy','sell') NOT NULL,
  type ENUM('limit','market') NOT NULL,
  price_wei DECIMAL(65,0) NOT NULL DEFAULT 0,
  base_amount_wei DECIMAL(65,0) NOT NULL,
  quote_amount_wei DECIMAL(65,0) NOT NULL DEFAULT 0,
  remaining_base_wei DECIMAL(65,0) NOT NULL,
  remaining_quote_wei DECIMAL(65,0) NOT NULL DEFAULT 0,
  fee_bps INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('open','filled','cancelled') NOT NULL DEFAULT 'open',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_spot_orders_market (market_id),
  INDEX idx_spot_orders_user (user_id),
  INDEX idx_spot_orders_status (status),
  INDEX idx_spot_orders_side (side),
  CONSTRAINT fk_spot_orders_market FOREIGN KEY (market_id) REFERENCES spot_markets(id) ON DELETE CASCADE,
  CONSTRAINT fk_spot_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE spot_orders
  ADD COLUMN IF NOT EXISTS market_id INT UNSIGNED NOT NULL AFTER id,
  ADD COLUMN IF NOT EXISTS user_id INT NOT NULL AFTER market_id,
  ADD COLUMN IF NOT EXISTS side ENUM('buy','sell') NOT NULL AFTER user_id,
  ADD COLUMN IF NOT EXISTS type ENUM('limit','market') NOT NULL AFTER side,
  ADD COLUMN IF NOT EXISTS price_wei DECIMAL(65,0) NOT NULL DEFAULT 0 AFTER type,
  ADD COLUMN IF NOT EXISTS base_amount_wei DECIMAL(65,0) NOT NULL AFTER price_wei,
  ADD COLUMN IF NOT EXISTS quote_amount_wei DECIMAL(65,0) NOT NULL DEFAULT 0 AFTER base_amount_wei,
  ADD COLUMN IF NOT EXISTS remaining_base_wei DECIMAL(65,0) NOT NULL AFTER quote_amount_wei,
  ADD COLUMN IF NOT EXISTS remaining_quote_wei DECIMAL(65,0) NOT NULL DEFAULT 0 AFTER remaining_base_wei,
  ADD COLUMN IF NOT EXISTS fee_bps INT UNSIGNED NOT NULL DEFAULT 0 AFTER remaining_quote_wei,
  ADD COLUMN IF NOT EXISTS status ENUM('open','filled','cancelled') NOT NULL DEFAULT 'open' AFTER fee_bps,
  ADD COLUMN IF NOT EXISTS created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER status,
  ADD COLUMN IF NOT EXISTS updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

CREATE TABLE IF NOT EXISTS spot_trades (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  market_id INT UNSIGNED NOT NULL,
  buy_order_id BIGINT UNSIGNED NOT NULL,
  sell_order_id BIGINT UNSIGNED NOT NULL,
  price_wei DECIMAL(65,0) NOT NULL,
  base_amount_wei DECIMAL(65,0) NOT NULL,
  quote_amount_wei DECIMAL(65,0) NOT NULL,
  buy_fee_wei DECIMAL(65,0) NOT NULL DEFAULT 0,
  sell_fee_wei DECIMAL(65,0) NOT NULL DEFAULT 0,
  fee_asset VARCHAR(32) NOT NULL,
  taker_side ENUM('buy','sell') NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_spot_trades_market (market_id),
  INDEX idx_spot_trades_buy (buy_order_id),
  INDEX idx_spot_trades_sell (sell_order_id),
  CONSTRAINT fk_spot_trades_market FOREIGN KEY (market_id) REFERENCES spot_markets(id) ON DELETE CASCADE,
  CONSTRAINT fk_spot_trades_buy FOREIGN KEY (buy_order_id) REFERENCES spot_orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_spot_trades_sell FOREIGN KEY (sell_order_id) REFERENCES spot_orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE spot_trades
  ADD COLUMN IF NOT EXISTS market_id INT UNSIGNED NOT NULL AFTER id,
  ADD COLUMN IF NOT EXISTS buy_order_id BIGINT UNSIGNED NOT NULL AFTER market_id,
  ADD COLUMN IF NOT EXISTS sell_order_id BIGINT UNSIGNED NOT NULL AFTER buy_order_id,
  ADD COLUMN IF NOT EXISTS price_wei DECIMAL(65,0) NOT NULL AFTER sell_order_id,
  ADD COLUMN IF NOT EXISTS base_amount_wei DECIMAL(65,0) NOT NULL AFTER price_wei,
  ADD COLUMN IF NOT EXISTS quote_amount_wei DECIMAL(65,0) NOT NULL AFTER base_amount_wei,
  ADD COLUMN IF NOT EXISTS buy_fee_wei DECIMAL(65,0) NOT NULL DEFAULT 0 AFTER quote_amount_wei,
  ADD COLUMN IF NOT EXISTS sell_fee_wei DECIMAL(65,0) NOT NULL DEFAULT 0 AFTER buy_fee_wei,
  ADD COLUMN IF NOT EXISTS fee_asset VARCHAR(32) NOT NULL AFTER sell_fee_wei,
  ADD COLUMN IF NOT EXISTS taker_side ENUM('buy','sell') NOT NULL AFTER fee_asset,
  ADD COLUMN IF NOT EXISTS created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER taker_side;

-- platform fee ledger
CREATE TABLE IF NOT EXISTS platform_fees (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  fee_type ENUM('swap','spot') NOT NULL,
  reference VARCHAR(64) NOT NULL,
  asset VARCHAR(32) NOT NULL,
  amount_wei DECIMAL(65,0) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_platform_fees_type (fee_type),
  INDEX idx_platform_fees_asset (asset)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE platform_fees
  ADD COLUMN IF NOT EXISTS fee_type ENUM('swap','spot') NOT NULL AFTER id,
  ADD COLUMN IF NOT EXISTS reference VARCHAR(64) NOT NULL AFTER fee_type,
  ADD COLUMN IF NOT EXISTS asset VARCHAR(32) NOT NULL AFTER reference,
  ADD COLUMN IF NOT EXISTS amount_wei DECIMAL(65,0) NOT NULL AFTER asset,
  ADD COLUMN IF NOT EXISTS created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER amount_wei;

-- platform settings
CREATE TABLE IF NOT EXISTS platform_settings (
  name VARCHAR(64) PRIMARY KEY,
  value VARCHAR(255) NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO platform_settings (name, value) VALUES ('transfer_fee_bps', '0');
INSERT IGNORE INTO platform_settings (name, value) VALUES ('swap_fee_bps', '0');
INSERT IGNORE INTO platform_settings (name, value) VALUES ('spot_trade_fee_bps', '0');
-- internal transfers between users
CREATE TABLE IF NOT EXISTS wallet_transfers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  from_user_id INT NOT NULL,
  to_user_id INT NOT NULL,
  asset VARCHAR(32) NOT NULL,
  amount_wei DECIMAL(65,0) NOT NULL,
  fee_wei DECIMAL(65,0) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_from_user (from_user_id),
  INDEX idx_to_user (to_user_id),
  CONSTRAINT fk_wallet_transfers_from FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_wallet_transfers_to FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

