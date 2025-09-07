import { createPool } from 'mysql2/promise';
import { getDepositAddressesBatch } from '../shared/wallet/addresses';
import { scanAddress } from './scanAddress';

const PAGE_SIZE = 500;
const MAX_CONCURRENCY = 4;

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');
  const db = createPool(process.env.DATABASE_URL);

  let cursor = 0;
  const queue: { address: string; user_id: number }[] = [];

  while (true) {
    if (queue.length === 0) {
      const { rows, nextCursor } = await getDepositAddressesBatch(db, { limit: PAGE_SIZE, cursor });
      cursor = nextCursor ?? 0;
      queue.push(...rows);
      if (queue.length === 0) {
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
    }

    const batch = queue.splice(0, PAGE_SIZE);
    const chunks = [];
    for (let i = 0; i < batch.length; i += MAX_CONCURRENCY) {
      chunks.push(batch.slice(i, i + MAX_CONCURRENCY));
    }
    for (const group of chunks) {
      await Promise.all(
        group.map((row) =>
          scanAddress(db, row.address, row.user_id).catch((e) => console.error('[ERR][scan]', e.message))
        )
      );
    }
  }
}

main().catch((e) => {
  console.error('[ERR][worker]', e);
  process.exit(1);
});
