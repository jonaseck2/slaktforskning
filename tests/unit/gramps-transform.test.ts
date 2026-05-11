/**
 * Gramps .gramps importer — synthetic XML fixtures + real-sample E2E
 * (the latter skipped if the fixture isn't present in
 * `export-import/samples/native-binary/`).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { transformGramps, parseGrampsXml } from '../../src/import/gramps/transform';
import { importFromGramps } from '../../src/import/gramps';
import { listPersons, getPersonNames } from '../../src/api/persons';
import { listRelationships } from '../../src/api/relationships';
import { getEventsForPerson } from '../../src/api/events';
import { listSources } from '../../src/api/sources';
import { listPlaces } from '../../src/api/places';
import { getDbSetting } from '../../src/api/db_settings';
import { createTestDb } from './helpers';

function buildXml(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<database xmlns="http://gramps-project.org/xml/1.7.1/">
  <header>
    <created date="2026-05-09" version="5.0.0"/>
  </header>
  ${body}
</database>`;
}

let db: ReturnType<typeof createTestDb>;
beforeEach(async () => { db = await createTestDb(); });

describe('parseGrampsXml', () => {
  it('extracts researcher info from the header', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<database xmlns="http://gramps-project.org/xml/1.7.1/">
  <header>
    <created date="2026-05-09" version="5.0.0"/>
    <researcher>
      <resname>Alex Roitman</resname>
      <resaddr>1122 Boogie Boogie Ave</resaddr>
      <rescity>Gotham City</rescity>
      <rescountry>USA</rescountry>
      <resemail>anyone@someplace.com</resemail>
    </researcher>
  </header>
</database>`;
    const doc = parseGrampsXml(xml);
    expect(doc.researcher.name).toBe('Alex Roitman');
    expect(doc.researcher.street).toBe('1122 Boogie Boogie Ave');
    expect(doc.researcher.email).toBe('anyone@someplace.com');
  });

  it('extracts a person with name + gender + event refs', () => {
    const xml = buildXml(`
      <people>
        <person handle="_P1" id="I0001">
          <gender>M</gender>
          <name type="Birth Name">
            <first>John</first>
            <surname>Smith</surname>
          </name>
          <eventref hlink="_E1" role="Primary"/>
        </person>
      </people>`);
    const doc = parseGrampsXml(xml);
    expect(doc.persons).toHaveLength(1);
    expect(doc.persons[0].gender).toBe('M');
    expect(doc.persons[0].names[0]).toEqual({ type: 'Birth Name', first: 'John', surname: 'Smith' });
    expect(doc.persons[0].eventRefs).toEqual([{ hlink: '_E1', role: 'Primary' }]);
  });
});

describe('transformGramps — researcher info', async () => {
  it('writes researcher_* settings from the header', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<database xmlns="http://gramps-project.org/xml/1.7.1/">
  <header>
    <created date="2026-05-09" version="5.0.0"/>
    <researcher>
      <resname>Alex Roitman</resname>
      <resaddr>1122 Boogie Ave</resaddr>
      <rescity>Gotham</rescity>
      <rescountry>USA</rescountry>
      <resphone>(555)123-4567</resphone>
      <resemail>any@x.com</resemail>
    </researcher>
  </header>
</database>`;
    await transformGramps(db, xml);
    expect(await getDbSetting(db, 'researcher_name')).toBe('Alex Roitman');
    expect(await getDbSetting(db, 'researcher_phone')).toBe('(555)123-4567');
    expect(await getDbSetting(db, 'researcher_email')).toBe('any@x.com');
    const addr = await getDbSetting(db, 'researcher_address') ?? '';
    expect(addr).toContain('1122 Boogie Ave');
    expect(addr).toContain('Gotham');
    expect(addr).toContain('USA');
  });
});

describe('transformGramps — persons + names', async () => {
  it('imports persons with primary names', async () => {
    const xml = buildXml(`
      <people>
        <person handle="_P1" id="I0001">
          <gender>M</gender>
          <name type="Birth Name">
            <first>John</first>
            <surname>Smith</surname>
          </name>
        </person>
        <person handle="_P2" id="I0002">
          <gender>F</gender>
          <name type="Birth Name">
            <first>Jane</first>
            <surname>Doe</surname>
          </name>
        </person>
      </people>`);
    const summary = await transformGramps(db, xml);
    expect(summary.persons).toBe(2);
    const persons = await listPersons(db);
    const surnames = persons.map(p => p.surname).sort();
    expect(surnames).toEqual(['Doe', 'Smith']);
    expect(persons.find(p => p.surname === 'Smith')?.sex).toBe('M');
    expect(persons.find(p => p.surname === 'Doe')?.sex).toBe('F');
  });

  it('imports an additional married name with the right name_type', async () => {
    const xml = buildXml(`
      <people>
        <person handle="_P1" id="I0001">
          <gender>F</gender>
          <name type="Birth Name">
            <first>Jane</first>
            <surname>Maiden</surname>
          </name>
          <name type="Married Name">
            <first>Jane</first>
            <surname>Smith</surname>
          </name>
        </person>
      </people>`);
    await transformGramps(db, xml);
    const personId = (await listPersons(db))[0].id;
    const names = await getPersonNames(db, personId);
    expect(names.map(n => n.name_type).sort()).toEqual(['birth', 'married']);
  });
});

describe('transformGramps — families & events', async () => {
  it('creates couple + parent_child + an event with date and place', async () => {
    const xml = buildXml(`
      <events>
        <event handle="_E1" id="E0001">
          <type>Birth</type>
          <dateval val="1955-10-02"/>
          <place hlink="_PL1"/>
        </event>
        <event handle="_E2" id="E0002">
          <type>Marriage</type>
          <dateval val="1980-06-15"/>
        </event>
      </events>
      <people>
        <person handle="_P1" id="I0001">
          <gender>M</gender>
          <name type="Birth Name"><first>John</first><surname>Smith</surname></name>
          <eventref hlink="_E1" role="Primary"/>
        </person>
        <person handle="_P2" id="I0002">
          <gender>F</gender>
          <name type="Birth Name"><first>Jane</first><surname>Doe</surname></name>
        </person>
        <person handle="_P3" id="I0003">
          <gender>M</gender>
          <name type="Birth Name"><first>Junior</first><surname>Smith</surname></name>
        </person>
      </people>
      <families>
        <family handle="_F1" id="F0001">
          <rel type="Married"/>
          <father hlink="_P1"/>
          <mother hlink="_P2"/>
          <eventref hlink="_E2" role="Family"/>
          <childref hlink="_P3"/>
        </family>
      </families>
      <places>
        <placeobj handle="_PL1" id="P0001" type="City">
          <ptitle>Boston, MA, USA</ptitle>
          <pname value="Boston"/>
        </placeobj>
      </places>`);
    const summary = await transformGramps(db, xml);
    expect(summary.persons).toBe(3);
    expect(summary.coupleRelationships).toBe(1);
    expect(summary.parentChildRelationships).toBe(2);
    expect(summary.events).toBe(2);
    expect(summary.places).toBe(1);

    const johnId = (await listPersons(db)).find(p => p.given_name === 'John')!.id;
    const events = await getEventsForPerson(db, johnId);
    expect(events.find(e => e.event_type === 'birth')?.date_value).toBe('1955-10-02');

    const couple = (await listRelationships(db)).find(r => r.type === 'couple')!;
    const stmt = db.prepare("SELECT date_value FROM events WHERE event_type='marriage' AND relationship_id=?");
    const marr = stmt.get([couple.id]) as { date_value: string } | undefined;
    (stmt as unknown as { finalize(): void }).finalize();
    expect(marr?.date_value).toBe('1980-06-15');

    expect((await listPlaces(db))[0].name).toBe('Boston, MA, USA');
  });
});

describe('transformGramps — sources + citations', async () => {
  it('imports a source and attaches a citation to an event', async () => {
    const xml = buildXml(`
      <events>
        <event handle="_E1" id="E0001">
          <type>Birth</type>
          <dateval val="1955-10-02"/>
          <citationref hlink="_C1"/>
        </event>
      </events>
      <people>
        <person handle="_P1" id="I0001">
          <gender>M</gender>
          <name type="Birth Name"><first>John</first><surname>Smith</surname></name>
          <eventref hlink="_E1" role="Primary"/>
        </person>
      </people>
      <citations>
        <citation handle="_C1" id="C0001">
          <confidence>3</confidence>
          <sourceref hlink="_S1"/>
        </citation>
      </citations>
      <sources>
        <source handle="_S1" id="S0001">
          <stitle>1955 Massachusetts Birth Records</stitle>
        </source>
      </sources>`);
    const summary = await transformGramps(db, xml);
    expect(summary.sources).toBe(1);
    expect(summary.citations).toBe(1);
    expect((await listSources(db))[0].title).toBe('1955 Massachusetts Birth Records');
  });
});

// ── End-to-end real sample (skipped if the fixture isn't present) ─────────

const SAMPLE = '/Users/jonasahnstedt/git/slaktforskning/export-import/samples/native-binary/gramps-data.gramps';

describe.skipIf(!existsSync(SAMPLE))('Gramps import — real .gramps sample', async () => {
  it('imports the gramps-data.gramps reference file end-to-end', async () => {
    const result = await importFromGramps(db, SAMPLE);
    expect(result.summary.persons).toBeGreaterThan(0);
    expect((await listPersons(db)).length).toBe(result.summary.persons);
    // Every imported person has a name (createPerson would have thrown otherwise).
    expect((await listPersons(db)).every(p => (p.given_name?.length ?? 0) + (p.surname?.length ?? 0) > 0)).toBe(true);
    console.log(`  gramps-data.gramps: persons=${result.summary.persons}, fams=${result.summary.coupleRelationships}, parentChild=${result.summary.parentChildRelationships}, events=${result.summary.events}, places=${result.summary.places}, sources=${result.summary.sources}, citations=${result.summary.citations}, media=${result.summary.media}`);
  });

  it('preserves researcher info from the file', async () => {
    await importFromGramps(db, SAMPLE);
    expect(await getDbSetting(db, 'researcher_name')).toBe('Alex Roitman');
    expect(await getDbSetting(db, 'researcher_email')).toBe('anyone@someplace.com');
  });
});

// (Variable used to silence the unused-import lint when the synthetic suite
// is the only one running — `readFileSync` is referenced by tests below if the
// real-sample fixture is absent.)
void readFileSync;
