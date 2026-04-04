import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers';
import { transformGenney, parseNdJson, type GenneyTables } from '../../src/import/genney/transform';
import { listPersons, getPersonNames } from '../../src/api/persons';
import { listRelationships } from '../../src/api/relationships';
import { getEventsForPerson, getEventsForRelationship } from '../../src/api/events';
import { listSources, getCitationsForEvent } from '../../src/api/sources';
import { listPlaces } from '../../src/api/places';

let db: ReturnType<typeof createTestDb>;

beforeEach(() => {
  db = createTestDb();
});

// ── Minimal table fixture builder ─────────────────────────────────────────

function emptyTables(): GenneyTables {
  return {
    PERSON: [], FAMILY: [], COUPLE_FAMILY: [], SPOUSE_FAMILY: [],
    EVENT: [], EVENT_PLACE: [], OWNER_EVENT: [], SPLACE: [], SOURCE: [],
    CITATION: [], CITATION_SOURCE: [], OWNER_CITATION: [], REMARK: [],
    REPO: [], SOURCE_REPO: [], GROUPS: [], GROUP_MEMBER: [],
    MEDIA: [], OWNER_MEDIA: [], TODO: [],
  };
}

// ── parseNdJson ────────────────────────────────────────────────────────────

describe('parseNdJson', () => {
  it('parses NDJSON lines into GenneyTables', () => {
    const ndjson = [
      '{"table":"PERSON","rows":[{"RID":"I1","SEX":1,"GIVENNAME":"Lars","SURNAME":"Svensson"}]}',
      '{"table":"SOURCE","rows":[{"RID":"S1","TITLE":"Husförhörslängd"}]}',
    ].join('\n');
    const tables = parseNdJson(ndjson);
    expect(tables.PERSON).toHaveLength(1);
    expect(tables.PERSON[0].RID).toBe('I1');
    expect(tables.SOURCE).toHaveLength(1);
    expect(tables.SOURCE[0].TITLE).toBe('Husförhörslängd');
  });

  it('skips malformed lines', () => {
    const ndjson = '{"table":"PERSON","rows":[]}\nNOT_JSON\n{"table":"SOURCE","rows":[]}';
    const tables = parseNdJson(ndjson);
    expect(tables.PERSON).toHaveLength(0);
    expect(tables.SOURCE).toHaveLength(0);
  });

  it('returns empty arrays for missing tables', () => {
    const tables = parseNdJson('');
    expect(tables.COUPLE_FAMILY).toEqual([]);
    expect(tables.EVENT_PLACE).toEqual([]);
  });
});

// ── persons ───────────────────────────────────────────────────────────────

describe('transformGenney — persons', () => {
  it('imports a male person with given name and surname', () => {
    const tables = emptyTables();
    tables.PERSON = [{ RID: 'I1', SEX: 0, GIVENNAME: 'Lars Erik', SURNAME: 'Svensson' }];
    transformGenney(db, tables);
    const persons = listPersons(db);
    expect(persons).toHaveLength(1);
    expect(persons[0].sex).toBe('M');
    expect(persons[0].given_name).toBe('Lars Erik');
    expect(persons[0].surname).toBe('Svensson');
  });

  it('imports a female person (SEX=1)', () => {
    const tables = emptyTables();
    tables.PERSON = [{ RID: 'I2', SEX: 1, GIVENNAME: 'Anna', SURNAME: 'Larsson' }];
    transformGenney(db, tables);
    const persons = listPersons(db);
    expect(persons[0].sex).toBe('F');
  });

  it('defaults sex to U when SEX is null', () => {
    const tables = emptyTables();
    tables.PERSON = [{ RID: 'I3', SEX: null, GIVENNAME: 'Unknown' }];
    transformGenney(db, tables);
    expect(listPersons(db)[0].sex).toBe('U');
  });

  it('extracts preferred_name from asterisk notation', () => {
    const tables = emptyTables();
    tables.PERSON = [{ RID: 'I4', SEX: 0, GIVENNAME: 'Stig Ingvar* Raine', SURNAME: 'Ahlgren' }];
    transformGenney(db, tables);
    const persons = listPersons(db);
    const names = getPersonNames(db, persons[0].id);
    expect(names[0].given_name).toBe('Stig Ingvar Raine');
    expect(names[0].preferred_name).toBe('Ingvar');
  });

  it('imports nickname', () => {
    const tables = emptyTables();
    tables.PERSON = [{ RID: 'I5', SEX: 1, GIVENNAME: 'Elisabeth', NICKNAME: 'Lisa' }];
    transformGenney(db, tables);
    const persons = listPersons(db);
    const names = getPersonNames(db, persons[0].id);
    expect(names[0].nickname).toBe('Lisa');
  });

  it('imports name_prefix and name_suffix', () => {
    const tables = emptyTables();
    tables.PERSON = [{ RID: 'I6', SEX: 0, GIVENNAME: 'Karl', SURNAME: 'Johansson', PREFIX: 'dr', SUFFIX: 'jr' }];
    transformGenney(db, tables);
    const persons = listPersons(db);
    const names = getPersonNames(db, persons[0].id);
    expect(names[0].name_prefix).toBe('dr');
    expect(names[0].name_suffix).toBe('jr');
  });

  it('appends REMARK text to person notes', () => {
    const tables = emptyTables();
    tables.PERSON = [{ RID: 'I7', SEX: 0, GIVENNAME: 'Erik', NOTE: 'inline note' }];
    tables.REMARK = [{ OWNER: 'I7', NOTE: 'remark text' }];
    transformGenney(db, tables);
    const person = listPersons(db)[0];
    expect(person.notes).toContain('inline note');
    expect(person.notes).toContain('remark text');
  });

  it('returns correct person count in summary', () => {
    const tables = emptyTables();
    tables.PERSON = [
      { RID: 'I1', SEX: 0, GIVENNAME: 'Lars' },
      { RID: 'I2', SEX: 1, GIVENNAME: 'Anna' },
    ];
    const summary = transformGenney(db, tables);
    expect(summary.persons).toBe(2);
  });
});

// ── families (couple relationships) ──────────────────────────────────────

describe('transformGenney — couple relationships', () => {
  it('creates couple relationship from FAMILY', () => {
    const tables = emptyTables();
    tables.PERSON = [
      { RID: 'I1', SEX: 0, GIVENNAME: 'Lars', SURNAME: 'Svensson' },
      { RID: 'I2', SEX: 1, GIVENNAME: 'Anna', SURNAME: 'Larsson' },
    ];
    tables.FAMILY = [{ RID: 'F1', HUSBAND: 'I1', WIFE: 'I2' }];
    const summary = transformGenney(db, tables);
    expect(summary.coupleRelationships).toBe(1);
    const rels = listRelationships(db).filter(r => r.type === 'couple');
    expect(rels).toHaveLength(1);
  });

  it('maps SPOUSE_FAMILY RELATIONTYPE=3 to subtype=marriage', () => {
    const tables = emptyTables();
    tables.PERSON = [
      { RID: 'I1', SEX: 0, GIVENNAME: 'Lars' },
      { RID: 'I2', SEX: 1, GIVENNAME: 'Anna' },
    ];
    tables.FAMILY = [{ RID: 'F1', HUSBAND: 'I1', WIFE: 'I2' }];
    tables.SPOUSE_FAMILY = [{ FAMILY: 'F1', PERSON: 'I1', RELATIONTYPE: 3 }];
    transformGenney(db, tables);
    const rel = listRelationships(db).find(r => r.type === 'couple');
    expect(rel?.subtype).toBe('marriage');
  });
});

// ── parent_child relationships ────────────────────────────────────────────

describe('transformGenney — parent_child relationships', () => {
  it('creates parent_child relationships from COUPLE_FAMILY', () => {
    const tables = emptyTables();
    tables.PERSON = [
      { RID: 'I1', SEX: 0, GIVENNAME: 'Lars' },
      { RID: 'I2', SEX: 1, GIVENNAME: 'Anna' },
      { RID: 'I3', SEX: 0, GIVENNAME: 'Petter' },
    ];
    tables.COUPLE_FAMILY = [{ PERSON: 'I3', FATHER: 'I1', MOTHER: 'I2', FATHERLINK: 'birth', MOTHERLINK: 'birth' }];
    const summary = transformGenney(db, tables);
    expect(summary.parentChildRelationships).toBe(2);
    const rels = listRelationships(db).filter(r => r.type === 'parent_child');
    expect(rels).toHaveLength(2);
    expect(rels[0].subtype).toBe('biological');
  });

  it('maps FATHERLINK=adopted to subtype=adopted', () => {
    const tables = emptyTables();
    tables.PERSON = [
      { RID: 'I1', SEX: 0, GIVENNAME: 'Lars' },
      { RID: 'I2', SEX: 0, GIVENNAME: 'Petter' },
    ];
    tables.COUPLE_FAMILY = [{ PERSON: 'I2', FATHER: 'I1', FATHERLINK: 'adopted' }];
    transformGenney(db, tables);
    const rels = listRelationships(db).filter(r => r.type === 'parent_child');
    expect(rels[0].subtype).toBe('adopted');
  });
});

// ── events ────────────────────────────────────────────────────────────────

describe('transformGenney — events', () => {
  it('imports a birth event for a person', () => {
    const tables = emptyTables();
    tables.PERSON = [{ RID: 'I1', SEX: 0, GIVENNAME: 'Lars' }];
    tables.EVENT = [{ RID: 'E1', TYPE: 'BIRT', DATE: '15 APR 1850', OWNER: 'I1' }];
    transformGenney(db, tables);
    const persons = listPersons(db);
    const events = getEventsForPerson(db, persons[0].id);
    expect(events).toHaveLength(1);
    expect(events[0].event_type).toBe('birth');
    expect(events[0].date_value).toBe('1850-04-15');
    expect(events[0].date_type).toBe('exact');
  });

  it('imports a marriage event for a family', () => {
    const tables = emptyTables();
    tables.PERSON = [
      { RID: 'I1', SEX: 0, GIVENNAME: 'Lars' },
      { RID: 'I2', SEX: 1, GIVENNAME: 'Anna' },
    ];
    tables.FAMILY = [{ RID: 'F1', HUSBAND: 'I1', WIFE: 'I2' }];
    tables.EVENT = [{ RID: 'E1', TYPE: 'MARR', DATE: 'ABT 1875', OWNER: 'F1' }];
    transformGenney(db, tables);
    const rels = listRelationships(db).filter(r => r.type === 'couple');
    const events = getEventsForRelationship(db, rels[0].id);
    expect(events).toHaveLength(1);
    expect(events[0].event_type).toBe('marriage');
    expect(events[0].date_type).toBe('about');
  });

  it('handles unknown event type as other', () => {
    const tables = emptyTables();
    tables.PERSON = [{ RID: 'I1', SEX: 0, GIVENNAME: 'Lars' }];
    tables.EVENT = [{ RID: 'E1', TYPE: 'UNKNOWN_TYPE', OWNER: 'I1' }];
    transformGenney(db, tables);
    const persons = listPersons(db);
    const events = getEventsForPerson(db, persons[0].id);
    expect(events[0].event_type).toBe('other');
  });

  it('links event to SPLACE via EVENT_PLACE', () => {
    const tables = emptyTables();
    tables.PERSON = [{ RID: 'I1', SEX: 0, GIVENNAME: 'Lars' }];
    tables.SPLACE = [{ RID: 1, NAME: 'Skepperstad', TYPE: 2 }];
    tables.EVENT = [{ RID: 'E1', TYPE: 'BIRT', OWNER: 'I1' }];
    tables.EVENT_PLACE = [{ EVENT: 'E1', PLACE: 1 }];
    transformGenney(db, tables);
    const persons = listPersons(db);
    const events = getEventsForPerson(db, persons[0].id);
    expect(events[0].place_id).not.toBeNull();
    const places = listPlaces(db);
    expect(places).toHaveLength(1);
    expect(places[0].name).toBe('Skepperstad');
    expect(places[0].place_type).toBe('parish');
  });

  it('returns correct event count in summary', () => {
    const tables = emptyTables();
    tables.PERSON = [{ RID: 'I1', SEX: 0, GIVENNAME: 'Lars' }];
    tables.EVENT = [
      { RID: 'E1', TYPE: 'BIRT', OWNER: 'I1' },
      { RID: 'E2', TYPE: 'DEAT', OWNER: 'I1' },
    ];
    const summary = transformGenney(db, tables);
    expect(summary.events).toBe(2);
  });
});

// ── places ────────────────────────────────────────────────────────────────

describe('transformGenney — places', () => {
  it('imports parent SPLACE before child', () => {
    const tables = emptyTables();
    tables.SPLACE = [
      { RID: 1, NAME: 'Jönköpings län', TYPE: 1 },
      { RID: 2, NAME: 'Skepperstad', TYPE: 2, PARENT: 1 },
    ];
    tables.PERSON = [{ RID: 'I1', SEX: 0, GIVENNAME: 'Lars' }];
    tables.EVENT = [{ RID: 'E1', TYPE: 'BIRT', OWNER: 'I1' }];
    tables.EVENT_PLACE = [{ EVENT: 'E1', PLACE: 2 }];
    transformGenney(db, tables);
    const places = listPlaces(db);
    expect(places).toHaveLength(2);
    const child = places.find(p => p.name === 'Skepperstad');
    const parent = places.find(p => p.name === 'Jönköpings län');
    expect(child?.parent_place_id).toBe(parent?.id);
  });

  it('skips SPLACE records not referenced by any event', () => {
    const tables = emptyTables();
    tables.SPLACE = [
      { RID: 1, NAME: 'Unreferenced place' },
      { RID: 2, NAME: 'Used place' },
    ];
    tables.PERSON = [{ RID: 'I1', SEX: 0, GIVENNAME: 'Lars' }];
    tables.EVENT = [{ RID: 'E1', TYPE: 'BIRT', OWNER: 'I1' }];
    tables.EVENT_PLACE = [{ EVENT: 'E1', PLACE: 2 }];
    transformGenney(db, tables);
    const places = listPlaces(db);
    expect(places).toHaveLength(1);
    expect(places[0].name).toBe('Used place');
  });

  it('imports lat/lon when non-zero', () => {
    const tables = emptyTables();
    tables.SPLACE = [{ RID: 1, NAME: 'Skepperstad', LATITUD: 57.5, LONGITUD: 14.2 }];
    tables.PERSON = [{ RID: 'I1', SEX: 0, GIVENNAME: 'Lars' }];
    tables.EVENT = [{ RID: 'E1', TYPE: 'BIRT', OWNER: 'I1' }];
    tables.EVENT_PLACE = [{ EVENT: 'E1', PLACE: 1 }];
    transformGenney(db, tables);
    const place = listPlaces(db)[0];
    expect(place.latitude).toBeCloseTo(57.5);
    expect(place.longitude).toBeCloseTo(14.2);
  });

  it('does not import zero lat/lon as coordinates', () => {
    const tables = emptyTables();
    tables.SPLACE = [{ RID: 1, NAME: 'Unknown', LATITUD: 0, LONGITUD: 0 }];
    tables.PERSON = [{ RID: 'I1', SEX: 0, GIVENNAME: 'Lars' }];
    tables.EVENT = [{ RID: 'E1', TYPE: 'BIRT', OWNER: 'I1' }];
    tables.EVENT_PLACE = [{ EVENT: 'E1', PLACE: 1 }];
    transformGenney(db, tables);
    const place = listPlaces(db)[0];
    expect(place.latitude).toBeNull();
    expect(place.longitude).toBeNull();
  });
});

// ── sources & citations ───────────────────────────────────────────────────

describe('transformGenney — sources and citations', () => {
  it('imports a source', () => {
    const tables = emptyTables();
    tables.SOURCE = [{ RID: 'S1', TITLE: 'Husförhörslängd 1850', AUTHOR: 'Kyrkan' }];
    transformGenney(db, tables);
    const sources = listSources(db);
    expect(sources).toHaveLength(1);
    expect(sources[0].title).toBe('Husförhörslängd 1850');
    expect(sources[0].author).toBe('Kyrkan');
  });

  it('uses ABBREVIATION when TITLE is empty', () => {
    const tables = emptyTables();
    tables.SOURCE = [{ RID: 'S1', TITLE: '', ABBREVIATION: 'HFL' }];
    transformGenney(db, tables);
    const sources = listSources(db);
    expect(sources[0].title).toBe('HFL');
  });

  it('links citation to event', () => {
    const tables = emptyTables();
    tables.PERSON = [{ RID: 'I1', SEX: 0, GIVENNAME: 'Lars' }];
    tables.EVENT = [{ RID: 'E1', TYPE: 'BIRT', OWNER: 'I1' }];
    tables.SOURCE = [{ RID: 'S1', TITLE: 'HFL' }];
    tables.CITATION = [{ RID: 'C1', WHEREINTEXT: 'p. 12', CERTAINTY: 2 }];
    tables.CITATION_SOURCE = [{ CITATION: 'C1', SOURCE: 'S1' }];
    tables.OWNER_CITATION = [{ OWNER: 'E1', CITATION: 'C1' }];
    transformGenney(db, tables);
    const persons = listPersons(db);
    const events = getEventsForPerson(db, persons[0].id);
    const citations = getCitationsForEvent(db, events[0].id);
    expect(citations).toHaveLength(1);
    expect(citations[0].page).toBe('p. 12');
    expect(citations[0].confidence).toBe(2);
  });

  it('maps CERTAINTY=-1 to confidence=0', () => {
    const tables = emptyTables();
    tables.PERSON = [{ RID: 'I1', SEX: 0, GIVENNAME: 'Lars' }];
    tables.EVENT = [{ RID: 'E1', TYPE: 'BIRT', OWNER: 'I1' }];
    tables.SOURCE = [{ RID: 'S1', TITLE: 'HFL' }];
    tables.CITATION = [{ RID: 'C1', CERTAINTY: -1 }];
    tables.CITATION_SOURCE = [{ CITATION: 'C1', SOURCE: 'S1' }];
    tables.OWNER_CITATION = [{ OWNER: 'E1', CITATION: 'C1' }];
    transformGenney(db, tables);
    const persons = listPersons(db);
    const events = getEventsForPerson(db, persons[0].id);
    const citations = getCitationsForEvent(db, events[0].id);
    expect(citations[0].confidence).toBe(0);
  });
});
