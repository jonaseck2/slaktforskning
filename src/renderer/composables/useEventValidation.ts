/**
 * useEventValidation — computed field errors + canSave predicate for EventModal.
 *
 * Extracted in plan 2026-05-14-modal-composable-extraction (Task 3) so that
 * EventModal.vue can shrink to a thin orchestrator. The composable owns the
 * validation rules for the event form; the modal just reads `errors` for
 * inline feedback and binds `:save-disabled="!canSave"` on BaseSubPanel.
 *
 * Current rule set mirrors what EventModal.vue enforces today (lines 30-41 +
 * 764-868):
 *   - `event_type` is required. The template's `<option value="" disabled>`
 *     placeholder hides the empty state from the dropdown, and the api/ layer
 *     rejects an empty event_type on create/update. Make that contract
 *     explicit here so the Save button reflects it.
 *   - Date is optional. EventModal's handleSave runs every date field through
 *     `form.date_value || null`, `form.date_original` (no guard), and the
 *     events.create/update API accepts a fully null date. `date_type: 'unknown'`
 *     is a valid persisted state for an event whose date is genuinely unknown.
 *   - Participants are not validated here. EventModal manages participants
 *     separately (primaryPersonId + secondPersonId pickers) and they will be
 *     extracted to useEventParticipants (Task 5). This composable is form-only.
 *
 * Returns:
 *   - `errors`: computed Record<string, string> of field-name → i18n error key.
 *     Empty object when the form is valid.
 *   - `canSave`: computed boolean. True iff `errors` is empty (no field has a
 *     surfaced violation). The modal still gates the Save button on its own
 *     `saving` ref so a click can't double-fire mid-save.
 */
import { computed, type ComputedRef } from 'vue';
import type { EventForm } from './useEventForm';

export interface UseEventValidationReturn {
  errors: ComputedRef<Record<string, string>>;
  canSave: ComputedRef<boolean>;
}

export function useEventValidation(form: EventForm): UseEventValidationReturn {
  const errors = computed<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    if (!form.event_type || form.event_type.trim() === '') {
      out.event_type = 'errors.required';
    }
    return out;
  });

  const canSave = computed<boolean>(() => Object.keys(errors.value).length === 0);

  return { errors, canSave };
}
