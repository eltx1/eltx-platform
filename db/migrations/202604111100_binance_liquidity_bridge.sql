-- Binance liquidity bridge runtime toggle
INSERT INTO platform_settings (name, value)
VALUES ('binance_liquidity_enabled', '0')
ON DUPLICATE KEY UPDATE value = VALUES(value);
