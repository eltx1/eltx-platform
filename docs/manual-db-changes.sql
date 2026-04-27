-- Wallet/user foreign key alignment and fee fields
ALTER TABLE wallet_addresses MODIFY COLUMN user_id INT NOT NULL;
ALTER TABLE wallet_deposits MODIFY COLUMN user_id INT NOT NULL;
ALTER TABLE user_balances MODIFY COLUMN user_id INT NOT NULL;
ALTER TABLE trade_quotes MODIFY COLUMN user_id INT NOT NULL;
ALTER TABLE trade_swaps MODIFY COLUMN user_id INT NOT NULL;

-- Trade quotes fee support
ALTER TABLE trade_quotes
  ADD COLUMN IF NOT EXISTS fee_bps INT UNSIGNED NOT NULL DEFAULT 0 AFTER spread_bps,
  ADD COLUMN IF NOT EXISTS fee_asset VARCHAR(32) NOT NULL DEFAULT 'ELTX' AFTER fee_bps,
  ADD COLUMN IF NOT EXISTS fee_amount_wei DECIMAL(65,0) NOT NULL DEFAULT 0 AFTER fee_asset;

-- Trade swaps fee attribution
ALTER TABLE trade_swaps
  ADD COLUMN IF NOT EXISTS gross_eltx_amount_wei DECIMAL(65,0) NOT NULL DEFAULT 0 AFTER price_wei,
  ADD COLUMN IF NOT EXISTS fee_asset VARCHAR(32) NOT NULL DEFAULT 'ELTX' AFTER gross_eltx_amount_wei,
  ADD COLUMN IF NOT EXISTS fee_amount_wei DECIMAL(65,0) NOT NULL DEFAULT 0 AFTER fee_asset;

-- Liquidity pool registry
CREATE TABLE IF NOT EXISTS swap_liquidity_pools (
  asset VARCHAR(32) NOT NULL PRIMARY KEY,
  asset_decimals INT UNSIGNED NOT NULL,
  asset_reserve_wei DECIMAL(65,0) NOT NULL,
  eltx_reserve_wei DECIMAL(65,0) NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

INSERT IGNORE INTO spot_markets (symbol, base_asset, base_decimals, quote_asset, quote_decimals, min_base_amount, min_quote_amount) VALUES
  ('ELTX/USDT', 'ELTX', 18, 'USDT', 18, 0.0001, 0.1),
  ('WBTC/USDT', 'WBTC', 18, 'USDT', 18, 0.00001, 0.1),
  ('BNB/USDT', 'BNB', 18, 'USDT', 18, 0.0001, 0.1),
  ('ELTX/USDC', 'ELTX', 18, 'USDC', 18, 0.0001, 0.1),
  ('USDT/USDC', 'USDT', 18, 'USDC', 18, 0.1, 0.1),
  ('ETH/USDT', 'ETH', 18, 'USDT', 18, 0.0001, 0.1),
  ('MCOIN/USDT', 'MCOIN', 18, 'USDT', 18, 0.0001, 0.1);

-- Spot order book entries
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

-- Spot trade executions
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

INSERT IGNORE INTO platform_settings (name, value) VALUES
  ('swap_fee_bps', '0'),
  ('spot_trade_fee_bps', '0'),
  ('spot_stream_heartbeat_ms', '12000'),
  ('spot_stream_delta_interval_ms', '1200');

-- 2026-04-27: Add requested spot pairs (XAUT, PAXG, SOL, XRP) and enable them.
INSERT IGNORE INTO spot_markets (
  symbol,
  base_asset,
  base_decimals,
  quote_asset,
  quote_decimals,
  min_base_amount,
  min_quote_amount
)
VALUES
  ('XAUT/USDT', 'XAUT', 18, 'USDT', 18, 0.00001, 0.1),
  ('PAXG/USDT', 'PAXG', 18, 'USDT', 18, 0.00001, 0.1),
  ('SOL/USDT', 'SOL', 18, 'USDT', 18, 0.001, 0.1),
  ('XRP/USDT', 'XRP', 18, 'USDT', 18, 1, 0.1);

UPDATE spot_markets
   SET active = 1,
       allow_market_orders = 1,
       updated_at = NOW()
 WHERE symbol IN ('XAUT/USDT', 'PAXG/USDT', 'SOL/USDT', 'XRP/USDT');

-- 2026-04-27: Add spot market categories for trade routing (gold/stocks/crypto).
ALTER TABLE spot_markets
  ADD COLUMN IF NOT EXISTS market_type ENUM('gold','stocks','crypto') NOT NULL DEFAULT 'crypto' AFTER allow_market_orders,
  ADD INDEX IF NOT EXISTS idx_spot_market_type (market_type);

UPDATE spot_markets
   SET market_type = 'gold'
 WHERE UPPER(symbol) = 'XAUT/USDT';

UPDATE spot_markets
   SET market_type = 'stocks'
 WHERE UPPER(symbol) IN (
   'NVDAON/USDT','TSLAON/USDT','TSMON/USDT','AAPLON/USDT','GOOGLON/USDT','AMZNON/USDT','BABAON/USDT',
   'GSON/USDT','TON/USDT','UBERON/USDT','FON/USDT','TMON/USDT','WMTON/USDT','VZON/USDT','BLKON/USDT',
   'INTCON/USDT','IBMON/USDT','AMDON/USDT','METAON/USDT','MSFTON/USDT','ORCLON/USDT','SNDKON/USDT',
   'PFEON/USDT','PGON/USDT','KOON/USDT','MCDON/USDT','SBUXON/USDT','PEPON/USDT','PCGON/USDT','PINSON/USDT',
   'PYPLON/USDT','QCOMON/USDT','RDDTON/USDT','SMCION/USDT','SNAPON/USDT','SNOWON/USDT','SPOTON/USDT',
   'VON/USDT','MAON/USDT','JNJON/USDT','JPMON/USDT','MSTRON/USDT','NFLXON/USDT','NKEON/USDT','NVOON/USDT',
   'ONON/USDT','XOMON/USDT','USOON/USDT','ABNBON/USDT','HOODON/USDT','ADBEON/USDT','MRVLON/USDT',
   'AMCON/USDT','COINON/USDT','APOON/USDT','APPON/USDT','AVGOON/USDT','AXPON/USDT','BACON/USDT','BAON/USDT',
   'BIDUON/USDT','UNOON/USDT','BTGON/USDT','CIFRON/USDT','CON/USDT','COPON/USDT','COPXON/USDT','CRCLON/USDT',
   'CRMON/USDT','CSCOON/USDT','CVXON/USDT','DASHON/USDT','DISON/USDT','DNNON/USDT','EQIXON/USDT','FIGON/USDT',
   'FSOLON/USDT','GMEON/USDT','GRABON/USDT','IRENON/USDT','JDON/USDT'
 );

-- Wallet schema alignment
ALTER TABLE wallet_addresses
  ADD COLUMN IF NOT EXISTS chain_id INT UNSIGNED NOT NULL AFTER user_id,
  ADD COLUMN IF NOT EXISTS wallet_index INT UNSIGNED NULL AFTER chain_id,
  ADD COLUMN IF NOT EXISTS wallet_path VARCHAR(128) NULL AFTER wallet_index,
  ADD COLUMN IF NOT EXISTS derivation_index INT UNSIGNED NOT NULL AFTER chain_id,
  ADD UNIQUE KEY uniq_user_chain (user_id, chain_id),
  ADD UNIQUE KEY uniq_wallet_index (chain_id, wallet_index),
  ADD UNIQUE KEY uniq_addr (chain_id, address),
  ADD INDEX idx_user (user_id),
  MODIFY COLUMN user_id INT NOT NULL;

UPDATE wallet_addresses SET wallet_index = derivation_index WHERE wallet_index IS NULL;
UPDATE wallet_addresses SET wallet_path = CONCAT("m/44'/60'/0'/0/", wallet_index) WHERE wallet_path IS NULL AND wallet_index IS NOT NULL;
ALTER TABLE wallet_addresses MODIFY wallet_index INT UNSIGNED NOT NULL;

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

ALTER TABLE user_balances
  DROP COLUMN IF EXISTS usd_balance,
  DROP COLUMN IF EXISTS chain,
  DROP COLUMN IF EXISTS status,
  MODIFY COLUMN user_id INT NOT NULL;
