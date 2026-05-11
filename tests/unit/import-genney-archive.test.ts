/**
 * Tests for Genney archive extraction (.gcc / .backup).
 *
 * These tests exercise the zip extraction layer of importFromGenney.
 * They do NOT need Docker/Java because:
 *   - A zip with only a .ged file (no Derby service.properties) triggers the
 *     GEDCOM fallback path, which returns immediately with gedcomFallbackPath set.
 *   - A zip with no .ged and no Derby dir throws an error before any Derby ops.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, afterEach } from 'vitest';
import { importFromGenney } from '../../src/import/genney';
import { createTestDb } from './helpers';

const { zipSync } = require('fflate') as typeof import('fflate');

const MINIMAL_GED = `0 HEAD\n1 GEDC\n2 VERS 5.5\n0 @I1@ INDI\n1 NAME Lars /Test/\n0 TRLR`;

const tmpFiles: string[] = [];

function writeZip(entries: Record<string, Uint8Array>, ext: string = '.gcc'): string {
  const zipped = zipSync(entries);
  const tmp = path.join(os.tmpdir(), `test-genney-${Date.now()}${ext}`);
  fs.writeFileSync(tmp, zipped);
  tmpFiles.push(tmp);
  return tmp;
}

afterEach(() => {
  for (const f of tmpFiles.splice(0)) {
    try { fs.unlinkSync(f); } catch { /* ignore */ }
  }
});

describe('Genney archive extraction — .gcc', async () => {
  it('returns gedcomFallbackPath when zip contains only a .ged file', async () => {
    const db = await createTestDb();
    const archivePath = writeZip({
      'export.ged': new TextEncoder().encode(MINIMAL_GED),
    }, '.gcc');

    const result = await importFromGenney(db, archivePath);
    expect(result.gedcomFallbackPath).toBeTruthy();
    expect(result.gedcomFallbackPath).toMatch(/\.ged$/);
    // summary should be empty (no Derby import performed)
    expect(result.summary.persons).toBe(0);
  });

  it('returns gedcomFallbackPath when zip has .backup extension', async () => {
    const db = await createTestDb();
    const archivePath = writeZip({
      'export.ged': new TextEncoder().encode(MINIMAL_GED),
    }, '.backup');

    const result = await importFromGenney(db, archivePath);
    expect(result.gedcomFallbackPath).toBeTruthy();
    expect(result.summary.persons).toBe(0);
  });

  it('throws when zip contains no .ged file and no Derby database', async () => {
    const db = await createTestDb();
    const archivePath = writeZip({
      'readme.txt': new TextEncoder().encode('no ged here'),
    }, '.gcc');

    await expect(importFromGenney(db, archivePath)).rejects.toThrow(/no.*gedcom.*fallback/i);
  });
});
