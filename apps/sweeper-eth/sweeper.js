const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

process.env.CHAIN_ID = process.env.ETH_CHAIN_ID || '1';
process.env.RPC_HTTP = process.env.ETH_RPC_HTTP || process.env.ETH_RPC_URL;
process.env.RPC_WS = process.env.ETH_RPC_WS || '';
process.env.OMNIBUS_ADDRESS = process.env.ETH_OMNIBUS_ADDRESS || '';
process.env.OMNIBUS_PK = process.env.ETH_OMNIBUS_PK || '';
process.env.MIN_SWEEP_WEI_BNB = process.env.MIN_SWEEP_WEI_ETH;
process.env.KEEP_BNB_DUST_WEI = process.env.KEEP_ETH_DUST_WEI;
process.env.MIN_TOKEN_SWEEP_USD = process.env.ETH_MIN_TOKEN_SWEEP_USD || process.env.MIN_TOKEN_SWEEP_USD;
process.env.GAS_DRIP_WEI = process.env.ETH_GAS_DRIP_WEI;
process.env.TX_MAX_RETRY = process.env.ETH_TX_MAX_RETRY;
process.env.SWEEP_RATE_LIMIT_PER_MIN = process.env.ETH_SWEEP_RATE_LIMIT_PER_MIN;
process.env.CONFIRMATIONS = process.env.ETH_CONFIRMATIONS || process.env.CONFIRMATIONS;
process.env.GAS_PRICE_MIN_GWEI = process.env.ETH_GAS_PRICE_MIN_GWEI || process.env.GAS_PRICE_MIN_GWEI;
process.env.NATIVE_SYMBOL = 'ETH';

require('../sweeper/sweeper.js');
