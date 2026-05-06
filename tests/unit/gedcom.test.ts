import { describe, it, expect, beforeEach } from 'vitest';
import { parseGedcom } from '../../src/gedcom/parser';
import { parseGedcomDate, formatGedcomDate } from '../../src/gedcom/date';
import { importGedcom } from '../../src/import/gedcom';
import { exportGedcom } from '../../src/gedcom/exporter';
import { listPersons, getPersonNames, getPersonIdentifiers, createPerson, addPersonName, addPersonIdentifier } from '../../src/api/persons';
import { listRelationships, createRelationship, addEventParticipant, getEventParticipants } from '../../src/api/relationships';
import { createEvent } from '../../src/api/events';
import { getEventsForPerson } from '../../src/api/events';
import { createSource, listSources, createCitation, getCitationsForPerson, getCitationsForRelationship, getCitationsForPlace, getCitationsForEvent } from '../../src/api/sources';
import { createPlace, listPlaces, getPlace } from '../../src/api/places';
import { createMedia, addMediaLink, getMediaForEntity } from '../../src/api/media';
import { createRepository, linkSourceRepository } from '../../src/api/repositories';
import { createTestDb } from './helpers';

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

  it('extracts * preferred name for any profile (asterisk is universal)', () => {
    const ged = [
      '0 @I1@ INDI',
      '1 NAME Eva Linda* Marie /Ahnstedt/',
      '0 TRLR',
    ].join('\n');
    importGedcom(db, parseGedcom(ged)); // no profile
    const persons = listPersons(db);
    const names = getPersonNames(db, persons[0].id);
    expect(names[0].given_name).toBe('Eva Linda Marie');
    expect(names[0].preferred_name).toBe('Linda');
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
    const { ged } = exportGedcom(db);
    expect(ged.startsWith('0 HEAD')).toBe(true);
    expect(ged.trimEnd().endsWith('0 TRLR')).toBe(true);
  });

  it('exports a person as INDI record', () => {
    const p = createPerson(db, { sex: 'M' }, { allowNameless: true });
    addPersonName(db, p.id, { given_name: 'Lars', surname: 'Eriksson' });
    const { ged } = exportGedcom(db);
    expect(ged).toContain('INDI');
    expect(ged).toContain('Lars /Eriksson/');
    expect(ged).toContain('SEX M');
  });

  it('exports a couple relationship as FAM record', () => {
    const p1 = createPerson(db, { sex: 'M' }, { allowNameless: true });
    const p2 = createPerson(db, { sex: 'F' }, { allowNameless: true });
    createRelationship(db, { type: 'couple', person1_id: p1.id, person2_id: p2.id, subtype: 'marriage' });
    const { ged } = exportGedcom(db);
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
    const { ged: exported } = exportGedcom(db);

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
  importGedcom(db2, parseGedcom(exportGedcom(sourceDb).ged));
  return db2;
}

describe('Extended GEDCOM roundtrip — persons', () => {
  it('does not emit non-standard _LIVING tag', () => {
    // living is now derived from birth/death events; no separate flag is exported
    const p = createPerson(db, { sex: 'M' }, { allowNameless: true });
    addPersonName(db, p.id, { given_name: 'Lars' });
    const { ged } = exportGedcom(db);
    expect(ged).not.toContain('_LIVING');
  });

  it('preferred_name survives roundtrip via asterisk in NAME', () => {
    const p = createPerson(db, { sex: 'F' }, { allowNameless: true });
    addPersonName(db, p.id, { given_name: 'Anna Maria', surname: 'Eriksson', preferred_name: 'Maria' });
    const db2 = roundtrip(db);
    const persons2 = listPersons(db2);
    const names2 = getPersonNames(db2, persons2[0].id);
    expect(names2[0].preferred_name).toBe('Maria');
    // given_name stripped of asterisk
    expect(names2[0].given_name).toBe('Anna Maria');
  });

  it('nickname survives roundtrip via NICK', () => {
    const p = createPerson(db, { sex: 'F' }, { allowNameless: true });
    addPersonName(db, p.id, { given_name: 'Anna', surname: 'Eriksson', nickname: 'Nanna' });
    const db2 = roundtrip(db);
    const persons2 = listPersons(db2);
    const names2 = getPersonNames(db2, persons2[0].id);
    expect(names2[0].nickname).toBe('Nanna');
  });

  it('NICK on import maps to nickname (not preferred_name)', () => {
    const ged = [
      '0 @I1@ INDI',
      '1 NAME Anna /Eriksson/',
      '2 NICK Nanna',
      '1 SEX F',
      '0 TRLR',
    ].join('\n');
    importGedcom(db, parseGedcom(ged));
    const persons = listPersons(db);
    const names = getPersonNames(db, persons[0].id);
    expect(names[0].nickname).toBe('Nanna');
    expect(names[0].preferred_name).toBeNull();
  });

  it('patronymic_base survives roundtrip via _PATR', () => {
    const p = createPerson(db, { sex: 'M' }, { allowNameless: true });
    addPersonName(db, p.id, { given_name: 'Lars', surname: 'Eriksson', patronymic_base: 'Erik' });
    const db2 = roundtrip(db);
    const persons2 = listPersons(db2);
    const names2 = getPersonNames(db2, persons2[0].id);
    expect(names2[0].patronymic_base).toBe('Erik');
  });

  it('name date_from and date_to survive roundtrip via _DATE_FROM/_DATE_TO', () => {
    const p = createPerson(db, { sex: 'F' }, { allowNameless: true });
    addPersonName(db, p.id, { given_name: 'Anna', surname: 'Eriksson', date_from: '1850', date_to: '1875', name_type: 'married' });
    const db2 = roundtrip(db);
    const persons2 = listPersons(db2);
    const names2 = getPersonNames(db2, persons2[0].id);
    const married = names2.find(n => n.name_type === 'married');
    expect(married?.date_from).toBe('1850');
    expect(married?.date_to).toBe('1875');
  });

  it('name_qualifier survives roundtrip via _NQUAL', () => {
    const p = createPerson(db, { sex: 'M' }, { allowNameless: true });
    addPersonName(db, p.id, { given_name: 'Lars', name_qualifier: 'patronymic' });
    const { ged } = exportGedcom(db);
    expect(ged).toContain('_NQUAL patronymic');
    const db2 = roundtrip(db);
    const persons2 = listPersons(db2);
    const names2 = getPersonNames(db2, persons2[0].id);
    expect(names2[0].name_qualifier).toBe('patronymic');
  });

  it('familysearch identifier survives roundtrip via REFN+TYPE', () => {
    const p = createPerson(db, { sex: 'M' }, { allowNameless: true });
    addPersonName(db, p.id, { given_name: 'Erik' });
    addPersonIdentifier(db, p.id, { identifier_type: 'familysearch', identifier_value: 'L-ABC-123' });
    const db2 = roundtrip(db);
    const persons2 = listPersons(db2);
    const idents2 = getPersonIdentifiers(db2, persons2[0].id);
    expect(idents2.some(i => i.identifier_type === 'familysearch' && i.identifier_value === 'L-ABC-123')).toBe(true);
  });

  it('ancestry identifier survives roundtrip via REFN+TYPE', () => {
    const p = createPerson(db, { sex: 'F' }, { allowNameless: true });
    addPersonName(db, p.id, { given_name: 'Maria' });
    addPersonIdentifier(db, p.id, { identifier_type: 'ancestry', identifier_value: 'A123456789' });
    const db2 = roundtrip(db);
    const persons2 = listPersons(db2);
    const idents2 = getPersonIdentifiers(db2, persons2[0].id);
    expect(idents2.some(i => i.identifier_type === 'ancestry' && i.identifier_value === 'A123456789')).toBe(true);
  });

  it('personnummer identifier survives roundtrip via REFN+TYPE', () => {
    const p = createPerson(db, { sex: 'M' }, { allowNameless: true });
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
    const p1 = createPerson(db, { sex: 'M' }, { allowNameless: true });
    addPersonName(db, p1.id, { given_name: 'Lars' });
    const p2 = createPerson(db, { sex: 'F' }, { allowNameless: true });
    addPersonName(db, p2.id, { given_name: 'Anna' });
    createRelationship(db, { type: 'sibling', person1_id: p1.id, person2_id: p2.id });
    const db2 = roundtrip(db);
    const rels2 = listRelationships(db2);
    expect(rels2.some(r => r.type === 'sibling')).toBe(true);
  });

  it('sibling ASSO deduplicates within a single import (exporter writes ASSO under both persons)', () => {
    // The exporter writes ASSO under Lars *and* under Anna. On import, only ONE sibling
    // relationship must be created, not two.
    const p1 = createPerson(db, { sex: 'M' }, { allowNameless: true });
    addPersonName(db, p1.id, { given_name: 'Lars' });
    const p2 = createPerson(db, { sex: 'F' }, { allowNameless: true });
    addPersonName(db, p2.id, { given_name: 'Anna' });
    createRelationship(db, { type: 'sibling', person1_id: p1.id, person2_id: p2.id });
    const db2 = roundtrip(db);
    const sibs = listRelationships(db2).filter(r => r.type === 'sibling');
    expect(sibs).toHaveLength(1);
  });

  it('godparent relationship survives roundtrip via ASSO', () => {
    const godparent = createPerson(db, { sex: 'M' }, { allowNameless: true });
    addPersonName(db, godparent.id, { given_name: 'Erik' });
    const child = createPerson(db, { sex: 'F' }, { allowNameless: true });
    addPersonName(db, child.id, { given_name: 'Stina' });
    createRelationship(db, { type: 'godparent', person1_id: godparent.id, person2_id: child.id });
    const db2 = roundtrip(db);
    const rels2 = listRelationships(db2);
    expect(rels2.some(r => r.type === 'godparent')).toBe(true);
  });

  it('parent_child subtype adopted survives roundtrip via PEDI', () => {
    const father = createPerson(db, { sex: 'M' }, { allowNameless: true });
    addPersonName(db, father.id, { given_name: 'Erik' });
    const mother = createPerson(db, { sex: 'F' }, { allowNameless: true });
    addPersonName(db, mother.id, { given_name: 'Maria' });
    const child = createPerson(db, { sex: 'M' }, { allowNameless: true });
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
    const p1 = createPerson(db, { sex: 'M' }, { allowNameless: true });
    const p2 = createPerson(db, { sex: 'F' }, { allowNameless: true });
    createRelationship(db, { type: 'couple', person1_id: p1.id, person2_id: p2.id, subtype: 'civil_union' });
    const db2 = roundtrip(db);
    const couples = listRelationships(db2).filter(r => r.type === 'couple');
    expect(couples[0].subtype).toBe('civil_union');
  });

  it('couple notes survive roundtrip via _RELNOTES', () => {
    const p1 = createPerson(db, { sex: 'M' }, { allowNameless: true });
    const p2 = createPerson(db, { sex: 'F' }, { allowNameless: true });
    createRelationship(db, { type: 'couple', person1_id: p1.id, person2_id: p2.id, notes: 'Met at sea' });
    const db2 = roundtrip(db);
    const couples = listRelationships(db2).filter(r => r.type === 'couple');
    expect(couples[0].notes).toBe('Met at sea');
  });
});

describe('Extended GEDCOM roundtrip — event participants', () => {
  it('non-primary event participant survives roundtrip via ASSO+_EVID', () => {
    const primary = createPerson(db, { sex: 'F' }, { allowNameless: true });
    addPersonName(db, primary.id, { given_name: 'Anna' });
    const witness = createPerson(db, { sex: 'M' }, { allowNameless: true });
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
    const p = createPerson(db, { sex: 'M' }, { allowNameless: true });
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
    const p = createPerson(db, { sex: 'M' }, { allowNameless: true });
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
    const p = createPerson(db, { sex: 'F' }, { allowNameless: true });
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
    const p = createPerson(db, { sex: 'M' }, { allowNameless: true });
    addPersonName(db, p.id, { given_name: 'Erik' });
    const ev = createEvent(db, { event_type: 'birth', place_id: place.id, date_original: '1850' });
    addEventParticipant(db, { event_id: ev.id, person_id: p.id, role: 'primary' });
    const { ged } = exportGedcom(db);
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
    const p = createPerson(db, { sex: 'M' }, { allowNameless: true });
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
    const p = createPerson(db, { sex: 'F' }, { allowNameless: true });
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
    const p = createPerson(db, { sex: 'M' }, { allowNameless: true });
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
    const p1 = createPerson(db, { sex: 'M' }, { allowNameless: true });
    addPersonName(db, p1.id, { given_name: 'Erik' });
    const p2 = createPerson(db, { sex: 'F' }, { allowNameless: true });
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
    const p = createPerson(db, { sex: 'M' }, { allowNameless: true });
    addPersonName(db, p.id, { given_name: 'Erik' });
    const ev = createEvent(db, { event_type: 'birth', place_id: place.id, date_original: '1850' });
    addEventParticipant(db, { event_id: ev.id, person_id: p.id, role: 'primary' });
    const src = createSource(db, { title: 'Harbor Records' });
    createCitation(db, { source_id: src.id, place_id: place.id, page: 'p. 7' });

    const db2 = createTestDb();
    importGedcom(db2, parseGedcom(exportGedcom(db).ged));

    const got2 = listPlaces(db2).find(pl => pl.name === 'Göteborg');
    expect(got2).toBeTruthy();
    const cits2 = getCitationsForPlace(db2, got2!.id);
    expect(cits2).toHaveLength(1);
    expect(cits2[0].page).toBe('p. 7');
  });
});

// ──────────────────────────────────────────────
// GEDCOM import completeness (Task 3)
// ──────────────────────────────────────────────
describe('GEDCOM import completeness', () => {
  it('CAUS under DEAT imported as event.cause', () => {
    const ged = `0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME Per /Persson/
1 DEAT
2 DATE 19 MAR 1953
2 CAUS Skelettcancer
0 TRLR`;
    importGedcom(db, parseGedcom(ged));
    const persons = listPersons(db);
    const events = getEventsForPerson(db, persons[0].id);
    const death = events.find(e => e.event_type === 'death');
    expect(death).toBeTruthy();
    expect(death?.cause).toBe('Skelettcancer');
  });

  it('ENGA imported as engagement event, TYPE preserved with marker for round-trip', () => {
    const ged = `0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME Anna /Svensson/
1 ENGA
2 TYPE Sambo
2 DATE ABT 2020
0 TRLR`;
    importGedcom(db, parseGedcom(ged));
    const persons = listPersons(db);
    const events = getEventsForPerson(db, persons[0].id);
    const enga = events.find(e => e.event_type === 'engagement');
    expect(enga).toBeTruthy();
    // GEDCOM TYPE sub-tag is preserved as a `TYPE: <value>` marker so the
    // exporter can recover it as a `2 TYPE` sub-tag on round-trip.
    expect(enga?.notes).toBe('TYPE: Sambo');
  });

  it('ADOP imported as adoption event', () => {
    const ged = `0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME Lars /Andersson/
1 ADOP
2 DATE 1955
0 TRLR`;
    importGedcom(db, parseGedcom(ged));
    const persons = listPersons(db);
    const events = getEventsForPerson(db, persons[0].id);
    const adop = events.find(e => e.event_type === 'adoption');
    expect(adop).toBeTruthy();
  });

  it('TITL on INDI imported as title event with line value preserved', () => {
    const ged = `0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME Karin /Johansson/
1 TITL Sömmerska, bondmora
0 TRLR`;
    importGedcom(db, parseGedcom(ged));
    const persons = listPersons(db);
    const events = getEventsForPerson(db, persons[0].id);
    // TITL is now a fact-shaped event_type 'title' so the line value
    // round-trips back as `1 TITL Sömmerska, bondmora` on export.
    const titl = events.find(e => e.event_type === 'title');
    expect(titl).toBeTruthy();
    expect(titl?.value).toBe('Sömmerska, bondmora');
    expect(titl?.notes).toBe('');
  });

  it('top-level NOTE xref resolved to content in person.notes', () => {
    const ged = `0 HEAD
1 GEDC
2 VERS 5.5.1
0 @N1@ NOTE This is a shared note.
0 @I1@ INDI
1 NAME Erik /Lindqvist/
1 NOTE @N1@
0 TRLR`;
    importGedcom(db, parseGedcom(ged));
    const persons = listPersons(db);
    expect(persons[0].notes).toBe('This is a shared note.');
  });

  it('engagement event roundtrips via export (ENGA tag appears)', () => {
    const p = createPerson(db, { sex: 'F' }, { allowNameless: true });
    addPersonName(db, p.id, { given_name: 'Maria', surname: 'Nilsson' });
    const ev = createEvent(db, { event_type: 'engagement', date_original: 'ABT 2020' });
    addEventParticipant(db, { event_id: ev.id, person_id: p.id, role: 'primary' });
    const { ged } = exportGedcom(db);
    expect(ged).toContain('1 ENGA');
  });

  it('ImportReport contains correct counts', () => {
    const ged = `0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME Per /Persson/
1 BIRT
2 DATE 1900
1 DEAT
2 DATE 1970
2 CAUS Hjärtinfarkt
1 OBJE
2 FILE C:\\Photos\\per.jpg
0 @I2@ INDI
1 NAME Anna /Persson/
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARR
2 DATE 1930
0 TRLR`;
    const tree = parseGedcom(ged);
    const report = importGedcom(db, tree);
    expect(report.persons).toBe(2);
    expect(report.families).toBe(1);
    expect(report.events['birth']).toBe(1);
    expect(report.events['death']).toBe(1);
    expect(report.events['marriage']).toBe(1);
  });
});

// ──────────────────────────────────────────────
// GEDCOM media import/export
// ──────────────────────────────────────────────
describe('GEDCOM media import', () => {
  it('imports inline OBJE on INDI and links to person', () => {
    const ged = `0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME Bengt /Persson/
1 OBJE
2 FORM JPG
2 FILE C:\\Photos\\bengt.jpg
2 TITL Portrait
2 NOTE Studio photo 1950
0 TRLR`;
    importGedcom(db, parseGedcom(ged));
    const persons = listPersons(db);
    expect(persons).toHaveLength(1);
    const media = getMediaForEntity(db, 'person', persons[0].id);
    expect(media).toHaveLength(1);
    expect(media[0].file_ref).toBe('C:\\Photos\\bengt.jpg');
    expect(media[0].format).toBe('JPG');
    expect(media[0].title).toBe('Portrait');
    // is_missing is decided by consolidateMediaFolder post-import (single
    // recursive readdir), not by per-OBJE existsSync during import. Per
    // v0.210.7. With a non-empty file_ref, importer leaves is_missing=0;
    // the on-disk reality is not the importer's concern.
    expect(media[0].is_missing).toBe(0);
  });

  it('imports top-level OBJE referenced from INDI', () => {
    const ged = `0 HEAD
1 GEDC
2 VERS 5.5.1
0 @M1@ OBJE
1 FILE /photos/portrait.png
1 FORM PNG
1 TITL Family photo
0 @I1@ INDI
1 NAME Anna /Svensson/
1 OBJE @M1@
0 TRLR`;
    importGedcom(db, parseGedcom(ged));
    const persons = listPersons(db);
    const media = getMediaForEntity(db, 'person', persons[0].id);
    expect(media).toHaveLength(1);
    expect(media[0].file_ref).toBe('/photos/portrait.png');
    // is_missing decided by consolidateMediaFolder, not per-OBJE existsSync.
    expect(media[0].is_missing).toBe(0);
  });

  it('exports person media as inline OBJE and re-imports correctly', () => {
    const person = createPerson(db, { sex: 'M' }, { allowNameless: true });
    addPersonName(db, person.id, { given_name: 'Test', surname: 'Person' });
    const media = createMedia(db, { title: 'Photo', file_ref: '/test.jpg', format: 'JPG', is_missing: false });
    addMediaLink(db, { media_id: media.id, entity_type: 'person', entity_id: person.id });

    const { ged } = exportGedcom(db);
    expect(ged).toContain('1 OBJE');
    expect(ged).toContain('2 FILE /test.jpg');
    expect(ged).toContain('2 FORM JPG');

    // Re-import into a fresh DB and verify media is linked
    const db2 = createTestDb();
    importGedcom(db2, parseGedcom(ged));
    const persons2 = listPersons(db2);
    expect(persons2).toHaveLength(1);
    const media2 = getMediaForEntity(db2, 'person', persons2[0].id);
    expect(media2).toHaveLength(1);
    expect(media2[0].file_ref).toBe('/test.jpg');
  });
});

// ──────────────────────────────────────────────
// Round-trip export improvements
// ──────────────────────────────────────────────
describe('exportGedcom — round-trip improvements', () => {
  it('exports familysearch identifier as REFN with TYPE FamilySearch', () => {
    const p = createPerson(db, { sex: 'M' }, { allowNameless: true });
    addPersonName(db, p.id, { given_name: 'Erik' });
    addPersonIdentifier(db, p.id, { identifier_type: 'familysearch', identifier_value: 'L-ABC-123' });
    const { ged } = exportGedcom(db);
    expect(ged).toContain('1 REFN L-ABC-123');
    expect(ged).toContain('2 TYPE FamilySearch');
  });

  it('exports ancestry identifier as REFN with TYPE Ancestry', () => {
    const p = createPerson(db, { sex: 'F' }, { allowNameless: true });
    addPersonName(db, p.id, { given_name: 'Maria' });
    addPersonIdentifier(db, p.id, { identifier_type: 'ancestry', identifier_value: 'A123456789' });
    const { ged } = exportGedcom(db);
    expect(ged).toContain('1 REFN A123456789');
    expect(ged).toContain('2 TYPE Ancestry');
  });

  it('exports riksarkivet identifier as REFN with TYPE Riksarkivet', () => {
    const p = createPerson(db, { sex: 'M' }, { allowNameless: true });
    addPersonName(db, p.id, { given_name: 'Lars' });
    addPersonIdentifier(db, p.id, { identifier_type: 'riksarkivet', identifier_value: 'RA-987' });
    const { ged } = exportGedcom(db);
    expect(ged).toContain('1 REFN RA-987');
    expect(ged).toContain('2 TYPE Riksarkivet');
  });

  it('exports personnummer identifier as REFN with TYPE Personnummer', () => {
    const p = createPerson(db, { sex: 'M' }, { allowNameless: true });
    addPersonName(db, p.id, { given_name: 'Lars' });
    addPersonIdentifier(db, p.id, { identifier_type: 'personnummer', identifier_value: '196501011234' });
    const { ged } = exportGedcom(db);
    expect(ged).toContain('1 REFN 196501011234');
    expect(ged).toContain('2 TYPE Personnummer');
  });

  it('exports plain refn identifier without TYPE sub-tag', () => {
    const p = createPerson(db, { sex: 'M' }, { allowNameless: true });
    addPersonName(db, p.id, { given_name: 'Lars' });
    addPersonIdentifier(db, p.id, { identifier_type: 'refn', identifier_value: 'CUSTOM-001' });
    const { ged } = exportGedcom(db);
    // REFN should appear without a TYPE FamilySearch/etc immediately after
    expect(ged).toContain('1 REFN CUSTOM-001');
    expect(ged).not.toContain('2 TYPE FamilySearch');
  });

  it('exports place coordinates as MAP/LATI/LONG on event PLAC', () => {
    const place = createPlace(db, { name: 'Stockholm', latitude: 59.334591, longitude: 18.063240 });
    const p = createPerson(db, { sex: 'M' }, { allowNameless: true });
    addPersonName(db, p.id, { given_name: 'Lars' });
    const ev = createEvent(db, { event_type: 'birth', place_id: place.id });
    addEventParticipant(db, { event_id: ev.id, person_id: p.id, role: 'primary' });
    const { ged } = exportGedcom(db);
    expect(ged).toContain('2 PLAC Stockholm');
    expect(ged).toContain('3 MAP');
    expect(ged).toContain('4 LATI N59.33459');
    expect(ged).toContain('4 LONG E18.06324');
  });

  it('exports place with negative coords using S/W prefixes', () => {
    const place = createPlace(db, { name: 'Cape Town', latitude: -33.9249, longitude: 18.4241 });
    const p = createPerson(db, { sex: 'M' }, { allowNameless: true });
    addPersonName(db, p.id, { given_name: 'Lars' });
    const ev = createEvent(db, { event_type: 'birth', place_id: place.id });
    addEventParticipant(db, { event_id: ev.id, person_id: p.id, role: 'primary' });
    const { ged } = exportGedcom(db);
    expect(ged).toContain('4 LATI S33.92490');
    expect(ged).toContain('4 LONG E18.42410');
  });

  it('exports citation transcription as DATA.TEXT', () => {
    const src = createSource(db, { title: 'Parish record' });
    const p = createPerson(db, { sex: 'M' }, { allowNameless: true });
    addPersonName(db, p.id, { given_name: 'Lars' });
    const ev = createEvent(db, { event_type: 'birth' });
    addEventParticipant(db, { event_id: ev.id, person_id: p.id, role: 'primary' });
    createCitation(db, { source_id: src.id, event_id: ev.id, transcription: 'Born on the farm.' });
    const { ged } = exportGedcom(db);
    expect(ged).toContain('3 DATA');
    expect(ged).toContain('4 TEXT Born on the farm.');
  });

  it('exports repository as REPO record and links from SOUR', () => {
    const repo = createRepository(db, { name: 'National Archives', address: '114 88 Stockholm', city: 'Stockholm', country: 'Sweden' });
    const src = createSource(db, { title: 'Church records' });
    linkSourceRepository(db, src.id, repo.id);
    const { ged } = exportGedcom(db);
    // REPO record at level 0
    expect(ged).toMatch(/0 @R\d+@ REPO/);
    expect(ged).toContain('1 NAME National Archives');
    expect(ged).toContain('2 CITY Stockholm');
    // SOUR links to REPO
    expect(ged).toMatch(/1 REPO @R\d+@/);
  });

  it('repository REPO record appears before SOUR records', () => {
    const repo = createRepository(db, { name: 'City Library' });
    const src = createSource(db, { title: 'Registry book' });
    linkSourceRepository(db, src.id, repo.id);
    const { ged } = exportGedcom(db);
    const repoPos = ged.indexOf('REPO');
    const sourPos = ged.indexOf('0 @S');
    expect(repoPos).toBeLessThan(sourPos);
  });
});

// ──────────────────────────────────────────────
// Standard GEDCOM MAP and ADDR import
// ──────────────────────────────────────────────
describe('importGedcom (standard MAP/ADDR)', () => {
  it('imports MAP coordinates from PLAC sub-tag (no profile)', () => {
    const ged = [
      '0 @I1@ INDI',
      '1 BIRT',
      '2 PLAC Stockholm',
      '3 MAP',
      '4 LATI N59.3300',
      '4 LONG E18.0700',
      '0 TRLR',
    ].join('\n');
    importGedcom(db, parseGedcom(ged));
    const persons = listPersons(db);
    expect(persons).toHaveLength(1);
    const events = getEventsForPerson(db, persons[0].id);
    expect(events).toHaveLength(1);
    const place = getPlace(db, events[0].place_id!);
    expect(place).not.toBeNull();
    expect(place!.latitude).toBeCloseTo(59.33, 2);
    expect(place!.longitude).toBeCloseTo(18.07, 2);
  });

  it('imports negative MAP coordinates (S/W hemispheres, no profile)', () => {
    const ged = [
      '0 @I1@ INDI',
      '1 DEAT',
      '2 PLAC Cape Town',
      '3 MAP',
      '4 LATI S33.9249',
      '4 LONG E18.4241',
      '0 TRLR',
    ].join('\n');
    importGedcom(db, parseGedcom(ged));
    const persons = listPersons(db);
    const events = getEventsForPerson(db, persons[0].id);
    const place = getPlace(db, events[0].place_id!);
    expect(place!.latitude).toBeCloseTo(-33.9249, 3);
    expect(place!.longitude).toBeCloseTo(18.4241, 3);
  });

  it('imports ADDR on event node into associated place (no profile)', () => {
    const ged = [
      '0 @I1@ INDI',
      '1 RESI',
      '2 DATE 1920',
      '2 PLAC Göteborg',
      '2 ADDR',
      '3 ADR1 Storgatan 1',
      '3 CITY Göteborg',
      '3 POST 41234',
      '3 CTRY Sverige',
      '0 TRLR',
    ].join('\n');
    importGedcom(db, parseGedcom(ged));
    const persons = listPersons(db);
    const events = getEventsForPerson(db, persons[0].id);
    expect(events).toHaveLength(1);
    const place = getPlace(db, events[0].place_id!);
    expect(place).not.toBeNull();
    expect(place!.street).toBe('Storgatan 1');
    expect(place!.city).toBe('Göteborg');
    expect(place!.postal_code).toBe('41234');
    expect(place!.country).toBe('Sverige');
  });

  it('creates a place from event ADDR when no PLAC tag present (no profile)', () => {
    const ged = [
      '0 @I1@ INDI',
      '1 RESI',
      '2 DATE 1900',
      '2 ADDR',
      '3 ADR1 Main Street 5',
      '3 CITY Springfield',
      '3 CTRY USA',
      '0 TRLR',
    ].join('\n');
    importGedcom(db, parseGedcom(ged));
    const persons = listPersons(db);
    const events = getEventsForPerson(db, persons[0].id);
    expect(events).toHaveLength(1);
    expect(events[0].place_id).not.toBeNull();
    const place = getPlace(db, events[0].place_id!);
    expect(place).not.toBeNull();
    expect(place!.city).toBe('Springfield');
    expect(place!.street).toBe('Main Street 5');
    expect(place!.country).toBe('USA');
  });
});
