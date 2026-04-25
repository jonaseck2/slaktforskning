import { reactive } from 'vue';

export interface PersonPanelSections {
  person: boolean;
  names: boolean;
  events: boolean;
  timeline: boolean;
  map: boolean;
  relationships: boolean;
  groups: boolean;
  research: boolean;
  identifiers: boolean;
  media: boolean;
  mediaTimeline: boolean;
  quality: boolean;
}

const STORAGE_PREFIX = 'viz-panel-section-';

function loadSection(key: string, defaultValue: boolean): boolean {
  const v = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
  return v === null ? defaultValue : v === 'true';
}

const SECTION_DEFAULTS: Record<keyof PersonPanelSections, boolean> = {
  person: false,
  names: false,
  events: true,
  timeline: false,
  map: false,
  relationships: true,
  groups: false,
  research: false,
  identifiers: false,
  media: false,
  mediaTimeline: false,
  quality: false,
};

// In static-website-export mode, default everything open — visitors are
// browsing, not curating, so collapsed sections just hide content from them.
// Quality and research-tasks stay closed since they're researcher-facing.
const STATIC_DEFAULTS: Record<keyof PersonPanelSections, boolean> = {
  person: true,
  names: true,
  events: true,
  timeline: true,
  map: true,
  relationships: true,
  groups: true,
  research: false,
  identifiers: true,
  media: true,
  mediaTimeline: true,
  quality: false,
};

const isStaticMode = import.meta.env.VITE_STATIC_MODE === 'true';

export function useSectionState() {
  const defaults = isStaticMode ? STATIC_DEFAULTS : SECTION_DEFAULTS;
  const sections = reactive<PersonPanelSections>(
    Object.fromEntries(
      Object.entries(defaults).map(([key, def]) => [key, isStaticMode ? def : loadSection(key, def)])
    ) as PersonPanelSections
  );

  function toggleSection(key: keyof PersonPanelSections) {
    sections[key] = !sections[key];
    localStorage.setItem(`${STORAGE_PREFIX}${key}`, String(sections[key]));
  }

  return { sections, toggleSection };
}
