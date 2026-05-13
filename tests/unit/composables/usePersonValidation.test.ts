import { describe, it, expect } from 'vitest';
import { reactive, ref } from 'vue';
import { usePersonValidation } from '../../../src/renderer/composables/usePersonValidation';
import type { PersonForm } from '../../../src/renderer/composables/usePersonForm';

function makeForm(overrides: Partial<PersonForm> = {}): PersonForm {
  return reactive({
    given_name: '',
    surname: '',
    sex: 'U' as const,
    subtype: '',
    ...overrides,
  });
}

describe('usePersonValidation', () => {
  it('rejects empty given+surname in create mode', () => {
    const { canSave } = usePersonValidation({
      form: makeForm(),
      savedPersonId: ref<string | null>(null),
      hasAddRelatedTo: () => false,
      entryMode: ref<'new' | 'existing'>('new'),
      existingPersonId: ref<string | null>(null),
    });
    expect(canSave.value).toBe(false);
  });

  it('accepts given-only or surname-only in create mode', () => {
    const { canSave: a } = usePersonValidation({
      form: makeForm({ given_name: 'Anna' }),
      savedPersonId: ref(null),
      hasAddRelatedTo: () => false,
      entryMode: ref<'new' | 'existing'>('new'),
      existingPersonId: ref(null),
    });
    expect(a.value).toBe(true);

    const { canSave: b } = usePersonValidation({
      form: makeForm({ surname: 'Andersson' }),
      savedPersonId: ref(null),
      hasAddRelatedTo: () => false,
      entryMode: ref<'new' | 'existing'>('new'),
      existingPersonId: ref(null),
    });
    expect(b.value).toBe(true);
  });

  it('is always true in pure edit mode (savedPersonId set, no addRelatedTo)', () => {
    const { canSave } = usePersonValidation({
      form: makeForm(),
      savedPersonId: ref<string | null>('p-existing'),
      hasAddRelatedTo: () => false,
      entryMode: ref<'new' | 'existing'>('new'),
      existingPersonId: ref(null),
    });
    expect(canSave.value).toBe(true);
  });

  it('gates on existingPersonId in existing-link mode', () => {
    const existing = ref<string | null>(null);
    const { canSave } = usePersonValidation({
      form: makeForm(),
      savedPersonId: ref(null),
      hasAddRelatedTo: () => true,
      entryMode: ref<'new' | 'existing'>('existing'),
      existingPersonId: existing,
    });
    expect(canSave.value).toBe(false);
    existing.value = 'p-existing';
    expect(canSave.value).toBe(true);
  });
});
