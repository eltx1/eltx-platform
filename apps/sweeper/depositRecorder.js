const crypto = require('crypto');

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
    return { error: e };
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
    return { error: e };
  }
  if (prev) return { kind: 'updated', prev };
  return { kind: 'new', prev: null };
}

async function recordDepositAfterSweepSuccess(ctx, pool) {
  const start = Date.now();
  const {
    userId,
    depositAddress,
    tokenSymbol,
    tokenAddressOrNull,
    eligibleBalanceWei,
    sweptAmountWei,
    sweepTxHash,
    sweepBlockNumber,
    confirmations,
  } = ctx;
  const addr = (depositAddress || '').toLowerCase();
  const amount = BigInt(sweptAmountWei ?? eligibleBalanceWei ?? 0);
  console.log(
    `[POST-OK][BEGIN] user=${userId ?? 'null'} addr=${addr} token=${tokenSymbol} tx=${sweepTxHash} amount=${amount}`,
  );
  if (!userId || amount <= 0n) {
    console.log(`[POST][DONE] mode=ok took=${Date.now() - start}ms`);
    return;
  }
  try {
    const conf = confirmations ?? 1;
    const res = await upsertDeposit(pool, {
      user_id: userId,
      to_address: addr,
      from_address: addr,
      token_symbol: tokenSymbol,
      token_address: tokenAddressOrNull ? tokenAddressOrNull.toLowerCase() : null,
      amount_wei: amount,
      tx_hash: sweepTxHash,
      block_number: sweepBlockNumber || 0,
      status: 'confirmed',
      confirmations: conf,
      source: 'sweeper',
    });
    if (res.error) {
      console.error(`[POST][ERR] mode=ok reason=${res.error?.message || res.error}`);
    } else if (res.kind === 'new') {
      console.log(
        `[POST][NEW] user=${userId} token=${tokenSymbol} to=${addr} amount=${amount} src=sweeper`,
      );
    } else {
      console.log(
        `[POST][UPD] user=${userId} token=${tokenSymbol} to=${addr} tx=${sweepTxHash} conf:${res.prev.confirmations}->${conf} status:${res.prev.status}->confirmed src=sweeper`,
      );
    }
  } catch (e) {
    console.error(`[POST][ERR] mode=ok reason=${e?.message || e}`);
  } finally {
    console.log(`[POST][DONE] mode=ok took=${Date.now() - start}ms`);
  }
}

async function recordDepositOnSweepFail(ctx, pool) {
  const start = Date.now();
  const {
    userId,
    depositAddress,
    tokenSymbol,
    tokenAddressOrNull,
    eligibleBalanceWei,
    failReason,
  } = ctx;
  const addr = (depositAddress || '').toLowerCase();
  const amount = BigInt(eligibleBalanceWei || 0);
  console.log(
    `[POST-FAIL][BEGIN] user=${userId ?? 'null'} addr=${addr} token=${tokenSymbol} amount=${amount} reason=${failReason}`,
  );
  if (!userId || amount <= 0n) {
    console.log(`[POST][DONE] mode=fail took=${Date.now() - start}ms`);
    return;
  }
  try {
    const hashInput = `${userId}|${addr}|${tokenAddressOrNull || tokenSymbol}`;
    const failHash = 'sweeper_fail:' + crypto.createHash('sha256').update(hashInput).digest('hex').slice(0, 32);
    const res = await upsertDeposit(pool, {
      user_id: userId,
      to_address: addr,
      from_address: addr,
      token_symbol: tokenSymbol,
      token_address: tokenAddressOrNull ? tokenAddressOrNull.toLowerCase() : null,
      amount_wei: amount,
      tx_hash: failHash,
      block_number: null,
      status: 'pending',
      confirmations: 0,
      source: 'sweeper_fail',
    });
    if (res.error) {
      console.error(`[POST][ERR] mode=fail reason=${res.error?.message || res.error}`);
    } else if (res.kind === 'new') {
      console.log(
        `[POST][NEW] user=${userId} token=${tokenSymbol} to=${addr} amount=${amount} src=sweeper_fail`,
      );
    } else {
      console.log(
        `[POST][UPD] user=${userId} token=${tokenSymbol} to=${addr} tx=${failHash} src=sweeper_fail`,
      );
    }
  } catch (e) {
    console.error(`[POST][ERR] mode=fail reason=${e?.message || e}`);
  } finally {
    console.log(`[POST][DONE] mode=fail took=${Date.now() - start}ms`);
  }
}

module.exports = {
  recordDepositAfterSweepSuccess,
  recordDepositOnSweepFail,
};

