/**
 * CSV import engine.
 *
 * Handles the countless OHLCV CSV dialects people actually have:
 *  - TradingView / Yahoo / Stooq / Binance / MT4 / generic exports
 *  - comma, semicolon, tab or pipe delimited
 *  - with or without a header row
 *  - UNIX seconds / milliseconds / nanoseconds, ISO dates, `YYYYMMDD`,
 *    `dd/mm/yyyy` and American style dates, Excel serials
 *  - separate DATE + TIME columns (MT4 style, often wrapped in <>)
 */
import Papa from 'papaparse';
import { barLabelFromSeconds } from './format';
import type { Candle } from '../types';

export interface ColumnMapping {
  /** Index of a date column when date and time are split, else -1. */
  date: number;
  /** Index of the timestamp column (or time-of-day column when `date` >= 0). */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CsvAnalysis {
  delimiter: string;
  hasHeader: boolean;
  /** Column names when a header was detected (synthesised otherwise). */
  header: string[];
  /** Data rows (header excluded). */
  rows: string[][];
  /** First few raw rows for the preview table (header included when present). */
  preview: string[][];
  mapping: ColumnMapping;
  dayFirst: boolean;
  warnings: string[];
}

export interface CsvBuildResult {
  candles: Candle[];
  warnings: string[];
  dropped: number;
  adjusted: number;
  barSeconds: number;
  barLabel: string;
}

export interface CsvBuildOptions {
  dayFirst?: boolean;
  mapping?: Partial<ColumnMapping>;
}

export interface CsvAnalyzeOptions {
  /** Force a delimiter (auto-detected when omitted). */
  delimiter?: string;
  /** Force header presence (auto-detected when omitted). */
  hasHeader?: boolean;
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Full timestamp column names (a plain "date" is not a full timestamp when split columns exist). */
const TIME_NAMES = ['time', 'timestamp', 'datetime', 'opentime', 'candletime', 'unix', 'unixtime', 'epoch', 'ts', 'opentimestamp'];
const DATE_NAMES = ['date', 'day'];
const OPEN_NAMES = ['open', 'openprice', 'o'];
const HIGH_NAMES = ['high', 'highprice', 'h'];
const LOW_NAMES = ['low', 'lowprice', 'l'];
const CLOSE_NAMES = ['close', 'closeprice', 'last', 'price', 'adjclose', 'settle', 'c'];
const VOLUME_NAMES = ['volume', 'vol', 'v', 'basevolume', 'totalvolume', 'tickvol', 'realvolume'];

function matchName(name: string, candidates: string[]): boolean {
  const n = norm(name);
  return candidates.includes(n);
}

const numericLike = (s: string): boolean => /^[\s]*[-+]?\d[\d.,eE+\-]*[\s]*$/.test(s);

const cleanCell = (s: string): string => s.trim().replace(/^[<>"']+|[<>"']+$/g, '').trim();

/* ------------------------------------------------------------------ */
/* Timestamp parsing                                                   */
/* ------------------------------------------------------------------ */

/**
 * Parse a timestamp to UNIX seconds. Handles:
 * unix s/ms/ns, YYYYMMDD, Excel serials, ISO-8601, yyyy/mm/dd,
 * dd/mm/yyyy or mm/dd/yyyy (via `dayFirst`).
 */
export function parseTimestamp(raw: string, dayFirst: boolean): number | null {
  const s = cleanCell(raw);
  if (!s) return null;

  // Pure number — unix timestamps of various units, compact dates, Excel serials.
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    if (n >= 1e16) return Math.floor(n / 1e9); // nanoseconds
    if (n >= 1e12) return Math.floor(n / 1e3); // milliseconds
    if (n >= 1e9) return Math.floor(n); // seconds
    if (n >= 1e7 && n < 1e9) {
      // YYYYMMDD (with optional .HHMMSS not handled here)
      const y = Math.floor(n / 10000);
      const m = Math.floor((n % 10000) / 100);
      const d = n % 100;
      if (y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        return Math.floor(Date.UTC(y, m - 1, d) / 1000);
      }
      return null;
    }
    if (n >= 20000 && n <= 80000) {
      // Excel / Google Sheets serial date (days since 1899-12-30)
      return Math.floor((n - 25569) * 86400);
    }
    return null;
  }

  // Explicit timezone info -> let Date.parse deal with it.
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) && /\d{4}-\d{2}-\d{2}T/.test(s)) {
    const t = Date.parse(s);
    return Number.isFinite(t) ? Math.floor(t / 1000) : null;
  }

  // yyyy-mm-dd / yyyy/mm/dd / yyyy.mm.dd  (+ optional time)
  const ymd = /^(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (ymd) {
    const [, y, mo, d, h, mi, se] = ymd;
    const t = Date.UTC(+y, +mo - 1, +d, +(h ?? 0), +(mi ?? 0), +(se ?? 0));
    return Math.floor(t / 1000);
  }

  // dd/mm/yyyy or mm/dd/yyyy (+ optional time)
  const dmy = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (dmy) {
    const a = +dmy[1];
    const b = +dmy[2];
    let y = +dmy[3];
    if (y < 100) y += y < 70 ? 2000 : 1900;
    const month = dayFirst ? b : a;
    const day = dayFirst ? a : b;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const t = Date.UTC(y, month - 1, day, +(dmy[4] ?? 0), +(dmy[5] ?? 0), +(dmy[6] ?? 0));
      return Math.floor(t / 1000);
    }
  }

  // Month names: "15 Jan 2024", "Jan 15 2024"
  const named = Date.parse(s);
  if (Number.isFinite(named)) {
    const sec = Math.floor(named / 1000);
    const year = new Date(sec * 1000).getUTCFullYear();
    if (year >= 1970 && year <= 2200) return sec;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Analysis                                                            */
/* ------------------------------------------------------------------ */

function guessMapping(header: string[], sampleRows: string[][], hasHeader: boolean, warnings: string[]): ColumnMapping {
  const mapping: ColumnMapping = { date: -1, time: -1, open: -1, high: -1, low: -1, close: -1, volume: -1 };

  if (hasHeader) {
    for (let i = 0; i < header.length; i++) {
      const name = header[i];
      if (mapping.date < 0 && matchName(name, DATE_NAMES)) mapping.date = i;
      if (mapping.time < 0 && matchName(name, TIME_NAMES)) mapping.time = i;
      if (mapping.open < 0 && matchName(name, OPEN_NAMES)) mapping.open = i;
      if (mapping.high < 0 && matchName(name, HIGH_NAMES)) mapping.high = i;
      if (mapping.low < 0 && matchName(name, LOW_NAMES)) mapping.low = i;
      if (mapping.close < 0 && matchName(name, CLOSE_NAMES)) mapping.close = i;
      if (mapping.volume < 0 && matchName(name, VOLUME_NAMES)) mapping.volume = i;
    }
    // Reconcile date/time columns:
    //  - split DATE + TIME columns (MT4/MT5 style): keep both
    //  - a single date/datetime column: it becomes the time column
    if (mapping.date >= 0 && mapping.time >= 0 && mapping.date === mapping.time) {
      mapping.date = -1;
    } else if (mapping.date >= 0 && mapping.time < 0) {
      mapping.time = mapping.date;
      mapping.date = -1;
    }
    if (mapping.time < 0 && mapping.date < 0) {
      // Look for a column whose values parse as timestamps.
      for (let i = 0; i < header.length; i++) {
        const vals = sampleRows.slice(0, 5).map((r) => r[i] ?? '');
        if (vals.filter((v) => parseTimestamp(v, false) != null).length >= Math.min(3, vals.length)) {
          mapping.time = i;
          warnings.push(`Using column "${header[i]}" as the timestamp column.`);
          break;
        }
      }
    }
  } else {
    const cols = sampleRows[0]?.length ?? 0;
    if (cols >= 6) {
      mapping.time = 0;
      mapping.open = 1;
      mapping.high = 2;
      mapping.low = 3;
      mapping.close = 4;
      const last = cols - 1;
      const lastLooksNumeric = sampleRows.slice(0, 5).every((r) => numericLike(r[last] ?? ''));
      mapping.volume = lastLooksNumeric ? last : -1;
    } else if (cols === 5) {
      mapping.time = 0;
      mapping.open = 1;
      mapping.high = 2;
      mapping.low = 3;
      mapping.close = 4;
    } else if (cols >= 3) {
      warnings.push('Could not identify OHLC columns from the column count — using first four columns as O/H/L/C.');
      mapping.open = 0;
      mapping.high = 1;
      mapping.low = 2;
      mapping.close = cols > 3 ? 3 : 2;
    }
  }

  // Generic repairs.
  if (mapping.close < 0 && mapping.open >= 0) {
    // Some exports only have OHLC without close label — no auto fix.
  }
  const missing: string[] = [];
  if (mapping.time < 0 && mapping.date < 0) missing.push('timestamp');
  if (mapping.open < 0) missing.push('open');
  if (mapping.high < 0) missing.push('high');
  if (mapping.low < 0) missing.push('low');
  if (mapping.close < 0) missing.push('close');
  if (missing.length > 0) warnings.push(`Missing column(s): ${missing.join(', ')} — assign them manually.`);
  return mapping;
}

function inferDayFirst(rows: string[][], timeCol: number): boolean {
  for (const row of rows.slice(0, 50)) {
    const v = cleanCell(row[timeCol] ?? '');
    const m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/.exec(v);
    if (m) {
      const a = +m[1];
      const b = +m[2];
      if (a > 12 && b <= 12) return true;
      if (b > 12 && a <= 12) return false;
    }
  }
  return false;
}

export function analyzeCsv(text: string, opts: CsvAnalyzeOptions = {}): CsvAnalysis {
  const warnings: string[] = [];
  const parsed = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: 'greedy',
    ...(opts.delimiter ? { delimiter: opts.delimiter } : {}),
  });
  const rows = (parsed.data ?? []).map((r) => r.map((c) => String(c ?? '')));
  if (rows.length < 2) throw new Error('The file does not contain enough rows.');

  const row0 = rows[0];
  const numericFraction = row0.filter((c) => numericLike(c)).length / Math.max(1, row0.length);
  const hasKnownNames = row0.some((c) =>
    [...TIME_NAMES, ...DATE_NAMES, ...OPEN_NAMES, ...HIGH_NAMES, ...LOW_NAMES, ...CLOSE_NAMES, ...VOLUME_NAMES].includes(norm(c)),
  );
  const hasHeader = opts.hasHeader ?? (hasKnownNames || numericFraction < 0.4);

  const header = hasHeader ? rows[0] : row0.map((_, i) => `col${i + 1}`);
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const sample = dataRows.slice(0, 30);

  const mapping = guessMapping(header, sample, hasHeader, warnings);
  const dayFirst = mapping.time >= 0 ? inferDayFirst(dataRows, mapping.time) : false;

  return {
    delimiter: parsed.meta.delimiter ?? ',',
    hasHeader,
    header,
    rows: dataRows,
    preview: rows.slice(0, 9),
    mapping,
    dayFirst,
    warnings,
  };
}

/* ------------------------------------------------------------------ */
/* Building candles                                                    */
/* ------------------------------------------------------------------ */

function parseNum(raw: string | undefined): number | null {
  if (raw == null) return null;
  const s = cleanCell(raw).replace(/%/g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function buildCandles(analysis: CsvAnalysis, opts: CsvBuildOptions = {}): CsvBuildResult {
  const mapping: ColumnMapping = { ...analysis.mapping, ...opts.mapping };
  const dayFirst = opts.dayFirst ?? analysis.dayFirst;
  const warnings: string[] = [];
  let dropped = 0;
  let adjusted = 0;

  if (mapping.open < 0 || mapping.high < 0 || mapping.low < 0 || mapping.close < 0) {
    throw new Error('Open / High / Low / Close columns must all be assigned.');
  }
  if (mapping.time < 0 && mapping.date < 0) {
    throw new Error('A timestamp column must be assigned.');
  }

  const byTime = new Map<number, Candle>();
  for (const row of analysis.rows) {
    let time: number | null = null;
    if (mapping.date >= 0 && mapping.time >= 0 && mapping.date !== mapping.time) {
      const combined = `${cleanCell(row[mapping.date] ?? '')} ${cleanCell(row[mapping.time] ?? '')}`;
      time = parseTimestamp(combined, dayFirst) ?? parseTimestamp(row[mapping.time] ?? '', dayFirst) ?? parseTimestamp(row[mapping.date] ?? '', dayFirst);
    } else {
      const idx = mapping.time >= 0 ? mapping.time : mapping.date;
      time = parseTimestamp(row[idx] ?? '', dayFirst);
    }
    if (time == null) {
      dropped++;
      continue;
    }
    const open = parseNum(row[mapping.open]);
    const high = parseNum(row[mapping.high]);
    const low = parseNum(row[mapping.low]);
    const close = parseNum(row[mapping.close]);
    if (open == null || high == null || low == null || close == null) {
      dropped++;
      continue;
    }
    let h = high;
    let l = low;
    const realMax = Math.max(open, close);
    const realMin = Math.min(open, close);
    if (h < realMax) {
      h = realMax;
      adjusted++;
    }
    if (l > realMin) {
      l = realMin;
      adjusted++;
    }
    if (h < l) {
      dropped++;
      continue;
    }
    const vol = mapping.volume >= 0 ? (parseNum(row[mapping.volume]) ?? 0) : 0;
    byTime.set(time, { time, open, high: h, low: l, close, volume: Math.max(0, vol) });
  }

  const candles = Array.from(byTime.values()).sort((a, b) => a.time - b.time);
  if (candles.length < 2) throw new Error('No valid OHLCV rows could be parsed. Check the column mapping.');
  if (dropped > 0) warnings.push(`${dropped} row(s) skipped (unparseable).`);
  if (adjusted > 0) warnings.push(`${adjusted} value(s) adjusted so high ≥ max(o,c) and low ≤ min(o,c).`);
  const dupes = analysis.rows.length - dropped - candles.length;
  if (dupes > 0) warnings.push(`${dupes} duplicate timestamp(s) collapsed.`);

  // Estimate bar length from the median gap.
  const diffs: number[] = [];
  const step = Math.max(1, Math.floor(candles.length / 2000));
  for (let i = step; i < candles.length; i += step) {
    const d = candles[i].time - candles[i - step].time;
    if (d > 0) diffs.push(d);
  }
  diffs.sort((a, b) => a - b);
  const barSeconds = diffs.length > 0 ? diffs[Math.floor(diffs.length / 2)] : 86400;

  return {
    candles,
    warnings,
    dropped,
    adjusted,
    barSeconds,
    barLabel: barLabelFromSeconds(barSeconds),
  };
}

/** One-shot convenience helper: CSV text in, candles + metadata out. */
export function candlesFromCsvText(text: string): CsvBuildResult & { analysis: CsvAnalysis } {
  const analysis = analyzeCsv(text);
  const result = buildCandles(analysis);
  return { ...result, analysis };
}
