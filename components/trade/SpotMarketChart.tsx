'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  IChartApi,
  ISeriesApi,
  LineSeries,
  Time,
  createChart,
} from 'lightweight-charts';
import Decimal from 'decimal.js';
import { apiFetch } from '../../app/lib/api';
import { dict, useLang } from '../../app/lib/i18n';

type Timeframe = '5m' | '1h' | '1d';

type TradePoint = {
  id?: number;
  price: string;
  base_amount: string;
  taker_side: 'buy' | 'sell' | string;
  created_at: string;
};

type CandlePoint = {
  time: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
};

type CandleResponse = {
  ok: boolean;
  market: { symbol: string; base_asset: string; quote_asset: string };
  interval: Timeframe;
  candles: CandlePoint[];
};

type SpotMarketChartProps = {
  marketSymbol?: string;
  baseAsset?: string | null;
  quoteAsset?: string | null;
  pricePrecision?: number;
  title: string;
  emptyLabel: string;
  trades?: TradePoint[];
  enabled?: boolean;
};

type CandleChartPoint = {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
};

type VolumePoint = {
  time: Time;
  value: number;
  color: string;
};

function toMillis(timeframe: Timeframe): number {
  switch (timeframe) {
    case '5m':
      return 5 * 60 * 1000;
    case '1h':
      return 60 * 60 * 1000;
    case '1d':
    default:
      return 24 * 60 * 60 * 1000;
  }
}

function safeDecimal(value: string | number | null | undefined): Decimal {
  try {
    if (value === null || value === undefined) return new Decimal(0);
    const normalized = typeof value === 'string' && value.trim() === '' ? '0' : value;
    return new Decimal(normalized as Decimal.Value);
  } catch {
    return new Decimal(0);
  }
}

function formatUpdateTimestamp(timestamp?: number, locale?: string): string {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  return date.toLocaleString(locale || 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function clampPrecision(value: number, min = 2, max = 12): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

export default function SpotMarketChart({
  marketSymbol,
  baseAsset,
  quoteAsset,
  pricePrecision = 6,
  title,
  emptyLabel,
  trades = [],
  enabled = true,
}: SpotMarketChartProps) {
  const { lang } = useLang();
  const t = dict[lang];

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const priceSeriesRef = useRef<ISeriesApi<'Candlestick', Time> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram', Time> | null>(null);
  const fallbackLineSeriesRef = useRef<ISeriesApi<'Line', Time> | null>(null);

  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [loading, setLoading] = useState(false);
  const [candles, setCandles] = useState<CandlePoint[]>([]);
  const [hoverCandle, setHoverCandle] = useState<CandleChartPoint | null>(null);
  const [hasIntersected, setHasIntersected] = useState(false);

  const pairLabel = useMemo(() => {
    if (baseAsset && quoteAsset) return `${baseAsset}/${quoteAsset}`;
    if (marketSymbol) return marketSymbol;
    return null;
  }, [baseAsset, quoteAsset, marketSymbol]);

  const filtered = useMemo(() => {
    const now = Date.now();
    const windowMs = toMillis(timeframe);
    const cutoff = now - windowMs;
    const sorted = [...trades]
      .map((trade) => ({ ...trade, created_at: trade.created_at }))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    const withinWindow = sorted.filter((trade) => new Date(trade.created_at).getTime() >= cutoff);
    return withinWindow.length ? withinWindow : sorted;
  }, [timeframe, trades]);

  useEffect(() => {
    let active = true;
    if (!marketSymbol || !enabled) {
      setCandles([]);
      return;
    }
    setLoading(true);
    apiFetch<CandleResponse>(
      `/spot/candles?market=${encodeURIComponent(marketSymbol)}&interval=${timeframe}&limit=200`
    ).then((res) => {
      if (!active) return;
      if (res.ok && res.data?.candles) setCandles(res.data.candles);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [enabled, marketSymbol, timeframe]);

  const chartData = useMemo(() => {
    if (!enabled) {
      return {
        candles: [] as CandleChartPoint[],
        volumePoints: [] as VolumePoint[],
        stats: {
          high: null,
          low: null,
          vwap: null,
          buyVolume: 0,
          sellVolume: 0,
          lastPrice: null,
          lastUpdate: null,
        },
      };
    }

    const parsedCandles: CandleChartPoint[] = candles
      .map((candle) => ({
        time: candle.time as Time,
        open: safeDecimal(candle.open).toNumber(),
        high: safeDecimal(candle.high).toNumber(),
        low: safeDecimal(candle.low).toNumber(),
        close: safeDecimal(candle.close).toNumber(),
      }))
      .filter((candle) => Number.isFinite(candle.open) && Number.isFinite(candle.high));

    const volumePoints: VolumePoint[] = candles.map((candle) => {
      const open = safeDecimal(candle.open);
      const close = safeDecimal(candle.close);
      const isUp = close.greaterThanOrEqualTo(open);
      return {
        time: candle.time as Time,
        value: safeDecimal(candle.volume).toNumber(),
        color: isUp ? 'rgba(34,197,94,0.65)' : 'rgba(239,68,68,0.65)',
      };
    });

    const highs = parsedCandles.map((p) => p.high);
    const high = highs.length ? Math.max(...highs) : null;
    const low = highs.length ? Math.min(...highs) : null;

    const buyVolume = filtered.reduce((acc, trade) => {
      const amount = safeDecimal(trade.base_amount);
      return trade.taker_side?.toLowerCase() === 'sell' ? acc : acc.plus(amount);
    }, new Decimal(0));
    const sellVolume = filtered.reduce((acc, trade) => {
      const amount = safeDecimal(trade.base_amount);
      return trade.taker_side?.toLowerCase() === 'sell' ? acc.plus(amount) : acc;
    }, new Decimal(0));

    const vwapNumerator = filtered.reduce(
      (acc, trade) => acc.plus(safeDecimal(trade.price).mul(safeDecimal(trade.base_amount))),
      new Decimal(0)
    );
    const totalVolume = filtered.reduce((acc, trade) => acc.plus(safeDecimal(trade.base_amount)), new Decimal(0));
    const vwap = totalVolume.gt(0) ? vwapNumerator.div(totalVolume).toNumber() : null;

    const lastCandle = parsedCandles[parsedCandles.length - 1];
    const lastUpdate = candles.length ? (candles[candles.length - 1].time as number) * 1000 : null;

    return {
      candles: parsedCandles,
      volumePoints,
      stats: {
        high,
        low,
        vwap,
        buyVolume: buyVolume.toNumber(),
        sellVolume: sellVolume.toNumber(),
        lastPrice: lastCandle?.close ?? null,
        lastUpdate,
      },
    };
  }, [candles, enabled, filtered]);

  const candleByTime = useMemo(() => new Map(chartData.candles.map((c) => [c.time, c])), [chartData.candles]);

  const fallbackLinePoints = useMemo(() => {
    const points = filtered
      .map((trade) => ({
        time: Math.floor(new Date(trade.created_at).getTime() / 1000) as Time,
        value: safeDecimal(trade.price).toNumber(),
      }))
      .filter((point) => Number.isFinite(point.value))
      .sort((a, b) => (a.time as number) - (b.time as number));

    return points.length >= 2 ? points : [];
  }, [filtered]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setHasIntersected(true);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!containerRef.current || chartRef.current || !hasIntersected) return;

    const containerEl = containerRef.current;

    const ensureSize = (): { width: number; height: number } | null => {
      const { clientWidth, clientHeight } = containerEl;
      if (!clientWidth || !clientHeight) return null;
      return { width: clientWidth, height: clientHeight };
    };

    let frame: number | null = null;
    let initialSize = ensureSize();

    if (!initialSize) {
      frame = window.requestAnimationFrame(() => {
        initialSize = ensureSize();
        if (initialSize) {
          chartRef.current?.applyOptions({ width: initialSize.width, height: initialSize.height });
        }
      });
    }

    const fallbackSize = initialSize || { width: Math.max(containerEl.clientWidth, 320) || 360, height: 360 };

    const chart = createChart(containerEl, {
      autoSize: false,
      width: fallbackSize.width,
      height: fallbackSize.height,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#e2e8f0' },
      rightPriceScale: { borderVisible: false },
      leftPriceScale: { borderVisible: false, visible: false },
      timeScale: { borderVisible: false, secondsVisible: false, lockVisibleTimeRangeOnResize: true },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.06)' },
        horzLines: { color: 'rgba(255,255,255,0.06)' },
      },
      crosshair: { mode: 1 },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      handleScale: { axisPressedMouseMove: { time: true, price: true }, mouseWheel: true, pinch: true },
    });

    const candlesSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      priceLineVisible: true,
    });
    const histogram = chart.addSeries(HistogramSeries, {
      priceScaleId: 'volume',
      priceFormat: { type: 'volume' },
      base: 0,
    });
    const fallbackLine = chart.addSeries(LineSeries, {
      color: '#60a5fa',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: true,
    });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.75, bottom: 0 } });
    chart.timeScale().applyOptions({ barSpacing: 8, rightOffset: 2, fixLeftEdge: true });

    chartRef.current = chart;
    priceSeriesRef.current = candlesSeries;
    volumeSeriesRef.current = histogram;
    fallbackLineSeriesRef.current = fallbackLine;

    let autosized = false;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || !entry.contentRect.height) return;
      chart.applyOptions({ height: entry.contentRect.height, width: entry.contentRect.width });
      if (!autosized) {
        chart.applyOptions({ autoSize: true });
        autosized = true;
      }
    });
    observer.observe(containerEl);

    const handleViewportChange = () => {
      if (!chartRef.current) return;
      const size = ensureSize();
      if (size) chartRef.current.applyOptions(size);
    };

    window.addEventListener('orientationchange', handleViewportChange);
    window.addEventListener('resize', handleViewportChange);
    document.addEventListener('visibilitychange', handleViewportChange);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('orientationchange', handleViewportChange);
      window.removeEventListener('resize', handleViewportChange);
      document.removeEventListener('visibilitychange', handleViewportChange);
      chart.remove();
      chartRef.current = null;
      priceSeriesRef.current = null;
      volumeSeriesRef.current = null;
      fallbackLineSeriesRef.current = null;
    };
  }, [hasIntersected]);

  useEffect(() => {
    if (!chartRef.current || !priceSeriesRef.current || !volumeSeriesRef.current || !fallbackLineSeriesRef.current) return;

    const hasCandles = chartData.candles.length > 0;
    const hasFallbackLine = !hasCandles && fallbackLinePoints.length > 0;

    priceSeriesRef.current.setData(hasCandles ? chartData.candles : []);
    volumeSeriesRef.current.setData(hasCandles ? chartData.volumePoints : []);

    fallbackLineSeriesRef.current.applyOptions({ visible: hasFallbackLine });
    fallbackLineSeriesRef.current.setData(hasFallbackLine ? fallbackLinePoints : []);

    if (hasCandles || hasFallbackLine) chartRef.current.timeScale().fitContent();
  }, [chartData, fallbackLinePoints]);

  useEffect(() => {
    if (!chartRef.current || !priceSeriesRef.current) return;
    const handler = (param: any) => {
      if (!param || param.time === undefined || param.time === null) {
        setHoverCandle(null);
        return;
      }
      const candleTime = param.time as Time;
      const candle = candleByTime.get(candleTime) ?? null;
      setHoverCandle(candle);
    };
    chartRef.current.subscribeCrosshairMove(handler);
    return () => {
      chartRef.current?.unsubscribeCrosshairMove(handler);
    };
  }, [candleByTime]);

  const timeframeButtons: { value: Timeframe; label: string }[] = [
    { value: '5m', label: t.spotTrade.chart.timeframes['5m'] },
    { value: '1h', label: t.spotTrade.chart.timeframes['1h'] },
    { value: '1d', label: t.spotTrade.chart.timeframes['1d'] },
  ];

  const flowTotal = Math.max(chartData.stats.buyVolume + chartData.stats.sellVolume, 0.00001);
  const buyBiasPercent = Math.min(100, Math.max(0, (chartData.stats.buyVolume / flowTotal) * 100));
  const sellBiasPercent = 100 - buyBiasPercent;

  const locale = lang === 'ar' ? 'ar-EG' : 'en-US';
  const activeCandle = hoverCandle || chartData.candles[chartData.candles.length - 1];

  const chartPrecision = useMemo(() => clampPrecision(pricePrecision), [pricePrecision]);
  const chartMinMove = useMemo(() => Number(new Decimal(10).pow(-chartPrecision).toString()), [chartPrecision]);

  const formatPrice = (value: number | string | null | undefined, fallback = '—') => {
    const decimal = safeDecimal(value);
    if (!decimal.isFinite()) return fallback;
    return decimal.toFixed(chartPrecision);
  };

  const formatCompact = (value: number | string | null | undefined, fallback = '—') => {
    const decimal = safeDecimal(value);
    if (!decimal.isFinite()) return fallback;
    const abs = decimal.abs();
    if (abs.greaterThan(1_000_000)) return decimal.toFixed(0);
    if (abs.lessThan(0.000001)) return decimal.toFixed(8);
    if (abs.lessThan(1)) return decimal.toFixed(6);
    return decimal.toFixed(2);
  };

  const priceChange = useMemo(() => {
    if (!chartData.candles.length) return { value: 0, percent: 0, isUp: true };
    const first = chartData.candles[0];
    const last = chartData.candles[chartData.candles.length - 1];
    const start = safeDecimal(first.open);
    const end = safeDecimal(last.close);
    if (!start.isFinite() || start.isZero()) return { value: 0, percent: 0, isUp: true };
    const value = end.minus(start);
    const percent = value.div(start).mul(100);
    return { value: value.toNumber(), percent: percent.toNumber(), isUp: !value.isNeg() };
  }, [chartData.candles]);

  const showEmptyState = !enabled || (!chartData.candles.length && !loading && fallbackLinePoints.length === 0);
  const containerMinHeight = { minHeight: 'min(60vh, 520px)' } as const;

  useEffect(() => {
    if (!priceSeriesRef.current || !fallbackLineSeriesRef.current) return;
    const priceFormat = { type: 'price' as const, precision: chartPrecision, minMove: chartMinMove };
    priceSeriesRef.current.applyOptions({ priceFormat });
    fallbackLineSeriesRef.current.applyOptions({ priceFormat });
  }, [chartPrecision, chartMinMove, hasIntersected]);

  return (
    <div className="bg-white/5 rounded-xl p-4 space-y-4 shadow-lg">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="text-sm font-semibold opacity-80">{title}</div>
          {pairLabel && <div className="text-xs opacity-70">{pairLabel}</div>}
          <div className="text-[11px] text-white/60">
            {t.spotTrade.chart.updated}:{' '}
            {chartData.stats.lastUpdate ? formatUpdateTimestamp(chartData.stats.lastUpdate, locale) : t.spotTrade.chart.updatedNever}
          </div>
        </div>

        <div className="flex flex-col items-start sm:items-end gap-1">
          <div className={`text-2xl font-bold leading-none ${priceChange.isUp ? 'text-green-400' : 'text-red-400'}`}>
            {formatPrice(chartData.stats.lastPrice)}
          </div>
          <div className="text-xs opacity-80">
            {`${formatPrice(priceChange.value, '0')} (${safeDecimal(priceChange.percent).toFixed(2)}%)`}
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
                      ? 'text-white/80 hover:text-white'
                      : 'text-white/30 cursor-not-allowed'
                  }`}
                  onClick={() => enabled && setTimeframe(btn.value)}
                  disabled={!enabled}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <div className="lg:col-span-3 relative rounded-xl border border-white/10 bg-gradient-to-b from-white/5 to-black/40 overflow-visible lg:overflow-hidden">
          <div className="relative w-full" style={containerMinHeight}>
            <div ref={containerRef} className="absolute inset-0 w-full h-full p-1 sm:p-2" />
          </div>
          {showEmptyState && (
            <div className="absolute inset-0 flex items-center justify-center text-xs opacity-80 bg-black/40 backdrop-blur">
              <span className="text-center px-4">{emptyLabel}</span>
            </div>
          )}
          {activeCandle && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-black/70 backdrop-blur px-4 py-3 text-[11px] text-white">
              <div>
                <div className="opacity-70">{t.spotTrade.chart.open}</div>
                <div className="font-semibold">{formatPrice(activeCandle.open)}</div>
              </div>
              <div>
                <div className="opacity-70">{t.spotTrade.chart.high}</div>
                <div className="font-semibold">{formatPrice(activeCandle.high)}</div>
              </div>
              <div>
                <div className="opacity-70">{t.spotTrade.chart.low}</div>
                <div className="font-semibold">{formatPrice(activeCandle.low)}</div>
              </div>
              <div>
                <div className="opacity-70">{t.spotTrade.chart.close}</div>
                <div className="font-semibold">{formatPrice(activeCandle.close)}</div>
              </div>
            </div>
          )}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center text-xs opacity-70 bg-black/30">{t.trade.loading}</div>
          )}
        </div>

        <div className="space-y-3">
          <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-xs space-y-3 shadow-inner">
            <div className="grid grid-cols-2 gap-y-2">
              <div className="opacity-70">{t.spotTrade.chart.high}</div>
              <div className="text-right font-semibold">{formatPrice(chartData.stats.high)}</div>
              <div className="opacity-70">{t.spotTrade.chart.low}</div>
              <div className="text-right font-semibold">{formatPrice(chartData.stats.low)}</div>
              <div className="opacity-70">{t.spotTrade.chart.vwap}</div>
              <div className="text-right font-semibold">{formatPrice(chartData.stats.vwap, '—')}</div>
              <div className="opacity-70">{t.spotTrade.lastPrice}</div>
              <div className="text-right font-semibold">{formatPrice(chartData.stats.lastPrice)}</div>
            </div>
            <div className="text-[11px] opacity-70 text-right">
              {new Date(chartData.stats.lastUpdate || Date.now()).toLocaleString(locale, {
                hour: '2-digit',
                minute: '2-digit',
                month: 'short',
                day: '2-digit',
              })}
            </div>
          </div>

          <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-xs space-y-3 shadow-inner">
            <div className="flex justify-between items-center">
              <span className="font-semibold opacity-80">{t.spotTrade.chart.flow}</span>
              <span className="text-[11px] opacity-70">{t.spotTrade.chart.updated}</span>
            </div>
            <div className="relative h-2 rounded-full overflow-hidden bg-black/50">
              <div
                className="absolute left-0 top-0 h-full bg-green-500"
                style={{ width: `${buyBiasPercent}%` }}
              />
              <div
                className="absolute right-0 top-0 h-full bg-red-500"
                style={{ width: `${sellBiasPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] opacity-80">
              <div>
                <div className="text-green-300 font-semibold">{t.spotTrade.chart.buyers}</div>
                <div>{formatCompact(chartData.stats.buyVolume)}</div>
              </div>
              <div className="text-right">
                <div className="text-red-300 font-semibold">{t.spotTrade.chart.sellers}</div>
                <div>{formatCompact(chartData.stats.sellVolume)}</div>
              </div>
            </div>
            <div className="flex justify-between text-[11px] opacity-80">
              <span>{buyBiasPercent.toFixed(1)}%</span>
              <span>{sellBiasPercent.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
