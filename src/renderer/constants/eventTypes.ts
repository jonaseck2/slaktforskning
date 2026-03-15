export const EVENT_TYPES = [
  { value: 'birth', label: 'Birth' },
  { value: 'death', label: 'Death' },
  { value: 'marriage', label: 'Marriage' },
  { value: 'divorce', label: 'Divorce' },
  { value: 'christening', label: 'Christening' },
  { value: 'burial', label: 'Burial' },
  { value: 'baptism', label: 'Baptism' },
  { value: 'confirmation', label: 'Confirmation' },
  { value: 'ordination', label: 'Ordination' },
  { value: 'census', label: 'Census' },
  { value: 'immigration', label: 'Immigration' },
  { value: 'emigration', label: 'Emigration' },
  { value: 'naturalization', label: 'Naturalization' },
  { value: 'occupation', label: 'Occupation' },
  { value: 'residence', label: 'Residence' },
  { value: 'education', label: 'Education' },
  { value: 'graduation', label: 'Graduation' },
  { value: 'military', label: 'Military Service' },
  { value: 'retirement', label: 'Retirement' },
  { value: 'will', label: 'Will' },
  { value: 'probate', label: 'Probate' },
  { value: 'other', label: 'Other' },
] as const;

export type EventTypeValue = (typeof EVENT_TYPES)[number]['value'];

export const PERSON_EVENT_TYPES = EVENT_TYPES.filter(
  (t) => !['marriage', 'divorce'].includes(t.value),
);

export const FAMILY_EVENT_TYPES = EVENT_TYPES.filter((t) =>
  ['marriage', 'divorce', 'census', 'other'].includes(t.value),
);

export const DATE_TYPES = [
  { value: 'exact', label: 'Exact' },
  { value: 'about', label: 'About' },
  { value: 'before', label: 'Before' },
  { value: 'after', label: 'After' },
  { value: 'between', label: 'Between' },
  { value: 'calculated', label: 'Calculated' },
  { value: 'unknown', label: 'Unknown' },
] as const;

export const CONFIDENCE_LEVELS = [
  { value: 0, label: 'Unreliable' },
  { value: 1, label: 'Questionable' },
  { value: 2, label: 'Secondary evidence' },
  { value: 3, label: 'Primary evidence' },
] as const;

export const SOURCE_TYPES = [
  { value: 'vital_record', label: 'Vital Record' },
  { value: 'census', label: 'Census' },
  { value: 'church_record', label: 'Church Record' },
  { value: 'newspaper', label: 'Newspaper' },
  { value: 'photograph', label: 'Photograph' },
  { value: 'oral_history', label: 'Oral History' },
  { value: 'letter', label: 'Letter / Correspondence' },
  { value: 'legal_document', label: 'Legal Document' },
  { value: 'military_record', label: 'Military Record' },
  { value: 'immigration_record', label: 'Immigration Record' },
  { value: 'book', label: 'Book' },
  { value: 'online_database', label: 'Online Database' },
  { value: 'other', label: 'Other' },
] as const;

export const UNION_TYPES = [
  { value: 'marriage', label: 'Marriage' },
  { value: 'civil_union', label: 'Civil Union' },
  { value: 'cohabitation', label: 'Cohabitation' },
  { value: 'unknown', label: 'Unknown' },
] as const;

export const RELATIONSHIP_TYPES = [
  { value: 'biological', label: 'Biological' },
  { value: 'adopted', label: 'Adopted' },
  { value: 'foster', label: 'Foster' },
  { value: 'step', label: 'Step' },
  { value: 'unknown', label: 'Unknown' },
] as const;

export const NAME_TYPES = [
  { value: 'birth', label: 'Birth' },
  { value: 'married', label: 'Married' },
  { value: 'alias', label: 'Alias' },
  { value: 'aka', label: 'Also Known As' },
] as const;
