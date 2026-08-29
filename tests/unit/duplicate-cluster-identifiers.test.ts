/**
 * external_identifiers must follow the surviving entity through a merge.
 *
 * The table shipped in v0.273.0 documenting that "the owning entity's delete
 * path is responsible for cleanup". Measured on 2026-08-29: 0 of 8 merge and
 * delete paths in src/api/ mentioned the table. The consolidation review is
 * the first surface that notices — an approved cluster was re-offered on every
 * re-run, because the merged-away source's identifier row still pointed at it.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { findExactClusters } from '../../src/api/duplicates/clusters';
import { applyCluster } from '../../src/api/duplicates/consolidate';
import { mergeSources } from '../../src/api/duplicates/sources';
import { mergePlaces } from '../../src/api/duplicates/places';
import { bulkAddExternalIdentifiers } from '../../src/api/external_identifiers';
import { createSource } from '../../src/api/sources';
import { createPlace } from '../../src/api/places';
import { queryAll } from '../../src/api/db';
import { undoManager } from '../../src/api/undo';
import { createTestDb } from './helpers';

let db: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => { db = await createTestDb(); undoManager.clear(); });

const idents = (entityType: string) => queryAll<{ entity_id: string; system: string; value: string }>(
  db,
  'SELECT entity_id, system, value FROM external_identifiers WHERE entity_type = ? ORDER BY system, value',
  [entityType],
);

describe('external_identifiers across a source merge', () => {
  it('does not offer the same cluster again after it is approved', async () => {
    for (const t of ['Valbo p52', 'Valbo p88']) {
      const s = await createSource(db, { title: t });
      await bulkAddExternalIdentifiers(db, [
        { entity_type: 'source', entity_id: s.id, system: 'arkivdigital', value: 'v25161' },
      ]);
    }
    const [cluster] = await findExactClusters(db, 'source');
    await applyCluster(db, cluster);
    expect(
      await findExactClusters(db, 'source'),
      'an approved cluster came back — the review never terminates',
    ).toEqual([]);
  });

  it('leaves no identifier pointing at a source that no longer exists', async () => {
    const a = await createSource(db, { title: 'A' });
    const b = await createSource(db, { title: 'B' });
    await bulkAddExternalIdentifiers(db, [
      { entity_type: 'source', entity_id: a.id, system: 'arkivdigital', value: 'v1' },
      { entity_type: 'source', entity_id: b.id, system: 'arkivdigital', value: 'v1' },
    ]);
    await mergeSources(db, a.id, b.id);
    const rows = await idents('source');
    expect(rows.every(r => r.entity_id === a.id), `orphaned rows: ${JSON.stringify(rows)}`).toBe(true);
  });

  it('keeps an identifier the merged-away source alone carried', async () => {
    // Prime Directive: authored data is not discarded by side effect. The
    // surviving source inherits what only the other one stated.
    const a = await createSource(db, { title: 'A' });
    const b = await createSource(db, { title: 'B' });
    await bulkAddExternalIdentifiers(db, [
      { entity_type: 'source', entity_id: a.id, system: 'arkivdigital', value: 'v1' },
      { entity_type: 'source', entity_id: b.id, system: 'gramps.handle', value: 'h9' },
    ]);
    await mergeSources(db, a.id, b.id);
    const rows = await idents('source');
    expect(rows.map(r => `${r.system}=${r.value}`).sort()).toEqual(['arkivdigital=v1', 'gramps.handle=h9']);
    expect(rows.every(r => r.entity_id === a.id)).toBe(true);
  });

  it('collapses the duplicate rather than storing it twice', async () => {
    const a = await createSource(db, { title: 'A' });
    const b = await createSource(db, { title: 'B' });
    await bulkAddExternalIdentifiers(db, [
      { entity_type: 'source', entity_id: a.id, system: 'arkivdigital', value: 'v1' },
      { entity_type: 'source', entity_id: b.id, system: 'arkivdigital', value: 'v1' },
    ]);
    await mergeSources(db, a.id, b.id);
    expect(await idents('source')).toHaveLength(1);
  });

  it('undo puts both identifiers back where they were', async () => {
    const a = await createSource(db, { title: 'A' });
    const b = await createSource(db, { title: 'B' });
    await bulkAddExternalIdentifiers(db, [
      { entity_type: 'source', entity_id: a.id, system: 'arkivdigital', value: 'v1' },
      { entity_type: 'source', entity_id: b.id, system: 'arkivdigital', value: 'v1' },
      { entity_type: 'source', entity_id: b.id, system: 'gramps.handle', value: 'h9' },
    ]);
    await mergeSources(db, a.id, b.id);
    await undoManager.undo();
    const rows = await idents('source');
    expect(rows).toHaveLength(3);
    expect(rows.filter(r => r.entity_id === b.id)).toHaveLength(2);
    expect(rows.filter(r => r.entity_id === a.id)).toHaveLength(1);
  });
});

describe('external_identifiers across a place merge', () => {
  it('leaves no identifier pointing at a place that no longer exists', async () => {
    const a = await createPlace(db, { name: 'Valbo' });
    const b = await createPlace(db, { name: 'Valbo ' });
    await bulkAddExternalIdentifiers(db, [
      { entity_type: 'place', entity_id: a.id, system: 'arkivdigital.parish', value: 'p1' },
      { entity_type: 'place', entity_id: b.id, system: 'arkivdigital.parish', value: 'p1' },
    ]);
    await mergePlaces(db, a.id, b.id);
    const rows = await idents('place');
    expect(rows.every(r => r.entity_id === a.id), `orphaned rows: ${JSON.stringify(rows)}`).toBe(true);
    expect(rows).toHaveLength(1);
  });
});
