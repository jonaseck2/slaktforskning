// Turning a reviewed cluster into a database change — and recording a "no"
// that sticks. See docs/plans/2026-08-23-multi-file-import-consolidation.md.

import { describe, it, expect, beforeEach } from 'vitest';
import { applyCluster, declineCluster } from '../../src/api/duplicates/consolidate';
import { findExactClusters } from '../../src/api/duplicates/clusters';
import { findDuplicateSources } from '../../src/api/duplicates/sources';
import { bulkAddExternalIdentifiers } from '../../src/api/external_identifiers';
import { createSource, createCitation } from '../../src/api/sources';
import { queryAll } from '../../src/api/db';
import { undoManager } from '../../src/api/undo';
import { createTestDb } from './helpers';

let db: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => {
  db = await createTestDb();
  // The undo manager is a module singleton — a leftover stack from a previous
  // test would make "one undo step" unfalsifiable.
  undoManager.clear();
});

async function seedThreeSharingAnAid(): Promise<void> {
  for (const t of ['Valbo p52', 'Valbo p88', 'Valbo p91']) {
    const s = await createSource(db, { title: t });
    await createCitation(db, { source_id: s.id, page: t });
    await bulkAddExternalIdentifiers(db, [
      { entity_type: 'source', entity_id: s.id, system: 'arkivdigital', value: 'v191316' },
    ]);
  }
}

const count = async (sql: string): Promise<number> =>
  (await queryAll<{ c: number }>(db, sql))[0].c;

describe('applyCluster', () => {
  it('merges every member into the representative', async () => {
    await seedThreeSharingAnAid();
    const [cluster] = await findExactClusters(db, 'source');
    const { merged } = await applyCluster(db, cluster);
    expect(merged).toBe(2);
    expect(await count('SELECT COUNT(*) c FROM sources')).toBe(1);
  });

  it('keeps the representative, not some other member', async () => {
    await seedThreeSharingAnAid();
    const [cluster] = await findExactClusters(db, 'source');
    await applyCluster(db, cluster);
    const rows = await queryAll<{ id: string }>(db, 'SELECT id FROM sources');
    expect(rows.map(r => r.id)).toEqual([cluster.representativeId]);
  });

  it('leaves no citation pointing at a source that no longer exists', async () => {
    await seedThreeSharingAnAid();
    const [cluster] = await findExactClusters(db, 'source');
    await applyCluster(db, cluster);
    expect(await count(
      'SELECT COUNT(*) c FROM citations WHERE source_id NOT IN (SELECT id FROM sources)'
    )).toBe(0);
    expect(await count('SELECT COUNT(*) c FROM citations')).toBe(3);
  });

  it('is one undo step, not one per member', async () => {
    await seedThreeSharingAnAid();
    const [cluster] = await findExactClusters(db, 'source');
    await applyCluster(db, cluster);
    await undoManager.undo();
    expect(await count('SELECT COUNT(*) c FROM sources')).toBe(3);
    expect(await count('SELECT COUNT(*) c FROM citations')).toBe(3);
  });

  it('refuses a cluster whose representative is not a member', async () => {
    await seedThreeSharingAnAid();
    const [cluster] = await findExactClusters(db, 'source');
    await expect(applyCluster(db, { ...cluster, representativeId: 'nope' }))
      .rejects.toThrow(/representative/i);
  });

  it('does nothing for a cluster of one', async () => {
    await seedThreeSharingAnAid();
    const [cluster] = await findExactClusters(db, 'source');
    const one = { ...cluster, memberIds: [cluster.representativeId] };
    expect(await applyCluster(db, one)).toEqual({ merged: 0 });
    expect(await count('SELECT COUNT(*) c FROM sources')).toBe(3);
  });

  it('refuses a media cluster with no dbPath rather than guessing at a file path', async () => {
    // mergeMedia deletes the redundant file from disk; it cannot resolve a
    // relative file_ref without the database's own path.
    await expect(applyCluster(db, {
      entityType: 'media', memberIds: ['a', 'b'], representativeId: 'a',
      reason: 'test', kind: 'exact',
    })).rejects.toThrow(/dbPath/);
  });
});

describe('declineCluster', () => {
  it('records N-1 ignored pairs against the representative, not every combination', async () => {
    await seedThreeSharingAnAid();
    const [cluster] = await findExactClusters(db, 'source');
    const { ignored } = await declineCluster(db, cluster);
    expect(ignored).toBe(2);
    expect(await count("SELECT COUNT(*) c FROM ignored_duplicates WHERE entity_type = 'source'")).toBe(2);
  });

  it('leaves every member in place — a decline merges nothing', async () => {
    await seedThreeSharingAnAid();
    const [cluster] = await findExactClusters(db, 'source');
    await declineCluster(db, cluster);
    expect(await count('SELECT COUNT(*) c FROM sources')).toBe(3);
  });

  it('keeps the fuzzy finder from offering the pair again', async () => {
    const a = await createSource(db, { title: 'Adolf Fredrik C:I:6, 1798-1812' });
    const b = await createSource(db, { title: 'Adolf Fredrik C:I:6, 1798–1812' });
    const before = await findDuplicateSources(db);
    expect(before.length).toBeGreaterThan(0);
    const members = [a.id, b.id].sort();
    await declineCluster(db, {
      entityType: 'source', memberIds: members,
      representativeId: members[0], reason: 'test', kind: 'fuzzy',
    });
    expect(await findDuplicateSources(db)).toEqual([]);
  });

  it('is idempotent', async () => {
    await seedThreeSharingAnAid();
    const [cluster] = await findExactClusters(db, 'source');
    await declineCluster(db, cluster);
    await declineCluster(db, cluster);
    expect(await count("SELECT COUNT(*) c FROM ignored_duplicates WHERE entity_type = 'source'")).toBe(2);
  });

  it('refuses a cluster whose representative is not a member', async () => {
    await seedThreeSharingAnAid();
    const [cluster] = await findExactClusters(db, 'source');
    await expect(declineCluster(db, { ...cluster, representativeId: 'nope' }))
      .rejects.toThrow(/representative/i);
  });
});
