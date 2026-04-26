export interface EntityMeta {
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

export const ENTITY_META: Record<EntityType, EntityMeta> = {
  person:       { icon: '👤', labelKey: 'persons.entity' },
  event:        { icon: '📅', labelKey: 'events.entity' },
  source:       { icon: '📚', labelKey: 'sources.entity' },
  citation:     { icon: '📖', labelKey: 'citations.entity' },
  place:        { icon: '📍', labelKey: 'places.entity' },
  relationship: { icon: '🔗', labelKey: 'relationships.entity' },
  task:         { icon: '📋', labelKey: 'researchTasks.entity' },
  group:        { icon: '👥', labelKey: 'groups.entity' },
  name:         { icon: '🏷️', labelKey: 'persons.nameEntity' },
  identifier:   { icon: '🪪', labelKey: 'persons.identifierEntity' },
  neutral:      { icon: '',   labelKey: '' },
};
