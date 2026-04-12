-- Disable Binance liquidity spread so only platform commission applies
INSERT INTO platform_settings (name, value)
VALUES ('binance_liquidity_spread_bps', '0')
ON DUPLICATE KEY UPDATE value = VALUES(value);

