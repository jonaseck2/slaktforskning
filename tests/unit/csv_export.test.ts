import { describe, it, expect, beforeEach } from 'vitest';
import { createPerson } from '../../src/api/persons';
import { createEvent } from '../../src/api/events';
import { addEventParticipant } from '../../src/api/relationships';
import { createSource } from '../../src/api/sources';
import { createPlace } from '../../src/api/places';
import {
  exportPersonsCsv,
  exportEventsCsv,
  exportSourcesCsv,
  exportPlacesCsv,
} from '../../src/api/csv_export';
import { createTestDb } from './helpers';

let db: ReturnType<typeof createTestDb>;

beforeEach(() => {
  db = createTestDb();
});

describe('exportPersonsCsv', () => {
  it('produces header-only CSV for empty database', () => {
    const csv = exportPersonsCsv(db);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('id,given_name,surname,sex,living,birth_date,birth_place,death_date,death_place,notes');
  });

  it('includes person data with birth/death events', () => {
    const place = createPlace(db, { name: 'Stockholm' });
    const person = createPerson(db, { given_name: 'Erik', surname: 'Svensson', sex: 'M' });
    const birthEvt = createEvent(db, { event_type: 'birth', date_value: '1850-01-15', place_id: place.id });
    addEventParticipant(db, { event_id: birthEvt.id, person_id: person.id, role: 'primary' });
    const deathEvt = createEvent(db, { event_type: 'death', date_value: '1920-06-30' });
    addEventParticipant(db, { event_id: deathEvt.id, person_id: person.id, role: 'primary' });

    const csv = exportPersonsCsv(db);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('Erik');
    expect(lines[1]).toContain('Svensson');
    expect(lines[1]).toContain('1850-01-15');
    expect(lines[1]).toContain('Stockholm');
    expect(lines[1]).toContain('1920-06-30');
  });

  it('uses semicolon delimiter', () => {
    createPerson(db, { given_name: 'Anna', surname: 'Ek' });
    const csv = exportPersonsCsv(db, { delimiter: ';' });
    const headerLine = csv.trim().split('\n')[0];
    expect(headerLine).toContain(';');
    expect(headerLine).not.toContain(',');
  });

  it('uses tab delimiter', () => {
    createPerson(db, { given_name: 'Anna', surname: 'Ek' });
    const csv = exportPersonsCsv(db, { delimiter: '\t' });
    const headerLine = csv.trim().split('\n')[0];
    expect(headerLine.split('\t')).toHaveLength(10);
  });

  it('prepends UTF-8 BOM when requested', () => {
    const csv = exportPersonsCsv(db, { encoding: 'utf-8-bom' });
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
  });

  it('does not prepend BOM by default', () => {
    const csv = exportPersonsCsv(db);
    expect(csv.charCodeAt(0)).not.toBe(0xFEFF);
  });

  it('escapes fields with commas, quotes, and newlines', () => {
    createPerson(db, { given_name: 'Karl', surname: 'von Essen', notes: 'Has a "nickname", also\nnewlines' });
    const csv = exportPersonsCsv(db);
    // The notes field should be quoted and internal quotes doubled
    expect(csv).toContain('"Has a ""nickname"", also\nnewlines"');
  });
});

describe('exportEventsCsv', () => {
  it('produces header-only CSV for empty database', () => {
    const csv = exportEventsCsv(db);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('id,event_type,date_type,date_value,date_original,place_name,description,person_names');
  });

  it('includes event with participant names', () => {
    const person = createPerson(db, { given_name: 'Nils', surname: 'Persson' });
    const evt = createEvent(db, { event_type: 'birth', date_value: '1900-03-05', description: 'Born at home' });
    addEventParticipant(db, { event_id: evt.id, person_id: person.id, role: 'primary' });

    const csv = exportEventsCsv(db);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('birth');
    expect(lines[1]).toContain('1900-03-05');
    expect(lines[1]).toContain('Nils Persson');
  });
});

describe('exportSourcesCsv', () => {
  it('produces header-only CSV for empty database', () => {
    const csv = exportSourcesCsv(db);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('id,title,author,publication_info,repository,url,source_type,call_number,abstract');
  });

  it('includes source data', () => {
    createSource(db, { title: 'Church Records', author: 'Parish of Uppsala', source_type: 'church_record' });
    const csv = exportSourcesCsv(db);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('Church Records');
    expect(lines[1]).toContain('Parish of Uppsala');
  });
});

describe('exportPlacesCsv', () => {
  it('produces header-only CSV for empty database', () => {
    const csv = exportPlacesCsv(db);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('id,name,place_type,parent_place_name,latitude,longitude,street,postal_code,city,country');
  });

  it('includes place with parent', () => {
    const parent = createPlace(db, { name: 'Sweden' });
    createPlace(db, { name: 'Stockholm', parent_place_id: parent.id, latitude: 59.33, longitude: 18.07 });

    const csv = exportPlacesCsv(db);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(3); // header + 2 places
    const stockholmLine = lines.find(l => l.includes('Stockholm') && l.includes('Sweden'));
    expect(stockholmLine).toBeDefined();
    expect(stockholmLine).toContain('59.33');
    expect(stockholmLine).toContain('18.07');
  });
});
