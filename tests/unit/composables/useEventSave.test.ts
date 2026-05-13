import { describe, it, expect, beforeEach } from 'vitest';
import { reactive, ref, computed } from 'vue';
import { useEventSave } from '../../../src/renderer/composables/useEventSave';
import type { EventForm } from '../../../src/renderer/composables/useEventForm';

function installApi(api: unknown): void {
  (globalThis as unknown as { window: { api: unknown } }).window = { api } as { api: unknown };
}

function makeForm(overrides: Partial<EventForm> = {}): EventForm {
  return reactive({
    event_type: 'birth',
    date_type: 'exact',
    date_value: null,
    date_value_end: null,
    date_original: '',
    place_id: null,
    cause: null,
    value: null,
    notes: '',
    ...overrides,
  });
}

describe('useEventSave', () => {
  beforeEach(() => {
    installApi({});
  });

  it('calls events.create for a new event and flushes pending citations + participants', async () => {
    const createCalls: unknown[] = [];
    const updateCalls: unknown[] = [];
    const citationCreates: unknown[] = [];
    const participantAdds: unknown[] = [];
    installApi({
      events: {
        create: async (input: unknown) => {
          createCalls.push(input);
          return { id: 'ev-new', ...(input as object) };
        },
        update: async (id: string, input: unknown) => {
          updateCalls.push({ id, input });
          return { id, ...(input as object) };
        },
      },
      citations: {
        create: async (input: unknown) => {
          citationCreates.push(input);
          return { id: 'c-' + citationCreates.length };
        },
      },
      eventParticipants: {
        add: async (input: unknown) => {
          participantAdds.push(input);
          return { id: 'pp-' + participantAdds.length };
        },
      },
    });

    const form = makeForm({ event_type: 'birth' });
    const pendingCitations = ref([
      {
        tempId: 'pending-1',
        source_id: 's1',
        sourceTitle: 'Parish Book',
        page: '12',
        confidence: 3,
        transcription: '',
        notes: '',
        date_accessed: '',
      },
    ]);
    const participants = ref([
      { id: 'pending:primary:1', event_id: null, person_id: 'person-1', role: 'primary' },
      { id: 'pending:spouse:2', event_id: null, person_id: 'person-2', role: 'spouse' },
    ]);
    const eventIdRef = ref<string | null>(null);

    const emitted: Array<[string, unknown]> = [];
    const { save, saving, lastError } = useEventSave({
      form,
      pendingCitations,
      participants,
      eventIdRef,
      mode: 'create',
      canSave: computed(() => true),
      emit: (name: string, payload: unknown) => emitted.push([name, payload]),
    });

    expect(saving.value).toBe(false);
    await save();
    expect(saving.value).toBe(false);
    expect(lastError.value).toBeNull();
    expect(createCalls).toHaveLength(1);
    expect(updateCalls).toHaveLength(0);
    expect(citationCreates).toHaveLength(1);
    expect(citationCreates[0]).toMatchObject({ source_id: 's1', event_id: 'ev-new' });
    expect(participantAdds).toHaveLength(2);
    expect(emitted[0]?.[0]).toBe('saved');
    expect(eventIdRef.value).toBe('ev-new');
  });

  it('calls events.update for an existing event (no citation/participant flush)', async () => {
    const createCalls: unknown[] = [];
    const updateCalls: unknown[] = [];
    const citationCreates: unknown[] = [];
    installApi({
      events: {
        create: async (input: unknown) => {
          createCalls.push(input);
          return { id: 'should-not-be-used', ...(input as object) };
        },
        update: async (id: string, input: unknown) => {
          updateCalls.push({ id, input });
          return { id, ...(input as object) };
        },
      },
      citations: {
        create: async (input: unknown) => {
          citationCreates.push(input);
          return { id: 'unexpected' };
        },
      },
    });

    const form = makeForm({ event_type: 'marriage' });
    const pendingCitations = ref([]); // empty — they were persisted on first save
    const participants = ref([]);
    const eventIdRef = ref<string | null>('ev-existing');

    const emitted: Array<[string, unknown]> = [];
    const { save } = useEventSave({
      form,
      pendingCitations,
      participants,
      eventIdRef,
      mode: 'edit',
      canSave: computed(() => true),
      emit: (name: string, payload: unknown) => emitted.push([name, payload]),
    });

    await save();
    expect(createCalls).toHaveLength(0);
    expect(updateCalls).toHaveLength(1);
    expect((updateCalls[0] as { id: string }).id).toBe('ev-existing');
    expect(citationCreates).toHaveLength(0); // no pending → no creates
    expect(emitted[0]?.[0]).toBe('saved');
  });

  it('surfaces lastError + does not emit saved when events.create rejects', async () => {
    installApi({
      events: {
        create: async () => {
          throw new Error('boom');
        },
      },
    });

    const form = makeForm({ event_type: 'birth' });
    const pendingCitations = ref([]);
    const participants = ref([]);
    const eventIdRef = ref<string | null>(null);

    const emitted: Array<[string, unknown]> = [];
    const { save, lastError, saving } = useEventSave({
      form,
      pendingCitations,
      participants,
      eventIdRef,
      mode: 'create',
      canSave: computed(() => true),
      emit: (name: string, payload: unknown) => emitted.push([name, payload]),
    });

    await save();
    expect(lastError.value).toContain('boom');
    expect(saving.value).toBe(false);
    expect(emitted).toHaveLength(0); // no saved emit on error
  });

  it('refuses to save when canSave is false', async () => {
    const calls: unknown[] = [];
    installApi({
      events: {
        create: async (input: unknown) => {
          calls.push(input);
          return { id: 'should-not-be-called' };
        },
      },
    });
    const form = makeForm({ event_type: '' });
    const pendingCitations = ref([]);
    const participants = ref([]);
    const eventIdRef = ref<string | null>(null);
    const emitted: Array<[string, unknown]> = [];
    const { save } = useEventSave({
      form,
      pendingCitations,
      participants,
      eventIdRef,
      mode: 'create',
      canSave: computed(() => false),
      emit: (name: string, payload: unknown) => emitted.push([name, payload]),
    });
    await save();
    expect(calls).toHaveLength(0);
    expect(emitted).toHaveLength(0);
  });
});
