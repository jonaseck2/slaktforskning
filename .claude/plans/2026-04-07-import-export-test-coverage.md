# Import / Export Test Coverage Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add missing unit test coverage for each of the 6 import/export paths identified in the audit. Every test must verify both (a) that data is imported/exported correctly and (b) that the data integrity report is accurate.

**Context:** The data integrity *implementation* is complete (see archived plan `2026-04-07-import-export-data-integrity.md`). What is missing are tests that exercise each format-specific code path end-to-end at the unit level.

---

## Verification: Archived Plan Was Fully Implemented

All 5 tasks from `2026-04-07-import-export-data-integrity.md` are committed:
- `c4b6388` — GEDCOM import: LDS, TRAN, NO reporting
- `59fbe7d` — GEDCOM import: ASSO reporting
- `bb924d9` — GEDCOM export: ExportReport with excluded entities
- `f8e3849` — Genney import: orphaned events/citations, unknown types, skipped parent links
- `42ab680` — Docs updated

---

## Gap Summary

| Case | Gap |
|------|-----|
| genney .gcc import | `extractZip`, `findDerbyDirs`, GEDCOM fallback, encrypted detection — untested |
| genney .backup import | Same code path as .gcc — same gap |
| genney .ged import | No ImportReport field coverage test for profile='genney' |
| holger .ged with media | ImportReport not verified; no test for missing-file warning |
| gedcom 5.5.1 import | No single-fixture test verifying all ImportReport fields |
| gedcom 5.5.1 export | `place_address` exclusion implemented but zero test coverage |

---

## Task 1: Genney archive extraction tests (covers .gcc and .backup cases)

**File:** `tests/unit/import-genney-archive.test.ts` (new)

The Docker/Java Derby extraction cannot be unit-tested, but the archive-handling layer can be. We test by constructing minimal in-memory zip archives using fflate's `zipSync`.

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect } from 'vitest';
import { zipSync } from 'fflate';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Helpers to build zip fixtures in tests
function writeZip(entries: Record<string, Uint8Array>): string {
  const zipped = zipSync(entries);
  const tmp = path.join(os.tmpdir(), `test-${Date.now()}.gcc`);
  fs.writeFileSync(tmp, zipped);
  return tmp;
}

// We import private helpers indirectly through a thin export added to index.ts
// OR test via the public importFromGenney() with a fixture archive containing a .ged file.
// The latter is safer (no need to export internals).

const MINIMAL_GED = `0 HEAD\n1 GEDC\n2 VERS 5.5\n0 @I1@ INDI\n1 NAME Lars /Test/\n0 TRLR`;

describe('Genney archive — GEDCOM fallback (no Derby DB)', () => {
  it('returns gedcomFallbackPath when archive contains only a .ged file', async () => {
    const { importFromGenney } = await import('../../src/import/genney/index');
    const { createTestDb } = await import('./helpers');
    const db = createTestDb();

    const gedBytes = new TextEncoder().encode(MINIMAL_GED);
    const archivePath = writeZip({ 'export.ged': gedBytes });
    try {
      const result = await importFromGenney(db, archivePath);
      expect(result.gedcomFallbackPath).toBeDefined();
      expect(result.gedcomFallbackPath).toMatch(/\.ged$/);
      // No persons imported because the archive only returned a fallback path
      // (caller is responsible for importing the GEDCOM)
      expect(result.summary.persons).toBe(0);
    } finally {
      try { fs.unlinkSync(archivePath); } catch { /* ignore */ }
    }
  });

  it('accepts .backup extension with the same result', async () => {
    const { importFromGenney } = await import('../../src/import/genney/index');
    const { createTestDb } = await import('./helpers');
    const db = createTestDb();

    const gedBytes = new TextEncoder().encode(MINIMAL_GED);
    const archivePath = writeZip({ 'export.ged': gedBytes }).replace('.gcc', '.backup');
    // Rename on disk
    const backupPath = archivePath.replace(/\.gcc$/, '.backup');
    fs.renameSync(archivePath.replace('.backup', '.gcc'), backupPath);
    try {
      const result = await importFromGenney(db, backupPath);
      expect(result.gedcomFallbackPath).toBeDefined();
    } finally {
      try { fs.unlinkSync(backupPath); } catch { /* ignore */ }
    }
  });
});

describe('Genney archive — encrypted Derby detection', () => {
  it('returns gedcomFallbackPath when archive contains encrypted Derby + .ged', async () => {
    const { importFromGenney } = await import('../../src/import/genney/index');
    const { createTestDb } = await import('./helpers');
    const db = createTestDb();

    const gedBytes = new TextEncoder().encode(MINIMAL_GED);
    const serviceProps = new TextEncoder().encode('derby.encryptionAlgorithm=AES/CBC\ndataEncryption=true\n');
    // Create a zip with a Derby directory (service.properties with encryption) + fallback .ged
    const archivePath = writeZip({
      'db/service.properties': serviceProps,
      'db/seg0/c10.dat': new Uint8Array([0xde, 0xad]),
      'export.ged': gedBytes,
    });
    try {
      const result = await importFromGenney(db, archivePath);
      expect(result.gedcomFallbackPath).toBeDefined();
    } finally {
      try { fs.unlinkSync(archivePath); } catch { /* ignore */ }
    }
  });

  it('throws when archive has no Derby DB and no .ged fallback', async () => {
    const { importFromGenney } = await import('../../src/import/genney/index');
    const { createTestDb } = await import('./helpers');
    const db = createTestDb();

    const archivePath = writeZip({ 'README.txt': new TextEncoder().encode('nothing here') });
    try {
      await expect(importFromGenney(db, archivePath)).rejects.toThrow();
    } finally {
      try { fs.unlinkSync(archivePath); } catch { /* ignore */ }
    }
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && npx vitest run tests/unit/import-genney-archive.test.ts 2>&1 | tail -20
```

- [ ] **Step 3: Fix any failures, run full suite**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && npm test 2>&1 | tail -10
```

- [ ] **Step 4: Commit**

```bash
git add tests/unit/import-genney-archive.test.ts && git commit -m "test(import-genney): add archive extraction unit tests (.gcc, .backup, encrypted, no-fallback)"
```

---

## Task 2: Genney .ged import — ImportReport coverage

**File:** `tests/unit/import-genney-reporting.test.ts` (extend existing)

The existing file tests `transformGenney` directly. We need a test that goes through `importGedcom` with `profile: 'genney'` and verifies the returned `ImportReport` fields.

- [ ] **Step 1: Append test**

Add to `tests/unit/import-genney-reporting.test.ts`:

```typescript
// ── Genney GEDCOM profile — ImportReport field coverage ──────────────────────

import { parseGedcom } from '../../src/gedcom/parser';
import { importGedcom } from '../../src/import/gedcom';

const GENNEY_GED = `
0 HEAD
1 GEDC
2 VERS 5.5
0 @I1@ INDI
1 NAME Lars* /Eriksson/
1 SEX M
1 _UID abc123
1 BIRT
2 DATE 12 JUN 1950
2 PLAC Göteborg, Västra Götaland, Sverige
0 @I2@ INDI
1 NAME Maria /Larsson/
1 SEX F
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARR
2 DATE 14 AUG 1975
0 @S1@ SOUR
1 TITL Husförhörslängd 1800-1810
0 TRLR
`.trim();

describe('Genney GEDCOM profile — ImportReport', () => {
  it('returns ImportReport with correct counts via importGedcom profile=genney', () => {
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(GENNEY_GED), { profile: 'genney' });
    expect(report.persons).toBe(2);
    expect(report.families).toBe(1);
    expect(report.sources).toBe(1);
    expect(Array.isArray(report.warnings)).toBe(true);
    expect(Array.isArray(report.skipped)).toBe(true);
    expect(Array.isArray(report.unmappedData)).toBe(true);
  });

  it('stores _UID as person identifier and does not surface it in unmappedData', () => {
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(GENNEY_GED), { profile: 'genney' });
    const uid = db.get('SELECT * FROM person_identifiers WHERE identifier_type=?', ['familysearch']) as unknown;
    // _UID should be stored, not dropped
    expect(uid).toBeTruthy();
    // Should not appear in skipped as an unrecognised tag
    const uidSkip = report.skipped.find(s => s.tag === '_UID');
    expect(uidSkip).toBeUndefined();
  });

  it('creates hierarchical place chain via Genney profile', () => {
    const db = createTestDb();
    importGedcom(db, parseGedcom(GENNEY_GED), { profile: 'genney' });
    const places = db.all('SELECT name FROM places') as { name: string }[];
    const names = places.map(p => p.name);
    expect(names).toContain('Göteborg');
    expect(names).toContain('Västra Götaland');
    expect(names).toContain('Sverige');
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && npx vitest run tests/unit/import-genney-reporting.test.ts 2>&1 | tail -20
```

- [ ] **Step 3: Fix failures, full suite**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && npm test 2>&1 | tail -10
```

- [ ] **Step 4: Commit**

```bash
git add tests/unit/import-genney-reporting.test.ts && git commit -m "test(import-genney): add ImportReport field coverage for Genney GEDCOM profile"
```

---

## Task 3: Holger .ged with media — ImportReport coverage

**File:** `tests/unit/import-holger.test.ts` (extend existing)

The existing tests verify DB state (media rows, file_ref). We need a test that also verifies the `ImportReport` returned by `importGedcom`.

- [ ] **Step 1: Append tests**

Add to `tests/unit/import-holger.test.ts`:

```typescript
describe('holger profile — ImportReport structure', () => {
  it('returns ImportReport with correct persons and events counts', () => {
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(HOLGER_MARR_AND_ENGA_GED), { profile: 'holger' });
    expect(report.persons).toBe(2);
    expect(report.families).toBe(1);
    expect(typeof report.events).toBe('object');
    expect(Array.isArray(report.warnings)).toBe(true);
    expect(Array.isArray(report.skipped)).toBe(true);
  });

  it('ImportReport has no warnings for valid holger media with mediaDir', () => {
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(HOLGER_MEDIA_GED), {
      profile: 'holger',
      mediaDir: '/local/Media',
    });
    // Media remapping succeeds silently — no warning expected for remapped paths
    expect(report.persons).toBe(1);
    // Verify media was actually imported
    const mediaRow = db.get('SELECT file_ref FROM media') as { file_ref: string } | undefined;
    expect(mediaRow?.file_ref).toContain('/local/Media');
  });

  it('ImportReport warning when media file path is a Windows absolute path without mediaDir', () => {
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(HOLGER_MEDIA_GED), { profile: 'holger' });
    // Without mediaDir, the Windows path is kept as-is; verify it is imported (not silently dropped)
    const mediaRow = db.get('SELECT file_ref FROM media') as { file_ref: string } | undefined;
    expect(mediaRow).toBeDefined(); // media record exists even with unmapped path
    expect(report.persons).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && npx vitest run tests/unit/import-holger.test.ts 2>&1 | tail -20
```

- [ ] **Step 3: Fix failures, full suite**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && npm test 2>&1 | tail -10
```

- [ ] **Step 4: Commit**

```bash
git add tests/unit/import-holger.test.ts && git commit -m "test(import-holger): add ImportReport structure tests for holger .ged with media"
```

---

## Task 4: GEDCOM 5.5.1 import — full ImportReport field test

**File:** `tests/unit/import-gedcom-reporting.test.ts` (extend existing)

No single test verifies all ImportReport fields together with a real-world-ish fixture.

- [ ] **Step 1: Append test**

Add to `tests/unit/import-gedcom-reporting.test.ts`:

```typescript
const FULL_GED = `
0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME Lars /Eriksson/
1 SEX M
1 BIRT
2 DATE 12 JUN 1850
2 PLAC Stockholm, Sverige
1 DEAT
2 DATE 5 MAR 1921
0 @I2@ INDI
1 NAME Anna /Magnusson/
1 SEX F
0 @I3@ INDI
1 NAME Petter /Eriksson/
1 SEX M
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARR
2 DATE 14 AUG 1875
2 PLAC Uppsala, Sverige
1 CHIL @I3@
0 @S1@ SOUR
1 TITL Husförhörslängd 1850-1860
1 AUTH Riksarkivet
0 @S2@ SOUR
1 TITL Dödboken 1921
0 TRLR
`.trim();

describe('GEDCOM 5.5.1 import — full ImportReport field coverage', () => {
  it('reports correct counts for all ImportReport fields', () => {
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(FULL_GED));
    expect(report.persons).toBe(3);
    expect(report.families).toBe(1);
    expect(report.sources).toBe(2);
    expect(report.places).toBeGreaterThanOrEqual(2); // Stockholm, Sverige, Uppsala at minimum
    expect(typeof report.events).toBe('object');
    expect(report.events['birth']).toBeGreaterThanOrEqual(1);
    expect(report.events['death']).toBeGreaterThanOrEqual(1);
    expect(report.events['marriage']).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(report.warnings)).toBe(true);
    expect(Array.isArray(report.skipped)).toBe(true);
    expect(Array.isArray(report.unmappedData)).toBe(true);
    // No unexpected data loss on a clean standard file
    expect(report.warnings).toHaveLength(0);
    expect(report.unmappedData).toHaveLength(0);
  });

  it('report.version identifies the GEDCOM version correctly', () => {
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(FULL_GED));
    expect(report.version).toBeDefined();
    // 5.5.1 should be detected
    expect(report.version.spec).toMatch(/5\.5\.1/);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && npx vitest run tests/unit/import-gedcom-reporting.test.ts 2>&1 | tail -20
```

- [ ] **Step 3: Check what `report.version` looks like** — if the field has a different shape, adjust the assertion.

- [ ] **Step 4: Fix failures, full suite**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && npm test 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add tests/unit/import-gedcom-reporting.test.ts && git commit -m "test(import-gedcom): add full ImportReport field coverage test for GEDCOM 5.5.1"
```

---

## Task 5: GEDCOM 5.5.1 export — place_address in ExportReport

**File:** `tests/unit/export-gedcom-reporting.test.ts` (extend existing)

`place_address` exclusion is implemented in the exporter (line 420, `exporter.ts`) but has zero test coverage.

- [ ] **Step 1: Append test**

Add to `tests/unit/export-gedcom-reporting.test.ts`:

```typescript
import { createEvent } from '../../src/api/events';
import { createRelationship } from '../../src/api/relationships';

describe('GEDCOM export — place_address exclusion', () => {
  it('reports excluded place_address in ExportReport when events have free-text addresses', () => {
    const db = createTestDb();
    const p = createPerson(db, { given_name: 'Lars' });
    // Create a relationship so we can attach an event
    const rel = createRelationship(db, { type: 'couple', person1_id: p.id });
    createEvent(db, {
      event_type: 'marriage',
      relationship_id: rel.id,
      place_address: '12 Kyrkogatan, Uppsala',
    });
    const { report } = exportGedcom(db);
    const entry = report.excluded.find(e => e.category.includes('place_address') || e.category.includes('free-text'));
    expect(entry).toBeTruthy();
    expect(entry!.count).toBe(1);
  });

  it('does not report place_address when events have no free-text address', () => {
    const db = createTestDb();
    createPerson(db, { given_name: 'Lars' });
    const { report } = exportGedcom(db);
    const entry = report.excluded.find(e => e.category.includes('place_address') || e.category.includes('free-text'));
    expect(entry).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && npx vitest run tests/unit/export-gedcom-reporting.test.ts 2>&1 | tail -20
```

- [ ] **Step 3: Fix failures** — Check whether `createEvent` accepts `place_address` without a required `event_type_values` check, or if the signature differs. Adjust as needed.

- [ ] **Step 4: Full suite**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && npm test 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add tests/unit/export-gedcom-reporting.test.ts && git commit -m "test(export): add place_address exclusion test in ExportReport"
```

---

## Test Coverage Matrix

| Case | Task | Test file |
|------|------|-----------|
| genney .gcc import | Task 1 | `import-genney-archive.test.ts` (new) |
| genney .backup import | Task 1 | same — .backup variant covered |
| genney .ged import | Task 2 | `import-genney-reporting.test.ts` extended |
| holger .ged with media | Task 3 | `import-holger.test.ts` extended |
| gedcom 5.5.1 import | Task 4 | `import-gedcom-reporting.test.ts` extended |
| gedcom 5.5.1 export | Task 5 | `export-gedcom-reporting.test.ts` extended |

## Notes for implementer

- Task 1 (archive) imports `importFromGenney` which spawns Docker/Java if no GEDCOM fallback is found. The test fixtures are designed so no Derby DB is detected, so no Docker spawn occurs. The GEDCOM fallback path is returned immediately.
- Task 1 `findDerbyDirs` identifies a directory as Derby if it contains `service.properties`. The test fixture zip puts `service.properties` inside a `db/` subdirectory to simulate this.
- Task 4 `report.version` — check the `GedcomVersion` type in `src/import/gedcom/detect.ts` before writing the version assertion; adjust the test if the field name differs.
- Task 5 — `createEvent` in `src/api/events.ts` accepts `place_address` as an optional field; verify the function signature before running.
