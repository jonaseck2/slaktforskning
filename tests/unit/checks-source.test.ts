import { describe, it, expect, beforeEach } from 'vitest';
import { runAllChecks } from '../../src/api/checks';
import { createSource, createCitation } from '../../src/api/sources';
import { createEvent } from '../../src/api/events';
import { createTestDb } from './helpers';

let db: ReturnType<typeof createTestDb>;
beforeEach(() => { db = createTestDb(); });

describe('ORPHANED_SOURCE (relocated)', () => {
  it('still fires for sources with no citations', () => {
    const s = createSource(db, { title: 'Lonely source' });
    const results = runAllChecks(db);
    expect(results.filter(r => r.code === 'ORPHANED_SOURCE' && r.sourceIds?.includes(s.id))).toHaveLength(1);
  });

  it('does not fire when source has a citation', () => {
    const s = createSource(db, { title: 'Cited source' });
    const e = createEvent(db, { event_type: 'birth' });
    createCitation(db, { source_id: s.id, event_id: e.id });
    const results = runAllChecks(db);
    expect(results.filter(r => r.code === 'ORPHANED_SOURCE' && r.sourceIds?.includes(s.id))).toHaveLength(0);
  });
});
