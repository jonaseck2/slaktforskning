/**
 * usePersonValidation — computed canSave for PersonModal.
 *
 * Extracted in plan 2026-05-14-modal-composable-extraction (Task 9). Mirrors
 * PersonModal.vue's inline `canSave` (lines 401-410). Three modes:
 *
 *   - Edit mode (savedPersonId set, no addRelatedTo): always saveable — the
 *     form is pre-populated from the existing person; saving never produces
 *     a nameless row.
 *   - Existing-person link mode (addRelatedTo + entryMode === 'existing'):
 *     saveable when a person has been picked.
 *   - Create / new-person mode (everything else, including addRelatedTo with
 *     entryMode === 'new'): saveable when at least one of given_name /
 *     surname is non-empty after trim. Prevents accidental creation of a
 *     persons row with no person_names row attached (Prime Directive on
 *     authored data).
 */
import { computed, type ComputedRef, type Ref } from 'vue';
import type { PersonForm } from './usePersonForm';

export interface UsePersonValidationOptions {
  form: PersonForm;
  savedPersonId: Ref<string | null>;
  hasAddRelatedTo: () => boolean;
  entryMode: Ref<'new' | 'existing'>;
  existingPersonId: Ref<string | null>;
}

export interface UsePersonValidationReturn {
  canSave: ComputedRef<boolean>;
}

export function usePersonValidation(options: UsePersonValidationOptions): UsePersonValidationReturn {
  const canSave = computed(() => {
    if (options.savedPersonId.value && !options.hasAddRelatedTo()) return true;
    if (options.hasAddRelatedTo() && options.entryMode.value === 'existing') {
      return options.existingPersonId.value !== null;
    }
    return options.form.given_name.trim().length > 0 || options.form.surname.trim().length > 0;
  });
  return { canSave };
}
