import { describe, it, expect, beforeEach } from 'vitest';
import { runAllChecks } from '../../src/api/checks';
import { queryRun } from '../../src/api/db';
import { createMedia, addMediaLink } from '../../src/api/media';
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
