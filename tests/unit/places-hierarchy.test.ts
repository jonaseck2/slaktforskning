// Bulk hierarchical place resolution.
// See docs/plans/2026-08-23-arkivdigital-profile.md Task 3.
//
// Measured on the four real ArkivDigital exports: 335 distinct _PARISH_AID for
// 333 distinct parish names. The two collisions — 'Viby' (Örebro / Östergötland)
// and 'Halmstad' (Halland / Malmöhus) — sit in *different* counties, so the
// parent chain alone separates them in this corpus. externalId still
// participates in identity: a same-name-same-county pair is possible in Sweden,
// and merging two real parishes into one row is not recoverable by the user.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { bulkResolveHierarchy } from '../../src/api/places_hierarchy';
import { queryAll } from '../../src/api/db';
import { createTestDb } from './helpers';

let db: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => { db = await createTestDb(); });

const SVERIGE = { name: 'Sverige', type: 'country' };
const GAVLE = { name: 'Gävleborgs län', type: 'admin1' };

describe('bulkResolveHierarchy', () => {
  it('creates each level once and chains parent_place_id', async () => {
    await bulkResolveHierarchy(db, [
      [SVERIGE, GAVLE, { name: 'Hedesunda', type: 'parish' }, { name: 'Högnäs', type: 'locality' }],
      [SVERIGE, GAVLE, { name: 'Hedesunda', type: 'parish' }, { name: 'Bäck', type: 'locality' }],
    ]);
    const rows = await queryAll<{ id: string; name: string; parent_place_id: string | null }>(
      db, 'SELECT id, name, parent_place_id FROM places ORDER BY name');
    expect(rows.map(r => r.name)).toEqual(['Bäck', 'Gävleborgs län', 'Hedesunda', 'Högnäs', 'Sverige']);
    const idOf = (n: string): string => rows.find(r => r.name === n)!.id;
    const parentOf = (n: string): string | null => rows.find(r => r.name === n)!.parent_place_id;
    expect(parentOf('Sverige')).toBeNull();
    expect(parentOf('Gävleborgs län')).toBe(idOf('Sverige'));
    expect(parentOf('Hedesunda')).toBe(idOf('Gävleborgs län'));
    expect(parentOf('Högnäs')).toBe(idOf('Hedesunda'));
  });

  it('records the declared place_type on each level', async () => {
    await bulkResolveHierarchy(db, [
      [SVERIGE, GAVLE, { name: 'Valbo', type: 'parish' }],
    ]);
    const rows = await queryAll<{ name: string; place_type: string | null }>(
      db, 'SELECT name, place_type FROM places');
    const typeOf = (n: string): string | null => rows.find(r => r.name === n)!.place_type;
    expect(typeOf('Sverige')).toBe('country');
    expect(typeOf('Gävleborgs län')).toBe('admin1');
    expect(typeOf('Valbo')).toBe('parish');
  });

  it('keys the returned map by the joined chain and returns the innermost place', async () => {
    const chain = [SVERIGE, GAVLE, { name: 'Valbo', type: 'parish' }];
    const map = await bulkResolveHierarchy(db, [chain]);
    expect(map.get(chain.map(l => l.name).join(' > '))!.place.name).toBe('Valbo');
  });

  it('separates two same-named parishes in DIFFERENT counties by their parent', async () => {
    await bulkResolveHierarchy(db, [
      [SVERIGE, { name: 'Örebro län', type: 'admin1' }, { name: 'Viby', type: 'parish', externalId: 'a1400' }],
      [SVERIGE, { name: 'Östergötlands län', type: 'admin1' }, { name: 'Viby', type: 'parish', externalId: 'a901' }],
    ]);
    const vibys = await queryAll<{ id: string }>(db, "SELECT id FROM places WHERE name = 'Viby'");
    expect(vibys, 'the two real Viby parishes were merged into one row').toHaveLength(2);
  });

  it('separates two same-named parishes in the SAME county by their externalId', async () => {
    // Not present in the ArkivDigital corpus, but merging two real parishes is
    // not something the user can undo, so identity includes the id when given.
    await bulkResolveHierarchy(db, [
      [SVERIGE, GAVLE, { name: 'Hov', type: 'parish', externalId: 'a1' }],
      [SVERIGE, GAVLE, { name: 'Hov', type: 'parish', externalId: 'a2' }],
    ]);
    const hovs = await queryAll<{ id: string }>(db, "SELECT id FROM places WHERE name = 'Hov'");
    expect(hovs, 'two parishes with distinct ids were merged').toHaveLength(2);
  });

  it('treats a missing externalId as the same place, not a third one', async () => {
    await bulkResolveHierarchy(db, [
      [SVERIGE, GAVLE, { name: 'Valbo', type: 'parish', externalId: 'a3134' }],
      [SVERIGE, GAVLE, { name: 'Valbo', type: 'parish' }],
    ]);
    const rows = await queryAll<{ id: string }>(db, "SELECT id FROM places WHERE name = 'Valbo'");
    expect(rows, 'a PLAC without _PARISH_AID spawned a duplicate parish').toHaveLength(1);
  });

  it('returns the externalId alongside the place so the caller can persist it', async () => {
    const chain = [SVERIGE, GAVLE, { name: 'Valbo', type: 'parish', externalId: 'a3134' }];
    const map = await bulkResolveHierarchy(db, [chain]);
    const key = chain.map(l => l.name).join(' > ');
    expect(map.get(key)!.externalIds).toEqual([{ placeId: expect.any(String), externalId: 'a3134' }]);
  });

  it('is idempotent — resolving the same chains twice adds no rows', async () => {
    const chains = [[SVERIGE, GAVLE, { name: 'Valbo', type: 'parish' }]];
    await bulkResolveHierarchy(db, chains);
    const before = (await queryAll<{ c: number }>(db, 'SELECT COUNT(*) c FROM places'))[0].c;
    await bulkResolveHierarchy(db, chains);
    const after = (await queryAll<{ c: number }>(db, 'SELECT COUNT(*) c FROM places'))[0].c;
    expect(after).toBe(before);
  });

  it('handles an empty input without touching the database', async () => {
    const map = await bulkResolveHierarchy(db, []);
    expect(map.size).toBe(0);
    expect((await queryAll<{ c: number }>(db, 'SELECT COUNT(*) c FROM places'))[0].c).toBe(0);
  });

  it('issues a bounded number of queries regardless of chain count', async () => {
    const chains = Array.from({ length: 500 }, (_, i) => [
      SVERIGE, GAVLE,
      { name: `Parish${i % 50}`, type: 'parish' },
      { name: `Loc${i}`, type: 'locality' },
    ]);
    const spy = vi.spyOn(db, 'prepare');
    await bulkResolveHierarchy(db, chains);
    expect(spy.mock.calls.length, 'query count must be O(levels), not O(chains)').toBeLessThan(40);
    spy.mockRestore();
  });
});
