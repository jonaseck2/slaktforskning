/**
 * usePersonForm — form ref + defaults for PersonModal.
 *
 * Extracted in plan 2026-05-14-modal-composable-extraction (Task 9) so that
 * PersonModal.vue can shrink to a thin orchestrator. The composable owns the
 * reactive form shape (given/surname/sex/subtype) plus the inline-birth ref.
 *
 * The PersonModal's flow has two entry modes (new vs existing person) and a
 * `addRelatedTo` host: this composable handles only the *new person* form
 * shape. Existing-person lookup state (existingPersonId, entryMode) stays in
 * the modal because it's orchestration around the picker, not data the
 * person row itself carries.
 *
 * PRIME DIRECTIVE: this composable computes defaults from props (sex from
 * relationship mode, surname from prefill prop). The defaults are
 * *suggestions* — the modal's save path writes exactly what the user
 * authored, including a deliberate blank surname.
 */
import { reactive } from 'vue';

export type PersonSex = 'M' | 'F' | 'U';

export interface PersonForm {
  given_name: string;
  surname: string;
  sex: PersonSex;
  subtype: string;
}

export interface PersonBirthForm {
  date: string;
  placeId: string | null;
}

export interface AddRelatedTo {
  personId: string;
  mode: 'father' | 'mother' | 'spouse' | 'child' | 'son' | 'daughter';
  personSex?: PersonSex;
  personSurname?: string;
}

export interface UsePersonFormOptions {
  prefillSurname?: string | null;
  addRelatedTo?: AddRelatedTo | null;
}

function defaultSex(addRelatedTo: AddRelatedTo | null | undefined): PersonSex {
  if (!addRelatedTo) return 'U';
  const m = addRelatedTo.mode;
  if (m === 'father' || m === 'son') return 'M';
  if (m === 'mother' || m === 'daughter') return 'F';
  if (m === 'spouse') {
    if (addRelatedTo.personSex === 'M') return 'F';
    if (addRelatedTo.personSex === 'F') return 'M';
    return 'U';
  }
  return 'U';
}

function defaultSurname(opts: UsePersonFormOptions): string {
  if (opts.prefillSurname) return opts.prefillSurname;
  return '';
}

function defaultSubtype(addRelatedTo: AddRelatedTo | null | undefined): string {
  if (addRelatedTo?.mode === 'spouse') return 'unknown';
  if (addRelatedTo) return 'biological';
  return '';
}

export function usePersonForm(options: UsePersonFormOptions = {}) {
  const form = reactive<PersonForm>({
    given_name: '',
    surname: defaultSurname(options),
    sex: defaultSex(options.addRelatedTo ?? null),
    subtype: defaultSubtype(options.addRelatedTo ?? null),
  });

  const birth = reactive<PersonBirthForm>({
    date: '',
    placeId: null,
  });

  return { form, birth };
}
