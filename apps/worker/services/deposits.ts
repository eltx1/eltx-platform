import { sql, pool } from './db.ts';

export async function upsertDeposit(row: {
  to_address: string;
  from_address: string;
  token_symbol: string;
  token_address: string | null;
  amount_wei: string;
  tx_hash: string;
  block_number: number;
  status: 'pending' | 'confirmed';
  confirmations: number;
  source: string;
}): Promise<'new' | 'updated' | 'duplicate'> {
  const [res]: any = await pool.query(
    `INSERT INTO wallet_deposits (
      to_address, from_address, token_symbol, token_address, amount_wei,
      tx_hash, block_number, status, confirmations, source
    ) VALUES (?,?,?,?,?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE status=VALUES(status), confirmations=VALUES(confirmations), last_update_at=CURRENT_TIMESTAMP`,
    [
      row.to_address.toLowerCase(),
      row.from_address.toLowerCase(),
      row.token_symbol,
      row.token_address ? row.token_address.toLowerCase() : null,
      row.amount_wei,
      row.tx_hash.toLowerCase(),
      row.block_number,
      row.status,
      row.confirmations,
      row.source,
    ]
  );
  if (res.affectedRows === 1) return 'new';
  if (res.affectedRows === 2) return 'updated';
  return 'duplicate';
}

export async function markConfirmed(txHash: string, blockNumber: number): Promise<boolean> {
  const [res]: any = await sql.query(
    `UPDATE wallet_deposits SET status='confirmed', block_number=?, last_update_at=CURRENT_TIMESTAMP WHERE tx_hash=? AND status<>'confirmed'`,
    [blockNumber, txHash.toLowerCase()]
  );
  return res.affectedRows > 0;
}
