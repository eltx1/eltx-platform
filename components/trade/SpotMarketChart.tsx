'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AreaSeries, ColorType, HistogramSeries, IChartApi, ISeriesApi, Time, createChart } from 'lightweight-charts';
import Decimal from 'decimal.js';
import { dict, useLang } from '../../app/lib/i18n';

type Timeframe = '5m' | '1h' | '1d';

type TradePoint = {
  id?: number;
  price: string;
  base_amount: string;
  taker_side: 'buy' | 'sell' | string;
  created_at: string;
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

type AggregatedPoint = {
  time: Time;
  value: number;
};

type VolumePoint = AggregatedPoint & { color: string };

const DEFAULT_VOLUME_COLOR = 'rgba(148, 163, 184, 0.55)';

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
  const priceSeriesRef = useRef<ISeriesApi<'Area', Time> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram', Time> | null>(null);

  const [timeframe, setTimeframe] = useState<Timeframe>('1h');

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

  const chartData = useMemo(() => {
    if (!enabled || !filtered.length) {
      return {
        pricePoints: [] as AggregatedPoint[],
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

    const now = Date.now();
    const windowMs = toMillis(timeframe);
    const start = Math.max(now - windowMs, new Date(filtered[0].created_at).getTime());
    const bucketCount = 24;
    const bucketMs = Math.max(Math.floor(windowMs / bucketCount), 60 * 1000);

    let cursor = 0;
    let lastPrice = safeDecimal(filtered[0].price).toNumber();
    const pricePoints: AggregatedPoint[] = [];
    const volumePoints: VolumePoint[] = [];
    let buyVolume = new Decimal(0);
    let sellVolume = new Decimal(0);
    let vwapNumerator = new Decimal(0);
    let totalVolume = new Decimal(0);

    for (let bucketStart = start; bucketStart <= now; bucketStart += bucketMs) {
      const bucketEnd = bucketStart + bucketMs;
      const bucketTrades: TradePoint[] = [];
      while (cursor < filtered.length) {
        const tradeTime = new Date(filtered[cursor].created_at).getTime();
        if (tradeTime >= bucketEnd) break;
        bucketTrades.push(filtered[cursor]);
        cursor += 1;
      }

      if (bucketTrades.length) {
        const closingTrade = bucketTrades[bucketTrades.length - 1];
        lastPrice = safeDecimal(closingTrade.price).toNumber();
      }

      const bucketVolume = bucketTrades.reduce(
        (acc, trade) => {
          const amount = safeDecimal(trade.base_amount);
          const side = trade.taker_side?.toLowerCase() === 'sell' ? 'sell' : 'buy';
          if (side === 'sell') {
            acc.sell = acc.sell.plus(amount);
          } else {
            acc.buy = acc.buy.plus(amount);
          }
          vwapNumerator = vwapNumerator.plus(safeDecimal(trade.price).mul(amount));
          totalVolume = totalVolume.plus(amount);
          return acc;
        },
        { buy: new Decimal(0), sell: new Decimal(0) }
      );

      buyVolume = buyVolume.plus(bucketVolume.buy);
      sellVolume = sellVolume.plus(bucketVolume.sell);

      const netVolume = bucketVolume.buy.minus(bucketVolume.sell);
      const color = netVolume.greaterThanOrEqualTo(0)
        ? 'rgba(52, 211, 153, 0.65)'
        : 'rgba(248, 113, 113, 0.65)';

      const pointTime = Math.floor(bucketEnd / 1000) as Time;

      pricePoints.push({ time: pointTime, value: lastPrice });
      volumePoints.push({
        time: pointTime,
        value: netVolume.toNumber(),
        color: bucketTrades.length ? color : DEFAULT_VOLUME_COLOR,
      });
    }

    const highs = pricePoints.map((p) => p.value);
    const high = highs.length ? Math.max(...highs) : null;
    const low = highs.length ? Math.min(...highs) : null;
    const vwap = totalVolume.gt(0) ? vwapNumerator.div(totalVolume).toNumber() : lastPrice;

    return {
      pricePoints,
      volumePoints,
      stats: {
        high,
        low,
        vwap,
        buyVolume: buyVolume.toNumber(),
        sellVolume: sellVolume.toNumber(),
        lastPrice,
        lastUpdate: new Date(filtered[filtered.length - 1].created_at).getTime(),
      },
    };
  }, [enabled, filtered, timeframe]);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#e2e8f0' },
      rightPriceScale: { borderVisible: false },
      leftPriceScale: { borderVisible: false, visible: false },
      timeScale: { borderVisible: false, secondsVisible: false },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      crosshair: { mode: 0 },
    });

    const area = chart.addSeries(AreaSeries, {
      lineColor: '#7dd3fc',
      topColor: 'rgba(125, 211, 252, 0.35)',
      bottomColor: 'rgba(14, 165, 233, 0.08)',
      priceLineVisible: false,
    });
    const histogram = chart.addSeries(HistogramSeries, {
      priceScaleId: 'volume',
      priceFormat: { type: 'volume' },
      base: 0,
    });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.75, bottom: 0 } });

    chartRef.current = chart;
    priceSeriesRef.current = area;
    volumeSeriesRef.current = histogram;

    const resize = () => {
      if (!containerRef.current) return;
      const { clientWidth, clientHeight } = containerRef.current;
      chart.applyOptions({ width: clientWidth, height: Math.max(clientHeight, 220) });
    };
    resize();

    const observer = new ResizeObserver(() => resize());
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      priceSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current || !priceSeriesRef.current || !volumeSeriesRef.current) return;
    priceSeriesRef.current.setData(chartData.pricePoints);
    volumeSeriesRef.current.setData(chartData.volumePoints);
    chartRef.current.timeScale().fitContent();
  }, [chartData]);

  const timeframeButtons: { value: Timeframe; label: string }[] = [
    { value: '5m', label: t.spotTrade.chart.timeframes['5m'] },
    { value: '1h', label: t.spotTrade.chart.timeframes['1h'] },
    { value: '1d', label: t.spotTrade.chart.timeframes['1d'] },
  ];

  const flowTotal = Math.max(chartData.stats.buyVolume + chartData.stats.sellVolume, 0.00001);
  const buyBiasPercent = Math.min(100, Math.max(0, (chartData.stats.buyVolume / flowTotal) * 100));
  const sellBiasPercent = 100 - buyBiasPercent;

  const locale = lang === 'ar' ? 'ar-EG' : 'en-US';

  return (
    <div className="bg-white/5 rounded-xl p-4 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="text-sm font-semibold opacity-80">{title}</div>
          {pairLabel && <div className="text-xs opacity-70">{pairLabel}</div>}
          <div className="text-[11px] text-white/60">
            {t.spotTrade.chart.updated}:{' '}
            {chartData.stats.lastUpdate ? formatUpdateTimestamp(chartData.stats.lastUpdate, locale) : t.spotTrade.chart.updatedNever}
          </div>
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
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <div className="lg:col-span-3 relative h-[55vw] min-h-[240px] sm:h-80 overflow-hidden rounded-lg border border-white/10 bg-gradient-to-b from-white/5 to-black/40">
          <div ref={containerRef} className="absolute inset-0 w-full h-full" />
          {(!enabled || !chartData.pricePoints.length) && (
            <div className="absolute inset-0 flex items-center justify-center text-xs opacity-70">{emptyLabel}</div>
          )}
        </div>

        <div className="space-y-3">
          <div className="rounded-lg bg-white/5 border border-white/10 p-3 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="opacity-70">{t.spotTrade.chart.high}</span>
              <span className="font-semibold">{chartData.stats.high ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="opacity-70">{t.spotTrade.chart.low}</span>
              <span className="font-semibold">{chartData.stats.low ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="opacity-70">{t.spotTrade.chart.vwap}</span>
              <span className="font-semibold">{chartData.stats.vwap ? chartData.stats.vwap.toFixed(4) : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="opacity-70">{t.spotTrade.lastPrice}</span>
              <span className="font-semibold">{chartData.stats.lastPrice ?? '—'}</span>
            </div>
          </div>

          <div className="rounded-lg bg-white/5 border border-white/10 p-3 text-xs space-y-2">
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
            <div className="flex justify-between">
              <span className="text-green-300">{t.spotTrade.chart.buyers}</span>
              <span className="text-red-300">{t.spotTrade.chart.sellers}</span>
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
