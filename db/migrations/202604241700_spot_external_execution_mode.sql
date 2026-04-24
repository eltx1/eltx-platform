-- Spot external execution mode: primary (route directly) or fallback (internal then external)
INSERT INTO platform_settings (name, value)
VALUES ('spot_external_execution_mode', 'primary')
ON DUPLICATE KEY UPDATE value = value;
