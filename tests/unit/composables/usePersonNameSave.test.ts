import { describe, it, expect, beforeEach } from 'vitest';
import { reactive, ref, computed } from 'vue';
import { usePersonNameSave } from '../../../src/renderer/composables/usePersonNameSave';
import type { PersonNameForm } from '../../../src/renderer/composables/usePersonNameForm';

function installApi(api: unknown): void {
  (globalThis as unknown as { window: { api: unknown } }).window = { api } as { api: unknown };
}

function makeForm(overrides: Partial<PersonNameForm> = {}): PersonNameForm {
  return reactive({
    given_name: 'Anna',
    surname: 'Andersson',
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

describe('usePersonNameSave', () => {
  beforeEach(() => installApi({}));

  it('calls persons.addName on create + flushes pending citations + emits saved/close', async () => {
    const calls: Array<{ kind: string; args: unknown[] }> = [];
    installApi({
      persons: {
        addName: async (...args: unknown[]) => {
          calls.push({ kind: 'addName', args });
          return { id: 'n-new' };
        },
      },
      citations: {
        create: async (input: Record<string, unknown>) => {
          calls.push({ kind: 'createCitation', args: [input] });
          return { id: 'c-new' };
        },
      },
    });
    const events: Array<{ name: string }> = [];
    const form = makeForm();
    const savedNameIdRef = ref<string | null>(null);
    const pendingCitations = ref<Array<{ source_id: string; page: string | null; confidence: number | null; transcription: string; notes: string; date_accessed: string; tempId?: string }>>([
      { source_id: 's-1', page: '5', confidence: 3, transcription: '', notes: '', date_accessed: '' },
    ]);
    const { save } = usePersonNameSave({
      form,
      pendingCitations,
      savedNameIdRef,
      personId: 'p-1',
      isEdit: () => false,
      canSave: computed(() => true),
      emit: (name) => events.push({ name }),
    });
    await save();
    expect(calls.filter((c) => c.kind === 'addName').length).toBe(1);
    expect(calls.filter((c) => c.kind === 'createCitation').length).toBe(1);
    expect(savedNameIdRef.value).toBe('n-new');
    expect(pendingCitations.value.length).toBe(0);
    expect(events.map((e) => e.name)).toEqual(['saved', 'close']);
  });

  it('calls persons.updateName on edit', async () => {
    const calls: Array<{ id: string; payload: Record<string, unknown> }> = [];
    installApi({
      persons: {
        updateName: async (id: string, payload: Record<string, unknown>) => {
          calls.push({ id, payload });
          return null;
        },
      },
    });
    const savedNameIdRef = ref<string | null>('n-existing');
    const { save } = usePersonNameSave({
      form: makeForm({ given_name: 'B', surname: 'C' }),
      pendingCitations: ref([]),
      savedNameIdRef,
      personId: 'p-1',
      isEdit: () => true,
      canSave: computed(() => true),
      emit: () => {},
    });
    await save();
    expect(calls.length).toBe(1);
    expect(calls[0].id).toBe('n-existing');
    expect(calls[0].payload.given_name).toBe('B');
  });

  it('is a no-op when canSave is false', async () => {
    let called = false;
    installApi({
      persons: { addName: async () => { called = true; return { id: 'x' }; } },
    });
    const { save } = usePersonNameSave({
      form: makeForm(),
      pendingCitations: ref([]),
      savedNameIdRef: ref<string | null>(null),
      personId: 'p-1',
      isEdit: () => false,
      canSave: computed(() => false),
      emit: () => {},
    });
    await save();
    expect(called).toBe(false);
  });

  it('preserves date_to even when hidden in UI mode (Prime Directive)', async () => {
    let captured: Record<string, unknown> | null = null;
    installApi({
      persons: {
        addName: async (_pid: string, payload: Record<string, unknown>) => {
          captured = payload;
          return { id: 'n-new' };
        },
      },
    });
    // name_type='birth' would hide date_to in the UI but the form value
    // persists and must reach the payload.
    const form = makeForm({ name_type: 'birth', date_to: '1950-01-01' });
    const { save } = usePersonNameSave({
      form,
      pendingCitations: ref([]),
      savedNameIdRef: ref<string | null>(null),
      personId: 'p-1',
      isEdit: () => false,
      canSave: computed(() => true),
      emit: () => {},
    });
    await save();
    expect(captured).not.toBeNull();
    expect((captured as Record<string, unknown>).date_to).toBe('1950-01-01');
  });
});
