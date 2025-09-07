import type { Pool } from 'mysql2/promise';

export interface DepositRow {
  user_id: number;
  chain_id: number;
  from_address: string;
  to_address: string;
  token_symbol: string;
  token_address: string | null;
  amount_wei: string;
  tx_hash: string;
  block_number: number;
  status: string;
  confirmations: number;
  source?: string;
}

export async function upsertDeposit(db: Pool, row: DepositRow) {
  await db.query(
    `INSERT INTO wallet_deposits (
      user_id, chain_id, from_address, to_address, token_symbol, token_address, amount_wei, tx_hash, block_number, status, confirmations, source
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE status=VALUES(status), confirmations=VALUES(confirmations), last_update_at=CURRENT_TIMESTAMP`,
    [
      row.user_id,
      row.chain_id,
      row.from_address.toLowerCase(),
      row.to_address.toLowerCase(),
      row.token_symbol,
      row.token_address ? row.token_address.toLowerCase() : null,
      row.amount_wei,
      row.tx_hash.toLowerCase(),
      row.block_number,
      row.status,
      row.confirmations,
      row.source || 'worker',
    ]
  );
}

export async function markConfirmed(db: Pool, txHash: string, blockNumber: number) {
  await db.query(
    `UPDATE wallet_deposits SET status='confirmed', block_number=?, last_update_at=CURRENT_TIMESTAMP WHERE tx_hash=?`,
    [blockNumber, txHash.toLowerCase()]
  );
}
