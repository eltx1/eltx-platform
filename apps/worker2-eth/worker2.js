const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

process.env.CHAIN_ID = process.env.ETH_CHAIN_ID || '1';
process.env.RPC_HTTP = process.env.ETH_RPC_HTTP || process.env.ETH_RPC_URL;
process.env.RPC_WS = process.env.ETH_RPC_WS || '';
process.env.CONFIRMATIONS = process.env.ETH_CONFIRMATIONS || process.env.CONFIRMATIONS;
process.env.TOKENS_JSON = process.env.ETH_TOKENS_JSON;
process.env.NATIVE_SYMBOL = 'ETH';

require('../worker2/worker2.js');
