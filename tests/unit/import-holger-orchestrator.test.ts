import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { zipSync } from 'fflate';
import { importFromHolger } from '../../src/import/holger/index';
import { createTestDb } from './helpers';

const MIN_GED = `0 HEAD
1 GEDC
2 VERS 5.5
0 @I1@ INDI
1 NAME Anna /Lindström/
1 SEX F
0 TRLR`;

const MIN_GED_TWO_PERSONS = `0 HEAD
1 GEDC
2 VERS 5.5
0 @I1@ INDI
1 NAME Anna /Lindström/
1 SEX F
0 @I2@ INDI
1 NAME Erik /Svensson/
1 SEX M
0 TRLR`;

let tmpDir: string;
let db: ReturnType<typeof createTestDb>;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holger-test-'));
  db = await createTestDb();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('importFromHolger — .ged direct path', async () => {
  it('imports a .ged file directly and returns gedPath + report', async () => {
    const gedPath = path.join(tmpDir, 'tree.ged');
    fs.writeFileSync(gedPath, MIN_GED);

    const result = await importFromHolger(db, { sourcePath: gedPath });

    expect(result.gedPath).toBe(gedPath);
    expect(result.report).toBeDefined();
    expect(result.report.persons).toBe(1);

    // Assert DB state, not just return value
    const persons = db.prepare('SELECT * FROM persons').all([]) as unknown[];
    expect(persons).toHaveLength(1);
  });

  it('returns correct person name from .ged file', async () => {
    const gedPath = path.join(tmpDir, 'tree.ged');
    fs.writeFileSync(gedPath, MIN_GED);

    await importFromHolger(db, { sourcePath: gedPath });

    const names = db.prepare('SELECT given_name, surname FROM person_names').all([]) as Array<{ given_name: string; surname: string }>;
    expect(names).toHaveLength(1);
    expect(names[0].given_name).toBe('Anna');
    expect(names[0].surname).toBe('Lindström');
  });
});

describe('importFromHolger — .zip path', async () => {
  it('extracts and imports from a .zip, using the largest .ged inside', async () => {
    const small = new TextEncoder().encode(MIN_GED);
    const big = new TextEncoder().encode(MIN_GED_TWO_PERSONS);
    const zipBytes = zipSync({ 'small.ged': small, 'big.ged': big });
    const zipPath = path.join(tmpDir, 'export.zip');
    fs.writeFileSync(zipPath, Buffer.from(zipBytes));

    const result = await importFromHolger(db, { sourcePath: zipPath });

    // Should pick the larger .ged (big.ged with 2 persons)
    expect(path.basename(result.gedPath)).toBe('big.ged');
    expect(result.report.persons).toBe(2);

    const persons = db.prepare('SELECT * FROM persons').all([]) as unknown[];
    expect(persons).toHaveLength(2);
  });

  it('throws HOLGER_EXPORT_INSTRUCTIONS for a zip with no .ged files', async () => {
    const zipBytes = zipSync({ 'readme.txt': new TextEncoder().encode('hello') });
    const zipPath = path.join(tmpDir, 'empty.zip');
    fs.writeFileSync(zipPath, Buffer.from(zipBytes));

    await expect(importFromHolger(db, { sourcePath: zipPath }))
      .rejects.toThrow(/Export from Holger/);
  });
});

describe('importFromHolger — folder scan', async () => {
  it('walks a folder recursively to find a .ged file', async () => {
    const sub = path.join(tmpDir, 'a', 'b');
    fs.mkdirSync(sub, { recursive: true });
    const gedPath = path.join(sub, 'inner.ged');
    fs.writeFileSync(gedPath, MIN_GED);

    const result = await importFromHolger(db, { sourcePath: tmpDir });

    expect(result.gedPath).toBe(gedPath);
    expect(result.report.persons).toBe(1);

    const persons = db.prepare('SELECT * FROM persons').all([]) as unknown[];
    expect(persons).toHaveLength(1);
  });

  it('picks the largest .ged when multiple are found in a folder', async () => {
    const subA = path.join(tmpDir, 'a');
    const subB = path.join(tmpDir, 'b');
    fs.mkdirSync(subA);
    fs.mkdirSync(subB);

    fs.writeFileSync(path.join(subA, 'small.ged'), MIN_GED);
    fs.writeFileSync(path.join(subB, 'big.ged'), MIN_GED_TWO_PERSONS);

    const result = await importFromHolger(db, { sourcePath: tmpDir });

    expect(path.basename(result.gedPath)).toBe('big.ged');
    expect(result.report.persons).toBe(2);
  });

  it('throws HOLGER_EXPORT_INSTRUCTIONS for an empty folder', async () => {
    await expect(importFromHolger(db, { sourcePath: tmpDir }))
      .rejects.toThrow(/Export from Holger/);
  });

  it('throws with "No GEDCOM file found" message for empty folder', async () => {
    await expect(importFromHolger(db, { sourcePath: tmpDir }))
      .rejects.toThrow('No GEDCOM file found');
  });
});

describe('importFromHolger — onProgress callback', async () => {
  it('invokes onProgress at least once during .ged import', async () => {
    const gedPath = path.join(tmpDir, 'tree.ged');
    fs.writeFileSync(gedPath, MIN_GED);

    const messages: string[] = [];
    await importFromHolger(db, {
      sourcePath: gedPath,
      onProgress: (m) => messages.push(m),
    });

    expect(messages.length).toBeGreaterThan(0);
  });

  it('onProgress receives "Reading GEDCOM" and "Done" messages for .ged', async () => {
    const gedPath = path.join(tmpDir, 'tree.ged');
    fs.writeFileSync(gedPath, MIN_GED);

    const messages: string[] = [];
    await importFromHolger(db, {
      sourcePath: gedPath,
      onProgress: (m) => messages.push(m),
    });

    expect(messages.some(m => m.includes('Reading GEDCOM'))).toBe(true);
    expect(messages.some(m => m.includes('Done'))).toBe(true);
  });

  it('onProgress receives "Extracting zip" message when processing a zip', async () => {
    const gedBytes = new TextEncoder().encode(MIN_GED);
    const zipBytes = zipSync({ 'tree.ged': gedBytes });
    const zipPath = path.join(tmpDir, 'export.zip');
    fs.writeFileSync(zipPath, Buffer.from(zipBytes));

    const messages: string[] = [];
    await importFromHolger(db, {
      sourcePath: zipPath,
      onProgress: (m) => messages.push(m),
    });

    expect(messages.some(m => m.includes('Extracting zip'))).toBe(true);
  });

  it('onProgress receives "Found" message when processing a folder', async () => {
    const gedPath = path.join(tmpDir, 'tree.ged');
    fs.writeFileSync(gedPath, MIN_GED);

    const messages: string[] = [];
    await importFromHolger(db, {
      sourcePath: tmpDir,
      onProgress: (m) => messages.push(m),
    });

    expect(messages.some(m => m.includes('Found') && m.includes('in folder'))).toBe(true);
  });
});

describe('importFromHolger — mediaDir remapping', async () => {
  it('remaps Windows-style FILE paths to mediaDir when mediaDir is provided', async () => {
    const gedWithMedia = `0 HEAD
1 GEDC
2 VERS 5.5
0 @I1@ INDI
1 NAME Kalle /Svensson/
1 SEX M
1 OBJE
2 FORM JPG
2 TITL Portrait
2 FILE C:\\OurKind\\Media\\P12\\portrait.jpg
0 TRLR`;

    const gedPath = path.join(tmpDir, 'tree.ged');
    fs.writeFileSync(gedPath, gedWithMedia);
    const mediaDir = path.join(tmpDir, 'media');

    await importFromHolger(db, { sourcePath: gedPath, mediaDir });

    const row = db.prepare('SELECT file_ref FROM media LIMIT 1').get([]) as { file_ref: string } | undefined;
    expect(row).toBeDefined();
    expect(row?.file_ref).toContain(mediaDir);
    expect(row?.file_ref).toContain('portrait.jpg');
  });

  it('keeps FILE path as-is when no mediaDir is provided', async () => {
    const gedWithMedia = `0 HEAD
1 GEDC
2 VERS 5.5
0 @I1@ INDI
1 NAME Kalle /Svensson/
1 SEX M
1 OBJE
2 FORM JPG
2 TITL Portrait
2 FILE C:\\OurKind\\Media\\P12\\portrait.jpg
0 TRLR`;

    const gedPath = path.join(tmpDir, 'tree.ged');
    fs.writeFileSync(gedPath, gedWithMedia);

    await importFromHolger(db, { sourcePath: gedPath });

    const row = db.prepare('SELECT file_ref FROM media LIMIT 1').get([]) as { file_ref: string } | undefined;
    expect(row).toBeDefined();
    expect(row?.file_ref).toContain('portrait.jpg');
  });
});

describe('importFromHolger — unsupported file type', async () => {
  it('throws for an unsupported file extension', async () => {
    const badPath = path.join(tmpDir, 'tree.xml');
    fs.writeFileSync(badPath, '<gedcom/>');

    await expect(importFromHolger(db, { sourcePath: badPath }))
      .rejects.toThrow(/Unsupported file/);
  });
});
