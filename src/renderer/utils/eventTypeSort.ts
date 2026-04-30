// Helpers for ordering event-type lists in pickers/dropdowns.
//
// The user can choose between two orders via the per-database setting
// `event_type_sort` (BENGT #1, #3):
// - 'alphabetical' — default; sorts by the localised label (Swedish/English)
// - 'canonical'    — preserves the order in EVENT_TYPE_VALUES (life-arc order:
//                    birth → death → marriage → ... → other)

export type EventTypeSortMode = 'alphabetical' | 'canonical';

export function isEventTypeSortMode(v: unknown): v is EventTypeSortMode {
  return v === 'alphabetical' || v === 'canonical';
}

/**
 * Sorts event types by their localised label when mode is 'alphabetical'.
 * Returns the input array unchanged when mode is 'canonical'.
 *
 * `labelFor` should resolve a value to the same string the UI displays —
 * typically `(t) => i18n.t('eventTypes.' + t)`.
 */
export function sortEventTypes<T extends string>(
  types: readonly T[],
  mode: EventTypeSortMode,
  labelFor: (type: T) => string,
): T[] {
  if (mode === 'canonical') return [...types];
  return [...types].sort((a, b) =>
    labelFor(a).localeCompare(labelFor(b), undefined, { sensitivity: 'base' }),
  );
}
