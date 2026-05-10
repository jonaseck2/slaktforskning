/**
 * RootsMagic .rmgc importer — tests against a synthetic in-memory RM-shaped
 * SQLite database. The .rmgc format is plain SQLite, so we can build a
 * fixture in-memory by creating the same tables the real RootsMagic uses
 * and seeding rows. No external sample file required.
 *
 * For end-to-end validation against a real .rmgc, drop a file in
 * `export-import/samples/native-binary/` (gitignored) and run the
 * `tests/unit/rootsmagic-real-sample.test.ts` suite (skipped by default).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from 'node-sqlite3-wasm';
import { transformRootsMagic, parseRmDate } from '../../src/import/rootsmagic/transform';
import { listPersons, getPersonNames } from '../../src/api/persons';
import { listRelationships } from '../../src/api/relationships';
import { getEventsForPerson } from '../../src/api/events';
import { listSources } from '../../src/api/sources';
import { listPlaces } from '../../src/api/places';
import { runSql } from '../../src/api/db';
import { createTestDb } from './helpers';

let ourDb: ReturnType<typeof createTestDb>;
let rmDb: Database;

/** Run a multi-statement SQL block one statement at a time. */
async function runScript(db: Database, script: string): void {
  for (const stmt of script.split(';').map(s => s.trim()).filter(Boolean)) {
    await runSql(db, stmt);
  }
}

/** Build a minimal RootsMagic-shaped SQLite DB in memory for testing. */
async function createRmDb(): Database {
  const db = new Database(':memory:');
  // Tables we read in the transform; exact column shapes from a real .rmgc.
  await runScript(db, `
    CREATE TABLE PersonTable (PersonID INTEGER PRIMARY KEY, UniqueID TEXT, Sex INTEGER, EditDate FLOAT, ParentID INTEGER, SpouseID INTEGER, Color INTEGER, Relate1 INTEGER, Relate2 INTEGER, Flags INTEGER, Living INTEGER, IsPrivate INTEGER, Proof INTEGER, Bookmark INTEGER, Note BLOB);
    CREATE TABLE NameTable (NameID INTEGER PRIMARY KEY, OwnerID INTEGER, Surname TEXT, Given TEXT, Prefix TEXT, Suffix TEXT, Nickname TEXT, NameType INTEGER, Date TEXT, SortDate INTEGER, IsPrimary INTEGER, IsPrivate INTEGER, Proof INTEGER, EditDate FLOAT, Sentence BLOB, Note BLOB, BirthYear INTEGER, DeathYear INTEGER);
    CREATE TABLE EventTable (EventID INTEGER PRIMARY KEY, EventType INTEGER, OwnerType INTEGER, OwnerID INTEGER, FamilyID INTEGER, PlaceID INTEGER, SiteID INTEGER, Date TEXT, SortDate INTEGER, IsPrimary INTEGER, IsPrivate INTEGER, Proof INTEGER, Status INTEGER, EditDate FLOAT, Sentence BLOB, Details BLOB, Note BLOB);
    CREATE TABLE FactTypeTable (FactTypeID INTEGER PRIMARY KEY, OwnerType INTEGER, Name TEXT, Abbrev TEXT, GedcomTag TEXT, UseValue INTEGER, UseDate INTEGER, UsePlace INTEGER, Sentence BLOB, Flags INTEGER);
    CREATE TABLE FamilyTable (FamilyID INTEGER PRIMARY KEY, FatherID INTEGER, MotherID INTEGER, ChildID INTEGER, HusbOrder INTEGER, WifeOrder INTEGER, IsPrivate INTEGER, Proof INTEGER, SpouseLabel INTEGER, FatherLabel INTEGER, MotherLabel INTEGER, Note BLOB);
    CREATE TABLE ChildTable (RecID INTEGER PRIMARY KEY, ChildID INTEGER, FamilyID INTEGER, RelFather INTEGER, RelMother INTEGER, ChildOrder INTEGER, IsPrivate INTEGER, ProofFather INTEGER, ProofMother INTEGER, Note BLOB);
    CREATE TABLE PlaceTable (PlaceID INTEGER PRIMARY KEY, PlaceType INTEGER, Name TEXT, Abbrev TEXT, Normalized TEXT, Latitude INTEGER, Longitude INTEGER, LatLongExact INTEGER, MasterID INTEGER, Note BLOB);
    CREATE TABLE SourceTable (SourceID INTEGER PRIMARY KEY, Name TEXT, RefNumber TEXT, ActualText TEXT, Comments TEXT, IsPrivate INTEGER, TemplateID INTEGER, Fields BLOB);
    CREATE TABLE CitationTable (CitationID INTEGER PRIMARY KEY, OwnerType INTEGER, SourceID INTEGER, OwnerID INTEGER, Quality TEXT, IsPrivate INTEGER, Comments BLOB, ActualText BLOB, RefNumber TEXT, Flags INTEGER, Fields BLOB);
    CREATE TABLE MultimediaTable (MediaID INTEGER PRIMARY KEY, MediaType INTEGER, MediaPath TEXT, MediaFile TEXT, URL TEXT, Thumbnail BLOB, Caption TEXT, RefNumber TEXT, Date TEXT, SortDate INTEGER, Description BLOB);
    CREATE TABLE MediaLinkTable (LinkID INTEGER PRIMARY KEY, MediaID INTEGER, OwnerType INTEGER, OwnerID INTEGER, IsPrimary INTEGER, Include1 INTEGER, Include2 INTEGER, Include3 INTEGER, Include4 INTEGER, SortOrder INTEGER, RectLeft INTEGER, RectTop INTEGER, RectRight INTEGER, RectBottom INTEGER, Note TEXT, Caption TEXT, RefNumber TEXT, Date TEXT, SortDate INTEGER, Description BLOB);
    CREATE TABLE WitnessTable (WitnessID INTEGER PRIMARY KEY, EventID INTEGER, PersonID INTEGER, WitnessOrder INTEGER, Role INTEGER, Sentence TEXT, Note BLOB, Given TEXT, Surname TEXT, Prefix TEXT, Suffix TEXT)
  `);
  // Seed canonical FactType rows used in fixture data below.
  await runScript(db, `
    INSERT INTO FactTypeTable (FactTypeID, OwnerType, Name, GedcomTag) VALUES (1, 0, 'Birth', 'BIRT');
    INSERT INTO FactTypeTable (FactTypeID, OwnerType, Name, GedcomTag) VALUES (2, 0, 'Death', 'DEAT');
    INSERT INTO FactTypeTable (FactTypeID, OwnerType, Name, GedcomTag) VALUES (3, 0, 'Christen', 'CHR');
    INSERT INTO FactTypeTable (FactTypeID, OwnerType, Name, GedcomTag) VALUES (4, 0, 'Burial', 'BURI');
    INSERT INTO FactTypeTable (FactTypeID, OwnerType, Name, GedcomTag) VALUES (5, 0, 'Cremation', 'CREM');
    INSERT INTO FactTypeTable (FactTypeID, OwnerType, Name, GedcomTag) VALUES (14, 0, 'Ordination', 'ORDN');
    INSERT INTO FactTypeTable (FactTypeID, OwnerType, Name, GedcomTag) VALUES (300, 1, 'Marriage', 'MARR');
    INSERT INTO FactTypeTable (FactTypeID, OwnerType, Name, GedcomTag) VALUES (301, 1, 'Divorce', 'DIV')
  `);
  return db;
}

beforeEach(async () => {
  ourDb = await createTestDb();
  rmDb = await createRmDb();
});

// ── parseRmDate ────────────────────────────────────────────────────────────

describe('parseRmDate', async () => {
  it('parses an exact date', async () => {
    expect(parseRmDate('D.+19551002..+00000000..')).toEqual({
      dateType: 'exact',
      dateValue: '1955-10-02',
      dateValueEnd: null,
    });
  });

  it('parses a year-only date', async () => {
    expect(parseRmDate('D.+19000000..+00000000..')).toEqual({
      dateType: 'exact',
      dateValue: '1900',
      dateValueEnd: null,
    });
  });

  it('parses an "about" qualifier', async () => {
    expect(parseRmDate('D.+19100000.A+00000000..')).toEqual({
      dateType: 'about',
      dateValue: '1910',
      dateValueEnd: null,
    });
  });

  it('returns unknown for empty / null / unparseable', async () => {
    expect(parseRmDate(null).dateType).toBe('unknown');
    expect(parseRmDate('').dateType).toBe('unknown');
    expect(parseRmDate('garbage').dateType).toBe('unknown');
  });
});

// ── persons + names ────────────────────────────────────────────────────────

describe('transformRootsMagic — persons & names', async () => {
  it('imports a single person with primary name', async () => {
    await runScript(rmDb, `
      INSERT INTO PersonTable (PersonID, Sex, Living) VALUES (1, 0, 1);
      INSERT INTO NameTable (NameID, OwnerID, Surname, Given, NameType, IsPrimary) VALUES (1, 1, 'Smith', 'John', 0, 1)
    `);
    const summary = await transformRootsMagic(ourDb, rmDb);
    expect(summary.persons).toBe(1);
    const persons = await listPersons(ourDb);
    expect(persons).toHaveLength(1);
    expect(persons[0].sex).toBe('M');
    expect(persons[0].given_name).toBe('John');
    expect(persons[0].surname).toBe('Smith');
  });

  it('maps Sex 1 to F', async () => {
    await runScript(rmDb, `
      INSERT INTO PersonTable (PersonID, Sex) VALUES (1, 1);
      INSERT INTO NameTable (NameID, OwnerID, Surname, Given, IsPrimary) VALUES (1, 1, 'Doe', 'Jane', 1)
    `);
    await transformRootsMagic(ourDb, rmDb);
    expect((await listPersons(ourDb))[0].sex).toBe('F');
  });

  it('preserves UniqueID as a person_identifiers row of type uid', async () => {
    await runScript(rmDb, `
      INSERT INTO PersonTable (PersonID, Sex, UniqueID) VALUES (1, 0, '4615B5B2AA774289AAF47F4B8D79AEF8C265');
      INSERT INTO NameTable (NameID, OwnerID, Surname, Given, IsPrimary) VALUES (1, 1, 'Smith', 'John', 1)
    `);
    await transformRootsMagic(ourDb, rmDb);
    const personId = (await listPersons(ourDb))[0].id;
    const stmt = ourDb.prepare(
      'SELECT identifier_type, identifier_value FROM person_identifiers WHERE person_id = ?'
    );
    const idents = stmt.all([personId]) as Array<{ identifier_type: string; identifier_value: string }>;
    (stmt as unknown as { finalize(): void }).finalize();
    expect(idents).toEqual([
      { identifier_type: 'uid', identifier_value: '4615B5B2AA774289AAF47F4B8D79AEF8C265' },
    ]);
  });

  it('imports additional non-primary names (married, alias)', async () => {
    await runScript(rmDb, `
      INSERT INTO PersonTable (PersonID, Sex) VALUES (1, 1);
      INSERT INTO NameTable (NameID, OwnerID, Surname, Given, NameType, IsPrimary) VALUES (1, 1, 'Maiden', 'Jane', 0, 1);
      INSERT INTO NameTable (NameID, OwnerID, Surname, Given, NameType, IsPrimary) VALUES (2, 1, 'Married', 'Jane', 3, 0);
      INSERT INTO NameTable (NameID, OwnerID, Surname, Given, NameType, IsPrimary) VALUES (3, 1, 'Alias', 'Janie', 4, 0)
    `);
    await transformRootsMagic(ourDb, rmDb);
    const personId = (await listPersons(ourDb))[0].id;
    const names = await getPersonNames(ourDb, personId);
    const types = names.map(n => n.name_type).sort();
    expect(types).toContain('married');
    expect(types).toContain('alias');
  });
});

// ── families ───────────────────────────────────────────────────────────────

describe('transformRootsMagic — families & children', async () => {
  it('creates couple + parent_child relationships', async () => {
    await runScript(rmDb, `
      INSERT INTO PersonTable (PersonID, Sex) VALUES (1, 0);
      INSERT INTO PersonTable (PersonID, Sex) VALUES (2, 1);
      INSERT INTO PersonTable (PersonID, Sex) VALUES (3, 0);
      INSERT INTO NameTable (NameID, OwnerID, Surname, Given, IsPrimary) VALUES (1, 1, 'Smith', 'Father', 1);
      INSERT INTO NameTable (NameID, OwnerID, Surname, Given, IsPrimary) VALUES (2, 2, 'Smith', 'Mother', 1);
      INSERT INTO NameTable (NameID, OwnerID, Surname, Given, IsPrimary) VALUES (3, 3, 'Smith', 'Child', 1);
      INSERT INTO FamilyTable (FamilyID, FatherID, MotherID) VALUES (1, 1, 2);
      INSERT INTO ChildTable (RecID, ChildID, FamilyID, RelFather, RelMother) VALUES (1, 3, 1, 0, 0)
    `);
    const summary = await transformRootsMagic(ourDb, rmDb);
    expect(summary.coupleRelationships).toBe(1);
    expect(summary.parentChildRelationships).toBe(2);
    const rels = await listRelationships(ourDb);
    const types = rels.map(r => r.type).sort();
    expect(types).toEqual(['couple', 'parent_child', 'parent_child']);
  });

  it('maps RelFather=1 to adopted parent_child subtype', async () => {
    await runScript(rmDb, `
      INSERT INTO PersonTable (PersonID, Sex) VALUES (1, 0);
      INSERT INTO PersonTable (PersonID, Sex) VALUES (2, 1);
      INSERT INTO PersonTable (PersonID, Sex) VALUES (3, 0);
      INSERT INTO NameTable (NameID, OwnerID, Surname, Given, IsPrimary) VALUES (1, 1, 'A', 'Father', 1);
      INSERT INTO NameTable (NameID, OwnerID, Surname, Given, IsPrimary) VALUES (2, 2, 'A', 'Mother', 1);
      INSERT INTO NameTable (NameID, OwnerID, Surname, Given, IsPrimary) VALUES (3, 3, 'A', 'Child', 1);
      INSERT INTO FamilyTable (FamilyID, FatherID, MotherID) VALUES (1, 1, 2);
      INSERT INTO ChildTable (RecID, ChildID, FamilyID, RelFather, RelMother) VALUES (1, 3, 1, 1, 1)
    `);
    await transformRootsMagic(ourDb, rmDb);
    const rels = (await listRelationships(ourDb)).filter(r => r.type === 'parent_child');
    expect(rels.every(r => r.subtype === 'adopted')).toBe(true);
  });
});

// ── events ─────────────────────────────────────────────────────────────────

describe('transformRootsMagic — events', async () => {
  it('imports a person birth event with date + place', async () => {
    await runScript(rmDb, `
      INSERT INTO PersonTable (PersonID, Sex) VALUES (1, 0);
      INSERT INTO NameTable (NameID, OwnerID, Surname, Given, IsPrimary) VALUES (1, 1, 'Smith', 'John', 1);
      INSERT INTO PlaceTable (PlaceID, Name, Latitude, Longitude) VALUES (1, 'STOCK - Stockholm Sweden', 591326800, 180685800);
      INSERT INTO EventTable (EventID, EventType, OwnerType, OwnerID, PlaceID, Date) VALUES (1, 1, 0, 1, 1, 'D.+19551002..+00000000..')
    `);
    const summary = await transformRootsMagic(ourDb, rmDb);
    expect(summary.events).toBe(1);
    expect(summary.places).toBe(1);
    const personId = (await listPersons(ourDb))[0].id;
    const events = await getEventsForPerson(ourDb, personId);
    expect(events).toHaveLength(1);
    expect(events[0].event_type).toBe('birth');
    expect(events[0].date_value).toBe('1955-10-02');
    expect(events[0].date_type).toBe('exact');
  });

  it('strips the RootsMagic 5-char abbreviation prefix from place names', async () => {
    await runScript(rmDb, `
      INSERT INTO PlaceTable (PlaceID, Name) VALUES (1, 'ABA - Aba Nigeria')
    `);
    await transformRootsMagic(ourDb, rmDb);
    expect((await listPlaces(ourDb))[0].name).toBe('Aba Nigeria');
  });

  it('imports family-level marriage events', async () => {
    await runScript(rmDb, `
      INSERT INTO PersonTable (PersonID, Sex) VALUES (1, 0);
      INSERT INTO PersonTable (PersonID, Sex) VALUES (2, 1);
      INSERT INTO NameTable (NameID, OwnerID, Surname, Given, IsPrimary) VALUES (1, 1, 'A', 'H', 1);
      INSERT INTO NameTable (NameID, OwnerID, Surname, Given, IsPrimary) VALUES (2, 2, 'A', 'W', 1);
      INSERT INTO FamilyTable (FamilyID, FatherID, MotherID) VALUES (1, 1, 2);
      INSERT INTO EventTable (EventID, EventType, OwnerType, OwnerID, FamilyID, Date) VALUES (1, 300, 1, 1, 1, 'D.+19000615..+00000000..')
    `);
    const summary = await transformRootsMagic(ourDb, rmDb);
    expect(summary.events).toBe(1);
    const rels = (await listRelationships(ourDb)).filter(r => r.type === 'couple');
    const stmt = ourDb.prepare("SELECT event_type, date_value FROM events WHERE event_type='marriage' AND relationship_id=?");
    const marriageEvents = stmt.all([rels[0].id]) as Array<{ event_type: string; date_value: string }>;
    (stmt as unknown as { finalize(): void }).finalize();
    expect(marriageEvents).toHaveLength(1);
    expect(marriageEvents[0].date_value).toBe('1900-06-15');
  });
});

// ── sources & citations ────────────────────────────────────────────────────

describe('transformRootsMagic — sources & citations', async () => {
  it('imports sources + person-attached citations', async () => {
    await runScript(rmDb, `
      INSERT INTO PersonTable (PersonID, Sex) VALUES (1, 0);
      INSERT INTO NameTable (NameID, OwnerID, Surname, Given, IsPrimary) VALUES (1, 1, 'Smith', 'John', 1);
      INSERT INTO SourceTable (SourceID, Name, RefNumber, ActualText) VALUES (1, '1900 US Census, Suffolk County', 'p. 12', 'Transcribed text');
      INSERT INTO CitationTable (CitationID, OwnerType, SourceID, OwnerID, Quality, RefNumber, Comments) VALUES (1, 0, 1, 1, '3', 'p. 12', 'Strong evidence')
    `);
    const summary = await transformRootsMagic(ourDb, rmDb);
    expect(summary.sources).toBe(1);
    expect(summary.citations).toBe(1);
    const sources = await listSources(ourDb);
    expect(sources[0].title).toBe('1900 US Census, Suffolk County');
    expect(sources[0].abstract).toBe('Transcribed text');
    const personId = (await listPersons(ourDb))[0].id;
    const stmt = ourDb.prepare('SELECT page, confidence, notes FROM citations WHERE person_id = ?');
    const cits = stmt.all([personId]) as Array<{ page: string; confidence: number; notes: string }>;
    (stmt as unknown as { finalize(): void }).finalize();
    expect(cits).toHaveLength(1);
    expect(cits[0].confidence).toBe(3);
    expect(cits[0].notes).toBe('Strong evidence');
  });
});
