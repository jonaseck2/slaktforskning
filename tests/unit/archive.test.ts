import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { unzipSync } from 'fflate';
import type { Database } from 'node-sqlite3-wasm';
import { createMedia, addMediaLink } from '../../src/api/media';
import { exportArchive } from '../../src/api/archive_export';
import { importArchive } from '../../src/api/archive_import';
import { createPerson } from '../../src/api/persons';
import { createTestDb } from './helpers';

let db: Database;
let tmpDir: string;

beforeEach(async () => {
  db = await createTestDb();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('archive export', async () => {
  it('creates a zip with a .ged file when no media exists', async () => {
    await createPerson(db, { given_name: 'Anna', surname: 'Svensson', sex: 'F' });
    const outputPath = path.join(tmpDir, 'test.zip');
    const dbDir = tmpDir; // no media dir needed

    const report = await exportArchive(db, outputPath, dbDir);

    expect(fs.existsSync(outputPath)).toBe(true);
    expect(report.mediaCount).toBe(0);
    expect(report.missingMedia).toEqual([]);
    expect(report.gedcomReport.persons).toBe(1);

    // Verify zip contents
    const zipData = new Uint8Array(fs.readFileSync(outputPath));
    const entries = unzipSync(zipData);
    expect(entries['family_tree.ged']).toBeDefined();
    const gedContent = Buffer.from(entries['family_tree.ged']).toString('utf-8');
    expect(gedContent).toContain('Anna');
    expect(gedContent).toContain('Svensson');
  });

  it('includes media files and rewrites paths in GEDCOM', async () => {
    const person = await createPerson(db, { given_name: 'Erik', surname: 'Johansson' });

    // Create a media file on disk
    const mediaDir = path.join(tmpDir, 'media');
    fs.mkdirSync(mediaDir, { recursive: true });
    fs.writeFileSync(path.join(mediaDir, 'photo.jpg'), 'fake-jpeg-data');

    const media = await createMedia(db, {
      file_ref: 'media/photo.jpg',
      title: 'Photo of Erik',
      format: 'jpg',
    });
    await addMediaLink(db, {
      media_id: media.id,
      entity_type: 'person',
      entity_id: person.id,
    });

    const outputPath = path.join(tmpDir, 'test-with-media.zip');
    const report = await exportArchive(db, outputPath, tmpDir);

    expect(report.mediaCount).toBe(1);
    expect(report.missingMedia).toEqual([]);

    // Verify zip contents
    const zipData = new Uint8Array(fs.readFileSync(outputPath));
    const entries = unzipSync(zipData);
    expect(entries['family_tree.ged']).toBeDefined();
    expect(entries['media/photo.jpg']).toBeDefined();
    expect(Buffer.from(entries['media/photo.jpg']).toString()).toBe('fake-jpeg-data');

    // Verify GEDCOM contains the media path
    const gedContent = Buffer.from(entries['family_tree.ged']).toString('utf-8');
    expect(gedContent).toContain('FILE media/photo.jpg');
  });

  it('reports missing media files', async () => {
    await createPerson(db, { given_name: 'Nils', surname: 'Nilsson' });
    await createMedia(db, {
      file_ref: 'media/missing.jpg',
      title: 'Missing photo',
      format: 'jpg',
    });

    const outputPath = path.join(tmpDir, 'test-missing.zip');
    const report = await exportArchive(db, outputPath, tmpDir);

    expect(report.mediaCount).toBe(0);
    expect(report.missingMedia).toEqual(['media/missing.jpg']);
  });

  it('handles duplicate filenames', async () => {
    const person = await createPerson(db, { given_name: 'Karin', surname: 'Larsson' });

    // Create two media files with same name but different directories
    const dir1 = path.join(tmpDir, 'media');
    const dir2 = path.join(tmpDir, 'other');
    fs.mkdirSync(dir1, { recursive: true });
    fs.mkdirSync(dir2, { recursive: true });
    fs.writeFileSync(path.join(dir1, 'photo.jpg'), 'data1');
    fs.writeFileSync(path.join(dir2, 'photo.jpg'), 'data2');

    const m1 = await createMedia(db, { file_ref: 'media/photo.jpg', title: 'Photo 1', format: 'jpg' });
    const m2 = await createMedia(db, { file_ref: 'other/photo.jpg', title: 'Photo 2', format: 'jpg' });
    await addMediaLink(db, { media_id: m1.id, entity_type: 'person', entity_id: person.id });
    await addMediaLink(db, { media_id: m2.id, entity_type: 'person', entity_id: person.id });

    const outputPath = path.join(tmpDir, 'test-dupes.zip');
    const report = await exportArchive(db, outputPath, tmpDir);

    expect(report.mediaCount).toBe(2);

    const zipData = new Uint8Array(fs.readFileSync(outputPath));
    const entries = unzipSync(zipData);
    // Should have both files with different names
    const mediaFiles = Object.keys(entries).filter(k => k.startsWith('media/'));
    expect(mediaFiles).toHaveLength(2);
  });
});

describe('archive import', async () => {
  it('imports GEDCOM and media from a zip', async () => {
    // First export an archive
    const person = await createPerson(db, { given_name: 'Lisa', surname: 'Berg' });
    const mediaDir = path.join(tmpDir, 'media');
    fs.mkdirSync(mediaDir, { recursive: true });
    fs.writeFileSync(path.join(mediaDir, 'doc.png'), 'png-content');

    const media = await createMedia(db, {
      file_ref: 'media/doc.png',
      title: 'Document',
      format: 'png',
    });
    await addMediaLink(db, {
      media_id: media.id,
      entity_type: 'person',
      entity_id: person.id,
    });

    const archivePath = path.join(tmpDir, 'roundtrip.zip');
    await exportArchive(db, archivePath, tmpDir);

    // Now import into a fresh database
    const db2 = await createTestDb();
    const importMediaDir = path.join(tmpDir, 'imported-media');

    const report = await importArchive(db2, archivePath, importMediaDir);

    expect(report.gedcomReport.persons).toBe(1);
    expect(report.mediaImported).toBe(1);
    expect(report.mediaSkipped).toEqual([]);

    // Verify media file was extracted
    expect(fs.existsSync(path.join(importMediaDir, 'doc.png'))).toBe(true);
    expect(fs.readFileSync(path.join(importMediaDir, 'doc.png'), 'utf-8')).toBe('png-content');
  });

  it('throws when archive contains no .ged file', async () => {
    // Create a zip with no .ged file
    const { zipSync } = require('fflate');
    const zipData = zipSync({ 'readme.txt': new Uint8Array(Buffer.from('hello')) });
    const archivePath = path.join(tmpDir, 'no-ged.zip');
    fs.writeFileSync(archivePath, zipData);

    const db2 = await createTestDb();
    await expect(await importArchive(db2, archivePath, path.join(tmpDir, 'media'))).rejects.toThrow('No .ged file found');
  });

  it('imports .ged file from a subdirectory in the archive', async () => {
    const { zipSync } = require('fflate');
    // Create a minimal GEDCOM in a subdirectory
    const gedContent = [
      '0 HEAD',
      '1 SOUR Test',
      '1 GEDC',
      '2 VERS 5.5.1',
      '0 @I1@ INDI',
      '1 NAME Johan /Eriksson/',
      '1 SEX M',
      '0 TRLR',
    ].join('\r\n');
    const zipData = zipSync({
      'subdir/family.ged': new Uint8Array(Buffer.from(gedContent, 'utf-8')),
    });
    const archivePath = path.join(tmpDir, 'subdir-ged.zip');
    fs.writeFileSync(archivePath, zipData);

    const db2 = await createTestDb();
    const report = await importArchive(db2, archivePath, path.join(tmpDir, 'media'));
    expect(report.gedcomReport.persons).toBe(1);
  });

  it('handles file collision in media directory', async () => {
    const { zipSync } = require('fflate');
    const gedContent = [
      '0 HEAD',
      '1 SOUR Test',
      '1 GEDC',
      '2 VERS 5.5.1',
      '0 TRLR',
    ].join('\r\n');
    const zipData = zipSync({
      'family.ged': new Uint8Array(Buffer.from(gedContent, 'utf-8')),
      'media/photo.jpg': new Uint8Array(Buffer.from('new-content')),
    });
    const archivePath = path.join(tmpDir, 'collision.zip');
    fs.writeFileSync(archivePath, zipData);

    // Pre-create the media directory with a file that has the same name
    const importMediaDir = path.join(tmpDir, 'collision-media');
    fs.mkdirSync(importMediaDir, { recursive: true });
    fs.writeFileSync(path.join(importMediaDir, 'photo.jpg'), 'existing-content');

    const db2 = await createTestDb();
    const report = await importArchive(db2, archivePath, importMediaDir);
    expect(report.mediaImported).toBe(1);

    // Original file should be preserved
    expect(fs.readFileSync(path.join(importMediaDir, 'photo.jpg'), 'utf-8')).toBe('existing-content');
    // New file should be renamed with timestamp suffix
    const files = fs.readdirSync(importMediaDir);
    expect(files.length).toBe(2);
    const renamedFile = files.find(f => f !== 'photo.jpg')!;
    expect(renamedFile).toMatch(/^photo_\d+\.jpg$/);
    expect(fs.readFileSync(path.join(importMediaDir, renamedFile), 'utf-8')).toBe('new-content');
  });
});
