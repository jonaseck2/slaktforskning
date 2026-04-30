import { describe, it, expect, vi, beforeEach } from 'vitest';
import { effectScope, ref, nextTick } from 'vue';
import { usePersonPanelData } from '../../src/renderer/composables/usePersonPanelData';

// onDataChanged listener registry — captures whatever the composable registers
// so the test can fire mutation callbacks at will.
let dataChangedListeners: Array<() => void> = [];

const mockApi = {
  persons: {
    get: vi.fn(),
    getNames: vi.fn(),
    getIdentifiers: vi.fn(),
  },
  events: { forPerson: vi.fn() },
  groups: { forPerson: vi.fn() },
  researchTasks: { forPerson: vi.fn() },
  relationships: { getForPerson: vi.fn() },
  media: { forEntity: vi.fn() },
  places: { get: vi.fn() },
  onDataChanged: vi.fn((cb: () => void) => { dataChangedListeners.push(cb); }),
  offDataChanged: vi.fn((cb: () => void) => {
    const idx = dataChangedListeners.indexOf(cb);
    if (idx !== -1) dataChangedListeners.splice(idx, 1);
  }),
};

// @ts-expect-error test shim
globalThis.window = { api: mockApi } as never;

function setupDefaultMocks() {
  mockApi.persons.get.mockResolvedValue({ id: 'p1', sex: 'M', living: false });
  mockApi.persons.getNames.mockResolvedValue([]);
  mockApi.persons.getIdentifiers.mockResolvedValue([]);
  mockApi.events.forPerson.mockResolvedValue([]);
  mockApi.groups.forPerson.mockResolvedValue([]);
  mockApi.researchTasks.forPerson.mockResolvedValue([]);
  mockApi.relationships.getForPerson.mockResolvedValue([]);
  mockApi.media.forEntity.mockResolvedValue([]);
}

async function flushAsync() {
  // Allow Promise.all chains and watch callbacks to settle.
  for (let i = 0; i < 5; i++) {
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
  }
}

async function waitMs(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

describe('usePersonPanelData', () => {
  beforeEach(() => {
    dataChangedListeners = [];
    Object.values(mockApi.persons).forEach((m) => m.mockReset());
    Object.values(mockApi.events).forEach((m) => m.mockReset());
    Object.values(mockApi.groups).forEach((m) => m.mockReset());
    Object.values(mockApi.researchTasks).forEach((m) => m.mockReset());
    Object.values(mockApi.relationships).forEach((m) => m.mockReset());
    Object.values(mockApi.media).forEach((m) => m.mockReset());
    mockApi.places.get.mockReset();
    mockApi.onDataChanged.mockClear();
    mockApi.offDataChanged.mockClear();
    setupDefaultMocks();
  });

  it('exposes reloadCounts that refreshes count refs from the API', async () => {
    mockApi.events.forPerson.mockResolvedValue([
      { event_type: 'birth', date_value: null, date_original: null, place_id: 'pl1', place_address: null },
      { event_type: 'death', date_value: null, date_original: null, place_id: null, place_address: null },
    ]);
    mockApi.relationships.getForPerson.mockResolvedValue([{}, {}]);
    mockApi.persons.getIdentifiers.mockResolvedValue([{}]);
    mockApi.media.forEntity.mockResolvedValue([{}, {}, {}]);

    const personId = ref<string | null>('p1');
    const scope = effectScope();
    const result = scope.run(() => usePersonPanelData(personId))!;
    await flushAsync();

    expect(result.eventCount.value).toBe(2);
    expect(result.mapPointCount.value).toBe(1);
    expect(result.relationshipCount.value).toBe(2);
    expect(result.identifierCount.value).toBe(1);
    expect(result.mediaCount.value).toBe(3);

    // Mutate underlying data and call reloadCounts directly.
    mockApi.events.forPerson.mockResolvedValue([
      { event_type: 'birth', date_value: null, date_original: null, place_id: 'pl1', place_address: null },
      { event_type: 'death', date_value: null, date_original: null, place_id: null, place_address: null },
      { event_type: 'baptism', date_value: null, date_original: null, place_id: null, place_address: null },
    ]);
    mockApi.relationships.getForPerson.mockResolvedValue([]);

    await result.reloadCounts('p1');
    expect(result.eventCount.value).toBe(3);
    expect(result.relationshipCount.value).toBe(0);
    scope.stop();
  });

  it('registers an onDataChanged listener that refreshes counts on mutation', async () => {
    const personId = ref<string | null>('p1');
    const scope = effectScope();
    const result = scope.run(() => usePersonPanelData(personId))!;
    await flushAsync();

    expect(mockApi.onDataChanged).toHaveBeenCalledTimes(1);
    expect(dataChangedListeners.length).toBe(1);

    // Simulate a mutation that adds an event for this person.
    mockApi.events.forPerson.mockResolvedValue([
      { event_type: 'birth', date_value: null, date_original: null, place_id: null, place_address: null },
    ]);

    // Fire the mutation listener — debounced 150ms.
    dataChangedListeners[0]();
    await waitMs(180);
    await flushAsync();

    expect(result.eventCount.value).toBe(1);
    scope.stop();
  });

  it('debounces rapid mutations into a single reloadCounts call', async () => {
    const personId = ref<string | null>('p1');
    const scope = effectScope();
    scope.run(() => usePersonPanelData(personId))!;
    await flushAsync();
    mockApi.events.forPerson.mockClear();

    // Fire mutation 5 times within the debounce window.
    for (let i = 0; i < 5; i++) {
      dataChangedListeners[0]();
      await waitMs(20);
    }
    // Now let the trailing debounce timer expire.
    await waitMs(180);
    await flushAsync();

    // Only one reloadCounts run -> one events.forPerson call.
    expect(mockApi.events.forPerson).toHaveBeenCalledTimes(1);
    scope.stop();
  });

  it('removes its listener when the effect scope is stopped', async () => {
    const personId = ref<string | null>('p1');
    const scope = effectScope();
    scope.run(() => usePersonPanelData(personId))!;
    await flushAsync();

    expect(dataChangedListeners.length).toBe(1);
    scope.stop();
    expect(mockApi.offDataChanged).toHaveBeenCalledTimes(1);
    expect(dataChangedListeners.length).toBe(0);
  });
});
