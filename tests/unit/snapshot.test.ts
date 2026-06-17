import { describe, it, expect, beforeEach } from 'vitest';
import { createPerson } from '../../src/api/persons';
import { createRelationship, addEventParticipant } from '../../src/api/relationships';
import { createEvent } from '../../src/api/events';
import { buildSnapshot } from '../../src/api/html_site/snapshot';
import { createTestDb } from './helpers';

let db: any;
beforeEach(async () => { db = await createTestDb(); });

describe('buildSnapshot', async () => {
  it('produces all top-level keys', async () => {
    const p = await createPerson(db, { given_name: 'A' });
    const snap = await buildSnapshot(db, {
      siteTitle: 'Test',
      focusPersonId: p.id,
      scope: { everyone: true },
      options: { includeMedia: false, includeReports: false, includePrints: false, excludeLiving: false, redactLiving: true, mediaPersonOnly: false },
    });
    expect(Object.keys(snap)).toEqual(expect.arrayContaining([
      'meta', 'persons', 'personNames', 'personIds', 'relationships',
      'events', 'eventParticipants', 'places', 'sources', 'citations',
      'media', 'mediaLinks', 'mediaRegions', 'settings',
    ]));
    expect(snap.persons.length).toBe(1);
    expect(snap.meta.focusPersonId).toBe(p.id);
  });

  it('drops persons outside scope and their relationships', async () => {
    const focus = await createPerson(db, { given_name: 'F' });
    const stranger = await createPerson(db, { given_name: 'S' });
    await createRelationship(db, { type: 'parent_child', person1_id: stranger.id, person2_id: focus.id });
    const snap = await buildSnapshot(db, {
      siteTitle: 'Test',
      focusPersonId: focus.id,
      scope: { focusId: focus.id, ancestors: 0, descendants: 0 },
      options: { includeMedia: false, includeReports: false, includePrints: false, excludeLiving: false, redactLiving: false, mediaPersonOnly: false },
    });
    expect(snap.persons.map((p: any) => p.id)).toEqual([focus.id]);
    expect(snap.relationships.length).toBe(0);
  });

  it('excludes living persons when excludeLiving=true', async () => {
    // living is now derived: presence of a death event marks deceased
    const dead = await createPerson(db, { given_name: 'D' });
    const death = await createEvent(db, { event_type: 'death', date_value: '1900-01-01', date_original: '1900' });
    await addEventParticipant(db, { event_id: death.id, person_id: dead.id });
    const _alive = await createPerson(db, { given_name: 'A' });
    const snap = await buildSnapshot(db, {
      siteTitle: 'T',
      focusPersonId: dead.id,
      scope: { everyone: true },
      options: { includeMedia: false, includeReports: false, includePrints: false, excludeLiving: true, redactLiving: false, mediaPersonOnly: false },
    });
    expect(snap.persons.map((p: any) => p.id)).toEqual([dead.id]);
  });

  it('redacts living persons when redactLiving=true', async () => {
    const focus = await createPerson(db, { given_name: 'F', notes: 'secret' });
    const snap = await buildSnapshot(db, {
      siteTitle: 'T',
      focusPersonId: focus.id,
      scope: { everyone: true },
      options: { includeMedia: false, includeReports: false, includePrints: false, excludeLiving: false, redactLiving: true, mediaPersonOnly: false },
    });
    expect(snap.persons[0].notes).toBe('');
    expect(snap.persons[0].redacted).toBe(true);
  });

  it('fires onProgress with at least one phase message during a build', async () => {
    const p = await createPerson(db, { given_name: 'Prog' });
    const messages: string[] = [];
    const snap = await buildSnapshot(db, {
      siteTitle: 'T',
      focusPersonId: p.id,
      scope: { everyone: true },
      options: { includeMedia: true, includeReports: false, includePrints: false, excludeLiving: false, redactLiving: false, mediaPersonOnly: false },
    }, (msg) => messages.push(msg));
    expect(snap.persons.length).toBe(1);
    expect(messages.length).toBeGreaterThan(0);
    expect(messages.every(m => typeof m === 'string' && m.length > 0)).toBe(true);
  });
});
