/**
 * Live kline frames in the four live providers' real formats, with the
 * subscribe and ping messages each one speaks. One call to `frame()` per push.
 */
import { barAt, TIMEFRAME_SECONDS } from './data.ts';
import { bybitStep, okxRow, okxStep } from './rest.ts';

/** What one socket asked for. */
export interface Subscription {
  symbol: string;
  step: number;
  /** Builds the frame for the candle forming at `nowSec`. */
  frame(nowSec: number): string;
}

const forming = (symbol: string, step: number, nowSec: number) => barAt(symbol, Math.floor(nowSec / step) * step, step, nowSec);

/** Binance: the stream is chosen by the URL path `/ws/<symbol>@kline_<interval>`. */
export function binanceSubscription(path: string): Subscription | null {
  const m = /^\/ws\/([^@/]+)@kline_([^/?]+)/.exec(path);
  const step = m ? TIMEFRAME_SECONDS[m[2]] : undefined;
  if (!m || !step) return null;
  const symbol = m[1].toUpperCase();
  return {
    symbol,
    step,
    frame(nowSec) {
      const b = forming(symbol, step, nowSec);
      const k = { t: b.time * 1000, T: b.time * 1000 + step * 1000 - 1, s: symbol, i: m[2], o: String(b.open), c: String(b.close), h: String(b.high), l: String(b.low), v: String(b.volume), x: false };
      return JSON.stringify({ e: 'kline', E: nowSec * 1000, s: symbol, k });
    },
  };
}

/** Kraken v2: `{method:'subscribe', params:{channel:'ohlc', symbol:[..], interval:<minutes>}}`. */
export function krakenSubscription(msg: unknown): Subscription | null {
  const m = msg as { method?: string; params?: { channel?: string; symbol?: string[]; interval?: number } };
  if (m?.method !== 'subscribe' || m.params?.channel !== 'ohlc' || !m.params.symbol?.[0] || !m.params.interval) return null;
  const symbol = m.params.symbol[0];
  const step = m.params.interval * 60;
  return {
    symbol,
    step,
    frame(nowSec) {
      const b = forming(symbol, step, nowSec);
      const data = [{ symbol, open: b.open, high: b.high, low: b.low, close: b.close, vwap: b.close, trades: 12, volume: b.volume, interval_begin: new Date(b.time * 1000).toISOString().replace('Z', '000Z'), interval: m.params!.interval, timestamp: new Date(nowSec * 1000).toISOString() }];
      return JSON.stringify({ channel: 'ohlc', type: 'update', timestamp: new Date(nowSec * 1000).toISOString(), data });
    },
  };
}

/** Bybit v5: `{op:'subscribe', args:['kline.<interval>.<symbol>']}`. */
export function bybitSubscription(msg: unknown): Subscription | null {
  const m = msg as { op?: string; args?: string[] };
  const topic = m?.op === 'subscribe' ? m.args?.[0] : undefined;
  const parts = topic?.split('.');
  if (!topic || parts?.[0] !== 'kline' || parts.length !== 3) return null;
  const step = bybitStep(parts[1]);
  if (!step) return null;
  const symbol = parts[2];
  return {
    symbol,
    step,
    frame(nowSec) {
      const b = forming(symbol, step, nowSec);
      const data = [{ start: b.time * 1000, end: b.time * 1000 + step * 1000 - 1, interval: parts[1], open: String(b.open), close: String(b.close), high: String(b.high), low: String(b.low), volume: String(b.volume), turnover: String(b.volume * b.close), confirm: false, timestamp: nowSec * 1000 }];
      return JSON.stringify({ topic, type: 'snapshot', ts: nowSec * 1000, data });
    },
  };
}

/** OKX business: `{op:'subscribe', args:[{channel:'candle<bar>', instId}]}`. */
export function okxSubscription(msg: unknown): Subscription | null {
  const m = msg as { op?: string; args?: Array<{ channel?: string; instId?: string }> };
  const arg = m?.op === 'subscribe' ? m.args?.[0] : undefined;
  const bar = arg?.channel?.startsWith('candle') ? arg.channel.slice('candle'.length) : undefined;
  const step = bar ? okxStep(bar) : undefined;
  if (!arg?.instId || !step) return null;
  const symbol = arg.instId;
  return {
    symbol,
    step,
    frame(nowSec) {
      return JSON.stringify({ arg, data: [okxRow(forming(symbol, step, nowSec), '0')] });
    },
  };
}

/** The reply to a subscribe, per provider (the real services acknowledge it). */
export function subscribeAck(host: string, msg: unknown): string | null {
  if (host === 'ws.kraken.com') return JSON.stringify({ method: 'subscribe', result: (msg as { params?: unknown }).params, success: true });
  if (host === 'stream.bybit.com') return JSON.stringify({ success: true, ret_msg: '', op: 'subscribe' });
  if (host === 'ws.okx.com') return JSON.stringify({ event: 'subscribe', arg: (msg as { args?: unknown[] }).args?.[0] });
  return null;
}
