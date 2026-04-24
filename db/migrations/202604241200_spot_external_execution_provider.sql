-- Add configurable external execution toggle/provider for spot orders
INSERT INTO platform_settings (name, value)
VALUES ('spot_external_execution_enabled', '0')
ON DUPLICATE KEY UPDATE value = value;

INSERT INTO platform_settings (name, value)
VALUES ('spot_liquidity_provider', 'binance')
ON DUPLICATE KEY UPDATE value = value;
