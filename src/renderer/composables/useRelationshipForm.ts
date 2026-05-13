/**
 * useRelationshipForm — form ref + defaults for RelationshipModal.
 *
 * Extracted in plan 2026-05-14-modal-composable-extraction (Task 10) so that
 * RelationshipModal.vue can shrink to a thin orchestrator. The composable
 * owns the reactive form shape (type/subtype/person1/person2/notes) and
 * hydrates from props.editingRelationship when supplied.
 *
 * Type-driven subtype defaults (lines 287-298 of the legacy modal) are
 * exposed via `selectType()` so callers can drive the type segmented
 * control without re-implementing the subtype reset logic.
 */
import { reactive } from 'vue';

export interface RelationshipForm {
  type: string;
  subtype: string;
  person1_id: string | null;
  person2_id: string | null;
  notes: string;
}

export interface RelationshipRow {
  id: string;
  type: string;
  person1_id: string | null;
  person2_id: string | null;
  subtype: string | null;
  notes: string | null;
}

export interface UseRelationshipFormOptions {
  editingRelationship?: RelationshipRow | null;
}

export function useRelationshipForm(options: UseRelationshipFormOptions = {}) {
  const editing = options.editingRelationship ?? null;
  const form = reactive<RelationshipForm>({
    type: editing?.type ?? 'couple',
    subtype: editing?.subtype ?? 'marriage',
    person1_id: editing?.person1_id ?? null,
    person2_id: editing?.person2_id ?? null,
    notes: editing?.notes ?? '',
  });

  function selectType(type: string): void {
    form.type = type;
    // Reset subtype to a sensible default when switching type.
    if (type === 'couple') {
      form.subtype = 'marriage';
    } else if (type === 'parent_child') {
      form.subtype = 'biological';
    } else {
      form.subtype = '';
    }
  }

  return { form, selectType };
}
