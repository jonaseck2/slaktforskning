// Constants define the valid values. Labels come from i18n translations
// (keys: eventTypes.*, dateTypes.*, etc.) and are resolved in components.

export const EVENT_TYPE_VALUES = [
  'birth', 'death', 'marriage', 'divorce', 'christening', 'burial',
  'confirmation', 'ordination', 'census', 'immigration',
  'emigration', 'naturalization', 'occupation', 'residence', 'education',
  'graduation', 'military', 'retirement', 'will', 'probate', 'mention',
  'engagement', 'wedding', 'adoption', 'foster_placement',
  'gender_transition',
  'travel',
  // GEDCOM-X fact-shaped event types — line value lives in events.value.
  'title', 'religion', 'description', 'fact',
  'other',
] as const;

export type EventTypeValue = (typeof EVENT_TYPE_VALUES)[number];

// Events that naturally span a date range. The EventModal shows an optional
// end-date field for these even when date_type !== 'between' (BENGT #28a).
export const SPAN_EVENT_TYPES = [
  'residence', 'education', 'occupation', 'military', 'travel',
] as const;

export type SpanEventType = (typeof SPAN_EVENT_TYPES)[number];

export function isSpanEventType(type: string): type is SpanEventType {
  return (SPAN_EVENT_TYPES as readonly string[]).includes(type);
}

export const PERSON_EVENT_TYPE_VALUES = EVENT_TYPE_VALUES.filter(
  (t) => !['marriage', 'divorce', 'wedding'].includes(t),
);

export const RELATIONSHIP_EVENT_TYPE_VALUES = EVENT_TYPE_VALUES.filter((t) =>
  ['marriage', 'divorce', 'wedding', 'census', 'other'].includes(t),
);

export const DATE_TYPE_VALUES = [
  'exact', 'about', 'before', 'after', 'between', 'calculated', 'unknown',
] as const;

export const CONFIDENCE_LEVEL_VALUES = [0, 1, 2, 3] as const;

export const SOURCE_TYPE_VALUES = [
  'vital_record', 'census', 'church_record', 'newspaper', 'photograph',
  'oral_history', 'letter', 'legal_document', 'military_record',
  'immigration_record', 'book', 'online_database',
  // Added 2026-05-06 (source-types-curation): Swedish-genealogy first-class types.
  // Order is for code organization; the dropdown sorts by locale label at render.
  'passenger_list', 'probate_inventory', 'genealogist', 'peerage_register', 'encyclopedia',
  'other',
] as const;

export const RELATIONSHIP_TYPE_VALUES = [
  'couple', 'parent_child', 'sibling', 'godparent', 'other',
] as const;

export const COUPLE_SUBTYPE_VALUES = [
  'marriage', 'civil_union', 'cohabitation', 'living_apart', 'relationship', 'unknown', 'other',
] as const;

export const PARENT_CHILD_SUBTYPE_VALUES = [
  'biological', 'adopted', 'foster', 'step', 'unknown',
] as const;

export const EVENT_PARTICIPANT_ROLE_VALUES = [
  'primary', 'spouse', 'parent', 'child', 'witness', 'godparent', 'officiant', 'other',
] as const;

export const NAME_TYPE_VALUES = [
  'birth', 'married', 'name_change', 'alias', 'aka',
] as const;

export const PLACE_TYPE_VALUES = [
  'country', 'admin1', 'province', 'county', 'municipality', 'härad', 'parish',
  'locality', 'farm', 'village', 'city', 'other',
] as const;

export const RESEARCH_TASK_STATUS_VALUES = [
  'open', 'in_progress', 'done', 'stopped',
] as const;
