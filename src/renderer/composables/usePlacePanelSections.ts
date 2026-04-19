import { reactive } from 'vue';

export interface PlacePanelSections {
  place: boolean;
  address: boolean;
  children: boolean;
  persons: boolean;
  events: boolean;
  citations: boolean;
  media: boolean;
  mediaTimeline: boolean;
  quality: boolean;
}

const STORAGE_PREFIX = 'map-panel-section-';

function loadSection(key: string, defaultValue: boolean): boolean {
  const v = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
  return v === null ? defaultValue : v === 'true';
}

const SECTION_DEFAULTS: Record<keyof PlacePanelSections, boolean> = {
  place: true,
  address: false,
  children: false,
  persons: true,
  events: true,
  citations: false,
  media: false,
  mediaTimeline: false,
  quality: false,
};

export function usePlacePanelSections() {
  const sections = reactive<PlacePanelSections>(
    Object.fromEntries(
      Object.entries(SECTION_DEFAULTS).map(([key, def]) => [key, loadSection(key, def)])
    ) as PlacePanelSections
  );

  function toggleSection(key: keyof PlacePanelSections) {
    sections[key] = !sections[key];
    localStorage.setItem(`${STORAGE_PREFIX}${key}`, String(sections[key]));
  }

  return { sections, toggleSection };
}
