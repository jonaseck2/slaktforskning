// Accounting across the normalize boundary (plan 2026-11-07-normalize-boundary-accounting).
//
// User goal: a researcher who imports a GEDCOM 7.0 file is told which parts the
// app did not read, exactly as a 5.5.1 researcher is.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { parseGedcom } from '../../src/gedcom/parser';
import { importGedcom } from '../../src/import/gedcom';
import { detectGedcomVersion } from '../../src/import/gedcom/detect';
import { createTestDb } from './helpers';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = join(HERE, '../fixtures/gedcom');

// Verification 1: the spec probe. A shared note carrying LANG and TRAN.
const SNOTE_PROBE = `0 HEAD
1 GEDC
2 VERS 7.0
0 @N1@ SNOTE Anteckning om Anna
1 LANG sv
1 TRAN Note about Anna
2 LANG en
0 @I1@ INDI
1 NAME Anna /Berg/
1 SNOTE @N1@
0 TRLR
`;

describe('normalize-boundary accounting', () => {
  it('reports SNOTE.TRAN and SNOTE.TRAN.LANG and not SNOTE.LANG', async () => {
    const db = await createTestDb();
    const report = await importGedcom(db, parseGedcom(SNOTE_PROBE));
    const paths = (report.unaccountedFor ?? []).map(u => u.path);
    expect(paths, 'SNOTE.TRAN must be named in the report').toContain('SNOTE.TRAN');
    expect(paths, 'SNOTE.TRAN.LANG must be named in the report').toContain('SNOTE.TRAN.LANG');
    expect(paths, 'SNOTE.LANG is read by phases/notes.ts').not.toContain('SNOTE.LANG');
  });

  // T04 flips this to '7.0' on purpose, when detect.ts applies semver by major.
  // The plan named dialects/family-historian.ged as the 7.0.x example, but that
  // file declares GEDC.VERS 5.5.1 (7.0.13 is its SOUR.VERS), so it detects as
  // 5.5.1 and never reaches normalize. An inline file pins the real behaviour.
  it('the pre-existing 7.0.x behaviour is pinned', () => {
    const text = SNOTE_PROBE.replace('2 VERS 7.0', '2 VERS 7.0.13');
    expect(detectGedcomVersion(parseGedcom(text))).toBe('unknown');
  });

  // Verification 3: 5.5.1 is stable. The raw list equals the pinned baseline
  // minus the two paths detect.ts will now read.
  const baseline: Record<string, { path: string; count: number }[]> =
    JSON.parse(readFileSync(join(FIXTURES, 'accounting-baseline-551.json'), 'utf-8'));
  const NOW_READ = new Set(['HEAD.GEDC', 'HEAD.GEDC.VERS']);

  it('has a baseline for 20 fixtures', () => {
    expect(Object.keys(baseline).length).toBe(20);
  });

  for (const [rel, expected] of Object.entries(baseline)) {
    it(`${rel} — raw unaccountedFor equals the baseline minus HEAD.GEDC and HEAD.GEDC.VERS`, async () => {
      const db = await createTestDb();
      const report = await importGedcom(db, parseGedcom(readFileSync(join(FIXTURES, rel), 'utf-8')));
      const actual = (report.unaccountedFor ?? []).map(u => ({ path: u.path, count: u.count }));
      expect(actual).toEqual(expected.filter(e => !NOW_READ.has(e.path)));
    });
  }
});
