/**
 * Core domain types shared across the app.
 */

/** One OHLCV bar. `time` is a UNIX timestamp in **seconds** (UTC). */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Timeframes understood by the app. Not every provider supports every timeframe. */
export const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M'] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

/** Human label for a detected/synthetic timeframe. */
export interface DatasetInfo {
  /** Estimated bar length in seconds. */
  barSeconds: number;
  /** Human label, e.g. "1h", "13m", "3d", "custom". */
  label: string;
}

/** A locally stored dataset (CSV import, saved fetch, demo data...). */
export interface Dataset {
  id: string;
  name: string;
  /** Where it came from: provider id, "csv", "demo"... */
  source: string;
  createdAt: number;
  /** e.g. "Binance • BTCUSDT • 1h" or file name. */
  description: string;
  barSeconds: number;
  barLabel: string;
  candles: Candle[];
}

export type Series = Array<number | null>;

export function uid(prefix = ''): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
