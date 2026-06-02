// Per-field round-trip test for media→source links (Ben rapport 104, framing B).
//
// User goal: nothing Ben records on a media item is lost across a GEDCOM
// export + re-import. A media↔source link is one such authored value. Before
// this plan the exporter emitted no OBJE under SOUR and the importer never read
// one, so the link was silently dropped on the floor — a Round-Trip Fidelity
// Prime Directive violation. This test seeds a source-linked media, exports to
// both GEDCOM 5.5.1 and 7.0, re-imports into a fresh DB, and asserts the link
// survived. The existing golden round-trip test explicitly EXCLUDES media_links,
// so this gap was not covered by "existing tests" — this is the standing guard.
import { describe, it, expect } from 'vitest';
import { createTestDb } from './helpers';
import { createSource, searchSources } from '../../src/api/sources';
import { createMedia, addMediaLink, getLinksForMedia, listMedia } from '../../src/api/media';
import { exportGedcom } from '../../src/gedcom/exporter';
import { parseGedcom } from '../../src/gedcom/parser';
import { importGedcom } from '../../src/import/gedcom';

describe.each(['5.5.1', '7.0'] as const)('media→source link round-trips under GEDCOM %s', (version) => {
  it('survives export + re-import', async () => {
    const db = await createTestDb();
    const src = await createSource(db, { title: 'Husförhörslängd Ödeshög AI:1' });
    const med = await createMedia(db, { title: 'Scan p.42', file_ref: 'family-media/scan-42.jpg', format: 'image/jpeg' });
    await addMediaLink(db, { media_id: med.id, entity_type: 'source', entity_id: src.id });

    const { ged } = await exportGedcom(db, version);
    // OBJE must be emitted under the SOUR record.
    expect(ged).toMatch(/0 @S\d+@ SOUR[\s\S]*?\n1 OBJE/);

    const db2 = await createTestDb();
    await importGedcom(db2, parseGedcom(ged));

    // Find the re-imported source + media, assert the link reconstructed.
    const sources2 = await searchSources(db2, 'Husförhörslängd');
    expect(sources2.length).toBe(1);
    const media2 = await listMedia(db2);
    const scan = media2.find((m) => (m.title ?? '').includes('Scan p.42') || (m.file_ref ?? '').includes('scan-42'));
    expect(scan, 'media re-imported').toBeTruthy();
    const links = await getLinksForMedia(db2, scan!.id);
    expect(links.some((l) => l.entity_type === 'source' && l.entity_id === sources2[0].id)).toBe(true);
  });
});
