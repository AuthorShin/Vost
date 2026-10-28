import { describe, expect, it } from 'vitest';
import type { IndicatorSpec } from './indicatorCompute';
import { nextPineSelection, resolvePineSelection } from './pineSelection';

const ind = (id: string, kind: IndicatorSpec['kind'] = 'pine'): IndicatorSpec => ({ id, kind, params: {}, color: '#fff', visible: true });
const list = [ind('a'), ind('s', 'sma'), ind('b'), ind('c')];

describe('nextPineSelection', () => {
  it('selects the next Pine indicator when the selected one is removed', () => {
    expect(nextPineSelection(list, 'a', 'a')).toBe('b');
    expect(nextPineSelection(list, 'b', 'b')).toBe('c');
  });
  it('selects the previous one when the removed one was last', () => {
    expect(nextPineSelection(list, 'c', 'c')).toBe('b');
  });
  it('keeps the selection when another indicator is removed', () => {
    expect(nextPineSelection(list, 'b', 'a')).toBe('b');
    expect(nextPineSelection(list, 'b', 's')).toBe('b');
  });
  it('gives null when the last Pine indicator is removed', () => {
    expect(nextPineSelection([ind('a'), ind('s', 'sma')], 'a', 'a')).toBeNull();
  });
  it('never selects a non-Pine indicator', () => {
    expect(nextPineSelection([ind('a'), ind('s', 'sma')], 'a', 'a')).not.toBe('s');
    expect(nextPineSelection([ind('s', 'sma'), ind('a')], 'a', 'a')).toBeNull();
  });
});

describe('resolvePineSelection', () => {
  it('keeps a valid selection', () => {
    expect(resolvePineSelection(list, 'c')).toBe('c');
  });
  it('falls back to the first Pine indicator for a stale or missing id', () => {
    expect(resolvePineSelection(list, 'gone')).toBe('a');
    expect(resolvePineSelection(list, null)).toBe('a');
    expect(resolvePineSelection(list, 's')).toBe('a');
  });
  it('gives null with no Pine indicator', () => {
    expect(resolvePineSelection([ind('s', 'sma')], null)).toBeNull();
  });
});
