/**
 * T25 — RootsMagic importer Phase 2 concept mapping.
 *
 * Pins the new T25 behaviour:
 *  - NoteTable rows are mapped to the shared `notes` + `note_links` tables.
 *  - WitnessTable.Role FK is resolved via RoleTable so 'Godparent' /
 *    'Officiant' map to the corresponding event_participants.role values
 *    instead of collapsing to 'witness'.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from 'node-sqlite3-wasm';
import { transformRootsMagic } from '../../src/import/rootsmagic/transform';
import { listNotes, getNotesForEntity } from '../../src/api/notes';
import { listPersons } from '../../src/api/persons';
import { runSql, queryAll } from '../../src/api/db';
import { createTestDb } from './helpers';

let ourDb: ReturnType<typeof createTestDb>;
let rmDb: Database;

async function runScript(db: Database, script: string): Promise<void> {
  for (const stmt of script.split(';').map(s => s.trim()).filter(Boolean)) {
    await runSql(db, stmt);
  }
}

async function createRmDb(): Promise<Database> {
  const db = new Database(':memory:');
  await runScript(db, `
    CREATE TABLE PersonTable (PersonID INTEGER PRIMARY KEY, UniqueID TEXT, Sex INTEGER, EditDate FLOAT, Living INTEGER, Note BLOB);
    CREATE TABLE NameTable (NameID INTEGER PRIMARY KEY, OwnerID INTEGER, Surname TEXT, Given TEXT, Prefix TEXT, Suffix TEXT, Nickname TEXT, NameType INTEGER, IsPrimary INTEGER, Note BLOB);
    CREATE TABLE EventTable (EventID INTEGER PRIMARY KEY, EventType INTEGER, OwnerType INTEGER, OwnerID INTEGER, PlaceID INTEGER, Date TEXT, Details BLOB, Note BLOB);
    CREATE TABLE FactTypeTable (FactTypeID INTEGER PRIMARY KEY, OwnerType INTEGER, Name TEXT, GedcomTag TEXT);
    CREATE TABLE FamilyTable (FamilyID INTEGER PRIMARY KEY, FatherID INTEGER, MotherID INTEGER, Note BLOB);
    CREATE TABLE ChildTable (ChildID INTEGER, FamilyID INTEGER, RelFather INTEGER, RelMother INTEGER);
    CREATE TABLE PlaceTable (PlaceID INTEGER PRIMARY KEY, Name TEXT, Latitude INTEGER, Longitude INTEGER, Note BLOB);
    CREATE TABLE SourceTable (SourceID INTEGER PRIMARY KEY, Name TEXT, RefNumber TEXT, ActualText TEXT, Comments TEXT);
    CREATE TABLE CitationTable (CitationID INTEGER PRIMARY KEY, OwnerType INTEGER, OwnerID INTEGER, SourceID INTEGER, Quality TEXT, Comments BLOB, ActualText BLOB, RefNumber TEXT);
    CREATE TABLE MultimediaTable (MediaID INTEGER PRIMARY KEY, MediaPath TEXT, MediaFile TEXT, Caption TEXT, Description BLOB);
    CREATE TABLE MediaLinkTable (LinkID INTEGER PRIMARY KEY, MediaID INTEGER, OwnerType INTEGER, OwnerID INTEGER, IsPrimary INTEGER, SortOrder INTEGER, Caption TEXT);
    CREATE TABLE WitnessTable (WitnessID INTEGER PRIMARY KEY, EventID INTEGER, PersonID INTEGER, Role INTEGER);
    CREATE TABLE NoteTable (NoteID INTEGER PRIMARY KEY, OwnerType INTEGER, OwnerID INTEGER, NoteType INTEGER, Name TEXT, Note TEXT);
    CREATE TABLE RoleTable (RoleID INTEGER PRIMARY KEY, RoleName TEXT)
  `);
  await runScript(db, `
    INSERT INTO FactTypeTable (FactTypeID, OwnerType, Name, GedcomTag) VALUES (1, 0, 'Birth', 'BIRT');
    INSERT INTO FactTypeTable (FactTypeID, OwnerType, Name, GedcomTag) VALUES (3, 0, 'Christen', 'CHR')
  `);
  return db;
}

beforeEach(async () => {
  ourDb = await createTestDb();
  rmDb = await createRmDb();
});

describe('T25 RootsMagic importer — NoteTable → shared notes', async () => {
  it('imports NoteTable rows as shared notes linked to the right entity', async () => {
    await runScript(rmDb, `
      INSERT INTO PersonTable (PersonID, Sex, Living) VALUES (1, 0, 1);
      INSERT INTO NameTable (NameID, OwnerID, Surname, Given, NameType, IsPrimary) VALUES (1, 1, 'Smith', 'John', 0, 1);
      INSERT INTO NoteTable (NoteID, OwnerType, OwnerID, Note) VALUES (10, 0, 1, 'A long biography for John.');
      INSERT INTO NoteTable (NoteID, OwnerType, OwnerID, Note) VALUES (11, 0, 1, 'A second authored note.')
    `);
    const summary = await transformRootsMagic(ourDb, rmDb);
    expect(summary.notes).toBe(2);

    const persons = await listPersons(ourDb);
    expect(persons).toHaveLength(1);
    const linked = await getNotesForEntity(ourDb, 'person', persons[0].id);
    expect(linked).toHaveLength(2);
    expect(linked.map(n => n.text)).toContain('A long biography for John.');
    expect(linked.map(n => n.text)).toContain('A second authored note.');

    // The notes are also visible in the global notes list.
    const allNotes = await listNotes(ourDb);
    expect(allNotes).toHaveLength(2);
  });

  it('skips NoteTable when not present in the source schema (older RM)', async () => {
    // Drop NoteTable to simulate older RM without it.
    await runSql(rmDb, 'DROP TABLE NoteTable');
    await runScript(rmDb, `
      INSERT INTO PersonTable (PersonID, Sex, Living) VALUES (1, 0, 1);
      INSERT INTO NameTable (NameID, OwnerID, Surname, Given, NameType, IsPrimary) VALUES (1, 1, 'X', 'Y', 0, 1)
    `);
    const summary = await transformRootsMagic(ourDb, rmDb);
    expect(summary.notes).toBe(0);
    expect(summary.persons).toBe(1);
  });
});

describe('T25 RootsMagic importer — RoleTable resolution', async () => {
  it('maps Godparent / Officiant via RoleTable to the correct participant role', async () => {
    await runScript(rmDb, `
      INSERT INTO RoleTable (RoleID, RoleName) VALUES (1, 'Witness');
      INSERT INTO RoleTable (RoleID, RoleName) VALUES (2, 'Godparent');
      INSERT INTO RoleTable (RoleID, RoleName) VALUES (3, 'Officiant');
      INSERT INTO PersonTable (PersonID, Sex, Living) VALUES (1, 0, 1);
      INSERT INTO PersonTable (PersonID, Sex, Living) VALUES (2, 1, 1);
      INSERT INTO PersonTable (PersonID, Sex, Living) VALUES (3, 0, 1);
      INSERT INTO NameTable (NameID, OwnerID, Surname, Given, NameType, IsPrimary) VALUES (1, 1, 'Smith', 'John', 0, 1);
      INSERT INTO NameTable (NameID, OwnerID, Surname, Given, NameType, IsPrimary) VALUES (2, 2, 'Jones', 'Anna', 0, 1);
      INSERT INTO NameTable (NameID, OwnerID, Surname, Given, NameType, IsPrimary) VALUES (3, 3, 'Brown', 'Bo', 0, 1);
      INSERT INTO EventTable (EventID, EventType, OwnerType, OwnerID, Date) VALUES (100, 1, 0, 1, 'D.+19000101..+00000000..');
      INSERT INTO WitnessTable (WitnessID, EventID, PersonID, Role) VALUES (1, 100, 2, 2);
      INSERT INTO WitnessTable (WitnessID, EventID, PersonID, Role) VALUES (2, 100, 3, 3)
    `);
    await transformRootsMagic(ourDb, rmDb);
    // Two witnesses on the birth event — one godparent, one officiant.
    const participants = await queryAll<{ role: string }>(ourDb,
      `SELECT role FROM event_participants WHERE role IN ('godparent','officiant','witness')`,
    );
    const roles = participants.map(p => p.role).sort();
    expect(roles).toContain('godparent');
    expect(roles).toContain('officiant');
  });
});
