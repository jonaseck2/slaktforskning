import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers';
import { createPerson } from '../../src/api/persons';
import { createRelationship, addEventParticipant } from '../../src/api/relationships';
import { createEvent } from '../../src/api/events';
import { buildSnapshot } from '../../src/api/html_site/snapshot';

let db: any;
beforeEach(() => { db = createTestDb(); });

describe('buildSnapshot', () => {
  it('produces all top-level keys', () => {
    const p = createPerson(db, { given_name: 'A' });
    const snap = buildSnapshot(db, {
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

  it('drops persons outside scope and their relationships', () => {
    const focus = createPerson(db, { given_name: 'F' });
    const stranger = createPerson(db, { given_name: 'S' });
    createRelationship(db, { type: 'parent_child', person1_id: stranger.id, person2_id: focus.id });
    const snap = buildSnapshot(db, {
      siteTitle: 'Test',
      focusPersonId: focus.id,
      scope: { focusId: focus.id, ancestors: 0, descendants: 0 },
      options: { includeMedia: false, includeReports: false, includePrints: false, excludeLiving: false, redactLiving: false, mediaPersonOnly: false },
    });
    expect(snap.persons.map((p: any) => p.id)).toEqual([focus.id]);
    expect(snap.relationships.length).toBe(0);
  });

  it('excludes living persons when excludeLiving=true', () => {
    // living is now derived: presence of a death event marks deceased
    const dead = createPerson(db, { given_name: 'D' });
    const death = createEvent(db, { event_type: 'death', date_value: '1900-01-01', date_original: '1900' });
    addEventParticipant(db, { event_id: death.id, person_id: dead.id });
    const _alive = createPerson(db, { given_name: 'A' });
    const snap = buildSnapshot(db, {
      siteTitle: 'T',
      focusPersonId: dead.id,
      scope: { everyone: true },
      options: { includeMedia: false, includeReports: false, includePrints: false, excludeLiving: true, redactLiving: false, mediaPersonOnly: false },
    });
    expect(snap.persons.map((p: any) => p.id)).toEqual([dead.id]);
  });

  it('redacts living persons when redactLiving=true', () => {
    const focus = createPerson(db, { given_name: 'F', notes: 'secret' });
    const snap = buildSnapshot(db, {
      siteTitle: 'T',
      focusPersonId: focus.id,
      scope: { everyone: true },
      options: { includeMedia: false, includeReports: false, includePrints: false, excludeLiving: false, redactLiving: true, mediaPersonOnly: false },
    });
    expect(snap.persons[0].notes).toBe('');
    expect(snap.persons[0].redacted).toBe(true);
  });
});
