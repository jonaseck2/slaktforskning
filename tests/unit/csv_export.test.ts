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

beforeEach(async () => {
  db = await createTestDb();
});

describe('exportPersonsCsv', async () => {
  it('produces header-only CSV for empty database', async () => {
    const csv = await exportPersonsCsv(db);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('id,given_name,surname,sex,living,birth_date,birth_place,death_date,death_place,notes');
  });

  it('includes person data with birth/death events', async () => {
    const place = await createPlace(db, { name: 'Stockholm' });
    const person = await createPerson(db, { given_name: 'Erik', surname: 'Svensson', sex: 'M' });
    const birthEvt = await createEvent(db, { event_type: 'birth', date_value: '1850-01-15', place_id: place.id });
    await addEventParticipant(db, { event_id: birthEvt.id, person_id: person.id, role: 'primary' });
    const deathEvt = await createEvent(db, { event_type: 'death', date_value: '1920-06-30' });
    await addEventParticipant(db, { event_id: deathEvt.id, person_id: person.id, role: 'primary' });

    const csv = await exportPersonsCsv(db);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('Erik');
    expect(lines[1]).toContain('Svensson');
    expect(lines[1]).toContain('1850-01-15');
    expect(lines[1]).toContain('Stockholm');
    expect(lines[1]).toContain('1920-06-30');
  });

  it('uses semicolon delimiter', async () => {
    await createPerson(db, { given_name: 'Anna', surname: 'Ek' });
    const csv = await exportPersonsCsv(db, { delimiter: ';' });
    const headerLine = csv.trim().split('\n')[0];
    expect(headerLine).toContain(';');
    expect(headerLine).not.toContain(',');
  });

  it('uses tab delimiter', async () => {
    await createPerson(db, { given_name: 'Anna', surname: 'Ek' });
    const csv = await exportPersonsCsv(db, { delimiter: '\t' });
    const headerLine = csv.trim().split('\n')[0];
    expect(headerLine.split('\t')).toHaveLength(10);
  });

  it('prepends UTF-8 BOM when requested', async () => {
    const csv = await exportPersonsCsv(db, { encoding: 'utf-8-bom' });
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
  });

  it('does not prepend BOM by default', async () => {
    const csv = await exportPersonsCsv(db);
    expect(csv.charCodeAt(0)).not.toBe(0xFEFF);
  });

  it('escapes fields with commas, quotes, and newlines', async () => {
    await createPerson(db, { given_name: 'Karl', surname: 'von Essen', notes: 'Has a "nickname", also\nnewlines' });
    const csv = await exportPersonsCsv(db);
    // The notes field should be quoted and internal quotes doubled
    expect(csv).toContain('"Has a ""nickname"", also\nnewlines"');
  });
});

describe('exportEventsCsv', async () => {
  it('produces header-only CSV for empty database', async () => {
    const csv = await exportEventsCsv(db);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('id,event_type,date_type,date_value,date_original,place_name,value,notes,person_names');
  });

  it('includes event with participant names', async () => {
    const person = await createPerson(db, { given_name: 'Nils', surname: 'Persson' });
    const evt = await createEvent(db, { event_type: 'birth', date_value: '1900-03-05', notes: 'Born at home' });
    await addEventParticipant(db, { event_id: evt.id, person_id: person.id, role: 'primary' });

    const csv = await exportEventsCsv(db);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('birth');
    expect(lines[1]).toContain('1900-03-05');
    expect(lines[1]).toContain('Nils Persson');
  });

  it('exports value and notes as separate columns for fact-shaped events', async () => {
    const person = await createPerson(db, { given_name: 'Olof', surname: 'Snickare' });
    const evt = await createEvent(db, {
      event_type: 'occupation',
      date_value: '1880-01-01',
      value: 'Carpenter',
      notes: 'shipyard',
    });
    await addEventParticipant(db, { event_id: evt.id, person_id: person.id, role: 'primary' });

    const csv = await exportEventsCsv(db);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('id,event_type,date_type,date_value,date_original,place_name,value,notes,person_names');
    expect(lines[1]).toContain('Carpenter');
    expect(lines[1]).toContain('shipyard');
    expect(lines[1]).toContain('occupation');
  });
});

describe('exportSourcesCsv', async () => {
  it('produces header-only CSV for empty database', async () => {
    const csv = await exportSourcesCsv(db);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('id,title,author,publication_info,url,source_type,call_number,abstract');
  });

  it('includes source data', async () => {
    await createSource(db, { title: 'Church Records', author: 'Parish of Uppsala', source_type: 'church_record' });
    const csv = await exportSourcesCsv(db);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('Church Records');
    expect(lines[1]).toContain('Parish of Uppsala');
  });
});

describe('exportPlacesCsv', async () => {
  it('produces header-only CSV for empty database', async () => {
    const csv = await exportPlacesCsv(db);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('id,name,place_type,parent_place_name,latitude,longitude,street,postal_code,city,country');
  });

  it('includes place with parent', async () => {
    const parent = await createPlace(db, { name: 'Sweden' });
    await createPlace(db, { name: 'Stockholm', parent_place_id: parent.id, latitude: 59.33, longitude: 18.07 });

    const csv = await exportPlacesCsv(db);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(3); // header + 2 places
    const stockholmLine = lines.find(l => l.includes('Stockholm') && l.includes('Sweden'));
    expect(stockholmLine).toBeDefined();
    expect(stockholmLine).toContain('59.33');
    expect(stockholmLine).toContain('18.07');
  });
});
