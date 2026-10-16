/**
 * High-level backtest runner: signals -> engine -> metrics. Used by the
 * Web Worker and directly by tests.
 */
import type { Candle } from '../../types';
import { runBacktest } from './engine';
import { computeMetrics } from './metrics';
import { buildSignals } from './strategies';
import type { BacktestConfig, BacktestResult } from './types';

export function runFullBacktest(candles: Candle[], config: BacktestConfig): BacktestResult {
  if (candles.length < 3) throw new Error('Not enough data to run a backtest (need at least 3 bars).');
  const signals = buildSignals(candles, config.strategyId, config.params ?? {}, config.customCode);
  const { trades, equity, exposureBars } = runBacktest(candles, signals, config);
  const metrics = computeMetrics(candles, equity, trades, config.initialCapital, exposureBars);
  return { trades, equity, metrics, config, signals };
}
