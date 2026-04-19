import { describe, it, expect, beforeEach } from 'vitest';
import { runAllChecks } from '../../src/api/checks';
import { queryRun } from '../../src/api/db';
import { createMedia, addMediaLink } from '../../src/api/media';
import { createMediaRegion } from '../../src/api/media_regions';
import { createPerson } from '../../src/api/persons';
import { createTestDb } from './helpers';

let db: ReturnType<typeof createTestDb>;
beforeEach(() => { db = createTestDb(); });

describe('MEDIA_FILE_MISSING (relocated)', () => {
  it('still fires when is_missing flag is 1', () => {
    const m = createMedia(db, { title: 'Missing photo', file_ref: '/absent.jpg' });
    queryRun(db, 'UPDATE media SET is_missing = 1 WHERE id = ?', [m.id]);
    // Link it so it isn't flagged as orphaned by future ORPHANED_MEDIA check
    const p = createPerson(db, {});
    addMediaLink(db, { media_id: m.id, entity_type: 'person', entity_id: p.id });
    const results = runAllChecks(db);
    expect(results.filter(r => r.code === 'MEDIA_FILE_MISSING' && r.mediaIds?.includes(m.id))).toHaveLength(1);
  });
});

describe('ORPHANED_MEDIA', () => {
  it('fires for media with no links', () => {
    const m = createMedia(db, { title: 'Lonely photo' });
    const results = runAllChecks(db);
    expect(results.filter(r => r.code === 'ORPHANED_MEDIA' && r.mediaIds?.includes(m.id))).toHaveLength(1);
  });

  it('does not fire for media linked to a person', () => {
    const m = createMedia(db, { title: 'Linked photo' });
    const p = createPerson(db, {});
    addMediaLink(db, { media_id: m.id, entity_type: 'person', entity_id: p.id });
    const results = runAllChecks(db);
    expect(results.filter(r => r.code === 'ORPHANED_MEDIA' && r.mediaIds?.includes(m.id))).toHaveLength(0);
  });
});

describe('MEDIA_REGION_OUT_OF_BOUNDS', () => {
  it('fires when a region extends past the right edge', () => {
    const m = createMedia(db, { title: 'Photo' });
    const p = createPerson(db, {});
    addMediaLink(db, { media_id: m.id, entity_type: 'person', entity_id: p.id });
    const region = createMediaRegion(db, { media_id: m.id, person_id: p.id, x: 0.8, y: 0.1, width: 0.5, height: 0.2 });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'MEDIA_REGION_OUT_OF_BOUNDS' && r.mediaIds?.includes(m.id));
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('warning');
    // sanity: region id is referenced so future UI can navigate
    void region;
  });

  it('does not fire for a region fully inside the unit square', () => {
    const m = createMedia(db, { title: 'Photo' });
    const p = createPerson(db, {});
    addMediaLink(db, { media_id: m.id, entity_type: 'person', entity_id: p.id });
    createMediaRegion(db, { media_id: m.id, person_id: p.id, x: 0.1, y: 0.1, width: 0.2, height: 0.2 });
    const results = runAllChecks(db);
    expect(results.filter(r => r.code === 'MEDIA_REGION_OUT_OF_BOUNDS' && r.mediaIds?.includes(m.id))).toHaveLength(0);
  });
});
