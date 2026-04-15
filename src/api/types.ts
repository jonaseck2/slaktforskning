export interface Person {
  id: string;
  sex: 'M' | 'F' | 'U';
  living: boolean;
  notes: string;
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
  identifier_type: 'familysearch' | 'ancestry' | 'riksarkivet' | 'personnummer' | 'refn' | 'rin' | 'other';
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
  date_type: 'exact' | 'about' | 'before' | 'after' | 'between' | 'calculated' | 'unknown';
  date_value: string | null;
  date_value_end: string | null;
  date_original: string;
  place_id: string | null;
  place_address: string | null;
  cause: string | null;
  description: string;
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
  repository: string;
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
  created_at: string;
}

export interface Group {
  id: string;
  name: string;
  notes: string;
  created_at: string;
}

export interface GroupMember {
  id: string;
  group_id: string;
  person_id: string;
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
  person_id: string | null;
  priority: number;
  status: ResearchTaskStatus;
  task: string;
  notes: string;
  result: string;
  created_at: string;
  updated_at: string;
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

