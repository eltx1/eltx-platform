CREATE TABLE IF NOT EXISTS creator_monetization_settings (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  required_premium_followers INT UNSIGNED NOT NULL DEFAULT 10,
  payout_per_1000_views_usdt DECIMAL(18,6) NOT NULL DEFAULT 0.010000,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO creator_monetization_settings (id, required_premium_followers, payout_per_1000_views_usdt)
VALUES (1, 10, 0.010000)
ON DUPLICATE KEY UPDATE
  required_premium_followers = VALUES(required_premium_followers),
  payout_per_1000_views_usdt = VALUES(payout_per_1000_views_usdt);

CREATE TABLE IF NOT EXISTS social_post_unique_views (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  post_id BIGINT UNSIGNED NOT NULL,
  viewer_user_id BIGINT UNSIGNED NOT NULL,
  creator_user_id BIGINT UNSIGNED NOT NULL,
  view_started_at DATETIME NOT NULL,
  view_window_start DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_post_view_window (post_id, viewer_user_id, view_window_start),
  INDEX idx_creator_views (creator_user_id, created_at),
  INDEX idx_post_views (post_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS creator_monthly_payouts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  creator_user_id BIGINT UNSIGNED NOT NULL,
  payout_month DATE NOT NULL,
  unique_views INT UNSIGNED NOT NULL DEFAULT 0,
  amount_usdt DECIMAL(18,6) NOT NULL DEFAULT 0.000000,
  status ENUM('scheduled','in_review','paid') NOT NULL DEFAULT 'scheduled',
  paid_at DATETIME DEFAULT NULL,
  paid_by_admin_id BIGINT UNSIGNED DEFAULT NULL,
  tx_reference VARCHAR(191) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_creator_month (creator_user_id, payout_month),
  INDEX idx_payout_status (status, payout_month),
  INDEX idx_creator_status (creator_user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO platform_settings (name, value)
VALUES
  ('creator_monetization_settings_json', JSON_OBJECT('requiredPremiumFollowers', 10, 'payoutPerThousandViews', 0.01)),
  ('creator_monetization_monthly_settlement_day', '1')
ON DUPLICATE KEY UPDATE value = VALUES(value);
