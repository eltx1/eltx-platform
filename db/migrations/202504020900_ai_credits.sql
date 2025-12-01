-- AI chat daily credits and billing
CREATE TABLE IF NOT EXISTS ai_daily_usage (
  user_id INT NOT NULL,
  usage_date DATE NOT NULL,
  messages_used INT UNSIGNED NOT NULL DEFAULT 0,
  paid_messages INT UNSIGNED NOT NULL DEFAULT 0,
  eltx_spent_wei DECIMAL(65,0) NOT NULL DEFAULT 0,
  last_message_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, usage_date),
  INDEX idx_ai_usage_date (usage_date),
  CONSTRAINT fk_ai_usage_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ai_message_ledger (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  usage_date DATE NOT NULL,
  charge_type ENUM('free','eltx') NOT NULL,
  asset VARCHAR(32) NOT NULL,
  amount_wei DECIMAL(65,0) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ai_ledger_user_date (user_id, usage_date),
  INDEX idx_ai_ledger_type (charge_type),
  CONSTRAINT fk_ai_ledger_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO platform_settings (name, value) VALUES ('ai_daily_free_messages', '10');
INSERT IGNORE INTO platform_settings (name, value) VALUES ('ai_message_price_eltx', '1');
