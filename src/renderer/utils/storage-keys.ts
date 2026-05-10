/**
 * Centralized registry of every localStorage key the renderer reads or writes.
 *
 * Rules:
 * - Every static-string `localStorage.{getItem,setItem,removeItem}` call in
 *   `src/renderer/` must go through this module.
 * - Keys passed as `storageKey` options to single-key helpers
 *   (`usePanelResize`, `useChartZoom`) must come from `STORAGE_KEYS` too —
 *   they map 1:1 to a localStorage entry.
 * - Composables that build dynamic keys from a prefix (`usePanelSections`
 *   appends `-section-<name>-open`; `usePagedList` appends `-sort-by`/
 *   `-sort-dir`) take a string prefix; the prefixes are kept as plain string
 *   literals at the call site to avoid implying they are 1:1 keys.
 * - Use `getJSON` / `setJSON` for any value that is not already a plain string,
 *   so we have a single place to handle parse errors.
 */

export const STORAGE_KEYS = {
  // App-wide preferences
  appearance: 'slaktforskning-appearance',
  darkMode: 'darkMode',
  theme: 'slaktforskning-theme',
  navOrientation: 'slaktforskning-nav-orientation',
  addBtnStyle: 'slaktforskning-add-btn-style',
  textSize: 'textSize',
  lastRoute: 'slaktforskning-last-route',

  // Persons view
  personsListOpen: 'persons-list-open',
  personsListWidth: 'persons-list-width',
  personsPanelOpen: 'persons-panel-open',
  personsPanelWidth: 'persons-panel-width',
  personsVisibleColumns: 'persons-visible-columns',
  vizTab: 'viz-tab',
  vizPanelOpen: 'viz-panel-open',
  vizPanelWidth: 'viz-panel-width',

  // Places view + Map view (shared keys — Places navigates into Map)
  placesListOpen: 'places-list-open',
  placesListWidth: 'places-list-width',
  mapSelectedPlace: 'map-selected-place',
  mapPanelOpen: 'map-panel-open',
  mapPanelWidth: 'map-panel-width',

  // Media view
  mediaListOpen: 'media-list-open',
  mediaListWidth: 'media-list-width',
  mediaPanelOpen: 'media-panel-open',
  mediaPanelWidth: 'media-panel-width',

  // Sources view
  sourcesSelectedId: 'sources-selected-id',
  sourcesPanelOpen: 'sources-panel-open',
  sourcesPanelWidth: 'sources-panel-width',

  // Groups view
  groupsSelectedId: 'groups-selected-id',
  groupsPanelOpen: 'groups-panel-open',
  groupsPanelWidth: 'groups-panel-width',

  // Relationships view
  relsSelectedId: 'rels-selected-id',
  relsPanelOpen: 'rels-panel-open',
  relsPanelWidth: 'rels-panel-width',

  // Research tasks view
  tasksSelectedId: 'tasks-selected-id',
  tasksPanelOpen: 'tasks-panel-open',
  tasksPanelWidth: 'tasks-panel-width',

  // Reports view
  reportsPanelOpen: 'reports-panel-open',
  reportsPanelWidth: 'reports-panel-width',

  // Website export view
  websitePanelOpen: 'website-panel-open',
  websitePanelWidth: 'website-panel-width',

  // Screen reader / TTS mode (with legacy key for migration)
  ttsMode: 'slaktforskning-tts-mode',
  ttsLegacy: 'slaktforskning-tts',

  // Fan chart settings
  fanArcSpan: 'fan-arc-span',
  fanColorMode: 'fan-color-mode',

  // Chart zoom (per chart type)
  vizZoomFan: 'viz-zoom-fan',
  vizZoomHourglass: 'viz-zoom-hourglass',
  vizZoomPedigree: 'viz-zoom-pedigree',
  vizZoomTimeline: 'viz-zoom-timeline',
  vizZoomDescendant: 'viz-zoom-descendant',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

/**
 * The complete set of column keys the persons-list table understands.
 * The four "always-visible" columns (`name`, `birth_date`, `death_date`,
 * `display_id`) anchor the table; the rest are opt-in via the column
 * picker. See plan 2026-05-09-persons-list-aggregate-columns.
 *
 * Persisted as a JSON `string[]` under `STORAGE_KEYS.personsVisibleColumns`.
 */
export type PersonsColumnKey =
  | 'display_id'
  | 'name'
  | 'birth_date'
  | 'death_date'
  | 'sex'
  | 'name_count'
  | 'event_count'
  | 'relationship_count'
  | 'media_count'
  | 'group_count'
  | 'task_count'
  | 'quality_count';

export const PERSONS_DEFAULT_VISIBLE_COLUMNS: PersonsColumnKey[] = [
  'display_id',
  'name',
  'birth_date',
  'death_date',
  'sex',
];

export const PERSONS_LOCKED_COLUMNS: PersonsColumnKey[] = ['name'];

export function getJSON<T>(key: StorageKey, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function setJSON<T>(key: StorageKey, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function removeKey(key: StorageKey): void {
  localStorage.removeItem(key);
}
