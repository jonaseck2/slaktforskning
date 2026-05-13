/**
 * usePersonNameForm — form ref + hydration for PersonNameModal.
 *
 * Extracted in plan 2026-05-14-modal-composable-extraction (Task 8) so that
 * PersonNameModal.vue can shrink to a thin orchestrator. The composable owns
 * the reactive form shape and the hydration paths (props.editingName, the
 * caller-supplied defaultGivenName / defaultSurname, and the displayed-name
 * prefill helper).
 *
 * PRIME DIRECTIVE: the prefill helper is a suggestion only. Nothing is
 * persisted on its own — the caller is responsible for writing exactly what
 * the user authored when they press Save (or for skipping the write entirely
 * on Cancel).
 */
import { reactive, watch } from 'vue';

export interface PersonNameForm {
  given_name: string;
  surname: string;
  name_type: string;
  name_prefix: string;
  name_suffix: string;
  name_qualifier: string;
  patronymic_base: string;
  preferred_name: string;
  nickname: string;
  date_from: string;
  date_to: string;
}

export interface PersonNameRow {
  id: string;
  given_name?: string | null;
  surname?: string | null;
  name_type?: string | null;
  name_prefix?: string | null;
  name_suffix?: string | null;
  name_qualifier?: string | null;
  patronymic_base?: string | null;
  preferred_name?: string | null;
  nickname?: string | null;
  date_from?: string | null;
  date_to?: string | null;
}

export interface UsePersonNameFormOptions {
  editingName: PersonNameRow | null | undefined;
  defaultGivenName?: string;
  defaultSurname?: string;
  // Reactive editingName ref source — if supplied, the form re-hydrates when
  // it changes. PersonNameModal passes `() => props.editingName` so the watch
  // catches the prop change (edit → another edit).
  editingNameSource?: () => PersonNameRow | null | undefined;
}

function hydrate(form: PersonNameForm, n: PersonNameRow | null | undefined, defaults: { given?: string; surname?: string }): void {
  form.given_name = n?.given_name ?? (defaults.given || '');
  form.surname = n?.surname ?? (defaults.surname || '');
  form.name_type = n?.name_type ?? 'married';
  form.name_prefix = n?.name_prefix ?? '';
  form.name_suffix = n?.name_suffix ?? '';
  form.name_qualifier = n?.name_qualifier ?? '';
  form.patronymic_base = n?.patronymic_base ?? '';
  form.preferred_name = n?.preferred_name ?? '';
  form.nickname = n?.nickname ?? '';
  form.date_from = n?.date_from ?? '';
  form.date_to = n?.date_to ?? '';
}

export function usePersonNameForm(options: UsePersonNameFormOptions) {
  const form = reactive<PersonNameForm>({
    given_name: '',
    surname: '',
    name_type: 'married',
    name_prefix: '',
    name_suffix: '',
    name_qualifier: '',
    patronymic_base: '',
    preferred_name: '',
    nickname: '',
    date_from: '',
    date_to: '',
  });

  hydrate(form, options.editingName ?? null, {
    given: options.defaultGivenName,
    surname: options.defaultSurname,
  });

  if (options.editingNameSource) {
    watch(options.editingNameSource, (n) => {
      hydrate(form, n ?? null, {
        given: options.defaultGivenName,
        surname: options.defaultSurname,
      });
    });
  }

  return { form };
}
