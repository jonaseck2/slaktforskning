/**
 * The `external_identifiers` round-trip matrix.
 *
 * User goal (`docs/plans/2026-08-29-external-identifier-roundtrip.md`): an
 * identifier the importer read out of someone's file comes back out when they
 * export, whatever kind of thing it was attached to and whatever program wrote
 * it.
 *
 * This file enumerates the space rather than sampling it. Every one of the five
 * `entity_type` values the table accepts is crossed with a vendor system and an
 * unknown system, and each cell either asserts survival or asserts a loss the
 * design spec names. Nothing sits outside the table.
 *
 * **Every cell asserts a control first.** A cell that went red because its seed
 * never reached the exported file would look identical to a cell that went red
 * because the identifier has no carrier — and only the second is the finding.
 * `expectHostSurvived` is what separates them: it fails with a different
 * message, and it is the arm that lets a passing cell mean something.
 *
 * Written before the emitters, deliberately red. See the commit that introduced
 * it for the measured pass/fail split on the pre-emitter tree.
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

// ── Seeding ─────────────────────────────────────────────────────────────────

async function addExternalId(
  db: Database, entity_type: string, entity_id: string, system: string, value: string,
): Promise<void> {
  await runSql(
    db,
    'INSERT INTO external_identifiers (id, entity_type, entity_id, system, value) VALUES (?,?,?,?,?)',
    [crypto.randomUUID(), entity_type, entity_id, system, value],
  );
}

/**
 * A person with a name and a birth event at `placeId`.
 *
 * The importer drops an `INDI` with no `NAME`, and an event with no participant
 * is not emitted at all — both are why this helper exists rather than a bare
 * insert. `events` has no `person_id` column; participation is a join row.
 * `person_names` has `given_name`, singular, and no `is_primary`.
 */
async function seedPersonEventAtPlace(db: Database, placeId: string | null): Promise<string> {
  const pid = crypto.randomUUID();
  await runSql(db, 'INSERT INTO persons (id) VALUES (?)', [pid]);
  await runSql(
    db,
    'INSERT INTO person_names (id, person_id, given_name, surname, sort_order) VALUES (?,?,?,?,0)',
    [crypto.randomUUID(), pid, 'Test', 'Person'],
  );
  const eid = crypto.randomUUID();
  await runSql(
    db, 'INSERT INTO events (id, event_type, place_id) VALUES (?,?,?)', [eid, 'birth', placeId],
  );
  await runSql(
    db,
    'INSERT INTO event_participants (id, event_id, person_id, role) VALUES (?,?,?,?)',
    [crypto.randomUUID(), eid, pid, 'primary'],
  );
  return eid;
}

async function seedSource(db: Database, title = 'Kyrkobok'): Promise<string> {
  const id = crypto.randomUUID();
  await runSql(db, 'INSERT INTO sources (id, title) VALUES (?,?)', [id, title]);
  return id;
}

/** A repository reaches the file only through a source that links to it. */
async function seedRepositoryOnSource(db: Database, sourceId: string): Promise<string> {
  const id = crypto.randomUUID();
  await runSql(db, 'INSERT INTO repositories (id, name) VALUES (?,?)', [id, 'Landsarkivet']);
  await runSql(
    db, 'INSERT INTO source_repositories (source_id, repository_id) VALUES (?,?)', [sourceId, id],
  );
  return id;
}

/** A media reaches the file only through a `media_links` row. */
async function seedMediaOnPerson(db: Database, personId: string): Promise<string> {
  const id = crypto.randomUUID();
  await runSql(
    db,
    'INSERT INTO media (id, file_ref, title, format) VALUES (?,?,?,?)',
    [id, 'family-media/bild.jpg', 'Porträtt', 'jpg'],
  );
  await runSql(
    db,
    'INSERT INTO media_links (id, media_id, entity_type, entity_id, sort_order) VALUES (?,?,?,?,0)',
    [crypto.randomUUID(), id, 'person', personId],
  );
  return id;
}

async function seedEventCitation(db: Database, sourceId: string, eventId: string): Promise<string> {
  const id = crypto.randomUUID();
  await runSql(
    db,
    'INSERT INTO citations (id, source_id, event_id, page, confidence) VALUES (?,?,?,?,3)',
    [id, sourceId, eventId, 'fol. 12'],
  );
  return id;
}

/** A citation whose only host is a place — the shape that produces a `_PLAC` record. */
async function seedPlaceCitation(db: Database, sourceId: string, placeId: string): Promise<string> {
  const id = crypto.randomUUID();
  await runSql(
    db,
    'INSERT INTO citations (id, source_id, place_id, page, confidence) VALUES (?,?,?,?,3)',
    [id, sourceId, placeId, 'fol. 3'],
  );
  return id;
}

async function seedPlace(
  db: Database, name: string, placeType: string, parentId: string | null = null,
): Promise<string> {
  const id = crypto.randomUUID();
  await runSql(
    db,
    'INSERT INTO places (id, name, normalized_name, place_type, parent_place_id) VALUES (?,?,?,?,?)',
    [id, name, name.toLowerCase(), placeType, parentId],
  );
  return id;
}

// ── Round-trip + assertions ─────────────────────────────────────────────────

async function roundTrip(db: Database, version: Version): Promise<{ ged: string; fresh: Database }> {
  const { ged } = await exportGedcom(db, version);
  const fresh = await createTestDb();
  await importGedcom(fresh, parseGedcom(ged));
  return { ged, fresh };
}

async function identifiersIn(db: Database): Promise<IdRow[]> {
  return queryAll<IdRow>(
    db,
    'SELECT entity_type, system, value FROM external_identifiers ORDER BY entity_type, system, value',
  );
}

/**
 * The control. Asserts the identifier's host entity itself came through, so a
 * failing identifier assertion below can only mean the identifier lost its
 * carrier — never that the seed never made it into the file.
 */
async function expectHostSurvived(db: Database, table: string, minRows = 1): Promise<void> {
  const rows = await queryAll<{ n: number }>(db, `SELECT COUNT(*) AS n FROM ${table}`);
  expect(rows[0].n, `control: expected at least ${minRows} row(s) in ${table} after round-trip`)
    .toBeGreaterThanOrEqual(minRows);
}

function expectIdentifier(rows: IdRow[], entity_type: string, system: string, value: string): void {
  expect(rows).toContainEqual({ entity_type, system, value });
}

function expectNoIdentifier(rows: IdRow[], system: string, value: string): void {
  expect(rows.filter(r => r.system === system && r.value === value)).toEqual([]);
}

// ── The matrix ──────────────────────────────────────────────────────────────

describe('external_identifiers round-trip matrix', () => {
  for (const version of VERSIONS) {
    describe(version, () => {

      // ── source ──────────────────────────────────────────────────────────

      it('cell 1: source + arkivdigital survives, carried by 1 _AID', async () => {
        const db = await createTestDb();
        const sid = await seedSource(db);
        await addExternalId(db, 'source', sid, 'arkivdigital', 'v100001');
        const { ged, fresh } = await roundTrip(db, version);
        await expectHostSurvived(fresh, 'sources');
        expect(ged).toMatch(/^1 _AID v100001$/m);
        expectIdentifier(await identifiersIn(fresh), 'source', 'arkivdigital', 'v100001');
      });

      it('cell 2: source + gramps.handle survives, carried by REFN/EXID', async () => {
        const db = await createTestDb();
        const sid = await seedSource(db);
        await addExternalId(db, 'source', sid, 'gramps.handle', 'g-src-0001');
        const { ged, fresh } = await roundTrip(db, version);
        await expectHostSurvived(fresh, 'sources');
        expect(ged).toMatch(version === '7.0' ? /^1 EXID g-src-0001$/m : /^1 REFN g-src-0001$/m);
        expectIdentifier(await identifiersIn(fresh), 'source', 'gramps.handle', 'g-src-0001');
      });

      // ── repository ──────────────────────────────────────────────────────

      it('cell 3: repository + arkivdigital survives, carried by REFN/EXID', async () => {
        // No vendor override exists for repositories — the design's carrier
        // table lists "none" — so even the ArkivDigital system rides the
        // generic tag here.
        const db = await createTestDb();
        const rid = await seedRepositoryOnSource(db, await seedSource(db));
        await addExternalId(db, 'repository', rid, 'arkivdigital', 'v200002');
        const { fresh } = await roundTrip(db, version);
        await expectHostSurvived(fresh, 'repositories');
        expectIdentifier(await identifiersIn(fresh), 'repository', 'arkivdigital', 'v200002');
      });

      it('cell 4: repository + riksarkivet.id survives, carried by REFN/EXID', async () => {
        const db = await createTestDb();
        const rid = await seedRepositoryOnSource(db, await seedSource(db));
        await addExternalId(db, 'repository', rid, 'riksarkivet.id', 'SE/RA/12345');
        const { fresh } = await roundTrip(db, version);
        await expectHostSurvived(fresh, 'repositories');
        expectIdentifier(await identifiersIn(fresh), 'repository', 'riksarkivet.id', 'SE/RA/12345');
      });

      // ── media ───────────────────────────────────────────────────────────

      it('cell 5: media + arkivdigital.image survives, carried by REFN/EXID', async () => {
        // `arkivdigital.image` is vendor-carried on a *citation*, not on a
        // media record. On media it has no vendor tag, so it rides the
        // generic one.
        const db = await createTestDb();
        const personId = await seedPersonForMedia(db);
        const mid = await seedMediaOnPerson(db, personId);
        await addExternalId(db, 'media', mid, 'arkivdigital.image', 'v300003.1');
        const { fresh } = await roundTrip(db, version);
        await expectHostSurvived(fresh, 'media');
        expectIdentifier(await identifiersIn(fresh), 'media', 'arkivdigital.image', 'v300003.1');
      });

      it('cell 6: media + gramps.handle survives, carried by REFN/EXID', async () => {
        const db = await createTestDb();
        const personId = await seedPersonForMedia(db);
        const mid = await seedMediaOnPerson(db, personId);
        await addExternalId(db, 'media', mid, 'gramps.handle', 'g-obj-0002');
        const { fresh } = await roundTrip(db, version);
        await expectHostSurvived(fresh, 'media');
        expectIdentifier(await identifiersIn(fresh), 'media', 'gramps.handle', 'g-obj-0002');
      });

      // ── citation ────────────────────────────────────────────────────────

      it('cell 7: citation + arkivdigital.image survives, carried by _AID', async () => {
        const db = await createTestDb();
        const sid = await seedSource(db);
        const eid = await seedPersonEventAtPlace(db, null);
        const cid = await seedEventCitation(db, sid, eid);
        await addExternalId(db, 'citation', cid, 'arkivdigital.image', 'v400004.7');
        const { ged, fresh } = await roundTrip(db, version);
        await expectHostSurvived(fresh, 'citations');
        // Asserted on the emitted text, not only the round-tripped DB: a REFN
        // would round-trip fine and still break ArkivDigital.
        expect(ged).toMatch(/^\s*3 _AID v400004\.7$/m);
        expect(ged).not.toMatch(/_EXID v400004\.7/);
        expectIdentifier(await identifiersIn(fresh), 'citation', 'arkivdigital.image', 'v400004.7');
      });

      it('cell 8: citation + gramps.handle survives, carried by _EXID', async () => {
        const db = await createTestDb();
        const sid = await seedSource(db);
        const eid = await seedPersonEventAtPlace(db, null);
        const cid = await seedEventCitation(db, sid, eid);
        await addExternalId(db, 'citation', cid, 'gramps.handle', 'g-cit-0003');
        const { ged, fresh } = await roundTrip(db, version);
        await expectHostSurvived(fresh, 'citations');
        expect(ged).toMatch(/_EXID g-cit-0003/);
        expectIdentifier(await identifiersIn(fresh), 'citation', 'gramps.handle', 'g-cit-0003');
      });

      // ── place ───────────────────────────────────────────────────────────

      it('cell 9: place on an event, parish WITH a parent + arkivdigital.parish survives via _PARISH_AID', async () => {
        const db = await createTestDb();
        // `admin1` — not `county` — is the type the ArkivDigital importer
        // writes for a län (`profiles/arkivdigital.ts:32`) and the only one
        // `TAG_BY_TYPE` maps to `_COUNTY` (`exporter.ts:90`). `county` is in
        // the `PlaceType` union but has no _ADPL tag, so a chain built from it
        // is silently untyped.
        const lan = await seedPlace(db, 'Kalmar', 'admin1');
        const parish = await seedPlace(db, 'Döderhult', 'parish', lan);
        await addExternalId(db, 'place', parish, 'arkivdigital.parish', 'ad-parish-501');
        await seedPersonEventAtPlace(db, parish);
        const { ged, fresh } = await roundTrip(db, version);
        await expectHostSurvived(fresh, 'places');
        expect(ged).toMatch(/_PARISH_AID ad-parish-501/);
        expectIdentifier(await identifiersIn(fresh), 'place', 'arkivdigital.parish', 'ad-parish-501');
      });

      it('cell 10: place on an event, parish with NO parent + arkivdigital.parish survives via _PARISH_AID', async () => {
        // `parent_place_id` is ON DELETE SET NULL, so deleting a county
        // disarms every parish under it. A root-level parish is a legal row.
        const db = await createTestDb();
        const parish = await seedPlace(db, 'Döderhult', 'parish', null);
        await addExternalId(db, 'place', parish, 'arkivdigital.parish', 'ad-parish-502');
        await seedPersonEventAtPlace(db, parish);
        const { ged, fresh } = await roundTrip(db, version);
        // Control: the parish itself reaches the file. A red _PARISH_AID below
        // is therefore the parent guard dropping the identifier, not the place
        // going missing.
        expect(ged).toMatch(/PLAC Doderhult|PLAC Döderhult/);
        await expectHostSurvived(fresh, 'places');
        expect(ged).toMatch(/_PARISH_AID ad-parish-502/);
        expectIdentifier(await identifiersIn(fresh), 'place', 'arkivdigital.parish', 'ad-parish-502');
      });

      it('cell 11: place on an event + gramps.handle survives, carried by _EXID', async () => {
        const db = await createTestDb();
        const parish = await seedPlace(db, 'Döderhult', 'parish', null);
        await addExternalId(db, 'place', parish, 'gramps.handle', 'g-plac-0004');
        await seedPersonEventAtPlace(db, parish);
        const { ged, fresh } = await roundTrip(db, version);
        expect(ged).toMatch(/PLAC Doderhult|PLAC Döderhult/);
        await expectHostSurvived(fresh, 'places');
        expect(ged).toMatch(/_EXID g-plac-0004/);
        expectIdentifier(await identifiersIn(fresh), 'place', 'gramps.handle', 'g-plac-0004');
      });

      it('cell 14: place reachable only through a place-level citation keeps both systems', async () => {
        // Found by probe on 2026-08-29, after cells 1-13 were green. No event
        // names this place, so `emitPlaceSubTags` is never called on it and
        // `prep-places.ts` never sees a `PLAC` node for it. Its only appearance
        // in the file is the `0 @Pn@ _PLAC` record the place-level citation
        // forces, which carried `NAME`, `_PLAC_ID` and the citation and nothing
        // else. Both systems were lost — it falls between cell 12 (`_ADPL`
        // ancestor only) and cell 13 (no event AND no citation).
        //
        // `arkivdigital.parish` rides `_EXID` here rather than `_PARISH_AID`
        // because this record emits no `_ADPL` block for the vendor tag to sit
        // in. `_PLAC` is a custom level-0 record ArkivDigital never writes and
        // skips on read, so the vendor-override rule is not weakened by it.
        const db = await createTestDb();
        const sid = await seedSource(db);
        const parish = await seedPlace(db, 'Döderhult', 'parish', null);
        await seedPlaceCitation(db, sid, parish);
        await addExternalId(db, 'place', parish, 'arkivdigital.parish', 'ad-parish-601');
        await addExternalId(db, 'place', parish, 'gramps.handle', 'g-plac-0601');
        await seedPersonEventAtPlace(db, null); // something must exist to export
        const { ged, fresh } = await roundTrip(db, version);
        // Control: the place reaches the file as a `_PLAC` record, and no
        // event-borne `PLAC` block exists for it. A red assertion below is
        // therefore a missing carrier, not a missing place.
        expect(ged).toMatch(/^0 @P1@ _PLAC$/m);
        expect(ged).not.toMatch(/^\s*\d+ PLAC Döderhult$/m);
        await expectHostSurvived(fresh, 'places');
        const rows = await identifiersIn(fresh);
        expectIdentifier(rows, 'place', 'arkivdigital.parish', 'ad-parish-601');
        expectIdentifier(rows, 'place', 'gramps.handle', 'g-plac-0601');
      });

      it('cell 14 gate: a place that is both an event place and a citation host carries each id once', async () => {
        // The `_PLAC` emitter is skipped for a place whose `PLAC` block already
        // stated its identifiers. Without the skip the file would carry two
        // carriers for one row — `_PARISH_AID` under the event and `_EXID`
        // under the record — and a re-export would not be stable.
        const db = await createTestDb();
        const sid = await seedSource(db);
        const parish = await seedPlace(db, 'Döderhult', 'parish', null);
        await addExternalId(db, 'place', parish, 'arkivdigital.parish', 'ad-parish-602');
        await addExternalId(db, 'place', parish, 'gramps.handle', 'g-plac-0602');
        await seedPlaceCitation(db, sid, parish);
        await seedPersonEventAtPlace(db, parish);
        const { ged, fresh } = await roundTrip(db, version);
        expect(ged).toMatch(/^0 @P1@ _PLAC$/m);
        expect(ged.match(/ad-parish-602/g) ?? []).toHaveLength(1);
        expect(ged.match(/g-plac-0602/g) ?? []).toHaveLength(1);
        const rows = await identifiersIn(fresh);
        expectIdentifier(rows, 'place', 'arkivdigital.parish', 'ad-parish-602');
        expectIdentifier(rows, 'place', 'gramps.handle', 'g-plac-0602');
      });

      // ── the two declared losses ─────────────────────────────────────────

      it('cell 12 (expected loss): a non-parish system on a place reachable only as an _ADPL ancestor', async () => {
        // Design spec, "What the registry becomes" → **Uncovered cell 1**.
        // Such a place reaches the file only as a level inside an `_ADPL`
        // chain, and that chain's per-level identifier slot is
        // `HierarchyLevel.externalId` — a single string whose
        // `arkivdigital.parish` value is load-bearing for place
        // disambiguation (`src/api/places_hierarchy.ts:70`), not only for
        // round-trip. Generalising one disambiguating string into a list of
        // typed identifiers changes what "the same place" means, which is a
        // places-hierarchy user goal and not this one.
        //
        // This is a declared loss, not a bug someone forgot to fix. If it
        // starts passing, the design changed and this cell needs rewriting
        // rather than deleting.
        const db = await createTestDb();
        const lan = await seedPlace(db, 'Kalmar', 'admin1');
        const parish = await seedPlace(db, 'Döderhult', 'parish', lan);
        await addExternalId(db, 'place', lan, 'gramps.handle', 'g-anc-0005');
        await seedPersonEventAtPlace(db, parish);
        const { ged, fresh } = await roundTrip(db, version);
        // Control: the ancestor DOES reach the file, as an `_ADPL` level. The
        // loss is that the level has one identifier slot and it is spoken for
        // — not that the place is missing. That is what separates this cell
        // from cell 13.
        expect(ged).toMatch(/_COUNTY Kalmar/);
        await expectHostSurvived(fresh, 'places');
        expectNoIdentifier(await identifiersIn(fresh), 'gramps.handle', 'g-anc-0005');
      });

      it('cell 13 (expected loss): any system on a place no event and no citation reaches', async () => {
        // Design spec, Scope deviations → **Unreferenced places stay
        // unexported**, and "What the registry becomes" → **Uncovered cell
        // 2**. The place itself is not exported — no event names it and no
        // citation points at it — so its identifier is lost for the same
        // reason its `name` and `place_type` are. `places.parent_place_id` is
        // already declared lossy on the same grounds. Exporting every orphan
        // place is a `places` round-trip question with its own user goal.
        const db = await createTestDb();
        const orphan = await seedPlace(db, 'Ensligheten', 'parish', null);
        await addExternalId(db, 'place', orphan, 'arkivdigital.parish', 'ad-parish-503');
        await seedPersonEventAtPlace(db, null); // something must exist to export
        const { ged, fresh } = await roundTrip(db, version);
        // Control: the place is absent from the emitted file entirely. The
        // identifier is lost for the same reason `name` and `place_type` are,
        // which is the stated reason and not a missing carrier.
        expect(ged).not.toMatch(/Ensligheten/);
        expectNoIdentifier(await identifiersIn(fresh), 'arkivdigital.parish', 'ad-parish-503');
      });
    });
  }
});

/** A bare person to hang a media link on. Reuses the event helper's shape. */
async function seedPersonForMedia(db: Database): Promise<string> {
  const pid = crypto.randomUUID();
  await runSql(db, 'INSERT INTO persons (id) VALUES (?)', [pid]);
  await runSql(
    db,
    'INSERT INTO person_names (id, person_id, given_name, surname, sort_order) VALUES (?,?,?,?,0)',
    [crypto.randomUUID(), pid, 'Media', 'Host'],
  );
  return pid;
}
