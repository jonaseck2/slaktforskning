import { describe, it, expect, beforeEach } from 'vitest';
import type { Database } from 'node-sqlite3-wasm';
import { createTestDb } from './helpers';
import { transformHolgerEdb, parseEdbNdjson } from '../../src/import/holger/transformEdb';
import type { EdbRow, PerstabRow } from '../../src/import/holger/transformEdb';

let db: Database;

beforeEach(() => {
  db = createTestDb();
});

// ---------------------------------------------------------------------------
// parseEdbNdjson
// ---------------------------------------------------------------------------

describe('parseEdbNdjson', () => {
  it('parses valid NDJSON lines', () => {
    const ndjson = [
      JSON.stringify({ type: 'perstab', __RowID: 1, fornamn: 'Anna' }),
      JSON.stringify({ type: 'vigtab', __RowID: 2, __person1_id: 1, __person2_id: 3 }),
      '',
      JSON.stringify({ type: 'anmtab', __RowID: 5, fktabell: 1 }),
    ].join('\n');

    const rows = parseEdbNdjson(ndjson);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ type: 'perstab', __RowID: 1 });
    expect(rows[1]).toMatchObject({ type: 'vigtab', __RowID: 2 });
    expect(rows[2]).toMatchObject({ type: 'anmtab', fktabell: 1 });
  });

  it('skips malformed lines', () => {
    const ndjson = '{"type":"perstab","__RowID":1}\nnot-json\n{"type":"anmtab","__RowID":2,"fktabell":1}';
    const rows = parseEdbNdjson(ndjson);
    expect(rows).toHaveLength(2);
  });

  it('returns empty array for empty input', () => {
    expect(parseEdbNdjson('')).toEqual([]);
    expect(parseEdbNdjson('   \n\n  ')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// transformHolgerEdb — persons
// ---------------------------------------------------------------------------

describe('transformHolgerEdb — persons', () => {
  it('imports a minimal person', () => {
    const rows: EdbRow[] = [
      { type: 'perstab', __RowID: 1, fornamn: 'Erik', efternamn: 'Svensson' },
    ];
    const summary = transformHolgerEdb(db, rows);

    expect(summary.persons).toBe(1);
    expect(summary.skipped).toBe(0);

    const person = db.get('SELECT * FROM persons LIMIT 1') as { sex: string; living: number };
    expect(person.sex).toBe('U'); // no konkod
    expect(person.living).toBe(1); // no death date

    const name = db.get('SELECT * FROM person_names LIMIT 1') as { given_name: string; surname: string; name_type: string };
    expect(name.given_name).toBe('Erik');
    expect(name.surname).toBe('Svensson');
    expect(name.name_type).toBe('birth');
  });

  it('maps sex codes correctly', () => {
    const rows: EdbRow[] = [
      { type: 'perstab', __RowID: 1, fornamn: 'Karl', konkod: 'M' },
      { type: 'perstab', __RowID: 2, fornamn: 'Maja', konkod: 'K' },
      { type: 'perstab', __RowID: 3, fornamn: 'Alex', konkod: undefined },
    ];
    transformHolgerEdb(db, rows);

    const persons = db.all('SELECT sex FROM persons ORDER BY rowid') as { sex: string }[];
    expect(persons.map(p => p.sex)).toEqual(['M', 'F', 'U']);
  });

  it('marks person as not living when death date is present', () => {
    const rows: EdbRow[] = [
      { type: 'perstab', __RowID: 1, fornamn: 'Gustaf', dodat: '1890-05-12' },
    ];
    transformHolgerEdb(db, rows);

    const person = db.get('SELECT living FROM persons LIMIT 1') as { living: number };
    expect(person.living).toBe(0);
  });

  it('stores patronym in patronymic_base', () => {
    const rows: EdbRow[] = [
      { type: 'perstab', __RowID: 1, fornamn: 'Lars', efternamn: 'Nilsson', patronym: 'Eriksson' },
    ];
    transformHolgerEdb(db, rows);

    const name = db.get('SELECT patronymic_base FROM person_names LIMIT 1') as { patronymic_base: string };
    expect(name.patronymic_base).toBe('Eriksson');
  });

  it('concatenates anm1 and anm2 into notes', () => {
    const rows: EdbRow[] = [
      { type: 'perstab', __RowID: 1, fornamn: 'Britta', anm1: 'Note one', anm2: 'Note two' },
    ];
    transformHolgerEdb(db, rows);

    const person = db.get('SELECT notes FROM persons LIMIT 1') as { notes: string };
    expect(person.notes).toBe('Note one\nNote two');
  });

  it('skips records with no name', () => {
    const rows: EdbRow[] = [
      { type: 'perstab', __RowID: 1, fornamn: undefined, efternamn: undefined },
      { type: 'perstab', __RowID: 2, fornamn: 'Anna' },
    ];
    const summary = transformHolgerEdb(db, rows);

    expect(summary.persons).toBe(1);
    expect(summary.skipped).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// transformHolgerEdb — events
// ---------------------------------------------------------------------------

describe('transformHolgerEdb — events', () => {
  function importPerson(row: Partial<PerstabRow> & { fornamn: string }) {
    const fullRow: EdbRow = { type: 'perstab', __RowID: 1, ...row };
    transformHolgerEdb(db, [fullRow]);
  }

  function getEvents(): { event_type: string; date_value: string | null; place_address: string | null; cause: string | null; description: string | null }[] {
    return db.all('SELECT event_type, date_value, place_address, cause, description FROM events ORDER BY rowid') as typeof this;
  }

  it('creates birth event when birth date present', () => {
    importPerson({ fornamn: 'Anna', fodat: '1845-03-15' });

    const events = getEvents();
    expect(events.some(e => e.event_type === 'birth')).toBe(true);
    const birth = events.find(e => e.event_type === 'birth')!;
    expect(birth.date_value).toBe('1845-03-15');
  });

  it('creates birth event with place_address from fodort + fodfs', () => {
    importPerson({ fornamn: 'Anna', fodort: 'Stockholm', fodfs: 'Storkyrkan' });

    const birth = getEvents().find(e => e.event_type === 'birth')!;
    expect(birth.place_address).toBe('Stockholm, Storkyrkan');
  });

  it('creates birth event from place only (no date)', () => {
    importPerson({ fornamn: 'Anna', fodort: 'Gothenburg' });

    const events = getEvents();
    expect(events.some(e => e.event_type === 'birth')).toBe(true);
  });

  it('creates baptism event when dopdat present', () => {
    importPerson({ fornamn: 'Sven', dopdat: '1780-06-20' });

    const baptism = getEvents().find(e => e.event_type === 'baptism');
    expect(baptism).toBeTruthy();
    expect(baptism!.date_value).toBe('1780-06-20');
  });

  it('creates death event with cause', () => {
    importPerson({ fornamn: 'Per', dodat: '1899-11-01', dodors: 'Tuberculosis' });

    const death = getEvents().find(e => e.event_type === 'death');
    expect(death).toBeTruthy();
    expect(death!.cause).toBe('Tuberculosis');
  });

  it('creates death event from place alone (no date)', () => {
    importPerson({ fornamn: 'Per', dodort: 'Uppsala' });

    expect(getEvents().some(e => e.event_type === 'death')).toBe(true);
  });

  it('creates burial event when begdat present', () => {
    importPerson({ fornamn: 'Karin', begdat: '1901-02-14' });

    const burial = getEvents().find(e => e.event_type === 'burial');
    expect(burial).toBeTruthy();
    expect(burial!.date_value).toBe('1901-02-14');
  });

  it('creates occupation event from yrke', () => {
    importPerson({ fornamn: 'Anders', yrke: 'Farmer' });

    const occ = getEvents().find(e => e.event_type === 'occupation');
    expect(occ).toBeTruthy();
    expect(occ!.description).toBe('Farmer');
  });

  it('creates residence event from hemort + hemfs', () => {
    importPerson({ fornamn: 'Lena', hemort: 'Malmö', hemfs: 'S:t Petri' });

    const res = getEvents().find(e => e.event_type === 'residence');
    expect(res).toBeTruthy();
    expect(res!.place_address).toBe('Malmö, S:t Petri');
  });

  it('creates no events for person with only a name', () => {
    importPerson({ fornamn: 'Ghost' });

    expect(getEvents()).toHaveLength(0);
  });

  it('links events to person via event_participants', () => {
    importPerson({ fornamn: 'Maja', fodat: '1810-01-01' });

    const participants = db.all('SELECT * FROM event_participants') as { person_id: string; role: string }[];
    expect(participants).toHaveLength(1);
    expect(participants[0].role).toBe('primary');
  });
});

// ---------------------------------------------------------------------------
// transformHolgerEdb — summary
// ---------------------------------------------------------------------------

describe('transformHolgerEdb — summary', () => {
  it('returns correct counts', () => {
    const rows: EdbRow[] = [
      { type: 'perstab', __RowID: 1, fornamn: 'A', fodat: '1800-01-01' },
      { type: 'perstab', __RowID: 2, fornamn: 'B', dodat: '1880-05-05' },
      { type: 'perstab', __RowID: 99, fornamn: undefined, efternamn: undefined }, // skipped
    ];
    const summary = transformHolgerEdb(db, rows);

    expect(summary.persons).toBe(2);
    expect(summary.skipped).toBe(1);
    expect(summary.events).toBe(2); // 1 birth + 1 death
  });

  it('ignores vigtab rows without error', () => {
    const rows: EdbRow[] = [
      { type: 'perstab', __RowID: 1, fornamn: 'Karl' },
      { type: 'vigtab', __RowID: 10, __person1_id: 1, __person2_id: 2 },
    ];
    expect(() => transformHolgerEdb(db, rows)).not.toThrow();
  });

  it('handles empty row list', () => {
    const summary = transformHolgerEdb(db, []);
    expect(summary.persons).toBe(0);
    expect(summary.events).toBe(0);
    expect(summary.skipped).toBe(0);
  });
});
