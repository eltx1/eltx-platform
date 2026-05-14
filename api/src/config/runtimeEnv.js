const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const HOME_DASH_ENV_PATH = '/home/dash/.env';
const LOCAL_ENV_PATH = path.resolve(process.cwd(), '.env');

function parseEnvFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const out = {};
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx <= 0) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim().replace(/^['\"]|['\"]$/g, '');
      out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function getRuntimeEnv(key) {
  const processValue = process.env[key];
  if (processValue !== undefined && String(processValue).trim() !== '') return String(processValue).trim();
  const homeEnv = parseEnvFile(HOME_DASH_ENV_PATH);
  if (homeEnv[key]) return homeEnv[key];
  const localEnv = parseEnvFile(LOCAL_ENV_PATH);
  return localEnv[key] || '';
}

function normalizePrivateKey(rawPk) {
  const value = String(rawPk || '').replace(/^\uFEFF/, '').replace(/\r/g, '').replace(/["']/g, '').trim();
  if (!value) return { normalizedPk: '', valid: false };
  if (value.startsWith('0x')) return { normalizedPk: value, valid: /^0x[0-9a-fA-F]{64}$/.test(value) };
  if (/^[0-9a-fA-F]{64}$/.test(value)) return { normalizedPk: `0x${value}`, valid: true };
  return { normalizedPk: value, valid: false };
}

function getConvertRuntimeDiagnostics() {
  const homeEnv = parseEnvFile(HOME_DASH_ENV_PATH);
  const localEnv = parseEnvFile(LOCAL_ENV_PATH);
  const keys = ['BSC_RPC_URL','BSC_RPC_HTTP','CONVERT_HOT_WALLET_PK','CONVERT_HOT_WALLET_ADDRESS','TOKEN_WBNB','TOKEN_USDT','PANCAKE_V3_ROUTER','PANCAKE_V3_QUOTER_V2'];
  const envDiagnostics = {};
  for (const key of keys) {
    envDiagnostics[key] = {
      inProcessEnv: !!(process.env[key] && String(process.env[key]).trim()),
      inHomeDashEnv: !!homeEnv[key],
      inLocalEnv: !!localEnv[key],
      redacted: (process.env[key] || homeEnv[key] || localEnv[key]) ? '***' : null,
    };
  }

  const rpc = getRuntimeEnv('BSC_RPC_URL') || getRuntimeEnv('BSC_RPC_HTTP');
  const rawPk = getRuntimeEnv('CONVERT_HOT_WALLET_PK');
  const configuredAddress = String(getRuntimeEnv('CONVERT_HOT_WALLET_ADDRESS') || '').toLowerCase();
  const normalizedPk = normalizePrivateKey(rawPk);
  const missingEnv = [];
  const invalidEnv = [];
  if (!rpc) missingEnv.push('BSC_RPC_URL (or BSC_RPC_HTTP)');
  if (!rawPk) missingEnv.push('CONVERT_HOT_WALLET_PK');
  if (!configuredAddress) missingEnv.push('CONVERT_HOT_WALLET_ADDRESS');
  if (rawPk && !normalizedPk.valid) invalidEnv.push('CONVERT_HOT_WALLET_PK');

  let derivedAddress = '';
  if (normalizedPk.valid) {
    try { derivedAddress = ethers.computeAddress(normalizedPk.normalizedPk).toLowerCase(); } catch { invalidEnv.push('CONVERT_HOT_WALLET_PK'); }
  }
  const walletAddressMatch = !!(configuredAddress && derivedAddress && configuredAddress === derivedAddress);
  if (configuredAddress && derivedAddress && configuredAddress !== derivedAddress) invalidEnv.push('CONVERT_HOT_WALLET_ADDRESS mismatch with CONVERT_HOT_WALLET_PK');

  return { rpcUrl: rpc, privateKey: normalizedPk.valid ? normalizedPk.normalizedPk : '', resolvedWalletAddress: derivedAddress || configuredAddress || null, walletAddressMatch, missingEnv, invalidEnv, envDiagnostics };
}

module.exports = { getRuntimeEnv, getConvertRuntimeDiagnostics, normalizePrivateKey };
