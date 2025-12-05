const TOTAL_ORDERS = 1000;
const CHANGED_ORDERS = 25;

function buildOrder(id) {
  const side = id % 2 === 0 ? 'buy' : 'sell';
  return {
    id,
    side,
    price_wei: (10n ** 18n + BigInt(id) * 10n ** 14n).toString(),
    remaining_base_wei: (5000n * 10n ** 18n).toString(),
    remaining_quote_wei: (2500n * 10n ** 18n).toString(),
    status: 'open',
  };
}

const bids = [];
const asks = [];
for (let i = 1; i <= TOTAL_ORDERS; i++) {
  const order = buildOrder(i);
  if (order.side === 'buy') bids.push(order);
  else asks.push(order);
}

const snapshotPayloadBytes = Buffer.byteLength(JSON.stringify({
  event: 'snapshot',
  orderbook: { bids, asks },
}));

const orderbookDeltas = [];
for (let i = 1; i <= CHANGED_ORDERS; i++) {
  const id = i * 10;
  orderbookDeltas.push({
    ...buildOrder(id),
    action: i % 5 === 0 ? 'cancel' : 'update',
    remaining_base_wei: (4000n * 10n ** 18n).toString(),
  });
}

const deltaPayloadBytes = Buffer.byteLength(
  JSON.stringify({ event: 'orderbook_delta', deltas: orderbookDeltas })
);

const saving = snapshotPayloadBytes - deltaPayloadBytes;
const savingPct = (saving / snapshotPayloadBytes) * 100;

console.log(
  JSON.stringify(
    {
      orders: TOTAL_ORDERS,
      changed: CHANGED_ORDERS,
      snapshotBytes: snapshotPayloadBytes,
      deltaBytes: deltaPayloadBytes,
      savingBytes: saving,
      savingPct: Number.isFinite(savingPct) ? savingPct.toFixed(2) : '0.00',
    },
    null,
    2
  )
);
