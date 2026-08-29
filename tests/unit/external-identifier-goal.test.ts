/**
 * The user goal, end to end, as files — not a seeded DB.
 *
 * > An identifier the importer read out of someone's file comes back out when
 * > they export, whatever kind of thing it was attached to and whatever
 * > program wrote it. A researcher who imports four ArkivDigital exports,
 * > works for a year, and exports again still has every archive pointer the
 * > original files carried. A researcher whose file came from Gramps keeps the
 * > Gramps handles even though this app has never heard of Gramps handles.
 *
 * `external-identifier-roundtrip.test.ts` seeds `external_identifiers` with a
 * SQL INSERT, so it can only observe DB → GEDCOM → DB. That is the second half
 * of the sentence. This file covers the first half: a file arrives, the
 * importer reads identifiers out of it, the researcher edits, and the export
 * still carries every one.
 *
 * The two halves fail differently. A missing emitter fails the matrix. A
 * missing *reader* passes the matrix — the seeded row is in the DB whether or
 * not any file could have put it there — and fails only here.
 *
 * **Why every `system` in these fixtures is lowercase.** `normalize.ts`
 * lowercases the value of every `TYPE` node in the tree before any phase runs
 * (`lowercaseTypeValues`, `normalize.ts:109`), so `TYPE Gramps.Handle` imports
 * as `gramps.handle`. That is a real round-trip limitation of `system` and it
 * belongs in the registry reason, not in a fixture that quietly avoids it.
 * `normalize.ts` is out of scope for this plan.
 */
import { describe, it, expect } from 'vitest';
import type { Database } from 'node-sqlite3-wasm';
import { queryAll, runSql } from '../../src/api/db';
import { exportGedcom } from '../../src/gedcom/exporter';
import { importGedcom } from '../../src/gedcom/importer';
import { parseGedcom } from '../../src/gedcom/parser';
import { createTestDb } from './helpers';

type Version = '5.5.1' | '7.0';
const VERSIONS: Version[] = ['5.5.1', '7.0'];

interface IdRow { entity_type: string; system: string; value: string }

/**
 * Gramps writes handles this app has never heard of. Records only — a source,
 * the repository it sits in, and a media — because `REFN` + `TYPE` is the
 * record-level carrier under 5.5.1.
 *
 * `plain-untyped-ref` has no `TYPE`. It has to come back out as a bare `REFN`
 * with no `TYPE`, or a file that already carried untyped references does not
 * keep its bytes.
 */
const GRAMPS_FILE = [
  '0 HEAD',
  '1 SOUR Gramps',
  '1 GEDC',
  '2 VERS 5.5.1',
  '1 CHAR UTF-8',
  '0 @I1@ INDI',
  '1 NAME Anna /Svensdotter/',
  '1 OBJE',
  '2 FILE family-media/anna.jpg',
  '2 TITL Anna 1890',
  '2 REFN g-obj-aaaa',
  '3 TYPE gramps.handle',
  '0 @S1@ SOUR',
  '1 TITL Döderhults kyrkoarkiv',
  '1 REPO @R1@',
  '1 REFN g-src-bbbb',
  '2 TYPE gramps.handle',
  '1 REFN plain-untyped-ref',
  '0 @R1@ REPO',
  '1 NAME Landsarkivet i Vadstena',
  '1 REFN g-rep-cccc',
  '2 TYPE gramps.handle',
  '1 REFN SE-RA-9900',
  '2 TYPE riksarkivet.id',
  '0 TRLR',
  '',
].join('\n');

/**
 * ArkivDigital writes vendor-shaped pointers instead: `_AID` on the citation
 * inside the event, and `_PARISH_AID` inside the `_ADPL` place block.
 *
 * The parish here has **no** `_COUNTY` or `_COUNTRY` above it, so it resolves
 * to a root-level place. That is the shape the export used to drop: the
 * `_ADPL` emitter was gated on `parent_place_id`, and `parent_place_id` is
 * `ON DELETE SET NULL`, so deleting a county disarms every parish under it.
 * The identifier came in and did not come back out.
 */
const ARKIVDIGITAL_FILE = [
  '0 HEAD',
  '1 SOUR Arkiv_Digital',
  '1 GEDC',
  '2 VERS 5.5.1',
  '1 CHAR UTF-8',
  '0 @I9@ INDI',
  '1 NAME Karl /Nilsson/',
  '1 BIRT',
  '2 DATE 12 MAR 1890',
  '2 PLAC Döderhult',
  '3 _ADPL',
  '4 _PARISH Döderhult',
  '4 _PARISH_AID ad-parish-7788',
  '2 SOUR @S9@',
  '3 PAGE fol. 12',
  '3 _AID v191316.b580.s52',
  '0 @S9@ SOUR',
  '1 TITL Döderhult C:3',
  '1 _AID v191316',
  '0 TRLR',
  '',
].join('\n');

/**
 * The app's own export shape, read back.
 *
 * A citation is a `SOUR` pointer substructure and a `PLAC` block is a
 * substructure. Neither has a `REFN` slot in either specification, so the
 * carrier for a non-vendor system on those two hosts is the custom `_EXID`.
 * No third-party program writes it today — this app does, which makes this
 * the researcher restoring from their own export, or handing it to a second
 * copy of the app.
 *
 * Reachable only from a file. The matrix seeds these two rows with SQL, so it
 * cannot tell a missing reader from a present one.
 */
const OWN_EXPORT_FILE = [
  '0 HEAD',
  '1 SOUR Slaktforskning',
  '1 GEDC',
  '2 VERS 5.5.1',
  '1 CHAR UTF-8',
  '0 @I5@ INDI',
  '1 NAME Erik /Persson/',
  '1 BIRT',
  '2 PLAC Misterhult',
  '3 _PTYPE parish',
  '3 _EXID g-plac-dddd',
  '4 TYPE gramps.handle',
  '2 SOUR @S5@',
  '3 PAGE fol. 3',
  '3 _EXID g-cit-eeee',
  '4 TYPE gramps.handle',
  '0 @S5@ SOUR',
  '1 TITL Misterhults kyrkoarkiv',
  '0 TRLR',
  '',
].join('\n');

async function identifierSet(db: Database): Promise<Set<string>> {
  const rows = await queryAll<IdRow>(
    db, 'SELECT entity_type, system, value FROM external_identifiers',
  );
  // A set, not an ordered array: SQLite's collation and JS `localeCompare`
  // disagree on case, and the ordering is not what the goal is about.
  return new Set(rows.map(r => `${r.entity_type}|${r.system}|${r.value}`));
}

/**
 * The control every assertion below leans on. A missing identifier only means
 * "lost its carrier" if the thing it hung off came through — otherwise the
 * cheapest way to pass would be to import nothing at all.
 */
async function expectHostsSurvived(
  db: Database, expected: Record<string, number>,
): Promise<void> {
  for (const [table, min] of Object.entries(expected)) {
    const rows = await queryAll<{ n: number }>(db, `SELECT COUNT(*) AS n FROM ${table}`);
    expect(rows[0].n, `control: ${table} after round-trip`).toBeGreaterThanOrEqual(min);
  }
}

describe('user goal: identifiers a file carried in come back out', () => {
  for (const version of VERSIONS) {
    describe(version, () => {

      it('two foreign files → a year of work → export → re-import keeps every pointer', async () => {
        // 1. The researcher imports two files written by two programs, into
        //    one archive. Neither program's identifier scheme has any
        //    authoring surface in this app.
        const db = await createTestDb();
        await importGedcom(db, parseGedcom(GRAMPS_FILE));
        await importGedcom(db, parseGedcom(ARKIVDIGITAL_FILE));

        // The read half of the goal, stated as the whole set rather than a
        // sample — a subset assertion could not have caught the reader that
        // was missing.
        const afterImport = await identifierSet(db);
        expect(afterImport).toEqual(new Set([
          // Gramps file: three records plus one untyped reference.
          'source|gramps.handle|g-src-bbbb',
          'source|refn|plain-untyped-ref',
          'repository|gramps.handle|g-rep-cccc',
          'repository|riksarkivet.id|SE-RA-9900',
          'media|gramps.handle|g-obj-aaaa',
          // ArkivDigital file: the volume, the image, the root-level parish.
          'source|arkivdigital|v191316',
          'citation|arkivdigital.image|v191316.b580.s52',
          'place|arkivdigital.parish|ad-parish-7788',
        ]));

        // 2. A year of work. Authored edits to the entities the identifiers
        //    hang off — the identifiers are not what the researcher touches.
        await runSql(db, "UPDATE sources SET title = 'Döderhult C:3 (1860-1894)'");
        await runSql(db, "UPDATE places SET notes = 'Kontrollerad mot husförhörslängd'");

        // 3. They export the archive they will hand on.
        const { ged } = await exportGedcom(db, version);

        for (const v of [
          'g-src-bbbb', 'plain-untyped-ref', 'g-rep-cccc', 'SE-RA-9900',
          'g-obj-aaaa', 'v191316', 'v191316.b580.s52', 'ad-parish-7788',
        ]) {
          expect(ged, `${v} missing from the ${version} export`).toContain(v);
        }

        // The vendor pairs keep their vendor tag. A REFN would round-trip
        // fine here and still break the program that wrote the file.
        expect(ged).toMatch(/^1 _AID v191316$/m);
        expect(ged).toMatch(/^\s*3 _AID v191316\.b580\.s52$/m);
        expect(ged).toMatch(/_PARISH_AID ad-parish-7788/);
        expect(ged).not.toMatch(/_EXID v191316\.b580\.s52/);
        expect(ged).not.toMatch(/_EXID ad-parish-7788/);

        // The untyped one stays untyped — same bytes in, same bytes out.
        const tag = version === '7.0' ? 'EXID' : 'REFN';
        expect(ged).toMatch(new RegExp(`^1 ${tag} plain-untyped-ref$`, 'm'));

        // 4. Whoever opens that file gets the whole archive back.
        const fresh = await createTestDb();
        await importGedcom(fresh, parseGedcom(ged));
        await expectHostsSurvived(fresh, {
          sources: 2, repositories: 1, media: 1, citations: 1, places: 1,
        });
        expect(await identifierSet(fresh)).toEqual(afterImport);
      });

      it('a citation and a place identifier written as _EXID read back', async () => {
        // The two hosts with no standard reference slot. Covered here rather
        // than in the matrix because the matrix cannot exercise a reader.
        const db = await createTestDb();
        await importGedcom(db, parseGedcom(OWN_EXPORT_FILE));

        const afterImport = await identifierSet(db);
        expect(afterImport).toEqual(new Set([
          'citation|gramps.handle|g-cit-eeee',
          'place|gramps.handle|g-plac-dddd',
        ]));

        const { ged } = await exportGedcom(db, version);
        expect(ged).toMatch(/_EXID g-cit-eeee/);
        expect(ged).toMatch(/_EXID g-plac-dddd/);
        // `_EXID` is version-independent: a substructure has no REFN slot in
        // either specification, so 7.0 does not switch tag here the way a
        // record does.
        expect(ged).not.toMatch(/REFN g-cit-eeee/);
        expect(ged).not.toMatch(/REFN g-plac-dddd/);

        const fresh = await createTestDb();
        await importGedcom(fresh, parseGedcom(ged));
        await expectHostsSurvived(fresh, { citations: 1, places: 1 });
        expect(await identifierSet(fresh)).toEqual(afterImport);
      });
    });
  }
});
