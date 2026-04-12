-- Add configurable Binance liquidity spread for B-Book margin control
INSERT IGNORE INTO platform_settings (name, value)
VALUES ('binance_liquidity_spread_bps', '15');
