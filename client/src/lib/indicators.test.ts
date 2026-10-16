import { describe, expect, it } from 'vitest';
import { bollinger, crossover, ema, highest, lowest, macd, rsi, sma, stdev, vwap } from './indicators';
import type { Candle } from '../types';

describe('sma', () => {
  it('computes rolling means with null warm-up', () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });
});

describe('ema', () => {
  it('seeds with the SMA and then smooths', () => {
    expect(ema([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  it('reacts faster than SMA to a new price', () => {
    const values = [10, 10, 10, 10, 10, 10, 10, 10, 10, 20];
    const e = ema(values, 5)[values.length - 1] as number;
    const s = sma(values, 5)[values.length - 1] as number;
    expect(e).toBeGreaterThan(s);
  });
});

describe('rsi', () => {
  it('is 100 on a straight uptrend', () => {
    const values = Array.from({ length: 30 }, (_, i) => i + 1);
    expect(rsi(values, 14)[14]).toBeCloseTo(100, 6);
  });

  it('is 0 on a straight downtrend', () => {
    const values = Array.from({ length: 30 }, (_, i) => 100 - i);
    expect(rsi(values, 14)[14]).toBeCloseTo(0, 6);
  });
});

describe('bollinger', () => {
  it('centres on the SMA with population standard deviation bands', () => {
    const values = [1, 2, 3, 4, 5];
    const { upper, middle, lower } = bollinger(values, 5, 2);
    expect(middle[4]).toBe(3);
    const sd = Math.sqrt(2); // population sd of 1..5
    expect(upper[4]).toBeCloseTo(3 + 2 * sd, 6);
    expect(lower[4]).toBeCloseTo(3 - 2 * sd, 6);
  });
});

describe('macd', () => {
  it('histogram equals macd minus signal where both exist', () => {
    const values = Array.from({ length: 120 }, (_, i) => 100 + Math.sin(i / 7) * 10 + i * 0.1);
    const { macd: line, signal, histogram } = macd(values, 12, 26, 9);
    const i = 100;
    expect(line[i]).not.toBeNull();
    expect(signal[i]).not.toBeNull();
    expect(histogram[i] as number).toBeCloseTo((line[i] as number) - (signal[i] as number), 9);
  });
});

describe('atr / stdev / channel helpers', () => {
  it('highest and lowest track rolling extremes', () => {
    expect(highest([1, 5, 2, 8, 3], 3)).toEqual([null, null, 5, 8, 8]);
    expect(lowest([1, 5, 2, 8, 3], 3)).toEqual([null, null, 1, 2, 2]);
  });

  it('stdev of a constant series is zero', () => {
    expect(stdev([7, 7, 7, 7], 3)[3]).toBe(0);
  });
});

describe('vwap', () => {
  it('equals the typical price when volume is uniform on one bar', () => {
    const candles: Candle[] = [{ time: 0, open: 10, high: 12, low: 8, close: 10, volume: 5 }];
    expect(vwap(candles, true)[0]).toBeCloseTo((12 + 8 + 10) / 3, 9);
  });
});

describe('crossover', () => {
  it('detects an upwards cross only on the crossing bar', () => {
    const a = [1, 2, 4];
    const b = [3, 3, 3];
    expect(crossover(a, b, 1)).toBe(false);
    expect(crossover(a, b, 2)).toBe(true);
  });
});
