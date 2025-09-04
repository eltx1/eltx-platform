-- ensure credited column and indexes exist
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wallet_deposits' AND COLUMN_NAME = 'credited');
SET @sql := IF(@col = 0, 'ALTER TABLE wallet_deposits ADD COLUMN credited TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wallet_deposits' AND INDEX_NAME = 'idx_chain_status_credited');
SET @sql := IF(@idx = 0, 'ALTER TABLE wallet_deposits ADD INDEX idx_chain_status_credited (chain_id, status, credited)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
