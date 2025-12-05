-- Ensure wallet foreign keys use INT to match users.id
ALTER TABLE wallet_addresses MODIFY COLUMN user_id INT NOT NULL;
ALTER TABLE wallet_deposits MODIFY COLUMN user_id INT NOT NULL;
ALTER TABLE user_balances MODIFY COLUMN user_id INT NOT NULL;
ALTER TABLE trade_quotes MODIFY COLUMN user_id INT NOT NULL;
ALTER TABLE trade_swaps MODIFY COLUMN user_id INT NOT NULL;

-- Extend trade quotes with fee support
ALTER TABLE trade_quotes
  ADD COLUMN IF NOT EXISTS fee_bps INT UNSIGNED NOT NULL DEFAULT 0 AFTER spread_bps,
  ADD COLUMN IF NOT EXISTS fee_asset VARCHAR(32) NOT NULL DEFAULT 'ELTX' AFTER fee_bps,
  ADD COLUMN IF NOT EXISTS fee_amount_wei DECIMAL(65,0) NOT NULL DEFAULT 0 AFTER fee_asset;

-- Extend trade swaps to store gross amount and fee attribution
ALTER TABLE trade_swaps
  ADD COLUMN IF NOT EXISTS gross_eltx_amount_wei DECIMAL(65,0) NOT NULL DEFAULT 0 AFTER price_wei,
  ADD COLUMN IF NOT EXISTS fee_asset VARCHAR(32) NOT NULL DEFAULT 'ELTX' AFTER gross_eltx_amount_wei,
  ADD COLUMN IF NOT EXISTS fee_amount_wei DECIMAL(65,0) NOT NULL DEFAULT 0 AFTER fee_asset;

-- Liquidity pool registry for swaps
CREATE TABLE IF NOT EXISTS swap_liquidity_pools (
  asset VARCHAR(32) NOT NULL PRIMARY KEY,
  asset_decimals INT UNSIGNED NOT NULL,
  asset_reserve_wei DECIMAL(65,0) NOT NULL,
  eltx_reserve_wei DECIMAL(65,0) NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed default pools if missing
INSERT IGNORE INTO swap_liquidity_pools (asset, asset_decimals, asset_reserve_wei, eltx_reserve_wei) VALUES
  ('USDT', 18, 1000000000000000000000000, 1000000000000000000000000),
  ('USDC', 18, 1000000000000000000000000, 1000000000000000000000000);

-- Spot market catalog
CREATE TABLE IF NOT EXISTS spot_markets (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  symbol VARCHAR(32) NOT NULL UNIQUE,
  base_asset VARCHAR(32) NOT NULL,
  base_decimals INT UNSIGNED NOT NULL,
  quote_asset VARCHAR(32) NOT NULL,
  quote_decimals INT UNSIGNED NOT NULL,
  min_base_amount DECIMAL(36,18) NOT NULL DEFAULT 0,
  min_quote_amount DECIMAL(36,18) NOT NULL DEFAULT 0,
  price_precision INT UNSIGNED NOT NULL DEFAULT 18,
  amount_precision INT UNSIGNED NOT NULL DEFAULT 18,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed ELTX spot markets
INSERT IGNORE INTO spot_markets (symbol, base_asset, base_decimals, quote_asset, quote_decimals, min_base_amount, min_quote_amount) VALUES
  ('ELTX/USDT', 'ELTX', 18, 'USDT', 18, 0.0001, 0.1),
  ('ELTX/USDC', 'ELTX', 18, 'USDC', 18, 0.0001, 0.1);

-- Order book entries
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

-- Trade executions
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

-- Platform fee ledger
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

-- Default fee configuration keys
INSERT IGNORE INTO platform_settings (name, value) VALUES
  ('swap_fee_bps', '0'),
  ('spot_trade_fee_bps', '0'),
  ('spot_stream_heartbeat_ms', '12000'),
  ('spot_stream_delta_interval_ms', '1200');
