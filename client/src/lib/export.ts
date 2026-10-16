/**
 * CSV / file export helpers (charts as PNG use lightweight-charts directly).
 */
import type { Candle } from '../types';

export function candlesToCsv(candles: Candle[], opts: { isoDates?: boolean } = {}): string {
  const lines = ['time,open,high,low,close,volume'];
  for (const c of candles) {
    const t = opts.isoDates === false ? String(c.time) : new Date(c.time * 1000).toISOString();
    lines.push(`${t},${c.open},${c.high},${c.low},${c.close},${c.volume}`);
  }
  return lines.join('\n');
}

export function rowsToCsv(header: string[], rows: Array<Array<string | number>>): string {
  const esc = (v: string | number): string => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
}

export function downloadFile(name: string, content: string | Blob, mime = 'text/csv'): void {
  const blob = typeof content === 'string' ? new Blob([content], { type: `${mime};charset=utf-8` }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function downloadDataUrl(name: string, dataUrl: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[^\w.\-]+/g, '_').slice(0, 120) || 'export';
}
