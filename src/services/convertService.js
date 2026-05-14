const { ethers } = require('ethers');

const PANCAKE_V3_ROUTER = '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4';
const PANCAKE_V3_QUOTER = '0xB048BBC1Ee6B733FFfFfdb9e9Ce3E9aA4EaD7940';
const CHAIN_ID = Number(process.env.CONVERT_CHAIN_ID || 56);
const RPC_URL = process.env.BSC_RPC_URL || process.env.BSC_RPC_HTTP || process.env.RPC_URL || '';
const HOT_WALLET_PK = process.env.CONVERT_HOT_WALLET_PK || '';

const ROUTER_ABI = [
  'function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)',
];

const QUOTER_ABI = [
  'function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut)',
];

class ConvertService {
  constructor(pool) {
    this.pool = pool;
    this.provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
    this.wallet = HOT_WALLET_PK ? new ethers.Wallet(HOT_WALLET_PK, this.provider) : null;
    this.router = new ethers.Contract(PANCAKE_V3_ROUTER, ROUTER_ABI, this.wallet || this.provider);
    this.quoter = new ethers.Contract(PANCAKE_V3_QUOTER, QUOTER_ABI, this.provider);
    this.assetMap = {
      crypto: { symbol: 'USDT', decimals: 18, token: process.env.CONVERT_USDT_ADDRESS || '0x55d398326f99059fF775485246999027B3197955' },
      gold: { symbol: 'XAU', decimals: 18, usdPrice: Number(process.env.CONVERT_GOLD_USD || 2350) },
      stocks: { symbol: 'STOCK', decimals: 18, usdPrice: Number(process.env.CONVERT_STOCK_USD || 100) },
    };
  }
  normalizeAsset(asset) {
    const key = String(asset || '').toLowerCase();
    if (!this.assetMap[key]) throw new Error('Unsupported asset');
    return key;
  }
  async getQuote(amountIn, fromAsset, toAsset) {
    const from = this.normalizeAsset(fromAsset);
    const to = this.normalizeAsset(toAsset);
    if (from === to) throw new Error('Assets must be different');
    const amountWei = ethers.parseUnits(String(amountIn), this.assetMap[from].decimals);
    if (from === 'crypto' || to === 'crypto') {
      const tokenIn = this.assetMap[from].token;
      const tokenOut = this.assetMap[to].token || this.assetMap.crypto.token;
      const amountOut = await this.quoter.quoteExactInputSingle.staticCall({ tokenIn, tokenOut, amountIn: amountWei, fee: 2500, sqrtPriceLimitX96: 0 });
      return { amountIn: amountWei.toString(), amountOut: amountOut.toString(), fromAsset: from, toAsset: to, source: 'onchain' };
    }
    const usdValue = Number(amountIn) * this.assetMap[from].usdPrice;
    const out = usdValue / this.assetMap[to].usdPrice;
    return { amountIn: amountWei.toString(), amountOut: ethers.parseUnits(out.toFixed(8), this.assetMap[to].decimals).toString(), fromAsset: from, toAsset: to, source: 'value-based' };
  }

  async executeConvert(userId, amountIn, fromAsset, toAsset, slippageBps) {
    const quote = await this.getQuote(amountIn, fromAsset, toAsset);
    const conn = await this.pool.getConnection();
    let chainTx = null;
    try {
      await conn.beginTransaction();
      const fromSymbol = this.assetMap[this.normalizeAsset(fromAsset)].symbol;
      const toSymbol = this.assetMap[this.normalizeAsset(toAsset)].symbol;
      const [rows] = await conn.query('SELECT balance_wei FROM user_balances WHERE user_id=? AND UPPER(asset)=? FOR UPDATE', [userId, fromSymbol]);
      const current = BigInt(rows[0]?.balance_wei || '0');
      const debit = BigInt(quote.amountIn);
      if (current < debit) throw new Error('Insufficient balance');
      await conn.query('UPDATE user_balances SET balance_wei=balance_wei-? WHERE user_id=? AND UPPER(asset)=?', [debit.toString(), userId, fromSymbol]);
      await conn.query('INSERT INTO user_balances (user_id, asset, balance_wei) VALUES (?,?,?) ON DUPLICATE KEY UPDATE balance_wei=balance_wei+VALUES(balance_wei)', [userId, toSymbol, quote.amountOut]);
      await conn.query('INSERT INTO wallet_transactions (user_id, type, amount_wei, asset, to_asset, tx_hash, status, metadata) VALUES (?,?,?,?,?,?,?,?)', [userId, 'convert', debit.toString(), fromSymbol, toSymbol, '', 'pending', JSON.stringify({ slippageBps, quote })]);
      if (this.normalizeAsset(fromAsset) === 'crypto') {
        if (!this.wallet) throw new Error('CONVERT_HOT_WALLET_PK missing');
        const amountOutMin = (BigInt(quote.amountOut) * BigInt(10000 - Number(slippageBps || 0))) / 10000n;
        const params = {
          tokenIn: this.assetMap.crypto.token,
          tokenOut: this.assetMap[this.normalizeAsset(toAsset)].token || this.assetMap.crypto.token,
          fee: 2500,
          recipient: this.wallet.address,
          amountIn: BigInt(quote.amountIn),
          amountOutMinimum: amountOutMin,
          sqrtPriceLimitX96: 0,
        };
        const gas = await this.router.exactInputSingle.estimateGas(params);
        const tx = await this.router.exactInputSingle(params, { gasLimit: (gas * 12n) / 10n });
        const receipt = await tx.wait();
        chainTx = { hash: tx.hash, receipt };
      }
      await conn.commit();
      return { ok: true, quote, chainTx, balanceUpdate: { debited: quote.amountIn, credited: quote.amountOut } };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
}

module.exports = { ConvertService };
