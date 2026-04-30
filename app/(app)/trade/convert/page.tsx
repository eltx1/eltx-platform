'use client';

import { ArrowDownUp, BadgeDollarSign, ChevronLeft, RefreshCw, Wallet } from 'lucide-react';
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
  live_enabled?: boolean;
  live_status?: string | null;
  execution_availability?: 'live' | 'reference_only';
  last_live_error?: string | null;
};

type ConvertConfigResponse = {
  category: Category | null;
  pairs: ConvertPair[];
  settings: { convert_fee_bps: number; convert_min_usdt: number; convert_execution_mode?: 'mock' | 'live' };
};

type ConvertHealthResponse = {
  requestedMode: 'mock' | 'live';
  effectiveMode: 'mock' | 'live';
  liveReady: boolean;
  provider: string;
  lastError?: string | null;
};

type ConvertQuoteResponse = {
  mode: 'mock' | 'live' | 'reference' | 'unavailable';
  executionMode: 'live' | 'unavailable';
  valid: boolean;
  blockingReason?: string | null;
  runtime_warning?: string | null;
  quote: {
    estimatedQuote: string;
    feeAmount: string;
    totalQuote: string;
  };
};

function toCategory(value: string | null): Category {
  if (value === 'gold' || value === 'stocks' || value === 'crypto') return value;
  return 'crypto';
}

function normalizeNumericInput(value: string): string {
  return value
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 1632))
    .replace(/,/g, '.')
    .replace(/[^\d.]/g, '')
    .replace(/(\..*)\./g, '$1');
}

function parsePositive(value: string): number {
  const num = Number(normalizeNumericInput(value));
  return Number.isFinite(num) && num > 0 ? num : 0;
}

function cleanDisplayName(value: string): string {
  return value.replace(/\bondo\b/gi, '').replace(/\s{2,}/g, ' ').trim();
}

function assetIconFallback(symbol: string): string {
  const upper = symbol.toUpperCase();
  const map: Record<string, string> = {
    BNB: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/assets/0x0000000000000000000000000000000000000000/logo.png',
    WBTC: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/assets/0x7130d2A12B9BCBfAe4f2634d864A1Ee1Ce3Ead9c/logo.png',
    XRP: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/xrp/info/logo.png',
    SOL: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png',
    LINK: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/assets/0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD/logo.png',
    XAUT: 'https://assets.coingecko.com/coins/images/10481/standard/Tether_Gold.png',
    NVDA: 'https://logo.clearbit.com/nvidia.com',
    TSLA: 'https://logo.clearbit.com/tesla.com',
    AAPL: 'https://logo.clearbit.com/apple.com',
    MSFT: 'https://logo.clearbit.com/microsoft.com',
    AMZN: 'https://logo.clearbit.com/amazon.com',
    GOOGL: 'https://logo.clearbit.com/google.com',
  };
  return map[upper] || '';
}

function categoryStyle(item: Category, active: boolean): string {
  const base = 'rounded-xl border px-3 py-2 text-center text-sm font-medium transition';
  if (!active) return `${base} border-white/10 bg-[#111a30] text-white/70 hover:border-cyan-400/40 hover:text-white`;
  if (item === 'gold') return `${base} border-amber-400/50 bg-amber-500/10 text-amber-200`;
  if (item === 'stocks') return `${base} border-blue-400/50 bg-blue-500/10 text-blue-200`;
  return `${base} border-cyan-400/60 bg-cyan-500/10 text-cyan-200`;
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0.0000';
  if (value < 0.0001) return '<0.0001';
  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (value >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return value.toLocaleString(undefined, { maximumFractionDigits: 8 });
}

function normalizeConvertWarning(raw: string, isArabic: boolean): string {
  const message = String(raw || '').trim();
  if (!message) return '';
  const lower = message.toLowerCase();
  if (lower.includes('price deviation')) {
    return isArabic ? 'فرق السعر عالي حاليا. حاول تاني بعد ثواني أو قلل الكمية.' : 'Price deviation is currently high. Please retry in a few seconds or reduce the amount.';
  }
  if (lower.includes('below minimum') || lower.includes('amount_below_minimum')) {
    return isArabic ? 'الكمية أقل من الحد الأدنى.' : 'Amount is below minimum.';
  }
  if (lower.includes('live quote unavailable')) {
    return isArabic ? 'التسعير المباشر غير متاح الآن.' : 'Live quote unavailable.';
  }
  if (lower.includes('reference-only') || lower.includes('pair_reference_only') || lower.includes('quote_provider_reference_only')) {
    return isArabic ? 'الزوج متاح للتسعير المرجعي فقط حاليا وليس تنفيذ Live.' : 'This pair is currently reference-only and not executable in live mode.';
  }
  if (lower.includes('execution reverted') || lower.includes('call_exception') || lower.includes('require(false)')) {
    return isArabic ? 'المسار غير متاح حاليا في السيولة. جرّب كمية أقل أو حاول لاحقًا.' : 'Liquidity route is temporarily unavailable. Try a smaller amount or retry later.';
  }
  if (lower.includes('insufficient') && lower.includes('balance')) {
    return isArabic ? 'الرصيد غير كافي لإتمام العملية.' : 'Insufficient balance to execute this convert.';
  }
  if (lower.includes('pair_not_live_ready') || lower.includes('live mode is not ready') || lower.includes('live connectivity')) {
    return isArabic ? 'وضع التنفيذ المباشر غير جاهز حاليا. سيتم استخدام الوضع التجريبي عند توفره.' : 'Live execution mode is not ready right now. Mock mode will be used when available.';
  }
  return message.slice(0, 180);
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
  const [feeUsdt, setFeeUsdt] = useState(0);
  const [convertMode, setConvertMode] = useState<'mock' | 'live' | 'reference'>('live');
  const [minUsdt, setMinUsdt] = useState(10);
  const [feeBps, setFeeBps] = useState(50);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [runtimeWarning, setRuntimeWarning] = useState('');
  const [liveReady, setLiveReady] = useState(false);
  const [healthError, setHealthError] = useState('');
  const [quoteValid, setQuoteValid] = useState(false);
  const [blockingReason, setBlockingReason] = useState('');
  const [quoteLoading, setQuoteLoading] = useState(false);

  const selectedPair = useMemo(() => pairs.find((item) => item.symbol === selectedSymbol) || null, [pairs, selectedSymbol]);
  const amountNum = parsePositive(amount);

  const handleAmountChange = useCallback((raw: string) => {
    const normalized = normalizeNumericInput(raw);
    setAmount(normalized);
  }, []);

  const labels = useMemo(
    () => ({
      back: isArabic ? 'رجوع' : 'Back',
      choosePair: isArabic ? 'اختار الزوج' : 'Choose pair',
      buy: isArabic ? 'شراء' : 'Buy',
      sell: isArabic ? 'بيع' : 'Sell',
      estimate: isArabic ? 'القيمة التقديرية' : 'Estimated value',
      fee: isArabic ? 'رسوم الكونفرت' : 'Convert fee',
      execute: isArabic ? 'تنفيذ التحويل' : 'Execute convert',
      executing: isArabic ? 'جاري التنفيذ...' : 'Executing...',
      runtimeWarning: isArabic ? 'تحذير تشغيل' : 'Runtime warning',
      mode: isArabic ? 'وضع التنفيذ' : 'Execution mode',
      live: isArabic ? 'حي' : 'Live',
      mock: isArabic ? 'تجريبي' : 'Mock',
      quickAmounts: isArabic ? 'مبالغ سريعة' : 'Quick amounts',
    }),
    [isArabic]
  );

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
    setConvertMode(res.data.settings?.convert_execution_mode || 'live');
    setRuntimeWarning('');
    setHealthError('');
    setLiveReady(false);
    if ((res.data.pairs || []).length) {
      setSelectedSymbol((prev) => (prev && res.data.pairs.some((item) => item.symbol === prev) ? prev : res.data.pairs[0].symbol));
    }
  }, [category, isArabic, toast]);

  const loadHealth = useCallback(
    async (pairSymbol: string) => {
      const res = await apiFetch<ConvertHealthResponse>(`/convert/health?category=${category}&symbol=${encodeURIComponent(pairSymbol)}`);
      if (!res.ok) {
        setLiveReady(false);
        setConvertMode('live');
        setHealthError(normalizeConvertWarning(res.error || (isArabic ? 'لا يوجد اتصال Live حاليا' : 'Live connectivity is not ready'), isArabic));
        return;
      }
      setConvertMode(res.data.effectiveMode || 'live');
      setLiveReady(Boolean(res.data.liveReady && res.data.effectiveMode === 'live'));
      setHealthError(normalizeConvertWarning(String(res.data.lastError || ''), isArabic));
    },
    [category, isArabic]
  );

  useEffect(() => {
    loadPairs();
  }, [loadPairs]);

  useEffect(() => {
    if (!selectedSymbol) return;
    loadHealth(selectedSymbol);
  }, [selectedSymbol, loadHealth]);

  useEffect(() => {
    async function run() {
      if (!selectedPair || !amountNum) {
        setEstimate(0);
        setFeeUsdt(0);
        setQuoteValid(false);
        setBlockingReason('');
        return;
      }
      setQuoteLoading(true);
      const res = await apiFetch<ConvertQuoteResponse>('/convert/quote', {
        method: 'POST',
        body: JSON.stringify({ category, symbol: selectedPair.symbol, side, amount: amountNum.toString() }),
      });
      setQuoteLoading(false);
      if (!res.ok) {
        setEstimate(0);
        setFeeUsdt(0);
        setQuoteValid(false);
        setBlockingReason('LIVE_QUOTE_UNAVAILABLE');
        setRuntimeWarning(normalizeConvertWarning(res.error || '', isArabic));
        return;
      }
      setConvertMode(res.data.executionMode === 'live' ? 'live' : res.data.mode === 'reference' ? 'reference' : 'mock');
      setRuntimeWarning(normalizeConvertWarning(String(res.data.runtime_warning || ''), isArabic));
      setEstimate(parsePositive(res.data.quote.estimatedQuote));
      setFeeUsdt(parsePositive(res.data.quote.feeAmount));
      setQuoteValid(Boolean(res.data.valid));
      setBlockingReason(String(res.data.blockingReason || ''));
      if (res.data.blockingReason === 'PAIR_REFERENCE_ONLY' || res.data.blockingReason === 'QUOTE_PROVIDER_REFERENCE_ONLY') {
        setLiveReady(false);
      }
    }
    run();
  }, [amountNum, category, isArabic, selectedPair, side]);

  const executeSwap = useCallback(async () => {
    if (!selectedPair) return;
    if (!liveReady || !quoteValid) {
      toast({ message: healthError || (isArabic ? 'وضع Live غير جاهز حاليا' : 'Live mode is not ready right now'), variant: 'error' });
      return;
    }
    if (!amountNum) {
      toast({ message: isArabic ? 'اكتب الكمية الاول' : 'Enter an amount first', variant: 'error' });
      return;
    }
    if (estimate < minUsdt) {
      toast({
        message: isArabic ? `القيمة أقل من الحد الأدنى ${minUsdt.toFixed(2)} USDT. زوّد الكمية.` : `Estimated value is below the ${minUsdt.toFixed(2)} USDT minimum.`,
        variant: 'error',
      });
      return;
    }

    setPlacing(true);
    const res = await apiFetch('/convert/execute', {
      method: 'POST',
      body: JSON.stringify({ category, symbol: selectedPair.symbol, side, amount: amountNum.toString() }),
    });
    setPlacing(false);
    if (!res.ok) {
      toast({ message: res.error || (isArabic ? 'فشل التنفيذ' : 'Execution failed'), variant: 'error' });
      return;
    }
    setRuntimeWarning(normalizeConvertWarning(String((res.data as { runtime_warning?: string | null })?.runtime_warning || ''), isArabic));
    toast({ message: isArabic ? 'تم تنفيذ العملية بنجاح' : 'Convert executed successfully', variant: 'success' });
    setAmount('');
    setEstimate(0);
  }, [amountNum, category, estimate, healthError, isArabic, liveReady, minUsdt, quoteValid, selectedPair, side, toast]);

  return (
    <section className="mx-auto w-full max-w-5xl space-y-4 px-4 py-4 md:px-6 md:py-6">
      <div className="flex items-center">
        <Link href="/trade" className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-[#11172a] px-3 py-2 text-xs text-white/80 transition hover:border-cyan-400/50 hover:text-white">
          <ChevronLeft className="h-4 w-4" /> {labels.back}
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {(['gold', 'stocks', 'crypto'] as Category[]).map((item) => (
          <Link key={item} href={`/trade/convert?category=${item}`} className={categoryStyle(item, category === item)}>
            {item.toUpperCase()}
          </Link>
        ))}
      </div>

      <div className="rounded-3xl border border-white/10 bg-[#0f172a] p-4 text-white shadow-xl shadow-black/20 md:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-white/80">
            <BadgeDollarSign className="h-4 w-4 text-cyan-200" /> {labels.choosePair}
          </div>
          <button onClick={loadPairs} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70 transition hover:border-cyan-400/50 hover:text-white" type="button">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> {isArabic ? 'تحديث' : 'Refresh'}
          </button>
        </div>

        <select value={selectedSymbol} onChange={(e) => setSelectedSymbol(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/30 p-3 text-sm">
          {pairs.map((pair) => (
            <option key={pair.id} value={pair.symbol}>
              {pair.symbol} - {cleanDisplayName(pair.display_name)}
            </option>
          ))}
        </select>

        {selectedPair && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#111a30] p-3">
            <div className="flex items-center gap-3">
              <div className="relative h-10 w-10 overflow-hidden rounded-full bg-white/10 ring-1 ring-white/15">
                <img
                  src={selectedPair.logo_url || assetIconFallback(selectedPair.token_symbol)}
                  alt={`${selectedPair.token_symbol} icon`}
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    const fallback = assetIconFallback(selectedPair.token_symbol);
                    const target = e.currentTarget;
                    if (fallback && target.src !== fallback) target.src = fallback;
                    else target.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" rx="24" fill="%23111f34"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-size="16" fill="%23ffffff" font-family="Arial">%</text></svg>';
                  }}
                />
              </div>
              <div>
                <div className="text-sm font-semibold">{selectedPair.symbol}</div>
                <div className="text-xs text-white/60">{cleanDisplayName(selectedPair.display_name)}</div>
              </div>
            </div>
            <div className="text-right text-xs text-white/60">
              <div>{labels.mode}</div>
              <div className={`font-semibold ${convertMode === 'live' && liveReady ? 'text-emerald-300' : 'text-amber-300'}`}>
                {selectedPair.execution_availability === 'reference_only'
                  ? isArabic
                    ? 'تسعير مرجعي فقط'
                    : 'Reference only'
                  : convertMode === 'live' && liveReady
                    ? labels.live
                    : isArabic
                      ? 'غير متاح'
                      : 'Live unavailable'}
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setSide('buy')}
            className={`rounded-xl px-4 py-2.5 text-sm transition ${
              side === 'buy' ? 'border border-emerald-300/60 bg-emerald-500/20 text-emerald-100' : 'border border-white/10 bg-white/[0.03] text-white/70'
            }`}
          >
            {labels.buy}
          </button>
          <button
            type="button"
            onClick={() => setSide('sell')}
            className={`rounded-xl px-4 py-2.5 text-sm transition ${
              side === 'sell' ? 'border border-rose-300/60 bg-rose-500/20 text-rose-100' : 'border border-white/10 bg-white/[0.03] text-white/70'
            }`}
          >
            {labels.sell}
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-[#111a2e] p-4">
          <div className="text-xs text-white/60">
            {side === 'buy'
              ? isArabic
                ? `كمية ${selectedPair?.base_asset || ''} اللي عايز تشتريها`
                : `Amount of ${selectedPair?.base_asset || ''} to buy`
              : isArabic
              ? `كمية ${selectedPair?.base_asset || ''} اللي عايز تبيعها`
              : `Amount of ${selectedPair?.base_asset || ''} to sell`}
          </div>
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => handleAmountChange(e.target.value)}
              className="w-full bg-transparent text-lg outline-none"
              placeholder="0.0"
            />
            <ArrowDownUp className="h-4 w-4 text-white/40" />
          </div>

          <div className="mt-3 text-xs text-white/55">{isArabic ? 'Quick amounts معطلة لهذا الزوج لتجنب اللبس (الادخال هنا كمية الأصل).' : 'Quick amounts disabled for this pair to avoid ambiguity (input is base-asset amount).'}</div>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-black/20 p-2.5 text-xs text-white/70">
              <div className="text-white/50">{labels.estimate}</div>
              <div className="mt-1 text-sm font-semibold text-white">{formatPrice(estimate)} USDT</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-2.5 text-xs text-white/70">
              <div className="text-white/50">{labels.fee}</div>
              <div className="mt-1 text-sm font-semibold text-white">{(feeBps / 100).toFixed(2)}% ({formatPrice(feeUsdt)} USDT)</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-2.5 text-xs text-white/70">
              <div className="text-white/50">{isArabic ? 'الحد الادنى' : 'Minimum'}</div>
              <div className="mt-1 text-sm font-semibold text-white">{minUsdt.toFixed(2)} USDT</div>
            </div>
          </div>

          {quoteLoading ? <div className="mt-2 text-xs text-cyan-200">{isArabic ? 'جاري جلب السعر المباشر...' : 'Fetching live quote...'}</div> : null}
          {runtimeWarning ? (
            <div className="mt-2 break-words rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200">
              {labels.runtimeWarning}: {runtimeWarning}
            </div>
          ) : null}
          {blockingReason === 'AMOUNT_BELOW_MINIMUM' ? (
            <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200">
              {isArabic ? `القيمة أقل من الحد الأدنى ${minUsdt.toFixed(2)} USDT. زوّد الكمية.` : `Estimated value is below the ${minUsdt.toFixed(2)} USDT minimum.`}
            </div>
          ) : null}
          {blockingReason === 'PAIR_REFERENCE_ONLY' || blockingReason === 'QUOTE_PROVIDER_REFERENCE_ONLY' ? (
            <div className="mt-2 rounded-lg border border-blue-500/40 bg-blue-500/10 p-2 text-xs text-blue-200">
              {isArabic ? 'الزوج حاليا للتسعير المرجعي فقط لحين توفر مسار تنفيذ Live.' : 'This pair is currently reference-only until a live executable route becomes available.'}
            </div>
          ) : null}
          {!liveReady ? (
            <div className="mt-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-200">
              {isArabic ? 'Live غير جاهز حاليا' : 'Live mode is not ready'}{healthError ? `: ${healthError}` : ''}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={executeSwap}
          disabled={placing || loading || !selectedPair || !liveReady || !quoteValid || estimate < minUsdt}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-500 py-3 text-center font-semibold text-black transition hover:bg-cyan-400 disabled:opacity-60"
        >
          <Wallet className="h-4 w-4" /> {placing ? labels.executing : labels.execute}
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
