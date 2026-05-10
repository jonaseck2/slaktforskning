import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from 'node-sqlite3-wasm';
import {
  findDuplicatePlaces,
  countDuplicatePlaces,
  mergePlaces,
  ignoreDuplicatePlace,
  levenshtein,
} from '../../src/api/duplicates';
import { createPlace, getPlace, deletePlace } from '../../src/api/places';
import { createEvent, getEvent } from '../../src/api/events';
import { createSource, createCitation, getCitation } from '../../src/api/sources';
import { createGroup, addGroupLink, getGroupLinks } from '../../src/api/groups';
import { createResearchTask, addTaskLink, getTaskLinks } from '../../src/api/research_tasks';
import { createMedia, addMediaLink, getMediaForEntity } from '../../src/api/media';
import { undoManager } from '../../src/api/undo';
import { queryAll, runSql } from '../../src/api/db';
import { createTestDb } from './helpers';

let db: Database;
beforeEach(() => {
  db = createTestDb();
  undoManager.clear();
});

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('Stockholm', 'Stockholm')).toBe(0);
  });
  it('counts a single insertion', () => {
    expect(levenshtein('Stockholm', 'Stockholms')).toBe(1);
  });
  it('counts substitutions and deletions', () => {
    expect(levenshtein('Stocholm', 'Stockholm')).toBe(1); // missing k
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });
  it('handles empty strings', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
    expect(levenshtein('', '')).toBe(0);
  });
});

describe('findDuplicatePlaces', () => {
  it('finds places with identical normalized names at top level', () => {
    // The user-goal canary: "Stockholm" and "Stockholm " (trailing space)
    // both top-level, must be flagged with the highest score.
    const a = createPlace(db, { name: 'Stockholm' });
    const b = createPlace(db, { name: 'Stockholm ' });
    const dupes = findDuplicatePlaces(db);
    expect(dupes).toHaveLength(1);
    const pair = dupes[0];
    expect(new Set([pair.place1_id, pair.place2_id])).toEqual(new Set([a.id, b.id]));
    expect(pair.score).toBe(100);
    expect(pair.reasons).toContain('same_normalized_name');
    expect(pair.reasons).toContain('both_top_level');
  });

  it('finds places within Levenshtein distance 2', () => {
    createPlace(db, { name: 'Stockholm' });
    createPlace(db, { name: 'Stocholm' }); // missing k — distance 1
    const dupes = findDuplicatePlaces(db);
    expect(dupes).toHaveLength(1);
    expect(dupes[0].reasons).toContain('levenshtein_1');
    expect(dupes[0].score).toBeGreaterThan(80);
    expect(dupes[0].score).toBeLessThan(100);
  });

  it('does not flag pairs beyond distance 2', () => {
    createPlace(db, { name: 'Stockholm' });
    createPlace(db, { name: 'Goeteborg' });
    expect(findDuplicatePlaces(db)).toHaveLength(0);
  });

  it('does not flag places with different parents', () => {
    const swe = createPlace(db, { name: 'Sweden' });
    const usa = createPlace(db, { name: 'USA' });
    createPlace(db, { name: 'Stockholm', parent_place_id: swe.id });
    createPlace(db, { name: 'Stockholm', parent_place_id: usa.id });
    expect(findDuplicatePlaces(db)).toHaveLength(0);
  });

  it('flags places with identical parents', () => {
    const swe = createPlace(db, { name: 'Sweden' });
    createPlace(db, { name: 'Stockholm', parent_place_id: swe.id });
    createPlace(db, { name: 'Stockholm', parent_place_id: swe.id });
    const dupes = findDuplicatePlaces(db);
    expect(dupes).toHaveLength(1);
    expect(dupes[0].reasons).toContain('same_parent');
  });

  it('honours ignored pairs', () => {
    const a = createPlace(db, { name: 'Stockholm' });
    const b = createPlace(db, { name: 'Stockholm' });
    expect(findDuplicatePlaces(db)).toHaveLength(1);
    ignoreDuplicatePlace(db, a.id, b.id);
    expect(findDuplicatePlaces(db)).toHaveLength(0);
  });

  it('honours pagination via limit/offset', () => {
    // 4 candidate pairs in 4 different parents. Use parent names that are
    // far apart in edit distance so the parents don't themselves form
    // duplicate pairs at the top level (Parent0 vs Parent1 = distance 1).
    const parentNames = ['Africa', 'BorneoIslands', 'Cameroon99', 'Denmark11'];
    for (const pn of parentNames) {
      const par = createPlace(db, { name: pn });
      createPlace(db, { name: 'Leaf', parent_place_id: par.id });
      createPlace(db, { name: 'Leaf', parent_place_id: par.id });
    }
    expect(countDuplicatePlaces(db)).toBe(4);
    expect(findDuplicatePlaces(db, 2, 0)).toHaveLength(2);
    expect(findDuplicatePlaces(db, 2, 2)).toHaveLength(2);
    expect(findDuplicatePlaces(db, 2, 4)).toHaveLength(0);
  });

  it('does not pair a place against persons of the same UUID by mistake', () => {
    // Sanity: ignored_duplicates rows for entity_type='person' must not hide
    // place pairs (entity_type='place'). Belt-and-braces given the polymorphic
    // table — the find function filters by entity_type='place'.
    const a = createPlace(db, { name: 'Stockholm' });
    const b = createPlace(db, { name: 'Stockholm' });
    // Forge an ignored 'person' row with the same UUIDs (canonically sorted).
    const [low, high] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
    runSql(db,
      "INSERT INTO ignored_duplicates (entity_type, person1_id, person2_id) VALUES ('person', ?, ?)",
      [low, high]
    );
    expect(findDuplicatePlaces(db)).toHaveLength(1);
  });
});

describe('mergePlaces — repointing', () => {
  it('repoints events.place_id', () => {
    const target = createPlace(db, { name: 'Stockholm' });
    const source = createPlace(db, { name: 'Stockholm' });
    const ev = createEvent(db, { event_type: 'birth', date_type: 'exact', place_id: source.id });
    const result = mergePlaces(db, target.id, source.id);
    expect(result.moved.events).toBe(1);
    expect(getEvent(db, ev.id)?.place_id).toBe(target.id);
    expect(getPlace(db, source.id)).toBeNull();
  });

  it('repoints places.parent_place_id (self-reference)', () => {
    const target = createPlace(db, { name: 'Stockholm' });
    const source = createPlace(db, { name: 'Stockholm' });
    const child = createPlace(db, { name: 'Gamla stan', parent_place_id: source.id });
    const result = mergePlaces(db, target.id, source.id);
    expect(result.moved.child_places).toBe(1);
    expect(getPlace(db, child.id)?.parent_place_id).toBe(target.id);
  });

  it('repoints citations.place_id', () => {
    const target = createPlace(db, { name: 'Stockholm' });
    const source = createPlace(db, { name: 'Stockholm' });
    const src = createSource(db, { title: 'A book' });
    const cit = createCitation(db, { source_id: src.id, place_id: source.id });
    const result = mergePlaces(db, target.id, source.id);
    expect(result.moved.citations).toBe(1);
    expect(getCitation(db, cit.id)?.place_id).toBe(target.id);
  });

  it('repoints group_links and skips duplicates', () => {
    const target = createPlace(db, { name: 'Stockholm' });
    const source = createPlace(db, { name: 'Stockholm' });
    const g1 = createGroup(db, { name: 'g1' });
    const g2 = createGroup(db, { name: 'g2' });
    addGroupLink(db, g1.id, 'place', source.id);  // moves
    addGroupLink(db, g2.id, 'place', target.id);  // already linked to target
    addGroupLink(db, g2.id, 'place', source.id);  // duplicate — should be deleted on merge
    const result = mergePlaces(db, target.id, source.id);
    expect(result.moved.group_links).toBe(1);
    const g1Links = getGroupLinks(db, g1.id);
    const g2Links = getGroupLinks(db, g2.id);
    expect(g1Links).toHaveLength(1);
    expect(g1Links[0].entity_id).toBe(target.id);
    expect(g2Links).toHaveLength(1); // duplicate collapsed
    expect(g2Links[0].entity_id).toBe(target.id);
  });

  it('repoints task_links and skips duplicates', () => {
    const target = createPlace(db, { name: 'Stockholm' });
    const source = createPlace(db, { name: 'Stockholm' });
    const t1 = createResearchTask(db, { task: 't1' });
    const t2 = createResearchTask(db, { task: 't2' });
    addTaskLink(db, t1.id, 'place', source.id);
    addTaskLink(db, t2.id, 'place', target.id);
    addTaskLink(db, t2.id, 'place', source.id);
    const result = mergePlaces(db, target.id, source.id);
    expect(result.moved.task_links).toBe(1);
    const t1Links = getTaskLinks(db, t1.id);
    const t2Links = getTaskLinks(db, t2.id);
    expect(t1Links).toHaveLength(1);
    expect(t1Links[0].entity_id).toBe(target.id);
    expect(t2Links).toHaveLength(1);
  });

  it('repoints media_links and skips duplicates', () => {
    const target = createPlace(db, { name: 'Stockholm' });
    const source = createPlace(db, { name: 'Stockholm' });
    const m1 = createMedia(db, { title: 'photo1' });
    const m2 = createMedia(db, { title: 'photo2' });
    addMediaLink(db, { media_id: m1.id, entity_type: 'place', entity_id: source.id });
    addMediaLink(db, { media_id: m2.id, entity_type: 'place', entity_id: target.id });
    addMediaLink(db, { media_id: m2.id, entity_type: 'place', entity_id: source.id });
    const result = mergePlaces(db, target.id, source.id);
    expect(result.moved.media_links).toBe(1);
    const onTarget = getMediaForEntity(db, 'place', target.id);
    expect(onTarget.some(m => m.id === m1.id)).toBe(true);
    expect(onTarget.some(m => m.id === m2.id)).toBe(true);
    // No m2 link still pointing at source (which is gone)
    const orphans = queryAll(db,
      "SELECT id FROM media_links WHERE entity_type = 'place' AND entity_id = ?",
      [source.id]
    );
    expect(orphans).toHaveLength(0);
  });

  it('throws on self-merge', () => {
    const a = createPlace(db, { name: 'Stockholm' });
    expect(() => mergePlaces(db, a.id, a.id)).toThrow('Cannot merge a place with itself');
  });

  it('throws when target missing', () => {
    const a = createPlace(db, { name: 'Stockholm' });
    expect(() => mergePlaces(db, 'no-such-id', a.id)).toThrow('Target place not found');
  });

  it('throws when source missing', () => {
    const a = createPlace(db, { name: 'Stockholm' });
    expect(() => mergePlaces(db, a.id, 'no-such-id')).toThrow('Source place not found');
  });

  it('drops candidate pair count by one after merge', () => {
    createPlace(db, { name: 'Stockholm' });
    const a = createPlace(db, { name: 'Stockholm' });
    const b = createPlace(db, { name: 'Stockholm' });
    expect(countDuplicatePlaces(db)).toBeGreaterThanOrEqual(1);
    mergePlaces(db, a.id, b.id);
    // Two Stockholms left -> still one pair, but the previously-3-stockholm
    // surface should have shrunk by one.
    expect(countDuplicatePlaces(db)).toBe(1);
  });
});

describe('mergePlaces — undo round-trip', () => {
  it('restores every touched row exactly to its pre-merge state', () => {
    // Build a fixture with one of each kind of FK reference + a polymorphic
    // link of each type, including a "duplicate target link" that gets
    // collapsed during merge.
    const target = createPlace(db, { name: 'Stockholm' });
    const source = createPlace(db, { name: 'Stockholm' });
    const sourceSnapshot = getPlace(db, source.id)!;

    const ev = createEvent(db, { event_type: 'birth', date_type: 'exact', place_id: source.id });
    const child = createPlace(db, { name: 'Old town', parent_place_id: source.id });
    const childSnapshotBefore = getPlace(db, child.id)!;
    const src = createSource(db, { title: 'A' });
    const cit = createCitation(db, { source_id: src.id, place_id: source.id });

    const g1 = createGroup(db, { name: 'g1' });
    const g2 = createGroup(db, { name: 'g2' });
    addGroupLink(db, g1.id, 'place', source.id);   // will move
    addGroupLink(db, g2.id, 'place', target.id);   // pre-existing on target
    addGroupLink(db, g2.id, 'place', source.id);   // will be collapsed (duplicate)

    const t1 = createResearchTask(db, { task: 't1' });
    addTaskLink(db, t1.id, 'place', source.id);    // moves

    const m1 = createMedia(db, { title: 'photo' });
    addMediaLink(db, { media_id: m1.id, entity_type: 'place', entity_id: source.id });

    // Forge an ignored_duplicates row mentioning the source so the cleanup +
    // restore path is exercised.
    const otherPlace = createPlace(db, { name: 'Other' });
    ignoreDuplicatePlace(db, source.id, otherPlace.id);

    // Snapshot rows BEFORE merge
    const groupLinksBefore = queryAll(db,
      "SELECT id, group_id, entity_type, entity_id, sort_order, created_at FROM group_links WHERE entity_type = 'place' ORDER BY id"
    );
    const taskLinksBefore = queryAll(db,
      "SELECT id, task_id, entity_type, entity_id, sort_order, created_at FROM task_links WHERE entity_type = 'place' ORDER BY id"
    );
    const mediaLinksBefore = queryAll(db,
      "SELECT id, media_id, entity_type, entity_id, link_type, sort_order, created_at FROM media_links WHERE entity_type = 'place' ORDER BY id"
    );
    const ignoredBefore = queryAll<{ entity_type: string; person1_id: string; person2_id: string; created_at: string }>(
      db,
      "SELECT entity_type, person1_id, person2_id, created_at FROM ignored_duplicates WHERE entity_type = 'place' ORDER BY person1_id, person2_id"
    );
    expect(ignoredBefore.length).toBeGreaterThan(0);

    // --- merge ---
    mergePlaces(db, target.id, source.id);
    // Sanity: state has changed.
    expect(getPlace(db, source.id)).toBeNull();
    expect(getEvent(db, ev.id)?.place_id).toBe(target.id);

    // --- undo ---
    const label = undoManager.undo();
    expect(label).toBe('undo.mergePlaces');

    // Source row restored, exact column values.
    const sourceAfter = getPlace(db, source.id);
    expect(sourceAfter).not.toBeNull();
    expect(sourceAfter).toEqual(sourceSnapshot);

    // events.place_id reverts.
    expect(getEvent(db, ev.id)?.place_id).toBe(source.id);
    // child place reverts.
    expect(getPlace(db, child.id)).toEqual(childSnapshotBefore);
    // citation reverts.
    expect(getCitation(db, cit.id)?.place_id).toBe(source.id);

    // Polymorphic links: every row that existed pre-merge exists post-undo
    // with the same id, and entity_id points at whatever it pointed at before.
    const groupLinksAfter = queryAll(db,
      "SELECT id, group_id, entity_type, entity_id, sort_order, created_at FROM group_links WHERE entity_type = 'place' ORDER BY id"
    );
    expect(groupLinksAfter).toEqual(groupLinksBefore);

    const taskLinksAfter = queryAll(db,
      "SELECT id, task_id, entity_type, entity_id, sort_order, created_at FROM task_links WHERE entity_type = 'place' ORDER BY id"
    );
    expect(taskLinksAfter).toEqual(taskLinksBefore);

    const mediaLinksAfter = queryAll(db,
      "SELECT id, media_id, entity_type, entity_id, link_type, sort_order, created_at FROM media_links WHERE entity_type = 'place' ORDER BY id"
    );
    expect(mediaLinksAfter).toEqual(mediaLinksBefore);

    // ignored_duplicates restored.
    const ignoredAfter = queryAll<{ entity_type: string; person1_id: string; person2_id: string; created_at: string }>(
      db,
      "SELECT entity_type, person1_id, person2_id, created_at FROM ignored_duplicates WHERE entity_type = 'place' ORDER BY person1_id, person2_id"
    );
    expect(ignoredAfter).toEqual(ignoredBefore);
  });

  it('redo replays the merge', () => {
    const target = createPlace(db, { name: 'Stockholm' });
    const source = createPlace(db, { name: 'Stockholm' });
    const ev = createEvent(db, { event_type: 'birth', date_type: 'exact', place_id: source.id });

    mergePlaces(db, target.id, source.id);
    undoManager.undo();
    expect(getPlace(db, source.id)).not.toBeNull();
    expect(getEvent(db, ev.id)?.place_id).toBe(source.id);

    undoManager.redo();
    expect(getPlace(db, source.id)).toBeNull();
    expect(getEvent(db, ev.id)?.place_id).toBe(target.id);
  });
});

describe('deletePlace — ignored_duplicates cleanup', () => {
  it('removes place-typed ignored pairs that mention the deleted id', () => {
    const a = createPlace(db, { name: 'Stockholm' });
    const b = createPlace(db, { name: 'Stockholm' });
    const c = createPlace(db, { name: 'Goeteborg' });
    ignoreDuplicatePlace(db, a.id, b.id);
    ignoreDuplicatePlace(db, a.id, c.id);
    expect(queryAll(db, "SELECT * FROM ignored_duplicates WHERE entity_type = 'place'")).toHaveLength(2);
    deletePlace(db, a.id);
    // Both rows mentioned `a.id` -> both removed.
    expect(queryAll(db, "SELECT * FROM ignored_duplicates WHERE entity_type = 'place'")).toHaveLength(0);
  });

  it('does not touch person-typed ignored rows', () => {
    const a = createPlace(db, { name: 'Stockholm' });
    // Forge a person-typed ignored row whose ids happen to overlap.
    runSql(db,
      "INSERT INTO ignored_duplicates (entity_type, person1_id, person2_id) VALUES ('person', ?, ?)",
      [`aaa-${a.id.slice(0, 4)}`, `zzz-${a.id.slice(0, 4)}`]
    );
    deletePlace(db, a.id);
    expect(queryAll(db, "SELECT * FROM ignored_duplicates WHERE entity_type = 'person'")).toHaveLength(1);
  });
});

describe('FK self-check — every places.id reference must be handled by mergePlaces', () => {
  // This test reads src/api/schema.ts, finds every column that references
  // places(id), and asserts that mergePlaces' source code mentions each
  // (table, column) pair. It deliberately fails when a future schema change
  // adds a new FK to places.id without updating mergePlaces.
  //
  // Polymorphic links use entity_type='place' filtering and are matched by
  // table name + entity_type='place' clause.

  const repoRoot = join(__dirname, '..', '..');
  const schema = readFileSync(join(repoRoot, 'src/api/schema.ts'), 'utf8');
  const merge = readFileSync(join(repoRoot, 'src/api/duplicates.ts'), 'utf8');

  it('schema references to places.id we expect to find', () => {
    // Sanity: parsing finds the FKs we know about.
    const fkRefs = extractFkReferencesToPlaces(schema);
    expect(fkRefs).toEqual(
      expect.arrayContaining([
        { table: 'places', column: 'parent_place_id' },
        { table: 'events', column: 'place_id' },
        { table: 'citations', column: 'place_id' },
      ])
    );
  });

  it('mergePlaces handles every FK column that references places.id', () => {
    const fkRefs = extractFkReferencesToPlaces(schema);
    const mergeBlockMatch = merge.match(/export function mergePlaces[\s\S]*?^}/m);
    expect(mergeBlockMatch).not.toBeNull();
    const mergeBlock = mergeBlockMatch![0];

    for (const { table, column } of fkRefs) {
      // We expect either an UPDATE / SELECT / WHERE statement in mergePlaces
      // that names both the table and the column. The SELECT for snapshotting
      // covers the table + column, and the UPDATE for repointing covers the
      // SET clause.
      const updateRegex = new RegExp(`UPDATE\\s+${table}\\s+SET\\s+${column}\\s*=`, 'i');
      const selectRegex = new RegExp(`FROM\\s+${table}[\\s\\S]{0,200}?WHERE\\s+${column}\\s*=`, 'i');
      const handles = updateRegex.test(mergeBlock) || selectRegex.test(mergeBlock);
      expect(handles, `mergePlaces must handle ${table}.${column} (FK to places.id)`).toBe(true);
    }
  });

  it('mergePlaces handles polymorphic place-typed links', () => {
    const mergeBlockMatch = merge.match(/export function mergePlaces[\s\S]*?^}/m);
    const mergeBlock = mergeBlockMatch![0];
    for (const table of ['group_links', 'task_links', 'media_links']) {
      const re = new RegExp(`${table}[\\s\\S]{0,200}?entity_type\\s*=\\s*'place'`);
      expect(re.test(mergeBlock), `mergePlaces must repoint ${table} where entity_type='place'`).toBe(true);
    }
  });
});

// Parse `REFERENCES places(id)` clauses out of schema.ts. Returns the
// (table, column) pairs of every column with such an FK, including columns
// added later via ALTER TABLE migrations. Best-effort regex parse — the
// schema is ours and we control its shape.
function extractFkReferencesToPlaces(schema: string): Array<{ table: string; column: string }> {
  const refs: Array<{ table: string; column: string }> = [];
  // 1. Inline column definitions inside CREATE TABLE blocks.
  const tableRegex = /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(\w+)\s*\(([\s\S]*?)\);/g;
  let tm: RegExpExecArray | null;
  while ((tm = tableRegex.exec(schema)) !== null) {
    const table = tm[1];
    const body = tm[2];
    const colRegex = /^\s*(\w+)\s+[^,]*?REFERENCES\s+places\s*\(\s*id\s*\)/gim;
    let cm: RegExpExecArray | null;
    while ((cm = colRegex.exec(body)) !== null) {
      // Skip places.id self-reference declared as `id TEXT PRIMARY KEY`.
      if (cm[1] === 'id') continue;
      refs.push({ table, column: cm[1] });
    }
  }
  // 2. ALTER TABLE … ADD COLUMN <col> … REFERENCES places(id)
  const alterRegex = /ALTER TABLE\s+(\w+)\s+ADD COLUMN\s+(\w+)[^`]*?REFERENCES\s+places\s*\(\s*id\s*\)/gi;
  let am: RegExpExecArray | null;
  while ((am = alterRegex.exec(schema)) !== null) {
    refs.push({ table: am[1], column: am[2] });
  }
  // Dedupe (a column can appear in both CREATE TABLE and ALTER TABLE
  // migrations during schema evolution).
  const seen = new Set<string>();
  return refs.filter(r => {
    const k = `${r.table}.${r.column}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
