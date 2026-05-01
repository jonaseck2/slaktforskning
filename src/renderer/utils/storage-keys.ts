/**
 * Centralized registry of every localStorage key the renderer reads or writes.
 *
 * Rules:
 * - Every static-string `localStorage.{getItem,setItem,removeItem}` call in
 *   `src/renderer/` must go through this module.
 * - Keys passed as `storageKey` options to composables (`usePanelResize`,
 *   `usePanelSections`) must come from `STORAGE_KEYS` too.
 * - Dynamic keys built at runtime (e.g. `usePanelSections` builds
 *   `<prefix>-section-<name>-open` per section) are not in the registry; the
 *   prefix is.
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
  vizTab: 'viz-tab',
  vizPanelOpen: 'viz-panel-open',
  vizPanelWidth: 'viz-panel-width',
  // usePanelSections prefixes (composable appends `-section-<name>-open`):
  personsSectionPrefix: 'persons',

  // Places view + Map view (shared keys — Places navigates into Map)
  placesListOpen: 'places-list-open',
  placesListWidth: 'places-list-width',
  mapSelectedPlace: 'map-selected-place',
  mapPanelOpen: 'map-panel-open',
  mapPanelWidth: 'map-panel-width',
  placesSectionPrefix: 'places',

  // Media view
  mediaListOpen: 'media-list-open',
  mediaListWidth: 'media-list-width',
  mediaPanelOpen: 'media-panel-open',
  mediaPanelWidth: 'media-panel-width',
  mediaSectionPrefix: 'media',

  // Sources view
  sourcesSelectedId: 'sources-selected-id',
  sourcesPanelOpen: 'sources-panel-open',
  sourcesPanelWidth: 'sources-panel-width',
  sourcesSectionPrefix: 'sources',

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
  websitePanelWidth: 'website-panel-width',

  // Fan chart settings
  fanArcSpan: 'fan-arc-span',
  fanColorMode: 'fan-color-mode',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

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
