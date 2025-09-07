import { config as dotenv } from 'dotenv';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workerEnv = resolve(__dirname, '.env');
const rootEnv = resolve(__dirname, '../../.env');
dotenv({ path: workerEnv });
dotenv({ path: rootEnv, override: false });

import { getAllDepositAddresses } from './services/addresses.ts';
import { scanOneAddress } from './services/addressScanner.ts';
import { getLatestBlockNumber } from './services/bscRpc.ts';
import { logger, envPaths, SAMPLE_RATE, HEARTBEAT_MS, shortAddr } from './services/logger.ts';
import { rpcCall } from './services/rpc.ts';

const ENV_PATHS = [workerEnv, rootEnv];

function assertRequiredEnv() {
  const required = ['RPC_HTTP', 'CONFIRMATIONS', 'DATABASE_URL', 'CHAIN_ID'];
  const missing = required.filter((k) => !process.env[k] || String(process.env[k]).trim() === '');
  if (missing.length) {
    logger.error('WRK', 'ENV', `missing ${missing.join(', ')}; searched ${ENV_PATHS.join(', ')}`);
    process.exit(1);
  }
}

const SCAN_CONCURRENCY = Number(process.env.WORKER_CONCURRENCY || 3);
const SLEEP_MS = Number(process.env.WORKER_SLEEP_MS || 1500);
const RECENT = Number(process.env.USER_SCAN_RECENT_BLOCKS || 1000);
const SAFETY = Number(process.env.USER_SCAN_SAFETY || 12);
const BATCH_BLOCKS = Number(process.env.WORKER_BATCH_BLOCKS || 50);

function startupBanner() {
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)).toString());
  let git = '';
  try { git = execSync('git rev-parse --short HEAD').toString().trim(); } catch {}
  const tsNodeVer = (() => { try { return require('ts-node/package.json').version; } catch { return 'unknown'; } })();
  const nodeVer = process.version;
  const chainId = Number(process.env.CHAIN_ID);
  const chainName = chainId === 56 ? 'bsc' : `chain-${chainId}`;
  const rpcHost = (() => { try { return new URL(String(process.env.RPC_HTTP)).host; } catch { return 'unknown'; }})();
  const envInfo = envPaths(ENV_PATHS);
  logger.info('WRK', 'START', `v${pkg.version}${git ? ' sha=' + git : ''} node=${nodeVer} ts-node=${tsNodeVer} chain=${chainName}(${chainId}) rpc=${rpcHost} conf=${process.env.CONFIRMATIONS} recent=${RECENT} safety=${SAFETY} conc=${SCAN_CONCURRENCY} batch=${BATCH_BLOCKS} sleep=${SLEEP_MS}ms env=[${envInfo.loaded.join(', ')}]`);
  if (envInfo.missing.length) {
    logger.warn('WRK', 'ENV', `missing env files: ${envInfo.missing.join(', ')}`);
  }
}

function heartbeat() {
  let last = Date.now();
  setInterval(() => {
    const mem = process.memoryUsage();
    const rss = Math.round(mem.rss / 1024 / 1024);
    const heap = Math.round(mem.heapUsed / 1024 / 1024);
    const now = Date.now();
    const delay = now - last - HEARTBEAT_MS;
    last = now;
    const uptime = Math.round(process.uptime() / 60);
    logger.info('HB', '', `rss=${rss}MB heap=${heap}MB evDelay≈${Math.round(delay)}ms uptime=${uptime}m`);
  }, HEARTBEAT_MS).unref();
}

async function main() {
  assertRequiredEnv();
  startupBanner();
  heartbeat();
  while (true) {
    const cycleStart = Date.now();
    const addrs = await getAllDepositAddresses();
    const sampled = new Set<string>();
    for (const a of addrs) if (Math.random() < SAMPLE_RATE) sampled.add(a);
    logger.info('WRK', 'ADDR', `total=${addrs.length}, sample=${sampled.size} (rate=${SAMPLE_RATE.toFixed(2)})`);
    if (logger.isDebug() && sampled.size) {
      const sampleList = Array.from(sampled).slice(0, 10).map(shortAddr).join(',');
      logger.debug('WRK', 'ADDR', `sample=${sampleList}`);
    }
    const tipRes = await rpcCall('getLatestBlockNumber', () => getLatestBlockNumber());
    const tip = tipRes.result;
    logger.info('WRK', 'SNAPSHOT', `latest=${tip} took=${tipRes.took}ms`);

    const totals = { new: 0, updated: 0, confirmed: 0, errors: 0 };
    for (let i = 0; i < addrs.length; i += SCAN_CONCURRENCY) {
      const chunk = addrs.slice(i, i + SCAN_CONCURRENCY);
      const results = await Promise.allSettled(
        chunk.map((a) => scanOneAddress(a, tip, sampled.has(a)))
      );
      results.forEach((r) => {
        if (r.status === 'fulfilled') {
          totals.new += r.value.new;
          totals.updated += r.value.updated;
          totals.confirmed += r.value.confirmed;
          totals.errors += r.value.errors;
        } else {
          totals.errors += 1;
          logger.error('SCAN', 'ADDR', r.reason?.message || String(r.reason));
        }
      });
    }
    const totalTook = (Date.now() - cycleStart) / 1000;
    logger.info('SUM', 'CYCLE', `addrs=${addrs.length} new=${totals.new} updated=${totals.updated} confirmed=${totals.confirmed} errors=${totals.errors} totalTook=${totalTook.toFixed(1)}s`);
    await new Promise((r) => setTimeout(r, SLEEP_MS));
  }
}

main().catch((err) => {
  logger.error('FATAL', '', err?.message || String(err));
  process.exit(1);
});
