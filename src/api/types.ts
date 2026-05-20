export interface Person {
  id: string;
  // 'X' = non-binary / intersex (GEDCOM 7.0 also allows X; 5.5.1 only M/F/U
  // and our exporter falls back to U on 5.5.1).
  sex: 'M' | 'F' | 'U' | 'X';
  living: boolean;
  notes: string;
  display_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface PersonName {
  id: string;
  person_id: string;
  given_name: string | null;
  surname: string | null;
  name_type: 'birth' | 'married' | 'name_change' | 'alias' | 'aka';
  date_from: string | null;
  date_to: string | null;
  sort_order: number;
  name_prefix: string | null;
  name_suffix: string | null;
  patronymic_base: string | null;
  name_qualifier: 'patronymic' | 'matronymic' | 'particle' | 'married' | 'alias' | null;
  preferred_name: string | null;
  nickname: string | null;
}

export interface PersonIdentifier {
  id: string;
  person_id: string;
  identifier_type: 'familysearch' | 'ancestry' | 'riksarkivet' | 'personnummer' | 'refn' | 'rin' | 'uid' | 'afn' | 'ssn' | 'other';
  identifier_value: string;
  created_at: string;
}

export type RelationshipType = 'couple' | 'parent_child' | 'sibling' | 'godparent' | 'other';
export type CoupleSubtype = 'marriage' | 'civil_union' | 'cohabitation' | 'unknown';
export type ParentChildSubtype = 'biological' | 'adopted' | 'foster' | 'step' | 'unknown';

export interface Relationship {
  id: string;
  type: RelationshipType;
  person1_id: string | null;
  person2_id: string | null;
  subtype: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export type EventParticipantRole = 'primary' | 'spouse' | 'parent' | 'child' | 'witness' | 'godparent' | 'officiant' | 'other';

export interface EventParticipant {
  id: string;
  event_id: string;
  person_id: string;
  role: EventParticipantRole;
}

export interface GenealogyEvent {
  id: string;
  event_type: string;
  date_type: 'exact' | 'about' | 'before' | 'after' | 'between' | 'from_to' | 'interpreted' | 'calculated' | 'unknown';
  date_value: string | null;
  date_value_end: string | null;
  date_original: string;
  place_id: string | null;
  place_address: string | null;
  cause: string | null;
  value: string | null;
  notes: string;
  // GEDCOM 7.0 negative-assertion family of structures (NO BIRT, NO DEAT,
  // etc.). When true, the event records the *absence* of the named event
  // (negation_event_type) — e.g. "no death record found before 1900".
  // Filled by T06. is_negation persisted as 0/1 in SQLite.
  is_negation: number;
  negation_event_type: string;
  relationship_id: string | null;
  created_at: string;
  updated_at: string;
}

export type PlaceType = 'country' | 'province' | 'county' | 'härad' | 'parish' | 'farm' | 'village' | 'city' | 'other';

export interface Place {
  id: string;
  name: string;
  normalized_name: string;
  place_type: PlaceType | null;
  parent_place_id: string | null;
  latitude: number | null;
  longitude: number | null;
  date_from: string | null;
  date_to: string | null;
  notes: string;
  street: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
}

export interface Source {
  id: string;
  title: string;
  author: string;
  publication_info: string;
  url: string;
  source_type: string;
  call_number: string | null;
  abstract: string | null;
  created_at: string;
  updated_at: string;
}

export interface Citation {
  id: string;
  source_id: string;
  page: string;
  date_accessed: string;
  confidence: number;
  transcription: string;
  notes: string;
  event_id: string | null;
  person_id: string | null;
  relationship_id: string | null;
  place_id: string | null;
  person_name_id: string | null;
  created_at: string;
}

export interface Group {
  id: string;
  name: string;
  notes: string;
  created_at: string;
}

export type LinkEntityType = 'person' | 'place' | 'media';

export interface GroupLink {
  id: string;
  group_id: string;
  entity_type: LinkEntityType;
  entity_id: string;
  sort_order: number;
  created_at: string;
}

export interface Repository {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  state: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  web: string | null;
  call_number: string | null;
  notes: string;
  created_at: string;
}

export type ResearchTaskStatus = 'open' | 'in_progress' | 'done' | 'stopped';

export interface ResearchTask {
  id: string;
  priority: number;
  status: ResearchTaskStatus;
  task: string;
  notes: string;
  result: string;
  created_at: string;
  updated_at: string;
}

export interface TaskLink {
  id: string;
  task_id: string;
  entity_type: LinkEntityType;
  entity_id: string;
  sort_order: number;
  created_at: string;
}

export interface Media {
  id: string;
  file_ref: string | null;
  title: string;
  format: string | null;
  notes: string;
  is_printable: boolean;
  is_missing: number;
  created_at: string;
}

export type MediaLinkEntityType = 'person' | 'event' | 'relationship' | 'place' | 'source';

export interface MediaLink {
  id: string;
  media_id: string;
  entity_type: MediaLinkEntityType;
  entity_id: string;
  link_type: number | null;
  sort_order: number;
  created_at: string;
}

export interface MediaRegion {
  id: string;
  media_id: string;
  person_id: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string | null;
  created_at: string;
}

// ── T02 GEDCOM-alignment domain types ───────────────────────────────────────

export type NoteEntityType =
  | 'person'
  | 'event'
  | 'relationship'
  | 'place'
  | 'source'
  | 'repository'
  | 'media'
  | 'family';

export interface Note {
  id: string;
  text: string;
  language: string;
  created_at: string;
  updated_at: string;
}

export interface NoteLink {
  id: string;
  note_id: string;
  entity_type: NoteEntityType;
  entity_id: string;
  sort_order: number;
  created_at: string;
}

export type PersonAssociationRole =
  | 'godparent'
  | 'friend'
  | 'colleague'
  | 'enemy'
  | 'neighbor'
  | 'other';

export interface PersonAssociation {
  id: string;
  person_id: string;
  related_person_id: string;
  role: PersonAssociationRole;
  notes: string;
  created_at: string;
}

export interface NameTranslation {
  id: string;
  person_name_id: string;
  value: string;
  language: string;
  transliteration_scheme: string;
  created_at: string;
}

export interface PlaceTranslation {
  id: string;
  place_id: string;
  value: string;
  language: string;
  transliteration_scheme: string;
  created_at: string;
}

export interface SourceCoverageEvent {
  id: string;
  source_id: string;
  event_type: string;
  date_value_from: string;
  date_value_to: string;
  place_id: string | null;
  notes: string;
  created_at: string;
}

