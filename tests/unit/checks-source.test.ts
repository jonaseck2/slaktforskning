import { describe, it, expect, beforeEach } from 'vitest';
import { runAllChecks } from '../../src/api/checks';
import { createSource, createCitation } from '../../src/api/sources';
import { createEvent } from '../../src/api/events';
import { createRepository, linkSourceRepository } from '../../src/api/repositories';
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

describe('SOURCE_MISSING_TITLE', () => {
  it('fires when title is empty string', () => {
    const s = createSource(db, { title: '' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'SOURCE_MISSING_TITLE' && r.sourceIds?.includes(s.id));
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('warning');
  });

  it('does not fire when title has content', () => {
    const s = createSource(db, { title: 'Proper title' });
    const results = runAllChecks(db);
    expect(results.filter(r => r.code === 'SOURCE_MISSING_TITLE' && r.sourceIds?.includes(s.id))).toHaveLength(0);
  });
});

describe('ORPHANED_REPOSITORY', () => {
  it('fires for a repository that no source references', () => {
    const r = createRepository(db, { name: 'Tyst arkiv' });
    const results = runAllChecks(db);
    const hit = results.filter(h => h.code === 'ORPHANED_REPOSITORY' && h.messageParams?.repositoryId === r.id);
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('notice');
  });

  it('does not fire when the repository is linked to a source', () => {
    const repo = createRepository(db, { name: 'Använt arkiv' });
    const src = createSource(db, { title: 'Bok' });
    linkSourceRepository(db, src.id, repo.id);
    const results = runAllChecks(db);
    expect(results.filter(h => h.code === 'ORPHANED_REPOSITORY' && h.messageParams?.repositoryId === repo.id)).toHaveLength(0);
  });
});
