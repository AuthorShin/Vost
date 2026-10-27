/**
 * The fake market: one deterministic price curve per symbol that every
 * provider's REST payload and live frame is cut from, so history and the live
 * candle line up whichever provider and symbol the browser picks.
 */

/** Seconds per Vost timeframe (a month is 30 days; the fake does not align calendars). */
export const TIMEFRAME_SECONDS: Record<string, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
  '1w': 604800,
  '1M': 2592000,
};

/** How many bars of history the fake has behind "now", for any timeframe. */
export const DEPTH_BARS = 1500;

export interface Bar {
  /** Open time, unix seconds. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const COIN_PRICE: Record<string, number> = { BTC: 60000, ETH: 3000, SOL: 150, BNB: 600, XRP: 0.6, DOGE: 0.15 };

/** `XBTUSD`, `BTC/USD`, `btc-usdt` and `BTCUSDT` are one market. */
function normalize(symbol: string): string {
  return symbol
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^XBT/, 'BTC')
    .replace(/^XDG/, 'DOGE');
}

function basePrice(symbol: string): number {
  const norm = normalize(symbol);
  for (const [coin, price] of Object.entries(COIN_PRICE)) if (norm.startsWith(coin)) return price;
  let h = 7;
  for (const ch of norm) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  return 20 + (h % 480);
}

/** The price at unix second `t`: a slow wave and a faster one around the symbol's base. */
function priceAt(symbol: string, t: number, step: number): number {
  const base = basePrice(symbol);
  return base * (1 + 0.05 * Math.sin(t / (step * 40)) + 0.012 * Math.sin(t / (step * 7)));
}

const round = (n: number): number => Number(n.toPrecision(8));

/** Bumped by the live feed on every push: the forming candle's close moves with it. */
const live = { tick: 0 };
export function advanceTick(): number {
  return ++live.tick;
}

/** The candle opening at `time` (a multiple of `step`); the one still forming gets a close that moves with the tick. */
export function barAt(symbol: string, time: number, step: number, nowSec: number): Bar {
  const open = priceAt(symbol, time, step);
  const forming = time + step > nowSec;
  const close = forming ? priceAt(symbol, time, step) * (1 + 0.004 * Math.sin(live.tick * 0.7)) : priceAt(symbol, time + step, step);
  const mid = priceAt(symbol, time + step / 2, step);
  const high = Math.max(open, close, mid) * 1.002;
  const low = Math.min(open, close, mid) * 0.998;
  const volume = 100 + 50 * Math.sin(time / (step * 3)) + (time / step) % 17;
  return { time, open: round(open), high: round(high), low: round(low), close: round(close), volume: round(volume) };
}

export interface Span {
  step: number;
  /** Oldest open time wanted (inclusive). */
  from?: number;
  /** Newest open time wanted (inclusive). */
  to?: number;
  /** At most this many, newest first kept. */
  limit?: number;
  nowSec: number;
}

/** The open times inside the span that the fake has history for, ascending. */
export function times(span: Span): number[] {
  const { step, nowSec } = span;
  const latest = Math.floor(nowSec / step) * step;
  // Never before 1971: a monthly chart 1500 bars deep would otherwise start before the epoch.
  const oldest = Math.max(latest - (DEPTH_BARS - 1) * step, Math.ceil((365 * 86400) / step) * step);
  const top = Math.min(latest, span.to === undefined ? latest : Math.floor(span.to / step) * step);
  const bottom = Math.max(oldest, span.from === undefined ? oldest : Math.ceil(span.from / step) * step);
  const out: number[] = [];
  for (let t = top; t >= bottom && out.length < (span.limit ?? Infinity); t -= step) out.push(t);
  return out.reverse();
}

export function bars(symbol: string, span: Span): Bar[] {
  return times(span).map((t) => barAt(symbol, t, span.step, span.nowSec));
}
