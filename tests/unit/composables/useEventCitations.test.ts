import { describe, it, expect, beforeEach } from 'vitest';
import { useEventCitations } from '../../../src/renderer/composables/useEventCitations';

// Composable runs in node env — install a window stub with an api shape we
// can swap per-test.
function installApi(api: unknown): void {
  (globalThis as unknown as { window: { api: unknown } }).window = { api } as { api: unknown };
}

describe('useEventCitations', () => {
  beforeEach(() => {
    installApi({});
  });

  it('starts with empty citation list for new events (eventId null)', async () => {
    const { citations, loading } = useEventCitations(null);
    // No id → no fetch; loading must settle false immediately and list stays empty.
    await new Promise((r) => setTimeout(r, 10));
    expect(citations.value).toEqual([]);
    expect(loading.value).toBe(false);
  });

  it('loads existing citations on edit (eventId set)', async () => {
    installApi({
      citations: {
        forEvent: async (id: string) => {
          expect(id).toBe('ev-1');
          return [
            { id: 'c1', source_id: 's1', page: '12', confidence: 3 },
            { id: 'c2', source_id: 's2', page: null, confidence: 1 },
          ];
        },
      },
      sources: {
        get: async (id: string) =>
          id === 's1' ? { title: 'Parish Book' } : { title: 'Census 1900' },
      },
    });
    const { citations, loading } = useEventCitations('ev-1');
    expect(loading.value).toBe(true);
    await new Promise((r) => setTimeout(r, 30));
    expect(citations.value).toHaveLength(2);
    expect(citations.value[0]).toMatchObject({
      id: 'c1',
      sourceTitle: 'Parish Book',
      page: '12',
      confidence: 3,
    });
    expect(citations.value[1]).toMatchObject({
      id: 'c2',
      sourceTitle: 'Census 1900',
      page: null,
      confidence: 1,
    });
    expect(loading.value).toBe(false);
  });

  it('addPending appends a buffered citation when the event is not yet saved', () => {
    const { pendingCitations, addPending } = useEventCitations(null);
    expect(pendingCitations.value).toEqual([]);
    addPending({
      source_id: 's1',
      sourceTitle: 'Parish Book',
      page: '12',
      confidence: 3,
      transcription: '',
      notes: '',
      date_accessed: '',
    });
    expect(pendingCitations.value).toHaveLength(1);
    expect(pendingCitations.value[0]).toMatchObject({
      source_id: 's1',
      sourceTitle: 'Parish Book',
      page: '12',
      confidence: 3,
    });
    expect(pendingCitations.value[0].tempId).toMatch(/^pending-/);
  });
});
