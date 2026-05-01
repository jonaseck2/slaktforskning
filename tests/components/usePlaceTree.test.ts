import { describe, it, expect, beforeEach, vi } from 'vitest';
import { usePlaceTree, type PlaceTreeNode } from '../../src/renderer/composables/usePlaceTree';

type DbPlace = { id: string; name: string; parent_place_id: string | null; place_type: string | null; hasChildren: boolean };
type GazNode = { name: string; type: string; children?: GazNode[] };
type Gaz = { id: string; name: string; root: GazNode };

function setupApiMock(places: DbPlace[]) {
  (globalThis as any).window = (globalThis as any).window ?? {};
  (window as any).api = {
    places: {
      listChildren: vi.fn((parentId: string | null) =>
        Promise.resolve(places.filter(p => (p.parent_place_id ?? null) === parentId))),
      getAncestors: vi.fn((id: string) => {
        const out: DbPlace[] = [];
        let cur = places.find(p => p.id === id);
        while (cur) { out.unshift(cur); cur = cur.parent_place_id ? places.find(p => p.id === cur!.parent_place_id) : undefined; }
        return Promise.resolve(out);
      }),
    },
  };
}

function makeGaz(id: string, root: GazNode): Gaz { return { id, name: id, root }; }

describe('usePlaceTree', () => {
  beforeEach(() => {
    (window as any).api = undefined;
  });

  it('builds merged roots from DB places and gazetteers, deduped by name', async () => {
    setupApiMock([
      { id: 'db-sv', name: 'Sverige', parent_place_id: null, place_type: 'country', hasChildren: false },
      { id: 'db-no', name: 'Norge', parent_place_id: null, place_type: 'country', hasChildren: false },
    ]);
    const gazetteers: Gaz[] = [
      makeGaz('sv-geo', { name: 'Sverige', type: 'country', children: [{ name: 'Stockholm', type: 'county' }] }),
      makeGaz('dk-geo', { name: 'Danmark', type: 'country' }),
    ];
    const tree = usePlaceTree({ getGazetteers: () => gazetteers });
    await tree.loadRoots();
    const names = tree.roots.value.map(n => n.name).sort();
    expect(names).toEqual(['Danmark', 'Norge', 'Sverige']);
    const sv = tree.roots.value.find(n => n.name === 'Sverige')!;
    expect(sv.source).toBe('merged');
    expect(sv.dbId).toBe('db-sv');
    expect(sv.gazId).toBe('sv-geo');
    expect(sv.hasChildren).toBe(true);
  });

  it('expandNode lazy-builds children from DB and gazetteer', async () => {
    setupApiMock([
      { id: 'db-sv', name: 'Sverige', parent_place_id: null, place_type: null, hasChildren: true },
      { id: 'db-skane', name: 'Skåne', parent_place_id: 'db-sv', place_type: null, hasChildren: false },
    ]);
    const gazetteers: Gaz[] = [
      makeGaz('sv-geo', {
        name: 'Sverige',
        type: 'country',
        children: [{ name: 'Stockholm', type: 'county' }, { name: 'Skåne', type: 'county' }],
      }),
    ];
    const tree = usePlaceTree({ getGazetteers: () => gazetteers });
    await tree.loadRoots();
    const sv = tree.roots.value.find(n => n.name === 'Sverige')!;
    await tree.expandNode(sv);
    const childNames = sv.children.map(c => c.name).sort();
    expect(childNames).toEqual(['Skåne', 'Stockholm']);
    const skane = sv.children.find(c => c.name === 'Skåne')!;
    expect(skane.source).toBe('merged');
    expect(skane.dbId).toBe('db-skane');
    expect(sv.childrenLoaded).toBe(true);
  });

  it('findPathTo returns the chain of node keys for a DB place id', async () => {
    setupApiMock([
      { id: 'db-sv', name: 'Sverige', parent_place_id: null, place_type: null, hasChildren: true },
      { id: 'db-sthlm', name: 'Stockholm', parent_place_id: 'db-sv', place_type: null, hasChildren: true },
      { id: 'db-solna', name: 'Solna', parent_place_id: 'db-sthlm', place_type: null, hasChildren: false },
    ]);
    const gazetteers: Gaz[] = [];
    const tree = usePlaceTree({ getGazetteers: () => gazetteers });
    await tree.loadRoots();
    const path = await tree.findPathTo('db-solna');
    expect(path.map(n => n.name)).toEqual(['Sverige', 'Stockholm', 'Solna']);
  });
});
