import { describe, it, expect, beforeEach } from 'vitest';
import { reactive, ref, computed } from 'vue';
import { usePersonSave } from '../../../src/renderer/composables/usePersonSave';
import type { PersonForm, PersonBirthForm } from '../../../src/renderer/composables/usePersonForm';

function installApi(api: unknown): void {
  (globalThis as unknown as { window: { api: unknown } }).window = { api } as { api: unknown };
}

function makeForm(overrides: Partial<PersonForm> = {}): PersonForm {
  return reactive({
    given_name: 'Anna',
    surname: 'Andersson',
    sex: 'U' as const,
    subtype: '',
    ...overrides,
  });
}

function makeBirth(overrides: Partial<PersonBirthForm> = {}): PersonBirthForm {
  return reactive({ date: '', placeId: null, ...overrides });
}

describe('usePersonSave', () => {
  beforeEach(() => installApi({}));

  it('calls persons.createWithEvent on create + emits saved', async () => {
    const calls: Array<{ kind: string; args: unknown[] }> = [];
    installApi({
      persons: {
        createWithEvent: async (...args: unknown[]) => {
          calls.push({ kind: 'createWithEvent', args });
          return { person: { id: 'p-new', sex: 'U', living: true } };
        },
      },
    });
    const events: Array<{ name: string; payload?: unknown }> = [];
    const savedPersonIdRef = ref<string | null>(null);
    const { save } = usePersonSave({
      form: makeForm(),
      birth: makeBirth(),
      savedPersonIdRef,
      addRelatedTo: null,
      entryMode: ref<'new' | 'existing'>('new'),
      existingPersonId: ref(null),
      secondParentId: ref(null),
      canSave: computed(() => true),
      emit: (name, payload) => events.push({ name, payload }),
    });
    await save();
    expect(calls.length).toBe(1);
    expect(savedPersonIdRef.value).toBe('p-new');
    expect(events[0].name).toBe('saved');
  });

  it('only sets date_value when birth.date is full ISO (Prime Directive)', async () => {
    let captured: Record<string, unknown> | null = null;
    installApi({
      persons: {
        createWithEvent: async (payload: Record<string, unknown>) => {
          captured = payload;
          return { person: { id: 'p', sex: 'U', living: true } };
        },
      },
    });
    const { save } = usePersonSave({
      form: makeForm(),
      birth: makeBirth({ date: '1880 ungefär' }),
      savedPersonIdRef: ref(null),
      addRelatedTo: null,
      entryMode: ref<'new' | 'existing'>('new'),
      existingPersonId: ref(null),
      secondParentId: ref(null),
      canSave: computed(() => true),
      emit: () => {},
    });
    await save();
    expect(captured).not.toBeNull();
    const ev = (captured as Record<string, unknown>).event as Record<string, unknown>;
    expect(ev.date_value).toBeNull();
    expect(ev.date_original).toBe('1880 ungefär');
  });

  it('calls persons.update on edit (savedPersonId set, no addRelatedTo)', async () => {
    const calls: Array<{ id: string; payload: Record<string, unknown> }> = [];
    installApi({
      persons: {
        update: async (id: string, payload: Record<string, unknown>) => {
          calls.push({ id, payload });
          return { id, sex: payload.sex as string, living: true };
        },
      },
    });
    const { save } = usePersonSave({
      form: makeForm({ sex: 'F' }),
      birth: makeBirth(),
      savedPersonIdRef: ref<string | null>('p-existing'),
      addRelatedTo: null,
      entryMode: ref<'new' | 'existing'>('new'),
      existingPersonId: ref(null),
      secondParentId: ref(null),
      canSave: computed(() => true),
      emit: () => {},
    });
    await save();
    expect(calls.length).toBe(1);
    expect(calls[0].id).toBe('p-existing');
    expect(calls[0].payload.sex).toBe('F');
  });

  it('creates relationship row when addRelatedTo is set', async () => {
    const relCalls: Array<Record<string, unknown>> = [];
    installApi({
      persons: {
        createWithEvent: async () => ({ person: { id: 'p-new', sex: 'U', living: true } }),
      },
      relationships: {
        create: async (input: Record<string, unknown>) => {
          relCalls.push(input);
          return null;
        },
      },
    });
    const { save } = usePersonSave({
      form: makeForm({ subtype: 'biological' }),
      birth: makeBirth(),
      savedPersonIdRef: ref(null),
      addRelatedTo: { personId: 'p-parent', mode: 'son' },
      entryMode: ref<'new' | 'existing'>('new'),
      existingPersonId: ref(null),
      secondParentId: ref(null),
      canSave: computed(() => true),
      emit: () => {},
    });
    await save();
    expect(relCalls.length).toBe(1);
    expect(relCalls[0].type).toBe('parent_child');
    expect(relCalls[0].person1_id).toBe('p-parent'); // parent
    expect(relCalls[0].person2_id).toBe('p-new'); // child
  });

  it('links a second parent for child/son/daughter mode when secondParentId is set', async () => {
    const relCalls: Array<Record<string, unknown>> = [];
    installApi({
      persons: {
        createWithEvent: async () => ({ person: { id: 'p-new', sex: 'U', living: true } }),
      },
      relationships: {
        create: async (input: Record<string, unknown>) => {
          relCalls.push(input);
          return null;
        },
      },
    });
    const { save } = usePersonSave({
      form: makeForm({ subtype: 'biological' }),
      birth: makeBirth(),
      savedPersonIdRef: ref(null),
      addRelatedTo: { personId: 'p-parent1', mode: 'son' },
      entryMode: ref<'new' | 'existing'>('new'),
      existingPersonId: ref(null),
      secondParentId: ref<string | null>('p-parent2'),
      canSave: computed(() => true),
      emit: () => {},
    });
    await save();
    expect(relCalls.length).toBe(2);
    expect(relCalls[1].person1_id).toBe('p-parent2');
    expect(relCalls[1].person2_id).toBe('p-new');
  });

  it('is a no-op when canSave is false', async () => {
    let called = false;
    installApi({
      persons: {
        createWithEvent: async () => { called = true; return { person: { id: 'x', sex: 'U', living: true } }; },
      },
    });
    const { save } = usePersonSave({
      form: makeForm(),
      birth: makeBirth(),
      savedPersonIdRef: ref(null),
      addRelatedTo: null,
      entryMode: ref<'new' | 'existing'>('new'),
      existingPersonId: ref(null),
      secondParentId: ref(null),
      canSave: computed(() => false),
      emit: () => {},
    });
    await save();
    expect(called).toBe(false);
  });
});
