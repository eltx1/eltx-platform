'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { IChartApi, ISeriesApi, LineData, UTCTimestamp } from 'lightweight-charts';
import { ColorType, createChart } from 'lightweight-charts';

type TradePoint = {
  price: string;
  created_at: string;
};

type SpotMarketChartProps = {
  symbol?: string;
  baseAsset?: string | null;
  quoteAsset?: string | null;
  trades: TradePoint[];
  title: string;
  emptyLabel: string;
};

export default function SpotMarketChart({
  symbol,
  baseAsset,
  quoteAsset,
  trades,
  title,
  emptyLabel,
}: SpotMarketChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);

  const data = useMemo<LineData[]>(() => {
    return trades
      .map((trade) => {
        const value = Number(trade.price);
        if (!Number.isFinite(value)) return null;
        const timestamp = Math.floor(new Date(trade.created_at).getTime() / 1000);
        if (!Number.isFinite(timestamp)) return null;
        return { time: timestamp as UTCTimestamp, value };
      })
      .filter((point): point is LineData => point !== null)
      .sort((a, b) => Number(a.time) - Number(b.time));
  }, [trades]);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const chart = createChart(container, {
      width: container.clientWidth || 0,
      height: container.clientHeight || 260,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#e2e8f0',
      },
      grid: {
        vertLines: { color: 'rgba(148, 163, 184, 0.12)' },
        horzLines: { color: 'rgba(148, 163, 184, 0.12)' },
      },
      timeScale: { borderColor: 'rgba(148, 163, 184, 0.2)' },
      rightPriceScale: { borderColor: 'rgba(148, 163, 184, 0.2)' },
      crosshair: {
        vertLine: { color: 'rgba(226, 232, 240, 0.2)', width: 1, style: 0 },
        horzLine: { color: 'rgba(226, 232, 240, 0.2)', width: 1, style: 0 },
      },
    });
    const series = chart.addAreaSeries({
      lineColor: '#38bdf8',
      topColor: 'rgba(56, 189, 248, 0.25)',
      bottomColor: 'rgba(56, 189, 248, 0.05)',
      lineWidth: 2,
    });
    chartRef.current = chart;
    seriesRef.current = series;

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
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current) return;
    if (data.length > 0) {
      seriesRef.current.setData(data);
      chartRef.current?.timeScale().fitContent();
    } else {
      seriesRef.current.setData([]);
    }
  }, [data]);

  const pairLabel = useMemo(() => {
    if (baseAsset && quoteAsset) return `${baseAsset}/${quoteAsset}`;
    if (symbol) return symbol;
    return null;
  }, [baseAsset, quoteAsset, symbol]);

  const hasData = data.length > 0;

  return (
    <div className="bg-white/5 rounded p-3 space-y-2">
      <div className="flex items-center justify-between text-sm font-semibold opacity-80">
        <span>{title}</span>
        {pairLabel && <span className="text-xs opacity-70">{pairLabel}</span>}
      </div>
      <div className="relative h-64">
        <div ref={containerRef} className="absolute inset-0" />
        {!hasData && (
          <div className="absolute inset-0 flex items-center justify-center text-xs opacity-70">
            {emptyLabel}
          </div>
        )}
      </div>
    </div>
  );
}
