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
  | 'media'
  | 'relationship'
  | 'task'
  | 'group'
  | 'name'
  | 'repository'
  | 'note'
  | 'neutral';

export const ENTITY_META: Record<EntityType, EntityMeta> = {
  person:       { icon: '👤', labelKey: 'persons.entity' },
  event:        { icon: '📅', labelKey: 'events.entity' },
  source:       { icon: '📚', labelKey: 'sources.entity' },
  citation:     { icon: '📖', labelKey: 'citations.entity' },
  place:        { icon: '📍', labelKey: 'places.entity' },
  media:        { icon: '🖼️', labelKey: 'media.entity' },
  relationship: { icon: '🔗', labelKey: 'relationships.entity' },
  task:         { icon: '📋', labelKey: 'researchTasks.entity' },
  group:        { icon: '👥', labelKey: 'groups.entity' },
  name:         { icon: '🏷️', labelKey: 'persons.nameEntity' },
  repository:   { icon: '🏛️', labelKey: 'repositories.entity' },
  note:         { icon: '📝', labelKey: 'notes.entity' },
  neutral:      { icon: '',   labelKey: '' },
};
