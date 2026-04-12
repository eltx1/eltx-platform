-- Track Binance-resting spot orders so they don't participate in internal matching
ALTER TABLE spot_orders
  ADD COLUMN IF NOT EXISTS external_bound TINYINT(1) NOT NULL DEFAULT 0 AFTER status,
  ADD COLUMN IF NOT EXISTS external_order_id VARCHAR(128) NULL AFTER external_bound,
  ADD COLUMN IF NOT EXISTS external_status VARCHAR(32) NULL AFTER external_order_id;

ALTER TABLE spot_orders
  ADD INDEX IF NOT EXISTS idx_spot_orders_external_bound (external_bound, status, market_id, side);
