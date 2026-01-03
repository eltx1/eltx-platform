CREATE TABLE IF NOT EXISTS staking_plans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(32) NOT NULL,
  duration_days INT NOT NULL,
  apr_bps INT NOT NULL,
  stake_asset VARCHAR(32) NOT NULL DEFAULT 'ELTX',
  stake_decimals INT NOT NULL DEFAULT 18,
  min_deposit_wei DECIMAL(65,0) DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE staking_plans
  ADD COLUMN IF NOT EXISTS stake_asset VARCHAR(32) NOT NULL DEFAULT 'ELTX' AFTER apr_bps,
  ADD COLUMN IF NOT EXISTS stake_decimals INT NOT NULL DEFAULT 18 AFTER stake_asset,
  ADD COLUMN IF NOT EXISTS min_deposit_wei DECIMAL(65,0) NULL DEFAULT NULL AFTER stake_decimals;

CREATE TABLE IF NOT EXISTS staking_positions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  plan_id INT NOT NULL,
  stake_asset VARCHAR(32) NOT NULL DEFAULT 'ELTX',
  stake_decimals INT NOT NULL DEFAULT 18,
  amount DECIMAL(36,18) NOT NULL,
  amount_wei DECIMAL(65,0) NOT NULL,
  apr_bps_snapshot INT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  daily_reward DECIMAL(36,18) NOT NULL,
  accrued_total DECIMAL(36,18) NOT NULL DEFAULT 0,
  status ENUM('active','matured','cancelled') NOT NULL DEFAULT 'active',
  principal_redeemed TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (plan_id) REFERENCES staking_plans(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

ALTER TABLE staking_positions
  ADD COLUMN IF NOT EXISTS stake_asset VARCHAR(32) NOT NULL DEFAULT 'ELTX' AFTER plan_id,
  ADD COLUMN IF NOT EXISTS stake_decimals INT NOT NULL DEFAULT 18 AFTER stake_asset,
  ADD COLUMN IF NOT EXISTS amount_wei DECIMAL(65,0) NOT NULL AFTER amount,
  ADD COLUMN IF NOT EXISTS daily_reward DECIMAL(36,18) NOT NULL AFTER end_date,
  ADD COLUMN IF NOT EXISTS accrued_total DECIMAL(36,18) NOT NULL DEFAULT 0 AFTER daily_reward,
  MODIFY COLUMN amount DECIMAL(36,18) NOT NULL,
  MODIFY COLUMN daily_reward DECIMAL(36,18) NOT NULL,
  MODIFY COLUMN accrued_total DECIMAL(36,18) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS principal_redeemed TINYINT(1) NOT NULL DEFAULT 0 AFTER status;

CREATE TABLE IF NOT EXISTS staking_accruals (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  position_id BIGINT NOT NULL,
  accrual_date DATE NOT NULL,
  amount DECIMAL(36,18) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_accrual (position_id, accrual_date),
  FOREIGN KEY (position_id) REFERENCES staking_positions(id)
);

INSERT INTO staking_plans (id, name, duration_days, apr_bps, stake_asset, stake_decimals, is_active)
SELECT *
FROM (
  SELECT 1 AS id, '30d' AS name, 30 AS duration_days, 600 AS apr_bps, 'ELTX' AS stake_asset, 18 AS stake_decimals, 1 AS is_active
  UNION ALL
  SELECT 2 AS id, '6m' AS name, 180 AS duration_days, 1000 AS apr_bps, 'ELTX' AS stake_asset, 18 AS stake_decimals, 1 AS is_active
  UNION ALL
  SELECT 3 AS id, '1y' AS name, 365 AS duration_days, 1600 AS apr_bps, 'ELTX' AS stake_asset, 18 AS stake_decimals, 1 AS is_active
) AS defaults
WHERE NOT EXISTS (
  SELECT 1 FROM staking_plans sp WHERE sp.id = defaults.id
);
