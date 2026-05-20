// T26 — Archive round-trip for GEDCOM-7-shaped concepts.
//
// The .zip archive is our own offboarding format — it bundles a GEDCOM file
// plus media. The GEDCOM inside the archive is the canonical interchange,
// so anything the GEDCOM 7.0 exporter/importer can round-trip will survive
// an archive round-trip too. This test confirms the composition (not the
// per-concept round-trip — that's covered by the gedcom-*-roundtrip tests
// in the sibling files).
//
// User goal (per the GEDCOM-alignment plan): an exported archive carries
// every authored field for the Phase-2 tables (notes, person_associations,
// name_translations, place_translations, source_coverage_events) plus the
// new events columns (is_negation, negation_event_type) when the user
// opens that archive on another machine / another tool.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Database } from 'node-sqlite3-wasm';
import { exportArchiveToBytes } from '../../src/api/archive_export';
import { importArchiveFromBytes } from '../../src/api/archive_import';
import { createPerson } from '../../src/api/persons';
import { createEvent } from '../../src/api/events';
import { addEventParticipant } from '../../src/api/relationships';
import { createPlace } from '../../src/api/places';
import { createSource } from '../../src/api/sources';
import { createRepository, linkSourceRepository, getRepositoriesForSource } from '../../src/api/repositories';
import { createNote, linkNoteToEntity, getNotesForEntity } from '../../src/api/notes';
import { createPersonAssociation, getAssociationsForPerson } from '../../src/api/person_associations';
import { createNameTranslation, getTranslationsForName, createPlaceTranslation, getTranslationsForPlace } from '../../src/api/translations';
import { createSourceCoverageEvent, getCoverageForSource } from '../../src/api/source_coverage';
import { queryAll } from '../../src/api/db';
import { createTestDb } from './helpers';

let db: Database;
let tmpDir: string;

beforeEach(async () => {
  db = await createTestDb();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-newconcepts-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('archive round-trip (GEDCOM 7.0) carries Phase-2 concepts', async () => {
  it('preserves notes, associations, translations, coverage and negation events end-to-end', async () => {
    // ── Seed: comprehensive test data covering every new table ──────────
    const anna = await createPerson(db, { sex: 'F', given_name: 'Anna', surname: 'Svensson' });
    const annaNames = await queryAll<{ id: string; person_id: string }>(
      db, 'SELECT * FROM person_names WHERE person_id = ?', [anna.id],
    );
    const annaName = annaNames[0];
    const bertil = await createPerson(db, { sex: 'M', given_name: 'Bertil', surname: 'Andersson' });

    const stockholm = await createPlace(db, { name: 'Stockholm', place_type: 'city', country: 'Sweden' });

    // Negation event: "No marriage on record" (GEDCOM 7.0 `NO MARR`)
    const negation = await createEvent(db, {
      event_type: 'marriage',
      is_negation: true,
      negation_event_type: 'marriage',
      date_original: 'never',
      date_type: 'unknown',
    });
    await addEventParticipant(db, { event_id: negation.id, person_id: anna.id, role: 'primary' });

    // Birth event referencing stockholm — needed for the place to appear in
    // GEDCOM (places only emit when referenced by an event).
    const birth = await createEvent(db, {
      event_type: 'birth',
      date_type: 'exact',
      date_value: '1880-03-15',
      date_original: '15 MAR 1880',
      place_id: stockholm.id,
    });
    await addEventParticipant(db, { event_id: birth.id, person_id: anna.id, role: 'primary' });

    // Person association (godparent role — GEDCOM 7.0 ASSO)
    const association = await createPersonAssociation(db, {
      person_id: anna.id,
      related_person_id: bertil.id,
      role: 'godparent',
      notes: 'godparent at baptism',
    });

    // Name translation (GEDCOM 7.0 NAME/TRAN)
    const nameTran = await createNameTranslation(db, {
      person_name_id: annaName.id,
      value: 'Анна Свенссон',
      language: 'ru',
      transliteration_scheme: 'cyrillic',
    });

    // Place translation (GEDCOM 7.0 PLAC/TRAN)
    const placeTran = await createPlaceTranslation(db, {
      place_id: stockholm.id,
      value: 'Стокгольм',
      language: 'ru',
    });

    // Shared note (GEDCOM 7.0 SNOTE) linked to both persons
    const sharedNote = await createNote(db, { text: 'Shared family note about Anna and Bertil', language: 'en' });
    await linkNoteToEntity(db, sharedNote.id, 'person', anna.id);
    await linkNoteToEntity(db, sharedNote.id, 'person', bertil.id);

    // Source + repository + coverage (GEDCOM SOUR/DATA/EVEN + REPO)
    const source = await createSource(db, { title: 'Stockholms domkyrkoförsamling kyrkoböcker', author: 'Stockholm', source_type: 'church_record' });
    const repo = await createRepository(db, {
      name: 'Riksarkivet',
      city: 'Stockholm',
      country: 'Sweden',
    });
    await linkSourceRepository(db, source.id, repo.id);
    const coverage = await createSourceCoverageEvent(db, {
      source_id: source.id,
      event_type: 'birth',
      date_value_from: '1850-01-01',
      date_value_to: '1900-12-31',
      place_id: stockholm.id,
      notes: 'covers Stockholm parish births',
    });

    // ── Export: 7.0 captures the new concepts losslessly ────────────────
    const { zipBytes, report: exportReport } = await exportArchiveToBytes(
      db,
      async () => null,
      { gedcomVersion: '7.0' },
    );
    expect(exportReport.gedcomReport.persons).toBe(2);
    expect(zipBytes.length).toBeGreaterThan(0);

    // ── Import: fresh DB ────────────────────────────────────────────────
    const db2 = await createTestDb();
    const importReport = await importArchiveFromBytes(
      db2,
      zipBytes,
      'family-media',
      async () => { /* no media */ },
    );
    expect(importReport.gedcomReport.persons).toBe(2);

    // ── Assert: every new-table row survived ────────────────────────────

    // Persons round-trip
    const persons2 = await queryAll<{ id: string; sex: string }>(db2, 'SELECT * FROM persons');
    expect(persons2.length).toBe(2);

    // Map import-side persons by name so we don't depend on UUID stability
    const names2 = await queryAll<{ id: string; person_id: string; given_name: string; surname: string }>(
      db2,
      'SELECT * FROM person_names',
    );
    const anna2 = names2.find(n => n.given_name === 'Anna');
    const bertil2 = names2.find(n => n.given_name === 'Bertil');
    expect(anna2).toBeDefined();
    expect(bertil2).toBeDefined();

    // Negation event survives
    const events2 = await queryAll<{ id: string; event_type: string; is_negation: number | boolean; negation_event_type: string | null }>(
      db2,
      'SELECT * FROM events WHERE is_negation = 1',
    );
    expect(events2.length).toBeGreaterThanOrEqual(1);
    const negation2 = events2.find(e => e.negation_event_type === 'marriage');
    expect(negation2).toBeDefined();

    // Person association
    const associations2 = await getAssociationsForPerson(db2, anna2!.person_id);
    expect(associations2.length).toBe(1);
    expect(associations2[0].role).toBe('godparent');
    expect(associations2[0].related_person_id).toBe(bertil2!.person_id);

    // Name translation
    const nameTrans2 = await getTranslationsForName(db2, anna2!.id);
    expect(nameTrans2.length).toBe(1);
    expect(nameTrans2[0].value).toBe('Анна Свенссон');
    expect(nameTrans2[0].language).toBe('ru');

    // Place translation (place id may differ — lookup by name)
    const places2 = await queryAll<{ id: string; name: string }>(db2, 'SELECT * FROM places WHERE name = ?', ['Stockholm']);
    expect(places2.length).toBeGreaterThanOrEqual(1);
    const placeTrans2 = await getTranslationsForPlace(db2, places2[0].id);
    expect(placeTrans2.length).toBe(1);
    expect(placeTrans2[0].value).toBe('Стокгольм');

    // Shared note linked to both persons
    const annaNotes = await getNotesForEntity(db2, 'person', anna2!.person_id);
    const bertilNotes = await getNotesForEntity(db2, 'person', bertil2!.person_id);
    expect(annaNotes.length).toBeGreaterThanOrEqual(1);
    expect(bertilNotes.length).toBeGreaterThanOrEqual(1);
    // The same note ID — proves it's a *shared* note, not duplicated inline
    expect(annaNotes[0].text).toContain('Shared family note');
    expect(bertilNotes[0].text).toContain('Shared family note');
    expect(annaNotes[0].id).toBe(bertilNotes[0].id);

    // Source coverage survives
    const sources2 = await queryAll<{ id: string; title: string }>(db2, 'SELECT * FROM sources');
    const source2 = sources2.find(s => s.title === 'Stockholms domkyrkoförsamling kyrkoböcker');
    expect(source2).toBeDefined();
    const coverage2 = await getCoverageForSource(db2, source2!.id);
    expect(coverage2.length).toBe(1);
    expect(coverage2[0].event_type).toBe('birth');
    expect(coverage2[0].date_value_from).toBe('1850-01-01');
    expect(coverage2[0].date_value_to).toBe('1900-12-31');

    // Repository + source-repository link survives
    const repos2 = await getRepositoriesForSource(db2, source2!.id);
    expect(repos2.length).toBe(1);
    expect(repos2[0].name).toBe('Riksarkivet');

    // Reference the unused locals so tsc doesn't complain
    void association; void nameTran; void placeTran; void coverage;
  });

  it('round-trip preserves a single-person db with no new-concept rows (regression guard)', async () => {
    // Empty data path — make sure we didn't introduce a crash when the new
    // tables are simply empty.
    await createPerson(db, { sex: 'M', given_name: 'Solo' });
    const { zipBytes } = await exportArchiveToBytes(db, async () => null, { gedcomVersion: '7.0' });
    const db2 = await createTestDb();
    const report = await importArchiveFromBytes(db2, zipBytes, 'family-media', async () => {});
    expect(report.gedcomReport.persons).toBe(1);

    // All new tables exist and are queryable (verifies schema migration
    // landed on the fresh import DB too).
    expect((await queryAll(db2, 'SELECT * FROM notes')).length).toBe(0);
    expect((await queryAll(db2, 'SELECT * FROM person_associations')).length).toBe(0);
    expect((await queryAll(db2, 'SELECT * FROM name_translations')).length).toBe(0);
    expect((await queryAll(db2, 'SELECT * FROM place_translations')).length).toBe(0);
    expect((await queryAll(db2, 'SELECT * FROM source_coverage_events')).length).toBe(0);
  });
});
