import { Database } from 'node-sqlite3-wasm';
import { Place } from './types';
import { queryAll, runBatch } from './db';

/**
 * Bulk resolution of ordered place chains into a real `places` tree.
 *
 * Where `bulkResolvePlaces` takes flat display strings, this takes the chain a
 * source format states explicitly — ArkivDigital's `_ADPL` block, Gramps's
 * nested `<placeobj>` refs — and materialises one row per level with
 * `parent_place_id` chained root to leaf.
 *
 * **Performance contract** (`.claude/rules/performance.md`): resolution is one
 * round per depth, not one query per chain. Four levels of Swedish
 * administrative hierarchy cost four SELECT rounds plus four INSERT rounds
 * whether the input is ten chains or ten thousand.
 *
 * **Identity at a level is `(parent_place_id, normalized_name)`, split by
 * `externalId` only on a genuine collision.** Measured on the four real
 * ArkivDigital exports: 335 distinct `_PARISH_AID` for 333 distinct parish
 * names, and both collisions — 'Viby' (Örebro / Östergötland) and 'Halmstad'
 * (Halland / Malmöhus) — sit in different counties, so the parent term alone
 * separates them there. The id term is defensive: a same-name-same-county pair
 * is possible in Sweden, and merging two real parishes into one row is not
 * something the user can undo.
 */

export interface HierarchyLevel {
  name: string;
  type: string | null;
  /** Source-format id for this level, e.g. an ArkivDigital `_PARISH_AID`. */
  externalId?: string;
}

export interface ResolvedChain {
  /** The innermost place of the chain — what an event should point at. */
  place: Place;
  /** Every (place, externalId) pair in the chain, for the caller to persist. */
  externalIds: Array<{ placeId: string; externalId: string }>;
  /** The resolved place id at each depth, aligned with the input chain. */
  placeIdsByDepth: Array<string | null>;
}

function normalize(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

/** SQLite caps bind parameters at 999 by default; stay under it. */
const CHUNK = 800;

function groupKey(parentId: string | null, level: HierarchyLevel): string {
  return `${parentId ?? ''} > ${normalize(level.name)}`;
}

/**
 * Identity of a level within its parent.
 *
 * The externalId participates only when the same (parent, name) is claimed by
 * two different ids. Keying on the id unconditionally would make a PLAC that
 * omits `_PARISH_AID` a different key from one that carries it, and the same
 * parish would be created twice — the AD corpus mixes both shapes.
 */
function levelKey(
  parentId: string | null,
  level: HierarchyLevel,
  splitIds: Map<string, Set<string>>,
): string {
  const group = groupKey(parentId, level);
  const needsSplit = (splitIds.get(group)?.size ?? 0) > 1;
  if (!needsSplit || !level.externalId) return group;
  return `${group} #${level.externalId}`;
}

/**
 * Per (parent, name) group, the distinct non-empty externalIds at this depth.
 * Two or more is a genuine collision — two places sharing a name under one
 * parent — and each id earns its own row.
 */
function collectSplitIds(
  entries: Array<{ parentId: string | null; level: HierarchyLevel }>,
): Map<string, Set<string>> {
  const splits = new Map<string, Set<string>>();
  for (const e of entries) {
    if (!e.level.externalId) continue;
    const key = groupKey(e.parentId, e.level);
    const set = splits.get(key) ?? new Set<string>();
    set.add(e.level.externalId);
    splits.set(key, set);
  }
  return splits;
}

export async function bulkResolveHierarchy(
  db: Database,
  chains: HierarchyLevel[][],
): Promise<Map<string, ResolvedChain>> {
  const result = new Map<string, ResolvedChain>();
  const usable = chains.filter(c => c.length > 0);
  if (usable.length === 0) return result;

  const maxDepth = Math.max(...usable.map(c => c.length));

  // resolvedIds[chainIndex][depth] — the place id each chain has at each depth.
  const resolvedIds: Array<Array<string | null>> =
    usable.map(() => new Array<string | null>(maxDepth).fill(null));

  for (let depth = 0; depth < maxDepth; depth++) {
    // Every (parent, level) pair present at this depth, before deduplication.
    // collectSplitIds must see all of them to spot a collision.
    const present: Array<{ parentId: string | null; level: HierarchyLevel }> = [];
    for (let ci = 0; ci < usable.length; ci++) {
      const level = usable[ci][depth];
      if (!level) continue;
      const parentId = depth === 0 ? null : resolvedIds[ci][depth - 1];
      if (depth > 0 && parentId === null) continue; // parent failed to resolve
      present.push({ parentId, level });
    }
    if (present.length === 0) continue;

    const splitIds = collectSplitIds(present);
    const wanted = new Map<string, { parentId: string | null; level: HierarchyLevel }>();
    for (const e of present) wanted.set(levelKey(e.parentId, e.level, splitIds), e);

    // Round 1 — one SELECT per chunk for the rows that already exist.
    const found = new Map<string, Place>();
    const entries = [...wanted.entries()];
    const claimed = new Set<string>();
    for (let i = 0; i < entries.length; i += CHUNK) {
      const chunk = entries.slice(i, i + CHUNK);
      const placeholders = chunk.map(() => '?').join(',');
      const rows = await queryAll<Place>(
        db,
        `SELECT * FROM places WHERE normalized_name IN (${placeholders})`,
        chunk.map(([, e]) => normalize(e.level.name)),
      );
      for (const [key, e] of chunk) {
        if (found.has(key)) continue;
        const match = rows.find(row =>
          !claimed.has(row.id) &&
          normalize(row.name) === normalize(e.level.name) &&
          (row.parent_place_id ?? null) === e.parentId);
        if (match) {
          claimed.add(match.id);
          found.set(key, match);
        }
      }
    }

    // Round 2 — one bulk INSERT for everything still missing.
    const missing = entries.filter(([key]) => !found.has(key));
    if (missing.length > 0) {
      const rows = missing.map(([, e]) => ({
        id: crypto.randomUUID(),
        name: e.level.name,
        norm: normalize(e.level.name),
        type: e.level.type,
        parentId: e.parentId,
      }));
      await runBatch(
        db,
        'INSERT INTO places (id, name, normalized_name, place_type, parent_place_id) VALUES (?, ?, ?, ?, ?)',
        rows.map(r => [r.id, r.name, r.norm, r.type, r.parentId]),
      );
      // Read back so callers get the full row shape, DB defaults included.
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const placeholders = chunk.map(() => '?').join(',');
        const readBack = await queryAll<Place>(
          db,
          `SELECT * FROM places WHERE id IN (${placeholders})`,
          chunk.map(r => r.id),
        );
        const byId = new Map(readBack.map(r => [r.id, r]));
        for (let j = 0; j < chunk.length; j++) {
          const place = byId.get(chunk[j].id);
          if (place) found.set(missing[i + j][0], place);
        }
      }
    }

    // Hand the resolved ids down to the next depth.
    for (let ci = 0; ci < usable.length; ci++) {
      const level = usable[ci][depth];
      if (!level) continue;
      const parentId = depth === 0 ? null : resolvedIds[ci][depth - 1];
      if (depth > 0 && parentId === null) continue;
      resolvedIds[ci][depth] = found.get(levelKey(parentId, level, splitIds))?.id ?? null;
    }
  }

  // Build the result, keyed by the joined chain, in input order.
  const placeById = new Map<string, Place>();
  const allIds = [...new Set(resolvedIds.flat().filter((id): id is string => id !== null))];
  for (let i = 0; i < allIds.length; i += CHUNK) {
    const chunk = allIds.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => '?').join(',');
    const rows = await queryAll<Place>(db, `SELECT * FROM places WHERE id IN (${placeholders})`, chunk);
    for (const row of rows) placeById.set(row.id, row);
  }

  for (let ci = 0; ci < usable.length; ci++) {
    const chain = usable[ci];
    const innermostId = resolvedIds[ci][chain.length - 1];
    if (!innermostId) continue;
    const place = placeById.get(innermostId);
    if (!place) continue;
    const externalIds: Array<{ placeId: string; externalId: string }> = [];
    for (let depth = 0; depth < chain.length; depth++) {
      const id = chain[depth].externalId;
      const placeId = resolvedIds[ci][depth];
      if (id && placeId) externalIds.push({ placeId, externalId: id });
    }
    result.set(chain.map(l => l.name).join(' > '), {
      place,
      externalIds,
      placeIdsByDepth: resolvedIds[ci].slice(0, chain.length),
    });
  }
  return result;
}
