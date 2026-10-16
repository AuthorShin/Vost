import {
  AreaSeries,
  ColorType,
  HistogramSeries,
  LineStyle,
  createChart,
  type UTCTimestamp,
} from 'lightweight-charts';
import { useEffect, useRef } from 'react';
import type { BacktestResult } from '../lib/backtest/types';

export function EquityChart({ result }: { result: BacktestResult }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const positive = result.metrics.totalReturnPct >= 0;
    const mainColor = positive ? '#22c55e' : '#ef4444';

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#8b94a7',
        fontSize: 10,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.03)' },
        horzLines: { color: 'rgba(255,255,255,0.03)' },
      },
      rightPriceScale: { borderColor: '#1e2433' },
      timeScale: { borderColor: '#1e2433', timeVisible: true, secondsVisible: false },
      crosshair: { vertLine: { color: 'rgba(139,148,167,0.4)' }, horzLine: { color: 'rgba(139,148,167,0.4)' } },
    });

    const equitySeries = chart.addSeries(AreaSeries, {
      lineColor: mainColor,
      topColor: positive ? 'rgba(34,197,94,0.28)' : 'rgba(239,68,68,0.28)',
      bottomColor: 'rgba(0,0,0,0)',
      lineWidth: 2,
      priceLineVisible: false,
    });

    equitySeries.setData(
      result.equity.map((p) => ({ time: p.time as UTCTimestamp, value: p.equity })),
    );
    equitySeries.createPriceLine({
      price: result.metrics.initialCapital,
      color: 'rgba(139,148,167,0.7)',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: 'initial',
    });

    chart.addPane();
    const ddSeries = chart.addSeries(
      HistogramSeries,
      {
        color: 'rgba(239,68,68,0.55)',
        priceFormat: { type: 'custom', formatter: (v: number) => `${v.toFixed(1)}%` },
        priceLineVisible: false,
        lastValueVisible: false,
      },
      1,
    );
    ddSeries.setData(result.equity.map((p) => ({ time: p.time as UTCTimestamp, value: p.drawdownPct })));

    const panes = chart.panes();
    if (panes[0]) panes[0].setStretchFactor(3);
    if (panes[1]) panes[1].setStretchFactor(1);

    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [result]);

  return <div ref={ref} style={{ height: 240, width: '100%' }} />;
}
