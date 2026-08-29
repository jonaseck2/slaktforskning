import type { Database } from 'node-sqlite3-wasm';
import { undoManager } from '../undo';
import type { DuplicateCluster } from './clusters';
// Persons' ignore function is named `ignoreDuplicate` without the entity
// suffix — the odd one out of the four. Aliased here rather than renamed,
// because renaming reaches every existing caller for no behavioural gain.
import { mergePersons, ignoreDuplicate as ignoreDuplicatePerson } from './persons';
import { mergePlaces, ignoreDuplicatePlace } from './places';
import { mergeSources, ignoreDuplicateSource } from './sources';
import { mergeMedia, ignoreDuplicateMedia } from './media';

/**
 * Turning a reviewed cluster into a database change.
 *
 * Every merge* function already pushes its own undo action. Wrapping the loop in
 * beginGroup/endGroup is what makes approving a 129-member cluster ONE undo
 * step: without it a mistaken approval takes 128 undos to reverse, which is not
 * a way back a researcher would find.
 *
 * Nothing here runs without an explicit approval — the product principle is
 * "the user does the work; tools surface possibilities, never commit".
 */

export interface ApplyClusterOptions {
  /**
   * Required for a media cluster. `mergeMedia` deletes the redundant file from
   * disk and cannot resolve a relative `file_ref` without the database's path.
   */
  dbPath?: string;
  /** Which file survives a media merge. Defaults to the representative's. */
  keepFile?: 'target' | 'source';
}

function assertRepresentative(cluster: DuplicateCluster): void {
  if (!cluster.memberIds.includes(cluster.representativeId)) {
    throw new Error(
      `Cluster representative ${cluster.representativeId} is not one of its members`,
    );
  }
}

async function mergeOne(
  db: Database,
  cluster: DuplicateCluster,
  memberId: string,
  opts: ApplyClusterOptions,
): Promise<void> {
  const targetId = cluster.representativeId;
  switch (cluster.entityType) {
    case 'person': await mergePersons(db, targetId, memberId); return;
    case 'place':  await mergePlaces(db, targetId, memberId); return;
    case 'source': await mergeSources(db, targetId, memberId); return;
    case 'media': {
      if (!opts.dbPath) {
        throw new Error(
          'applyCluster: a media cluster needs opts.dbPath — mergeMedia deletes ' +
          'the redundant file from disk and cannot resolve a relative file_ref without it',
        );
      }
      await mergeMedia(db, targetId, memberId, opts.keepFile ?? 'target', { dbPath: opts.dbPath });
      return;
    }
  }
}

export async function applyCluster(
  db: Database,
  cluster: DuplicateCluster,
  opts: ApplyClusterOptions = {},
): Promise<{ merged: number }> {
  assertRepresentative(cluster);
  const others = cluster.memberIds.filter(id => id !== cluster.representativeId);
  if (others.length === 0) return { merged: 0 };

  // A dotted i18n key, matching the sole precedent in this folder
  // (sources.ts pushes label: 'undo.mergeSources'). Prose here would reach an
  // English user in Swedish.
  undoManager.beginGroup('undo.applyDuplicateCluster');
  try {
    for (const memberId of others) {
      await mergeOne(db, cluster, memberId, opts);
    }
  } finally {
    undoManager.endGroup();
  }
  return { merged: others.length };
}

async function ignoreOne(
  db: Database,
  entityType: DuplicateCluster['entityType'],
  aId: string,
  bId: string,
): Promise<void> {
  switch (entityType) {
    case 'person': await ignoreDuplicatePerson(db, aId, bId); return;
    case 'place':  await ignoreDuplicatePlace(db, aId, bId); return;
    case 'source': await ignoreDuplicateSource(db, aId, bId); return;
    case 'media':  await ignoreDuplicateMedia(db, aId, bId); return;
  }
}

/**
 * Record a "no" that sticks.
 *
 * `ignored_duplicates` stores pairs, so a cluster is recorded as N-1 pairs
 * against the representative rather than every combination: a 129-member
 * cluster costs 128 rows instead of 8256. The cost is that a decline is
 * relative to the representative — see the scope deviation in the plan.
 */
export async function declineCluster(
  db: Database,
  cluster: DuplicateCluster,
): Promise<{ ignored: number }> {
  assertRepresentative(cluster);
  const others = cluster.memberIds.filter(id => id !== cluster.representativeId);
  for (const memberId of others) {
    await ignoreOne(db, cluster.entityType, cluster.representativeId, memberId);
  }
  return { ignored: others.length };
}
