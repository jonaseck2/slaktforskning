// GEDCOM name/place translations round-trip (T07 — GEDCOM alignment plan).
//
// User goal (verbatim from the plan): every authored field in our database
// survives a GEDCOM 5.5.1 OR 7.0 round-trip cleanly, or is explicitly
// classified as `lossy` / `excluded`. No silent data loss on export.
//
// For T07 specifically: alternative-script and alternative-language NAME
// + PLAC translations round-trip losslessly via GEDCOM 7.0 TRAN substructure
// on NAME and PLAC. 5.5.1 degrades NAME translations to additional NAME
// nodes with TYPE <lang>; place translations are dropped entirely with a
// disclosure warning.

import { describe, it, expect, beforeEach } from 'vitest';
import { parseGedcom } from '../../src/gedcom/parser';
import { importGedcom } from '../../src/import/gedcom';
import { exportGedcom } from '../../src/gedcom/exporter';
import { createPerson, getPersonNames, listPersons } from '../../src/api/persons';
import { findOrCreatePlace, listPlaces } from '../../src/api/places';
import { createEvent } from '../../src/api/events';
import { addEventParticipant } from '../../src/api/relationships';
import {
  createNameTranslation,
  getTranslationsForName,
  createPlaceTranslation,
  getTranslationsForPlace,
} from '../../src/api/translations';
import { createTestDb } from './helpers';

let db: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => { db = await createTestDb(); });

describe('GEDCOM name translations round-trip (T07)', () => {
  it('7.0 NAME/TRAN preserves Cyrillic name with language tag (lossless)', async () => {
    const p = await createPerson(db, { sex: 'M', given_name: 'Ivan', surname: 'Sidorov' });
    const names = await getPersonNames(db, p.id);
    await createNameTranslation(db, {
      person_name_id: names[0].id,
      value: 'Иван /Сидоров/',
      language: 'ru',
      transliteration_scheme: 'BGN/PCGN',
    });

    const { ged } = await exportGedcom(db, '7.0');
    // Expect canonical TRAN/LANG block under the NAME.
    expect(ged).toMatch(/1 NAME Ivan \/Sidorov\/[\s\S]*?2 TRAN Иван \/Сидоров\/[\s\S]*?3 LANG ru/);
    // _SCHEME custom tag carries the transliteration scheme.
    expect(ged).toMatch(/3 _SCHEME BGN\/PCGN/);

    const db2 = await createTestDb();
    const tree = parseGedcom(ged);
    await importGedcom(db2, tree);

    const persons2 = await listPersons(db2);
    expect(persons2).toHaveLength(1);
    const names2 = await getPersonNames(db2, persons2[0].id);
    expect(names2).toHaveLength(1);
    const trans = await getTranslationsForName(db2, names2[0].id);
    expect(trans).toHaveLength(1);
    expect(trans[0].value).toBe('Иван /Сидоров/');
    expect(trans[0].language).toBe('ru');
    expect(trans[0].transliteration_scheme).toBe('BGN/PCGN');
  });

  it('7.0 NAME/TRAN preserves Chinese name with Pinyin scheme', async () => {
    const p = await createPerson(db, { sex: 'F', given_name: 'Wei', surname: 'Li' });
    const names = await getPersonNames(db, p.id);
    await createNameTranslation(db, {
      person_name_id: names[0].id,
      value: '李 /薇/',
      language: 'zh',
      transliteration_scheme: 'Pinyin',
    });

    const { ged } = await exportGedcom(db, '7.0');
    expect(ged).toContain('2 TRAN 李 /薇/');
    expect(ged).toContain('3 LANG zh');
    expect(ged).toContain('3 _SCHEME Pinyin');

    const db2 = await createTestDb();
    await importGedcom(db2, parseGedcom(ged));
    const persons2 = await listPersons(db2);
    const names2 = await getPersonNames(db2, persons2[0].id);
    const trans = await getTranslationsForName(db2, names2[0].id);
    expect(trans).toHaveLength(1);
    expect(trans[0].transliteration_scheme).toBe('Pinyin');
  });

  it('5.5.1 degrades NAME translation to additional NAME with TYPE <lang> and discloses partial loss', async () => {
    const p = await createPerson(db, { sex: 'M', given_name: 'Ivan', surname: 'Sidorov' });
    const names = await getPersonNames(db, p.id);
    await createNameTranslation(db, {
      person_name_id: names[0].id,
      value: 'Иван /Сидоров/',
      language: 'ru',
      transliteration_scheme: 'BGN/PCGN',
    });

    const { ged, report } = await exportGedcom(db, '5.5.1');
    // Two NAME nodes at level 1: primary + degraded translation.
    const nameLines = ged.split('\n').filter(l => /^1 NAME /.test(l));
    expect(nameLines).toHaveLength(2);
    expect(nameLines[1]).toBe('1 NAME Иван /Сидоров/');
    // The degraded NAME carries `2 TYPE ru`.
    expect(ged).toMatch(/1 NAME Иван \/Сидоров\/\n2 TYPE ru/);
    // Disclosure warning was emitted for the lossy scheme drop.
    expect(report.warnings.some(w => /Name translation/.test(w) && /5\.5\.1/.test(w))).toBe(true);

    // Re-import: secondary NAME with TYPE ru is recognized as a translation.
    const db2 = await createTestDb();
    await importGedcom(db2, parseGedcom(ged));
    const persons2 = await listPersons(db2);
    const names2 = await getPersonNames(db2, persons2[0].id);
    // The 5.5.1 degraded path creates *two* person_names rows (primary + secondary)
    // and the secondary-NAME→TRAN heuristic also creates a name_translations row
    // pointing at the primary. Both round-trip carriers are present.
    expect(names2.length).toBeGreaterThanOrEqual(1);
    const trans = await getTranslationsForName(db2, names2[0].id);
    expect(trans.length).toBeGreaterThanOrEqual(1);
    expect(trans[0].value).toBe('Иван /Сидоров/');
    expect(trans[0].language).toBe('ru');
    // Transliteration scheme is lost on 5.5.1.
    expect(trans[0].transliteration_scheme).toBe('');
  });
});

describe('GEDCOM place translations round-trip (T07)', () => {
  async function seedPlaceWithEvent(): Promise<string> {
    const place = await findOrCreatePlace(db, 'Москва');
    const person = await createPerson(db, { sex: 'M', given_name: 'Test', surname: 'Person' });
    const ev = await createEvent(db, {
      event_type: 'birth',
      date_type: 'exact',
      date_value: '1900-01-01',
      date_original: '1 JAN 1900',
      place_id: place.id,
    });
    await addEventParticipant(db, { event_id: ev.id, person_id: person.id, role: 'primary' });
    return place.id;
  }

  it('7.0 PLAC/TRAN preserves Arabic place with Latin transliteration (lossless)', async () => {
    const place = await findOrCreatePlace(db, 'القاهرة');
    const person = await createPerson(db, { sex: 'M', given_name: 'Test', surname: 'Person' });
    const ev = await createEvent(db, {
      event_type: 'birth', date_type: 'exact', date_value: '1900-01-01',
      date_original: '1 JAN 1900', place_id: place.id,
    });
    await addEventParticipant(db, { event_id: ev.id, person_id: person.id, role: 'primary' });
    await createPlaceTranslation(db, {
      place_id: place.id, value: 'Cairo', language: 'en',
    });

    const { ged } = await exportGedcom(db, '7.0');
    expect(ged).toContain('2 PLAC القاهرة');
    expect(ged).toMatch(/2 PLAC القاهرة[\s\S]*?3 TRAN Cairo[\s\S]*?4 LANG en/);

    const db2 = await createTestDb();
    await importGedcom(db2, parseGedcom(ged));
    const places2 = await listPlaces(db2);
    const cairo = places2.find(p => p.name === 'القاهرة')!;
    expect(cairo).toBeTruthy();
    const trans = await getTranslationsForPlace(db2, cairo.id);
    expect(trans).toHaveLength(1);
    expect(trans[0].value).toBe('Cairo');
    expect(trans[0].language).toBe('en');
  });

  it('5.5.1 drops PLAC translation and discloses via report.warnings (lossy)', async () => {
    const placeId = await seedPlaceWithEvent();
    await createPlaceTranslation(db, {
      place_id: placeId, value: 'Moscow', language: 'en',
    });

    const { ged, report } = await exportGedcom(db, '5.5.1');
    // No TRAN under PLAC on 5.5.1.
    expect(ged).not.toMatch(/3 TRAN Moscow/);
    expect(ged).toContain('2 PLAC Москва');
    // Disclosure warning fired.
    const placWarning = report.warnings.find(w => /Place translation/.test(w) && /5\.5\.1/.test(w));
    expect(placWarning).toBeTruthy();
    expect(placWarning).toContain('Moscow');
  });

  it('5.5.1 re-import has 0 place_translations rows for the warned place', async () => {
    const placeId = await seedPlaceWithEvent();
    await createPlaceTranslation(db, {
      place_id: placeId, value: 'Moscow', language: 'en', transliteration_scheme: 'BGN/PCGN',
    });

    const { ged } = await exportGedcom(db, '5.5.1');
    const db2 = await createTestDb();
    await importGedcom(db2, parseGedcom(ged));

    const places2 = await listPlaces(db2);
    const moscow = places2.find(p => p.name === 'Москва');
    expect(moscow).toBeTruthy();
    const trans = await getTranslationsForPlace(db2, moscow!.id);
    expect(trans).toHaveLength(0);
  });
});
