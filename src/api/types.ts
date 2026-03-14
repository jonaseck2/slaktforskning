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

export interface Family {
  id: string;
  partner_a_id: string | null;
  partner_b_id: string | null;
  union_type: 'marriage' | 'civil_union' | 'cohabitation' | 'unknown';
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface PersonFamilyLink {
  id: string;
  person_id: string;
  family_id: string;
  relationship_type: 'biological' | 'adopted' | 'foster' | 'step' | 'unknown';
}

export interface GenealogyEvent {
  id: string;
  event_type: string; // birth, death, marriage, divorce, burial, baptism, immigration, census, residence, occupation, military, etc.
  date_type: 'exact' | 'about' | 'before' | 'after' | 'between' | 'calculated' | 'unknown';
  date_value: string | null;
  date_value_end: string | null; // for 'between' ranges
  date_original: string; // preserve original text
  place_id: string | null;
  description: string;
  person_id: string | null;
  family_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Place {
  id: string;
  name: string;
  normalized_name: string;
  latitude: number | null;
  longitude: number | null;
  parent_place_id: string | null;
}

export interface Source {
  id: string;
  title: string;
  author: string;
  publication_info: string;
  repository: string;
  url: string;
  source_type: string; // vital_record, census, newspaper, photograph, oral_history, etc.
  created_at: string;
  updated_at: string;
}

export interface Citation {
  id: string;
  source_id: string;
  page: string;
  date_accessed: string;
  confidence: number; // 0-3 matching GEDCOM QUAY
  transcription: string;
  notes: string;
  event_id: string | null;
  person_id: string | null;
}
