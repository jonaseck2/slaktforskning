import type { Database } from 'node-sqlite3-wasm';
import { queryAll } from '../db';

/**
 * Duplicate detection that groups, rather than pairing.
 *
 * The existing scorers return pairs, which cannot express "these 129 rows are
 * one volume": 129 copies of 'Sveriges befolkning 1985' is 8256 pairs from one
 * title, and no researcher works through 8256 rows. A cluster is one decision.
 */

export interface DuplicateCluster {
  entityType: 'person' | 'place' | 'source' | 'media';
  /** Representative first, then the rest in stable order. */
  memberIds: string[];
  representativeId: string;
  /** Shown to the user — why these were grouped. */
  reason: string;
  kind: 'exact' | 'fuzzy';
}

interface IdentRow {
  entity_id: string;
  system: string;
  value: string;
  created_at: string;
}

interface KeyGroup {
  system: string;
  value: string;
  memberIds: string[];
  seen: Set<string>;
}

/**
 * Key for one (system, value) pair.
 *
 * Length-prefixed rather than joined by a separator character, because no
 * character is safe to join on: `system` and `value` both come from the
 * imported file, and `('x', 'y z')` joined with a space is indistinguishable
 * from `('x y', 'z')`. Prefixing the system's length makes the key injective
 * for every input the file can carry.
 */
function identityKey(system: string, value: string): string {
  return `${system.length}:${system}:${value}`;
}

/**
 * Clusters built from identifiers the source file stated. Zero judgement: two
 * rows carrying the same (system, value) are the same thing by the exporter's
 * own account.
 *
 * One query for the whole entity type — `.claude/rules/performance.md`. The
 * `(system, value)` index makes the ORDER BY a scan of the index rather than a
 * sort of the table.
 */
export async function findExactClusters(
  db: Database,
  entityType: DuplicateCluster['entityType'],
): Promise<DuplicateCluster[]> {
  const rows = await queryAll<IdentRow>(
    db,
    `SELECT entity_id, system, value, created_at
       FROM external_identifiers
      WHERE entity_type = ?
      ORDER BY system, value, created_at, entity_id`,
    [entityType],
  );

  const byKey = new Map<string, KeyGroup>();
  for (const row of rows) {
    const key = identityKey(row.system, row.value);
    let group = byKey.get(key);
    if (!group) {
      group = { system: row.system, value: row.value, memberIds: [], seen: new Set<string>() };
      byKey.set(key, group);
    }
    // Distinct entities only — one entity may carry the same id twice.
    if (group.seen.has(row.entity_id)) continue;
    group.seen.add(row.entity_id);
    group.memberIds.push(row.entity_id);
  }

  const clusters: DuplicateCluster[] = [];
  for (const group of byKey.values()) {
    if (group.memberIds.length < 2) continue;
    clusters.push({
      entityType,
      memberIds: group.memberIds,
      // Earliest created_at wins, so the representative is stable across runs
      // and a re-run after a partial approval does not reshuffle the list.
      representativeId: group.memberIds[0],
      reason: `${group.system} ${group.value}`,
      kind: 'exact',
    });
  }
  return clusters;
}

export interface ScoredPair {
  aId: string;
  bId: string;
  score: number;
  reason?: string;
}

/**
 * Connected components over a pair list.
 *
 * The existing scorers answer "do these two look alike". Three pairs (A,B),
 * (B,C), (A,C) describe one group of three, and presenting them as three rows
 * asks the researcher the same question three times.
 *
 * Union-find with path compression. Pure: the caller supplies the pairs, so
 * this is testable without a database and reusable by every entity type.
 */
export function clusterFromPairs(
  entityType: DuplicateCluster['entityType'],
  pairs: ScoredPair[],
): DuplicateCluster[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = parent.get(x) ?? x;
    if (root !== x) {
      root = find(root);
      parent.set(x, root);
    }
    return root;
  };
  const union = (a: string, b: string): void => {
    const ra = find(a), rb = find(b);
    if (ra === rb) return;
    // Lexicographic root keeps the outcome independent of pair order.
    if (ra < rb) parent.set(rb, ra);
    else parent.set(ra, rb);
  };

  for (const p of pairs) {
    if (p.aId === p.bId) continue;
    if (!parent.has(p.aId)) parent.set(p.aId, p.aId);
    if (!parent.has(p.bId)) parent.set(p.bId, p.bId);
    union(p.aId, p.bId);
  }

  const groups = new Map<string, Set<string>>();
  for (const id of [...parent.keys()]) {
    const root = find(id);
    const set = groups.get(root) ?? new Set<string>();
    set.add(id);
    groups.set(root, set);
  }

  const bestScore = new Map<string, number>();
  for (const p of pairs) {
    if (p.aId === p.bId) continue;
    const root = find(p.aId);
    bestScore.set(root, Math.max(bestScore.get(root) ?? 0, p.score));
  }

  const clusters: DuplicateCluster[] = [];
  for (const [root, set] of groups) {
    if (set.size < 2) continue;
    const memberIds = [...set].sort();
    clusters.push({
      entityType,
      memberIds,
      representativeId: memberIds[0],
      // A machine key, not prose — matching the `reasons` convention in
      // sources.ts ('same_normalized_title', 'levenshtein_2'). The renderer
      // localises it; a Swedish string written here would reach an English
      // user untranslated.
      reason: `similarity_${bestScore.get(root) ?? 0}`,
      kind: 'fuzzy',
    });
  }
  return clusters.sort((a, b) => a.representativeId.localeCompare(b.representativeId));
}
