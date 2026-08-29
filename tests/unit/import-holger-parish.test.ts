// A Holger parish stays a place.
//
// Holger writes a town in PLAC and a parish beside it in PARI:
//
//   2 PLAC Stockholm
//   2 PARI Stockholms domkyrkoförsamling (A)
//
// PARI was dropped, so the parish — the more precise of the two, and the one a
// Swedish researcher actually searches by — did not exist in the DB at all.
//
// See docs/plans/2026-08-23-dialect-tag-review.md Task 6, including the stated
// risk on the containment direction.

import { describe, it, expect, vi } from 'vitest';
import { queryAll } from '../../src/api/db';
import { parseGedcom } from '../../src/gedcom/parser';
import { importGedcom } from '../../src/import/gedcom';
import { matchDeclared } from '../../src/import/gedcom/accounting-declared';
import { createTestDb, readDialect } from './helpers';

describe('Holger PARI', () => {
  it('resolves the parish as a place inside the PLAC value', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(readDialect('holger.ged')), { profile: 'holger' });
    const places = await queryAll<{ id: string; name: string; place_type: string | null; parent_place_id: string | null }>(
      db, 'SELECT id, name, place_type, parent_place_id FROM places');
    const parish = places.find(p => p.name === 'Stockholms domkyrkoförsamling (A)');
    expect(parish, 'parish place not created').toBeDefined();
    expect(parish!.place_type).toBe('parish');
    const town = places.find(p => p.id === parish!.parent_place_id);
    expect(town?.name).toBe('Stockholm');
  });

  it('points the event at the parish, not the town', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(readDialect('holger.ged')), { profile: 'holger' });
    const rows = await queryAll<{ name: string }>(db, `
      SELECT p.name FROM events e JOIN places p ON p.id = e.place_id
       WHERE e.event_type = 'birth'`);
    expect(rows.map(r => r.name)).toContain('Stockholms domkyrkoförsamling (A)');
  });

  it('does not create a parish level when PARI is absent', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(`0 HEAD
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @I1@ INDI
1 NAME A /B/
1 BIRT
2 PLAC Stockholm
0 TRLR
`), { profile: 'holger' });
    const places = await queryAll<{ name: string; parent_place_id: string | null }>(
      db, 'SELECT name, parent_place_id FROM places');
    expect(places).toEqual([expect.objectContaining({ name: 'Stockholm', parent_place_id: null })]);
  });

  it('reuses one parish row across events that name it twice', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(readDialect('holger.ged')), { profile: 'holger' });
    const dup = await queryAll(db, `
      SELECT name FROM places WHERE name = 'Stockholms domkyrkoförsamling (A)'`);
    expect(dup).toHaveLength(1);
  });

  it('keeps both parishes distinct when two towns each have one', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(readDialect('holger.ged')), { profile: 'holger' });
    const rows = await queryAll<{ child: string; parent: string }>(db, `
      SELECT c.name AS child, p.name AS parent
        FROM places c JOIN places p ON p.id = c.parent_place_id
       ORDER BY c.name`);
    expect(rows).toEqual([
      { child: 'Stockholms domkyrkoförsamling (A)', parent: 'Stockholm' },
      { child: 'Uppsala domkyrkoförsamling (C)', parent: 'Uppsala' },
    ]);
  });

  // The branch keys on the tag, not on the profile — same rule the ArkivDigital
  // branch beside it states. A user who opens a Holger .ged through the plain
  // GEDCOM path, and the accounting gate (which passes no options at all), both
  // get the parish. Without this, `*.PARI` would have to stay declared as a
  // drop for exactly the import everybody actually performs.
  it('reads PARI even when no Holger profile was selected', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(readDialect('holger.ged')));
    const parish = await queryAll<{ name: string; place_type: string | null }>(
      db, `SELECT name, place_type FROM places WHERE name = 'Stockholms domkyrkoförsamling (A)'`);
    expect(parish).toEqual([{ name: 'Stockholms domkyrkoförsamling (A)', place_type: 'parish' }]);
  });

  it('is no longer a declared drop', () => {
    expect(matchDeclared('INDI.BIRT.PARI')).toBeUndefined();
    expect(matchDeclared('FAM.MARR.PARI')).toBeUndefined();
  });

  it('reports nothing unaccounted for the Holger fixture', async () => {
    const db = await createTestDb();
    const report = await importGedcom(db, parseGedcom(readDialect('holger.ged')));
    const undeclared = (report.unaccountedFor ?? []).filter(u => !matchDeclared(u.path));
    expect(undeclared).toEqual([]);
  });
});

// `.claude/rules/performance.md`: the parish branch is one `bulkResolveHierarchy`
// call for the whole tree, matching the ArkivDigital branch beside it. A
// per-event resolve would be one IPC round-trip per event under the Tauri
// db-shim. The assertion is a query count, not wall clock — deterministic, and
// it trips the moment a path starts scaling with event count.
describe('the parish branch does not scale with event count', () => {
  const holgerTree = (personCount: number): string => {
    const out = ['0 HEAD', '1 GEDC', '2 VERS 5.5.1', '1 CHAR UTF-8'];
    for (let i = 0; i < personCount; i++) {
      out.push(`0 @I${i}@ INDI`, `1 NAME A${i} /B${i}/`, '1 BIRT',
               `2 PLAC Town ${i % 20}`, `2 PARI Parish ${i % 20} församling`);
    }
    out.push('0 TRLR', '');
    return out.join('\n');
  };

  it('issues about the same number of queries for 40 events as for 400', async () => {
    const counts: number[] = [];
    for (const n of [40, 400]) {
      const db = await createTestDb();
      const spy = vi.spyOn(db, 'prepare');
      await importGedcom(db, parseGedcom(holgerTree(n)), { profile: 'holger' });
      counts.push(spy.mock.calls.length);
      spy.mockRestore();
    }
    // Ten times the events. A per-event resolve would multiply the count;
    // the bulk path adds only the rows themselves.
    expect(counts[1], `40 events → ${counts[0]} queries, 400 → ${counts[1]}`)
      .toBeLessThan(counts[0] * 3);
  });
});
