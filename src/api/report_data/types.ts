// Shared report types — used by ≥2 report builders in `src/api/report_data/`.
// Report-specific types live colocated with their builder.

import type { GenealogyEvent, Citation, Relationship, PersonName } from '../types';

export interface EventWithPlace extends GenealogyEvent {
  place_name: string | null;
  place_path: string | null;
}

export interface CitationWithSource extends Citation {
  source_title: string | null;
  source_author: string | null;
  source_publication_info: string | null;
  source_url: string | null;
  source_repository: string | null;
}

export interface RelationshipSummary extends Relationship {
  other_person_id: string | null;
  other_person_names: PersonName[];
  other_person_sex: string | null;
  /**
   * Other person's birth event `date_value` (ISO or partial). `null` when
   * unknown. Used by `sortPersonRelations` to order children oldest-first.
   */
  other_person_birth_date: string | null;
  /**
   * For `couple` rows, the partnership start date — typically the marriage
   * event's `date_value` tied to this relationship. `null` for non-couple
   * rows or when no start-date event exists. Used by `sortPersonRelations`
   * to order partners chronologically.
   */
  partnership_start_date: string | null;
  /**
   * For outgoing `parent_child` rows (focal is the parent), this is the
   * OTHER parent's person id — the partner who produced this child with
   * the focal person. `null` when no other parent is recorded. Used by
   * `sortPersonRelations` to bucket children under the producing partner.
   */
  other_parent_id: string | null;
}
