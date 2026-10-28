import type { IndicatorSpec } from './indicatorCompute';

const pineOnly = (indicators: IndicatorSpec[]) => indicators.filter((i) => i.kind === 'pine');

/**
 * The selected Pine indicator id after `removedId` leaves `indicators` (the list before the removal).
 * Removing the selected one picks the next Pine indicator, else the previous one, else null.
 */
export function nextPineSelection(indicators: IndicatorSpec[], selectedId: string | null, removedId: string): string | null {
  const pines = pineOnly(indicators);
  if (selectedId !== removedId) return pines.some((i) => i.id === selectedId && i.id !== removedId) ? selectedId : (pines.find((i) => i.id !== removedId)?.id ?? null);
  const at = pines.findIndex((i) => i.id === removedId);
  if (at < 0) return pines[0]?.id ?? null;
  return (pines[at + 1] ?? pines[at - 1])?.id ?? null;
}

/** The Pine indicator the tab shows: the selected one, else the first Pine indicator, else null. */
export function resolvePineSelection(indicators: IndicatorSpec[], selectedId: string | null): string | null {
  const pines = pineOnly(indicators);
  return pines.find((i) => i.id === selectedId)?.id ?? pines[0]?.id ?? null;
}
