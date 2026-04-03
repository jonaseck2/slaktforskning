import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers';
import { parseGedcom } from '../../src/gedcom/parser';
import { parseGedcomDate, formatGedcomDate } from '../../src/gedcom/date';
import { importGedcom } from '../../src/gedcom/importer';
import { exportGedcom } from '../../src/gedcom/exporter';
import { listPersons, getPersonNames, getPersonIdentifiers, createPerson, addPersonName, addPersonIdentifier } from '../../src/api/persons';
import { listRelationships, createRelationship, addEventParticipant, getEventParticipants } from '../../src/api/relationships';
import { createEvent } from '../../src/api/events';
import { getEventsForPerson } from '../../src/api/events';
import { createSource, listSources, createCitation, getCitationsForPerson, getCitationsForRelationship, getCitationsForPlace, getCitationsForEvent } from '../../src/api/sources';
import { createPlace, listPlaces } from '../../src/api/places';

let db: ReturnType<typeof createTestDb>;
beforeEach(() => { db = createTestDb(); });

// ──────────────────────────────────────────────
// Parser
// ──────────────────────────────────────────────
describe('parseGedcom', () => {
  it('parses a minimal INDI record', () => {
    const text = `0 HEAD\n1 GEDC\n2 VERS 5.5.1\n0 @I1@ INDI\n1 NAME John /Smith/\n1 SEX M\n0 TRLR`;
    const tree = parseGedcom(text);
    const indi = tree.find(n => n.tag === 'INDI');
    expect(indi?.xref).toBe('@I1@');
    const name = indi?.children.find(c => c.tag === 'NAME');
    expect(name?.value).toBe('John /Smith/');
    const sex = indi?.children.find(c => c.tag === 'SEX');
    expect(sex?.value).toBe('M');
  });

  it('concatenates CONT lines', () => {
    const text = `0 @N1@ NOTE This is line one.\n1 CONT This is line two.\n0 TRLR`;
    const tree = parseGedcom(text);
    const note = tree.find(n => n.tag === 'NOTE');
    expect(note?.value).toBe('This is line one.\nThis is line two.');
  });

  it('concatenates CONC lines without newline', () => {
    const text = `0 @I1@ INDI\n1 NOTE First part\n2 CONC second part\n0 TRLR`;
    const tree = parseGedcom(text);
    const indi = tree.find(n => n.tag === 'INDI');
    const note = indi?.children.find(c => c.tag === 'NOTE');
    expect(note?.value).toBe('First partsecond part');
  });

  it('handles FAM with HUSB and WIFE', () => {
    const text = `0 @F1@ FAM\n1 HUSB @I1@\n1 WIFE @I2@\n1 CHIL @I3@\n0 TRLR`;
    const tree = parseGedcom(text);
    const fam = tree.find(n => n.tag === 'FAM');
    expect(fam?.xref).toBe('@F1@');
    expect(fam?.children.find(c => c.tag === 'HUSB')?.value).toBe('@I1@');
    expect(fam?.children.find(c => c.tag === 'WIFE')?.value).toBe('@I2@');
    expect(fam?.children.find(c => c.tag === 'CHIL')?.value).toBe('@I3@');
  });

  it('handles CRLF line endings', () => {
    const text = `0 @I1@ INDI\r\n1 SEX F\r\n0 TRLR`;
    const tree = parseGedcom(text);
    const indi = tree.find(n => n.tag === 'INDI');
    expect(indi?.children.find(c => c.tag === 'SEX')?.value).toBe('F');
  });
});

// ──────────────────────────────────────────────
// Date parser
// ──────────────────────────────────────────────
describe('parseGedcomDate', () => {
  it('parses full date DD MON YYYY', () => {
    const r = parseGedcomDate('12 JUN 1845');
    expect(r.date_type).toBe('exact');
    expect(r.date_value).toBe('1845-06-12');
    expect(r.date_original).toBe('12 JUN 1845');
  });

  it('parses month + year', () => {
    const r = parseGedcomDate('JUN 1845');
    expect(r.date_type).toBe('exact');
    expect(r.date_value).toBe('1845-06');
  });

  it('parses year only', () => {
    const r = parseGedcomDate('1845');
    expect(r.date_type).toBe('exact');
    expect(r.date_value).toBe('1845');
  });

  it('parses ABT', () => {
    expect(parseGedcomDate('ABT 1845').date_type).toBe('about');
    expect(parseGedcomDate('ABT 1845').date_value).toBe('1845');
  });

  it('parses CAL and EST as about', () => {
    expect(parseGedcomDate('CAL 1800').date_type).toBe('about');
    expect(parseGedcomDate('EST 1800').date_type).toBe('about');
  });

  it('parses BEF', () => {
    const r = parseGedcomDate('BEF 1850');
    expect(r.date_type).toBe('before');
    expect(r.date_value).toBe('1850');
  });

  it('parses AFT', () => {
    const r = parseGedcomDate('AFT 1840');
    expect(r.date_type).toBe('after');
    expect(r.date_value).toBe('1840');
  });

  it('parses BET AND', () => {
    const r = parseGedcomDate('BET 1840 AND 1850');
    expect(r.date_type).toBe('between');
    expect(r.date_value).toBe('1840');
    expect(r.date_value_end).toBe('1850');
  });

  it('parses FROM TO', () => {
    const r = parseGedcomDate('FROM 1840 TO 1850');
    expect(r.date_type).toBe('between');
    expect(r.date_value).toBe('1840');
    expect(r.date_value_end).toBe('1850');
  });

  it('returns unknown for unparseable string', () => {
    const r = parseGedcomDate('UNKNOWN DATE');
    expect(r.date_type).toBe('unknown');
    expect(r.date_value).toBeNull();
  });
});

describe('formatGedcomDate', () => {
  it('returns date_original when set', () => {
    expect(formatGedcomDate('exact', '1845-06-12', null, '12 JUN 1845')).toBe('12 JUN 1845');
  });

  it('formats ISO date to GEDCOM', () => {
    expect(formatGedcomDate('exact', '1845-06-12', null, '')).toBe('12 JUN 1845');
  });

  it('formats year only', () => {
    expect(formatGedcomDate('exact', '1845', null, '')).toBe('1845');
  });

  it('formats ABT', () => {
    expect(formatGedcomDate('about', '1845', null, '')).toBe('ABT 1845');
  });

  it('formats BEF', () => {
    expect(formatGedcomDate('before', '1850', null, '')).toBe('BEF 1850');
  });

  it('formats BET AND', () => {
    expect(formatGedcomDate('between', '1840', '1850', '')).toBe('BET 1840 AND 1850');
  });
});

// ──────────────────────────────────────────────
// Importer
// ──────────────────────────────────────────────
describe('importGedcom', () => {
  it('imports a person with name and birth event', () => {
    const ged = `0 HEAD\n1 GEDC\n2 VERS 5.5.1\n0 @I1@ INDI\n1 NAME Lars /Eriksson/\n1 SEX M\n1 BIRT\n2 DATE 15 MAR 1842\n2 PLAC Björkvik\n0 TRLR`;
    importGedcom(db, parseGedcom(ged));
    const persons = listPersons(db);
    expect(persons).toHaveLength(1);
    expect(persons[0].sex).toBe('M');
    const names = getPersonNames(db, persons[0].id);
    expect(names[0].given_name).toBe('Lars');
    expect(names[0].surname).toBe('Eriksson');
  });

  it('creates place records from PLAC tags', () => {
    const ged = `0 @I1@ INDI\n1 BIRT\n2 DATE 1842\n2 PLAC Fässberg\n0 TRLR`;
    importGedcom(db, parseGedcom(ged));
    const places = listPlaces(db);
    expect(places.some(p => p.name === 'Fässberg')).toBe(true);
  });

  it('imports a FAM record as couple + parent_child relationships', () => {
    const ged = [
      '0 HEAD',
      '0 @I1@ INDI\n1 NAME Erik /Larsson/\n1 SEX M',
      '0 @I2@ INDI\n1 NAME Anna /Karlsdotter/\n1 SEX F',
      '0 @I3@ INDI\n1 NAME Lars /Eriksson/\n1 SEX M',
      '0 @F1@ FAM\n1 HUSB @I1@\n1 WIFE @I2@\n1 CHIL @I3@',
      '0 TRLR',
    ].join('\n');
    importGedcom(db, parseGedcom(ged));
    const rels = listRelationships(db);
    const couple = rels.find(r => r.type === 'couple');
    const parentChild = rels.filter(r => r.type === 'parent_child');
    expect(couple).toBeTruthy();
    expect(parentChild).toHaveLength(2); // father→child, mother→child
  });

  it('imports marriage event on FAM record', () => {
    const ged = [
      '0 @I1@ INDI\n1 NAME Erik /Larsson/\n1 SEX M',
      '0 @I2@ INDI\n1 NAME Anna /Karlsdotter/\n1 SEX F',
      '0 @F1@ FAM\n1 HUSB @I1@\n1 WIFE @I2@\n1 MARR\n2 DATE 15 JUN 1870\n2 PLAC Göteborg',
      '0 TRLR',
    ].join('\n');
    importGedcom(db, parseGedcom(ged));
    const rels = listRelationships(db);
    const couple = rels.find(r => r.type === 'couple');
    expect(couple).toBeTruthy();
    expect(couple?.subtype).toBe('marriage');
    const places = listPlaces(db);
    expect(places.some(p => p.name === 'Göteborg')).toBe(true);
  });

  it('sets couple subtype to unknown when no MARR event', () => {
    const ged = [
      '0 @I1@ INDI\n1 NAME Erik /Larsson/\n1 SEX M',
      '0 @I2@ INDI\n1 NAME Anna /Karlsdotter/\n1 SEX F',
      '0 @F1@ FAM\n1 HUSB @I1@\n1 WIFE @I2@',
      '0 TRLR',
    ].join('\n');
    importGedcom(db, parseGedcom(ged));
    const couple = listRelationships(db).find(r => r.type === 'couple');
    expect(couple?.subtype).toBe('unknown');
  });

  it('imports REFN and RIN as person identifiers', () => {
    const ged = `0 @I1@ INDI\n1 NAME Test /Person/\n1 REFN ABC-123\n1 RIN 456\n0 TRLR`;
    importGedcom(db, parseGedcom(ged));
    const persons = listPersons(db);
    const identifiers = getPersonIdentifiers(db, persons[0].id);
    expect(identifiers.some(i => i.identifier_type === 'refn' && i.identifier_value === 'ABC-123')).toBe(true);
    expect(identifiers.some(i => i.identifier_type === 'rin' && i.identifier_value === '456')).toBe(true);
  });

  it('imports name prefix and suffix', () => {
    const ged = `0 @I1@ INDI\n1 NAME Lars /Eriksson/\n2 NPFX Dr.\n2 NSFX Jr.\n0 TRLR`;
    importGedcom(db, parseGedcom(ged));
    const persons = listPersons(db);
    const names = getPersonNames(db, persons[0].id);
    expect(names[0].name_prefix).toBe('Dr.');
    expect(names[0].name_suffix).toBe('Jr.');
  });
});

// ──────────────────────────────────────────────
// Importer — Genney 4.1 profile
// ──────────────────────────────────────────────
describe('importGedcom (Genney profile)', () => {
  it('stores _UID as a person identifier', () => {
    const ged = [
      '0 @I1@ INDI',
      '1 NAME Erik /Larsson/',
      '1 _UID A1B2C3D4-E5F6-7890-ABCD-EF1234567890',
      '0 TRLR',
    ].join('\n');
    importGedcom(db, parseGedcom(ged), { profile: 'genney' });
    const persons = listPersons(db);
    const identifiers = getPersonIdentifiers(db, persons[0].id);
    expect(identifiers.some(i => i.identifier_type === 'other' && i.identifier_value.includes('A1B2C3D4'))).toBe(true);
  });

  it('appends _YHAPLOGROUP to person notes', () => {
    const ged = [
      '0 @I1@ INDI',
      '1 NAME Erik /Larsson/',
      '1 _YHAPLOGROUP R1b',
      '0 TRLR',
    ].join('\n');
    importGedcom(db, parseGedcom(ged), { profile: 'genney' });
    const persons = listPersons(db);
    expect(persons[0].notes).toContain('Y-DNA: R1b');
  });

  it('appends _MHAPLOGROUP to person notes', () => {
    const ged = [
      '0 @I1@ INDI',
      '1 NAME Anna /Persdotter/',
      '1 _MHAPLOGROUP H1',
      '0 TRLR',
    ].join('\n');
    importGedcom(db, parseGedcom(ged), { profile: 'genney' });
    const persons = listPersons(db);
    expect(persons[0].notes).toContain('mtDNA: H1');
  });

  it('appends both haplogroups when both are present', () => {
    const ged = [
      '0 @I1@ INDI',
      '1 NAME Erik /Larsson/',
      '1 _YHAPLOGROUP R1b',
      '1 _MHAPLOGROUP H1',
      '0 TRLR',
    ].join('\n');
    importGedcom(db, parseGedcom(ged), { profile: 'genney' });
    const persons = listPersons(db);
    expect(persons[0].notes).toContain('Y-DNA: R1b');
    expect(persons[0].notes).toContain('mtDNA: H1');
  });

  it('detects patronymic surname and sets patronymic_base', () => {
    const ged = [
      '0 @I1@ INDI',
      '1 NAME Lars /Eriksson/',
      '1 SEX M',
      '0 TRLR',
    ].join('\n');
    importGedcom(db, parseGedcom(ged), { profile: 'genney' });
    const persons = listPersons(db);
    const names = getPersonNames(db, persons[0].id);
    expect(names[0].patronymic_base).toBe('Erik');
  });

  it('creates hierarchical place chain from Swedish PLAC string', () => {
    const ged = [
      '0 @I1@ INDI',
      '1 NAME Lars /Eriksson/',
      '1 BIRT',
      '2 DATE 1842',
      '2 PLAC Fässberg, Mölndals landsförsamling, Göteborgs och Bohus, Sverige',
      '0 TRLR',
    ].join('\n');
    importGedcom(db, parseGedcom(ged), { profile: 'genney' });
    const places = listPlaces(db);
    expect(places.some(p => p.name === 'Fässberg')).toBe(true);
    expect(places.some(p => p.name === 'Sverige')).toBe(true);
    expect(places).toHaveLength(4);
    // Verify parent chain
    const innermost = places.find(p => p.name === 'Fässberg')!;
    expect(innermost.parent_place_id).not.toBeNull();
  });

  it('does not set patronymic_base without genney profile', () => {
    const ged = [
      '0 @I1@ INDI',
      '1 NAME Lars /Eriksson/',
      '0 TRLR',
    ].join('\n');
    importGedcom(db, parseGedcom(ged)); // no profile
    const persons = listPersons(db);
    const names = getPersonNames(db, persons[0].id);
    expect(names[0].patronymic_base).toBeNull();
  });

  it('extracts preferred name from Genney * notation in given name', () => {
    const ged = [
      '0 @I1@ INDI',
      '1 NAME Eva Linda* Marie /Ahnstedt/',
      '1 SEX F',
      '0 TRLR',
    ].join('\n');
    importGedcom(db, parseGedcom(ged), { profile: 'genney' });
    const persons = listPersons(db);
    const names = getPersonNames(db, persons[0].id);
    expect(names[0].given_name).toBe('Eva Linda Marie');
    expect(names[0].preferred_name).toBe('Linda');
  });

  it('extracts preferred name when * is on first token only', () => {
    const ged = [
      '0 @I1@ INDI',
      '1 NAME Lars* Erik /Johansson/',
      '0 TRLR',
    ].join('\n');
    importGedcom(db, parseGedcom(ged), { profile: 'genney' });
    const persons = listPersons(db);
    const names = getPersonNames(db, persons[0].id);
    expect(names[0].given_name).toBe('Lars Erik');
    expect(names[0].preferred_name).toBe('Lars');
  });

  it('does not extract * preferred name without genney profile', () => {
    const ged = [
      '0 @I1@ INDI',
      '1 NAME Eva Linda* Marie /Ahnstedt/',
      '0 TRLR',
    ].join('\n');
    importGedcom(db, parseGedcom(ged)); // no profile
    const persons = listPersons(db);
    const names = getPersonNames(db, persons[0].id);
    // * is left as-is without genney profile
    expect(names[0].given_name).toContain('*');
    expect(names[0].preferred_name).toBeNull();
  });

  it('creates flat place without genney profile', () => {
    const ged = [
      '0 @I1@ INDI',
      '1 BIRT',
      '2 PLAC Fässberg, Mölndals landsförsamling, Göteborgs och Bohus, Sverige',
      '0 TRLR',
    ].join('\n');
    importGedcom(db, parseGedcom(ged)); // no profile
    const places = listPlaces(db);
    // Base importer calls findOrCreatePlace with full string → 1 flat place
    expect(places).toHaveLength(1);
    expect(places[0].name).toContain('Fässberg');
  });
});

// ──────────────────────────────────────────────
// Exporter
// ──────────────────────────────────────────────
describe('exportGedcom', () => {
  it('produces valid GEDCOM with HEAD and TRLR', () => {
    const ged = exportGedcom(db);
    expect(ged.startsWith('0 HEAD')).toBe(true);
    expect(ged.trimEnd().endsWith('0 TRLR')).toBe(true);
  });

  it('exports a person as INDI record', () => {
    const p = createPerson(db, { sex: 'M' });
    addPersonName(db, p.id, { given_name: 'Lars', surname: 'Eriksson' });
    const ged = exportGedcom(db);
    expect(ged).toContain('INDI');
    expect(ged).toContain('Lars /Eriksson/');
    expect(ged).toContain('SEX M');
  });

  it('exports a couple relationship as FAM record', () => {
    const p1 = createPerson(db, { sex: 'M' });
    const p2 = createPerson(db, { sex: 'F' });
    createRelationship(db, { type: 'couple', person1_id: p1.id, person2_id: p2.id, subtype: 'marriage' });
    const ged = exportGedcom(db);
    expect(ged).toContain('FAM');
    expect(ged).toContain('HUSB');
    expect(ged).toContain('WIFE');
  });

  it('roundtrips import → export → import', () => {
    const original = [
      '0 HEAD\n1 GEDC\n2 VERS 5.5.1',
      '0 @I1@ INDI\n1 NAME Erik /Larsson/\n1 SEX M\n1 BIRT\n2 DATE 1 JAN 1850',
      '0 @I2@ INDI\n1 NAME Anna /Persdotter/\n1 SEX F',
      '0 @F1@ FAM\n1 HUSB @I1@\n1 WIFE @I2@',
      '0 TRLR',
    ].join('\n');

    importGedcom(db, parseGedcom(original));
    const exported = exportGedcom(db);

    // Re-import into a second DB
    const db2 = createTestDb();
    importGedcom(db2, parseGedcom(exported));
    const persons2 = listPersons(db2);
    expect(persons2).toHaveLength(2);
    const rels2 = listRelationships(db2);
    expect(rels2.some(r => r.type === 'couple')).toBe(true);
  });
});

// ──────────────────────────────────────────────
// Extended GEDCOM Roundtrip (v0.6.4)
// ──────────────────────────────────────────────

/** Export db → parse → import into a fresh db2. Returns db2. */
function roundtrip(sourceDb: ReturnType<typeof createTestDb>): ReturnType<typeof createTestDb> {
  const db2 = createTestDb();
  importGedcom(db2, parseGedcom(exportGedcom(sourceDb)));
  return db2;
}

describe('Extended GEDCOM roundtrip — persons', () => {
  it('_LIVING Y is emitted only for living persons', () => {
    const p = createPerson(db, { sex: 'M', living: false });
    addPersonName(db, p.id, { given_name: 'Lars' });
    const ged = exportGedcom(db);
    expect(ged).not.toContain('_LIVING');
  });

  it('_LIVING Y round-trips', () => {
    // createPerson stores living=1 by default; we need to force it off first
    // then create a living person explicitly
    const p = createPerson(db, { sex: 'F' });
    addPersonName(db, p.id, { given_name: 'Anna' });
    // Verify _LIVING Y appears for the default-living person
    const ged = exportGedcom(db);
    expect(ged).toContain('_LIVING Y');
    // Re-import: person should still be living
    const db2 = roundtrip(db);
    const persons2 = listPersons(db2);
    expect(persons2[0].living).toBeTruthy();
  });

  it('preferred_name survives roundtrip via NICK', () => {
    const p = createPerson(db, { sex: 'F' });
    addPersonName(db, p.id, { given_name: 'Anna Maria', surname: 'Eriksson', preferred_name: 'Maria' });
    const db2 = roundtrip(db);
    const persons2 = listPersons(db2);
    const names2 = getPersonNames(db2, persons2[0].id);
    expect(names2[0].preferred_name).toBe('Maria');
  });

  it('patronymic_base survives roundtrip via _PATR', () => {
    const p = createPerson(db, { sex: 'M' });
    addPersonName(db, p.id, { given_name: 'Lars', surname: 'Eriksson', patronymic_base: 'Erik' });
    const db2 = roundtrip(db);
    const persons2 = listPersons(db2);
    const names2 = getPersonNames(db2, persons2[0].id);
    expect(names2[0].patronymic_base).toBe('Erik');
  });

  it('name date_from and date_to survive roundtrip via _DATE_FROM/_DATE_TO', () => {
    const p = createPerson(db, { sex: 'F' });
    addPersonName(db, p.id, { given_name: 'Anna', surname: 'Eriksson', date_from: '1850', date_to: '1875', name_type: 'married' });
    const db2 = roundtrip(db);
    const persons2 = listPersons(db2);
    const names2 = getPersonNames(db2, persons2[0].id);
    const married = names2.find(n => n.name_type === 'married');
    expect(married?.date_from).toBe('1850');
    expect(married?.date_to).toBe('1875');
  });

  it('name_qualifier survives roundtrip via _NQUAL', () => {
    const p = createPerson(db, { sex: 'M' });
    addPersonName(db, p.id, { given_name: 'Lars', name_qualifier: 'patronymic' });
    const ged = exportGedcom(db);
    expect(ged).toContain('_NQUAL patronymic');
    const db2 = roundtrip(db);
    const persons2 = listPersons(db2);
    const names2 = getPersonNames(db2, persons2[0].id);
    expect(names2[0].name_qualifier).toBe('patronymic');
  });

  it('familysearch identifier survives roundtrip via _FSI', () => {
    const p = createPerson(db, { sex: 'M' });
    addPersonName(db, p.id, { given_name: 'Erik' });
    addPersonIdentifier(db, p.id, { identifier_type: 'familysearch', identifier_value: 'L-ABC-123' });
    const db2 = roundtrip(db);
    const persons2 = listPersons(db2);
    const idents2 = getPersonIdentifiers(db2, persons2[0].id);
    expect(idents2.some(i => i.identifier_type === 'familysearch' && i.identifier_value === 'L-ABC-123')).toBe(true);
  });

  it('ancestry identifier survives roundtrip via _ANID', () => {
    const p = createPerson(db, { sex: 'F' });
    addPersonName(db, p.id, { given_name: 'Maria' });
    addPersonIdentifier(db, p.id, { identifier_type: 'ancestry', identifier_value: 'A123456789' });
    const db2 = roundtrip(db);
    const persons2 = listPersons(db2);
    const idents2 = getPersonIdentifiers(db2, persons2[0].id);
    expect(idents2.some(i => i.identifier_type === 'ancestry' && i.identifier_value === 'A123456789')).toBe(true);
  });

  it('personnummer identifier survives roundtrip via _PNUMMER', () => {
    const p = createPerson(db, { sex: 'M' });
    addPersonName(db, p.id, { given_name: 'Lars' });
    addPersonIdentifier(db, p.id, { identifier_type: 'personnummer', identifier_value: '196501011234' });
    const db2 = roundtrip(db);
    const persons2 = listPersons(db2);
    const idents2 = getPersonIdentifiers(db2, persons2[0].id);
    expect(idents2.some(i => i.identifier_type === 'personnummer' && i.identifier_value === '196501011234')).toBe(true);
  });
});

describe('Extended GEDCOM roundtrip — relationships', () => {
  it('sibling relationship survives roundtrip via ASSO', () => {
    const p1 = createPerson(db, { sex: 'M' });
    addPersonName(db, p1.id, { given_name: 'Lars' });
    const p2 = createPerson(db, { sex: 'F' });
    addPersonName(db, p2.id, { given_name: 'Anna' });
    createRelationship(db, { type: 'sibling', person1_id: p1.id, person2_id: p2.id });
    const db2 = roundtrip(db);
    const rels2 = listRelationships(db2);
    expect(rels2.some(r => r.type === 'sibling')).toBe(true);
  });

  it('sibling ASSO deduplicates within a single import (exporter writes ASSO under both persons)', () => {
    // The exporter writes ASSO under Lars *and* under Anna. On import, only ONE sibling
    // relationship must be created, not two.
    const p1 = createPerson(db, { sex: 'M' });
    addPersonName(db, p1.id, { given_name: 'Lars' });
    const p2 = createPerson(db, { sex: 'F' });
    addPersonName(db, p2.id, { given_name: 'Anna' });
    createRelationship(db, { type: 'sibling', person1_id: p1.id, person2_id: p2.id });
    const db2 = roundtrip(db);
    const sibs = listRelationships(db2).filter(r => r.type === 'sibling');
    expect(sibs).toHaveLength(1);
  });

  it('godparent relationship survives roundtrip via ASSO', () => {
    const godparent = createPerson(db, { sex: 'M' });
    addPersonName(db, godparent.id, { given_name: 'Erik' });
    const child = createPerson(db, { sex: 'F' });
    addPersonName(db, child.id, { given_name: 'Stina' });
    createRelationship(db, { type: 'godparent', person1_id: godparent.id, person2_id: child.id });
    const db2 = roundtrip(db);
    const rels2 = listRelationships(db2);
    expect(rels2.some(r => r.type === 'godparent')).toBe(true);
  });

  it('parent_child subtype adopted survives roundtrip via PEDI', () => {
    const father = createPerson(db, { sex: 'M' });
    addPersonName(db, father.id, { given_name: 'Erik' });
    const mother = createPerson(db, { sex: 'F' });
    addPersonName(db, mother.id, { given_name: 'Maria' });
    const child = createPerson(db, { sex: 'M' });
    addPersonName(db, child.id, { given_name: 'Lars' });
    createRelationship(db, { type: 'couple', person1_id: father.id, person2_id: mother.id });
    createRelationship(db, { type: 'parent_child', person1_id: father.id, person2_id: child.id, subtype: 'adopted' });
    createRelationship(db, { type: 'parent_child', person1_id: mother.id, person2_id: child.id, subtype: 'adopted' });
    const db2 = roundtrip(db);
    const pcRels = listRelationships(db2).filter(r => r.type === 'parent_child');
    expect(pcRels.length).toBeGreaterThan(0);
    expect(pcRels.every(r => r.subtype === 'adopted')).toBe(true);
  });

  it('couple _SUBTYPE survives roundtrip', () => {
    const p1 = createPerson(db, { sex: 'M' });
    const p2 = createPerson(db, { sex: 'F' });
    createRelationship(db, { type: 'couple', person1_id: p1.id, person2_id: p2.id, subtype: 'civil_union' });
    const db2 = roundtrip(db);
    const couples = listRelationships(db2).filter(r => r.type === 'couple');
    expect(couples[0].subtype).toBe('civil_union');
  });

  it('couple notes survive roundtrip via _RELNOTES', () => {
    const p1 = createPerson(db, { sex: 'M' });
    const p2 = createPerson(db, { sex: 'F' });
    createRelationship(db, { type: 'couple', person1_id: p1.id, person2_id: p2.id, notes: 'Met at sea' });
    const db2 = roundtrip(db);
    const couples = listRelationships(db2).filter(r => r.type === 'couple');
    expect(couples[0].notes).toBe('Met at sea');
  });
});

describe('Extended GEDCOM roundtrip — event participants', () => {
  it('non-primary event participant survives roundtrip via ASSO+_EVID', () => {
    const primary = createPerson(db, { sex: 'F' });
    addPersonName(db, primary.id, { given_name: 'Anna' });
    const witness = createPerson(db, { sex: 'M' });
    addPersonName(db, witness.id, { given_name: 'Lars' });
    const ev = createEvent(db, { event_type: 'christening', date_original: '1 JAN 1850' });
    addEventParticipant(db, { event_id: ev.id, person_id: primary.id, role: 'primary' });
    addEventParticipant(db, { event_id: ev.id, person_id: witness.id, role: 'witness' });

    const db2 = roundtrip(db);
    const persons2 = listPersons(db2);
    const anna2 = persons2.find(p => getPersonNames(db2, p.id).some(n => n.given_name === 'Anna'));
    expect(anna2).toBeTruthy();
    const events2 = getEventsForPerson(db2, anna2!.id);
    const chr2 = events2.find(e => e.event_type === 'christening');
    expect(chr2).toBeTruthy();
    const participants2 = getEventParticipants(db2, chr2!.id);
    expect(participants2.some(p => p.role === 'witness')).toBe(true);
    // Exactly 2 participants: primary + witness
    expect(participants2).toHaveLength(2);
  });
});

describe('Extended GEDCOM roundtrip — places', () => {
  it('place coordinates survive roundtrip via MAP/LATI/LONG', () => {
    const place = createPlace(db, { name: 'Göteborg', latitude: 57.7089, longitude: 11.9746 });
    const p = createPerson(db, { sex: 'M' });
    addPersonName(db, p.id, { given_name: 'Erik' });
    const ev = createEvent(db, { event_type: 'birth', place_id: place.id, date_original: '1850' });
    addEventParticipant(db, { event_id: ev.id, person_id: p.id, role: 'primary' });
    const db2 = roundtrip(db);
    const got = listPlaces(db2).find(pl => pl.name === 'Göteborg');
    expect(got?.latitude).toBeCloseTo(57.7089, 3);
    expect(got?.longitude).toBeCloseTo(11.9746, 3);
  });

  it('place address fields survive roundtrip via ADDR', () => {
    const place = createPlace(db, { name: 'My Home', street: 'Storgatan 1', postal_code: '41234', city: 'Göteborg', country: 'Sverige' });
    const p = createPerson(db, { sex: 'M' });
    addPersonName(db, p.id, { given_name: 'Lars' });
    const ev = createEvent(db, { event_type: 'residence', place_id: place.id, date_original: '1900' });
    addEventParticipant(db, { event_id: ev.id, person_id: p.id, role: 'primary' });
    const db2 = roundtrip(db);
    const found = listPlaces(db2).find(pl => pl.name === 'My Home');
    expect(found?.street).toBe('Storgatan 1');
    expect(found?.postal_code).toBe('41234');
    expect(found?.city).toBe('Göteborg');
    expect(found?.country).toBe('Sverige');
  });

  it('place type and notes survive roundtrip via _PTYPE/_PNOTES', () => {
    const place = createPlace(db, { name: 'Fässberg', place_type: 'parish', notes: 'Historic parish' });
    const p = createPerson(db, { sex: 'F' });
    addPersonName(db, p.id, { given_name: 'Anna' });
    const ev = createEvent(db, { event_type: 'birth', place_id: place.id, date_original: '1800' });
    addEventParticipant(db, { event_id: ev.id, person_id: p.id, role: 'primary' });
    const db2 = roundtrip(db);
    const found = listPlaces(db2).find(pl => pl.name === 'Fässberg');
    expect(found?.place_type).toBe('parish');
    expect(found?.notes).toBe('Historic parish');
  });

  it('_PLAC_ID deduplicates on same-DB reimport', () => {
    // Create a place, export, then reimport into the same DB — should reuse the existing place
    const place = createPlace(db, { name: 'Stockholm', notes: 'Capital' });
    const p = createPerson(db, { sex: 'M' });
    addPersonName(db, p.id, { given_name: 'Erik' });
    const ev = createEvent(db, { event_type: 'birth', place_id: place.id, date_original: '1850' });
    addEventParticipant(db, { event_id: ev.id, person_id: p.id, role: 'primary' });
    const ged = exportGedcom(db);
    // Reimport into a fresh DB twice: _PLAC_ID should prevent duplicate places
    const db2 = createTestDb();
    importGedcom(db2, parseGedcom(ged));
    const countAfterFirst = listPlaces(db2).length;
    importGedcom(db2, parseGedcom(ged));
    const countAfterSecond = listPlaces(db2).length;
    expect(countAfterSecond).toBe(countAfterFirst);
  });
});

describe('Extended GEDCOM roundtrip — sources & citations', () => {
  it('source url survives roundtrip via _URL', () => {
    createSource(db, { title: 'Web Source', url: 'https://example.com/records' });
    const db2 = roundtrip(db);
    expect(listSources(db2)[0].url).toBe('https://example.com/records');
  });

  it('source_type survives roundtrip via _STYPE', () => {
    createSource(db, { title: 'Church Records', source_type: 'church_record' });
    const db2 = roundtrip(db);
    expect(listSources(db2)[0].source_type).toBe('church_record');
  });

  it('source repository survives roundtrip via REPO', () => {
    createSource(db, { title: 'Census 1880', repository: 'Riksarkivet' });
    const db2 = roundtrip(db);
    expect(listSources(db2)[0].repository).toBe('Riksarkivet');
  });

  it('citation notes survive roundtrip via NOTE on SOUR block', () => {
    const p = createPerson(db, { sex: 'M' });
    addPersonName(db, p.id, { given_name: 'Erik' });
    const src = createSource(db, { title: 'Test Source' });
    const ev = createEvent(db, { event_type: 'birth', date_original: '1850' });
    addEventParticipant(db, { event_id: ev.id, person_id: p.id, role: 'primary' });
    createCitation(db, { source_id: src.id, event_id: ev.id, notes: 'Important note about this citation' });
    const db2 = roundtrip(db);
    const persons2 = listPersons(db2);
    const events2 = getEventsForPerson(db2, persons2[0].id);
    const cits2 = getCitationsForEvent(db2, events2[0].id);
    expect(cits2.some(c => c.notes === 'Important note about this citation')).toBe(true);
  });

  it('citation date_accessed survives roundtrip via _ACCESSED', () => {
    const p = createPerson(db, { sex: 'F' });
    addPersonName(db, p.id, { given_name: 'Anna' });
    const src = createSource(db, { title: 'Test Source' });
    const ev = createEvent(db, { event_type: 'death', date_original: '1900' });
    addEventParticipant(db, { event_id: ev.id, person_id: p.id, role: 'primary' });
    createCitation(db, { source_id: src.id, event_id: ev.id, date_accessed: '2024-03-15' });
    const db2 = roundtrip(db);
    const persons2 = listPersons(db2);
    const events2 = getEventsForPerson(db2, persons2[0].id);
    const cits2 = getCitationsForEvent(db2, events2[0].id);
    expect(cits2.some(c => c.date_accessed === '2024-03-15')).toBe(true);
  });

  it('person-level citation survives roundtrip', () => {
    const p = createPerson(db, { sex: 'M' });
    addPersonName(db, p.id, { given_name: 'Erik' });
    const src = createSource(db, { title: 'Test Source' });
    createCitation(db, { source_id: src.id, person_id: p.id, page: 'p. 42', confidence: 2 });
    const db2 = roundtrip(db);
    const persons2 = listPersons(db2);
    const cits2 = getCitationsForPerson(db2, persons2[0].id);
    expect(cits2).toHaveLength(1);
    expect(cits2[0].page).toBe('p. 42');
    expect(cits2[0].confidence).toBe(2);
  });

  it('family-level citation survives roundtrip', () => {
    const p1 = createPerson(db, { sex: 'M' });
    addPersonName(db, p1.id, { given_name: 'Erik' });
    const p2 = createPerson(db, { sex: 'F' });
    addPersonName(db, p2.id, { given_name: 'Maria' });
    const rel = createRelationship(db, { type: 'couple', person1_id: p1.id, person2_id: p2.id });
    const src = createSource(db, { title: 'Marriage Records' });
    createCitation(db, { source_id: src.id, relationship_id: rel.id, page: 'vol. 3 p. 10', confidence: 3 });
    const db2 = roundtrip(db);
    const rels2 = listRelationships(db2).filter(r => r.type === 'couple');
    expect(rels2).toHaveLength(1);
    const cits2 = getCitationsForRelationship(db2, rels2[0].id);
    expect(cits2).toHaveLength(1);
    expect(cits2[0].page).toBe('vol. 3 p. 10');
    expect(cits2[0].confidence).toBe(3);
  });

  it('place-level citation survives roundtrip via _PLAC top-level record', () => {
    const place = createPlace(db, { name: 'Stockholm' });
    const src = createSource(db, { title: 'City Records' });
    createCitation(db, { source_id: src.id, place_id: place.id, page: 'p. 100', notes: 'Place citation note' });
    const db2 = roundtrip(db);
    const stockholm = listPlaces(db2).find(pl => pl.name === 'Stockholm');
    expect(stockholm).toBeTruthy();
    const cits2 = getCitationsForPlace(db2, stockholm!.id);
    expect(cits2).toHaveLength(1);
    expect(cits2[0].page).toBe('p. 100');
    expect(cits2[0].notes).toBe('Place citation note');
  });

  it('place-level citation links to correct place via _PLAC_ID in placeIdMap (event-anchored place)', () => {
    // Place is referenced by an event (so it enters placeIdMap during Phase 2/3)
    // AND has a direct place-level citation (carried by the _PLAC record).
    // Verifies that the _PLAC record's citation ends up on the correct place in db2.
    const place = createPlace(db, { name: 'Göteborg' });
    const p = createPerson(db, { sex: 'M' });
    addPersonName(db, p.id, { given_name: 'Erik' });
    const ev = createEvent(db, { event_type: 'birth', place_id: place.id, date_original: '1850' });
    addEventParticipant(db, { event_id: ev.id, person_id: p.id, role: 'primary' });
    const src = createSource(db, { title: 'Harbor Records' });
    createCitation(db, { source_id: src.id, place_id: place.id, page: 'p. 7' });

    const db2 = createTestDb();
    importGedcom(db2, parseGedcom(exportGedcom(db)));

    const got2 = listPlaces(db2).find(pl => pl.name === 'Göteborg');
    expect(got2).toBeTruthy();
    const cits2 = getCitationsForPlace(db2, got2!.id);
    expect(cits2).toHaveLength(1);
    expect(cits2[0].page).toBe('p. 7');
  });
});
