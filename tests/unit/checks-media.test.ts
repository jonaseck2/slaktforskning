import { describe, it, expect, beforeEach } from 'vitest';
import { runAllChecks } from '../../src/api/checks';
import { queryRun } from '../../src/api/db';
import { createMedia, addMediaLink } from '../../src/api/media';
import { createMediaRegion } from '../../src/api/media_regions';
import { createPerson } from '../../src/api/persons';
import { createEvent } from '../../src/api/events';
import { addEventParticipant } from '../../src/api/relationships';
import { createTestDb } from './helpers';

let db: ReturnType<typeof createTestDb>;
beforeEach(() => { db = createTestDb(); });

describe('MEDIA_FILE_MISSING (relocated)', () => {
  it('still fires when is_missing flag is 1', async () => {
    const m = createMedia(db, { title: 'Missing photo', file_ref: '/absent.jpg' });
    queryRun(db, 'UPDATE media SET is_missing = 1 WHERE id = ?', [m.id]);
    // Link it so it isn't flagged as orphaned by future ORPHANED_MEDIA check
    const p = createPerson(db, {}, { allowNameless: true });
    addMediaLink(db, { media_id: m.id, entity_type: 'person', entity_id: p.id });
    const results = await runAllChecks(db);
    expect(results.filter(r => r.code === 'MEDIA_FILE_MISSING' && r.mediaIds?.includes(m.id))).toHaveLength(1);
  });
});

describe('ORPHANED_MEDIA', () => {
  it('fires for media with no links', async () => {
    const m = createMedia(db, { title: 'Lonely photo' });
    const results = await runAllChecks(db);
    expect(results.filter(r => r.code === 'ORPHANED_MEDIA' && r.mediaIds?.includes(m.id))).toHaveLength(1);
  });

  it('does not fire for media linked to a person', async () => {
    const m = createMedia(db, { title: 'Linked photo' });
    const p = createPerson(db, {}, { allowNameless: true });
    addMediaLink(db, { media_id: m.id, entity_type: 'person', entity_id: p.id });
    const results = await runAllChecks(db);
    expect(results.filter(r => r.code === 'ORPHANED_MEDIA' && r.mediaIds?.includes(m.id))).toHaveLength(0);
  });
});

describe('MEDIA_REGION_OUT_OF_BOUNDS', () => {
  it('fires when a region extends past the right edge', async () => {
    const m = createMedia(db, { title: 'Photo' });
    const p = createPerson(db, {}, { allowNameless: true });
    addMediaLink(db, { media_id: m.id, entity_type: 'person', entity_id: p.id });
    const region = createMediaRegion(db, { media_id: m.id, person_id: p.id, x: 0.8, y: 0.1, width: 0.5, height: 0.2 });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'MEDIA_REGION_OUT_OF_BOUNDS' && r.mediaIds?.includes(m.id));
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('warning');
    // sanity: region id is referenced so future UI can navigate
    void region;
  });

  it('does not fire for a region fully inside the unit square', async () => {
    const m = createMedia(db, { title: 'Photo' });
    const p = createPerson(db, {}, { allowNameless: true });
    addMediaLink(db, { media_id: m.id, entity_type: 'person', entity_id: p.id });
    createMediaRegion(db, { media_id: m.id, person_id: p.id, x: 0.1, y: 0.1, width: 0.2, height: 0.2 });
    const results = await runAllChecks(db);
    expect(results.filter(r => r.code === 'MEDIA_REGION_OUT_OF_BOUNDS' && r.mediaIds?.includes(m.id))).toHaveLength(0);
  });
});

describe('PHOTO_AFTER_SUBJECT_DEATH', () => {
  it('fires when a tagged person died before the linked event date', async () => {
    const p = createPerson(db, { given_name: 'Anna', surname: 'Eriksson' });
    // Death 1900
    const death = createEvent(db, { event_type: 'death', date_type: 'exact', date_value: '1900-06-01' });
    addEventParticipant(db, { event_id: death.id, person_id: p.id, role: 'primary' });

    // Media linked to event in 1950
    const m = createMedia(db, { title: 'Family reunion' });
    const event = createEvent(db, { event_type: 'reunion', date_type: 'exact', date_value: '1950-07-01' });
    addMediaLink(db, { media_id: m.id, entity_type: 'event', entity_id: event.id });
    createMediaRegion(db, { media_id: m.id, person_id: p.id, x: 0.1, y: 0.1, width: 0.2, height: 0.2 });

    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'PHOTO_AFTER_SUBJECT_DEATH' && r.mediaIds?.includes(m.id));
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('warning');
    expect(hit[0].personIds).toContain(p.id);
  });

  it('does not fire when event date is before death', async () => {
    const p = createPerson(db, {}, { allowNameless: true });
    const death = createEvent(db, { event_type: 'death', date_type: 'exact', date_value: '1950-01-01' });
    addEventParticipant(db, { event_id: death.id, person_id: p.id, role: 'primary' });

    const m = createMedia(db, { title: 'Early photo' });
    const event = createEvent(db, { event_type: 'portrait', date_type: 'exact', date_value: '1940-01-01' });
    addMediaLink(db, { media_id: m.id, entity_type: 'event', entity_id: event.id });
    createMediaRegion(db, { media_id: m.id, person_id: p.id, x: 0.1, y: 0.1, width: 0.2, height: 0.2 });

    const results = await runAllChecks(db);
    expect(results.filter(r => r.code === 'PHOTO_AFTER_SUBJECT_DEATH')).toHaveLength(0);
  });

  it('does not fire for floating media without event links', async () => {
    const p = createPerson(db, {}, { allowNameless: true });
    const death = createEvent(db, { event_type: 'death', date_type: 'exact', date_value: '1900-01-01' });
    addEventParticipant(db, { event_id: death.id, person_id: p.id, role: 'primary' });

    const m = createMedia(db, { title: 'Floating photo' });
    addMediaLink(db, { media_id: m.id, entity_type: 'person', entity_id: p.id });
    createMediaRegion(db, { media_id: m.id, person_id: p.id, x: 0.1, y: 0.1, width: 0.2, height: 0.2 });

    const results = await runAllChecks(db);
    expect(results.filter(r => r.code === 'PHOTO_AFTER_SUBJECT_DEATH')).toHaveLength(0);
  });
});

describe('PHOTO_BEFORE_SUBJECT_BIRTH', () => {
  it('fires when a tagged person was born after the linked event date', async () => {
    const p = createPerson(db, {}, { allowNameless: true });
    const birth = createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: '1950-01-01' });
    addEventParticipant(db, { event_id: birth.id, person_id: p.id, role: 'primary' });

    const m = createMedia(db, { title: 'Old photo' });
    const event = createEvent(db, { event_type: 'portrait', date_type: 'exact', date_value: '1900-01-01' });
    addMediaLink(db, { media_id: m.id, entity_type: 'event', entity_id: event.id });
    createMediaRegion(db, { media_id: m.id, person_id: p.id, x: 0.1, y: 0.1, width: 0.2, height: 0.2 });

    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'PHOTO_BEFORE_SUBJECT_BIRTH' && r.mediaIds?.includes(m.id));
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('warning');
  });

  it('does not fire when event date is after birth', async () => {
    const p = createPerson(db, {}, { allowNameless: true });
    const birth = createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: '1950-01-01' });
    addEventParticipant(db, { event_id: birth.id, person_id: p.id, role: 'primary' });

    const m = createMedia(db, { title: 'Photo' });
    const event = createEvent(db, { event_type: 'portrait', date_type: 'exact', date_value: '1960-01-01' });
    addMediaLink(db, { media_id: m.id, entity_type: 'event', entity_id: event.id });
    createMediaRegion(db, { media_id: m.id, person_id: p.id, x: 0.1, y: 0.1, width: 0.2, height: 0.2 });

    const results = await runAllChecks(db);
    expect(results.filter(r => r.code === 'PHOTO_BEFORE_SUBJECT_BIRTH')).toHaveLength(0);
  });
});
