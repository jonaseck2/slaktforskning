import type { Database } from 'node-sqlite3-wasm';
import { queryAll } from '../db';

export interface ScopeOptions {
  focusId?: string;
  ancestors?: number;
  descendants?: number;
  everyone?: boolean;
}

// SQLite default builds cap the IN-list at SQLITE_MAX_VARIABLE_NUMBER (999 on
// older builds, 32766 on modern ones). The website-preview scope is always a
// small focal + N generations frontier (2^N growth), so for sane ancestors /
// descendants counts the frontier never approaches the cap. We still keep a
// conservative split point so a future "ancestors: 20" doesn't blow up.
const ID_BATCH = 800;

function* batched<T>(xs: T[], size: number): Generator<T[]> {
  for (let i = 0; i < xs.length; i += size) yield xs.slice(i, i + size);
}

export async function computeScope(db: Database, opts: ScopeOptions): Promise<Set<string>> {
  if (opts.everyone) {
    const rows = await queryAll<{ id: string }>(db, 'SELECT id FROM persons');
    return new Set(rows.map(r => r.id));
  }
  if (!opts.focusId) return new Set();

  const result = new Set<string>([opts.focusId]);
  const ancestors = opts.ancestors ?? 0;
  const descendants = opts.descendants ?? 0;

  // Ancestor frontier: each generation, fetch parents for the WHOLE frontier
  // in one batched query (one query per generation, not one per frontier person).
  let frontier = new Set<string>([opts.focusId]);
  for (let g = 0; g < ancestors; g++) {
    const next = new Set<string>();
    for (const idChunk of batched([...frontier], ID_BATCH)) {
      const placeholders = idChunk.map(() => '?').join(',');
      const parents = await queryAll<{ person1_id: string; person2_id: string }>(
        db,
        `SELECT person1_id, person2_id FROM relationships
         WHERE type='parent_child' AND person2_id IN (${placeholders})`,
        idChunk,
      );
      for (const p of parents) {
        if (p.person1_id && !result.has(p.person1_id)) {
          result.add(p.person1_id);
          next.add(p.person1_id);
        }
      }
    }
    frontier = next;
    if (frontier.size === 0) break;
  }

  // Descendant frontier: same shape, but walk parent → child edges.
  frontier = new Set<string>([opts.focusId]);
  for (let g = 0; g < descendants; g++) {
    const next = new Set<string>();
    for (const idChunk of batched([...frontier], ID_BATCH)) {
      const placeholders = idChunk.map(() => '?').join(',');
      const children = await queryAll<{ person1_id: string; person2_id: string }>(
        db,
        `SELECT person1_id, person2_id FROM relationships
         WHERE type='parent_child' AND person1_id IN (${placeholders})`,
        idChunk,
      );
      for (const c of children) {
        if (c.person2_id && !result.has(c.person2_id)) {
          result.add(c.person2_id);
          next.add(c.person2_id);
        }
      }
    }
    frontier = next;
    if (frontier.size === 0) break;
  }

  // Spouses: one batched query for the WHOLE final in-scope set, joining
  // either side of the couple relationship. Previously this fired one query
  // per in-scope person — N queries on a result of size N is N+1 squared.
  const inScopeIds = [...result];
  for (const idChunk of batched(inScopeIds, ID_BATCH)) {
    const placeholders = idChunk.map(() => '?').join(',');
    const couples = await queryAll<{ person1_id: string; person2_id: string }>(
      db,
      `SELECT person1_id, person2_id FROM relationships
       WHERE type='couple' AND (person1_id IN (${placeholders}) OR person2_id IN (${placeholders}))`,
      [...idChunk, ...idChunk],
    );
    for (const c of couples) {
      if (c.person1_id) result.add(c.person1_id);
      if (c.person2_id) result.add(c.person2_id);
    }
  }

  return result;
}
