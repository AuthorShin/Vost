/**
 * Integration test: the example CSV files shipped in /examples must parse
 * cleanly with the auto-detection in lib/csv.ts.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { candlesFromCsvText } from './csv';

const read = (name: string) => readFileSync(fileURLToPath(new URL(`../../../examples/${name}`, import.meta.url)), 'utf8');

describe('bundled example files', () => {
  it('parses sample-daily.csv (standard header, ISO dates)', () => {
    const built = candlesFromCsvText(read('sample-daily.csv'));
    expect(built.candles.length).toBeGreaterThan(100);
    expect(built.barLabel).toBe('1d');
    expect(built.candles[0].high).toBeGreaterThanOrEqual(built.candles[0].close);
    expect(built.candles[0].low).toBeLessThanOrEqual(built.candles[0].close);
  });

  it('parses sample-mt5-format.csv (tabs, split DATE/TIME, dots)', () => {
    const built = candlesFromCsvText(read('sample-mt5-format.csv'));
    expect(built.analysis.mapping.date).toBe(0);
    expect(built.analysis.mapping.time).toBe(1);
    expect(built.candles.length).toBeGreaterThan(300);
    expect(built.barLabel).toBe('30m');
  });
});
