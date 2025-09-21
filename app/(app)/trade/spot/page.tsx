'use client';
export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../lib/auth';
import { apiFetch } from '../../../lib/api';
import { dict, useLang } from '../../../lib/i18n';
import { useToast } from '../../../lib/toast';

type SpotMarket = {
  id: number;
  symbol: string;
  base_asset: string;
  base_decimals: number;
  quote_asset: string;
  quote_decimals: number;
  min_base_amount: string;
  min_quote_amount: string;
  last_price: string | null;
};

type OrderbookLevel = {
  price: string;
  price_wei: string;
  base_amount: string;
  base_amount_wei: string;
  quote_amount: string;
  quote_amount_wei: string;
};

type OrderbookResponse = {
  market: { symbol: string; base_asset: string; quote_asset: string };
  orderbook: { bids: OrderbookLevel[]; asks: OrderbookLevel[] };
  trades: Array<{
    id: number;
    price: string;
    price_wei: string;
    base_amount: string;
    base_amount_wei: string;
    quote_amount: string;
    quote_amount_wei: string;
    taker_side: string;
    created_at: string;
  }>;
};

type SpotOrder = {
  id: number;
  market: string;
  side: 'buy' | 'sell';
  type: 'limit' | 'market';
  status: 'open' | 'filled' | 'cancelled';
  price: string | null;
  price_wei: string;
  base_amount: string;
  base_amount_wei: string;
  remaining_base_amount: string;
  remaining_base_wei: string;
  quote_amount: string;
  quote_amount_wei: string;
  remaining_quote_amount: string;
  remaining_quote_wei: string;
  fee_bps: number;
  created_at: string;
  updated_at: string;
};

type PlaceOrderResponse = {
  order: {
    id: number;
    status: string;
    remaining_base_wei: string;
    remaining_quote_wei: string;
    filled_base_wei: string;
    filled_base: string;
    average_price: string | null;
  };
  trades: Array<{
    trade_id: number;
    maker_order_id: number;
    price: string;
    price_wei: string;
    base_amount: string;
    base_amount_wei: string;
    quote_amount: string;
    quote_amount_wei: string;
    taker_fee_wei: string;
    maker_fee_wei: string;
  }>;
};

export default function SpotTradePage() {
  const { user } = useAuth();
  const router = useRouter();
  const { lang } = useLang();
  const t = dict[lang];
  const toast = useToast();

  const [markets, setMarkets] = useState<SpotMarket[]>([]);
  const [selectedMarket, setSelectedMarket] = useState<string>('');
  const [orderbook, setOrderbook] = useState<{ bids: OrderbookLevel[]; asks: OrderbookLevel[] }>({ bids: [], asks: [] });
  const [trades, setTrades] = useState<OrderbookResponse['trades']>([]);
  const [orders, setOrders] = useState<SpotOrder[]>([]);
  const [loadingMarkets, setLoadingMarkets] = useState(true);
  const [loadingBook, setLoadingBook] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [formSide, setFormSide] = useState<'buy' | 'sell'>('buy');
  const [formType, setFormType] = useState<'limit' | 'market'>('limit');
  const [amount, setAmount] = useState('');
  const [price, setPrice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (user === null) router.replace('/login');
  }, [user, router]);

  const loadMarkets = useCallback(async () => {
    setLoadingMarkets(true);
    const res = await apiFetch<{ markets: SpotMarket[] }>('/spot/markets');
    if (!res.ok) {
      setError(res.error || t.common.genericError);
      setLoadingMarkets(false);
      return;
    }
    setMarkets(res.data.markets);
    setLoadingMarkets(false);
  }, [t.common.genericError]);

  useEffect(() => {
    loadMarkets();
  }, [loadMarkets]);

  useEffect(() => {
    if (!markets.length) return;
    setSelectedMarket((prev) => {
      if (prev && markets.some((m) => m.symbol === prev)) return prev;
      return markets[0].symbol;
    });
  }, [markets]);

  const loadOrderbook = useCallback(async (marketSymbol: string) => {
    if (!marketSymbol) return;
    setLoadingBook(true);
    const params = new URLSearchParams({ market: marketSymbol });
    const res = await apiFetch<OrderbookResponse>(`/spot/orderbook?${params.toString()}`);
    setLoadingBook(false);
    if (!res.ok) {
      setError(res.error || t.common.genericError);
      return;
    }
    setOrderbook(res.data.orderbook);
    setTrades(res.data.trades);
  }, [t.common.genericError]);

  const loadOrders = useCallback(async (marketSymbol: string) => {
    if (!marketSymbol) return;
    const params = new URLSearchParams({ market: marketSymbol });
    const res = await apiFetch<{ orders: SpotOrder[]; trades: any[] }>(`/spot/orders?${params.toString()}`);
    if (!res.ok) {
      setError(res.error || t.common.genericError);
      return;
    }
    setOrders(res.data.orders);
  }, [t.common.genericError]);

  useEffect(() => {
    if (!selectedMarket) return;
    loadOrderbook(selectedMarket);
    loadOrders(selectedMarket);
    const interval = window.setInterval(() => {
      loadOrderbook(selectedMarket);
      loadOrders(selectedMarket);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [selectedMarket, loadOrderbook, loadOrders]);

  const selectedMarketMeta = useMemo(() => markets.find((m) => m.symbol === selectedMarket) || null, [markets, selectedMarket]);

  const handlePlaceOrder = async () => {
    if (!selectedMarket) {
      setError(t.spotTrade.errors.marketRequired);
      return;
    }
    if (!amount.trim()) {
      setError(t.spotTrade.errors.amountRequired);
      return;
    }
    if (formType === 'limit' && !price.trim()) {
      setError(t.spotTrade.errors.priceRequired);
      return;
    }
    setError('');
    setPlacing(true);
    const payload: Record<string, string> = {
      market: selectedMarket,
      side: formSide,
      type: formType,
      amount: amount.trim(),
    };
    if (formType === 'limit') payload.price = price.trim();
    const res = await apiFetch<PlaceOrderResponse>('/spot/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setPlacing(false);
    if (!res.ok) {
      setError(res.error || t.spotTrade.errors.failed);
      return;
    }
    toast(t.spotTrade.notifications.placed);
    setAmount('');
    if (formType === 'limit') setPrice('');
    loadOrderbook(selectedMarket);
    loadOrders(selectedMarket);
  };

  const handleCancel = async (id: number) => {
    const res = await apiFetch<{ ok: boolean }>(`/spot/orders/${id}/cancel`, { method: 'POST' });
    if (!res.ok) {
      setError(res.error || t.common.genericError);
      return;
    }
    toast(t.spotTrade.notifications.cancelled);
    loadOrderbook(selectedMarket);
    loadOrders(selectedMarket);
  };

  if (user === null) return null;
  if (error) return <div className="p-4 text-sm text-red-400">{error}</div>;

  return (
    <div className="p-4 space-y-6 overflow-x-hidden">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{t.spotTrade.title}</h1>
        <p className="text-sm opacity-80">{t.spotTrade.subtitle}</p>
      </div>
      {loadingMarkets ? (
        <div className="text-sm opacity-80">{t.trade.loading}</div>
      ) : markets.length === 0 ? (
        <div className="text-sm opacity-80">{t.trade.noAssets}</div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
          <div className="space-y-4">
            <div>
              <label className="block text-sm mb-1">{t.spotTrade.market}</label>
              <select
                value={selectedMarket}
                onChange={(e) => {
                  setSelectedMarket(e.target.value);
                  setAmount('');
                  setPrice('');
                  setError('');
                }}
                className="w-full p-2 rounded bg-black/20 border border-white/20"
              >
                {markets.map((m) => (
                  <option key={m.symbol} value={m.symbol}>
                    {m.symbol}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 text-sm">
              <button
                className={`flex-1 py-2 rounded ${formSide === 'buy' ? 'bg-green-600 text-white' : 'bg-white/10'}`}
                onClick={() => setFormSide('buy')}
              >
                {t.spotTrade.buy}
              </button>
              <button
                className={`flex-1 py-2 rounded ${formSide === 'sell' ? 'bg-red-600 text-white' : 'bg-white/10'}`}
                onClick={() => setFormSide('sell')}
              >
                {t.spotTrade.sell}
              </button>
            </div>
            <div className="flex gap-2 text-sm">
              <button
                className={`flex-1 py-2 rounded ${formType === 'limit' ? 'bg-white text-black' : 'bg-white/10 text-white'}`}
                onClick={() => setFormType('limit')}
              >
                {t.spotTrade.limit}
              </button>
              <button
                className={`flex-1 py-2 rounded ${formType === 'market' ? 'bg-white text-black' : 'bg-white/10 text-white'}`}
                onClick={() => setFormType('market')}
              >
                {t.spotTrade.marketOrder}
              </button>
            </div>
            <div>
              <label className="block text-sm mb-1">{t.spotTrade.amount}</label>
              <input
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full p-2 rounded bg-black/20 border border-white/20"
              />
            </div>
            {formType === 'limit' && (
              <div>
                <label className="block text-sm mb-1">{t.spotTrade.price}</label>
                <input
                  type="number"
                  min="0"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full p-2 rounded bg-black/20 border border-white/20"
                />
              </div>
            )}
            <button
              onClick={handlePlaceOrder}
              disabled={placing || !selectedMarket}
              className="w-full py-2 bg-gray-100 text-black rounded disabled:opacity-50"
            >
              {placing ? t.spotTrade.placing : t.spotTrade.placeOrder}
            </button>
            {selectedMarketMeta && (
              <div className="text-xs opacity-70 space-y-1">
                {selectedMarketMeta.min_base_amount && (
                  <div>
                    {t.trade.min}: {selectedMarketMeta.min_base_amount} {selectedMarketMeta.base_asset}
                  </div>
                )}
                {selectedMarketMeta.last_price && (
                  <div>
                    {t.spotTrade.lastPrice}: {selectedMarketMeta.last_price} {selectedMarketMeta.quote_asset}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="space-y-6">
            <div>
              <h2 className="text-sm font-semibold opacity-80 mb-2">{t.spotTrade.orderbook.title}</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold text-green-400 mb-1">{t.spotTrade.orderbook.bids}</div>
                  <div className="bg-white/5 rounded p-3 space-y-1 max-h-64 overflow-y-auto text-xs">
                    {loadingBook ? (
                      <div className="opacity-70">{t.trade.loading}</div>
                    ) : orderbook.bids.length === 0 ? (
                      <div className="opacity-70">—</div>
                    ) : (
                      orderbook.bids.map((level, idx) => (
                        <div key={`bid-${idx}`} className="flex justify-between">
                          <span className="text-green-300">{level.price}</span>
                          <span>{level.base_amount}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-red-400 mb-1">{t.spotTrade.orderbook.asks}</div>
                  <div className="bg-white/5 rounded p-3 space-y-1 max-h-64 overflow-y-auto text-xs">
                    {loadingBook ? (
                      <div className="opacity-70">{t.trade.loading}</div>
                    ) : orderbook.asks.length === 0 ? (
                      <div className="opacity-70">—</div>
                    ) : (
                      orderbook.asks.map((level, idx) => (
                        <div key={`ask-${idx}`} className="flex justify-between">
                          <span className="text-red-300">{level.price}</span>
                          <span>{level.base_amount}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div>
              <h2 className="text-sm font-semibold opacity-80 mb-2">{t.spotTrade.trades.title}</h2>
              <div className="bg-white/5 rounded p-3 max-h-48 overflow-y-auto text-xs space-y-1">
                {trades.length === 0 ? (
                  <div className="opacity-70">—</div>
                ) : (
                  trades.map((trade) => (
                    <div key={trade.id} className="flex justify-between">
                      <span className={trade.taker_side === 'buy' ? 'text-green-300' : 'text-red-300'}>{trade.price}</span>
                      <span>{trade.base_amount}</span>
                      <span className="opacity-70">{new Date(trade.created_at).toLocaleTimeString()}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div>
              <h2 className="text-sm font-semibold opacity-80 mb-2">{t.spotTrade.orders.title}</h2>
              {orders.length === 0 ? (
                <div className="text-xs opacity-70">{t.spotTrade.orders.empty}</div>
              ) : (
                <div className="space-y-2 text-xs">
                  {orders.map((order) => (
                    <div key={order.id} className="p-3 rounded bg-white/5 flex flex-col gap-1">
                      <div className="flex justify-between">
                        <span className="font-semibold">{order.market}</span>
                        <span className="uppercase">{order.side}</span>
                      </div>
                      <div className="flex justify-between opacity-80">
                        <span>{order.type}</span>
                        <span>{t.spotTrade.orders.status[order.status]}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>{t.trade.amount}</span>
                        <span>
                          {order.remaining_base_amount}/{order.base_amount}
                        </span>
                      </div>
                      {order.price && (
                        <div className="flex justify-between">
                          <span>{t.spotTrade.price}</span>
                          <span>{order.price}</span>
                        </div>
                      )}
                      {order.status === 'open' && (
                        <button
                          className="mt-2 py-1 px-2 rounded bg-red-500/80 text-white"
                          onClick={() => handleCancel(order.id)}
                        >
                          {t.spotTrade.cancel}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
