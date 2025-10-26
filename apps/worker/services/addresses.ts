import { sql } from './db.ts';

export async function getAllDepositAddresses(): Promise<string[]> {
  const chainId = Number(process.env.CHAIN_ID);
  const rows = await sql.query<{ address: string }>(
    'SELECT address FROM wallet_addresses WHERE chain_id=?',
    [chainId]
  );
  return rows.map((r) => String(r.address).toLowerCase());
}
