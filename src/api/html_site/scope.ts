import type { Database } from 'node-sqlite3-wasm';
import { queryAll } from '../db';

export interface ScopeOptions {
  focusId?: string;
  ancestors?: number;
  descendants?: number;
  everyone?: boolean;
}

export function computeScope(db: Database, opts: ScopeOptions): Set<string> {
  if (opts.everyone) {
    const rows = queryAll<{ id: string }>(db, 'SELECT id FROM persons');
    return new Set(rows.map(r => r.id));
  }
  if (!opts.focusId) return new Set();

  const result = new Set<string>([opts.focusId]);
  const ancestors = opts.ancestors ?? 0;
  const descendants = opts.descendants ?? 0;

  let frontier = new Set<string>([opts.focusId]);
  for (let g = 0; g < ancestors; g++) {
    const next = new Set<string>();
    for (const id of frontier) {
      const parents = queryAll<{ person1_id: string }>(
        db,
        "SELECT person1_id FROM relationships WHERE type='parent_child' AND person2_id=?",
        [id]
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

  frontier = new Set<string>([opts.focusId]);
  for (let g = 0; g < descendants; g++) {
    const next = new Set<string>();
    for (const id of frontier) {
      const children = queryAll<{ person2_id: string }>(
        db,
        "SELECT person2_id FROM relationships WHERE type='parent_child' AND person1_id=?",
        [id]
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

  // Add spouses of everyone in scope
  const inScope = [...result];
  for (const id of inScope) {
    const couples = queryAll<{ person1_id: string; person2_id: string }>(
      db,
      "SELECT person1_id, person2_id FROM relationships WHERE type='couple' AND (person1_id=? OR person2_id=?)",
      [id, id]
    );
    for (const c of couples) {
      if (c.person1_id && c.person1_id !== id) result.add(c.person1_id);
      if (c.person2_id && c.person2_id !== id) result.add(c.person2_id);
    }
  }

  return result;
}
