import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from 'node-sqlite3-wasm';
import {
  findDuplicateSources,
  countDuplicateSources,
  mergeSources,
  ignoreDuplicateSource,
} from '../../src/api/duplicates';
import {
  createSource,
  getSource,
  deleteSource,
  createCitation,
  getCitation,
} from '../../src/api/sources';
import { createRepository, linkSourceRepository, getRepositoriesForSource } from '../../src/api/repositories';
import { createMedia, addMediaLink, getMediaForEntity } from '../../src/api/media';
import { undoManager } from '../../src/api/undo';
import { queryAll, runSql } from '../../src/api/db';
import { createTestDb } from './helpers';

let db: Database;
beforeEach(() => {
  db = createTestDb();
  undoManager.clear();
});

describe('findDuplicateSources', () => {
  it('returns nothing on an empty DB', () => {
    expect(findDuplicateSources(db)).toEqual([]);
    expect(countDuplicateSources(db)).toBe(0);
  });

  it('finds sources with identical normalised titles + same author at the highest score', () => {
    // Score-100 canary: trailing-space-only difference normalises to equal.
    const a = createSource(db, { title: 'Adolf Fredrik C:I:6, 1798-1812', author: 'Pastor Eriksson' });
    const b = createSource(db, { title: 'Adolf Fredrik C:I:6, 1798-1812 ', author: 'Pastor Eriksson' });
    const dupes = findDuplicateSources(db);
    expect(dupes).toHaveLength(1);
    const pair = dupes[0];
    expect(new Set([pair.source1_id, pair.source2_id])).toEqual(new Set([a.id, b.id]));
    expect(pair.score).toBe(100);
    expect(pair.reasons).toContain('same_normalized_title');
    expect(pair.reasons).toContain('same_author');
  });

  it('finds the Adolf-Fredrik near-duplicate (em-dash vs hyphen) — user-goal canary', () => {
    // The user goal in concrete form: same parish book, same author, year-range
    // separator differs (em-dash vs hyphen). Single-char substitution →
    // Levenshtein 1 → high but sub-100 score.
    const a = createSource(db, { title: 'Adolf Fredrik C:I:6, 1798-1812', author: 'Pastor Eriksson' });
    const b = createSource(db, { title: 'Adolf Fredrik C:I:6, 1798–1812', author: 'Pastor Eriksson' });
    const dupes = findDuplicateSources(db);
    expect(dupes).toHaveLength(1);
    expect(new Set([dupes[0].source1_id, dupes[0].source2_id])).toEqual(new Set([a.id, b.id]));
    expect(dupes[0].reasons).toContain('levenshtein_1');
    expect(dupes[0].reasons).toContain('same_author');
    expect(dupes[0].score).toBeGreaterThan(80);
    expect(dupes[0].score).toBeLessThan(100);
  });

  it('finds titles within Levenshtein distance 2', () => {
    createSource(db, { title: 'A Genealogical History', author: 'Doe, J.' });
    createSource(db, { title: 'A Genealogical Histor', author: 'Doe, J.' });
    const dupes = findDuplicateSources(db);
    expect(dupes).toHaveLength(1);
    expect(dupes[0].reasons).toContain('levenshtein_1');
  });

  it('does not flag pairs beyond distance 2', () => {
    createSource(db, { title: 'A Genealogical History', author: 'Doe, J.' });
    createSource(db, { title: 'Completely Different Book Title', author: 'Doe, J.' });
    expect(findDuplicateSources(db)).toEqual([]);
  });

  it('does not flag sources with different authors even if titles match exactly', () => {
    createSource(db, { title: 'Same Title', author: 'Author A' });
    createSource(db, { title: 'Same Title', author: 'Author B' });
    expect(findDuplicateSources(db)).toEqual([]);
  });

  it('treats both-author-empty as a matching bucket', () => {
    createSource(db, { title: 'Untitled Manuscript' });
    createSource(db, { title: 'Untitled Manuscript' });
    const dupes = findDuplicateSources(db);
    expect(dupes).toHaveLength(1);
    expect(dupes[0].reasons).toContain('both_no_author');
  });

  it('does not treat empty-author and a real-author as the same bucket', () => {
    createSource(db, { title: 'Same Title' });
    createSource(db, { title: 'Same Title', author: 'Doe, J.' });
    expect(findDuplicateSources(db)).toEqual([]);
  });

  it('normalises author whitespace + case for grouping', () => {
    createSource(db, { title: 'Source A', author: 'doe,  J.' });
    createSource(db, { title: 'Source A', author: 'DOE, J.' });
    expect(findDuplicateSources(db)).toHaveLength(1);
  });

  it('skips rows with empty titles', () => {
    createSource(db, { title: '', author: 'X' });
    createSource(db, { title: '', author: 'X' });
    expect(findDuplicateSources(db)).toEqual([]);
  });

  it('honours ignored pairs', () => {
    const a = createSource(db, { title: 'Stockholm', author: 'X' });
    const b = createSource(db, { title: 'Stockholm', author: 'X' });
    expect(findDuplicateSources(db)).toHaveLength(1);
    ignoreDuplicateSource(db, a.id, b.id);
    expect(findDuplicateSources(db)).toHaveLength(0);
  });

  it('ignoreDuplicateSource is idempotent and rejects self-pairs', () => {
    const a = createSource(db, { title: 'X', author: 'A' });
    expect(() => ignoreDuplicateSource(db, a.id, a.id)).toThrow();
    const b = createSource(db, { title: 'X', author: 'A' });
    ignoreDuplicateSource(db, a.id, b.id);
    ignoreDuplicateSource(db, a.id, b.id);
    expect(queryAll(db, "SELECT * FROM ignored_duplicates WHERE entity_type = 'source'")).toHaveLength(1);
  });

  it('honours pagination via limit/offset', () => {
    const authors = ['Andersson', 'Bjorklund99', 'Carlsson_X', 'Davidsson_Z'];
    for (const author of authors) {
      createSource(db, { title: 'Book', author });
      createSource(db, { title: 'Book', author });
    }
    expect(countDuplicateSources(db)).toBe(4);
    expect(findDuplicateSources(db, 2, 0)).toHaveLength(2);
    expect(findDuplicateSources(db, 2, 2)).toHaveLength(2);
    expect(findDuplicateSources(db, 2, 4)).toHaveLength(0);
  });

  it('does not pair a source against persons of the same UUID by mistake', () => {
    const a = createSource(db, { title: 'X', author: 'A' });
    const b = createSource(db, { title: 'X', author: 'A' });
    const [low, high] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
    runSql(db,
      "INSERT INTO ignored_duplicates (entity_type, person1_id, person2_id) VALUES ('person', ?, ?)",
      [low, high]
    );
    expect(findDuplicateSources(db)).toHaveLength(1);
  });

  it('does not pair a source against a place-typed ignored row', () => {
    const a = createSource(db, { title: 'X', author: 'A' });
    const b = createSource(db, { title: 'X', author: 'A' });
    const [low, high] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
    runSql(db,
      "INSERT INTO ignored_duplicates (entity_type, person1_id, person2_id) VALUES ('place', ?, ?)",
      [low, high]
    );
    expect(findDuplicateSources(db)).toHaveLength(1);
  });

  it('returns highest-score pair first (sort by descending score)', () => {
    createSource(db, { title: 'Exact Match', author: 'A' });
    createSource(db, { title: 'Exact Match', author: 'A' });
    createSource(db, { title: 'Fuzzy Match', author: 'B' });
    createSource(db, { title: 'Fuzy Match', author: 'B' });
    const dupes = findDuplicateSources(db);
    expect(dupes).toHaveLength(2);
    expect(dupes[0].score).toBe(100);
    expect(dupes[1].score).toBeLessThan(100);
  });
});

describe('mergeSources — repointing', () => {
  it('repoints citations.source_id', () => {
    const target = createSource(db, { title: 'Stockholm', author: 'A' });
    const source = createSource(db, { title: 'Stockholm', author: 'A' });
    const cit = createCitation(db, { source_id: source.id });
    const result = mergeSources(db, target.id, source.id);
    expect(result.moved.citations).toBe(1);
    expect(getCitation(db, cit.id)?.source_id).toBe(target.id);
    expect(getSource(db, source.id)).toBeNull();
  });

  it('repoints source_repositories rows and dedupes against target', () => {
    const target = createSource(db, { title: 'X', author: 'A' });
    const source = createSource(db, { title: 'X', author: 'A' });
    const r1 = createRepository(db, { name: 'r1' });
    const r2 = createRepository(db, { name: 'r2' });
    linkSourceRepository(db, source.id, r1.id);
    linkSourceRepository(db, target.id, r2.id);
    linkSourceRepository(db, source.id, r2.id);

    const result = mergeSources(db, target.id, source.id);
    expect(result.moved.source_repositories).toBe(1);

    const onTarget = getRepositoriesForSource(db, target.id);
    expect(onTarget.map(r => r.id).sort()).toEqual([r1.id, r2.id].sort());
    const orphans = queryAll(db, 'SELECT * FROM source_repositories WHERE source_id = ?', [source.id]);
    expect(orphans).toHaveLength(0);
  });

  it('repoints media_links and skips duplicates', () => {
    const target = createSource(db, { title: 'X', author: 'A' });
    const source = createSource(db, { title: 'X', author: 'A' });
    const m1 = createMedia(db, { title: 'photo1' });
    const m2 = createMedia(db, { title: 'photo2' });
    addMediaLink(db, { media_id: m1.id, entity_type: 'source', entity_id: source.id });
    addMediaLink(db, { media_id: m2.id, entity_type: 'source', entity_id: target.id });
    addMediaLink(db, { media_id: m2.id, entity_type: 'source', entity_id: source.id });

    const result = mergeSources(db, target.id, source.id);
    expect(result.moved.media_links).toBe(1);

    const onTarget = getMediaForEntity(db, 'source', target.id);
    expect(onTarget.some(m => m.id === m1.id)).toBe(true);
    expect(onTarget.some(m => m.id === m2.id)).toBe(true);
    const orphans = queryAll(db,
      "SELECT id FROM media_links WHERE entity_type = 'source' AND entity_id = ?",
      [source.id]
    );
    expect(orphans).toHaveLength(0);
  });

  it('throws on self-merge', () => {
    const a = createSource(db, { title: 'X', author: 'A' });
    expect(() => mergeSources(db, a.id, a.id)).toThrow('Cannot merge a source with itself');
  });

  it('throws when target missing', () => {
    const a = createSource(db, { title: 'X', author: 'A' });
    expect(() => mergeSources(db, 'no-such-id', a.id)).toThrow('Target source not found');
  });

  it('throws when source missing', () => {
    const a = createSource(db, { title: 'X', author: 'A' });
    expect(() => mergeSources(db, a.id, 'no-such-id')).toThrow('Source source not found');
  });

  it('drops candidate pair count by one after merge', () => {
    createSource(db, { title: 'X', author: 'A' });
    const a = createSource(db, { title: 'X', author: 'A' });
    const b = createSource(db, { title: 'X', author: 'A' });
    expect(countDuplicateSources(db)).toBeGreaterThanOrEqual(1);
    mergeSources(db, a.id, b.id);
    expect(countDuplicateSources(db)).toBe(1);
  });
});

describe('mergeSources — undo round-trip', () => {
  it('restores every touched row exactly to its pre-merge state', () => {
    const target = createSource(db, { title: 'X', author: 'A' });
    const source = createSource(db, { title: 'X', author: 'A' });
    const sourceSnapshot = getSource(db, source.id)!;

    const cit = createCitation(db, { source_id: source.id, page: 'p3' });
    const r1 = createRepository(db, { name: 'r1' });
    const r2 = createRepository(db, { name: 'r2' });
    linkSourceRepository(db, source.id, r1.id);
    linkSourceRepository(db, target.id, r2.id);
    linkSourceRepository(db, source.id, r2.id);

    const m1 = createMedia(db, { title: 'photo' });
    addMediaLink(db, { media_id: m1.id, entity_type: 'source', entity_id: source.id });

    const otherSource = createSource(db, { title: 'Other', author: 'A' });
    ignoreDuplicateSource(db, source.id, otherSource.id);

    const repoLinksBefore = queryAll(db,
      'SELECT source_id, repository_id FROM source_repositories ORDER BY source_id, repository_id'
    );
    const mediaLinksBefore = queryAll(db,
      "SELECT id, media_id, entity_type, entity_id, link_type, sort_order, created_at FROM media_links WHERE entity_type = 'source' ORDER BY id"
    );
    const ignoredBefore = queryAll<{ entity_type: string; person1_id: string; person2_id: string; created_at: string }>(
      db,
      "SELECT entity_type, person1_id, person2_id, created_at FROM ignored_duplicates WHERE entity_type = 'source' ORDER BY person1_id, person2_id"
    );
    expect(ignoredBefore.length).toBeGreaterThan(0);

    mergeSources(db, target.id, source.id);
    expect(getSource(db, source.id)).toBeNull();
    expect(getCitation(db, cit.id)?.source_id).toBe(target.id);

    const label = undoManager.undo();
    expect(label).toBe('undo.mergeSources');

    const sourceAfter = getSource(db, source.id);
    expect(sourceAfter).not.toBeNull();
    expect(sourceAfter).toEqual(sourceSnapshot);

    expect(getCitation(db, cit.id)?.source_id).toBe(source.id);

    const repoLinksAfter = queryAll(db,
      'SELECT source_id, repository_id FROM source_repositories ORDER BY source_id, repository_id'
    );
    expect(repoLinksAfter).toEqual(repoLinksBefore);

    const mediaLinksAfter = queryAll(db,
      "SELECT id, media_id, entity_type, entity_id, link_type, sort_order, created_at FROM media_links WHERE entity_type = 'source' ORDER BY id"
    );
    expect(mediaLinksAfter).toEqual(mediaLinksBefore);

    const ignoredAfter = queryAll<{ entity_type: string; person1_id: string; person2_id: string; created_at: string }>(
      db,
      "SELECT entity_type, person1_id, person2_id, created_at FROM ignored_duplicates WHERE entity_type = 'source' ORDER BY person1_id, person2_id"
    );
    expect(ignoredAfter).toEqual(ignoredBefore);
  });

  it('redo replays the merge', () => {
    const target = createSource(db, { title: 'X', author: 'A' });
    const source = createSource(db, { title: 'X', author: 'A' });
    const cit = createCitation(db, { source_id: source.id });

    mergeSources(db, target.id, source.id);
    undoManager.undo();
    expect(getSource(db, source.id)).not.toBeNull();
    expect(getCitation(db, cit.id)?.source_id).toBe(source.id);

    undoManager.redo();
    expect(getSource(db, source.id)).toBeNull();
    expect(getCitation(db, cit.id)?.source_id).toBe(target.id);
  });
});

describe('deleteSource — ignored_duplicates cleanup', () => {
  it('removes source-typed ignored pairs that mention the deleted id', () => {
    const a = createSource(db, { title: 'X', author: 'A' });
    const b = createSource(db, { title: 'X', author: 'A' });
    const c = createSource(db, { title: 'Y', author: 'A' });
    ignoreDuplicateSource(db, a.id, b.id);
    ignoreDuplicateSource(db, a.id, c.id);
    expect(queryAll(db, "SELECT * FROM ignored_duplicates WHERE entity_type = 'source'")).toHaveLength(2);
    deleteSource(db, a.id);
    expect(queryAll(db, "SELECT * FROM ignored_duplicates WHERE entity_type = 'source'")).toHaveLength(0);
  });

  it('does not touch person-typed or place-typed ignored rows', () => {
    const a = createSource(db, { title: 'X', author: 'A' });
    runSql(db,
      "INSERT INTO ignored_duplicates (entity_type, person1_id, person2_id) VALUES ('person', ?, ?)",
      [`aaa-${a.id.slice(0, 4)}`, `zzz-${a.id.slice(0, 4)}`]
    );
    runSql(db,
      "INSERT INTO ignored_duplicates (entity_type, person1_id, person2_id) VALUES ('place', ?, ?)",
      [`aaa-${a.id.slice(0, 4)}`, `zzz-${a.id.slice(0, 4)}`]
    );
    deleteSource(db, a.id);
    expect(queryAll(db, "SELECT * FROM ignored_duplicates WHERE entity_type = 'person'")).toHaveLength(1);
    expect(queryAll(db, "SELECT * FROM ignored_duplicates WHERE entity_type = 'place'")).toHaveLength(1);
  });
});

describe('FK self-check — every sources.id reference must be handled by mergeSources', () => {
  // Reads src/api/schema.ts, finds every column that references sources(id),
  // and asserts that mergeSources' source code mentions each (table, column)
  // pair. Fails when a future schema change adds a new FK to sources.id
  // without updating mergeSources.

  const repoRoot = join(__dirname, '..', '..');
  const schema = readFileSync(join(repoRoot, 'src/api/schema.ts'), 'utf8');
  const merge = readFileSync(join(repoRoot, 'src/api/duplicates.ts'), 'utf8');

  it('schema references to sources.id we expect to find', () => {
    const fkRefs = extractFkReferencesToSources(schema);
    expect(fkRefs).toEqual(
      expect.arrayContaining([
        { table: 'citations', column: 'source_id' },
        { table: 'source_repositories', column: 'source_id' },
      ])
    );
  });

  it('mergeSources handles every FK column that references sources.id', () => {
    const fkRefs = extractFkReferencesToSources(schema);
    const mergeBlockMatch = merge.match(/export function mergeSources[\s\S]*?\n}\n/m);
    expect(mergeBlockMatch).not.toBeNull();
    const mergeBlock = mergeBlockMatch![0];

    for (const { table, column } of fkRefs) {
      const updateRegex = new RegExp(`UPDATE\\s+${table}\\s+SET\\s+${column}\\s*=`, 'i');
      const selectRegex = new RegExp(`FROM\\s+${table}[\\s\\S]{0,200}?WHERE\\s+${column}\\s*=`, 'i');
      const handles = updateRegex.test(mergeBlock) || selectRegex.test(mergeBlock);
      expect(handles, `mergeSources must handle ${table}.${column} (FK to sources.id)`).toBe(true);
    }
  });

  it('mergeSources handles polymorphic source-typed media_links', () => {
    const mergeBlockMatch = merge.match(/export function mergeSources[\s\S]*?\n}\n/m);
    const mergeBlock = mergeBlockMatch![0];
    const re = /media_links[\s\S]{0,200}?entity_type\s*=\s*'source'/;
    expect(re.test(mergeBlock), `mergeSources must repoint media_links where entity_type='source'`).toBe(true);
  });
});

// Parse `REFERENCES sources(id)` clauses out of schema.ts via matchAll.
function extractFkReferencesToSources(schema: string): Array<{ table: string; column: string }> {
  const refs: Array<{ table: string; column: string }> = [];
  // 1. Inline column definitions inside CREATE TABLE blocks.
  const tableRegex = /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(\w+)\s*\(([\s\S]*?)\);/g;
  for (const tm of schema.matchAll(tableRegex)) {
    const table = tm[1];
    const body = tm[2];
    const colRegex = /^\s*(\w+)\s+[^,]*?REFERENCES\s+sources\s*\(\s*id\s*\)/gim;
    for (const cm of body.matchAll(colRegex)) {
      if (cm[1] === 'id') continue;
      refs.push({ table, column: cm[1] });
    }
  }
  // 2. ALTER TABLE … ADD COLUMN <col> … REFERENCES sources(id)
  const alterRegex = /ALTER TABLE\s+(\w+)\s+ADD COLUMN\s+(\w+)[^`]*?REFERENCES\s+sources\s*\(\s*id\s*\)/gi;
  for (const am of schema.matchAll(alterRegex)) {
    refs.push({ table: am[1], column: am[2] });
  }
  // Dedupe.
  const seen = new Set<string>();
  return refs.filter(r => {
    const k = `${r.table}.${r.column}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
