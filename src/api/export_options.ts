import type { Database } from 'node-sqlite3-wasm';
import type { Person } from './types';
import { queryAll } from './db';
import { livingSqlExpr } from './personLiving';

export interface ExportOptions {
  excludeLiving: boolean;
  includeMedia: boolean;
  includeNotes: boolean;
  includeSources: boolean;
  branchFilter?: {
    personId: string;
    direction: 'ancestors' | 'descendants' | 'both';
    generations?: number;
  };
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  excludeLiving: false,
  includeMedia: true,
  includeNotes: true,
  includeSources: true,
};

/**
 * Returns a Set of person IDs reachable from `personId` via parent_child
 * relationships in the given direction, up to `generations` deep.
 *
 * 'ancestors': person1 is parent, person2 is child — follow parent pointers upward.
 * 'descendants': follow child pointers downward.
 * 'both': union of ancestors and descendants.
 *
 * Also includes spouses (couple relationships) of every person found,
 * so that family units remain complete.
 */
export async function getPersonIdsInBranch(
  db: Database,
  personId: string,
  direction: 'ancestors' | 'descendants' | 'both',
  generations?: number,
): Promise<Set<string>> {
  if (direction === 'both') {
    const ancestors = await getPersonIdsInBranch(db, personId, 'ancestors', generations);
    const descendants = await getPersonIdsInBranch(db, personId, 'descendants', generations);
    return new Set([...ancestors, ...descendants]);
  }

  const result = new Set<string>();
  result.add(personId);

  // BFS traversal
  let frontier = [personId];
  let depth = 0;
  const maxDepth = generations ?? Infinity;

  while (frontier.length > 0 && depth < maxDepth) {
    const nextFrontier: string[] = [];
    for (const currentId of frontier) {
      let rows: { person1_id: string | null; person2_id: string | null }[];
      if (direction === 'ancestors') {
        // person2 is the child, person1 is the parent
        rows = await queryAll<{ person1_id: string | null; person2_id: string | null }>(
          db,
          `SELECT person1_id, person2_id FROM relationships WHERE type = 'parent_child' AND person2_id = ?`,
          [currentId],
        );
        for (const row of rows) {
          if (row.person1_id && !result.has(row.person1_id)) {
            result.add(row.person1_id);
            nextFrontier.push(row.person1_id);
          }
        }
      } else {
        // direction === 'descendants': person1 is the parent, person2 is the child
        rows = await queryAll<{ person1_id: string | null; person2_id: string | null }>(
          db,
          `SELECT person1_id, person2_id FROM relationships WHERE type = 'parent_child' AND person1_id = ?`,
          [currentId],
        );
        for (const row of rows) {
          if (row.person2_id && !result.has(row.person2_id)) {
            result.add(row.person2_id);
            nextFrontier.push(row.person2_id);
          }
        }
      }
    }
    frontier = nextFrontier;
    depth++;
  }

  // Include spouses of every person found
  const personIds = [...result];
  for (const pid of personIds) {
    const couples = await queryAll<{ person1_id: string | null; person2_id: string | null }>(
      db,
      `SELECT person1_id, person2_id FROM relationships WHERE type = 'couple' AND (person1_id = ? OR person2_id = ?)`,
      [pid, pid],
    );
    for (const c of couples) {
      if (c.person1_id) result.add(c.person1_id);
      if (c.person2_id) result.add(c.person2_id);
    }
  }

  return result;
}

/**
 * Filter a list of persons based on export options (living filter only).
 */
export function filterPersonsByOptions(
  db: Database,
  persons: (Person & { given_name?: string; surname?: string })[],
  options: ExportOptions,
): (Person & { given_name?: string; surname?: string })[] {
  if (!options.excludeLiving) return persons;
  return persons.filter(p => !p.living);
}

/**
 * Apply all export options and return a filtered dataset descriptor.
 * The returned personIds set determines which persons are included.
 */
export async function applyExportOptions(
  db: Database,
  options: ExportOptions,
): Promise<{ personIds: Set<string> | null; includeMedia: boolean; includeNotes: boolean; includeSources: boolean }> {
  let personIds: Set<string> | null = null;

  // Branch filter first (if specified)
  if (options.branchFilter) {
    personIds = await getPersonIdsInBranch(
      db,
      options.branchFilter.personId,
      options.branchFilter.direction,
      options.branchFilter.generations,
    );
  }

  // Living filter
  if (options.excludeLiving) {
    const livingIds = await queryAll<{ id: string }>(
      db,
      `SELECT p.id AS id FROM persons p WHERE ${livingSqlExpr('p')} = 1`,
    );
    const livingSet = new Set(livingIds.map(r => r.id));

    if (personIds) {
      for (const id of livingSet) {
        personIds.delete(id);
      }
    } else {
      // Get all person IDs and exclude living
      const allIds = await queryAll<{ id: string }>(db, `SELECT id FROM persons`);
      personIds = new Set(allIds.map(r => r.id));
      for (const id of livingSet) {
        personIds.delete(id);
      }
    }
  }

  return {
    personIds,
    includeMedia: options.includeMedia,
    includeNotes: options.includeNotes,
    includeSources: options.includeSources,
  };
}
