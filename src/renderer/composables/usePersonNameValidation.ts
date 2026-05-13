/**
 * usePersonNameValidation — computed validation + canSave for PersonNameModal.
 *
 * Extracted in plan 2026-05-14-modal-composable-extraction (Task 8). The
 * composable mirrors PersonNameModal.vue's inline validation (lines 549-563):
 * at least one of given_name OR surname must be non-empty after trim.
 * Mononyms (given-only) and surname-only legacy rows are both valid authored
 * shapes — preserved by the importer/MCP audit (2026-05-04).
 *
 * Returns:
 *   - `validation`: ComputedRef<{ ok, firstFailReason, firstFailField }>. The
 *     modal reads `firstFailReason` for the toast and `firstFailField` to
 *     drive the flash/focus animation.
 *   - `canSave`: ComputedRef<boolean>. Mirrors `validation.value.ok` so the
 *     Save button can bind directly without unwrapping the object.
 *
 * `firstFailReason` is an i18n KEY ('personName.givenOrSurnameRequired'), not
 * a translated string. The modal owns translation so the composable stays
 * runtime-neutral and testable without an i18n provider.
 */
import { computed, type ComputedRef } from 'vue';
import type { PersonNameForm } from './usePersonNameForm';

export interface PersonNameValidationResult {
  ok: boolean;
  firstFailReason: string;
  firstFailField: 'given_name' | 'surname' | null;
}

export interface UsePersonNameValidationReturn {
  validation: ComputedRef<PersonNameValidationResult>;
  canSave: ComputedRef<boolean>;
}

export function usePersonNameValidation(form: PersonNameForm): UsePersonNameValidationReturn {
  const validation = computed<PersonNameValidationResult>(() => {
    const g = form.given_name.trim();
    const s = form.surname.trim();
    if (g.length === 0 && s.length === 0) {
      return {
        ok: false,
        firstFailReason: 'personName.givenOrSurnameRequired',
        firstFailField: 'given_name',
      };
    }
    return { ok: true, firstFailReason: '', firstFailField: null };
  });
  const canSave = computed(() => validation.value.ok);
  return { validation, canSave };
}
