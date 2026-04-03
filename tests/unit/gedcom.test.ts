import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers';
import { parseGedcom } from '../../src/gedcom/parser';
import { parseGedcomDate, formatGedcomDate } from '../../src/gedcom/date';
import { importGedcom } from '../../src/gedcom/importer';
import { exportGedcom } from '../../src/gedcom/exporter';
import { listPersons, getPersonNames, getPersonIdentifiers } from '../../src/api/persons';
import { listRelationships } from '../../src/api/relationships';
import { createPerson, addPersonName } from '../../src/api/persons';
import { createRelationship } from '../../src/api/relationships';
import { listPlaces } from '../../src/api/places';

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
    expect(rels.some(r => r.type === 'couple')).toBe(true);
    const places = listPlaces(db);
    expect(places.some(p => p.name === 'Göteborg')).toBe(true);
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
