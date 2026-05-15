SET @schema_name := DATABASE();

ALTER TABLE convert_executions MODIFY status VARCHAR(32) NOT NULL DEFAULT 'processing';
UPDATE convert_executions SET status='confirmed' WHERE status='completed';
CREATE INDEX idx_convert_executions_status_v2 ON convert_executions (status);

SET @has_pf_unique := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='platform_fees' AND INDEX_NAME='uniq_platform_fee_type_reference'
);
SET @add_pf_unique_sql := IF(
  @has_pf_unique = 0,
  'ALTER TABLE platform_fees ADD UNIQUE KEY uniq_platform_fee_type_reference (fee_type, reference)',
  'SELECT 1'
);
PREPARE add_pf_unique_stmt FROM @add_pf_unique_sql;
EXECUTE add_pf_unique_stmt;
DEALLOCATE PREPARE add_pf_unique_stmt;
