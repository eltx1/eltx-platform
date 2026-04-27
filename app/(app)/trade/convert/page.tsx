'use client';

import { ArrowDownUp, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../../lib/api';
import { useLang } from '../../../lib/i18n';
import { useToast } from '../../../lib/toast';

type Category = 'gold' | 'stocks' | 'crypto';

type ConvertPair = {
  id: number;
  category: Category;
  symbol: string;
  base_asset: string;
  quote_asset: string;
  token_symbol: string;
  display_name: string;
  logo_url: string | null;
};

type ConvertConfigResponse = {
  category: Category | null;
  pairs: ConvertPair[];
  settings: { convert_fee_bps: number; convert_min_usdt: number };
};

type SpotBook = {
  orderbook: {
    bids: Array<{ price: string; base_amount: string }>;
    asks: Array<{ price: string; base_amount: string }>;
  };
};

function toCategory(value: string | null): Category {
  if (value === 'gold' || value === 'stocks' || value === 'crypto') return value;
  return 'crypto';
}

function parsePositive(value: string): number {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

function estimateQuote(levels: Array<{ price: string; base_amount: string }>, desiredBase: number): number {
  if (!desiredBase) return 0;
  let remaining = desiredBase;
  let total = 0;
  for (const level of levels) {
    const price = parsePositive(level.price);
    const liquidity = parsePositive(level.base_amount);
    if (!price || !liquidity) continue;
    const take = Math.min(remaining, liquidity);
    total += take * price;
    remaining -= take;
    if (remaining <= 0) break;
  }
  return total;
}

function ConvertPageContent() {
  const searchParams = useSearchParams();
  const toast = useToast();
  const { lang } = useLang();
  const isArabic = lang === 'ar';
  const category = toCategory(searchParams.get('category'));

  const [pairs, setPairs] = useState<ConvertPair[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [estimate, setEstimate] = useState(0);
  const [minUsdt, setMinUsdt] = useState(10);
  const [feeBps, setFeeBps] = useState(50);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);

  const selectedPair = useMemo(() => pairs.find((item) => item.symbol === selectedSymbol) || null, [pairs, selectedSymbol]);
  const amountNum = parsePositive(amount);

  const loadPairs = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch<ConvertConfigResponse>(`/convert/pairs?category=${category}`);
    setLoading(false);
    if (!res.ok) {
      toast({ message: res.error || (isArabic ? 'فشل تحميل ازواج الكونفرت' : 'Failed to load convert pairs'), variant: 'error' });
      return;
    }
    setPairs(res.data.pairs || []);
    setMinUsdt(res.data.settings?.convert_min_usdt || 10);
    setFeeBps(res.data.settings?.convert_fee_bps || 0);
    if ((res.data.pairs || []).length) {
      setSelectedSymbol((prev) => (prev && res.data.pairs.some((item) => item.symbol === prev) ? prev : res.data.pairs[0].symbol));
    }
  }, [category, isArabic, toast]);

  useEffect(() => {
    loadPairs();
  }, [loadPairs]);

  useEffect(() => {
    async function run() {
      if (!selectedPair || !amountNum) {
        setEstimate(0);
        return;
      }
      const res = await apiFetch<SpotBook>(`/spot/orderbook?market=${encodeURIComponent(selectedPair.symbol)}`);
      if (!res.ok) {
        setEstimate(0);
        return;
      }
      const levels = side === 'buy' ? res.data.orderbook.asks : res.data.orderbook.bids;
      const quote = estimateQuote(levels, amountNum);
      setEstimate(quote);
    }
    run();
  }, [amountNum, selectedPair, side]);

  const executeSwap = useCallback(async () => {
    if (!selectedPair) return;
    if (!amountNum) {
      toast({ message: isArabic ? 'اكتب الكمية الاول' : 'Enter an amount first', variant: 'error' });
      return;
    }
    if (estimate < minUsdt) {
      toast({
        message: isArabic
          ? `اقل قيمة تنفيذ حاليا ${minUsdt.toFixed(2)} USDT`
          : `Minimum convert value is ${minUsdt.toFixed(2)} USDT`,
        variant: 'error',
      });
      return;
    }

    setPlacing(true);
    const res = await apiFetch('/spot/orders', {
      method: 'POST',
      body: JSON.stringify({
        market: selectedPair.symbol,
        side,
        type: 'market',
        amount: amountNum.toString(),
      }),
    });
    setPlacing(false);
    if (!res.ok) {
      toast({ message: res.error || (isArabic ? 'فشل التنفيذ' : 'Execution failed'), variant: 'error' });
      return;
    }
    toast({ message: isArabic ? 'تم تنفيذ العملية بنجاح' : 'Swap executed successfully', variant: 'success' });
    setAmount('');
    setEstimate(0);
  }, [amountNum, estimate, isArabic, minUsdt, selectedPair, side, toast]);

  return (
    <section className="mx-auto w-full max-w-3xl space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">{isArabic ? 'Convert Swap' : 'Convert Swap'}</h1>
        <Link href="/trade" className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/70 hover:text-white">
          {isArabic ? 'رجوع' : 'Back'}
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(['gold', 'stocks', 'crypto'] as Category[]).map((item) => (
          <Link
            key={item}
            href={`/trade/convert?category=${item}`}
            className={`rounded-xl border px-3 py-2 text-center text-sm ${
              category === item ? 'border-cyan-300 bg-cyan-500/15 text-cyan-100' : 'border-white/10 text-white/70'
            }`}
          >
            {item.toUpperCase()}
          </Link>
        ))}
      </div>

      <div className="rounded-3xl border border-white/10 bg-[#111629] p-4 text-white md:p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm text-white/75">{isArabic ? 'اختار الزوج' : 'Choose pair'}</div>
          <button onClick={loadPairs} className="rounded-lg border border-white/10 p-1.5 text-white/70 hover:text-white" type="button">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        <select
          value={selectedSymbol}
          onChange={(e) => setSelectedSymbol(e.target.value)}
          className="w-full rounded-2xl border border-white/10 bg-black/30 p-3"
        >
          {pairs.map((pair) => (
            <option key={pair.id} value={pair.symbol}>
              {pair.symbol} - {pair.display_name}
            </option>
          ))}
        </select>

        {selectedPair && (
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-2.5">
            <div className="relative h-8 w-8 overflow-hidden rounded-full bg-white/10">
              {selectedPair.logo_url ? <img src={selectedPair.logo_url} alt={selectedPair.token_symbol} className="h-full w-full object-cover" /> : null}
            </div>
            <div>
              <div className="text-sm font-semibold">{selectedPair.symbol}</div>
              <div className="text-xs text-white/65">{selectedPair.display_name}</div>
            </div>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setSide('buy')}
            className={`flex-1 rounded-xl px-4 py-2 text-sm ${side === 'buy' ? 'bg-emerald-500/20 text-emerald-200' : 'bg-white/5 text-white/70'}`}
          >
            {isArabic ? 'شراء' : 'Buy'}
          </button>
          <button
            type="button"
            onClick={() => setSide('sell')}
            className={`flex-1 rounded-xl px-4 py-2 text-sm ${side === 'sell' ? 'bg-red-500/20 text-red-200' : 'bg-white/5 text-white/70'}`}
          >
            {isArabic ? 'بيع' : 'Sell'}
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="text-xs text-white/60">
            {side === 'buy'
              ? isArabic
                ? `كمية ${selectedPair?.base_asset || ''} اللي عايز تشتريها`
                : `Amount of ${selectedPair?.base_asset || ''} to buy`
              : isArabic
              ? `كمية ${selectedPair?.base_asset || ''} اللي عايز تبيعها`
              : `Amount of ${selectedPair?.base_asset || ''} to sell`}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-transparent text-lg outline-none"
              placeholder="0.0"
            />
            <ArrowDownUp className="h-4 w-4 text-white/40" />
          </div>
          <div className="mt-2 text-xs text-white/60">
            {isArabic ? 'تقدير قيمة الصفقة' : 'Estimated quote value'}: <span className="font-semibold">{estimate.toFixed(4)} USDT</span>
          </div>
          <div className="mt-1 text-xs text-white/60">
            {isArabic ? 'رسوم الكونفرت' : 'Convert fee'}: {(feeBps / 100).toFixed(2)}% · {isArabic ? 'حد ادني' : 'Min'} {minUsdt} USDT
          </div>
        </div>

        <button
          type="button"
          onClick={executeSwap}
          disabled={placing || loading || !selectedPair}
          className="mt-4 w-full rounded-2xl bg-cyan-500 py-3 text-center font-semibold text-black transition hover:bg-cyan-400 disabled:opacity-60"
        >
          {placing ? (isArabic ? 'جاري التنفيذ...' : 'Executing...') : isArabic ? 'تنفيذ التحويل' : 'Execute Convert'}
        </button>
      </div>
    </section>
  );
}

export default function ConvertPage() {
  return (
    <Suspense fallback={<section className="mx-auto w-full max-w-3xl p-6 text-white/70">Loading convert...</section>}>
      <ConvertPageContent />
    </Suspense>
  );
}
