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
import { createMedia, addMediaLink, getMediaForEntity, listMedia } from '../../src/api/media';
import { createRepository, linkSourceRepository } from '../../src/api/repositories';
import { createGroup, addGroupLink, listGroups, getGroupLinks } from '../../src/api/groups';
import { createTestDb } from './helpers';

let db: ReturnType<typeof createTestDb>;
beforeEach(async () => { db = await createTestDb(); });

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
describe('importGedcom', async () => {
  it('imports a person with name and birth event', async () => {
    const ged = `0 HEAD\n1 GEDC\n2 VERS 5.5.1\n0 @I1@ INDI\n1 NAME Lars /Eriksson/\n1 SEX M\n1 BIRT\n2 DATE 15 MAR 1842\n2 PLAC Björkvik\n0 TRLR`;
    await importGedcom(db, parseGedcom(ged));
    const persons = await listPersons(db);
    expect(persons).toHaveLength(1);
    expect(persons[0].sex).toBe('M');
    const names = await getPersonNames(db, persons[0].id);
    expect(names[0].given_name).toBe('Lars');
    expect(names[0].surname).toBe('Eriksson');
  });

  it('creates place records from PLAC tags', async () => {
    const ged = `0 @I1@ INDI\n1 BIRT\n2 DATE 1842\n2 PLAC Fässberg\n0 TRLR`;
    await importGedcom(db, parseGedcom(ged));
    const places = await listPlaces(db);
    expect(places.some(p => p.name === 'Fässberg')).toBe(true);
  });

  it('imports a FAM record as couple + parent_child relationships', async () => {
    const ged = [
      '0 HEAD',
      '0 @I1@ INDI\n1 NAME Erik /Larsson/\n1 SEX M',
      '0 @I2@ INDI\n1 NAME Anna /Karlsdotter/\n1 SEX F',
      '0 @I3@ INDI\n1 NAME Lars /Eriksson/\n1 SEX M',
      '0 @F1@ FAM\n1 HUSB @I1@\n1 WIFE @I2@\n1 CHIL @I3@',
      '0 TRLR',
    ].join('\n');
    await importGedcom(db, parseGedcom(ged));
    const rels = await listRelationships(db);
    const couple = rels.find(r => r.type === 'couple');
    const parentChild = rels.filter(r => r.type === 'parent_child');
    expect(couple).toBeTruthy();
    expect(parentChild).toHaveLength(2); // father→child, mother→child
  });

  it('imports marriage event on FAM record', async () => {
    const ged = [
      '0 @I1@ INDI\n1 NAME Erik /Larsson/\n1 SEX M',
      '0 @I2@ INDI\n1 NAME Anna /Karlsdotter/\n1 SEX F',
      '0 @F1@ FAM\n1 HUSB @I1@\n1 WIFE @I2@\n1 MARR\n2 DATE 15 JUN 1870\n2 PLAC Göteborg',
      '0 TRLR',
    ].join('\n');
    await importGedcom(db, parseGedcom(ged));
    const rels = await listRelationships(db);
    const couple = rels.find(r => r.type === 'couple');
    expect(couple).toBeTruthy();
    expect(couple?.subtype).toBe('marriage');
    const places = await listPlaces(db);
    expect(places.some(p => p.name === 'Göteborg')).toBe(true);
  });

  it('sets couple subtype to unknown when no MARR event', async () => {
    const ged = [
      '0 @I1@ INDI\n1 NAME Erik /Larsson/\n1 SEX M',
      '0 @I2@ INDI\n1 NAME Anna /Karlsdotter/\n1 SEX F',
      '0 @F1@ FAM\n1 HUSB @I1@\n1 WIFE @I2@',
      '0 TRLR',
    ].join('\n');
    await importGedcom(db, parseGedcom(ged));
    const couple = (await listRelationships(db)).find(r => r.type === 'couple');
    expect(couple?.subtype).toBe('unknown');
  });

  it('imports REFN and RIN as person identifiers', async () => {
    const ged = `0 @I1@ INDI\n1 NAME Test /Person/\n1 REFN ABC-123\n1 RIN 456\n0 TRLR`;
    await importGedcom(db, parseGedcom(ged));
    const persons = await listPersons(db);
    const identifiers = await getPersonIdentifiers(db, persons[0].id);
    expect(identifiers.some(i => i.identifier_type === 'refn' && i.identifier_value === 'ABC-123')).toBe(true);
    expect(identifiers.some(i => i.identifier_type === 'rin' && i.identifier_value === '456')).toBe(true);
  });

  it('imports name prefix and suffix', async () => {
    const ged = `0 @I1@ INDI\n1 NAME Lars /Eriksson/\n2 NPFX Dr.\n2 NSFX Jr.\n0 TRLR`;
    await importGedcom(db, parseGedcom(ged));
    const persons = await listPersons(db);
    const names = await getPersonNames(db, persons[0].id);
    expect(names[0].name_prefix).toBe('Dr.');
    expect(names[0].name_suffix).toBe('Jr.');
  });
});

// ──────────────────────────────────────────────
// Importer — Genney 4.1 profile
// ──────────────────────────────────────────────
describe('importGedcom (Genney profile)', async () => {
  it('stores _UID as a person identifier', async () => {
    const ged = [
      '0 @I1@ INDI',
      '1 NAME Erik /Larsson/',
      '1 _UID A1B2C3D4-E5F6-7890-ABCD-EF1234567890',
      '0 TRLR',
    ].join('\n');
    await importGedcom(db, parseGedcom(ged), { profile: 'genney' });
    const persons = await listPersons(db);
    const identifiers = await getPersonIdentifiers(db, persons[0].id);
    expect(identifiers.some(i => i.identifier_type === 'uid' && i.identifier_value.includes('A1B2C3D4'))).toBe(true);
  });

  it('appends _YHAPLOGROUP to person notes', async () => {
    const ged = [
      '0 @I1@ INDI',
      '1 NAME Erik /Larsson/',
      '1 _YHAPLOGROUP R1b',
      '0 TRLR',
    ].join('\n');
    await importGedcom(db, parseGedcom(ged), { profile: 'genney' });
    const persons = await listPersons(db);
    expect(persons[0].notes).toContain('Y-DNA: R1b');
  });

  it('appends _MHAPLOGROUP to person notes', async () => {
    const ged = [
      '0 @I1@ INDI',
      '1 NAME Anna /Persdotter/',
      '1 _MHAPLOGROUP H1',
      '0 TRLR',
    ].join('\n');
    await importGedcom(db, parseGedcom(ged), { profile: 'genney' });
    const persons = await listPersons(db);
    expect(persons[0].notes).toContain('mtDNA: H1');
  });

  it('appends both haplogroups when both are present', async () => {
    const ged = [
      '0 @I1@ INDI',
      '1 NAME Erik /Larsson/',
      '1 _YHAPLOGROUP R1b',
      '1 _MHAPLOGROUP H1',
      '0 TRLR',
    ].join('\n');
    await importGedcom(db, parseGedcom(ged), { profile: 'genney' });
    const persons = await listPersons(db);
    expect(persons[0].notes).toContain('Y-DNA: R1b');
    expect(persons[0].notes).toContain('mtDNA: H1');
  });

  it('detects patronymic surname and sets patronymic_base', async () => {
    const ged = [
      '0 @I1@ INDI',
      '1 NAME Lars /Eriksson/',
      '1 SEX M',
      '0 TRLR',
    ].join('\n');
    await importGedcom(db, parseGedcom(ged), { profile: 'genney' });
    const persons = await listPersons(db);
    const names = await getPersonNames(db, persons[0].id);
    expect(names[0].patronymic_base).toBe('Erik');
  });

  it('creates hierarchical place chain from Swedish PLAC string', async () => {
    const ged = [
      '0 @I1@ INDI',
      '1 NAME Lars /Eriksson/',
      '1 BIRT',
      '2 DATE 1842',
      '2 PLAC Fässberg, Mölndals landsförsamling, Göteborgs och Bohus, Sverige',
      '0 TRLR',
    ].join('\n');
    await importGedcom(db, parseGedcom(ged), { profile: 'genney' });
    const places = await listPlaces(db);
    expect(places.some(p => p.name === 'Fässberg')).toBe(true);
    expect(places.some(p => p.name === 'Sverige')).toBe(true);
    expect(places).toHaveLength(4);
    // Verify parent chain
    const innermost = places.find(p => p.name === 'Fässberg')!;
    expect(innermost.parent_place_id).not.toBeNull();
  });

  it('does not set patronymic_base without genney profile', async () => {
    const ged = [
      '0 @I1@ INDI',
      '1 NAME Lars /Eriksson/',
      '0 TRLR',
    ].join('\n');
    await importGedcom(db, parseGedcom(ged)); // no profile
    const persons = await listPersons(db);
    const names = await getPersonNames(db, persons[0].id);
    expect(names[0].patronymic_base).toBeNull();
  });

  it('extracts preferred name from Genney * notation in given name', async () => {
    const ged = [
      '0 @I1@ INDI',
      '1 NAME Eva Linda* Marie /Ahnstedt/',
      '1 SEX F',
      '0 TRLR',
    ].join('\n');
    await importGedcom(db, parseGedcom(ged), { profile: 'genney' });
    const persons = await listPersons(db);
    const names = await getPersonNames(db, persons[0].id);
    expect(names[0].given_name).toBe('Eva Linda Marie');
    expect(names[0].preferred_name).toBe('Linda');
  });

  it('extracts preferred name when * is on first token only', async () => {
    const ged = [
      '0 @I1@ INDI',
      '1 NAME Lars* Erik /Johansson/',
      '0 TRLR',
    ].join('\n');
    await importGedcom(db, parseGedcom(ged), { profile: 'genney' });
    const persons = await listPersons(db);
    const names = await getPersonNames(db, persons[0].id);
    expect(names[0].given_name).toBe('Lars Erik');
    expect(names[0].preferred_name).toBe('Lars');
  });

  it('extracts * preferred name for any profile (asterisk is universal)', async () => {
    const ged = [
      '0 @I1@ INDI',
      '1 NAME Eva Linda* Marie /Ahnstedt/',
      '0 TRLR',
    ].join('\n');
    await importGedcom(db, parseGedcom(ged)); // no profile
    const persons = await listPersons(db);
    const names = await getPersonNames(db, persons[0].id);
    expect(names[0].given_name).toBe('Eva Linda Marie');
    expect(names[0].preferred_name).toBe('Linda');
  });

  it('creates flat place without genney profile', async () => {
    const ged = [
      '0 @I1@ INDI',
      '1 BIRT',
      '2 PLAC Fässberg, Mölndals landsförsamling, Göteborgs och Bohus, Sverige',
      '0 TRLR',
    ].join('\n');
    await importGedcom(db, parseGedcom(ged)); // no profile
    const places = await listPlaces(db);
    // Base importer calls findOrCreatePlace with full string → 1 flat place
    expect(places).toHaveLength(1);
    expect(places[0].name).toContain('Fässberg');
  });
});

// ──────────────────────────────────────────────
// Exporter
// ──────────────────────────────────────────────
describe('exportGedcom', async () => {
  it('produces valid GEDCOM with HEAD and TRLR', async () => {
    const { ged } = await exportGedcom(db);
    expect(ged.startsWith('0 HEAD')).toBe(true);
    expect(ged.trimEnd().endsWith('0 TRLR')).toBe(true);
  });

  it('exports a person as INDI record', async () => {
    const p = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Lars', surname: 'Eriksson' });
    const { ged } = await exportGedcom(db);
    expect(ged).toContain('INDI');
    expect(ged).toContain('Lars /Eriksson/');
    expect(ged).toContain('SEX M');
  });

  it('exports a couple relationship as FAM record', async () => {
    const p1 = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    const p2 = await createPerson(db, { sex: 'F' }, { allowNameless: true });
    await createRelationship(db, { type: 'couple', person1_id: p1.id, person2_id: p2.id, subtype: 'marriage' });
    const { ged } = await exportGedcom(db);
    expect(ged).toContain('FAM');
    expect(ged).toContain('HUSB');
    expect(ged).toContain('WIFE');
  });

  it('roundtrips import → export → import', async () => {
    const original = [
      '0 HEAD\n1 GEDC\n2 VERS 5.5.1',
      '0 @I1@ INDI\n1 NAME Erik /Larsson/\n1 SEX M\n1 BIRT\n2 DATE 1 JAN 1850',
      '0 @I2@ INDI\n1 NAME Anna /Persdotter/\n1 SEX F',
      '0 @F1@ FAM\n1 HUSB @I1@\n1 WIFE @I2@',
      '0 TRLR',
    ].join('\n');

    await importGedcom(db, parseGedcom(original));
    const { ged: exported } = await exportGedcom(db);

    // Re-import into a second DB
    const db2 = await createTestDb();
    await importGedcom(db2, parseGedcom(exported));
    const persons2 = await listPersons(db2);
    expect(persons2).toHaveLength(2);
    const rels2 = await listRelationships(db2);
    expect(rels2.some(r => r.type === 'couple')).toBe(true);
  });
});

// ──────────────────────────────────────────────
// Extended GEDCOM Roundtrip (v0.6.4)
// ──────────────────────────────────────────────

/** Export db → parse → import into a fresh db2. Returns db2. */
async function roundtrip(sourceDb: ReturnType<typeof createTestDb>): ReturnType<typeof createTestDb> {
  const db2 = await createTestDb();
  await importGedcom(db2, parseGedcom((await exportGedcom(sourceDb)).ged));
  return db2;
}

describe('Extended GEDCOM roundtrip — persons', async () => {
  it('does not emit non-standard _LIVING tag', async () => {
    // living is now derived from birth/death events; no separate flag is exported
    const p = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Lars' });
    const { ged } = await exportGedcom(db);
    expect(ged).not.toContain('_LIVING');
  });

  it('preferred_name survives roundtrip via asterisk in NAME', async () => {
    const p = await createPerson(db, { sex: 'F' }, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Anna Maria', surname: 'Eriksson', preferred_name: 'Maria' });
    const db2 = await roundtrip(db);
    const persons2 = await listPersons(db2);
    const names2 = await getPersonNames(db2, persons2[0].id);
    expect(names2[0].preferred_name).toBe('Maria');
    // given_name stripped of asterisk
    expect(names2[0].given_name).toBe('Anna Maria');
  });

  it('nickname survives roundtrip via NICK', async () => {
    const p = await createPerson(db, { sex: 'F' }, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Anna', surname: 'Eriksson', nickname: 'Nanna' });
    const db2 = await roundtrip(db);
    const persons2 = await listPersons(db2);
    const names2 = await getPersonNames(db2, persons2[0].id);
    expect(names2[0].nickname).toBe('Nanna');
  });

  it('NICK on import maps to nickname (not preferred_name)', async () => {
    const ged = [
      '0 @I1@ INDI',
      '1 NAME Anna /Eriksson/',
      '2 NICK Nanna',
      '1 SEX F',
      '0 TRLR',
    ].join('\n');
    await importGedcom(db, parseGedcom(ged));
    const persons = await listPersons(db);
    const names = await getPersonNames(db, persons[0].id);
    expect(names[0].nickname).toBe('Nanna');
    expect(names[0].preferred_name).toBeNull();
  });

  it('patronymic_base survives roundtrip via _PATR', async () => {
    const p = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Lars', surname: 'Eriksson', patronymic_base: 'Erik' });
    const db2 = await roundtrip(db);
    const persons2 = await listPersons(db2);
    const names2 = await getPersonNames(db2, persons2[0].id);
    expect(names2[0].patronymic_base).toBe('Erik');
  });

  it('name date_from and date_to survive roundtrip via _DATE_FROM/_DATE_TO', async () => {
    const p = await createPerson(db, { sex: 'F' }, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Anna', surname: 'Eriksson', date_from: '1850', date_to: '1875', name_type: 'married' });
    const db2 = await roundtrip(db);
    const persons2 = await listPersons(db2);
    const names2 = await getPersonNames(db2, persons2[0].id);
    const married = names2.find(n => n.name_type === 'married');
    expect(married?.date_from).toBe('1850');
    expect(married?.date_to).toBe('1875');
  });

  it('name_qualifier survives roundtrip via _NQUAL', async () => {
    const p = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Lars', name_qualifier: 'patronymic' });
    const { ged } = await exportGedcom(db);
    expect(ged).toContain('_NQUAL patronymic');
    const db2 = await roundtrip(db);
    const persons2 = await listPersons(db2);
    const names2 = await getPersonNames(db2, persons2[0].id);
    expect(names2[0].name_qualifier).toBe('patronymic');
  });

  it('familysearch identifier survives roundtrip via REFN+TYPE', async () => {
    const p = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Erik' });
    await addPersonIdentifier(db, p.id, { identifier_type: 'familysearch', identifier_value: 'L-ABC-123' });
    const db2 = await roundtrip(db);
    const persons2 = await listPersons(db2);
    const idents2 = await getPersonIdentifiers(db2, persons2[0].id);
    expect(idents2.some(i => i.identifier_type === 'familysearch' && i.identifier_value === 'L-ABC-123')).toBe(true);
  });

  it('ancestry identifier survives roundtrip via REFN+TYPE', async () => {
    const p = await createPerson(db, { sex: 'F' }, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Maria' });
    await addPersonIdentifier(db, p.id, { identifier_type: 'ancestry', identifier_value: 'A123456789' });
    const db2 = await roundtrip(db);
    const persons2 = await listPersons(db2);
    const idents2 = await getPersonIdentifiers(db2, persons2[0].id);
    expect(idents2.some(i => i.identifier_type === 'ancestry' && i.identifier_value === 'A123456789')).toBe(true);
  });

  it('personnummer identifier survives roundtrip via REFN+TYPE', async () => {
    const p = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Lars' });
    await addPersonIdentifier(db, p.id, { identifier_type: 'personnummer', identifier_value: '196501011234' });
    const db2 = await roundtrip(db);
    const persons2 = await listPersons(db2);
    const idents2 = await getPersonIdentifiers(db2, persons2[0].id);
    expect(idents2.some(i => i.identifier_type === 'personnummer' && i.identifier_value === '196501011234')).toBe(true);
  });
});

describe('Extended GEDCOM roundtrip — relationships', async () => {
  it('sibling relationship survives roundtrip via ASSO', async () => {
    const p1 = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, p1.id, { given_name: 'Lars' });
    const p2 = await createPerson(db, { sex: 'F' }, { allowNameless: true });
    await addPersonName(db, p2.id, { given_name: 'Anna' });
    await createRelationship(db, { type: 'sibling', person1_id: p1.id, person2_id: p2.id });
    const db2 = await roundtrip(db);
    const rels2 = await listRelationships(db2);
    expect(rels2.some(r => r.type === 'sibling')).toBe(true);
  });

  it('sibling ASSO deduplicates within a single import (exporter writes ASSO under both persons)', async () => {
    // The exporter writes ASSO under Lars *and* under Anna. On import, only ONE sibling
    // relationship must be created, not two.
    const p1 = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, p1.id, { given_name: 'Lars' });
    const p2 = await createPerson(db, { sex: 'F' }, { allowNameless: true });
    await addPersonName(db, p2.id, { given_name: 'Anna' });
    await createRelationship(db, { type: 'sibling', person1_id: p1.id, person2_id: p2.id });
    const db2 = await roundtrip(db);
    const sibs = (await listRelationships(db2)).filter(r => r.type === 'sibling');
    expect(sibs).toHaveLength(1);
  });

  it('godparent relationship survives roundtrip via ASSO', async () => {
    const godparent = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, godparent.id, { given_name: 'Erik' });
    const child = await createPerson(db, { sex: 'F' }, { allowNameless: true });
    await addPersonName(db, child.id, { given_name: 'Stina' });
    await createRelationship(db, { type: 'godparent', person1_id: godparent.id, person2_id: child.id });
    const db2 = await roundtrip(db);
    const rels2 = await listRelationships(db2);
    expect(rels2.some(r => r.type === 'godparent')).toBe(true);
  });

  it('parent_child subtype adopted survives roundtrip via PEDI', async () => {
    const father = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, father.id, { given_name: 'Erik' });
    const mother = await createPerson(db, { sex: 'F' }, { allowNameless: true });
    await addPersonName(db, mother.id, { given_name: 'Maria' });
    const child = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, child.id, { given_name: 'Lars' });
    await createRelationship(db, { type: 'couple', person1_id: father.id, person2_id: mother.id });
    await createRelationship(db, { type: 'parent_child', person1_id: father.id, person2_id: child.id, subtype: 'adopted' });
    await createRelationship(db, { type: 'parent_child', person1_id: mother.id, person2_id: child.id, subtype: 'adopted' });
    const db2 = await roundtrip(db);
    const pcRels = (await listRelationships(db2)).filter(r => r.type === 'parent_child');
    expect(pcRels.length).toBeGreaterThan(0);
    expect(pcRels.every(r => r.subtype === 'adopted')).toBe(true);
  });

  it('couple _SUBTYPE survives roundtrip', async () => {
    const p1 = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    const p2 = await createPerson(db, { sex: 'F' }, { allowNameless: true });
    await createRelationship(db, { type: 'couple', person1_id: p1.id, person2_id: p2.id, subtype: 'civil_union' });
    const db2 = await roundtrip(db);
    const couples = (await listRelationships(db2)).filter(r => r.type === 'couple');
    expect(couples[0].subtype).toBe('civil_union');
  });

  it('couple notes survive roundtrip via _RELNOTES', async () => {
    const p1 = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    const p2 = await createPerson(db, { sex: 'F' }, { allowNameless: true });
    await createRelationship(db, { type: 'couple', person1_id: p1.id, person2_id: p2.id, notes: 'Met at sea' });
    const db2 = await roundtrip(db);
    const couples = (await listRelationships(db2)).filter(r => r.type === 'couple');
    expect(couples[0].notes).toBe('Met at sea');
  });

  it('sibling notes survive roundtrip via _RELA_NOTE on ASSO', async () => {
    const p1 = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, p1.id, { given_name: 'Lars' });
    const p2 = await createPerson(db, { sex: 'F' }, { allowNameless: true });
    await addPersonName(db, p2.id, { given_name: 'Anna' });
    await createRelationship(db, {
      type: 'sibling',
      person1_id: p1.id,
      person2_id: p2.id,
      notes: 'half-siblings, same mother',
    });
    const { ged } = await exportGedcom(db, '5.5.1');
    expect(ged).toContain('2 _RELA_NOTE half-siblings, same mother');
    const db2 = await roundtrip(db);
    const sibs = (await listRelationships(db2)).filter(r => r.type === 'sibling');
    expect(sibs).toHaveLength(1);
    expect(sibs[0].notes).toBe('half-siblings, same mother');
  });

  it('godparent notes survive roundtrip via _RELA_NOTE on ASSO', async () => {
    const godparent = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, godparent.id, { given_name: 'Erik' });
    const child = await createPerson(db, { sex: 'F' }, { allowNameless: true });
    await addPersonName(db, child.id, { given_name: 'Stina' });
    await createRelationship(db, {
      type: 'godparent',
      person1_id: godparent.id,
      person2_id: child.id,
      notes: 'godfather and lifelong friend',
    });
    const db2 = await roundtrip(db);
    const rels = (await listRelationships(db2)).filter(r => r.type === 'godparent');
    expect(rels).toHaveLength(1);
    expect(rels[0].notes).toBe('godfather and lifelong friend');
  });

  it('other-type relationship notes survive roundtrip via _RELA_NOTE on ASSO', async () => {
    const p1 = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, p1.id, { given_name: 'Sven' });
    const p2 = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, p2.id, { given_name: 'Olof' });
    await createRelationship(db, {
      type: 'other',
      person1_id: p1.id,
      person2_id: p2.id,
      notes: 'business partner; co-owned the foundry 1872-1889',
    });
    const db2 = await roundtrip(db);
    const rels = (await listRelationships(db2)).filter(r => r.type === 'other');
    expect(rels).toHaveLength(1);
    expect(rels[0].notes).toBe('business partner; co-owned the foundry 1872-1889');
  });

  it('multi-line sibling notes round-trip byte-identical via CONT continuation', async () => {
    const p1 = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, p1.id, { given_name: 'Lars' });
    const p2 = await createPerson(db, { sex: 'F' }, { allowNameless: true });
    await addPersonName(db, p2.id, { given_name: 'Anna' });
    const longNote = [
      'Half-siblings, same mother (Maria Andersdotter).',
      'Father unknown for Anna; Lars\' father is Erik Larsson.',
      'Confirmed by parish records 1843-1851.',
    ].join('\n');
    await createRelationship(db, {
      type: 'sibling',
      person1_id: p1.id,
      person2_id: p2.id,
      notes: longNote,
    });
    const { ged } = await exportGedcom(db, '5.5.1');
    expect(ged).toContain('2 _RELA_NOTE Half-siblings, same mother (Maria Andersdotter).');
    expect(ged).toContain('3 CONT Father unknown for Anna; Lars\' father is Erik Larsson.');
    expect(ged).toContain('3 CONT Confirmed by parish records 1843-1851.');
    const db2 = await roundtrip(db);
    const sibs = (await listRelationships(db2)).filter(r => r.type === 'sibling');
    expect(sibs[0].notes).toBe(longNote);
  });

  it('sibling notes survive 7.0 round-trip via _RELA_NOTE', async () => {
    const p1 = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, p1.id, { given_name: 'Lars' });
    const p2 = await createPerson(db, { sex: 'F' }, { allowNameless: true });
    await addPersonName(db, p2.id, { given_name: 'Anna' });
    await createRelationship(db, {
      type: 'sibling',
      person1_id: p1.id,
      person2_id: p2.id,
      notes: 'half-siblings\nsame mother only',
    });
    const db2 = await createTestDb();
    await importGedcom(db2, parseGedcom((await exportGedcom(db, '7.0')).ged));
    const sibs = (await listRelationships(db2)).filter(r => r.type === 'sibling');
    expect(sibs).toHaveLength(1);
    expect(sibs[0].notes).toBe('half-siblings\nsame mother only');
  });
});

describe('Extended GEDCOM roundtrip — event participants', async () => {
  it('non-primary event participant survives roundtrip via ASSO+_EVID', async () => {
    const primary = await createPerson(db, { sex: 'F' }, { allowNameless: true });
    await addPersonName(db, primary.id, { given_name: 'Anna' });
    const witness = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, witness.id, { given_name: 'Lars' });
    const ev = await createEvent(db, { event_type: 'christening', date_original: '1 JAN 1850' });
    await addEventParticipant(db, { event_id: ev.id, person_id: primary.id, role: 'primary' });
    await addEventParticipant(db, { event_id: ev.id, person_id: witness.id, role: 'witness' });

    const db2 = await roundtrip(db);
    const persons2 = await listPersons(db2);
    const anna2 = persons2.find(async p => (await getPersonNames(db2, p.id)).some(n => n.given_name === 'Anna'));
    expect(anna2).toBeTruthy();
    const events2 = await getEventsForPerson(db2, anna2!.id);
    const chr2 = events2.find(e => e.event_type === 'christening');
    expect(chr2).toBeTruthy();
    const participants2 = await getEventParticipants(db2, chr2!.id);
    expect(participants2.some(p => p.role === 'witness')).toBe(true);
    // Exactly 2 participants: primary + witness
    expect(participants2).toHaveLength(2);
  });
});

describe('Extended GEDCOM roundtrip — places', async () => {
  it('place coordinates survive roundtrip via MAP/LATI/LONG', async () => {
    const place = await createPlace(db, { name: 'Göteborg', latitude: 57.7089, longitude: 11.9746 });
    const p = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Erik' });
    const ev = await createEvent(db, { event_type: 'birth', place_id: place.id, date_original: '1850' });
    await addEventParticipant(db, { event_id: ev.id, person_id: p.id, role: 'primary' });
    const db2 = await roundtrip(db);
    const got = (await listPlaces(db2)).find(pl => pl.name === 'Göteborg');
    expect(got?.latitude).toBeCloseTo(57.7089, 3);
    expect(got?.longitude).toBeCloseTo(11.9746, 3);
  });

  it('place address fields survive roundtrip via ADDR', async () => {
    const place = await createPlace(db, { name: 'My Home', street: 'Storgatan 1', postal_code: '41234', city: 'Göteborg', country: 'Sverige' });
    const p = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Lars' });
    const ev = await createEvent(db, { event_type: 'residence', place_id: place.id, date_original: '1900' });
    await addEventParticipant(db, { event_id: ev.id, person_id: p.id, role: 'primary' });
    const db2 = await roundtrip(db);
    const found = (await listPlaces(db2)).find(pl => pl.name === 'My Home');
    expect(found?.street).toBe('Storgatan 1');
    expect(found?.postal_code).toBe('41234');
    expect(found?.city).toBe('Göteborg');
    expect(found?.country).toBe('Sverige');
  });

  it('place type and notes survive roundtrip via _PTYPE/_PNOTES', async () => {
    const place = await createPlace(db, { name: 'Fässberg', place_type: 'parish', notes: 'Historic parish' });
    const p = await createPerson(db, { sex: 'F' }, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Anna' });
    const ev = await createEvent(db, { event_type: 'birth', place_id: place.id, date_original: '1800' });
    await addEventParticipant(db, { event_id: ev.id, person_id: p.id, role: 'primary' });
    const db2 = await roundtrip(db);
    const found = (await listPlaces(db2)).find(pl => pl.name === 'Fässberg');
    expect(found?.place_type).toBe('parish');
    expect(found?.notes).toBe('Historic parish');
  });

  it('_PLAC_ID deduplicates on same-DB reimport', async () => {
    // Create a place, export, then reimport into the same DB — should reuse the existing place
    const place = await createPlace(db, { name: 'Stockholm', notes: 'Capital' });
    const p = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Erik' });
    const ev = await createEvent(db, { event_type: 'birth', place_id: place.id, date_original: '1850' });
    await addEventParticipant(db, { event_id: ev.id, person_id: p.id, role: 'primary' });
    const { ged } = await exportGedcom(db);
    // Reimport into a fresh DB twice: _PLAC_ID should prevent duplicate places
    const db2 = await createTestDb();
    await importGedcom(db2, parseGedcom(ged));
    const countAfterFirst = (await listPlaces(db2)).length;
    await importGedcom(db2, parseGedcom(ged));
    const countAfterSecond = (await listPlaces(db2)).length;
    expect(countAfterSecond).toBe(countAfterFirst);
  });
});

describe('Extended GEDCOM roundtrip — sources & citations', async () => {
  it('source url survives roundtrip via _URL', async () => {
    await createSource(db, { title: 'Web Source', url: 'https://example.com/records' });
    const db2 = await roundtrip(db);
    expect((await listSources(db2))[0].url).toBe('https://example.com/records');
  });

  it('source_type survives roundtrip via _STYPE', async () => {
    await createSource(db, { title: 'Church Records', source_type: 'church_record' });
    const db2 = await roundtrip(db);
    expect((await listSources(db2))[0].source_type).toBe('church_record');
  });

  // Curated 2026-05-06: confirm the 5 newly added source types round-trip.
  // _STYPE carries the raw enum string, so unknown-to-GEDCOM values (peerage
  // registers, probate inventories, etc.) survive lossless under both 5.5.1
  // and 7.0 — the importer trusts whatever value is in the file.
  it.each([
    'passenger_list',
    'probate_inventory',
    'genealogist',
    'peerage_register',
    'encyclopedia',
  ])('newly curated source_type "%s" round-trips losslessly', async (sourceType) => {
    await createSource(db, { title: `Test ${sourceType}`, source_type: sourceType });
    const db2 = await roundtrip(db);
    expect((await listSources(db2))[0].source_type).toBe(sourceType);
  });

  it('source repository survives roundtrip via REPO (free-text → synthesized Repository)', async () => {
    // T02: the legacy free-text `sources.repository` column was dropped.
    // The importer now synthesizes a structured Repository row from any
    // `_REPO_TEXT` (or unbracketed REPO value) on a SOUR. We seed via
    // createRepository + linkSourceRepository (the new authoring path)
    // and assert the structured Repository round-trips.
    const { createSource } = await import('../../src/api/sources');
    const { createRepository, linkSourceRepository, getRepositoriesForSource } = await import('../../src/api/repositories');
    const src = await createSource(db, { title: 'Census 1880' });
    const repo = await createRepository(db, { name: 'Riksarkivet' });
    await linkSourceRepository(db, src.id, repo.id);
    const db2 = await roundtrip(db);
    const importedSources = await listSources(db2);
    expect(importedSources).toHaveLength(1);
    const linkedRepos = await getRepositoriesForSource(db2, importedSources[0].id);
    expect(linkedRepos.map(r => r.name)).toContain('Riksarkivet');
  });

  it('source.abstract survives roundtrip via _ABSTRACT', async () => {
    await createSource(db, {
      title: 'SSA Husförhörslängder',
      abstract: 'Photographic copies of the Stockholm city archive parish records, microfilmed 1987-1992.',
    });
    const { ged } = await exportGedcom(db, '5.5.1');
    expect(ged).toContain('1 _ABSTRACT Photographic copies of the Stockholm city archive parish records, microfilmed 1987-1992.');
    const db2 = await roundtrip(db);
    expect((await listSources(db2))[0].abstract).toBe(
      'Photographic copies of the Stockholm city archive parish records, microfilmed 1987-1992.',
    );
  });

  it('source.call_number survives roundtrip via _CALL', async () => {
    await createSource(db, {
      title: 'SSA Husförhörslängder',
      call_number: 'KA-SE-SSA/0001/F-IIa-7-1843',
    });
    const { ged } = await exportGedcom(db, '5.5.1');
    expect(ged).toContain('1 _CALL KA-SE-SSA/0001/F-IIa-7-1843');
    const db2 = await roundtrip(db);
    expect((await listSources(db2))[0].call_number).toBe('KA-SE-SSA/0001/F-IIa-7-1843');
  });

  it('long source.abstract round-trips byte-identical via CONT continuation', async () => {
    // > 80 chars and across multiple lines — exercises CONT continuation
    // emission (newline-separated lines emitted as `2 CONT <line>`).
    const longAbstract = [
      'Photographic copies of the Stockholm city archive parish records, microfilmed 1987-1992 by the Genealogical Society of Utah.',
      'Quality varies by parish; some volumes have water damage.',
      'Index volumes (1750-1850) are filed under accession KA-SE-SSA/INDEX.',
    ].join('\n');
    await createSource(db, { title: 'SSA microfilm series', abstract: longAbstract });
    const { ged } = await exportGedcom(db, '5.5.1');
    // First line emitted on the _ABSTRACT line, remainder on CONT lines.
    expect(ged).toContain('1 _ABSTRACT Photographic copies of the Stockholm city archive parish records, microfilmed 1987-1992 by the Genealogical Society of Utah.');
    expect(ged).toContain('2 CONT Quality varies by parish; some volumes have water damage.');
    expect(ged).toContain('2 CONT Index volumes (1750-1850) are filed under accession KA-SE-SSA/INDEX.');
    const db2 = await roundtrip(db);
    expect((await listSources(db2))[0].abstract).toBe(longAbstract);
  });

  it('source.abstract + call_number survive 7.0 round-trip', async () => {
    await createSource(db, {
      title: 'Stadsarkivet',
      abstract: 'Multi-line abstract\nwith embedded newline.',
      call_number: 'F-IIa-7-1843',
    });
    const db2 = await createTestDb();
    await importGedcom(db2, parseGedcom((await exportGedcom(db, '7.0')).ged));
    const out = (await listSources(db2))[0];
    expect(out.abstract).toBe('Multi-line abstract\nwith embedded newline.');
    expect(out.call_number).toBe('F-IIa-7-1843');
  });

  it('citation notes survive roundtrip via NOTE on SOUR block', async () => {
    const p = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Erik' });
    const src = await createSource(db, { title: 'Test Source' });
    const ev = await createEvent(db, { event_type: 'birth', date_original: '1850' });
    await addEventParticipant(db, { event_id: ev.id, person_id: p.id, role: 'primary' });
    await createCitation(db, { source_id: src.id, event_id: ev.id, notes: 'Important note about this citation' });
    const db2 = await roundtrip(db);
    const persons2 = await listPersons(db2);
    const events2 = await getEventsForPerson(db2, persons2[0].id);
    const cits2 = await getCitationsForEvent(db2, events2[0].id);
    expect(cits2.some(c => c.notes === 'Important note about this citation')).toBe(true);
  });

  it('citation date_accessed survives roundtrip via _ACCESSED', async () => {
    const p = await createPerson(db, { sex: 'F' }, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Anna' });
    const src = await createSource(db, { title: 'Test Source' });
    const ev = await createEvent(db, { event_type: 'death', date_original: '1900' });
    await addEventParticipant(db, { event_id: ev.id, person_id: p.id, role: 'primary' });
    await createCitation(db, { source_id: src.id, event_id: ev.id, date_accessed: '2024-03-15' });
    const db2 = await roundtrip(db);
    const persons2 = await listPersons(db2);
    const events2 = await getEventsForPerson(db2, persons2[0].id);
    const cits2 = await getCitationsForEvent(db2, events2[0].id);
    expect(cits2.some(c => c.date_accessed === '2024-03-15')).toBe(true);
  });

  it('person-level citation survives roundtrip', async () => {
    const p = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Erik' });
    const src = await createSource(db, { title: 'Test Source' });
    await createCitation(db, { source_id: src.id, person_id: p.id, page: 'p. 42', confidence: 2 });
    const db2 = await roundtrip(db);
    const persons2 = await listPersons(db2);
    const cits2 = await getCitationsForPerson(db2, persons2[0].id);
    expect(cits2).toHaveLength(1);
    expect(cits2[0].page).toBe('p. 42');
    expect(cits2[0].confidence).toBe(2);
  });

  it('family-level citation survives roundtrip', async () => {
    const p1 = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, p1.id, { given_name: 'Erik' });
    const p2 = await createPerson(db, { sex: 'F' }, { allowNameless: true });
    await addPersonName(db, p2.id, { given_name: 'Maria' });
    const rel = await createRelationship(db, { type: 'couple', person1_id: p1.id, person2_id: p2.id });
    const src = await createSource(db, { title: 'Marriage Records' });
    await createCitation(db, { source_id: src.id, relationship_id: rel.id, page: 'vol. 3 p. 10', confidence: 3 });
    const db2 = await roundtrip(db);
    const rels2 = (await listRelationships(db2)).filter(r => r.type === 'couple');
    expect(rels2).toHaveLength(1);
    const cits2 = await getCitationsForRelationship(db2, rels2[0].id);
    expect(cits2).toHaveLength(1);
    expect(cits2[0].page).toBe('vol. 3 p. 10');
    expect(cits2[0].confidence).toBe(3);
  });

  it('place-level citation survives roundtrip via _PLAC top-level record', async () => {
    const place = await createPlace(db, { name: 'Stockholm' });
    const src = await createSource(db, { title: 'City Records' });
    await createCitation(db, { source_id: src.id, place_id: place.id, page: 'p. 100', notes: 'Place citation note' });
    const db2 = await roundtrip(db);
    const stockholm = (await listPlaces(db2)).find(pl => pl.name === 'Stockholm');
    expect(stockholm).toBeTruthy();
    const cits2 = await getCitationsForPlace(db2, stockholm!.id);
    expect(cits2).toHaveLength(1);
    expect(cits2[0].page).toBe('p. 100');
    expect(cits2[0].notes).toBe('Place citation note');
  });

  it('place-level citation links to correct place via _PLAC_ID in placeIdMap (event-anchored place)', async () => {
    // Place is referenced by an event (so it enters placeIdMap during Phase 2/3)
    // AND has a direct place-level citation (carried by the _PLAC record).
    // Verifies that the _PLAC record's citation ends up on the correct place in db2.
    const place = await createPlace(db, { name: 'Göteborg' });
    const p = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Erik' });
    const ev = await createEvent(db, { event_type: 'birth', place_id: place.id, date_original: '1850' });
    await addEventParticipant(db, { event_id: ev.id, person_id: p.id, role: 'primary' });
    const src = await createSource(db, { title: 'Harbor Records' });
    await createCitation(db, { source_id: src.id, place_id: place.id, page: 'p. 7' });

    const db2 = await createTestDb();
    await importGedcom(db2, parseGedcom((await exportGedcom(db)).ged));

    const got2 = (await listPlaces(db2)).find(pl => pl.name === 'Göteborg');
    expect(got2).toBeTruthy();
    const cits2 = await getCitationsForPlace(db2, got2!.id);
    expect(cits2).toHaveLength(1);
    expect(cits2[0].page).toBe('p. 7');
  });
});

// ──────────────────────────────────────────────
// GEDCOM import completeness (Task 3)
// ──────────────────────────────────────────────
describe('GEDCOM import completeness', async () => {
  it('CAUS under DEAT imported as event.cause', async () => {
    const ged = `0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME Per /Persson/
1 DEAT
2 DATE 19 MAR 1953
2 CAUS Skelettcancer
0 TRLR`;
    await importGedcom(db, parseGedcom(ged));
    const persons = await listPersons(db);
    const events = await getEventsForPerson(db, persons[0].id);
    const death = events.find(e => e.event_type === 'death');
    expect(death).toBeTruthy();
    expect(death?.cause).toBe('Skelettcancer');
  });

  it('ENGA imported as engagement event, TYPE preserved with marker for round-trip', async () => {
    const ged = `0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME Anna /Svensson/
1 ENGA
2 TYPE Sambo
2 DATE ABT 2020
0 TRLR`;
    await importGedcom(db, parseGedcom(ged));
    const persons = await listPersons(db);
    const events = await getEventsForPerson(db, persons[0].id);
    const enga = events.find(e => e.event_type === 'engagement');
    expect(enga).toBeTruthy();
    // GEDCOM TYPE sub-tag is preserved as a `TYPE: <value>` marker so the
    // exporter can recover it as a `2 TYPE` sub-tag on round-trip.
    expect(enga?.notes).toBe('TYPE: Sambo');
  });

  it('ADOP imported as adoption event', async () => {
    const ged = `0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME Lars /Andersson/
1 ADOP
2 DATE 1955
0 TRLR`;
    await importGedcom(db, parseGedcom(ged));
    const persons = await listPersons(db);
    const events = await getEventsForPerson(db, persons[0].id);
    const adop = events.find(e => e.event_type === 'adoption');
    expect(adop).toBeTruthy();
  });

  it('TITL on INDI imported as title event with line value preserved', async () => {
    const ged = `0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME Karin /Johansson/
1 TITL Sömmerska, bondmora
0 TRLR`;
    await importGedcom(db, parseGedcom(ged));
    const persons = await listPersons(db);
    const events = await getEventsForPerson(db, persons[0].id);
    // TITL is now a fact-shaped event_type 'title' so the line value
    // round-trips back as `1 TITL Sömmerska, bondmora` on export.
    const titl = events.find(e => e.event_type === 'title');
    expect(titl).toBeTruthy();
    expect(titl?.value).toBe('Sömmerska, bondmora');
    expect(titl?.notes).toBe('');
  });

  it('top-level NOTE xref resolved to content in person.notes', async () => {
    const ged = `0 HEAD
1 GEDC
2 VERS 5.5.1
0 @N1@ NOTE This is a shared note.
0 @I1@ INDI
1 NAME Erik /Lindqvist/
1 NOTE @N1@
0 TRLR`;
    await importGedcom(db, parseGedcom(ged));
    const persons = await listPersons(db);
    expect(persons[0].notes).toBe('This is a shared note.');
  });

  it('engagement event roundtrips via export (ENGA tag appears)', async () => {
    const p = await createPerson(db, { sex: 'F' }, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Maria', surname: 'Nilsson' });
    const ev = await createEvent(db, { event_type: 'engagement', date_original: 'ABT 2020' });
    await addEventParticipant(db, { event_id: ev.id, person_id: p.id, role: 'primary' });
    const { ged } = await exportGedcom(db);
    expect(ged).toContain('1 ENGA');
  });

  it('_PLAC_ADDR under PLAC is imported into events.place_address', async () => {
    const ged = `0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME Erik /Lindqvist/
1 BIRT
2 DATE 1953
2 PLAC Adolf Fredrik kyrka, Stockholm
3 _PLAC_ADDR Tvärgatan 5, 35243 Växjö, Sverige
0 TRLR`;
    await importGedcom(db, parseGedcom(ged));
    const persons = await listPersons(db);
    const events = await getEventsForPerson(db, persons[0].id);
    const birth = events.find(e => e.event_type === 'birth');
    expect(birth).toBeTruthy();
    expect(birth?.place_address).toBe('Tvärgatan 5, 35243 Växjö, Sverige');
  });

  it('_PLAC_ADDR directly under event (no PLAC) is imported into events.place_address', async () => {
    const ged = `0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME Anna /Persson/
1 BIRT
2 DATE 1900
2 _PLAC_ADDR Backgatan 12, Lund
0 TRLR`;
    await importGedcom(db, parseGedcom(ged));
    const persons = await listPersons(db);
    const events = await getEventsForPerson(db, persons[0].id);
    const birth = events.find(e => e.event_type === 'birth');
    expect(birth).toBeTruthy();
    expect(birth?.place_address).toBe('Backgatan 12, Lund');
  });

  it('events.place_address survives full export → import round-trip (5.5.1)', async () => {
    const p = await createPerson(db, { sex: 'F' }, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Märta', surname: 'Eriksson' });
    const ev = await createEvent(db, { event_type: 'birth', date_original: '1900' });
    db.run('UPDATE events SET place_address = ? WHERE id = ?', ['Tvärgatan 5, 35243 Växjö, Sverige', ev.id]);
    await addEventParticipant(db, { event_id: ev.id, person_id: p.id, role: 'primary' });
    const { ged } = await exportGedcom(db, '5.5.1');
    expect(ged).toContain('_PLAC_ADDR Tvärgatan 5, 35243 Växjö, Sverige');
    const fresh = await createTestDb();
    await importGedcom(fresh, parseGedcom(ged));
    const persons = await listPersons(fresh);
    const events = await getEventsForPerson(fresh, persons[0].id);
    const birth = events.find(e => e.event_type === 'birth');
    expect(birth?.place_address).toBe('Tvärgatan 5, 35243 Växjö, Sverige');
  });

  it('events.place_address survives full export → import round-trip (7.0)', async () => {
    const p = await createPerson(db, { sex: 'F' }, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Märta', surname: 'Eriksson' });
    const ev = await createEvent(db, { event_type: 'birth', date_original: '1900' });
    db.run('UPDATE events SET place_address = ? WHERE id = ?', ['Tvärgatan 5, 35243 Växjö, Sverige', ev.id]);
    await addEventParticipant(db, { event_id: ev.id, person_id: p.id, role: 'primary' });
    const { ged } = await exportGedcom(db, '7.0');
    expect(ged).toContain('_PLAC_ADDR Tvärgatan 5, 35243 Växjö, Sverige');
    const fresh = await createTestDb();
    await importGedcom(fresh, parseGedcom(ged));
    const persons = await listPersons(fresh);
    const events = await getEventsForPerson(fresh, persons[0].id);
    const birth = events.find(e => e.event_type === 'birth');
    expect(birth?.place_address).toBe('Tvärgatan 5, 35243 Växjö, Sverige');
  });

  it('ImportReport contains correct counts', async () => {
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
    const report = await importGedcom(db, tree);
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
describe('GEDCOM media import', async () => {
  it('imports inline OBJE on INDI and links to person', async () => {
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
    await importGedcom(db, parseGedcom(ged));
    const persons = await listPersons(db);
    expect(persons).toHaveLength(1);
    const media = await getMediaForEntity(db, 'person', persons[0].id);
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

  it('imports top-level OBJE referenced from INDI', async () => {
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
    await importGedcom(db, parseGedcom(ged));
    const persons = await listPersons(db);
    const media = await getMediaForEntity(db, 'person', persons[0].id);
    expect(media).toHaveLength(1);
    expect(media[0].file_ref).toBe('/photos/portrait.png');
    // is_missing decided by consolidateMediaFolder, not per-OBJE existsSync.
    expect(media[0].is_missing).toBe(0);
  });

  it('exports person media as inline OBJE and re-imports correctly', async () => {
    const person = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, person.id, { given_name: 'Test', surname: 'Person' });
    const media = await createMedia(db, { title: 'Photo', file_ref: '/test.jpg', format: 'JPG', is_missing: false });
    await addMediaLink(db, { media_id: media.id, entity_type: 'person', entity_id: person.id });

    const { ged } = await exportGedcom(db);
    expect(ged).toContain('1 OBJE');
    expect(ged).toContain('2 FILE /test.jpg');
    expect(ged).toContain('2 FORM JPG');

    // Re-import into a fresh DB and verify media is linked
    const db2 = await createTestDb();
    await importGedcom(db2, parseGedcom(ged));
    const persons2 = await listPersons(db2);
    expect(persons2).toHaveLength(1);
    const media2 = await getMediaForEntity(db2, 'person', persons2[0].id);
    expect(media2).toHaveLength(1);
    expect(media2[0].file_ref).toBe('/test.jpg');
  });
});

// ──────────────────────────────────────────────
// Round-trip export improvements
// ──────────────────────────────────────────────
describe('exportGedcom — round-trip improvements', async () => {
  it('exports familysearch identifier as REFN with TYPE FamilySearch', async () => {
    const p = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Erik' });
    await addPersonIdentifier(db, p.id, { identifier_type: 'familysearch', identifier_value: 'L-ABC-123' });
    const { ged } = await exportGedcom(db);
    expect(ged).toContain('1 REFN L-ABC-123');
    expect(ged).toContain('2 TYPE FamilySearch');
  });

  it('exports ancestry identifier as REFN with TYPE Ancestry', async () => {
    const p = await createPerson(db, { sex: 'F' }, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Maria' });
    await addPersonIdentifier(db, p.id, { identifier_type: 'ancestry', identifier_value: 'A123456789' });
    const { ged } = await exportGedcom(db);
    expect(ged).toContain('1 REFN A123456789');
    expect(ged).toContain('2 TYPE Ancestry');
  });

  it('exports riksarkivet identifier as REFN with TYPE Riksarkivet', async () => {
    const p = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Lars' });
    await addPersonIdentifier(db, p.id, { identifier_type: 'riksarkivet', identifier_value: 'RA-987' });
    const { ged } = await exportGedcom(db);
    expect(ged).toContain('1 REFN RA-987');
    expect(ged).toContain('2 TYPE Riksarkivet');
  });

  it('exports personnummer identifier as REFN with TYPE Personnummer', async () => {
    const p = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Lars' });
    await addPersonIdentifier(db, p.id, { identifier_type: 'personnummer', identifier_value: '196501011234' });
    const { ged } = await exportGedcom(db);
    expect(ged).toContain('1 REFN 196501011234');
    expect(ged).toContain('2 TYPE Personnummer');
  });

  it('exports plain refn identifier without TYPE sub-tag', async () => {
    const p = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Lars' });
    await addPersonIdentifier(db, p.id, { identifier_type: 'refn', identifier_value: 'CUSTOM-001' });
    const { ged } = await exportGedcom(db);
    // REFN should appear without a TYPE FamilySearch/etc immediately after
    expect(ged).toContain('1 REFN CUSTOM-001');
    expect(ged).not.toContain('2 TYPE FamilySearch');
  });

  it('exports place coordinates as MAP/LATI/LONG on event PLAC', async () => {
    const place = await createPlace(db, { name: 'Stockholm', latitude: 59.334591, longitude: 18.063240 });
    const p = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Lars' });
    const ev = await createEvent(db, { event_type: 'birth', place_id: place.id });
    await addEventParticipant(db, { event_id: ev.id, person_id: p.id, role: 'primary' });
    const { ged } = await exportGedcom(db);
    expect(ged).toContain('2 PLAC Stockholm');
    expect(ged).toContain('3 MAP');
    expect(ged).toContain('4 LATI N59.33459');
    expect(ged).toContain('4 LONG E18.06324');
  });

  it('exports place with negative coords using S/W prefixes', async () => {
    const place = await createPlace(db, { name: 'Cape Town', latitude: -33.9249, longitude: 18.4241 });
    const p = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Lars' });
    const ev = await createEvent(db, { event_type: 'birth', place_id: place.id });
    await addEventParticipant(db, { event_id: ev.id, person_id: p.id, role: 'primary' });
    const { ged } = await exportGedcom(db);
    expect(ged).toContain('4 LATI S33.92490');
    expect(ged).toContain('4 LONG E18.42410');
  });

  it('exports citation transcription as DATA.TEXT', async () => {
    const src = await createSource(db, { title: 'Parish record' });
    const p = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Lars' });
    const ev = await createEvent(db, { event_type: 'birth' });
    await addEventParticipant(db, { event_id: ev.id, person_id: p.id, role: 'primary' });
    await createCitation(db, { source_id: src.id, event_id: ev.id, transcription: 'Born on the farm.' });
    const { ged } = await exportGedcom(db);
    expect(ged).toContain('3 DATA');
    expect(ged).toContain('4 TEXT Born on the farm.');
  });

  // ── _TRANS round-trip: person/relationship/place transcriptions under v7.0 ──
  // The user goal: a parish-record transcription pasted on any citation host
  // (event, name, person, relationship, place) survives export and re-import.
  // Event/name already round-trip via DATA/TEXT under both 5.5.1 and 7.0; the
  // remaining three host kinds are carried by custom 2 _TRANS sub-tag under
  // SOUR — v7.0 only. The Swedish parish-record example from the plan:
  //   "Petrus Andersson, hustru Cathrina Mårtensdotter, dotter Maria,
  //    döpt i Adolf Fredrik 1786-04-12, faddrar…"
  const PARISH = 'Petrus Andersson, hustru Cathrina Mårtensdotter, dotter Maria, döpt i Adolf Fredrik 1786-04-12, faddrar…';

  it('round-trips person-level citation transcription under v7.0 via _TRANS', async () => {
    const src = await createSource(db, { title: 'Adolf Fredrik C:1' });
    const p = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Petrus', surname: 'Andersson' });
    await createCitation(db, { source_id: src.id, person_id: p.id, transcription: PARISH });
    const { ged } = await exportGedcom(db, '7.0');
    expect(ged).toContain(`2 _TRANS ${PARISH}`);

    const fresh = await createTestDb();
    await importGedcom(fresh, parseGedcom(ged));
    const persons = await listPersons(fresh);
    expect(persons.length).toBe(1);
    const cits = await getCitationsForPerson(fresh, persons[0].id);
    expect(cits.length).toBe(1);
    expect(cits[0].transcription).toBe(PARISH);
  });

  it('round-trips relationship-level citation transcription under v7.0 via _TRANS', async () => {
    const src = await createSource(db, { title: 'Vigselbok' });
    const husband = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, husband.id, { given_name: 'Petrus', surname: 'Andersson' });
    const wife = await createPerson(db, { sex: 'F' }, { allowNameless: true });
    await addPersonName(db, wife.id, { given_name: 'Cathrina', surname: 'Mårtensdotter' });
    const rel = await createRelationship(db, {
      type: 'couple',
      person1_id: husband.id,
      person2_id: wife.id,
    });
    await createCitation(db, { source_id: src.id, relationship_id: rel.id, transcription: PARISH });
    const { ged } = await exportGedcom(db, '7.0');
    expect(ged).toContain(`2 _TRANS ${PARISH}`);

    const fresh = await createTestDb();
    await importGedcom(fresh, parseGedcom(ged));
    const rels = await listRelationships(fresh);
    expect(rels.length).toBe(1);
    const cits = await getCitationsForRelationship(fresh, rels[0].id);
    expect(cits.length).toBe(1);
    expect(cits[0].transcription).toBe(PARISH);
  });

  it('round-trips place-level citation transcription under v7.0 via _TRANS', async () => {
    const src = await createSource(db, { title: 'Sockenbeskrivning' });
    const place = await createPlace(db, { name: 'Adolf Fredrik' });
    // Place-level citations require the place to be reachable — events on the
    // place, or just emit standalone via the _PLAC top-level record. Anchor
    // it to a person+event so the place isn't an orphan.
    const p = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Petrus' });
    const ev = await createEvent(db, { event_type: 'birth', place_id: place.id });
    await addEventParticipant(db, { event_id: ev.id, person_id: p.id, role: 'primary' });
    await createCitation(db, { source_id: src.id, place_id: place.id, transcription: PARISH });
    const { ged } = await exportGedcom(db, '7.0');
    expect(ged).toContain(`2 _TRANS ${PARISH}`);

    const fresh = await createTestDb();
    await importGedcom(fresh, parseGedcom(ged));
    const places = await listPlaces(fresh);
    const adolf = places.find(pl => pl.name === 'Adolf Fredrik');
    expect(adolf).toBeDefined();
    const cits = await getCitationsForPlace(fresh, adolf!.id);
    expect(cits.length).toBe(1);
    expect(cits[0].transcription).toBe(PARISH);
  });

  it('does NOT emit _TRANS under v5.5.1 (custom-tag tolerance is the v551 deviation)', async () => {
    const src = await createSource(db, { title: 'Adolf Fredrik C:1' });
    const p = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Petrus' });
    await createCitation(db, { source_id: src.id, person_id: p.id, transcription: PARISH });
    const { ged } = await exportGedcom(db, '5.5.1');
    expect(ged).not.toContain('_TRANS');
    // Person-level citation under 5.5.1 also doesn't emit DATA/TEXT (that
    // path is event/name only), so transcription is intentionally dropped on
    // export — matching the registry's lossy declaration for v551.
    expect(ged).not.toContain(`4 TEXT ${PARISH}`);
  });

  it('event-level citation transcription does NOT double-emit _TRANS under v7.0 (option A)', async () => {
    const src = await createSource(db, { title: 'Parish record' });
    const p = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Lars' });
    const ev = await createEvent(db, { event_type: 'birth' });
    await addEventParticipant(db, { event_id: ev.id, person_id: p.id, role: 'primary' });
    await createCitation(db, { source_id: src.id, event_id: ev.id, transcription: 'Born on the farm.' });
    const { ged } = await exportGedcom(db, '7.0');
    // Standard DATA/TEXT path is used (event-level is already lossless on 7.0);
    // no _TRANS is emitted alongside. This keeps the file minimal and removes
    // any "which one wins on import" ambiguity.
    expect(ged).toContain('3 DATA');
    expect(ged).toContain('4 TEXT Born on the farm.');
    expect(ged).not.toContain('_TRANS');
  });

  it('round-trips multi-line person-level transcription via _TRANS+CONT under v7.0', async () => {
    const src = await createSource(db, { title: 'Adolf Fredrik C:1' });
    const p = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Petrus' });
    const multiline = 'Line 1: Petrus Andersson döpt 1786-04-12.\nLine 2: faddrar Anders Persson, Maria Eriksdotter.\nLine 3: anteckning av kyrkoherde.';
    await createCitation(db, { source_id: src.id, person_id: p.id, transcription: multiline });
    const { ged } = await exportGedcom(db, '7.0');
    expect(ged).toContain('2 _TRANS Line 1: Petrus Andersson döpt 1786-04-12.');
    expect(ged).toContain('3 CONT Line 2: faddrar Anders Persson, Maria Eriksdotter.');
    expect(ged).toContain('3 CONT Line 3: anteckning av kyrkoherde.');

    const fresh = await createTestDb();
    await importGedcom(fresh, parseGedcom(ged));
    const persons = await listPersons(fresh);
    const cits = await getCitationsForPerson(fresh, persons[0].id);
    expect(cits[0].transcription).toBe(multiline);
  });

  it('exports repository as REPO record and links from SOUR', async () => {
    const repo = await createRepository(db, { name: 'National Archives', address: '114 88 Stockholm', city: 'Stockholm', country: 'Sweden' });
    const src = await createSource(db, { title: 'Church records' });
    await linkSourceRepository(db, src.id, repo.id);
    const { ged } = await exportGedcom(db);
    // REPO record at level 0
    expect(ged).toMatch(/0 @R\d+@ REPO/);
    expect(ged).toContain('1 NAME National Archives');
    expect(ged).toContain('2 CITY Stockholm');
    // SOUR links to REPO
    expect(ged).toMatch(/1 REPO @R\d+@/);
  });

  it('repository REPO record appears before SOUR records', async () => {
    const repo = await createRepository(db, { name: 'City Library' });
    const src = await createSource(db, { title: 'Registry book' });
    await linkSourceRepository(db, src.id, repo.id);
    const { ged } = await exportGedcom(db);
    const repoPos = ged.indexOf('REPO');
    const sourPos = ged.indexOf('0 @S');
    expect(repoPos).toBeLessThan(sourPos);
  });
});

// ──────────────────────────────────────────────
// Standard GEDCOM MAP and ADDR import
// ──────────────────────────────────────────────
describe('importGedcom (standard MAP/ADDR)', async () => {
  it('imports MAP coordinates from PLAC sub-tag (no profile)', async () => {
    const ged = [
      '0 @I1@ INDI',
      '1 BIRT',
      '2 PLAC Stockholm',
      '3 MAP',
      '4 LATI N59.3300',
      '4 LONG E18.0700',
      '0 TRLR',
    ].join('\n');
    await importGedcom(db, parseGedcom(ged));
    const persons = await listPersons(db);
    expect(persons).toHaveLength(1);
    const events = await getEventsForPerson(db, persons[0].id);
    expect(events).toHaveLength(1);
    const place = await getPlace(db, events[0].place_id!);
    expect(place).not.toBeNull();
    expect(place!.latitude).toBeCloseTo(59.33, 2);
    expect(place!.longitude).toBeCloseTo(18.07, 2);
  });

  it('imports negative MAP coordinates (S/W hemispheres, no profile)', async () => {
    const ged = [
      '0 @I1@ INDI',
      '1 DEAT',
      '2 PLAC Cape Town',
      '3 MAP',
      '4 LATI S33.9249',
      '4 LONG E18.4241',
      '0 TRLR',
    ].join('\n');
    await importGedcom(db, parseGedcom(ged));
    const persons = await listPersons(db);
    const events = await getEventsForPerson(db, persons[0].id);
    const place = await getPlace(db, events[0].place_id!);
    expect(place!.latitude).toBeCloseTo(-33.9249, 3);
    expect(place!.longitude).toBeCloseTo(18.4241, 3);
  });

  it('imports ADDR on event node into associated place (no profile)', async () => {
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
    await importGedcom(db, parseGedcom(ged));
    const persons = await listPersons(db);
    const events = await getEventsForPerson(db, persons[0].id);
    expect(events).toHaveLength(1);
    const place = await getPlace(db, events[0].place_id!);
    expect(place).not.toBeNull();
    expect(place!.street).toBe('Storgatan 1');
    expect(place!.city).toBe('Göteborg');
    expect(place!.postal_code).toBe('41234');
    expect(place!.country).toBe('Sverige');
  });

  it('creates a place from event ADDR when no PLAC tag present (no profile)', async () => {
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
    await importGedcom(db, parseGedcom(ged));
    const persons = await listPersons(db);
    const events = await getEventsForPerson(db, persons[0].id);
    expect(events).toHaveLength(1);
    expect(events[0].place_id).not.toBeNull();
    const place = await getPlace(db, events[0].place_id!);
    expect(place).not.toBeNull();
    expect(place!.city).toBe('Springfield');
    expect(place!.street).toBe('Main Street 5');
    expect(place!.country).toBe('USA');
  });
});

// ──────────────────────────────────────────────
// _GROUP / _GROUP_LINK round-trip (groups + group_links)
// ──────────────────────────────────────────────
describe('groups + group_links round-trip via _GROUP / _GROUP_LINK', async () => {
  /**
   * Build a small DB matching the genealogist's example groups:
   *   - "Maternal grandfather's emigrant cousins" — 3 persons
   *   - "People I still need to verify" — 2 persons + 1 place
   *   - "Photos from the 1920 reunion" — 2 media
   * Mixed entity types per group exercise the polymorphic _GROUP_LINK xref.
   */
  async function seedGenealogistGroups() {
    const persons = [] as { id: string }[];
    for (const [given, surname] of [['Anna', 'Eriksson'], ['Bertil', 'Eriksson'], ['Carl', 'Eriksson'], ['Dora', 'Andersson'], ['Erik', 'Andersson']]) {
      const p = await createPerson(db, { sex: 'U', notes: '' }, { allowNameless: true });
      await addPersonName(db, p.id, { given_name: given, surname, name_type: 'birth', sort_order: 0 });
      persons.push(p);
    }
    const place = await createPlace(db, { name: 'Bjorkvik', notes: '' });
    const m1 = await createMedia(db, { title: 'Reunion photo 1', is_printable: false });
    const m2 = await createMedia(db, { title: 'Reunion photo 2', is_printable: false });

    const g1 = await createGroup(db, {
      name: "Maternal grandfather's emigrant cousins",
      notes: 'Three cousins who emigrated to America in the 1880s',
    });
    await addGroupLink(db, g1.id, 'person', persons[0].id);
    await addGroupLink(db, g1.id, 'person', persons[1].id);
    await addGroupLink(db, g1.id, 'person', persons[2].id);

    const g2 = await createGroup(db, {
      name: 'People I still need to verify',
      notes: 'Cited in parish records but not yet cross-checked.\nFollow up at Riksarkivet.',
    });
    await addGroupLink(db, g2.id, 'person', persons[3].id);
    await addGroupLink(db, g2.id, 'person', persons[4].id);
    await addGroupLink(db, g2.id, 'place', place.id);

    const g3 = await createGroup(db, {
      name: 'Photos from the 1920 reunion',
      notes: '',
    });
    await addGroupLink(db, g3.id, 'media', m1.id);
    await addGroupLink(db, g3.id, 'media', m2.id);

    return { persons, place, m1, m2, g1, g2, g3 };
  }

  it('exporter emits _GROUP / _GROUP_LINK records for the genealogist scenario', async () => {
    await seedGenealogistGroups();
    const { ged } = await exportGedcom(db, '5.5.1');

    // Each group is a top-level _GROUP record with NAME.
    expect(ged).toContain('0 @G1@ _GROUP');
    expect(ged).toContain("1 NAME Maternal grandfather's emigrant cousins");
    expect(ged).toContain('0 @G2@ _GROUP');
    expect(ged).toContain('1 NAME People I still need to verify');
    expect(ged).toContain('0 @G3@ _GROUP');
    expect(ged).toContain('1 NAME Photos from the 1920 reunion');

    // Multi-line notes split across CONT continuation
    expect(ged).toContain('1 NOTE Cited in parish records but not yet cross-checked.');
    expect(ged).toContain('2 CONT Follow up at Riksarkivet.');

    // _GROUP_LINK records carry TYPE and REF
    const groupLinkLines = (ged.match(/^1 _GROUP_LINK$/gm) || []).length;
    expect(groupLinkLines).toBe(8); // 3 + 3 + 2

    // Each TYPE appears the right number of times under _GROUP records.
    const typePersonLines = (ged.match(/^2 TYPE person$/gm) || []).length;
    const typePlaceLines = (ged.match(/^2 TYPE place$/gm) || []).length;
    const typeMediaLines = (ged.match(/^2 TYPE media$/gm) || []).length;
    expect(typePersonLines).toBe(5); // 3 in g1 + 2 in g2
    expect(typePlaceLines).toBe(1);
    expect(typeMediaLines).toBe(2);

    // _PLAC and OBJE top-level records exist for any place / media that's
    // group-linked — those carry the xrefs that _GROUP_LINK REFs point at.
    expect(ged).toMatch(/^0 @P\d+@ _PLAC$/m);
    expect(ged).toMatch(/^0 @M\d+@ OBJE$/m);

    // Every REF resolves: extract the REF xrefs and verify each appears as a
    // record header (`0 @<xref>@ <kind>`) earlier in the file.
    const refs = Array.from(ged.matchAll(/^2 REF (@[^@]+@)$/gm)).map(m => m[1]);
    expect(refs.length).toBe(8);
    for (const ref of refs) {
      const headerRe = new RegExp(`^0 ${ref.replace(/[.*+?^${}()|[\\]/g, '\\$&')} `, 'm');
      expect(ged, `REF ${ref} should resolve to a record header`).toMatch(headerRe);
    }
  });

  it('export report no longer flags groups as excluded', async () => {
    await seedGenealogistGroups();
    const { report } = await exportGedcom(db, '5.5.1');
    expect(report.excluded.find(e => /group/i.test(e.category))).toBeUndefined();
    const { report: report70 } = await exportGedcom(db, '7.0');
    expect(report70.excluded.find(e => /group/i.test(e.category))).toBeUndefined();
  });

  it('round-trips groups and group memberships end-to-end (5.5.1)', async () => {
    const { g1, g2, g3, persons, place, m1, m2 } = await seedGenealogistGroups();
    const beforeNames = new Set([g1.name, g2.name, g3.name]);

    const { ged } = await exportGedcom(db, '5.5.1');
    const fresh = await createTestDb();
    await importGedcom(fresh, parseGedcom(ged));

    const groupsAfter = await listGroups(fresh);
    expect(new Set(groupsAfter.map(g => g.name))).toEqual(beforeNames);
    expect(groupsAfter).toHaveLength(3);

    // Find each group by name and assert membership counts + types.
    const findGroup = (name: string) => groupsAfter.find(g => g.name === name)!;
    const cousins = findGroup("Maternal grandfather's emigrant cousins");
    const verify = findGroup('People I still need to verify');
    const photos = findGroup('Photos from the 1920 reunion');

    const cousinsLinks = await getGroupLinks(fresh, cousins.id);
    expect(cousinsLinks).toHaveLength(3);
    expect(cousinsLinks.every(l => l.entity_type === 'person')).toBe(true);

    const verifyLinks = await getGroupLinks(fresh, verify.id);
    expect(verifyLinks).toHaveLength(3);
    expect(verifyLinks.filter(l => l.entity_type === 'person')).toHaveLength(2);
    expect(verifyLinks.filter(l => l.entity_type === 'place')).toHaveLength(1);

    const photosLinks = await getGroupLinks(fresh, photos.id);
    expect(photosLinks).toHaveLength(2);
    expect(photosLinks.every(l => l.entity_type === 'media')).toBe(true);

    // Notes survive (multi-line)
    expect(verify.notes).toContain('Follow up at Riksarkivet');

    // Sanity: persons / place / media re-exist in the fresh DB so the
    // group_links FK is satisfied and a UI listing wouldn't show orphans.
    expect(await listPersons(fresh)).toHaveLength(persons.length);
    expect((await listPlaces(fresh)).find(p => p.name === place.name)).toBeTruthy();
    const freshMedia = await listMedia(fresh);
    // m1 / m2 are referenced — a single OBJE record per media survives.
    expect(freshMedia.find(m => m.title === m1.title)).toBeTruthy();
    expect(freshMedia.find(m => m.title === m2.title)).toBeTruthy();
  });

  it('round-trips groups end-to-end (7.0)', async () => {
    await seedGenealogistGroups();
    const { ged } = await exportGedcom(db, '7.0');
    const fresh = await createTestDb();
    await importGedcom(fresh, parseGedcom(ged));
    const groupsAfter = await listGroups(fresh);
    expect(groupsAfter).toHaveLength(3);
    const linkCounts = await Promise.all(
      groupsAfter.map(async g => (await getGroupLinks(fresh, g.id)).length),
    );
    const totalLinks = linkCounts.reduce((a, b) => a + b, 0);
    expect(totalLinks).toBe(8);
  });

  it('importer surfaces a warning when a _GROUP_LINK REF is dangling', async () => {
    // Hand-crafted GEDCOM with a person link to a non-existent xref
    const ged = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 5.5.1',
      '1 CHAR UTF-8',
      '0 @I1@ INDI',
      '1 NAME Real /Person/',
      '1 SEX M',
      '0 @G1@ _GROUP',
      '1 NAME Has a dangling member',
      '1 _GROUP_LINK',
      '2 TYPE person',
      '2 REF @I1@',
      '1 _GROUP_LINK',
      '2 TYPE person',
      '2 REF @I999@',
      '0 TRLR',
    ].join('\n');
    const fresh = await createTestDb();
    const report = await importGedcom(fresh, parseGedcom(ged));
    const groupsAfter = await listGroups(fresh);
    expect(groupsAfter).toHaveLength(1);
    const links = await getGroupLinks(fresh, groupsAfter[0].id);
    expect(links).toHaveLength(1); // only @I1@ resolved
    expect(report.warnings.some(w => /_GROUP_LINK/.test(w) && /@I999@/.test(w))).toBe(true);
  });
});
