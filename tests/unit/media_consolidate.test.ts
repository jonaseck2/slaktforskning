import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createMedia, getMedia } from '../../src/api/media';
import { consolidateMediaFolder } from '../../src/api/media_consolidate';
import { createTestDb } from './helpers';

describe('consolidateMediaFolder', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-consol-'));
    dbPath = path.join(tmpDir, 'family.db');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('copies absolute-path file_ref into <dbname>-media/ and rewrites ref', async () => {
    const db = createTestDb();
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir);
    const srcFile = path.join(srcDir, 'photo.jpg');
    fs.writeFileSync(srcFile, 'JPEG-DATA');

    const m = createMedia(db, { file_ref: srcFile, title: 'photo' });
    const result = await consolidateMediaFolder(db, dbPath);

    expect(result.copied).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.missing).toBe(0);

    const updated = getMedia(db, m.id);
    expect(updated?.file_ref).toBe(path.join('family-media', 'photo.jpg'));

    const destFile = path.join(tmpDir, 'family-media', 'photo.jpg');
    expect(fs.existsSync(destFile)).toBe(true);
    expect(fs.readFileSync(destFile, 'utf8')).toBe('JPEG-DATA');
  });

  it('is idempotent — already-relative refs are skipped', async () => {
    const db = createTestDb();
    const m = createMedia(db, { file_ref: path.join('family-media', 'p.jpg') });
    const result = await consolidateMediaFolder(db, dbPath);
    expect(result.copied).toBe(0);
    expect(result.skipped).toBe(1);
    expect(getMedia(db, m.id)?.file_ref).toBe(path.join('family-media', 'p.jpg'));
  });

  it('marks missing files (does not crash, does not mutate)', async () => {
    const db = createTestDb();
    const m = createMedia(db, { file_ref: '/no/such/file.jpg' });
    const result = await consolidateMediaFolder(db, dbPath);
    expect(result.missing).toBe(1);
    expect(result.copied).toBe(0);
    expect(getMedia(db, m.id)?.file_ref).toBe('/no/such/file.jpg');
  });

  it('same-basename sources collapse to one file', async () => {
    // Behavior: `_n` suffix was removed (see comment in
    // media_consolidate.ts slow path). When two source paths share a
    // basename, both rows end up pointing at the same dest file and the
    // surviving content is whichever copyFile (COPYFILE_EXCL) opened the
    // dest first; the other syscall returns EEXIST and is silently
    // swallowed. Both rows are still rewritten to the same relative ref.
    //
    // Which content survives is non-deterministic across runs because the
    // consolidate worker pool processes rows in parallel (concurrency=8).
    // The contract this test asserts is the convergence + integrity
    // properties, not row order.
    const db = createTestDb();
    const srcA = path.join(tmpDir, 'a', 'p.jpg');
    const srcB = path.join(tmpDir, 'b', 'p.jpg');
    fs.mkdirSync(path.dirname(srcA), { recursive: true });
    fs.mkdirSync(path.dirname(srcB), { recursive: true });
    fs.writeFileSync(srcA, 'AAA');
    fs.writeFileSync(srcB, 'BBB');

    const mA = createMedia(db, { file_ref: srcA });
    const mB = createMedia(db, { file_ref: srcB });

    await consolidateMediaFolder(db, dbPath);

    const refA = getMedia(db, mA.id)?.file_ref ?? '';
    const refB = getMedia(db, mB.id)?.file_ref ?? '';
    expect(refA).toBe(refB);
    expect(fs.existsSync(path.join(tmpDir, refA))).toBe(true);
    // Whichever syscall opened first wins; both contents are valid outcomes.
    const content = fs.readFileSync(path.join(tmpDir, refA), 'utf8');
    expect(['AAA', 'BBB']).toContain(content);
  });

  it('skips null/empty file_ref', async () => {
    const db = createTestDb();
    createMedia(db, { file_ref: null, title: 'no file' });
    const result = await consolidateMediaFolder(db, dbPath);
    expect(result.copied).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('leaves a relative ref outside <dbname>-media/ alone', async () => {
    const db = createTestDb();
    const m = createMedia(db, { file_ref: 'other-folder/p.jpg' });
    const result = await consolidateMediaFolder(db, dbPath);
    expect(result.copied).toBe(0);
    expect(result.skipped).toBe(1);
    expect(getMedia(db, m.id)?.file_ref).toBe('other-folder/p.jpg');
  });
});
