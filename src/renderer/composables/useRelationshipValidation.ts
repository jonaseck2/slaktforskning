/**
 * useRelationshipValidation — computed canSave for RelationshipModal.
 *
 * Extracted in plan 2026-05-14-modal-composable-extraction (Task 10). Mirrors
 * RelationshipModal.vue's inline `canSave` (lines 269-272): both persons set,
 * a type set, and the two persons distinct.
 *
 * Saving when person1_id or person2_id is null falls through `performSave`'s
 * early-return guard silently — the user sees an active-looking Save button
 * do nothing. This composable binds to BaseSubPanel's `save-disabled` so the
 * button is visibly dimmed (50% opacity + grayscale + cursor:not-allowed)
 * when the form isn't ready, AND so the click handler is no-op'd at the DOM
 * level (the [disabled] attribute blocks the click event, so handleSave
 * never runs at all when canSave is false).
 */
import { computed, type ComputedRef } from 'vue';
import type { RelationshipForm } from './useRelationshipForm';

export interface UseRelationshipValidationReturn {
  canSave: ComputedRef<boolean>;
}

export function useRelationshipValidation(form: RelationshipForm): UseRelationshipValidationReturn {
  const canSave = computed(() => {
    return !!form.person1_id && !!form.person2_id && !!form.type
      && form.person1_id !== form.person2_id;
  });
  return { canSave };
}
