// GEDCOM source coverage round-trip (T08 — GEDCOM alignment plan).
//
// User goal (verbatim from the plan): every authored field in our database
// survives a GEDCOM 5.5.1 OR 7.0 round-trip cleanly, or is explicitly
// classified as `lossy` / `excluded`. No silent data loss on export.
//
// For T08 specifically: source-level coverage metadata — "this source
// covers BIRT events from 1850-1920 in Östergötland" — survives both
// GEDCOM 5.5.1 and 7.0 round-trips via the SOUR/DATA/EVEN substructure
// (spec identical on both versions; lossless on both).

import { describe, it, expect, beforeEach } from 'vitest';
import { parseGedcom } from '../../src/gedcom/parser';
import { importGedcom } from '../../src/import/gedcom';
import { exportGedcom } from '../../src/gedcom/exporter';
import { createSource, listSources } from '../../src/api/sources';
import { findOrCreatePlace, listPlaces } from '../../src/api/places';
import { createSourceCoverageEvent, getCoverageForSource } from '../../src/api/source_coverage';
import { createTestDb } from './helpers';

let db: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => { db = await createTestDb(); });

async function seedSourceWithTwoCoverageRows() {
  const src = await createSource(db, { title: 'Östergötland parish register' });
  const place = await findOrCreatePlace(db, 'Östergötland');
  await createSourceCoverageEvent(db, {
    source_id: src.id,
    event_type: 'BIRT',
    date_value_from: '1850',
    date_value_to: '1920',
    place_id: place.id,
  });
  await createSourceCoverageEvent(db, {
    source_id: src.id,
    event_type: 'DEAT',
    date_value_from: '1860',
    date_value_to: '1930',
    place_id: place.id,
  });
  return { src, place };
}

describe('GEDCOM source coverage events round-trip (T08)', () => {
  it('7.0 SOUR/DATA/EVEN preserves multiple coverage rows (lossless)', async () => {
    await seedSourceWithTwoCoverageRows();

    const { ged } = await exportGedcom(db, '7.0');
    // Verify the user-goal-evidence: the GEDCOM contains the documented
    // 1 DATA / 2 EVEN BIRT / 3 DATE FROM 1850 TO 1920 / 3 PLAC Östergötland
    // block from the plan.
    expect(ged).toMatch(/1 DATA[\s\S]*?2 EVEN BIRT[\s\S]*?3 DATE FROM 1850 TO 1920[\s\S]*?3 PLAC Östergötland/);
    expect(ged).toMatch(/2 EVEN DEAT[\s\S]*?3 DATE FROM 1860 TO 1930[\s\S]*?3 PLAC Östergötland/);

    const db2 = await createTestDb();
    await importGedcom(db2, parseGedcom(ged));

    const sources2 = await listSources(db2);
    expect(sources2).toHaveLength(1);
    const rows = await getCoverageForSource(db2, sources2[0].id);
    expect(rows).toHaveLength(2);

    const birt = rows.find(r => r.event_type === 'BIRT')!;
    expect(birt.date_value_from).toBe('1850');
    expect(birt.date_value_to).toBe('1920');

    const deat = rows.find(r => r.event_type === 'DEAT')!;
    expect(deat.date_value_from).toBe('1860');
    expect(deat.date_value_to).toBe('1930');
  });

  it('5.5.1 SOUR/DATA/EVEN preserves multiple coverage rows (lossless — spec identical to 7.0)', async () => {
    await seedSourceWithTwoCoverageRows();

    const { ged } = await exportGedcom(db, '5.5.1');
    expect(ged).toMatch(/1 DATA[\s\S]*?2 EVEN BIRT[\s\S]*?3 DATE FROM 1850 TO 1920[\s\S]*?3 PLAC Östergötland/);
    expect(ged).toMatch(/2 EVEN DEAT[\s\S]*?3 DATE FROM 1860 TO 1930/);

    const db2 = await createTestDb();
    await importGedcom(db2, parseGedcom(ged));

    const sources2 = await listSources(db2);
    expect(sources2).toHaveLength(1);
    const rows = await getCoverageForSource(db2, sources2[0].id);
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.event_type).sort()).toEqual(['BIRT', 'DEAT']);
  });

  it('groups multiple coverage rows for the same source under a single 1 DATA parent', async () => {
    await seedSourceWithTwoCoverageRows();

    const { ged } = await exportGedcom(db, '7.0');
    // Exactly one `1 DATA` line per source even though there are two coverage
    // rows — the emitter groups all EVEN siblings under one DATA parent.
    const dataLines = ged.split('\n').filter(l => l === '1 DATA');
    expect(dataLines).toHaveLength(1);
    // Both EVENs sit under the one DATA, before the next 1-level tag.
    const evenLines = ged.split('\n').filter(l => /^2 EVEN /.test(l));
    expect(evenLines).toHaveLength(2);
  });

  it("PLAC resolves to the same place on re-import (matches the importing DB's place by name)", async () => {
    await seedSourceWithTwoCoverageRows();

    const { ged } = await exportGedcom(db, '7.0');
    const db2 = await createTestDb();
    await importGedcom(db2, parseGedcom(ged));

    const places2 = await listPlaces(db2);
    const ostergotland = places2.find(p => p.name === 'Östergötland');
    expect(ostergotland).toBeTruthy();

    const sources2 = await listSources(db2);
    const rows = await getCoverageForSource(db2, sources2[0].id);
    expect(rows).toHaveLength(2);
    // Both rows point at the single re-imported Östergötland row (PLAC
    // resolution by name via findOrCreatePlace).
    for (const r of rows) {
      expect(r.place_id).toBe(ostergotland!.id);
    }
  });
});
