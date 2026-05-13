/**
 * useRelationshipSave — save orchestration for RelationshipModal.
 *
 * Extracted in plan 2026-05-14-modal-composable-extraction (Task 10). Mirrors
 * RelationshipModal.vue's `performSave` (lines 516-553):
 *
 *   - If savedRelationshipId is set: relationships.update with the payload.
 *   - Otherwise: relationships.create and capture the new id.
 *
 * The wedding-offer flow + overlap-warning flow + person name lookups stay
 * in the modal — they're orchestration around the save (pre-flight checks,
 * post-save offers), not part of the save itself. The composable exposes
 * `save()` as the canonical "persist this relationship" entry point; the
 * modal wires in its own `handleSave()` that performs the overlap check
 * before invoking it and handles the wedding offer after.
 *
 * PRIME DIRECTIVE: writes exactly what the form authors. Empty `notes`
 * becomes the empty string, not null — `notes` has no schema default and
 * the legacy modal explicitly passes `''` to avoid surprise nulls.
 */
import { ref, type Ref, type ComputedRef } from 'vue';
import type { RelationshipForm, RelationshipRow } from './useRelationshipForm';

export interface UseRelationshipSaveOptions {
  form: RelationshipForm;
  savedRelationshipIdRef: Ref<string | null>;
  canSave: ComputedRef<boolean>;
  emit: (name: 'saved' | 'close', payload?: unknown) => void;
}

export interface UseRelationshipSaveReturn {
  save: () => Promise<RelationshipRow | null>;
  saving: Ref<boolean>;
  lastError: Ref<string | null>;
}

declare const window: Window & {
  api?: {
    relationships?: {
      create?: (input: Record<string, unknown>) => Promise<RelationshipRow>;
      update?: (id: string, input: Record<string, unknown>) => Promise<RelationshipRow>;
    };
  };
};

export function useRelationshipSave(options: UseRelationshipSaveOptions): UseRelationshipSaveReturn {
  const saving = ref(false);
  const lastError = ref<string | null>(null);

  async function save(): Promise<RelationshipRow | null> {
    if (!options.canSave.value) return null;
    if (saving.value) return null;
    saving.value = true;
    lastError.value = null;
    try {
      if (!window.api) throw new Error('window.api unavailable');
      const create = window.api.relationships?.create;
      const update = window.api.relationships?.update;
      const payload: Record<string, unknown> = {
        type: options.form.type,
        person1_id: options.form.person1_id,
        person2_id: options.form.person2_id,
        subtype: options.form.subtype || null,
        notes: options.form.notes ?? '',
      };
      let rel: RelationshipRow;
      if (options.savedRelationshipIdRef.value) {
        if (!update) throw new Error('relationships.update unavailable');
        rel = await update(options.savedRelationshipIdRef.value, payload);
      } else {
        if (!create) throw new Error('relationships.create unavailable');
        rel = await create(payload);
        options.savedRelationshipIdRef.value = rel.id;
      }
      return rel;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      lastError.value = message;
      console.error('[useRelationshipSave] save failed:', err);
      throw err;
    } finally {
      saving.value = false;
    }
  }

  return { save, saving, lastError };
}
