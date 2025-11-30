ALTER TABLE staking_positions
  ADD COLUMN IF NOT EXISTS principal_redeemed TINYINT(1) NOT NULL DEFAULT 0 AFTER status;
