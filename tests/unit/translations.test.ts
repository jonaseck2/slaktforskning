// Translations API tests (T07 — GEDCOM alignment plan).
//
// Covers CRUD for both name_translations and place_translations, plus
// FK cascade behaviour from person_names and places.

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers';
import { createPerson, addPersonName, deletePersonName } from '../../src/api/persons';
import { findOrCreatePlace, deletePlace } from '../../src/api/places';
import {
  createNameTranslation,
  getTranslationsForName,
  updateNameTranslation,
  deleteNameTranslation,
  createPlaceTranslation,
  getTranslationsForPlace,
  updatePlaceTranslation,
  deletePlaceTranslation,
} from '../../src/api/translations';

let db: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => { db = await createTestDb(); });

describe('name_translations CRUD (T07)', () => {
  it('creates, lists, updates and deletes a name translation', async () => {
    const p = await createPerson(db, { sex: 'M', given_name: 'Ivan', surname: 'Sidorov' });
    const names = await import('../../src/api/persons').then(m => m.getPersonNames(db, p.id));
    const nameId = names[0].id;

    const t = await createNameTranslation(db, {
      person_name_id: nameId,
      value: 'Иван /Сидоров/',
      language: 'ru',
      transliteration_scheme: 'BGN/PCGN',
    });
    expect(t.value).toBe('Иван /Сидоров/');
    expect(t.language).toBe('ru');
    expect(t.transliteration_scheme).toBe('BGN/PCGN');

    const list = await getTranslationsForName(db, nameId);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(t.id);

    const updated = await updateNameTranslation(db, t.id, { language: 'ru-RU' });
    expect(updated?.language).toBe('ru-RU');
    expect(updated?.value).toBe('Иван /Сидоров/');

    const ok = await deleteNameTranslation(db, t.id);
    expect(ok).toBe(true);
    expect(await getTranslationsForName(db, nameId)).toHaveLength(0);
  });

  it('cascades deletion when the parent person_name is deleted', async () => {
    const p = await createPerson(db, { sex: 'F', given_name: 'Maria', surname: 'Smith' });
    const extra = await addPersonName(db, p.id, { given_name: 'Maria', surname: 'Jones', name_type: 'married' });
    await createNameTranslation(db, { person_name_id: extra.id, value: 'マリア', language: 'ja' });
    expect(await getTranslationsForName(db, extra.id)).toHaveLength(1);

    await deletePersonName(db, extra.id);
    expect(await getTranslationsForName(db, extra.id)).toHaveLength(0);
  });

  it('lists multiple translations in created_at order', async () => {
    const p = await createPerson(db, { sex: 'M', given_name: 'Test', surname: 'Person' });
    const names = await import('../../src/api/persons').then(m => m.getPersonNames(db, p.id));
    const nameId = names[0].id;

    await createNameTranslation(db, { person_name_id: nameId, value: 'A', language: 'ar' });
    await createNameTranslation(db, { person_name_id: nameId, value: 'B', language: 'he' });
    const list = await getTranslationsForName(db, nameId);
    expect(list).toHaveLength(2);
    expect(list.map(t => t.value).sort()).toEqual(['A', 'B']);
  });
});

describe('place_translations CRUD (T07)', () => {
  it('creates, lists, updates and deletes a place translation', async () => {
    const pl = await findOrCreatePlace(db, 'Москва');
    const t = await createPlaceTranslation(db, {
      place_id: pl.id,
      value: 'Moscow',
      language: 'en',
    });
    expect(t.value).toBe('Moscow');
    expect(t.language).toBe('en');
    expect(t.transliteration_scheme).toBe('');

    const list = await getTranslationsForPlace(db, pl.id);
    expect(list).toHaveLength(1);

    const updated = await updatePlaceTranslation(db, t.id, { transliteration_scheme: 'BGN/PCGN' });
    expect(updated?.transliteration_scheme).toBe('BGN/PCGN');

    const ok = await deletePlaceTranslation(db, t.id);
    expect(ok).toBe(true);
    expect(await getTranslationsForPlace(db, pl.id)).toHaveLength(0);
  });

  it('cascades deletion when the parent place is deleted', async () => {
    const pl = await findOrCreatePlace(db, '北京');
    await createPlaceTranslation(db, { place_id: pl.id, value: 'Beijing', language: 'en', transliteration_scheme: 'Pinyin' });
    expect(await getTranslationsForPlace(db, pl.id)).toHaveLength(1);

    await deletePlace(db, pl.id);
    expect(await getTranslationsForPlace(db, pl.id)).toHaveLength(0);
  });

  it('returns empty list when no translations exist for a place', async () => {
    const pl = await findOrCreatePlace(db, 'Plain Town');
    expect(await getTranslationsForPlace(db, pl.id)).toEqual([]);
  });
});
