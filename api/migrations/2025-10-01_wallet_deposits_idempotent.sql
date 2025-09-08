-- Migration: wallet_deposits idempotent key and normalization

UPDATE wallet_deposits SET token_address='0x0000000000000000000000000000000000000000' WHERE token_address IS NULL;
UPDATE wallet_deposits SET tx_hash=CONCAT('legacy:', id) WHERE tx_hash IS NULL OR tx_hash='';

ALTER TABLE wallet_deposits ADD COLUMN IF NOT EXISTS log_index INT UNSIGNED NOT NULL DEFAULT 0 AFTER tx_hash;
ALTER TABLE wallet_deposits MODIFY token_address VARCHAR(64) NOT NULL DEFAULT '0x0000000000000000000000000000000000000000';
ALTER TABLE wallet_deposits MODIFY tx_hash VARCHAR(80) NOT NULL;

ALTER TABLE wallet_deposits DROP INDEX IF EXISTS uniq_wallet_deposits_tx_token_addr;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_wallet_deposits_chain_token_addr_tx_log ON wallet_deposits (chain_id, token_address, address, tx_hash, log_index);
CREATE INDEX IF NOT EXISTS idx_wallet_deposits_addr_block ON wallet_deposits (address, block_number);
