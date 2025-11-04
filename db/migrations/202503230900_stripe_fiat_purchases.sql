-- Stripe fiat purchases support

CREATE TABLE IF NOT EXISTS fiat_purchases (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  stripe_session_id VARCHAR(191) NULL,
  stripe_payment_intent_id VARCHAR(191) NULL,
  status ENUM('pending','succeeded','failed','canceled','expired','refunded') NOT NULL DEFAULT 'pending',
  currency VARCHAR(8) NOT NULL DEFAULT 'USD',
  usd_amount DECIMAL(12,2) NOT NULL,
  usd_amount_minor BIGINT UNSIGNED NOT NULL,
  amount_charged_minor BIGINT UNSIGNED NULL,
  price_eltx DECIMAL(36,18) NOT NULL,
  eltx_amount DECIMAL(36,18) NOT NULL,
  eltx_amount_wei DECIMAL(65,0) NOT NULL,
  credited TINYINT(1) NOT NULL DEFAULT 0,
  wallet_deposit_id BIGINT UNSIGNED NULL,
  failure_code VARCHAR(64) NULL,
  failure_message TEXT NULL,
  metadata JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  credited_at DATETIME NULL,
  INDEX idx_fiat_purchases_user_status (user_id, status),
  UNIQUE KEY uniq_fiat_purchase_session (stripe_session_id),
  UNIQUE KEY uniq_fiat_purchase_intent (stripe_payment_intent_id),
  CONSTRAINT fk_fiat_purchases_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE wallet_deposits
  ADD COLUMN IF NOT EXISTS source ENUM('worker','on_demand','stripe') NOT NULL DEFAULT 'worker' AFTER credited,
  ADD COLUMN IF NOT EXISTS scanner_run_id VARCHAR(36) NULL AFTER source,
  ADD COLUMN IF NOT EXISTS last_update_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

ALTER TABLE wallet_deposits
  MODIFY COLUMN source ENUM('worker','on_demand','stripe') NOT NULL DEFAULT 'worker';
