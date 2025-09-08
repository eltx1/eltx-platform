-- Normalize amounts and token addresses for wallet_deposits
UPDATE wallet_deposits SET token_address='0x0000000000000000000000000000000000000000' WHERE token_address IS NULL;
-- convert decimal amount_wei for native deposits (18 decimals)
UPDATE wallet_deposits
  SET amount_wei = CAST(REPLACE(amount_wei, '.', '') AS UNSIGNED) * POW(10, 18 - LENGTH(SUBSTRING_INDEX(amount_wei, '.', -1)))
  WHERE amount_wei LIKE '%.%' AND token_address='0x0000000000000000000000000000000000000000';
UPDATE wallet_deposits SET log_index=0 WHERE log_index IS NULL;

