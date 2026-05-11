import { describe, it, expect, beforeEach } from 'vitest';
import { runAllChecks } from '../../src/api/checks';
import { createSource, createCitation } from '../../src/api/sources';
import { createEvent } from '../../src/api/events';
import { createRepository, linkSourceRepository } from '../../src/api/repositories';
import { createTestDb } from './helpers';

let db: ReturnType<typeof createTestDb>;
beforeEach(async () => { db = await createTestDb(); });

describe('ORPHANED_SOURCE (relocated)', async () => {
  it('still fires for sources with no citations', async () => {
    const s = await createSource(db, { title: 'Lonely source' });
    const results = await runAllChecks(db);
    expect(results.filter(r => r.code === 'ORPHANED_SOURCE' && r.sourceIds?.includes(s.id))).toHaveLength(1);
  });

  it('does not fire when source has a citation', async () => {
    const s = await createSource(db, { title: 'Cited source' });
    const e = await createEvent(db, { event_type: 'birth' });
    await createCitation(db, { source_id: s.id, event_id: e.id });
    const results = await runAllChecks(db);
    expect(results.filter(r => r.code === 'ORPHANED_SOURCE' && r.sourceIds?.includes(s.id))).toHaveLength(0);
  });
});

describe('SOURCE_MISSING_TITLE', async () => {
  it('fires when title is empty string', async () => {
    const s = await createSource(db, { title: '' });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'SOURCE_MISSING_TITLE' && r.sourceIds?.includes(s.id));
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('warning');
  });

  it('does not fire when title has content', async () => {
    const s = await createSource(db, { title: 'Proper title' });
    const results = await runAllChecks(db);
    expect(results.filter(r => r.code === 'SOURCE_MISSING_TITLE' && r.sourceIds?.includes(s.id))).toHaveLength(0);
  });
});

describe('ORPHANED_REPOSITORY', async () => {
  it('fires for a repository that no source references', async () => {
    const r = await createRepository(db, { name: 'Tyst arkiv' });
    const results = await runAllChecks(db);
    const hit = results.filter(h => h.code === 'ORPHANED_REPOSITORY' && h.messageParams?.repositoryId === r.id);
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('notice');
  });

  it('does not fire when the repository is linked to a source', async () => {
    const repo = await createRepository(db, { name: 'Använt arkiv' });
    const src = await createSource(db, { title: 'Bok' });
    await linkSourceRepository(db, src.id, repo.id);
    const results = await runAllChecks(db);
    expect(results.filter(h => h.code === 'ORPHANED_REPOSITORY' && h.messageParams?.repositoryId === repo.id)).toHaveLength(0);
  });
});
