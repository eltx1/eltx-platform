ALTER TABLE users
  ADD COLUMN IF NOT EXISTS first_utm_source VARCHAR(191) NULL,
  ADD COLUMN IF NOT EXISTS first_utm_medium VARCHAR(191) NULL,
  ADD COLUMN IF NOT EXISTS first_utm_campaign VARCHAR(191) NULL,
  ADD COLUMN IF NOT EXISTS first_utm_term VARCHAR(191) NULL,
  ADD COLUMN IF NOT EXISTS first_utm_content VARCHAR(191) NULL,
  ADD COLUMN IF NOT EXISTS first_utm_landing_path VARCHAR(191) NULL,
  ADD COLUMN IF NOT EXISTS first_utm_captured_at DATETIME NULL;

INSERT IGNORE INTO platform_settings (name, value) VALUES ('analytics_event_catalog', '{"signup":true,"login":true,"kyc_submit":true,"trade_buy":true}');
INSERT IGNORE INTO platform_settings (name, value) VALUES ('analytics_consent_mode_enabled', '0');
INSERT IGNORE INTO platform_settings (name, value) VALUES ('analytics_ads_conversion_preset', 'none');
INSERT IGNORE INTO platform_settings (name, value) VALUES ('analytics_ads_conversion_id', '');
INSERT IGNORE INTO platform_settings (name, value) VALUES ('analytics_ads_label_signup', '');
INSERT IGNORE INTO platform_settings (name, value) VALUES ('analytics_ads_label_login', '');
INSERT IGNORE INTO platform_settings (name, value) VALUES ('analytics_ads_label_kyc_submit', '');
INSERT IGNORE INTO platform_settings (name, value) VALUES ('analytics_ads_label_trade_buy', '');
