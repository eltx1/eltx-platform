-- Referral system tables and settings

CREATE TABLE IF NOT EXISTS referral_codes (
  user_id INT NOT NULL,
  code VARCHAR(32) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  UNIQUE KEY uniq_referral_code (code),
  CONSTRAINT fk_referral_codes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS referrals (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  referrer_user_id INT NOT NULL,
  referred_user_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_referrals_referred (referred_user_id),
  INDEX idx_referrals_referrer (referrer_user_id),
  CONSTRAINT fk_referrals_referrer FOREIGN KEY (referrer_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_referrals_referred FOREIGN KEY (referred_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS referral_rewards (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  referrer_user_id INT NOT NULL,
  referred_user_id INT NOT NULL,
  reward_asset VARCHAR(32) NOT NULL DEFAULT 'ELTX',
  fee_type VARCHAR(32) NOT NULL DEFAULT 'spot',
  fee_reference VARCHAR(128) NOT NULL DEFAULT '',
  purchase_id BIGINT UNSIGNED NULL,
  fee_wei DECIMAL(65,0) NOT NULL DEFAULT 0,
  reward_eltx DECIMAL(36,18) NOT NULL DEFAULT 0,
  reward_wei DECIMAL(65,0) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_referral_rewards_reference (fee_type, fee_reference),
  INDEX idx_referral_rewards_asset (reward_asset),
  INDEX idx_referral_rewards_referrer (referrer_user_id),
  CONSTRAINT fk_referral_rewards_referrer FOREIGN KEY (referrer_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_referral_rewards_referred FOREIGN KEY (referred_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_referral_rewards_purchase FOREIGN KEY (purchase_id) REFERENCES fiat_purchases(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO platform_settings (name, value) VALUES ('referral_reward_eltx', '0');
INSERT IGNORE INTO platform_settings (name, value) VALUES ('referral_fee_share_bps', '0');
