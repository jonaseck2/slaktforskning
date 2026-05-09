/**
 * End-to-end RootsMagic import test against real .rmgc files in
 * `export-import/samples/native-binary/` (gitignored). Skipped when the
 * fixtures aren't present so CI passes without them.
 */
import { existsSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { importFromRootsMagic } from '../../src/import/rootsmagic';
import { listPersons } from '../../src/api/persons';
import { listRelationships } from '../../src/api/relationships';
import { listSources } from '../../src/api/sources';
import { listPlaces } from '../../src/api/places';
import { createTestDb } from './helpers';

const SAMPLES = [
  '/Users/jonasahnstedt/git/slaktforskning/export-import/samples/native-binary/rootsmagic-Rootstest.rmgc',
  '/Users/jonasahnstedt/git/slaktforskning/export-import/samples/native-binary/rootsmagic-analyzer.rmgc',
];

describe.skipIf(!SAMPLES.every(existsSync))('RootsMagic import — real .rmgc samples', () => {
  for (const path of SAMPLES) {
    it(`imports ${path.split('/').pop()} without throwing`, async () => {
      const db = createTestDb();
      const result = await importFromRootsMagic(db, path);
      expect(result.summary.persons).toBeGreaterThan(0);
      // Sanity: the DB ended up with the same number of person rows as the report says.
      expect(listPersons(db).length).toBe(result.summary.persons);
      // No empty-string-name persons (createPerson would have thrown if names landed wrong).
      expect(listPersons(db).every(p => (p.given_name?.length ?? 0) + (p.surname?.length ?? 0) > 0)).toBe(true);
      // Print summary so a human running the suite can spot regressions.
      console.log(`  ${path.split('/').pop()}: persons=${result.summary.persons}, fams=${result.summary.coupleRelationships}, events=${result.summary.events}, places=${listPlaces(db).length}, sources=${listSources(db).length}, rels=${listRelationships(db).length}`);
    });
  }
});
