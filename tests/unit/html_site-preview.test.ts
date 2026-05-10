import { describe, it, expect, beforeEach } from 'vitest';
import { createPerson } from '../../src/api/persons';
import { addPersonName } from '../../src/api/persons';
import { createRelationship, addEventParticipant } from '../../src/api/relationships';
import { createEvent } from '../../src/api/events';
import { createPlace } from '../../src/api/places';
import { createMedia, addMediaLink } from '../../src/api/media';
import { buildPreview } from '../../src/api/html_site/preview';
import { createTestDb } from './helpers';

let db: any;
beforeEach(async () => { db = await createTestDb(); });

describe('buildPreview', async () => {
  it('returns the expected top-level shape', async () => {
    const p = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    const result = await buildPreview(db, {
      siteTitle: 'My Tree',
      scope: { everyone: true },
      options: { excludeLiving: false, redactLiving: false },
    });
    expect(result).toHaveProperty('meta');
    expect(result).toHaveProperty('totals');
    expect(result).toHaveProperty('personSample');
    expect(result.meta.siteTitle).toBe('My Tree');
    expect(result.totals.persons).toBe(1);
    expect(result.personSample).toHaveLength(1);
    expect(result.personSample[0].id).toBe(p.id);
  });

  it('returns empty result when scope is empty', () => {
    // Scope with a non-existent focusId and 0 gens → empty set
    const result = await buildPreview(db, {
      siteTitle: 'Empty',
      scope: { focusId: 'non-existent-id', ancestors: 0, descendants: 0 },
      options: { excludeLiving: false, redactLiving: false },
    });
    expect(result.totals.persons).toBe(0);
    expect(result.totals.places).toBe(0);
    expect(result.totals.media).toBe(0);
    expect(result.totals.redacted).toBe(0);
    expect(result.personSample).toHaveLength(0);
  });

  it('respects scope — excludes persons outside focus window', async () => {
    const focus = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, focus.id, { given_name: 'Focus', surname: 'Person', name_type: 'birth', sort_order: 0 });
    const stranger = await createPerson(db, { sex: 'F' }, { allowNameless: true });
    await addPersonName(db, stranger.id, { given_name: 'Stranger', surname: 'Away', name_type: 'birth', sort_order: 0 });

    const result = await buildPreview(db, {
      siteTitle: 'Test',
      scope: { focusId: focus.id, ancestors: 0, descendants: 0 },
      options: { excludeLiving: false, redactLiving: false },
    });
    expect(result.totals.persons).toBe(1);
    const ids = result.personSample.map((p) => p.id);
    expect(ids).toContain(focus.id);
    expect(ids).not.toContain(stranger.id);
  });

  it('populates given_name and surname from person_names', async () => {
    const p = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Erik', surname: 'Svensson', name_type: 'birth', sort_order: 0 });

    const result = await buildPreview(db, {
      siteTitle: 'T',
      scope: { everyone: true },
      options: { excludeLiving: false, redactLiving: false },
    });
    expect(result.personSample[0].given_name).toBe('Erik');
    expect(result.personSample[0].surname).toBe('Svensson');
  });

  it('populates birth_year and death_year from events', async () => {
    const p = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    const birth = await createEvent(db, { event_type: 'birth', date_value: '1920-06-01', date_original: '1920' });
    const death = await createEvent(db, { event_type: 'death', date_value: '1985-03-15', date_original: '1985' });
    await addEventParticipant(db, { event_id: birth.id, person_id: p.id, role: 'primary' });
    await addEventParticipant(db, { event_id: death.id, person_id: p.id, role: 'primary' });

    const result = await buildPreview(db, {
      siteTitle: 'T',
      scope: { everyone: true },
      options: { excludeLiving: false, redactLiving: false },
    });
    expect(result.personSample[0].birth_year).toBe(1920);
    expect(result.personSample[0].death_year).toBe(1985);
  });

  it('populates death_year from burial event when no death event present', async () => {
    const p = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    const burial = await createEvent(db, { event_type: 'burial', date_value: '1950-07-10', date_original: '1950' });
    await addEventParticipant(db, { event_id: burial.id, person_id: p.id, role: 'primary' });

    const result = await buildPreview(db, {
      siteTitle: 'T',
      scope: { everyone: true },
      options: { excludeLiving: false, redactLiving: false },
    });
    expect(result.personSample[0].death_year).toBe(1950);
  });

  it('counts distinct places attached to in-scope persons via events', async () => {
    const p = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    const place1 = await createPlace(db, { name: 'Stockholm' });
    const place2 = await createPlace(db, { name: 'Göteborg' });
    const e1 = await createEvent(db, { event_type: 'birth', place_id: place1.id, date_original: '1900' });
    const e2 = await createEvent(db, { event_type: 'death', place_id: place2.id, date_original: '1970' });
    await addEventParticipant(db, { event_id: e1.id, person_id: p.id, role: 'primary' });
    await addEventParticipant(db, { event_id: e2.id, person_id: p.id, role: 'primary' });

    const result = await buildPreview(db, {
      siteTitle: 'T',
      scope: { everyone: true },
      options: { excludeLiving: false, redactLiving: false },
    });
    expect(result.totals.places).toBe(2);
  });

  it('does not double-count the same place referenced by multiple events', async () => {
    const p = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    const place = await createPlace(db, { name: 'Uppsala' });
    const e1 = await createEvent(db, { event_type: 'birth', place_id: place.id, date_original: '1900' });
    const e2 = await createEvent(db, { event_type: 'death', place_id: place.id, date_original: '1970' });
    await addEventParticipant(db, { event_id: e1.id, person_id: p.id, role: 'primary' });
    await addEventParticipant(db, { event_id: e2.id, person_id: p.id, role: 'primary' });

    const result = await buildPreview(db, {
      siteTitle: 'T',
      scope: { everyone: true },
      options: { excludeLiving: false, redactLiving: false },
    });
    expect(result.totals.places).toBe(1);
  });

  it('counts media linked to in-scope persons', async () => {
    const p = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    const m1 = await createMedia(db, { title: 'Photo1' });
    const m2 = await createMedia(db, { title: 'Photo2' });
    await addMediaLink(db, { media_id: m1.id, entity_type: 'person', entity_id: p.id });
    await addMediaLink(db, { media_id: m2.id, entity_type: 'person', entity_id: p.id });

    const result = await buildPreview(db, {
      siteTitle: 'T',
      scope: { everyone: true },
      options: { excludeLiving: false, redactLiving: false },
    });
    expect(result.totals.media).toBe(2);
  });

  it('excludes living persons when excludeLiving=true', async () => {
    // A person with a death event is not living (derived); one without is living.
    const dead = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    const death = await createEvent(db, { event_type: 'death', date_value: '1950-01-01', date_original: '1950' });
    await addEventParticipant(db, { event_id: death.id, person_id: dead.id, role: 'primary' });

    const _alive = await createPerson(db, { sex: 'F' }, { allowNameless: true });

    const result = await buildPreview(db, {
      siteTitle: 'T',
      scope: { everyone: true },
      options: { excludeLiving: true, redactLiving: false },
    });
    expect(result.totals.persons).toBe(1);
    expect(result.personSample.map((p) => p.id)).toEqual([dead.id]);
  });

  it('redacts living persons when redactLiving=true — clears names and floors birth year', async () => {
    const living = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, living.id, { given_name: 'Secret', surname: 'Name', name_type: 'birth', sort_order: 0 });
    const birth = await createEvent(db, { event_type: 'birth', date_value: '1985-05-20', date_original: '1985' });
    await addEventParticipant(db, { event_id: birth.id, person_id: living.id, role: 'primary' });

    const result = await buildPreview(db, {
      siteTitle: 'T',
      scope: { everyone: true },
      options: { excludeLiving: false, redactLiving: true },
    });
    const sample = result.personSample[0];
    expect(sample.redacted).toBe(true);
    // birth year floored to decade (1985 → 1980)
    expect(sample.birth_year).toBe(1980);
    // death_year is null for living redacted persons
    expect(sample.death_year).toBeNull();
    // totals.redacted reflects the count
    expect(result.totals.redacted).toBe(1);
  });

  it('does not redact deceased persons when redactLiving=true', async () => {
    const dead = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, dead.id, { given_name: 'OldGuy', surname: 'Deceased', name_type: 'birth', sort_order: 0 });
    const death = await createEvent(db, { event_type: 'death', date_value: '1900-01-01', date_original: '1900' });
    await addEventParticipant(db, { event_id: death.id, person_id: dead.id, role: 'primary' });

    const result = await buildPreview(db, {
      siteTitle: 'T',
      scope: { everyone: true },
      options: { excludeLiving: false, redactLiving: true },
    });
    const sample = result.personSample[0];
    expect(sample.redacted).toBe(false);
    expect(sample.given_name).toBe('OldGuy');
    expect(result.totals.redacted).toBe(0);
  });

  it('personSample is sorted alphabetically by surname then given_name', async () => {
    const p1 = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, p1.id, { given_name: 'Bo', surname: 'Zetterberg', name_type: 'birth', sort_order: 0 });
    const p2 = await createPerson(db, { sex: 'F' }, { allowNameless: true });
    await addPersonName(db, p2.id, { given_name: 'Anna', surname: 'Andersson', name_type: 'birth', sort_order: 0 });
    const p3 = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, p3.id, { given_name: 'Carl', surname: 'Andersson', name_type: 'birth', sort_order: 0 });

    const result = await buildPreview(db, {
      siteTitle: 'T',
      scope: { everyone: true },
      options: { excludeLiving: false, redactLiving: false },
    });
    const names = result.personSample.map((p) => `${p.surname} ${p.given_name}`);
    expect(names).toEqual(['Andersson Anna', 'Andersson Carl', 'Zetterberg Bo']);
  });

  it('personSample is capped at 50 persons', async () => {
    for (let i = 0; i < 60; i++) {
      await createPerson(db, { sex: 'U' }, { allowNameless: true });
    }
    const result = await buildPreview(db, {
      siteTitle: 'Big',
      scope: { everyone: true },
      options: { excludeLiving: false, redactLiving: false },
    });
    expect(result.totals.persons).toBe(60);
    expect(result.personSample.length).toBeLessThanOrEqual(50);
  });

  it('does not persist any inferred values back to the DB (prime directive)', async () => {
    const p = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Infer', surname: 'Test', name_type: 'birth', sort_order: 0 });
    const birth = await createEvent(db, { event_type: 'birth', date_value: '1970-01-01', date_original: '1970' });
    await addEventParticipant(db, { event_id: birth.id, person_id: p.id, role: 'primary' });

    const personsBefore = db.prepare('SELECT * FROM persons').all([]);
    const placesBefore = db.prepare('SELECT * FROM places').all([]);
    const eventsBefore = db.prepare('SELECT * FROM events').all([]);
    const namesBefore = db.prepare('SELECT * FROM person_names').all([]);

    await buildPreview(db, {
      siteTitle: 'T',
      scope: { everyone: true },
      options: { excludeLiving: false, redactLiving: true },
    });

    expect(db.prepare('SELECT * FROM persons').all([])).toEqual(personsBefore);
    expect(db.prepare('SELECT * FROM places').all([])).toEqual(placesBefore);
    expect(db.prepare('SELECT * FROM events').all([])).toEqual(eventsBefore);
    expect(db.prepare('SELECT * FROM person_names').all([])).toEqual(namesBefore);
  });

  it('returns zero place/media counts for empty scope even when places and media exist', async () => {
    // Create place and media but no persons in scope
    await createPlace(db, { name: 'Nowhere' });
    const m = await createMedia(db, { title: 'Photo' });
    const p = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addMediaLink(db, { media_id: m.id, entity_type: 'person', entity_id: p.id });

    const result = await buildPreview(db, {
      siteTitle: 'T',
      scope: { focusId: 'non-existent-id', ancestors: 0, descendants: 0 },
      options: { excludeLiving: false, redactLiving: false },
    });
    expect(result.totals.places).toBe(0);
    expect(result.totals.media).toBe(0);
  });

  it('handles persons with no name rows gracefully', async () => {
    await createPerson(db, { sex: 'U' }, { allowNameless: true });

    const result = await buildPreview(db, {
      siteTitle: 'T',
      scope: { everyone: true },
      options: { excludeLiving: false, redactLiving: false },
    });
    expect(result.personSample[0].given_name).toBe('');
    expect(result.personSample[0].surname).toBe('');
    expect(result.personSample[0].birth_year).toBeNull();
    expect(result.personSample[0].death_year).toBeNull();
    expect(result.personSample[0].redacted).toBe(false);
  });

  it('does not count media linked to out-of-scope persons', async () => {
    const inScope = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    const outOfScope = await createPerson(db, { sex: 'F' }, { allowNameless: true });
    const m = await createMedia(db, { title: 'Photo' });
    await addMediaLink(db, { media_id: m.id, entity_type: 'person', entity_id: outOfScope.id });

    const result = await buildPreview(db, {
      siteTitle: 'T',
      scope: { focusId: inScope.id, ancestors: 0, descendants: 0 },
      options: { excludeLiving: false, redactLiving: false },
    });
    expect(result.totals.media).toBe(0);
  });

  it('redacted count is 0 when redactLiving=false even with living persons', async () => {
    await createPerson(db, { sex: 'M' }, { allowNameless: true });

    const result = await buildPreview(db, {
      siteTitle: 'T',
      scope: { everyone: true },
      options: { excludeLiving: false, redactLiving: false },
    });
    expect(result.totals.redacted).toBe(0);
  });
});
