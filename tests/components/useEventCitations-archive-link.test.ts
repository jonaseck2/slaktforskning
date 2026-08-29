// A citation imported from ArkivDigital offers a link to the archive image it
// came from. The URL is resolved on every load and never stored — the DB holds
// the pointer the import file carried and nothing else.
//
// See docs/plans/2026-08-23-ad-citation-aid.md Task 7.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useEventCitations } from '../../src/renderer/composables/useEventCitations';

interface WindowWithApi {
  api?: {
    citations?: { forEvent?: (id: string) => Promise<unknown[]> };
    sources?: { get?: (id: string) => Promise<{ title: string } | null> };
    externalIdentifiers?: {
      forEntity?: (t: string, id: string) => Promise<Array<{ system: string; value: string }>>;
    };
  };
}

const w = globalThis as unknown as WindowWithApi;

function stubApi(idents: Array<{ system: string; value: string }>): void {
  w.api = {
    citations: {
      forEvent: async () => [
        { id: 'cit-1', source_id: 'src-1', page: '52', confidence: 2 },
      ],
    },
    sources: { get: async () => ({ title: 'Valbo C:15' }) },
    externalIdentifiers: { forEntity: async () => idents },
  };
}

/** The composable loads without awaiting; give the microtask queue a turn. */
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { delete w.api; });

describe('citation archive link', () => {
  it('resolves an ArkivDigital image pointer to a URL', async () => {
    stubApi([{ system: 'arkivdigital.image', value: 'v191316.b580.s52' }]);
    const { citations, reload } = useEventCitations('ev-1');
    await reload();
    await settle();
    expect(citations.value).toHaveLength(1);
    expect(citations.value[0].archiveUrl)
      .toBe('https://www.arkivdigital.se/aid/show/v191316.b580.s52');
  });

  it('offers no link for a system with no URL shape', async () => {
    stubApi([{ system: 'gramps.handle', value: 'abcdef' }]);
    const { citations, reload } = useEventCitations('ev-1');
    await reload();
    await settle();
    expect(citations.value[0].archiveUrl).toBeNull();
  });

  it('offers no link when the citation carries no identifier', async () => {
    stubApi([]);
    const { citations, reload } = useEventCitations('ev-1');
    await reload();
    await settle();
    expect(citations.value[0].archiveUrl).toBeNull();
  });

  it('still lists the citation when the identifier lookup throws', async () => {
    stubApi([]);
    w.api!.externalIdentifiers!.forEntity = async () => { throw new Error('IPC down'); };
    const { citations, reload } = useEventCitations('ev-1');
    await reload();
    await settle();
    expect(citations.value, 'a failed link lookup must not blank the list').toHaveLength(1);
    expect(citations.value[0].archiveUrl).toBeNull();
  });

  it('works on a build with no externalIdentifiers domain at all', async () => {
    stubApi([]);
    delete w.api!.externalIdentifiers;
    const { citations, reload } = useEventCitations('ev-1');
    await reload();
    await settle();
    expect(citations.value).toHaveLength(1);
    expect(citations.value[0].archiveUrl).toBeNull();
  });

  it('carries the link through to the merged rows the template renders', async () => {
    stubApi([{ system: 'arkivdigital.image', value: 'v1.b2' }]);
    const { allCitationRows, reload } = useEventCitations('ev-1');
    await reload();
    await settle();
    expect(allCitationRows.value[0].archiveUrl)
      .toBe('https://www.arkivdigital.se/aid/show/v1.b2');
  });
});
