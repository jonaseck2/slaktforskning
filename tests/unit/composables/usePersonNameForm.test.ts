import { describe, it, expect } from 'vitest';
import { ref } from 'vue';
import { usePersonNameForm } from '../../../src/renderer/composables/usePersonNameForm';

describe('usePersonNameForm', () => {
  it('hydrates form from defaultGivenName/defaultSurname in create mode', () => {
    const { form } = usePersonNameForm({
      editingName: null,
      defaultGivenName: 'Anna',
      defaultSurname: 'Andersson',
    });
    expect(form.given_name).toBe('Anna');
    expect(form.surname).toBe('Andersson');
    // Default name_type is 'married' (matches the legacy modal's behavior).
    expect(form.name_type).toBe('married');
  });

  it('hydrates from editingName when present', () => {
    const { form } = usePersonNameForm({
      editingName: {
        id: 'n-1',
        given_name: 'Erik',
        surname: 'Eriksson',
        name_type: 'birth',
        name_prefix: 'Herr',
        nickname: 'Erra',
        date_from: '1900-01-01',
      },
    });
    expect(form.given_name).toBe('Erik');
    expect(form.surname).toBe('Eriksson');
    expect(form.name_type).toBe('birth');
    expect(form.name_prefix).toBe('Herr');
    expect(form.nickname).toBe('Erra');
    expect(form.date_from).toBe('1900-01-01');
  });

  it('re-hydrates when editingNameSource ref changes', async () => {
    const editing = ref<{ id: string; given_name: string; surname: string; name_type: string } | null>({
      id: 'n-1',
      given_name: 'A',
      surname: 'B',
      name_type: 'married',
    });
    const { form } = usePersonNameForm({
      editingName: editing.value,
      editingNameSource: () => editing.value,
    });
    expect(form.given_name).toBe('A');
    editing.value = { id: 'n-2', given_name: 'C', surname: 'D', name_type: 'alias' };
    // Watcher fires on next microtask.
    await new Promise((r) => setTimeout(r, 0));
    expect(form.given_name).toBe('C');
    expect(form.name_type).toBe('alias');
  });
});
