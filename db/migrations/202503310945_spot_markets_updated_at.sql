-- Ensure spot markets have update tracking
ALTER TABLE spot_markets
  ADD COLUMN IF NOT EXISTS updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

-- Backfill existing rows to avoid NULLs in SELECTs
UPDATE spot_markets SET updated_at = COALESCE(updated_at, NOW());
