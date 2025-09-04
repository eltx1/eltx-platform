CREATE TABLE IF NOT EXISTS staking_plans (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(20) NOT NULL,
  duration_days INT UNSIGNED NOT NULL,
  apr_bps INT UNSIGNED NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS staking_positions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  plan_id INT UNSIGNED NOT NULL,
  amount DECIMAL(24,8) NOT NULL,
  apr_bps_snapshot INT UNSIGNED NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  daily_reward DECIMAL(24,8) NOT NULL,
  accrued_total DECIMAL(24,8) NOT NULL DEFAULT 0,
  status ENUM('active','matured','cancelled') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_positions_plan FOREIGN KEY (plan_id) REFERENCES staking_plans(id),
  CONSTRAINT fk_positions_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS staking_accruals (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  position_id BIGINT UNSIGNED NOT NULL,
  accrual_date DATE NOT NULL,
  amount DECIMAL(24,8) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_accrual (position_id, accrual_date),
  CONSTRAINT fk_accrual_position FOREIGN KEY (position_id) REFERENCES staking_positions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO staking_plans (id, name, duration_days, apr_bps) VALUES
  (1, '30d', 30, 600),
  (2, '6m', 180, 1000),
  (3, '1y', 365, 1600)
ON DUPLICATE KEY UPDATE name=VALUES(name), duration_days=VALUES(duration_days), apr_bps=VALUES(apr_bps), is_active=1;
