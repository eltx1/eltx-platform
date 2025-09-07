import { config as dotenv } from 'dotenv';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// 1) load worker-local env first (if exists)
const workerEnvPath = resolve(__dirname, '..', '.env');
dotenv({ path: workerEnvPath, override: false });

// 2) then try project root .env (if missing or keys incomplete)
const rootEnvPath = resolve(__dirname, '..', '..', '..', '.env');
dotenv({ path: rootEnvPath, override: false });

// verification function required on each run
export function assertRequiredEnv() {
  const required = [
    'CHAIN', 'CHAIN_ID', 'RPC_HTTP', 'RPC_WS',
    'CONFIRMATIONS', 'DATABASE_URL'
  ];
  const missing = required.filter(k => !process.env[k] || String(process.env[k]).trim() === '');
  if (missing.length) {
    const hint = `
[ENV ERROR] Missing required vars: ${missing.join(', ')}
- Ensure apps/worker/.env exists OR create a symlink to project root .env.
- README instructs copying: "cp apps/worker/.env.example apps/worker/.env".
- Current lookup order:
    1) ${workerEnvPath}
    2) ${rootEnvPath}
- Example: RPC_HTTP should be set.`;
    throw new Error(hint);
  }
}

