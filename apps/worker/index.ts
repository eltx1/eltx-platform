import { config as dotenv } from 'dotenv';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv({ path: resolve(__dirname, '.env') });
dotenv({ path: resolve(__dirname, '../../.env'), override: false });

import { getAllDepositAddresses } from './services/addresses.ts';
import { scanOneAddress } from './services/addressScanner.ts';

function assertRequiredEnv() {
  const required = ['RPC_HTTP', 'RPC_WS', 'CONFIRMATIONS', 'DATABASE_URL'];
  const missing = required.filter((k) => !process.env[k] || String(process.env[k]).trim() === '');
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
}

const SCAN_CONCURRENCY = Number(process.env.WORKER_CONCURRENCY || 3);
const SLEEP_MS = Number(process.env.WORKER_SLEEP_MS || 1500);

async function main() {
  assertRequiredEnv();
  while (true) {
    const addrs = await getAllDepositAddresses();
    for (let i = 0; i < addrs.length; i += SCAN_CONCURRENCY) {
      const chunk = addrs.slice(i, i + SCAN_CONCURRENCY);
      await Promise.allSettled(
        chunk.map((a) =>
          scanOneAddress(a).catch((e) => {
            console.error('[ERR][scan]', e?.message || e);
          })
        )
      );
    }
    await new Promise((r) => setTimeout(r, SLEEP_MS));
  }
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
