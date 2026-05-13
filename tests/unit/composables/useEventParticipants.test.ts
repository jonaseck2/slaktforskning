import { describe, it, expect, beforeEach } from 'vitest';
import { useEventParticipants } from '../../../src/renderer/composables/useEventParticipants';

function installApi(api: unknown): void {
  (globalThis as unknown as { window: { api: unknown } }).window = { api } as { api: unknown };
}

describe('useEventParticipants', () => {
  beforeEach(() => {
    installApi({});
  });

  it('seeds primary participant on a new event (no eventId)', async () => {
    const { participants, primaryPersonId } = useEventParticipants(null, 'person-1');
    // Give microtasks a chance to flush.
    await new Promise((r) => setTimeout(r, 10));
    expect(primaryPersonId.value).toBe('person-1');
    // For a brand-new event there's no saved row yet — the primary is
    // tracked as an implicit pending participant the modal flushes in
    // useEventSave. The list shape exposes it for the UI.
    expect(participants.value).toEqual([
      expect.objectContaining({ person_id: 'person-1', role: 'primary' }),
    ]);
  });

  it('loads existing participants on edit (eventId set)', async () => {
    installApi({
      eventParticipants: {
        getForEvent: async (id: string) => {
          expect(id).toBe('ev-1');
          return [
            { id: 'p1', event_id: 'ev-1', person_id: 'person-1', role: 'primary' },
            { id: 'p2', event_id: 'ev-1', person_id: 'person-2', role: 'spouse' },
          ];
        },
      },
    });
    const { participants, loading } = useEventParticipants('ev-1', 'person-1');
    expect(loading.value).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(participants.value).toHaveLength(2);
    expect(participants.value[1]).toMatchObject({ person_id: 'person-2', role: 'spouse' });
    expect(loading.value).toBe(false);
  });

  it('setRole updates the role for a participant in the list', async () => {
    installApi({
      eventParticipants: {
        getForEvent: async () => [
          { id: 'p1', event_id: 'ev-1', person_id: 'person-1', role: 'primary' },
          { id: 'p2', event_id: 'ev-1', person_id: 'person-2', role: 'witness' },
        ],
      },
    });
    const { participants, setRole } = useEventParticipants('ev-1', 'person-1');
    await new Promise((r) => setTimeout(r, 20));
    setRole('p2', 'godparent');
    expect(participants.value.find((p) => p.id === 'p2')?.role).toBe('godparent');
  });
});
