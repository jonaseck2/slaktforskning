import { describe, it, expect } from 'vitest';
import { reactive } from 'vue';
import { usePersonNameValidation } from '../../../src/renderer/composables/usePersonNameValidation';
import type { PersonNameForm } from '../../../src/renderer/composables/usePersonNameForm';

function makeForm(overrides: Partial<PersonNameForm> = {}): PersonNameForm {
  return reactive({
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
    ...overrides,
  });
}

describe('usePersonNameValidation', () => {
  it('rejects empty given_name + empty surname', () => {
    const form = makeForm();
    const { validation, canSave } = usePersonNameValidation(form);
    expect(validation.value.ok).toBe(false);
    expect(canSave.value).toBe(false);
    expect(validation.value.firstFailReason).toBe('personName.givenOrSurnameRequired');
    expect(validation.value.firstFailField).toBe('given_name');
  });

  it('accepts given-only (mononym)', () => {
    const form = makeForm({ given_name: 'Stefan' });
    const { validation, canSave } = usePersonNameValidation(form);
    expect(validation.value.ok).toBe(true);
    expect(canSave.value).toBe(true);
  });

  it('accepts surname-only', () => {
    const form = makeForm({ surname: 'Andersson' });
    const { canSave } = usePersonNameValidation(form);
    expect(canSave.value).toBe(true);
  });

  it('rejects whitespace-only fields', () => {
    const form = makeForm({ given_name: '  ', surname: '  ' });
    const { canSave } = usePersonNameValidation(form);
    expect(canSave.value).toBe(false);
  });

  it('reacts to form changes', () => {
    const form = makeForm();
    const { canSave } = usePersonNameValidation(form);
    expect(canSave.value).toBe(false);
    form.given_name = 'Anna';
    expect(canSave.value).toBe(true);
  });
});
