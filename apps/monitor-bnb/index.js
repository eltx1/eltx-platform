require('dotenv').config();
const ethers = require('ethers');
const mysql = require('mysql2/promise');

const CHAIN_ID = Number(process.env.CHAIN_ID);
const CHAIN_NAME = process.env.CHAIN_NAME;
const RPC_HTTP = process.env.RPC_HTTP;
const RPC_WS = process.env.RPC_WS || RPC_HTTP.replace('http', 'ws').replace('s:', 's://');
const DB_URL = process.env.DATABASE_URL;
const CONFIRMATIONS = Number(process.env.CONFIRMATIONS || 12);  // من .env (12)
const POLL_INTERVAL = Number(process.env.POLL_INTERVAL || 12000);
const NATIVE_ASSET = process.env.NATIVE_ASSET || 'BNB';
const ADDR_REFRESH_MINUTES = Number(process.env.ADDR_REFRESH_MINUTES || 10);  // من .env (10)
const OMNIBUS_ADDRESS = process.env.OMNIBUS_ADDRESS.toLowerCase();  // من .env، ignore tx from omnibus

let provider;
let dbPool;
let userAddresses = new Map();  // address -> userId
let lastBlock = null;

async function init() {
  provider = new ethers.WebSocketProvider(RPC_WS);
  provider.on('error', (err) => console.error(`${CHAIN_NAME} WS error:`, err));

  dbPool = mysql.createPool(DB_URL);

  await loadUserAddresses();

  console.log(`Starting ${CHAIN_NAME} deposit monitor (CHAIN_ID=${CHAIN_ID}, CONFIRMATIONS=${CONFIRMATIONS})...`);
  provider.on('block', monitorBlock);
  setInterval(loadUserAddresses, ADDR_REFRESH_MINUTES * 60 * 1000);  // reload every ADDR_REFRESH_MINUTES
}

async function loadUserAddresses() {
  const conn = await dbPool.getConnection();
  try {
    const [rows] = await conn.query(
      'SELECT user_id, address FROM wallet_addresses WHERE chain_id = ?',
      [CHAIN_ID]
    );
    userAddresses.clear();
    rows.forEach(row => userAddresses.set(row.address.toLowerCase(), row.user_id));
    console.log(`Loaded ${userAddresses.size} user addresses for ${CHAIN_NAME}.`);
  } catch (err) {
    console.error('Error loading users:', err);
  } finally {
    conn.release();
  }
}

async function monitorBlock(blockNumber) {
  if (!lastBlock) lastBlock = blockNumber - 1;

  for (let bn = lastBlock + 1; bn <= blockNumber - CONFIRMATIONS; bn++) {
    try {
      const block = await provider.getBlock(bn, true);
      for (const tx of block.transactions) {
        if (!tx.to) continue;
        const toAddr = tx.to.toLowerCase();
        const fromAddr = tx.from.toLowerCase();
        const userId = userAddresses.get(toAddr);
        if (userId && tx.value > 0n && fromAddr !== OMNIBUS_ADDRESS) {  // deposit خارجي فقط
          await updateBalance(userId, tx.value.toString());
          console.log(`Detected external deposit to user ${userId}: ${ethers.formatEther(tx.value)} ${NATIVE_ASSET} from ${tx.from} in tx ${tx.hash} (block ${bn})`);
        }
      }
    } catch (err) {
      console.error(`Error scanning block ${bn} on ${CHAIN_NAME}:`, err);
    }
  }
  lastBlock = blockNumber - CONFIRMATIONS;
}

async function updateBalance(userId, weiAmount) {
  const conn = await dbPool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      'SELECT balance_wei FROM user_balances WHERE user_id=? AND asset=?',
      [userId, NATIVE_ASSET]
    );
    const currentWei = rows.length ? BigInt(rows[0].balance_wei) : 0n;
    const newWei = currentWei + BigInt(weiAmount);
    await conn.query(
      'INSERT INTO user_balances (user_id, asset, balance_wei) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE balance_wei = ?',
      [userId, NATIVE_ASSET, newWei.toString(), newWei.toString()]
    );
    await conn.commit();
    console.log(`Updated balance for user ${userId} on ${CHAIN_NAME}: +${weiAmount} wei`);
  } catch (err) {
    await conn.rollback();
    console.error(`Error updating balance for user ${userId}:`, err);
  } finally {
    conn.release();
  }
}

init().catch(err => console.error('Init error:', err));
