/**
 * usePersonNameSave — save orchestration for PersonNameModal.
 *
 * Extracted in plan 2026-05-14-modal-composable-extraction (Task 8) so that
 * PersonNameModal.vue can shrink to a thin orchestrator. The composable wraps
 * the two-step save sequence:
 *   1. Insert (persons.addName) or update (persons.updateName) the name row.
 *   2. On insert: flush buffered pending citations via citations.create with
 *      the new person_name_id.
 *
 * PRIME DIRECTIVE: builds the payload from form values exactly as authored.
 * `date_to` is included unconditionally even when the field is hidden in the
 * UI for `birth` / `name_change` types — hiding a field is not consent to
 * null a value the user (or import) authored. See the
 * `name-change-with-legacy-date-to` test.
 *
 * Validation is enforced via the `canSave` computed passed in. If false,
 * `save()` returns immediately and the modal's onSaveAttempt path surfaces
 * the inline toast itself.
 */
import { ref, type Ref, type ComputedRef } from 'vue';
import type { PersonNameForm } from './usePersonNameForm';
import { parseAsteriskNotation } from '../utils/nameUtils';

export interface PendingNameCitation {
  tempId?: string;
  source_id: string;
  page: string | null;
  confidence: number | null;
  transcription: string;
  notes: string;
  date_accessed: string;
}

export interface UsePersonNameSaveOptions {
  form: PersonNameForm;
  pendingCitations: Ref<PendingNameCitation[]>;
  savedNameIdRef: Ref<string | null>;
  personId: string;
  // Whether the modal is in edit mode (existing name row).
  isEdit: () => boolean;
  canSave: ComputedRef<boolean>;
  emit: (name: 'saved' | 'close', payload?: unknown) => void;
}

export interface UsePersonNameSaveReturn {
  save: () => Promise<void>;
  saving: Ref<boolean>;
  lastError: Ref<string | null>;
}

declare const window: Window & {
  api?: {
    persons?: {
      addName?: (personId: string, input: Record<string, unknown>) => Promise<{ id: string } | null>;
      updateName?: (id: string, input: Record<string, unknown>) => Promise<unknown>;
    };
    citations?: {
      create?: (input: Record<string, unknown>) => Promise<{ id: string } | null>;
    };
  };
};

export function usePersonNameSave(options: UsePersonNameSaveOptions): UsePersonNameSaveReturn {
  const saving = ref(false);
  const lastError = ref<string | null>(null);

  function buildPayload(): Record<string, unknown> {
    const { given_name: parsedGiven, preferred_name: parsedPreferred } = parseAsteriskNotation(
      options.form.given_name,
    );
    const resolvedPreferred = options.form.preferred_name || parsedPreferred || null;
    return {
      given_name: parsedGiven,
      surname: options.form.surname || null,
      name_type: options.form.name_type as 'birth' | 'married' | 'alias' | 'aka',
      name_prefix: options.form.name_prefix || null,
      name_suffix: options.form.name_suffix || null,
      name_qualifier: options.form.name_qualifier || null,
      patronymic_base: options.form.patronymic_base || null,
      preferred_name: resolvedPreferred,
      nickname: options.form.nickname || null,
      date_from: options.form.date_from || null,
      date_to: options.form.date_to || null,
    };
  }

  async function save(): Promise<void> {
    if (!options.canSave.value) return;
    if (saving.value) return;
    saving.value = true;
    lastError.value = null;
    try {
      const addName = window.api?.persons?.addName;
      const updateName = window.api?.persons?.updateName;
      const createCitation = window.api?.citations?.create;
      const payload = buildPayload();
      if (options.isEdit()) {
        const existingId = options.savedNameIdRef.value;
        if (!existingId) throw new Error('isEdit() returned true but savedNameIdRef is null');
        if (!updateName) throw new Error('persons.updateName unavailable');
        await updateName(existingId, payload);
      } else {
        if (!addName) throw new Error('persons.addName unavailable');
        const created = await addName(options.personId, payload);
        if (created?.id) {
          options.savedNameIdRef.value = created.id;
          // Flush pending citations buffered before the name row existed.
          if (createCitation) {
            for (const pc of options.pendingCitations.value) {
              await createCitation({
                source_id: pc.source_id,
                page: pc.page,
                confidence: pc.confidence,
                transcription: pc.transcription,
                notes: pc.notes,
                date_accessed: pc.date_accessed,
                person_name_id: created.id,
              });
            }
            options.pendingCitations.value = [];
          }
        }
      }
      options.emit('saved');
      options.emit('close');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      lastError.value = message;
      console.error('[usePersonNameSave] save failed:', err);
    } finally {
      saving.value = false;
    }
  }

  return { save, saving, lastError };
}
