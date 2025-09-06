// Token metadata used for scanning
const tokenMap = {
  BNB: { symbol: 'BNB', address: null, decimals: 18 },
  USDT: {
    symbol: 'USDT',
    address: (process.env.TOKEN_USDT || '0x55d398326f99059ff775485246999027b3197955').toLowerCase(),
    decimals: Number(process.env.TOKEN_USDT_DECIMALS || 18)
  },
  USDC: {
    symbol: 'USDC',
    address: (process.env.TOKEN_USDC || '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d').toLowerCase(),
    decimals: Number(process.env.TOKEN_USDC_DECIMALS || 18)
  }
};

const TRANSFER_TOPIC = require('./shared/erc20').TRANSFER_TOPIC;

module.exports = { tokenMap, TRANSFER_TOPIC };
