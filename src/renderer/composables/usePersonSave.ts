/**
 * usePersonSave — save orchestration for PersonModal.
 *
 * Extracted in plan 2026-05-14-modal-composable-extraction (Task 9). Mirrors
 * PersonModal.vue's three save branches (lines 478-569):
 *
 *   1. Edit: persons.update on savedPersonId with `{ sex }`.
 *   2. Link existing: persons.get on existingPersonId (no mutation; just a
 *      handle for the subsequent relationship.create).
 *   3. Create: persons.createWithEvent — atomically persists the person row,
 *      the primary name row (given/surname), and an optional inline birth
 *      event in one IPC. The composable assembles the create payload from
 *      the form ref and the birth ref; it never invents data.
 *
 * After the person exists, if `addRelatedTo` was supplied the composable
 * also creates the relationship row (couple or parent_child depending on
 * mode). Child / son / daughter mode optionally links a second parent.
 *
 * PRIME DIRECTIVE: `date_value` is set only when the birth date is a full
 * ISO date — never invent a "best guess" from a partial. Empty birth
 * fields skip event creation entirely.
 */
import { ref, type Ref, type ComputedRef } from 'vue';
import type { PersonForm, PersonBirthForm, AddRelatedTo, PersonSex } from './usePersonForm';

export interface Person {
  id: string;
  sex: string;
  living: boolean;
}

export interface UsePersonSaveOptions {
  form: PersonForm;
  birth: PersonBirthForm;
  savedPersonIdRef: Ref<string | null>;
  addRelatedTo: AddRelatedTo | null | undefined;
  entryMode: Ref<'new' | 'existing'>;
  existingPersonId: Ref<string | null>;
  secondParentId: Ref<string | null>;
  canSave: ComputedRef<boolean>;
  emit: (name: 'saved' | 'close', payload?: unknown) => void;
}

export interface UsePersonSaveReturn {
  save: () => Promise<void>;
  saving: Ref<boolean>;
  lastError: Ref<string | null>;
}

declare const window: Window & {
  api?: {
    persons?: {
      update?: (id: string, input: Record<string, unknown>) => Promise<Person>;
      get?: (id: string) => Promise<Person>;
      createWithEvent?: (input: Record<string, unknown>) => Promise<{ person: Person }>;
    };
    relationships?: {
      create?: (input: Record<string, unknown>) => Promise<unknown>;
    };
  };
};

export function usePersonSave(options: UsePersonSaveOptions): UsePersonSaveReturn {
  const saving = ref(false);
  const lastError = ref<string | null>(null);

  function buildCreatePayload(): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      given_name: options.form.given_name,
      surname: options.form.surname,
      sex: options.form.sex as PersonSex,
    };
    const birthDate = options.birth.date.trim();
    const birthPlaceId = options.birth.placeId;
    if (birthDate || birthPlaceId) {
      // Prime Directive: `date_original` is the user's verbatim text. Only
      // populate `date_value` when the input is already a full ISO date —
      // never invent a "best guess" that overwrites what the user wrote.
      const isFullIso = /^\d{4}-\d{2}-\d{2}$/.test(birthDate);
      payload.event = {
        event_type: 'birth',
        date_type: 'exact',
        date_value: isFullIso ? birthDate : null,
        date_original: birthDate,
        place_id: birthPlaceId,
        notes: '',
        cause: null,
      };
    }
    return payload;
  }

  async function save(): Promise<void> {
    if (!options.canSave.value) return;
    if (saving.value) return;
    saving.value = true;
    lastError.value = null;
    try {
      if (!window.api) throw new Error('window.api unavailable');
      const personsApi = window.api.persons;
      const relationshipsApi = window.api.relationships;
      if (!personsApi) throw new Error('persons api unavailable');

      let person: Person;
      if (options.savedPersonIdRef.value && !options.addRelatedTo) {
        // Edit mode
        if (!personsApi.update) throw new Error('persons.update unavailable');
        person = await personsApi.update(options.savedPersonIdRef.value, {
          sex: options.form.sex,
        });
      } else if (options.addRelatedTo && options.entryMode.value === 'existing') {
        // Link existing person — no mutation, just fetch.
        if (!options.existingPersonId.value) return;
        if (!personsApi.get) throw new Error('persons.get unavailable');
        person = await personsApi.get(options.existingPersonId.value);
      } else {
        // Create new person (atomic with optional inline birth event).
        if (!personsApi.createWithEvent) throw new Error('persons.createWithEvent unavailable');
        const result = await personsApi.createWithEvent(buildCreatePayload());
        person = result.person;
        options.savedPersonIdRef.value = person.id;
      }

      // Create relationship row if addRelatedTo was supplied.
      if (options.addRelatedTo && relationshipsApi?.create) {
        const targetPersonId = (options.addRelatedTo && options.entryMode.value === 'existing')
          ? options.existingPersonId.value!
          : (options.savedPersonIdRef.value ?? person.id);
        const relData: Record<string, unknown> = {};
        const m = options.addRelatedTo.mode;
        if (m === 'father' || m === 'mother') {
          relData.type = 'parent_child';
          relData.person1_id = targetPersonId; // parent
          relData.person2_id = options.addRelatedTo.personId; // child
          relData.subtype = options.form.subtype;
        } else if (m === 'child' || m === 'son' || m === 'daughter') {
          relData.type = 'parent_child';
          relData.person1_id = options.addRelatedTo.personId; // parent
          relData.person2_id = targetPersonId; // child
          relData.subtype = options.form.subtype;
        } else {
          relData.type = 'couple';
          relData.person1_id = options.addRelatedTo.personId;
          relData.person2_id = targetPersonId;
          relData.subtype = options.form.subtype;
        }
        await relationshipsApi.create(relData);
        // Child / son / daughter mode: optionally link a second parent.
        if (
          (m === 'child' || m === 'son' || m === 'daughter')
          && options.secondParentId.value
          && options.secondParentId.value !== targetPersonId
        ) {
          await relationshipsApi.create({
            type: 'parent_child',
            person1_id: options.secondParentId.value,
            person2_id: targetPersonId,
            subtype: options.form.subtype,
          });
        }
      }

      options.emit('saved', person);
      if (options.addRelatedTo) options.emit('close');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      lastError.value = message;
      console.error('[usePersonSave] save failed:', err);
      throw err; // re-throw so the modal can show a toast
    } finally {
      saving.value = false;
    }
  }

  return { save, saving, lastError };
}
