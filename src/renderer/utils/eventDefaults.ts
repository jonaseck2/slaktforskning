import type { EventTypeValue } from '../constants/eventTypes';

export const DEFAULT_EVENT_LADDER: readonly EventTypeValue[] = [
  'birth', 'death', 'occupation', 'residence',
] as const;

export function suggestNextEventType(
  existingEventTypes: readonly string[],
  smartDefaultsEnabled: boolean,
): EventTypeValue {
  if (!smartDefaultsEnabled) return 'birth';
  const existing = new Set(existingEventTypes);
  for (const t of DEFAULT_EVENT_LADDER) {
    if (!existing.has(t)) return t;
  }
  return 'residence';
}
