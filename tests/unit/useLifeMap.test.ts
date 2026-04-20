import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref, nextTick } from 'vue';
import { useLifeMap } from '../../src/renderer/composables/useLifeMap';

const mockApi = {
  events: { forPerson: vi.fn() },
  places: { get: vi.fn() },
};
// @ts-expect-error test shim
globalThis.window = { api: mockApi } as never;

describe('useLifeMap', () => {
  beforeEach(() => {
    mockApi.events.forPerson.mockReset();
    mockApi.places.get.mockReset();
  });

  it('returns geocoded events sorted chronologically', async () => {
    mockApi.events.forPerson.mockResolvedValue([
      { id: 'e1', event_type: 'birth', date_value: '1850-01-01', place_id: 'p1' },
      { id: 'e2', event_type: 'death', date_value: '1920-01-01', place_id: 'p2' },
    ]);
    mockApi.places.get.mockImplementation(async (id: string) => {
      if (id === 'p1') return { id, name: 'A', latitude: 1, longitude: 1 };
      if (id === 'p2') return { id, name: 'B', latitude: 2, longitude: 2 };
      return null;
    });

    const personId = ref<string | null>('person-1');
    const { data } = useLifeMap(personId);
    await nextTick();
    await new Promise((r) => setTimeout(r, 10));
    expect(data.value.events).toHaveLength(2);
    expect(data.value.events[0].eventType).toBe('birth');
    expect(data.value.events[1].eventType).toBe('death');
    expect(data.value.bounds).toEqual({ north: 2, south: 1, east: 2, west: 1 });
  });

  it('skips events without place_id or without lat/lon', async () => {
    mockApi.events.forPerson.mockResolvedValue([
      { id: 'e1', event_type: 'birth', date_value: '1850-01-01', place_id: null },
      { id: 'e2', event_type: 'death', date_value: '1920-01-01', place_id: 'p2' },
    ]);
    mockApi.places.get.mockResolvedValue({ name: 'B', latitude: null, longitude: null });
    const personId = ref<string | null>('person-1');
    const { data } = useLifeMap(personId);
    await nextTick();
    await new Promise((r) => setTimeout(r, 10));
    expect(data.value.events).toHaveLength(0);
  });
});
