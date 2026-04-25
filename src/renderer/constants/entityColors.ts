export interface EntityVisual {
  /** Foreground color — header text, accent buttons, focused borders */
  fg: string;
  /** Header background tint */
  hd: string;
  /** Header bottom border / accent border */
  border: string;
  /** Emoji icon shown in the modal header next to the label */
  icon: string;
  /** i18n key for the entity label (small caps text above the title) */
  labelKey: string;
}

export type EntityType =
  | 'person'
  | 'event'
  | 'source'
  | 'citation'
  | 'place'
  | 'relationship'
  | 'task'
  | 'group'
  | 'name'
  | 'identifier'
  | 'neutral';

export const ENTITY_VISUALS: Record<EntityType, EntityVisual> = {
  person:       { fg: '#4f46e5', hd: '#f5f3ff', border: '#c7d2fe', icon: '👤', labelKey: 'persons.entity' },
  event:        { fg: '#c2410c', hd: '#fff3e8', border: '#fed7aa', icon: '📅', labelKey: 'events.entity' },
  source:       { fg: '#7e22ce', hd: '#faf5ff', border: '#e9d5ff', icon: '📚', labelKey: 'sources.entity' },
  citation:     { fg: '#166534', hd: '#f0fdf4', border: '#bbf7d0', icon: '📖', labelKey: 'citations.entity' },
  place:        { fg: '#0e7490', hd: '#ecfeff', border: '#a5f3fc', icon: '📍', labelKey: 'places.entity' },
  relationship: { fg: '#475569', hd: '#f1f5f9', border: '#cbd5e1', icon: '🔗', labelKey: 'relationships.entity' },
  task:         { fg: '#92400e', hd: '#fffbeb', border: '#fde68a', icon: '📋', labelKey: 'researchTasks.entity' },
  group:        { fg: '#0369a1', hd: '#f0f9ff', border: '#bae6fd', icon: '👥', labelKey: 'groups.entity' },
  name:         { fg: '#475569', hd: '#f9fafb', border: '#e5e7eb', icon: '🏷️', labelKey: 'persons.nameEntity' },
  identifier:   { fg: '#475569', hd: '#f9fafb', border: '#e5e7eb', icon: '🪪', labelKey: 'persons.identifierEntity' },
  /** Generic neutral variant for confirmations, imports, and other non-entity modals */
  neutral:      { fg: '#374151', hd: '#f9fafb', border: '#e5e7eb', icon: '',   labelKey: '' },
};

/** @deprecated use ENTITY_VISUALS — kept for migration compatibility */
export const ENTITY_COLORS = ENTITY_VISUALS;
