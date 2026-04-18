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

export function useSectionState() {
  const sections = reactive<PersonPanelSections>(
    Object.fromEntries(
      Object.entries(SECTION_DEFAULTS).map(([key, def]) => [key, loadSection(key, def)])
    ) as PersonPanelSections
  );

  function toggleSection(key: keyof PersonPanelSections) {
    sections[key] = !sections[key];
    localStorage.setItem(`${STORAGE_PREFIX}${key}`, String(sections[key]));
  }

  return { sections, toggleSection };
}
