/**
 * T25 — Gramps importer Phase 2 concept mapping.
 *
 * Pins the new T25 behaviour: shared notes (<note>/<noteref>),
 * person associations (<personref>), alt-script names (<name alt="1">),
 * alt-script place names (<pname lang="…">) all map to the corresponding
 * T02 schema additions.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { transformGramps } from '../../src/import/gramps/transform';
import { listNotes, getNotesForEntity } from '../../src/api/notes';
import { getAssociationsForPerson } from '../../src/api/person_associations';
import { getTranslationsForName, getTranslationsForPlace } from '../../src/api/translations';
import { listPersons, getPersonNames } from '../../src/api/persons';
import { listPlaces } from '../../src/api/places';
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

describe('T25 Gramps importer — shared notes via <note> + <noteref>', async () => {
  it('imports a top-level <note> and links it to a person via <noteref>', async () => {
    const xml = buildXml(`
      <notes>
        <note handle="_N1" id="N0001" type="Person Note">
          <text>An authored biography paragraph.</text>
        </note>
      </notes>
      <people>
        <person handle="_P1" id="I0001">
          <gender>M</gender>
          <name type="Birth Name"><first>John</first><surname>Smith</surname></name>
          <noteref hlink="_N1"/>
        </person>
      </people>
    `);
    const summary = await transformGramps(db, xml);
    expect(summary.notes).toBe(1);
    expect(summary.persons).toBe(1);

    const persons = await listPersons(db);
    expect(persons).toHaveLength(1);
    const linked = await getNotesForEntity(db, 'person', persons[0].id);
    expect(linked).toHaveLength(1);
    expect(linked[0].text).toBe('An authored biography paragraph.');
  });

  it('shares one note across multiple entities (SNOTE-shape)', async () => {
    const xml = buildXml(`
      <notes>
        <note handle="_N1" id="N1">
          <text>Shared across two persons.</text>
        </note>
      </notes>
      <people>
        <person handle="_P1" id="I1">
          <gender>M</gender>
          <name type="Birth Name"><first>A</first><surname>X</surname></name>
          <noteref hlink="_N1"/>
        </person>
        <person handle="_P2" id="I2">
          <gender>F</gender>
          <name type="Birth Name"><first>B</first><surname>Y</surname></name>
          <noteref hlink="_N1"/>
        </person>
      </people>
    `);
    const summary = await transformGramps(db, xml);
    expect(summary.notes).toBe(1);

    // One note row, two link rows.
    const notes = await listNotes(db);
    expect(notes).toHaveLength(1);

    const persons = await listPersons(db);
    expect(persons).toHaveLength(2);
    const p1Notes = await getNotesForEntity(db, 'person', persons[0].id);
    const p2Notes = await getNotesForEntity(db, 'person', persons[1].id);
    expect(p1Notes).toHaveLength(1);
    expect(p2Notes).toHaveLength(1);
    expect(p1Notes[0].id).toBe(p2Notes[0].id);
  });
});

describe('T25 Gramps importer — <personref> → person_associations', async () => {
  it('imports a Godparent personref into the person_associations table', async () => {
    const xml = buildXml(`
      <people>
        <person handle="_P1" id="I1">
          <gender>M</gender>
          <name type="Birth Name"><first>John</first><surname>Smith</surname></name>
          <personref hlink="_P2" rel="Godparent"/>
        </person>
        <person handle="_P2" id="I2">
          <gender>F</gender>
          <name type="Birth Name"><first>Anna</first><surname>Jones</surname></name>
        </person>
      </people>
    `);
    const summary = await transformGramps(db, xml);
    expect(summary.personAssociations).toBe(1);

    const persons = await listPersons(db);
    const john = persons.find(p => p.given_name === 'John')!;
    const anna = persons.find(p => p.given_name === 'Anna')!;
    const assocs = await getAssociationsForPerson(db, john.id);
    expect(assocs).toHaveLength(1);
    expect(assocs[0].role).toBe('godparent');
    expect(assocs[0].related_person_id).toBe(anna.id);
  });
});

describe('T25 Gramps importer — alt-script names → name_translations', async () => {
  it('imports a <name alt="1" lang="…"> as a name_translations row', async () => {
    const xml = buildXml(`
      <people>
        <person handle="_P1" id="I1">
          <gender>M</gender>
          <name type="Birth Name"><first>Ivan</first><surname>Smirnov</surname></name>
          <name alt="1" lang="ru"><first>Иван</first><surname>Смирнов</surname></name>
        </person>
      </people>
    `);
    const summary = await transformGramps(db, xml);
    expect(summary.persons).toBe(1);
    expect(summary.nameTranslations).toBe(1);

    const persons = await listPersons(db);
    const names = await getPersonNames(db, persons[0].id);
    // Only the primary name survives in person_names; the alt rides
    // name_translations attached to it.
    expect(names).toHaveLength(1);
    expect(names[0].given_name).toBe('Ivan');
    const trans = await getTranslationsForName(db, names[0].id);
    expect(trans).toHaveLength(1);
    expect(trans[0].value).toContain('Иван');
    expect(trans[0].language).toBe('ru');
  });
});

describe('T25 Gramps importer — alt-script places → place_translations', async () => {
  it('imports a lang-tagged <pname> as a place_translations row', async () => {
    const xml = buildXml(`
      <places>
        <placeobj handle="_PL1" id="P1" type="City">
          <pname value="Stockholm"/>
          <pname value="斯德哥尔摩" lang="zh"/>
        </placeobj>
      </places>
    `);
    const summary = await transformGramps(db, xml);
    expect(summary.places).toBe(1);
    expect(summary.placeTranslations).toBe(1);

    const places = await listPlaces(db);
    expect(places).toHaveLength(1);
    expect(places[0].name).toBe('Stockholm');
    const trans = await getTranslationsForPlace(db, places[0].id);
    expect(trans).toHaveLength(1);
    expect(trans[0].value).toBe('斯德哥尔摩');
    expect(trans[0].language).toBe('zh');
  });
});
