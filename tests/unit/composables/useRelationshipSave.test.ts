import { describe, it, expect, beforeEach } from 'vitest';
import { reactive, ref, computed } from 'vue';
import { useRelationshipSave } from '../../../src/renderer/composables/useRelationshipSave';
import type { RelationshipForm } from '../../../src/renderer/composables/useRelationshipForm';

function installApi(api: unknown): void {
  (globalThis as unknown as { window: { api: unknown } }).window = { api } as { api: unknown };
}

function makeForm(overrides: Partial<RelationshipForm> = {}): RelationshipForm {
  return reactive({
    type: 'couple',
    subtype: 'marriage',
    person1_id: 'p-1',
    person2_id: 'p-2',
    notes: '',
    ...overrides,
  });
}

describe('useRelationshipSave', () => {
  beforeEach(() => installApi({}));

  it('calls relationships.create on create + sets savedRelationshipIdRef', async () => {
    const calls: Array<Record<string, unknown>> = [];
    installApi({
      relationships: {
        create: async (payload: Record<string, unknown>) => {
          calls.push(payload);
          return { id: 'r-new', type: 'couple', person1_id: 'p-1', person2_id: 'p-2', subtype: 'marriage', notes: '' };
        },
      },
    });
    const savedRelationshipIdRef = ref<string | null>(null);
    const { save } = useRelationshipSave({
      form: makeForm(),
      savedRelationshipIdRef,
      canSave: computed(() => true),
      emit: () => {},
    });
    const rel = await save();
    expect(rel?.id).toBe('r-new');
    expect(savedRelationshipIdRef.value).toBe('r-new');
    expect(calls[0].type).toBe('couple');
  });

  it('calls relationships.update on edit', async () => {
    const calls: Array<{ id: string; payload: Record<string, unknown> }> = [];
    installApi({
      relationships: {
        update: async (id: string, payload: Record<string, unknown>) => {
          calls.push({ id, payload });
          return { id, type: 'couple', person1_id: 'p-1', person2_id: 'p-2', subtype: 'marriage', notes: '' };
        },
      },
    });
    const { save } = useRelationshipSave({
      form: makeForm(),
      savedRelationshipIdRef: ref<string | null>('r-existing'),
      canSave: computed(() => true),
      emit: () => {},
    });
    await save();
    expect(calls[0].id).toBe('r-existing');
  });

  it('returns null when canSave is false', async () => {
    let called = false;
    installApi({
      relationships: { create: async () => { called = true; return { id: 'x' }; } },
    });
    const { save } = useRelationshipSave({
      form: makeForm(),
      savedRelationshipIdRef: ref<string | null>(null),
      canSave: computed(() => false),
      emit: () => {},
    });
    const result = await save();
    expect(result).toBeNull();
    expect(called).toBe(false);
  });

  it('writes empty notes as empty string, not null (Prime Directive)', async () => {
    let captured: Record<string, unknown> | null = null;
    installApi({
      relationships: {
        create: async (payload: Record<string, unknown>) => {
          captured = payload;
          return { id: 'r-new' };
        },
      },
    });
    const { save } = useRelationshipSave({
      form: makeForm({ notes: '' }),
      savedRelationshipIdRef: ref<string | null>(null),
      canSave: computed(() => true),
      emit: () => {},
    });
    await save();
    expect(captured).not.toBeNull();
    expect((captured as Record<string, unknown>).notes).toBe('');
  });
});
