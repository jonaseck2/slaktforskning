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
  given_name: string;
  surname: string;
  name_type: 'birth' | 'married' | 'alias' | 'aka';
  date_from: string | null;
  date_to: string | null;
  sort_order: number;
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
}

export interface Source {
  id: string;
  title: string;
  author: string;
  publication_info: string;
  repository: string;
  url: string;
  source_type: string;
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

export interface Assertion {
  id: string;
  citation_id: string;
  subject_type: 'person' | 'relationship' | 'event' | 'place';
  subject_id: string;
  attribute: string;
  value: string;
  value_original: string;
  confidence: number;
  is_accepted: boolean;
  notes: string;
  created_at: string;
}
