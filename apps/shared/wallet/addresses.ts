import type { Pool } from 'mysql2/promise';

export interface AddressRow {
  id: number;
  address: string;
  user_id: number;
}

export async function getDepositAddressesBatch(
  db: Pool,
  {
    limit,
    cursor = 0,
  }: { limit: number; cursor?: number }
): Promise<{ rows: AddressRow[]; nextCursor: number | null }> {
  const chainId = Number(process.env.CHAIN_ID || 56);
  const [rows] = await db.query(
    'SELECT id, address, user_id FROM wallet_addresses WHERE chain_id=? AND id>? ORDER BY id ASC LIMIT ?',
    [chainId, cursor, limit]
  );
  const typed = (rows as any[]).map((r) => ({
    id: Number(r.id),
    address: String(r.address).toLowerCase(),
    user_id: Number(r.user_id),
  }));
  const nextCursor = typed.length === limit ? typed[typed.length - 1].id : null;
  return { rows: typed, nextCursor };
}

export async function getUserIdForAddress(db: Pool, address: string): Promise<number | null> {
  const [rows] = await db.query('SELECT user_id FROM wallet_addresses WHERE address=? LIMIT 1', [address.toLowerCase()]);
  if ((rows as any[]).length) return Number((rows as any[])[0].user_id);
  return null;
}
