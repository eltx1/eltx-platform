import type { Pool } from 'mysql2/promise';

export interface AddressProgress {
  address: string;
  last_scanned_block: number | null;
  last_seen_balance_wei: string | null;
  last_scan_at: Date | null;
  next_eligible_at: Date | null;
}

export async function getAddressProgress(db: Pool, address: string): Promise<AddressProgress | null> {
  const [rows] = await db.query(
    'SELECT address,last_scanned_block,last_seen_balance_wei,last_scan_at,next_eligible_at FROM address_scan_progress WHERE address=?',
    [address.toLowerCase()]
  );
  if ((rows as any[]).length) return rows[0] as AddressProgress;
  return null;
}

export async function updateAddressProgress(db: Pool, address: string, patch: Partial<AddressProgress>) {
  const fields = Object.keys(patch);
  const sets = fields.map((f) => `${f}=?`).join(',');
  const values = fields.map((f) => (patch as any)[f]);
  await db.query(
    `INSERT INTO address_scan_progress (address, ${fields.join(',')}) VALUES (?,${fields.map(() => '?').join(',')})
    ON DUPLICATE KEY UPDATE ${sets}`,
    [address.toLowerCase(), ...values, ...values]
  );
}
