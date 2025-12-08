'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CandlestickData, IChartApi, ISeriesApi, LineData, UTCTimestamp } from 'lightweight-charts';
import { ColorType, createChart } from 'lightweight-charts';
import { apiFetch } from '../../app/lib/api';
import { dict, useLang } from '../../app/lib/i18n';

type CandlePoint = {
  time: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
};

type Timeframe = '5m' | '1h' | '1d';
type ChartMode = 'candles' | 'line';

const DEFAULT_CHART_MODE: ChartMode = 'candles';

type SpotMarketChartProps = {
  marketSymbol?: string;
  baseAsset?: string | null;
  quoteAsset?: string | null;
  title: string;
  emptyLabel: string;
  enabled?: boolean;
};

const CACHE_TTL_MS = 60 * 1000;

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

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const areaSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const cacheRef = useRef<Record<string, { data: CandlePoint[]; fetchedAt: number }>>({});
  const initialModeRef = useRef<ChartMode>(DEFAULT_CHART_MODE);
  const latestRequestRef = useRef<string>('');

  const [mode, setMode] = useState<ChartMode>(initialModeRef.current);
  const [timeframe, setTimeframe] = useState<Timeframe>('5m');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candles, setCandles] = useState<CandlePoint[]>([]);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const fetchCandles = useCallback(
    async (symbol: string, frame: Timeframe) => {
      const key = `${symbol}-${frame}`;
      const cached = cacheRef.current[key];
      const now = Date.now();
      if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
        setCandles(cached.data);
        setLastUpdated(cached.fetchedAt);
        return;
      }
      latestRequestRef.current = key;
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ market: symbol, interval: frame });
      const res = await apiFetch<{ candles: CandlePoint[] }>(`/spot/candles?${params.toString()}`);
      if (latestRequestRef.current !== key) {
        setLoading(false);
        return;
      }
      setLoading(false);
      if (!res.ok) {
        setError(res.error || t.common.genericError);
        return;
      }
      cacheRef.current[key] = { data: res.data.candles, fetchedAt: now };
      setCandles(res.data.candles);
      setLastUpdated(now);
    },
    [t.common.genericError]
  );

  useEffect(() => {
    if (!enabled || !marketSymbol) {
      setCandles([]);
      setError(null);
      latestRequestRef.current = '';
      return undefined;
    }

    const maybeLoadCandles = () => {
      const key = `${marketSymbol}-${timeframe}`;
      const cached = cacheRef.current[key];
      const now = Date.now();

      if (cached) {
        setCandles(cached.data);
        setLastUpdated(cached.fetchedAt);
      }

      if (!cached || now - cached.fetchedAt >= CACHE_TTL_MS) {
        fetchCandles(marketSymbol, timeframe);
      }
    };

    maybeLoadCandles();

    const refreshInterval = setInterval(maybeLoadCandles, Math.max(10_000, CACHE_TTL_MS / 2));
    return () => clearInterval(refreshInterval);
  }, [marketSymbol, timeframe, fetchCandles, enabled]);

  const candlestickData = useMemo<CandlestickData<UTCTimestamp>[]>(() => {
    return candles
      .map((candle) => {
        const open = Number(candle.open);
        const high = Number(candle.high);
        const low = Number(candle.low);
        const close = Number(candle.close);
        if (!Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) return null;
        return {
          time: candle.time as UTCTimestamp,
          open,
          high,
          low,
          close,
        };
      })
      .filter((candle): candle is CandlestickData<UTCTimestamp> => candle !== null);
  }, [candles]);

  const lineData = useMemo<LineData<UTCTimestamp>[]>(() => {
    return candlestickData.map((candle) => ({ time: candle.time, value: candle.close }));
  }, [candlestickData]);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const chart = createChart(container, {
      width: container.clientWidth || 0,
      height: container.clientHeight || 280,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#e2e8f0',
      },
      grid: {
        vertLines: { color: 'rgba(148, 163, 184, 0.12)' },
        horzLines: { color: 'rgba(148, 163, 184, 0.12)' },
      },
      timeScale: { borderColor: 'rgba(148, 163, 184, 0.2)', timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderColor: 'rgba(148, 163, 184, 0.2)' },
      crosshair: {
        vertLine: { color: 'rgba(226, 232, 240, 0.35)', width: 1, style: 0 },
        horzLine: { color: 'rgba(226, 232, 240, 0.35)', width: 1, style: 0 },
      },
    });

    const areaSeries = chart.addAreaSeries({
      lineColor: '#38bdf8',
      topColor: 'rgba(56, 189, 248, 0.25)',
      bottomColor: 'rgba(56, 189, 248, 0.05)',
      lineWidth: 2,
      priceLineVisible: false,
    });
    areaSeries.applyOptions({ visible: initialModeRef.current === 'line' });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
      borderVisible: false,
      priceLineVisible: false,
    });
    candleSeries.applyOptions({ visible: initialModeRef.current === 'candles' });

    chartRef.current = chart;
    areaSeriesRef.current = areaSeries;
    candleSeriesRef.current = candleSeries;

    const handleResize = () => {
      if (!containerRef.current) return;
      chart.applyOptions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });
    };

    let resizeObserver: ResizeObserver | null = null;
    let resizeListenerAttached = false;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => handleResize());
      resizeObserver.observe(container);
    } else {
      window.addEventListener('resize', handleResize);
      resizeListenerAttached = true;
    }

    handleResize();

    return () => {
      resizeObserver?.disconnect();
      if (resizeListenerAttached) window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      areaSeriesRef.current = null;
      candleSeriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!areaSeriesRef.current || !candleSeriesRef.current) return;
    areaSeriesRef.current.applyOptions({ visible: mode === 'line' });
    candleSeriesRef.current.applyOptions({ visible: mode === 'candles' });
  }, [mode]);

  useEffect(() => {
    if (!areaSeriesRef.current || !candleSeriesRef.current) return;
    if (candlestickData.length === 0) {
      areaSeriesRef.current.setData([]);
      candleSeriesRef.current.setData([]);
      return;
    }
    areaSeriesRef.current.setData(lineData);
    candleSeriesRef.current.setData(candlestickData);
    chartRef.current?.timeScale().fitContent();
  }, [candlestickData, lineData]);

  const pairLabel = useMemo(() => {
    if (baseAsset && quoteAsset) return `${baseAsset}/${quoteAsset}`;
    if (marketSymbol) return marketSymbol;
    return null;
  }, [baseAsset, quoteAsset, marketSymbol]);

  const hasData = candlestickData.length > 0;
  const timeframeButtons: { value: Timeframe; label: string }[] = [
    { value: '5m', label: t.spotTrade.chart.timeframes['5m'] },
    { value: '1h', label: t.spotTrade.chart.timeframes['1h'] },
    { value: '1d', label: t.spotTrade.chart.timeframes['1d'] },
  ];

  const showModeToggle = enabled && hasData;

  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdated) return t.spotTrade.chart.updatedNever;
    const date = new Date(lastUpdated);
    return `${t.spotTrade.chart.updated}: ${date.toLocaleTimeString()}`;
  }, [lastUpdated, t.spotTrade.chart.updated, t.spotTrade.chart.updatedNever]);

  return (
    <div className="bg-white/5 rounded-xl p-4 space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="text-sm font-semibold opacity-80">{title}</div>
          {pairLabel && <div className="text-xs opacity-70">{pairLabel}</div>}
          <div className="text-xs opacity-60">{lastUpdatedLabel}</div>
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
        <div ref={containerRef} className="absolute inset-0" />
        {(!enabled || !hasData) && !loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-xs opacity-70">
            {emptyLabel}
          </div>
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
