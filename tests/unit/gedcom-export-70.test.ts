import { describe, it, expect, beforeEach } from 'vitest';
import { isStandardGedcomDate } from '../../src/gedcom/date';
import { exportGedcom } from '../../src/gedcom/exporter';
import { createPerson, addPersonIdentifier, addPersonName } from '../../src/api/persons';
import { createEvent } from '../../src/api/events';
import { addEventParticipant, createRelationship } from '../../src/api/relationships';
import { createTestDb } from './helpers';

let db: ReturnType<typeof createTestDb>;
beforeEach(async () => { db = await createTestDb(); });

describe('isStandardGedcomDate', () => {
  it('accepts exact date', () => { expect(isStandardGedcomDate('12 JUN 1845')).toBe(true); });
  it('accepts ABT prefix', () => { expect(isStandardGedcomDate('ABT 1900')).toBe(true); });
  it('accepts BEF prefix', () => { expect(isStandardGedcomDate('BEF 1900')).toBe(true); });
  it('accepts BET … AND …', () => { expect(isStandardGedcomDate('BET 1900 AND 1910')).toBe(true); });
  it('rejects free-text', () => { expect(isStandardGedcomDate('Summer 1923')).toBe(false); });
  it('rejects empty string', () => { expect(isStandardGedcomDate('')).toBe(false); });
});

describe('exportGedcom 7.0 — header', () => {
  it('emits GEDC VERS 7.0 and no CHAR tag', () => {
    const { ged: out } = await exportGedcom(db, '7.0');
    expect(out).toContain('2 VERS 7.0');
    expect(out).not.toContain('1 CHAR UTF-8');
  });
  it('5.5.1 export is unchanged', () => {
    const { ged: out } = await exportGedcom(db, '5.5.1');
    expect(out).toContain('2 VERS 5.5.1');
    expect(out).toContain('1 CHAR UTF-8');
  });
  it('default (no arg) is 5.5.1', () => {
    const { ged: out } = await exportGedcom(db);
    expect(out).toContain('2 VERS 5.5.1');
  });
});

describe('exportGedcom 7.0 — EXID identifiers', async () => {
  it('emits EXID for familysearch identifier in 7.0', async () => {
    const p = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonIdentifier(db, p.id, { identifier_type: 'familysearch', identifier_value: 'LHWY-GQT' });
    const { ged: out } = await exportGedcom(db, '7.0');
    expect(out).toContain('1 EXID LHWY-GQT');
    expect(out).toContain('2 TYPE FamilySearch');
    expect(out).not.toContain('1 REFN LHWY-GQT');
  });
  it('emits REFN for familysearch identifier in 5.5.1', async () => {
    const p = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonIdentifier(db, p.id, { identifier_type: 'familysearch', identifier_value: 'LHWY-GQT' });
    const { ged: out } = await exportGedcom(db, '5.5.1');
    expect(out).toContain('1 REFN LHWY-GQT');
    expect(out).not.toContain('1 EXID');
  });
});

describe('exportGedcom 7.0 — DATE PHRASE', async () => {
  it('emits PHRASE for unparseable date_original in 7.0', async () => {
    const p = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    const ev = await createEvent(db, { event_type: 'birth', date_type: 'unknown', date_original: 'Summer 1923' });
    await addEventParticipant(db, { event_id: ev.id, person_id: p.id, role: 'primary' });
    const { ged: out } = await exportGedcom(db, '7.0');
    expect(out).toContain('2 DATE\n3 PHRASE Summer 1923');
    expect(out).not.toContain('2 DATE Summer 1923');
  });
  it('emits standard DATE value for parseable date in 7.0', async () => {
    const p = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    const ev = await createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: '1845-06-12', date_original: '12 JUN 1845' });
    await addEventParticipant(db, { event_id: ev.id, person_id: p.id, role: 'primary' });
    const { ged: out } = await exportGedcom(db, '7.0');
    expect(out).toContain('2 DATE 12 JUN 1845');
  });
  it('5.5.1 emits date_original as-is (no PHRASE)', async () => {
    const p = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    const ev = await createEvent(db, { event_type: 'birth', date_type: 'unknown', date_original: 'Summer 1923' });
    await addEventParticipant(db, { event_id: ev.id, person_id: p.id, role: 'primary' });
    const { ged: out } = await exportGedcom(db, '5.5.1');
    expect(out).toContain('2 DATE Summer 1923');
    expect(out).not.toContain('3 PHRASE');
  });
});

describe('exportGedcom 7.0 — PEDI values', async () => {
  it('emits BIRTH (uppercase) for biological parent_child in 7.0', async () => {
    const parent = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    const child = await createPerson(db, { sex: 'F' }, { allowNameless: true });
    await createRelationship(db, { type: 'couple', person1_id: parent.id });
    await createRelationship(db, { type: 'parent_child', person1_id: parent.id, person2_id: child.id, subtype: 'biological' });
    const { ged: out } = await exportGedcom(db, '7.0');
    expect(out).toContain('2 PEDI BIRTH');
    expect(out).not.toContain('2 PEDI birth');
  });
  it('emits birth (lowercase) for biological parent_child in 5.5.1', async () => {
    const parent = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    const child = await createPerson(db, { sex: 'F' }, { allowNameless: true });
    await createRelationship(db, { type: 'couple', person1_id: parent.id });
    await createRelationship(db, { type: 'parent_child', person1_id: parent.id, person2_id: child.id, subtype: 'biological' });
    const { ged: out } = await exportGedcom(db, '5.5.1');
    expect(out).toContain('2 PEDI birth');
  });
});

describe('exportGedcom 7.0 — NAME.TYPE', async () => {
  it('emits AKA (not ALIAS) for alias name type in 7.0', async () => {
    const p = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Sven', surname: 'Larsson', name_type: 'alias' });
    const { ged: out } = await exportGedcom(db, '7.0');
    expect(out).toContain('2 TYPE AKA');
    expect(out).not.toContain('2 TYPE ALIAS');
  });
  it('emits ALIAS for alias name type in 5.5.1', async () => {
    const p = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Sven', surname: 'Larsson', name_type: 'alias' });
    const { ged: out } = await exportGedcom(db, '5.5.1');
    expect(out).toContain('2 TYPE ALIAS');
  });
});
