-- add wallet_index and wallet_path to wallet_addresses for HD wallet consistency
SET @col := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'wallet_addresses'
    AND COLUMN_NAME = 'wallet_index'
);
SET @sql := IF(@col = 0, 'ALTER TABLE wallet_addresses ADD COLUMN wallet_index INT UNSIGNED NULL AFTER chain_id', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'wallet_addresses'
    AND COLUMN_NAME = 'wallet_path'
);
SET @sql := IF(@col = 0, 'ALTER TABLE wallet_addresses ADD COLUMN wallet_path VARCHAR(128) NULL AFTER wallet_index', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE wallet_addresses SET wallet_index = derivation_index WHERE wallet_index IS NULL AND derivation_index IS NOT NULL;
UPDATE wallet_addresses SET wallet_path = CONCAT("m/44'/60'/0'/0/", wallet_index) WHERE wallet_path IS NULL AND wallet_index IS NOT NULL;

SET @sql := IF(
  EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wallet_addresses' AND COLUMN_NAME = 'wallet_index'
  ),
  'ALTER TABLE wallet_addresses MODIFY wallet_index INT UNSIGNED NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'wallet_addresses'
    AND INDEX_NAME = 'uniq_wallet_index'
);
SET @sql := IF(@idx = 0, 'ALTER TABLE wallet_addresses ADD UNIQUE INDEX uniq_wallet_index (chain_id, wallet_index)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
