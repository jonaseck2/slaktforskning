// external_identifiers — round-trip storage for source-format ids.
// See docs/plans/2026-08-23-arkivdigital-profile.md Task 5.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  bulkAddExternalIdentifiers,
  getExternalIdentifiers,
  getExternalIdentifiersByEntityType,
} from '../../src/api/external_identifiers';
import { createSource } from '../../src/api/sources';
import { createTestDb } from './helpers';

let db: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => { db = await createTestDb(); });

describe('external_identifiers', () => {
  it('stores and reads back an identifier for a source', async () => {
    const src = await createSource(db, { title: 'Valbo (X) C:15' });
    await bulkAddExternalIdentifiers(db, [
      { entity_type: 'source', entity_id: src.id, system: 'arkivdigital', value: 'v191316' },
    ]);
    const got = await getExternalIdentifiers(db, 'source', src.id);
    expect(got.map(g => [g.system, g.value])).toEqual([['arkivdigital', 'v191316']]);
  });

  it('is idempotent on the entity/system/value tuple', async () => {
    const src = await createSource(db, { title: 'X' });
    const row = { entity_type: 'source', entity_id: src.id, system: 'arkivdigital', value: 'v1' };
    await bulkAddExternalIdentifiers(db, [row]);
    await bulkAddExternalIdentifiers(db, [row]);
    expect(await getExternalIdentifiers(db, 'source', src.id)).toHaveLength(1);
  });

  it('keeps two systems on the same entity apart', async () => {
    const src = await createSource(db, { title: 'X' });
    await bulkAddExternalIdentifiers(db, [
      { entity_type: 'source', entity_id: src.id, system: 'arkivdigital', value: 'v1' },
      { entity_type: 'source', entity_id: src.id, system: 'gramps.handle', value: 'h1' },
    ]);
    expect(await getExternalIdentifiers(db, 'source', src.id)).toHaveLength(2);
  });

  it('rejects an entity_type outside the allowed set', async () => {
    await expect(bulkAddExternalIdentifiers(db, [
      { entity_type: 'banana', entity_id: 'x', system: 's', value: 'v' },
    ])).rejects.toThrow(/unknown entity_type/i);
  });

  it('accepts an empty input without touching the database', async () => {
    await expect(bulkAddExternalIdentifiers(db, [])).resolves.toBeUndefined();
  });

  it('groups by entity for the exporter, in one query', async () => {
    const a = await createSource(db, { title: 'A' });
    const b = await createSource(db, { title: 'B' });
    await bulkAddExternalIdentifiers(db, [
      { entity_type: 'source', entity_id: a.id, system: 'arkivdigital', value: 'v1' },
      { entity_type: 'source', entity_id: b.id, system: 'arkivdigital', value: 'v2' },
    ]);
    const byEntity = await getExternalIdentifiersByEntityType(db, 'source');
    expect(byEntity.get(a.id)!.map(r => r.value)).toEqual(['v1']);
    expect(byEntity.get(b.id)!.map(r => r.value)).toEqual(['v2']);
  });

  it('inserts in a bounded number of statements, not one per row', async () => {
    const src = await createSource(db, { title: 'X' });
    const rows = Array.from({ length: 300 }, (_, i) => ({
      entity_type: 'source', entity_id: src.id, system: 'arkivdigital', value: `v${i}`,
    }));
    const spy = vi.spyOn(db, 'prepare');
    await bulkAddExternalIdentifiers(db, rows);
    expect(spy.mock.calls.length, 'must not be one INSERT per row').toBeLessThan(20);
    spy.mockRestore();
    expect(await getExternalIdentifiers(db, 'source', src.id)).toHaveLength(300);
  });
});
