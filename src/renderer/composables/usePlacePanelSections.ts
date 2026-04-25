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

// In static-website-export mode, default sections open so visitors see content
// without having to expand each section. Quality stays closed (researcher view).
const STATIC_DEFAULTS: Record<keyof PlacePanelSections, boolean> = {
  place: true,
  address: true,
  children: true,
  persons: true,
  events: true,
  citations: true,
  media: true,
  mediaTimeline: true,
  quality: false,
};

const isStaticMode = import.meta.env.VITE_STATIC_MODE === 'true';

export function usePlacePanelSections() {
  const defaults = isStaticMode ? STATIC_DEFAULTS : SECTION_DEFAULTS;
  const sections = reactive<PlacePanelSections>(
    Object.fromEntries(
      Object.entries(defaults).map(([key, def]) => [key, isStaticMode ? def : loadSection(key, def)])
    ) as PlacePanelSections
  );

  function toggleSection(key: keyof PlacePanelSections) {
    sections[key] = !sections[key];
    localStorage.setItem(`${STORAGE_PREFIX}${key}`, String(sections[key]));
  }

  return { sections, toggleSection };
}
