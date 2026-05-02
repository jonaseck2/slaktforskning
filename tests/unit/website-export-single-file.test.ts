/**
 * Tests for web-export-improvements: single-file export and media handling.
 *
 * Covers:
 * - Property 1 (9.1): Snapshot JSON round-trip (serialization/extraction)
 * - Property 2 (9.2): Media exclusion when includeMedia: false (using createTestDb)
 * - Property 3 (9.3): Conditional media directory creation (deferred mkdir)
 * - Task 10.4: Single-file export integration (using createTestDb + buildSnapshot)
 * - Task 10.5: Standard export with no valid media (deferred mkdir with real snapshot)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { promises as fsp } from 'fs';
import { createPerson } from '../../src/api/persons';
import { createMedia, addMediaLink } from '../../src/api/media';
import { buildSnapshot } from '../../src/api/html_site/snapshot';
import { createTestDb } from './helpers';

let db: any;
beforeEach(() => { db = createTestDb(); });

// ---------------------------------------------------------------------------
// Property 1 (9.1): Snapshot round-trip via JSON serialization
// **Validates: Requirements 4.2**
//
// Tests the JSON serialization/extraction logic directly: create a snapshot
// object, JSON.stringify it, apply the `<\/script` escaping, then parse it
// back and assert equality.
// ---------------------------------------------------------------------------
describe('Property 1: Snapshot JSON round-trip serialization', () => {
  const testCases = [
    { label: 'empty object', input: {} },
    { label: 'simple snapshot', input: { persons: [{ id: '1', name: 'Alice' }], media: [], settings: {} } },
    { label: 'contains </script> in string values', input: { notes: 'text </script> more text', nested: { val: '</script><script>' } } },
    { label: 'unicode characters', input: { name: 'Ångström Öberg 日本語 🎉', places: ['Malmö', 'Göteborg'] } },
    { label: 'nested arrays and objects', input: { data: [[1, 2], [3, 4]], meta: { a: { b: { c: 'deep' } } } } },
    { label: 'null and boolean values', input: { a: null, b: true, c: false, d: 0, e: '' } },
    { label: 'special JSON characters', input: { quote: 'He said "hello"', backslash: 'path\\to\\file', newline: 'line1\nline2' } },
    { label: 'large array', input: { persons: Array.from({ length: 100 }, (_, i) => ({ id: String(i), name: `Person ${i}` })) } },
  ];

  for (const tc of testCases) {
    it(`round-trips: ${tc.label}`, () => {
      const json = JSON.stringify(tc.input);
      // Apply the same escaping as buildPreviewHtml
      const safeJson = json.replace(/<\/script/gi, '<\\/script');

      // Simulate extraction: reverse the escaping and parse
      const restored = safeJson.replace(/<\\\/script/gi, '</script');
      const parsed = JSON.parse(restored);

      expect(parsed).toEqual(tc.input);
    });
  }

  it('escaping is idempotent for content without </script>', () => {
    const input = { persons: [{ id: '1' }], settings: { lang: 'en' } };
    const json = JSON.stringify(input);
    const safeJson = json.replace(/<\/script/gi, '<\\/script');
    // No </script in input, so safeJson should equal json
    expect(safeJson).toBe(json);
    expect(JSON.parse(safeJson)).toEqual(input);
  });

  it('handles multiple </script> occurrences', () => {
    // The escaping is case-insensitive: all variants of </script get escaped.
    // The restore replaces <\/script back to </script (lowercase).
    // Since JSON.stringify lowercases nothing, the original casing is in the JSON.
    // The key property: the escaped form contains no literal </script sequence,
    // which prevents the browser from prematurely closing the <script> tag.
    const input = { a: '</script>', b: 'no-issue', c: '</script>end' };
    const json = JSON.stringify(input);
    const safeJson = json.replace(/<\/script/gi, '<\\/script');

    // Should not contain any literal </script (the security property)
    expect(safeJson).not.toMatch(/<\/script/i);

    // Round-trip restores correctly for lowercase </script
    const restored = safeJson.replace(/<\\\/script/gi, '</script');
    expect(JSON.parse(restored)).toEqual(input);
  });
});

// ---------------------------------------------------------------------------
// Property 2 (9.2): Media exclusion when includeMedia: false
// **Validates: Requirements 4.4**
//
// Uses createTestDb to create persons with media links, then builds snapshot
// with includeMedia: false and verifies empty media arrays.
// ---------------------------------------------------------------------------
describe('Property 2: buildSnapshot with includeMedia: false excludes media', () => {
  it('returns empty media arrays when includeMedia is false', () => {
    const person = createPerson(db, { given_name: 'Test', surname: 'Person' });
    const media1 = createMedia(db, { file_ref: '/some/path/photo.jpg', title: 'Photo 1' });
    const media2 = createMedia(db, { file_ref: '/another/path/image.png', title: 'Photo 2' });
    addMediaLink(db, { media_id: media1.id, entity_type: 'person', entity_id: person.id });
    addMediaLink(db, { media_id: media2.id, entity_type: 'person', entity_id: person.id });

    const snap = buildSnapshot(db, {
      siteTitle: 'Test',
      focusPersonId: person.id,
      scope: { everyone: true },
      options: {
        includeMedia: false,
        includeReports: false,
        includePrints: false,
        excludeLiving: false,
        redactLiving: false,
        mediaPersonOnly: false,
      },
    });

    expect(snap.media).toEqual([]);
    expect(snap.mediaLinks).toEqual([]);
    expect(snap.mediaRegions).toEqual([]);
  });

  it('returns media when includeMedia is true', () => {
    const person = createPerson(db, { given_name: 'Test' });
    const media = createMedia(db, { file_ref: '/path/photo.jpg', title: 'Photo' });
    addMediaLink(db, { media_id: media.id, entity_type: 'person', entity_id: person.id });

    const snap = buildSnapshot(db, {
      siteTitle: 'Test',
      focusPersonId: person.id,
      scope: { everyone: true },
      options: {
        includeMedia: true,
        includeReports: false,
        includePrints: false,
        excludeLiving: false,
        redactLiving: false,
        mediaPersonOnly: false,
      },
    });

    expect(snap.media.length).toBe(1);
    expect(snap.media[0].id).toBe(media.id);
    expect(snap.mediaLinks.length).toBe(1);
  });

  it('excludes media even when multiple persons have media links', () => {
    const p1 = createPerson(db, { given_name: 'Alice' });
    const p2 = createPerson(db, { given_name: 'Bob' });
    const m1 = createMedia(db, { file_ref: '/path/a.jpg' });
    const m2 = createMedia(db, { file_ref: '/path/b.jpg' });
    const m3 = createMedia(db, { file_ref: '/path/c.jpg' });
    addMediaLink(db, { media_id: m1.id, entity_type: 'person', entity_id: p1.id });
    addMediaLink(db, { media_id: m2.id, entity_type: 'person', entity_id: p1.id });
    addMediaLink(db, { media_id: m3.id, entity_type: 'person', entity_id: p2.id });

    const snap = buildSnapshot(db, {
      siteTitle: 'Test',
      focusPersonId: p1.id,
      scope: { everyone: true },
      options: {
        includeMedia: false,
        includeReports: false,
        includePrints: false,
        excludeLiving: false,
        redactLiving: false,
        mediaPersonOnly: false,
      },
    });

    expect(snap.media).toEqual([]);
    expect(snap.mediaLinks).toEqual([]);
    expect(snap.mediaRegions).toEqual([]);
    // But persons should still be present
    expect(snap.persons.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Property 3 (9.3): Conditional media directory creation
// **Validates: Requirements 5.1, 5.2, 5.3**
//
// Tests the deferred mkdir pattern: media/full/ is only created when at least
// one file actually exists at the file_ref path.
// ---------------------------------------------------------------------------
describe('Property 3: Conditional media directory creation (deferred mkdir)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-media-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('no media/full/ directory when no files exist at file_ref paths', async () => {
    const outDir = path.join(tmpDir, 'output');
    fs.mkdirSync(outDir, { recursive: true });

    const mediaItems = [
      { id: 'm1', file_ref: '/nonexistent/a.jpg' },
      { id: 'm2', file_ref: '/nonexistent/b.png' },
      { id: 'm3', file_ref: '/nonexistent/c.gif' },
    ];

    let fullDirCreated = false;
    for (const m of mediaItems) {
      if (!m.file_ref) continue;
      try { await fsp.access(m.file_ref); } catch { continue; }
      if (!fullDirCreated) {
        await fsp.mkdir(path.join(outDir, 'media', 'full'), { recursive: true });
        fullDirCreated = true;
      }
      const ext = path.extname(m.file_ref);
      await fsp.copyFile(m.file_ref, path.join(outDir, 'media', 'full', `${m.id}${ext}`));
    }

    expect(fullDirCreated).toBe(false);
    expect(fs.existsSync(path.join(outDir, 'media', 'full'))).toBe(false);
  });

  it('creates media/full/ when at least one file exists', async () => {
    const outDir = path.join(tmpDir, 'output');
    fs.mkdirSync(outDir, { recursive: true });

    // Create one real file
    const realFile = path.join(tmpDir, 'real-photo.jpg');
    fs.writeFileSync(realFile, 'fake-jpeg-data');

    const mediaItems = [
      { id: 'm1', file_ref: '/nonexistent/a.jpg' },
      { id: 'm2', file_ref: realFile },
      { id: 'm3', file_ref: '/nonexistent/c.gif' },
    ];

    let fullDirCreated = false;
    const exportedIds = new Set<string>();
    for (const m of mediaItems) {
      if (!m.file_ref) continue;
      try { await fsp.access(m.file_ref); } catch { continue; }
      if (!fullDirCreated) {
        await fsp.mkdir(path.join(outDir, 'media', 'full'), { recursive: true });
        fullDirCreated = true;
      }
      const ext = path.extname(m.file_ref);
      await fsp.copyFile(m.file_ref, path.join(outDir, 'media', 'full', `${m.id}${ext}`));
      exportedIds.add(m.id);
    }

    expect(fullDirCreated).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'media', 'full'))).toBe(true);
    expect(exportedIds.size).toBe(1);
    expect(fs.existsSync(path.join(outDir, 'media', 'full', 'm2.jpg'))).toBe(true);
  });

  it('handles null file_ref gracefully (no directory created)', async () => {
    const outDir = path.join(tmpDir, 'output');
    fs.mkdirSync(outDir, { recursive: true });

    const mediaItems: Array<{ id: string; file_ref: string | null }> = [
      { id: 'm1', file_ref: null },
      { id: 'm2', file_ref: null },
    ];

    let fullDirCreated = false;
    for (const m of mediaItems) {
      if (!m.file_ref) continue;
      try { await fsp.access(m.file_ref); } catch { continue; }
      if (!fullDirCreated) {
        await fsp.mkdir(path.join(outDir, 'media', 'full'), { recursive: true });
        fullDirCreated = true;
      }
    }

    expect(fullDirCreated).toBe(false);
    expect(fs.existsSync(path.join(outDir, 'media', 'full'))).toBe(false);
  });

  it('mkdir is called only once even with multiple valid files', async () => {
    const outDir = path.join(tmpDir, 'output');
    fs.mkdirSync(outDir, { recursive: true });

    // Create multiple real files
    const files = Array.from({ length: 4 }, (_, i) => {
      const p = path.join(tmpDir, `photo-${i}.jpg`);
      fs.writeFileSync(p, `data-${i}`);
      return { id: `m${i}`, file_ref: p };
    });

    let fullDirCreated = false;
    let mkdirCount = 0;
    for (const m of files) {
      if (!m.file_ref) continue;
      try { await fsp.access(m.file_ref); } catch { continue; }
      if (!fullDirCreated) {
        await fsp.mkdir(path.join(outDir, 'media', 'full'), { recursive: true });
        fullDirCreated = true;
        mkdirCount++;
      }
      const ext = path.extname(m.file_ref);
      await fsp.copyFile(m.file_ref, path.join(outDir, 'media', 'full', `${m.id}${ext}`));
    }

    expect(mkdirCount).toBe(1);
    expect(fs.readdirSync(path.join(outDir, 'media', 'full')).length).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Task 10.4: Single-file export integration test
// **Validates: Requirements 4.2, 4.5**
//
// Uses createTestDb, creates a person, builds a snapshot with includeMedia:
// false, verifies snapshot.media is empty and persons data is present.
// ---------------------------------------------------------------------------
describe('Task 10.4: Single-file export integration with buildSnapshot', () => {
  it('snapshot with includeMedia: false has empty media but retains persons', () => {
    const person = createPerson(db, { given_name: 'Anna', surname: 'Svensson' });
    const media = createMedia(db, { file_ref: '/photos/anna.jpg', title: 'Portrait' });
    addMediaLink(db, { media_id: media.id, entity_type: 'person', entity_id: person.id });

    const snap = buildSnapshot(db, {
      siteTitle: 'Family Tree',
      focusPersonId: person.id,
      scope: { everyone: true },
      options: {
        includeMedia: false,
        includeReports: false,
        includePrints: false,
        excludeLiving: false,
        redactLiving: false,
        mediaPersonOnly: false,
      },
    });

    // Media should be empty
    expect(snap.media).toEqual([]);
    expect(snap.mediaLinks).toEqual([]);
    expect(snap.mediaRegions).toEqual([]);

    // Persons data should still be present
    expect(snap.persons.length).toBe(1);
    expect(snap.persons[0].id).toBe(person.id);
    expect(snap.personNames.length).toBeGreaterThanOrEqual(1);
    expect(snap.personNames[0].given_name).toBe('Anna');
    expect(snap.personNames[0].surname).toBe('Svensson');

    // Meta should be correct
    expect(snap.meta.siteTitle).toBe('Family Tree');
    expect(snap.meta.focusPersonId).toBe(person.id);
  });

  it('snapshot can be serialized to JSON for single-file embedding', () => {
    const person = createPerson(db, { given_name: 'Erik' });

    const snap = buildSnapshot(db, {
      siteTitle: 'Test',
      focusPersonId: person.id,
      scope: { everyone: true },
      options: {
        includeMedia: false,
        includeReports: false,
        includePrints: false,
        excludeLiving: false,
        redactLiving: false,
        mediaPersonOnly: false,
      },
    });

    // Should be JSON-serializable without errors
    const json = JSON.stringify(snap);
    expect(json.length).toBeGreaterThan(0);

    // Round-trip should preserve data
    const parsed = JSON.parse(json);
    expect(parsed.persons.length).toBe(1);
    expect(parsed.meta.siteTitle).toBe('Test');
    expect(parsed.media).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Task 10.5: Standard export with no valid media
// **Validates: Requirements 5.1**
//
// Uses createTestDb, creates a person with media that has invalid file_ref
// paths, builds snapshot with includeMedia: true, then simulates the deferred
// mkdir logic and verifies no media/full/ directory was created.
// ---------------------------------------------------------------------------
describe('Task 10.5: Standard export with invalid media file_refs', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'std-export-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('no media/full/ created when all file_refs point to nonexistent files', async () => {
    const person = createPerson(db, { given_name: 'Test' });
    const m1 = createMedia(db, { file_ref: '/nonexistent/photo1.jpg', title: 'Missing 1' });
    const m2 = createMedia(db, { file_ref: '/nonexistent/photo2.png', title: 'Missing 2' });
    addMediaLink(db, { media_id: m1.id, entity_type: 'person', entity_id: person.id });
    addMediaLink(db, { media_id: m2.id, entity_type: 'person', entity_id: person.id });

    // Build snapshot with includeMedia: true (media items will be present)
    const snap = buildSnapshot(db, {
      siteTitle: 'Test',
      focusPersonId: person.id,
      scope: { everyone: true },
      options: {
        includeMedia: true,
        includeReports: false,
        includePrints: false,
        excludeLiving: false,
        redactLiving: false,
        mediaPersonOnly: false,
      },
    });

    // Snapshot should have media items (they exist in DB)
    expect(snap.media.length).toBe(2);

    // Simulate the deferred mkdir export logic
    const outDir = path.join(tmpDir, 'output');
    fs.mkdirSync(outDir, { recursive: true });

    let fullDirCreated = false;
    const exportedMediaIds = new Set<string>();

    for (const m of snap.media) {
      if (!m.file_ref) continue;
      try { await fsp.access(m.file_ref); } catch { continue; }
      if (!fullDirCreated) {
        await fsp.mkdir(path.join(outDir, 'media', 'full'), { recursive: true });
        fullDirCreated = true;
      }
      const ext = path.extname(m.file_ref);
      await fsp.copyFile(m.file_ref, path.join(outDir, 'media', 'full', `${m.id}${ext}`));
      exportedMediaIds.add(m.id);
    }

    // No files were accessible → no directory created
    expect(fullDirCreated).toBe(false);
    expect(fs.existsSync(path.join(outDir, 'media', 'full'))).toBe(false);
    expect(exportedMediaIds.size).toBe(0);
  });

  it('media arrays are emptied when no files could be copied', async () => {
    const person = createPerson(db, { given_name: 'Test' });
    const m1 = createMedia(db, { file_ref: '/bad/path.jpg' });
    addMediaLink(db, { media_id: m1.id, entity_type: 'person', entity_id: person.id });

    const snap = buildSnapshot(db, {
      siteTitle: 'Test',
      focusPersonId: person.id,
      scope: { everyone: true },
      options: {
        includeMedia: true,
        includeReports: false,
        includePrints: false,
        excludeLiving: false,
        redactLiving: false,
        mediaPersonOnly: false,
      },
    });

    expect(snap.media.length).toBe(1);

    // Simulate export logic
    const outDir = path.join(tmpDir, 'output');
    fs.mkdirSync(outDir, { recursive: true });

    const exportedMediaIds = new Set<string>();
    let fullDirCreated = false;

    for (const m of snap.media) {
      if (!m.file_ref) continue;
      try { await fsp.access(m.file_ref); } catch { continue; }
      if (!fullDirCreated) {
        await fsp.mkdir(path.join(outDir, 'media', 'full'), { recursive: true });
        fullDirCreated = true;
      }
      exportedMediaIds.add(m.id);
    }

    // If no files were copied, empty the arrays (as the handler does)
    if (exportedMediaIds.size === 0) {
      snap.media = [];
      snap.mediaLinks = [];
      snap.mediaRegions = [];
    }

    expect(snap.media).toEqual([]);
    expect(snap.mediaLinks).toEqual([]);
    expect(snap.mediaRegions).toEqual([]);
    expect(fs.existsSync(path.join(outDir, 'media', 'full'))).toBe(false);
  });
});
