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

  it('handles name conflicts by appending a numeric suffix', async () => {
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
    expect(refA).not.toBe(refB);
    expect(fs.existsSync(path.join(tmpDir, refA))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, refB))).toBe(true);
    expect(fs.readFileSync(path.join(tmpDir, refA), 'utf8')).toBe('AAA');
    expect(fs.readFileSync(path.join(tmpDir, refB), 'utf8')).toBe('BBB');
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
