const path = require('path');
const fs = require('fs');

// تحميل الـ .env
const primaryEnv = '/home/dash/.env';
const fallbackEnv = path.join(__dirname, '../../.env');
if (fs.existsSync(primaryEnv)) require('dotenv').config({ path: primaryEnv });
if (fs.existsSync(fallbackEnv)) require('dotenv').config({ path: fallbackEnv, override: true });

// إعدادات الإيثيريوم
process.env.CHAIN_ID = process.env.ETH_CHAIN_ID || '1';
process.env.RPC_HTTP = process.env.ETH_RPC_HTTP || process.env.ETH_RPC_URL || '';
process.env.RPC_WS = process.env.ETH_RPC_WS || '';
process.env.OMNIBUS_ADDRESS = process.env.ETH_OMNIBUS_ADDRESS || '';
process.env.OMNIBUS_PK = process.env.ETH_OMNIBUS_PK || '';
process.env.MIN_SWEEP_WEI_BNB = process.env.MIN_SWEEP_WEI_ETH || '0';
process.env.KEEP_BNB_DUST_WEI = process.env.KEEP_ETH_DUST_WEI || '0';
process.env.MIN_TOKEN_SWEEP_USD = process.env.ETH_MIN_TOKEN_SWEEP_USD || process.env.MIN_TOKEN_SWEEP_USD || '0';
process.env.GAS_DRIP_WEI = process.env.ETH_GAS_DRIP_WEI || '0';
process.env.TX_MAX_RETRY = process.env.ETH_TX_MAX_RETRY || '3';
process.env.SWEEP_RATE_LIMIT_PER_MIN = process.env.ETH_SWEEP_RATE_LIMIT_PER_MIN || '12';
process.env.CONFIRMATIONS = process.env.ETH_CONFIRMATIONS || process.env.CONFIRMATIONS || '5';
process.env.GAS_PRICE_MIN_GWEI = process.env.ETH_GAS_PRICE_MIN_GWEI || process.env.GAS_PRICE_MIN_GWEI || '3';
process.env.NATIVE_SYMBOL = 'ETH';

// أهم حاجة: نجبر الـ offset للإيثيريوم زي BNB بالظبط
process.env.FORCE_OFFSET = '1000000';

// نعدل الـ deriveWallet داخليًا قبل ما نشغل الكود الأساسي
const originalRequire = require;
global.deriveWalletOverride = function (index, provider) {
  const realIndex = Number(index) + 1000000;
  const ethers = originalRequire('ethers');
  return ethers.HDNodeWallet.fromPhrase(
    process.env.MASTER_MNEMONIC,
    undefined,
    `m/44'/60'/0'/0/${realIndex}`
  ).connect(provider);
};

// نشغل الكود الأساسي (sweeper.js)
require('../sweeper/sweeper.js');
