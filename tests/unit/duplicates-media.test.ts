import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from 'node-sqlite3-wasm';
import {
  findDuplicateMedia,
  countDuplicateMedia,
  mergeMedia,
  ignoreDuplicateMedia,
  deleteIgnoredDuplicatesForMedia,
} from '../../src/api/duplicates';
import {
  createMedia,
  getMedia,
  deleteMedia,
  addMediaLink,
  getLinksForMedia,
} from '../../src/api/media';
import { createPerson } from '../../src/api/persons';
import { undoManager } from '../../src/api/undo';
import { initializeSchema } from '../../src/api/schema';
import { queryAll, queryOne, runSql } from '../../src/api/db';

// Tests need a real on-disk DB path so the function can resolve relative
// file_refs to <dbDir>/<dbname>-media/. createTestDb() uses :memory: which
// has no dirname; we mint a per-test temp directory + DB path instead.
let tmpDir: string;
let dbPath: string;
let mediaDir: string;
let db: Database;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dup-media-test-'));
  dbPath = path.join(tmpDir, 'family.db');
  mediaDir = path.join(tmpDir, 'family-media');
  fs.mkdirSync(mediaDir, { recursive: true });
  db = new Database(dbPath);
  initializeSchema(db);
  undoManager.clear();
});

afterEach(() => {
  try { db.close(); } catch { /* ignore */ }
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

// Helper: create a media row with a real file on disk inside <mediaDir>.
function createMediaWithFile(
  title: string,
  filename: string,
  bytes: Buffer | string,
): { id: string; fileRef: string; absPath: string } {
  const buf = typeof bytes === 'string' ? Buffer.from(bytes) : bytes;
  const absPath = path.join(mediaDir, filename);
  fs.writeFileSync(absPath, buf);
  const fileRef = path.join('family-media', filename);
  const m = createMedia(db, { file_ref: fileRef, title });
  return { id: m.id, fileRef, absPath };
}

describe('findDuplicateMedia', () => {
  it('returns nothing on an empty DB', () => {
    expect(findDuplicateMedia(db)).toEqual([]);
    expect(countDuplicateMedia(db)).toBe(0);
  });

  it('finds same-file_ref pairs at score 100 — user-goal canary (same scan attached twice)', () => {
    // The exact user-goal scenario: a genealogist imported the same data
    // twice; two media rows now point at the same file on disk.
    const a = createMedia(db, { file_ref: 'family-media/scan.jpg', title: 'Birth record' });
    const b = createMedia(db, { file_ref: 'family-media/scan.jpg', title: 'Birth Record (copy)' });
    const dupes = findDuplicateMedia(db);
    expect(dupes).toHaveLength(1);
    const pair = dupes[0];
    expect(new Set([pair.media1_id, pair.media2_id])).toEqual(new Set([a.id, b.id]));
    expect(pair.score).toBe(100);
    expect(pair.reasons).toContain('same_file_ref');
  });

  it('treats trailing whitespace differences in file_ref as the same ref', () => {
    createMedia(db, { file_ref: 'family-media/scan.jpg', title: 'A' });
    createMedia(db, { file_ref: 'family-media/scan.jpg ', title: 'B' });
    const dupes = findDuplicateMedia(db);
    expect(dupes).toHaveLength(1);
    expect(dupes[0].score).toBe(100);
    expect(dupes[0].reasons).toContain('same_file_ref');
  });

  it('does not pair two NULL file_refs on file_ref alone', () => {
    // Two rows with no file at all should not be flagged on file_ref equality
    // (there's nothing to compare); the title path can still fire if titles
    // happen to match, but file_ref-equality must NOT fire on NULL == NULL.
    createMedia(db, { file_ref: null, title: 'Andersson family album' });
    createMedia(db, { file_ref: null, title: 'Bjorklund wedding scan' });
    const dupes = findDuplicateMedia(db);
    // Distinct titles (Levenshtein > 2) and both file_refs null → no candidate.
    expect(dupes).toEqual([]);
  });

  it('finds title-equal pairs at score 99 (capped below 100 so file_ref pairs sort first)', () => {
    createMedia(db, { file_ref: 'family-media/a.jpg', title: 'Photo 1942' });
    createMedia(db, { file_ref: 'family-media/b.jpg', title: 'Photo 1942' });
    const dupes = findDuplicateMedia(db);
    expect(dupes).toHaveLength(1);
    expect(dupes[0].score).toBe(99);
    expect(dupes[0].reasons).toContain('same_normalized_title');
  });

  it('finds titles within Levenshtein distance 2', () => {
    createMedia(db, { file_ref: 'family-media/a.jpg', title: 'Photo 1942' });
    createMedia(db, { file_ref: 'family-media/b.jpg', title: 'Photo 1943' });
    const dupes = findDuplicateMedia(db);
    expect(dupes).toHaveLength(1);
    expect(dupes[0].reasons).toContain('levenshtein_1');
    expect(dupes[0].score).toBeLessThan(100);
  });

  it('does not flag pairs beyond Levenshtein 2', () => {
    createMedia(db, { file_ref: 'family-media/a.jpg', title: 'Photo 1942' });
    createMedia(db, { file_ref: 'family-media/b.jpg', title: 'Wedding portrait' });
    expect(findDuplicateMedia(db)).toEqual([]);
  });

  it('skips rows with empty titles when matching on title', () => {
    createMedia(db, { file_ref: 'family-media/a.jpg', title: '' });
    createMedia(db, { file_ref: 'family-media/b.jpg', title: '' });
    expect(findDuplicateMedia(db)).toEqual([]);
  });

  it('same file_ref AND same title yields a single candidate (path 1 wins)', () => {
    const a = createMedia(db, { file_ref: 'family-media/x.jpg', title: 'Photo' });
    const b = createMedia(db, { file_ref: 'family-media/x.jpg', title: 'Photo' });
    const dupes = findDuplicateMedia(db);
    expect(dupes).toHaveLength(1);
    expect(new Set([dupes[0].media1_id, dupes[0].media2_id])).toEqual(new Set([a.id, b.id]));
    // Score is 100 (file_ref path), reasons reflect that path only.
    expect(dupes[0].score).toBe(100);
    expect(dupes[0].reasons).toContain('same_file_ref');
  });

  it('honours ignored pairs', () => {
    const a = createMedia(db, { file_ref: 'family-media/x.jpg', title: 'A' });
    const b = createMedia(db, { file_ref: 'family-media/x.jpg', title: 'B' });
    expect(findDuplicateMedia(db)).toHaveLength(1);
    ignoreDuplicateMedia(db, a.id, b.id);
    expect(findDuplicateMedia(db)).toHaveLength(0);
  });

  it('ignoreDuplicateMedia is idempotent and rejects self-pairs', () => {
    const a = createMedia(db, { file_ref: 'family-media/x.jpg', title: 'A' });
    expect(() => ignoreDuplicateMedia(db, a.id, a.id)).toThrow();
    const b = createMedia(db, { file_ref: 'family-media/x.jpg', title: 'B' });
    ignoreDuplicateMedia(db, a.id, b.id);
    ignoreDuplicateMedia(db, a.id, b.id);
    expect(queryAll(db, "SELECT * FROM ignored_duplicates WHERE entity_type = 'media'")).toHaveLength(1);
  });

  it('honours pagination via limit/offset', () => {
    // 4 distinct file_ref pairs. Use long, mutually-distant titles so the
    // title path doesn't fire cross-bucket and inflate the count.
    const titles = ['Andersson family album', 'Bjorklund wedding scan', 'Carlsson estate document', 'Davidsson archive page'];
    for (let i = 0; i < 4; i++) {
      createMedia(db, { file_ref: `family-media/scan${i}.jpg`, title: titles[i] });
      createMedia(db, { file_ref: `family-media/scan${i}.jpg`, title: titles[i] });
    }
    expect(countDuplicateMedia(db)).toBe(4);
    expect(findDuplicateMedia(db, 2, 0)).toHaveLength(2);
    expect(findDuplicateMedia(db, 2, 2)).toHaveLength(2);
    expect(findDuplicateMedia(db, 2, 4)).toHaveLength(0);
  });

  it('does not treat a same-UUID person pair as a media pair (polymorphic isolation)', () => {
    const a = createMedia(db, { file_ref: 'family-media/x.jpg', title: 'X' });
    const b = createMedia(db, { file_ref: 'family-media/x.jpg', title: 'X' });
    const [low, high] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
    runSql(db,
      "INSERT INTO ignored_duplicates (entity_type, person1_id, person2_id) VALUES ('person', ?, ?)",
      [low, high]
    );
    // The media pair should still appear — the 'person' ignore row must not
    // accidentally hide it.
    expect(findDuplicateMedia(db)).toHaveLength(1);
  });

  it('returns highest-score pair first (file_ref before title)', () => {
    // Pair 1: same file_ref → 100
    createMedia(db, { file_ref: 'family-media/exact.jpg', title: 'Alpha' });
    createMedia(db, { file_ref: 'family-media/exact.jpg', title: 'Beta' });
    // Pair 2: same title → 99
    createMedia(db, { file_ref: 'family-media/p1.jpg', title: 'Wedding' });
    createMedia(db, { file_ref: 'family-media/p2.jpg', title: 'Wedding' });

    const dupes = findDuplicateMedia(db);
    expect(dupes).toHaveLength(2);
    expect(dupes[0].score).toBe(100);
    expect(dupes[0].reasons).toContain('same_file_ref');
    expect(dupes[1].score).toBe(99);
  });
});

describe('mergeMedia — input validation', () => {
  it('throws on self-merge', () => {
    const a = createMedia(db, { file_ref: 'family-media/x.jpg', title: 'X' });
    expect(() => mergeMedia(db, a.id, a.id, 'target', { dbPath })).toThrow('Cannot merge a media with itself');
  });

  it('throws when keepFile is omitted', () => {
    const a = createMedia(db, { file_ref: 'family-media/a.jpg', title: 'A' });
    const b = createMedia(db, { file_ref: 'family-media/b.jpg', title: 'B' });
    // @ts-expect-error — testing runtime validation when caller omits keepFile
    expect(() => mergeMedia(db, a.id, b.id, undefined, { dbPath })).toThrow('keepFile must be');
  });

  it('throws when keepFile is invalid', () => {
    const a = createMedia(db, { file_ref: 'family-media/a.jpg', title: 'A' });
    const b = createMedia(db, { file_ref: 'family-media/b.jpg', title: 'B' });
    // @ts-expect-error — testing runtime validation
    expect(() => mergeMedia(db, a.id, b.id, 'either', { dbPath })).toThrow('keepFile must be');
  });

  it('throws when target missing', () => {
    const a = createMedia(db, { file_ref: 'family-media/a.jpg', title: 'A' });
    expect(() => mergeMedia(db, 'no-such-id', a.id, 'target', { dbPath })).toThrow('Target media not found');
  });

  it('throws when source missing', () => {
    const a = createMedia(db, { file_ref: 'family-media/a.jpg', title: 'A' });
    expect(() => mergeMedia(db, a.id, 'no-such-id', 'target', { dbPath })).toThrow('Source media not found');
  });
});

describe('mergeMedia — keepFile=target (delete source row + source file)', () => {
  it('user-goal canary: same scan attached twice → merge deletes source row AND removes second copy of file', () => {
    // Two media rows pointing at *different* files on disk. We merge with
    // keepFile='target' — source's file gets deleted, target's stays.
    const targetFile = createMediaWithFile('Birth (target)', 'birth-target.jpg', 'TARGET-BYTES');
    const sourceFile = createMediaWithFile('Birth (source)', 'birth-source.jpg', 'SOURCE-BYTES');

    expect(fs.existsSync(targetFile.absPath)).toBe(true);
    expect(fs.existsSync(sourceFile.absPath)).toBe(true);

    const result = mergeMedia(db, targetFile.id, sourceFile.id, 'target', { dbPath });

    // Source row gone, target row preserved.
    expect(getMedia(db, sourceFile.id)).toBeNull();
    expect(getMedia(db, targetFile.id)?.file_ref).toBe(targetFile.fileRef);

    // Source file deleted, target file intact.
    expect(fs.existsSync(sourceFile.absPath)).toBe(false);
    expect(fs.existsSync(targetFile.absPath)).toBe(true);
    expect(fs.readFileSync(targetFile.absPath).toString()).toBe('TARGET-BYTES');

    expect(result.moved.file_deleted).toBe(1);
  });

  it('does NOT delete the file when both rows share the same file_ref', () => {
    // Same scan, two media rows — bytes on disk must stay.
    const fileRef = path.join('family-media', 'shared.jpg');
    const absPath = path.join(mediaDir, 'shared.jpg');
    fs.writeFileSync(absPath, 'SHARED-BYTES');
    const target = createMedia(db, { file_ref: fileRef, title: 'Target' });
    const source = createMedia(db, { file_ref: fileRef, title: 'Source' });

    const result = mergeMedia(db, target.id, source.id, 'target', { dbPath });

    expect(getMedia(db, source.id)).toBeNull();
    expect(getMedia(db, target.id)?.file_ref).toBe(fileRef);
    // File MUST still exist — target still references it.
    expect(fs.existsSync(absPath)).toBe(true);
    expect(fs.readFileSync(absPath).toString()).toBe('SHARED-BYTES');
    expect(result.moved.file_deleted).toBeUndefined();
  });

  it('handles source row with NULL file_ref (no file to delete)', () => {
    const targetFile = createMediaWithFile('Photo', 'photo.jpg', 'BYTES');
    const source = createMedia(db, { file_ref: null, title: 'Photo' });

    const result = mergeMedia(db, targetFile.id, source.id, 'target', { dbPath });

    expect(getMedia(db, source.id)).toBeNull();
    expect(fs.existsSync(targetFile.absPath)).toBe(true);
    expect(result.moved.file_deleted).toBeUndefined();
  });

  it('repoints media_links and dedupes duplicates', () => {
    const target = createMedia(db, { file_ref: 'family-media/t.jpg', title: 'T' });
    const source = createMedia(db, { file_ref: 'family-media/s.jpg', title: 'S' });
    const p1 = createPerson(db, { given_name: 'Test', surname: 'Person' });
    const p2 = createPerson(db, { given_name: 'Test', surname: 'Person' });
    // Source linked to p1 only; target linked to p2 only; both linked to a
    // shared p1+source (dedupe trigger)
    addMediaLink(db, { media_id: source.id, entity_type: 'person', entity_id: p1.id });
    addMediaLink(db, { media_id: target.id, entity_type: 'person', entity_id: p2.id });
    addMediaLink(db, { media_id: source.id, entity_type: 'person', entity_id: p2.id });
    addMediaLink(db, { media_id: target.id, entity_type: 'person', entity_id: p2.id });

    const result = mergeMedia(db, target.id, source.id, 'target', { dbPath });

    // Source link to p1 → moved (no conflict). Source link to p2 → deleted
    // (target already linked to p2).
    expect(result.moved.media_links).toBe(1); // updates only
    const targetLinks = getLinksForMedia(db, target.id);
    expect(targetLinks.some(l => l.entity_id === p1.id)).toBe(true);
    expect(targetLinks.filter(l => l.entity_id === p2.id)).toHaveLength(2); // both originals
  });

  it('repoints media_regions (face tags)', () => {
    const target = createMedia(db, { file_ref: 'family-media/t.jpg', title: 'T' });
    const source = createMedia(db, { file_ref: 'family-media/s.jpg', title: 'S' });
    const person = createPerson(db, { given_name: 'Test', surname: 'Person' });
    runSql(db, `
      INSERT INTO media_regions (id, media_id, person_id, x, y, width, height)
      VALUES ('reg1', ?, ?, 0.1, 0.1, 0.2, 0.2)
    `, [source.id, person.id]);

    const result = mergeMedia(db, target.id, source.id, 'target', { dbPath });

    expect(result.moved.media_regions).toBe(1);
    const region = queryOne<{ media_id: string }>(db, 'SELECT media_id FROM media_regions WHERE id = ?', ['reg1']);
    expect(region?.media_id).toBe(target.id);
  });

  it('drops candidate pair count by one after merge', () => {
    // Use distant unrelated titles so the only candidates come from file_ref.
    createMedia(db, { file_ref: 'family-media/standalone.jpg', title: 'Andersson album' });
    const a = createMediaWithFile('Bjorklund wedding', 'shared.jpg', 'BYTES');
    const b = createMedia(db, { file_ref: 'family-media/shared.jpg', title: 'Bjorklund wedding' }); // shares a.fileRef
    expect(countDuplicateMedia(db)).toBe(1);
    mergeMedia(db, a.id, b.id, 'target', { dbPath });
    expect(countDuplicateMedia(db)).toBe(0);
  });
});

describe('mergeMedia — keepFile=source (preserve target row metadata, swap file)', () => {
  it("rewrites target's file_ref to source's value, deletes target's prior file, deletes source row", () => {
    // The "target row deleted? — re-read your design and pick the cleanest semantics"
    // call: target ROW survives (so authored title/notes/is_printable on
    // target stay put). Only its file_ref is replaced with source's.
    const targetFile = createMediaWithFile('Wedding (better caption)', 'old-target.jpg', 'OLD-TARGET');
    const sourceFile = createMediaWithFile('Wedding', 'sharper-scan.jpg', 'SHARPER');

    // Add notes/is_printable on target — these must survive the merge.
    runSql(db, "UPDATE media SET notes = 'Authored caption on target', is_printable = 1 WHERE id = ?", [targetFile.id]);

    const result = mergeMedia(db, targetFile.id, sourceFile.id, 'source', { dbPath });

    // Source row gone.
    expect(getMedia(db, sourceFile.id)).toBeNull();

    // Target row survives — title, notes, is_printable preserved.
    const survivor = getMedia(db, targetFile.id);
    expect(survivor).not.toBeNull();
    expect(survivor!.title).toBe('Wedding (better caption)'); // target's authored title
    expect(survivor!.notes).toBe('Authored caption on target'); // target's authored notes
    expect(survivor!.is_printable).toBeTruthy();
    // ...but file_ref now points at source's file.
    expect(survivor!.file_ref).toBe(sourceFile.fileRef);

    // Target's prior file deleted; source's file intact.
    expect(fs.existsSync(targetFile.absPath)).toBe(false);
    expect(fs.existsSync(sourceFile.absPath)).toBe(true);
    expect(fs.readFileSync(sourceFile.absPath).toString()).toBe('SHARPER');

    expect(result.moved.file_deleted).toBe(1);
  });

  it('does not delete any file when both rows share the same file_ref', () => {
    const fileRef = path.join('family-media', 'shared.jpg');
    const absPath = path.join(mediaDir, 'shared.jpg');
    fs.writeFileSync(absPath, 'SHARED');
    const target = createMedia(db, { file_ref: fileRef, title: 'Target' });
    const source = createMedia(db, { file_ref: fileRef, title: 'Source' });

    const result = mergeMedia(db, target.id, source.id, 'source', { dbPath });

    expect(fs.existsSync(absPath)).toBe(true);
    expect(getMedia(db, target.id)?.file_ref).toBe(fileRef);
    expect(result.moved.file_deleted).toBeUndefined();
  });
});

describe('mergeMedia — undo restores DB rows AND file bytes', () => {
  it('keepFile=target: undo restores source row, link rows, region rows, AND deleted file bytes', () => {
    // Seed everything that needs to survive the round-trip.
    const targetFile = createMediaWithFile('Target', 'target-file.jpg', 'TARGET-CONTENT');
    const sourceFile = createMediaWithFile('Source', 'source-file.jpg', Buffer.from('SOURCE-CONTENT-BYTES'));
    const sourceSnapshot = getMedia(db, sourceFile.id)!;

    const person = createPerson(db, { given_name: 'Test', surname: 'Person' });
    addMediaLink(db, { media_id: sourceFile.id, entity_type: 'person', entity_id: person.id });
    runSql(db, `
      INSERT INTO media_regions (id, media_id, person_id, x, y, width, height, label)
      VALUES ('reg-undo', ?, ?, 0.2, 0.3, 0.1, 0.1, 'face')
    `, [sourceFile.id, person.id]);

    const otherMedia = createMedia(db, { file_ref: 'family-media/other.jpg', title: 'O' });
    ignoreDuplicateMedia(db, sourceFile.id, otherMedia.id);

    // Snapshot DB state pre-merge.
    const linksBefore = queryAll(db,
      'SELECT id, media_id, entity_type, entity_id, link_type, sort_order, created_at FROM media_links ORDER BY id'
    );
    const regionsBefore = queryAll(db,
      'SELECT id, media_id, person_id, x, y, width, height, label, created_at FROM media_regions ORDER BY id'
    );
    const ignoredBefore = queryAll(db,
      "SELECT entity_type, person1_id, person2_id, created_at FROM ignored_duplicates WHERE entity_type = 'media' ORDER BY person1_id, person2_id"
    );
    expect(ignoredBefore.length).toBeGreaterThan(0);

    // Merge.
    mergeMedia(db, targetFile.id, sourceFile.id, 'target', { dbPath });
    expect(getMedia(db, sourceFile.id)).toBeNull();
    expect(fs.existsSync(sourceFile.absPath)).toBe(false);

    // Undo.
    const label = undoManager.undo();
    expect(label).toBe('undo.mergeMedia');

    // Source row restored exactly.
    const sourceAfter = getMedia(db, sourceFile.id);
    expect(sourceAfter).not.toBeNull();
    expect(sourceAfter).toEqual(sourceSnapshot);

    // Target unchanged (we never rewrote it on keepFile='target').
    expect(getMedia(db, targetFile.id)?.file_ref).toBe(targetFile.fileRef);

    // Links / regions / ignored — bit-for-bit restored.
    const linksAfter = queryAll(db,
      'SELECT id, media_id, entity_type, entity_id, link_type, sort_order, created_at FROM media_links ORDER BY id'
    );
    expect(linksAfter).toEqual(linksBefore);

    const regionsAfter = queryAll(db,
      'SELECT id, media_id, person_id, x, y, width, height, label, created_at FROM media_regions ORDER BY id'
    );
    expect(regionsAfter).toEqual(regionsBefore);

    const ignoredAfter = queryAll(db,
      "SELECT entity_type, person1_id, person2_id, created_at FROM ignored_duplicates WHERE entity_type = 'media' ORDER BY person1_id, person2_id"
    );
    expect(ignoredAfter).toEqual(ignoredBefore);

    // FILE bytes restored — the load-bearing assertion this whole closure exists for.
    expect(fs.existsSync(sourceFile.absPath)).toBe(true);
    expect(fs.readFileSync(sourceFile.absPath).toString()).toBe('SOURCE-CONTENT-BYTES');
  });

  it("keepFile=source: undo restores target's prior file_ref AND target's prior file bytes", () => {
    const targetFile = createMediaWithFile('Target', 'target.jpg', 'OLD-TARGET-BYTES');
    const sourceFile = createMediaWithFile('Source', 'source.jpg', 'SOURCE-BYTES');

    mergeMedia(db, targetFile.id, sourceFile.id, 'source', { dbPath });
    expect(getMedia(db, targetFile.id)?.file_ref).toBe(sourceFile.fileRef);
    expect(fs.existsSync(targetFile.absPath)).toBe(false);

    undoManager.undo();

    // Target's file_ref reverted to its original value.
    expect(getMedia(db, targetFile.id)?.file_ref).toBe(targetFile.fileRef);
    // Source row resurrected.
    expect(getMedia(db, sourceFile.id)).not.toBeNull();
    // Target's deleted file is back, with its original bytes.
    expect(fs.existsSync(targetFile.absPath)).toBe(true);
    expect(fs.readFileSync(targetFile.absPath).toString()).toBe('OLD-TARGET-BYTES');
    // Source's file untouched throughout.
    expect(fs.existsSync(sourceFile.absPath)).toBe(true);
  });

  it('redo replays the merge', () => {
    const target = createMediaWithFile('T', 'tt.jpg', 'TT');
    const source = createMediaWithFile('S', 'ss.jpg', 'SS');

    mergeMedia(db, target.id, source.id, 'target', { dbPath });
    undoManager.undo();
    expect(getMedia(db, source.id)).not.toBeNull();
    expect(fs.existsSync(source.absPath)).toBe(true);

    undoManager.redo();
    expect(getMedia(db, source.id)).toBeNull();
    expect(fs.existsSync(source.absPath)).toBe(false);
  });
});

describe('deleteMedia — ignored_duplicates cleanup', () => {
  it('removes media-typed ignored pairs that mention the deleted id', () => {
    const a = createMedia(db, { file_ref: 'family-media/a.jpg', title: 'A' });
    const b = createMedia(db, { file_ref: 'family-media/b.jpg', title: 'B' });
    const c = createMedia(db, { file_ref: 'family-media/c.jpg', title: 'C' });
    ignoreDuplicateMedia(db, a.id, b.id);
    ignoreDuplicateMedia(db, a.id, c.id);
    expect(queryAll(db, "SELECT * FROM ignored_duplicates WHERE entity_type = 'media'")).toHaveLength(2);
    deleteMedia(db, a.id);
    expect(queryAll(db, "SELECT * FROM ignored_duplicates WHERE entity_type = 'media'")).toHaveLength(0);
  });

  it('does not touch person-typed, place-typed, or source-typed ignored rows', () => {
    const a = createMedia(db, { file_ref: 'family-media/a.jpg', title: 'A' });
    runSql(db,
      "INSERT INTO ignored_duplicates (entity_type, person1_id, person2_id) VALUES ('person', ?, ?)",
      [`aaa-${a.id.slice(0, 4)}`, `zzz-${a.id.slice(0, 4)}`]
    );
    runSql(db,
      "INSERT INTO ignored_duplicates (entity_type, person1_id, person2_id) VALUES ('place', ?, ?)",
      [`aaa-${a.id.slice(0, 4)}`, `zzz-${a.id.slice(0, 4)}`]
    );
    runSql(db,
      "INSERT INTO ignored_duplicates (entity_type, person1_id, person2_id) VALUES ('source', ?, ?)",
      [`aaa-${a.id.slice(0, 4)}`, `zzz-${a.id.slice(0, 4)}`]
    );
    deleteMedia(db, a.id);
    expect(queryAll(db, "SELECT * FROM ignored_duplicates WHERE entity_type = 'person'")).toHaveLength(1);
    expect(queryAll(db, "SELECT * FROM ignored_duplicates WHERE entity_type = 'place'")).toHaveLength(1);
    expect(queryAll(db, "SELECT * FROM ignored_duplicates WHERE entity_type = 'source'")).toHaveLength(1);
  });

  it('deleteIgnoredDuplicatesForMedia returns the number of rows deleted', () => {
    const a = createMedia(db, { file_ref: 'family-media/a.jpg', title: 'A' });
    const b = createMedia(db, { file_ref: 'family-media/b.jpg', title: 'B' });
    const c = createMedia(db, { file_ref: 'family-media/c.jpg', title: 'C' });
    ignoreDuplicateMedia(db, a.id, b.id);
    ignoreDuplicateMedia(db, a.id, c.id);
    const n = deleteIgnoredDuplicatesForMedia(db, a.id);
    expect(n).toBe(2);
  });
});

describe('FK self-check — every media.id reference must be handled by mergeMedia', () => {
  // Reads src/api/schema.ts, finds every column that references media(id),
  // and asserts that mergeMedia' source code mentions each (table, column)
  // pair. Fails when a future schema change adds a new FK to media.id
  // without updating mergeMedia.

  const repoRoot = join(__dirname, '..', '..');
  const schema = readFileSync(join(repoRoot, 'src/api/schema.ts'), 'utf8');
  const merge = readFileSync(join(repoRoot, 'src/api/duplicates.ts'), 'utf8');

  it('schema references to media.id we expect to find', () => {
    const fkRefs = extractFkReferencesToMedia(schema);
    expect(fkRefs).toEqual(
      expect.arrayContaining([
        { table: 'media_links', column: 'media_id' },
        { table: 'media_regions', column: 'media_id' },
      ])
    );
  });

  it('mergeMedia handles every FK column that references media.id', () => {
    const fkRefs = extractFkReferencesToMedia(schema);
    const mergeBlockMatch = merge.match(/export function mergeMedia[\s\S]*?\n}\n/m);
    expect(mergeBlockMatch).not.toBeNull();
    const mergeBlock = mergeBlockMatch![0];

    for (const { table, column } of fkRefs) {
      const updateRegex = new RegExp(`UPDATE\\s+${table}\\s+SET\\s+${column}\\s*=`, 'i');
      const selectRegex = new RegExp(`FROM\\s+${table}[\\s\\S]{0,200}?WHERE\\s+${column}\\s*=`, 'i');
      const handles = updateRegex.test(mergeBlock) || selectRegex.test(mergeBlock);
      expect(handles, `mergeMedia must handle ${table}.${column} (FK to media.id)`).toBe(true);
    }
  });

  it("media_links.entity_type does NOT include 'media' (a media row isn't its own host)", () => {
    // Confirms the design assumption that mergeMedia does NOT need a
    // polymorphic `entity_type='media'` filter on media_links — because
    // 'media' is not a writable entity_type for that polymorphic column.
    const checkRegex = /entity_type\s+TEXT\s+NOT\s+NULL\s+CHECK\(entity_type\s+IN\s*\(([^)]+)\)\)/g;
    let foundMediaLinksCheck = false;
    for (const m of schema.matchAll(checkRegex)) {
      // We only want the media_links table's CHECK — narrow by surrounding context.
      const idx = m.index ?? 0;
      const window = schema.slice(Math.max(0, idx - 200), idx);
      if (/CREATE TABLE\s+(IF NOT EXISTS\s+)?media_links/.test(window)) {
        foundMediaLinksCheck = true;
        const allowed = m[1];
        expect(allowed).not.toMatch(/'media'/);
      }
    }
    expect(foundMediaLinksCheck).toBe(true);
  });
});

function extractFkReferencesToMedia(schema: string): Array<{ table: string; column: string }> {
  const refs: Array<{ table: string; column: string }> = [];
  const tableRegex = /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(\w+)\s*\(([\s\S]*?)\);/g;
  for (const tm of schema.matchAll(tableRegex)) {
    const table = tm[1];
    const body = tm[2];
    const colRegex = /^\s*(\w+)\s+[^,]*?REFERENCES\s+media\s*\(\s*id\s*\)/gim;
    for (const cm of body.matchAll(colRegex)) {
      if (cm[1] === 'id') continue;
      refs.push({ table, column: cm[1] });
    }
  }
  const alterRegex = /ALTER TABLE\s+(\w+)\s+ADD COLUMN\s+(\w+)[^`]*?REFERENCES\s+media\s*\(\s*id\s*\)/gi;
  for (const am of schema.matchAll(alterRegex)) {
    refs.push({ table: am[1], column: am[2] });
  }
  const seen = new Set<string>();
  return refs.filter(r => {
    const k = `${r.table}.${r.column}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

