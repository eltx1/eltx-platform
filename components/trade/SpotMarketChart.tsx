'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { dict, useLang } from '../../app/lib/i18n';

type Timeframe = '5m' | '1h' | '1d';
type ChartMode = 'candles' | 'line';

type SpotMarketChartProps = {
  marketSymbol?: string;
  baseAsset?: string | null;
  quoteAsset?: string | null;
  title: string;
  emptyLabel: string;
  enabled?: boolean;
};

type TradingViewWidget = {
  remove: () => void;
  onChartReady: (cb: () => void) => void;
};

declare global {
  interface Window {
    TradingView?: {
      widget: (config: Record<string, unknown>) => TradingViewWidget;
    };
  }
}

const TRADINGVIEW_SCRIPT_SRC = 'https://s3.tradingview.com/tv.js';

const tradingViewScriptLoader = (() => {
  let loadingPromise: Promise<void> | null = null;

  return () => {
    if (typeof window === 'undefined') return Promise.reject(new Error('Window is unavailable'));
    if (window.TradingView?.widget) return Promise.resolve();

    if (!loadingPromise) {
      loadingPromise = new Promise((resolve, reject) => {
        const existingScript = document.querySelector(`script[src="${TRADINGVIEW_SCRIPT_SRC}"]`) as HTMLScriptElement | null;
        if (existingScript) {
          if (existingScript.dataset.loaded === 'true') {
            resolve();
            return;
          }
          existingScript.addEventListener('load', () => resolve());
          existingScript.addEventListener('error', () => reject(new Error('Failed to load TradingView script')));
          return;
        }

        const script = document.createElement('script');
        script.src = TRADINGVIEW_SCRIPT_SRC;
        script.async = true;
        script.dataset.loaded = 'false';
        script.onload = () => {
          script.dataset.loaded = 'true';
          resolve();
        };
        script.onerror = () => reject(new Error('Failed to load TradingView script'));
        document.body.appendChild(script);
      });
    }

    return loadingPromise;
  };
})();

function toTradingViewInterval(timeframe: Timeframe): string {
  switch (timeframe) {
    case '5m':
      return '5';
    case '1h':
      return '60';
    case '1d':
    default:
      return '1D';
  }
}

function resolveSymbol(marketSymbol?: string, baseAsset?: string | null, quoteAsset?: string | null): string | undefined {
  if (baseAsset && quoteAsset) return `${baseAsset}${quoteAsset}`.toUpperCase();
  return marketSymbol?.replace(/[^a-z0-9]/gi, '').toUpperCase();
}

export default function SpotMarketChart({
  marketSymbol,
  baseAsset,
  quoteAsset,
  title,
  emptyLabel,
  enabled = true,
}: SpotMarketChartProps) {
  const { lang } = useLang();
  const t = dict[lang];

  const containerIdRef = useRef(`spot-tv-${Math.random().toString(36).slice(2)}`);
  const widgetRef = useRef<TradingViewWidget | null>(null);

  const [mode, setMode] = useState<ChartMode>('candles');
  const [timeframe, setTimeframe] = useState<Timeframe>('5m');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pairLabel = useMemo(() => {
    if (baseAsset && quoteAsset) return `${baseAsset}/${quoteAsset}`;
    if (marketSymbol) return marketSymbol;
    return null;
  }, [baseAsset, quoteAsset, marketSymbol]);

  const hasMarket = enabled && !!marketSymbol;

  useEffect(() => {
    if (!hasMarket) {
      setError(null);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    const containerId = containerIdRef.current;
    const symbol = resolveSymbol(marketSymbol, baseAsset, quoteAsset);

    const mountWidget = async () => {
      setLoading(true);
      setError(null);

      try {
        await tradingViewScriptLoader();
        if (cancelled) return;
        if (!window.TradingView?.widget || !symbol) {
          throw new Error('TradingView widget unavailable');
        }

        const widget = window.TradingView.widget({
          symbol,
          interval: toTradingViewInterval(timeframe),
          container_id: containerId,
          autosize: true,
          theme: 'dark',
          style: mode === 'line' ? 8 : 1,
          hide_top_toolbar: false,
          hide_legend: true,
          locale: lang,
        });

        widgetRef.current = widget;
        widget.onChartReady(() => {
          if (!cancelled) setLoading(false);
        });
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setError(t.common.genericError);
          setLoading(false);
        }
      }
    };

    mountWidget();

    return () => {
      cancelled = true;
      widgetRef.current?.remove();
      widgetRef.current = null;
    };
  }, [hasMarket, marketSymbol, baseAsset, quoteAsset, timeframe, mode, lang, t.common.genericError]);

  const timeframeButtons: { value: Timeframe; label: string }[] = [
    { value: '5m', label: t.spotTrade.chart.timeframes['5m'] },
    { value: '1h', label: t.spotTrade.chart.timeframes['1h'] },
    { value: '1d', label: t.spotTrade.chart.timeframes['1d'] },
  ];

  const showModeToggle = hasMarket;

  return (
    <div className="bg-white/5 rounded-xl p-4 space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="text-sm font-semibold opacity-80">{title}</div>
          {pairLabel && <div className="text-xs opacity-70">{pairLabel}</div>}
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <div className="flex rounded-full bg-white/10 p-1 shadow-inner">
            {timeframeButtons.map((btn) => (
              <button
                key={btn.value}
                className={`px-3 py-1 rounded-full transition ${
                  timeframe === btn.value && enabled
                    ? 'bg-white text-black shadow'
                    : enabled
                    ? 'text-white/70 hover:text-white'
                    : 'text-white/30 cursor-not-allowed'
                }`}
                onClick={() => enabled && setTimeframe(btn.value)}
                disabled={!enabled}
              >
                {btn.label}
              </button>
            ))}
          </div>
          {showModeToggle && (
            <div className="flex rounded-full bg-white/10 p-1 shadow-inner">
              {(['line', 'candles'] as ChartMode[]).map((option) => (
                <button
                  key={option}
                  className={`px-3 py-1 rounded-full transition ${
                    mode === option ? 'bg-white text-black shadow' : 'text-white/70 hover:text-white'
                  }`}
                  onClick={() => setMode(option)}
                >
                  {t.spotTrade.chart.modes[option]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="relative h-72 overflow-hidden rounded-lg border border-white/10 bg-black/40">
        <div id={containerIdRef.current} className="absolute inset-0" />
        {(!enabled || !hasMarket) && !loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-xs opacity-70">{emptyLabel}</div>
        )}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-white/80 bg-black/40 backdrop-blur-sm">
            {t.trade.loading}
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-red-300 bg-black/40 backdrop-blur-sm">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
