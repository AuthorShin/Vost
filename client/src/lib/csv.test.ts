import { describe, expect, it } from 'vitest';
import { analyzeCsv, buildCandles, candlesFromCsvText, parseTimestamp } from './csv';

const HEADER_CSV = `Date,Open,High,Low,Close,Volume
2024-01-01,100,105,99,104,1000
2024-01-02,104,110,103,108,1200
2024-01-03,108,112,106,107,900`;

describe('parseTimestamp', () => {
  it('parses ISO dates to UTC seconds', () => {
    expect(parseTimestamp('2024-01-02', false)).toBe(Date.UTC(2024, 0, 2) / 1000);
    expect(parseTimestamp('2024-01-02 09:30:00', false)).toBe(Date.UTC(2024, 0, 2, 9, 30, 0) / 1000);
  });

  it('handles unix seconds, milliseconds, nanoseconds', () => {
    expect(parseTimestamp('1700000000', false)).toBe(1700000000);
    expect(parseTimestamp('1700000000000', false)).toBe(1700000000);
    expect(parseTimestamp('1700000000000000000', false)).toBe(1700000000);
  });

  it('handles compact YYYYMMDD dates', () => {
    expect(parseTimestamp('20240102', false)).toBe(Date.UTC(2024, 0, 2) / 1000);
  });

  it('handles dd/mm/yyyy when day-first is set', () => {
    expect(parseTimestamp('15/01/2024', true)).toBe(Date.UTC(2024, 0, 15) / 1000);
    expect(parseTimestamp('01/15/2024', false)).toBe(Date.UTC(2024, 0, 15) / 1000);
  });

  it('handles Excel serials', () => {
    const t = parseTimestamp('45293', false);
    expect(t).toBe(Date.UTC(2024, 0, 2) / 1000);
  });
});

describe('analyzeCsv + buildCandles', () => {
  it('detects a normal header CSV', () => {
    const analysis = analyzeCsv(HEADER_CSV);
    expect(analysis.hasHeader).toBe(true);
    expect(analysis.mapping.open).toBe(1);
    expect(analysis.mapping.volume).toBe(5);
    const built = buildCandles(analysis);
    expect(built.candles).toHaveLength(3);
    expect(built.candles[0]).toMatchObject({ open: 100, high: 105, low: 99, close: 104, volume: 1000 });
    expect(built.candles[0].time).toBe(Date.UTC(2024, 0, 1) / 1000);
    expect(built.barLabel).toBe('1d');
  });

  it('handles a headerless Binance-style CSV with millisecond timestamps', () => {
    const csv = `1700000000000,100,105,99,104,1000
1700086400000,104,110,103,108,1200`;
    const built = candlesFromCsvText(csv);
    expect(built.candles).toHaveLength(2);
    expect(built.candles[0].time).toBe(1700000000);
    expect(built.analysis.hasHeader).toBe(false);
  });

  it('handles MT4/MT5 tab separated files with split DATE/TIME columns', () => {
    const csv = [
      '<DATE>\t<TIME>\t<OPEN>\t<HIGH>\t<LOW>\t<CLOSE>\t<TICKVOL>',
      '2024.01.02\t09:30\t1.1\t1.2\t1.05\t1.15\t100',
      '2024.01.02\t09:45\t1.15\t1.25\t1.1\t1.2\t120',
    ].join('\n');
    const built = candlesFromCsvText(csv);
    expect(built.analysis.mapping.date).toBe(0);
    expect(built.analysis.mapping.time).toBe(1);
    expect(built.analysis.mapping.open).toBe(2);
    expect(built.candles[0].time).toBe(Date.UTC(2024, 0, 2, 9, 30) / 1000);
    expect(built.candles[0].close).toBe(1.15);
    expect(built.barLabel).toBe('15m');
  });

  it('repairs rows where high < close', () => {
    const csv = `time,open,high,low,close\n2024-01-01 00:00,10,9,8,12\n2024-01-01 01:00,10,11,9,10`;
    const built = candlesFromCsvText(csv);
    expect(built.adjusted).toBeGreaterThan(0);
    expect(built.candles[0].high).toBe(12);
  });

  it('infers day-first ordering from ambiguous dates', () => {
    const csv = `Date,Open,High,Low,Close\n15/01/2024,1,2,0.5,1.5\n16/01/2024,1.5,2,1,1.8`;
    const analysis = analyzeCsv(csv);
    expect(analysis.dayFirst).toBe(true);
    const built = buildCandles(analysis);
    expect(built.candles[0].time).toBe(Date.UTC(2024, 0, 15) / 1000);
  });

  it('collapses duplicate timestamps and sorts ascending', () => {
    const csv = `time,open,high,low,close\n2024-01-02,2,2,2,2\n2024-01-01,1,1,1,1\n2024-01-02,3,3,3,3`;
    const built = candlesFromCsvText(csv);
    expect(built.candles).toHaveLength(2);
    expect(built.candles[0].time).toBeLessThan(built.candles[1].time);
    expect(built.candles[1].close).toBe(3); // last duplicate wins
  });

  it('throws a helpful error when nothing can be parsed', () => {
    expect(() => candlesFromCsvText('hello\nworld')).toThrow();
  });
});
