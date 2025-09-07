const { ethers } = require('ethers');

const CONFIRMATIONS = Number(process.env.CONFIRMATIONS || 12);
const RECENT_BLOCKS = Number(process.env.SWEEPER_DEPOSIT_LOOKBACK || 1000);
const SAFETY_BUFFER = Number(process.env.SWEEPER_DEPOSIT_SAFETY || 12);
const BATCH_BLOCKS = Number(process.env.SWEEPER_DEPOSIT_BATCH || 50);
const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');
const iface = new ethers.Interface(['event Transfer(address indexed from, address indexed to, uint256 value)']);

async function upsertDeposit(pool, row) {
  const keySql =
    'SELECT confirmations, status FROM wallet_deposits WHERE tx_hash=? AND to_address=? AND (token_address <=> ?)';
  let prev;
  try {
    const [kRows] = await pool.query(keySql, [
      row.tx_hash.toLowerCase(),
      row.to_address.toLowerCase(),
      row.token_address ? row.token_address.toLowerCase() : null,
    ]);
    prev = kRows[0];
  } catch (e) {
    console.error('[POST][ERR][DB]', e?.message || e);
    throw e;
  }

  const sql = `INSERT INTO wallet_deposits (
    user_id, to_address, from_address, token_symbol, token_address,
    amount_wei, tx_hash, block_number, status, confirmations, source
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
  ON DUPLICATE KEY UPDATE status=VALUES(status), confirmations=VALUES(confirmations), last_update_at=CURRENT_TIMESTAMP`;
  const params = [
    row.user_id,
    row.to_address.toLowerCase(),
    row.from_address.toLowerCase(),
    row.token_symbol,
    row.token_address ? row.token_address.toLowerCase() : null,
    row.amount_wei.toString(),
    row.tx_hash.toLowerCase(),
    row.block_number,
    row.status,
    row.confirmations,
    row.source,
  ];
  try {
    await pool.query(sql, params);
  } catch (e) {
    console.error('[POST][ERR][DB]', e?.message || e);
    throw e;
  }
  if (prev) return { kind: 'updated', prev };
  return { kind: 'new', prev: null };
}

async function recordDepositsAfterSweep(
  { userId, address, token, sweepTxHash, sweepBlockNumber, sweptAmountWei },
  provider,
  pool,
) {
  const addr = address.toLowerCase();
  const start = Date.now();
  let inboundCount = 0;
  let fallbackCount = 0;

  console.log(
    `[POST][BEGIN] user=${userId ?? 'null'} addr=${addr} token=${token.symbol} sweepTx=${sweepTxHash} amount=${sweptAmountWei}`
  );

  if (!userId) {
    console.log(`[POST][MAP][ERR] addr=${addr} reason=no_user_found`);
    console.log('[POST][SKIP] reason=no_user');
    console.log(`[POST][DONE] user=${userId ?? 'null'} inbound=0 fallback=0 took=${Date.now() - start}ms`);
    return;
  }

  console.log(`[POST][MAP] addr=${addr} userId=${userId}`);

  const amountBig = BigInt(sweptAmountWei || 0);
  if (amountBig <= 0n) {
    console.log('[POST][SKIP] reason=zero_amount');
    console.log(`[POST][DONE] user=${userId} inbound=0 fallback=0 took=${Date.now() - start}ms`);
    return;
  }

  try {
    const latest = await provider.getBlockNumber();

    let maxPrev = 0;
    try {
      const [rows] = await pool.query('SELECT MAX(block_number) AS max FROM wallet_deposits WHERE to_address=?', [addr]);
      maxPrev = Number(rows[0]?.max || 0);
    } catch (e) {
      console.error('[POST][ERR][DB]', e?.message || e);
      console.log(`[POST][DONE] user=${userId} inbound=0 fallback=0 took=${Date.now() - start}ms`);
      return;
    }

    const fromBlock = Math.max(latest - RECENT_BLOCKS + 1, maxPrev - SAFETY_BUFFER, 0);
    const toBlock = latest;

    if (token.address) {
      const paddedTo = '0x' + addr.replace(/^0x/, '').padStart(64, '0');
      let logs = [];
      try {
        logs = await provider.getLogs({ address: token.address, topics: [TRANSFER_TOPIC, null, paddedTo], fromBlock, toBlock });
      } catch (e) {
        console.error('[POST][ERR][LOGS]', e?.message || e);
      }
      for (const log of logs) {
        try {
          const { args } = iface.parseLog(log);
          const from = ethers.getAddress(args.from);
          const to = ethers.getAddress(args.to);
          const amount = BigInt(args.value.toString());
          const confirmations = latest - Number(log.blockNumber) + 1;
          const status = confirmations >= CONFIRMATIONS ? 'confirmed' : 'pending';
          const res = await upsertDeposit(pool, {
            user_id: userId,
            to_address: to,
            from_address: from,
            token_symbol: token.symbol,
            token_address: token.address,
            amount_wei: amount,
            tx_hash: log.transactionHash,
            block_number: Number(log.blockNumber),
            status,
            confirmations,
            source: 'sweeper',
          });
          if (res.kind === 'new') {
            console.log(
              `[POST][NEW] user=${userId} addr=${addr} token=${token.symbol} tx=${log.transactionHash} amount=${amount} status=${status}`
            );
          } else {
            console.log(
              `[POST][UPD] user=${userId} token=${token.symbol} tx=${log.transactionHash} conf:${res.prev.confirmations}->${confirmations} status:${res.prev.status}->${status}`
            );
          }
          inboundCount++;
        } catch (e) {
          console.error('[POST][ERR][PARSE]', e?.message || e);
        }
      }
    } else {
      for (let b = fromBlock; b <= toBlock; b += BATCH_BLOCKS) {
        const end = Math.min(b + BATCH_BLOCKS - 1, toBlock);
        for (let bn = b; bn <= end; bn++) {
          let block;
          try {
            block = await provider.getBlock(bn, true);
          } catch (e) {
            console.error('[POST][ERR][BLOCK]', e?.message || e);
            continue;
          }
          if (!block || !block.transactions) continue;
          for (const tx of block.transactions) {
            if (!tx.to || tx.to.toLowerCase() !== addr) continue;
            const amount = BigInt(tx.value.toString());
            const confirmations = latest - bn + 1;
            const status = confirmations >= CONFIRMATIONS ? 'confirmed' : 'pending';
            const res = await upsertDeposit(pool, {
              user_id: userId,
              to_address: ethers.getAddress(tx.to),
              from_address: ethers.getAddress(tx.from),
              token_symbol: token.symbol,
              token_address: null,
              amount_wei: amount,
              tx_hash: tx.hash,
              block_number: bn,
              status,
              confirmations,
              source: 'sweeper',
            });
            if (res.kind === 'new') {
              console.log(
                `[POST][NEW] user=${userId} addr=${addr} token=${token.symbol} tx=${tx.hash} amount=${amount} status=${status}`
              );
            } else {
              console.log(
                `[POST][UPD] user=${userId} token=${token.symbol} tx=${tx.hash} conf:${res.prev.confirmations}->${confirmations} status:${res.prev.status}->${status}`
              );
            }
            inboundCount++;
          }
        }
      }
    }

    if (inboundCount > 0) {
      console.log(`[POST][INBOUND][OK] count=${inboundCount}`);
    } else {
      const confirmations = latest - sweepBlockNumber + 1;
      const status = confirmations >= CONFIRMATIONS ? 'confirmed' : 'pending';
      const res = await upsertDeposit(pool, {
        user_id: userId,
        to_address: addr,
        from_address: addr,
        token_symbol: token.symbol,
        token_address: token.address || null,
        amount_wei: amountBig,
        tx_hash: sweepTxHash,
        block_number: sweepBlockNumber,
        status,
        confirmations,
        source: 'sweeper',
      });
      if (res.kind === 'new') {
        console.log(
          `[POST][FALLBACK][NEW] user=${userId} token=${token.symbol} tx=${sweepTxHash} amount=${amountBig}`
        );
      } else {
        console.log(
          `[POST][FALLBACK][UPD] user=${userId} token=${token.symbol} tx=${sweepTxHash} conf:${res.prev.confirmations}->${confirmations} status:${res.prev.status}->${status}`
        );
      }
      fallbackCount = 1;
    }
  } catch (e) {
    console.error('[POST][ERR]', e?.message || e);
  } finally {
    console.log(
      `[POST][DONE] user=${userId} inbound=${inboundCount} fallback=${fallbackCount} took=${Date.now() - start}ms`
    );
  }
}

module.exports = { recordDepositsAfterSweep };

