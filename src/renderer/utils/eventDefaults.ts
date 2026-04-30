import type { EventTypeValue } from '../constants/eventTypes';

export const DEFAULT_EVENT_LADDER: readonly EventTypeValue[] = [
  'birth', 'death', 'occupation', 'residence',
] as const;

/**
 * Suggests an event type for the "+ Add event" form.
 *
 * When smart defaults are off, returns '' so the picker starts blank
 * (BENGT #28b — never pre-select the last-used type).
 *
 * When smart defaults are on, returns the next missing type from the ladder
 * (birth → death → occupation → residence).
 */
export function suggestNextEventType(
  existingEventTypes: readonly string[],
  smartDefaultsEnabled: boolean,
): EventTypeValue | '' {
  if (!smartDefaultsEnabled) return '';
  const existing = new Set(existingEventTypes);
  for (const t of DEFAULT_EVENT_LADDER) {
    if (!existing.has(t)) return t;
  }
  return '';
}
