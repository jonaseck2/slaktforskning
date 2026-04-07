# Import / Export Data Integrity Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure that no data is silently lost during any import (GEDCOM, Genney, Holger) or export (GEDCOM). Every dropped, remapped, or excluded piece of data must be reported to the user with what, how many, and why.

**Principle:** Data must never be silently lost. This is fundamental to user trust in genealogy software — see `/gedcom` skill "Data integrity rule" section.

**Scope:** This plan fixes all HIGH and selected MEDIUM severity findings from the 2026-04-07 audit. LOW severity items are documented but deferred.

---

## Background: Audit Findings

### GEDCOM Import (HIGH)

| Finding | Current state | Required |
|---------|--------------|---------|
| LDS Ordinances (BAPL, SLGC, etc.) | Counted internally (`ldsCount`), never shown to user | Add to `unmappedData` with description |
| TRAN multi-language translations | Counted (`tranCount`), shown only in `modelLimitations` post-import | Surface in `warnings` prominently |
| NO negative assertions | Counted (`noCount`), never shown to user | Add to `unmappedData` with description |
| ASSO relationships (complex) | Silently dropped if not sibling/godparent/other | Add to `skipped` or `unmappedData` with count |

### GEDCOM Export (HIGH)

| Finding | Current state | Required |
|---------|--------------|---------|
| Research Tasks | Completely omitted, no warning | Add `ExportReport` with excluded entities summary |
| Groups + GroupMembers | Completely omitted, no warning | Include in `ExportReport` |
| Assertions | Completely omitted, no warning | Include in `ExportReport` |
| `events.place_address` | Not exported, no warning | Include in `ExportReport` |

### Genney Import (HIGH)

| Finding | Current state | Required |
|---------|--------------|---------|
| Unreferenced SPLACEs | Silently dropped | Report count in `ImportSummary` |
| COUPLE_FAMILY rows with NULL link types | Silently skipped with no count | Add counter + warning |
| Orphaned events (no OWNER_EVENT) | Created but never linked, invisible to user | Count + warning |
| Orphaned citations (no OWNER_CITATION) | Inserted with all owner IDs null | Count + warning |
| Unknown EVENT.TYPE values mapped to 'other' | Silent fallback | Add warning with list of unknown types seen |
| SOURCE.NOTE not imported | Silently ignored | Either import or add to ImportSummary as dropped field |

### GEDCOM Import (MEDIUM — fix in this plan)

| Finding | Current state | Required |
|---------|--------------|---------|
| `skipped` entries have no explanation | Tag + count only | Add known-tag descriptions to UI display (not code change) OR add `unmappedData` entries for known problematic tags |

### Deferred (LOW / out of scope)

- Source call_number not re-exported to GEDCOM (Genney roundtrip only)
- Media flags (is_printable, is_missing) not exported
- Place date_from/date_to exported as custom tags
- Citation.date_accessed as custom _ACCESSED tag
- ENGA TYPE unknown values mapped to 'unknown' (Holger — minimal impact)
- ADOP without FAMC in Holger (extremely rare)
- Place name merging/normalization (GEDCOM standard behaviour)

---

## Data structures involved

### `ImportReport` (src/import/gedcom/index.ts)
```typescript
export interface ImportReport {
  persons: number;
  families: number;
  events: number;
  sources: number;
  media: number;
  places: number;
  skipped: { tag: string; count: number }[];
  warnings: string[];
  unmappedData: UnmappedItem[];
  tagStats: { tag: string; occurrences: number }[];
  modelLimitations: UnmappedItem[];
  defaultPersonId?: string;
}
```

### `ExportReport` (to be added)
```typescript
export interface ExportReport {
  persons: number;
  families: number;
  events: number;
  sources: number;
  excluded: { category: string; count: number; reason: string }[];
}
```

### Genney `ImportSummary` (src/import/genney/transform.ts)
Currently: `{ persons, families, events, places, sources, citations, media }`
Needs: `warnings: string[]` and `skipped: { category: string; count: number; reason: string }[]`

---

## Task 1: GEDCOM Import — surface LDS, TRAN, NO to user

**Files:**
- Modify: `src/import/gedcom/import-core.ts`

The `ldsCount`, `tranCount`, and `noCount` are already being tracked. They just need to be surfaced in the returned report.

- [ ] **Step 1: Write failing test**

In `tests/unit/import-gedcom-reporting.test.ts` (create if not exists):

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers';
import { parseGedcom } from '../../src/gedcom/parser';
import { importGedcom } from '../../src/import/gedcom';

const LDS_GED = `
0 HEAD
1 GEDC
2 VERS 5.5
0 @I1@ INDI
1 NAME Lars /Eriksson/
1 SEX M
1 BAPL
2 DATE 15 MAR 1990
1 SLGC
2 FAMC @F1@
0 @F1@ FAM
1 HUSB @I1@
0 TRLR
`.trim();

const TRAN_GED = `
0 HEAD
1 GEDC
2 VERS 7.0
0 @I1@ INDI
1 NAME Lars /Eriksson/
2 TRAN Lars /Eriksson/
3 LANG sv
0 TRLR
`.trim();

const NO_GED = `
0 HEAD
1 GEDC
2 VERS 7.0
0 @I1@ INDI
1 NAME Lars /Eriksson/
1 NO CHIL
0 TRLR
`.trim();

describe('GEDCOM import — data integrity reporting', () => {
  it('reports LDS ordinances in unmappedData with descriptive category', () => {
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(LDS_GED));
    const entry = report.unmappedData.find(u => u.category.includes('LDS'));
    expect(entry).toBeTruthy();
    expect(entry!.count).toBeGreaterThan(0);
  });

  it('reports TRAN translations in warnings', () => {
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(TRAN_GED));
    expect(report.warnings.some(w => w.includes('TRAN') || w.includes('translation'))).toBe(true);
  });

  it('reports NO negative assertions in unmappedData', () => {
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(NO_GED));
    const entry = report.unmappedData.find(u => u.category.includes('NO') || u.category.includes('negat'));
    expect(entry).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && npx vitest run tests/unit/import-gedcom-reporting.test.ts 2>&1 | tail -20
```

- [ ] **Step 3: Surface ldsCount, tranCount, noCount in `import-core.ts`**

Locate the post-import block (around line 960–990) where `unmappedData` is built. Add:

```typescript
if (ldsCount > 0) {
  unmappedData.push({
    category: `LDS ordinances (BAPL, SLGC, CONL, ENDL, SLGS) — not relevant outside LDS context, not imported`,
    count: ldsCount,
  });
}
if (tranCount > 0) {
  warnings.push(`${tranCount} TRAN translation node(s) converted to 'aka' name entries — translation language/script metadata not preserved`);
}
if (noCount > 0) {
  unmappedData.push({
    category: `NO negative assertions (GEDCOM 7.0) — no app concept for explicit non-events, not imported`,
    count: noCount,
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && npx vitest run tests/unit/import-gedcom-reporting.test.ts 2>&1 | tail -10
```

- [ ] **Step 5: Run full tests**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && npm test 2>&1 | tail -10
```

- [ ] **Step 6: Commit**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && git add src/import/gedcom/import-core.ts tests/unit/import-gedcom-reporting.test.ts && git commit -m "fix(import): surface LDS ordinances, TRAN translations, NO assertions in import report"
```

---

## Task 2: GEDCOM Import — report dropped ASSO relationships

**Files:**
- Modify: `src/import/gedcom/import-core.ts`

ASSO nodes that don't match sibling/godparent/other relationship types are silently dropped. The count must be reported.

- [ ] **Step 1: Write failing test**

Append to `tests/unit/import-gedcom-reporting.test.ts`:

```typescript
const ASSO_GED = `
0 HEAD
1 GEDC
2 VERS 5.5
0 @I1@ INDI
1 NAME Lars /Eriksson/
1 SEX M
1 ASSO @I2@
2 RELA Neighbour
0 @I2@ INDI
1 NAME Karin /Svensson/
1 SEX F
0 TRLR
`.trim();

describe('GEDCOM import — ASSO reporting', () => {
  it('reports dropped ASSO associations in unmappedData', () => {
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(ASSO_GED));
    const entry = report.unmappedData.find(u => u.category.includes('ASSO'));
    expect(entry).toBeTruthy();
    expect(entry!.count).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && npx vitest run tests/unit/import-gedcom-reporting.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Add ASSO drop counter in `import-core.ts`**

Declare a counter at the top of `doImportGedcom`: `let assoDrop = 0;`

In the INDI ASSO processing loop, increment `assoDrop` for each ASSO that is not imported as a relationship or event participant. After processing, add to `unmappedData`:

```typescript
if (assoDrop > 0) {
  unmappedData.push({
    category: `ASSO associations with unrecognised RELA types (e.g. Neighbour, Witness) — no general association concept in app, not imported`,
    count: assoDrop,
  });
}
```

- [ ] **Step 4–6: Verify, full tests, commit**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && npx vitest run tests/unit/import-gedcom-reporting.test.ts 2>&1 | tail -10
cd /Users/jonasahnstedt/git/slaktforskning && npm test 2>&1 | tail -10
git add src/import/gedcom/import-core.ts tests/unit/import-gedcom-reporting.test.ts && git commit -m "fix(import): report dropped ASSO associations with unrecognised RELA types"
```

---

## Task 3: GEDCOM Export — add ExportReport

**Files:**
- Modify: `src/gedcom/exporter.ts` (or wherever `exportGedcom` is defined — check actual path)
- Modify: `src/main/ipc.ts` — return export report
- Modify: `src/renderer/views/ImportExportView.vue` — display export report

The GEDCOM exporter currently returns only a string. It must also return an `ExportReport` listing every DB entity type that could not be represented in GEDCOM 5.5.1.

Currently excluded with no warning:
- Research Tasks (no GEDCOM concept)
- Groups + GroupMembers (no GEDCOM concept)
- Assertions (no GEDCOM concept)
- `events.place_address` free-text addresses
- `persons.living` flag (not exported to GEDCOM)
- `persons.notes` is exported as `NOTE`, but multi-name entries with non-birth types lose `name_type` semantics

- [ ] **Step 1: Locate the exporter**

```bash
find /Users/jonasahnstedt/git/slaktforskning/src -name "*.ts" | xargs grep -l "exportGedcom" 2>/dev/null
```

- [ ] **Step 2: Define `ExportReport` type**

In `src/gedcom/exporter.ts` (or a shared types file):

```typescript
export interface ExportReport {
  persons: number;
  families: number;
  events: number;
  sources: number;
  excluded: {
    category: string;
    count: number;
    reason: string;
  }[];
}
```

- [ ] **Step 3: Write failing test**

In `tests/unit/export-gedcom-reporting.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers';
import { createPerson } from '../../src/api/persons';
import { createGroup, addGroupMember } from '../../src/api/groups';
import { createResearchTask } from '../../src/api/research_tasks';
import { exportGedcom } from '../../src/gedcom/exporter'; // adjust path

describe('GEDCOM export — ExportReport', () => {
  it('reports excluded Research Tasks', async () => {
    const db = createTestDb();
    const p = createPerson(db, { given_name: 'Lars' });
    createResearchTask(db, { task: 'Find birth record', person_id: p.id });
    const { report } = exportGedcom(db);
    const entry = report.excluded.find(e => e.category.includes('Research'));
    expect(entry).toBeTruthy();
    expect(entry!.count).toBe(1);
  });

  it('reports excluded Groups', async () => {
    const db = createTestDb();
    const p = createPerson(db, { given_name: 'Lars' });
    const g = createGroup(db, { name: 'Emigrants' });
    addGroupMember(db, g.id, p.id);
    const { report } = exportGedcom(db);
    const entry = report.excluded.find(e => e.category.includes('Group'));
    expect(entry).toBeTruthy();
  });
});
```

- [ ] **Step 4: Modify `exportGedcom` to return `{ ged: string; report: ExportReport }`**

At the end of `exportGedcom`, before returning the GEDCOM string, query the DB for counts of excluded entities:

```typescript
const researchTaskCount = (db.get('SELECT COUNT(*) as n FROM research_tasks') as { n: number }).n;
const groupCount = (db.get('SELECT COUNT(*) as n FROM groups') as { n: number }).n;
const assertionCount = (db.get('SELECT COUNT(*) as n FROM assertions') as { n: number }).n;
const placeAddressCount = (db.get(
  "SELECT COUNT(*) as n FROM events WHERE place_address IS NOT NULL AND place_address != ''"
) as { n: number }).n;

const excluded: ExportReport['excluded'] = [];
if (researchTaskCount > 0) excluded.push({
  category: 'Research Tasks',
  count: researchTaskCount,
  reason: 'No equivalent concept in GEDCOM 5.5.1',
});
if (groupCount > 0) excluded.push({
  category: 'Groups and group membership',
  count: groupCount,
  reason: 'No equivalent concept in GEDCOM 5.5.1',
});
if (assertionCount > 0) excluded.push({
  category: 'Assertions',
  count: assertionCount,
  reason: 'No equivalent concept in GEDCOM 5.5.1',
});
if (placeAddressCount > 0) excluded.push({
  category: 'Event free-text addresses (place_address field)',
  count: placeAddressCount,
  reason: 'GEDCOM ADDR is on event records; no mapping implemented yet',
});

const report: ExportReport = { persons: ..., families: ..., events: ..., sources: ..., excluded };
return { ged: lines.join('\n'), report };
```

Update all callers of `exportGedcom` to destructure `{ ged, report }`.

- [ ] **Step 5: Surface report in IPC and UI**

In `src/main/ipc.ts`, return `report` alongside the exported content.
In `ImportExportView.vue`, after a successful export, display `report.excluded` (if any) as a dismissible warning list.

- [ ] **Step 6: Run tests**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && npx vitest run tests/unit/export-gedcom-reporting.test.ts 2>&1 | tail -10
```

- [ ] **Step 7: Full tests**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && npm test 2>&1 | tail -10
```

- [ ] **Step 8: Commit**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && git add -A && git commit -m "feat(export): add ExportReport — surface excluded Research Tasks, Groups, Assertions"
```

---

## Task 4: Genney Import — add warnings for silent data loss

**Files:**
- Modify: `src/import/genney/transform.ts`

The Genney importer has several places where data is silently dropped with no count or user notification. `ImportSummary` needs a `warnings` and `skipped` field.

- [ ] **Step 1: Extend `ImportSummary` type**

```typescript
export interface ImportSummary {
  persons: number;
  families: number;
  events: number;
  places: number;
  sources: number;
  citations: number;
  media: number;
  // New:
  warnings: string[];   // human-readable messages for remapped/converted data
  skipped: { category: string; count: number; reason: string }[];  // silently dropped categories
}
```

- [ ] **Step 2: Write failing tests**

In `tests/unit/import-genney-reporting.test.ts` — test that the summary includes warnings for:
1. Orphaned events (events with no OWNER_EVENT entry)
2. Orphaned citations (citations with no owner)
3. Unknown EVENT.TYPE values
4. COUPLE_FAMILY rows with null link types skipped

(Use minimal fixture data that triggers each case.)

- [ ] **Step 3: Instrument `transform.ts` with counters**

For each silent loss, add a counter:

**Orphaned events** — In the event loop, where `owners.length === 0`, increment `orphanedEvents`:
```typescript
let orphanedEvents = 0;
// ... in loop:
if (owners.length === 0) { orphanedEvents++; continue; }
```

**Orphaned citations** — Similarly for citations with no owner:
```typescript
let orphanedCitations = 0;
if (owners.length === 0) { orphanedCitations++; }
```

**Unknown EVENT.TYPE** — In `mapGenneyEventType`, track unknown types seen:
```typescript
// In caller context, accumulate unknown types
const unknownEventTypes = new Set<string>();
// When mapping returns 'other' for an unrecognised type:
if (!GENNEY_EVENT_TYPE[type.toUpperCase()]) unknownEventTypes.add(type);
```

**COUPLE_FAMILY with null link type** — In the parent-child loop, count skipped rows:
```typescript
let skippedParentLinks = 0;
// When FATHERLINK or MOTHERLINK is null/falsy:
skippedParentLinks++;
```

**Unreferenced SPLACEs** — Count SPLACEs that were in the source but not imported:
```typescript
const importedPlaceRids = new Set(/* all SPLACEs that got imported */);
const unrefPlaceCount = allSplaceRids.size - importedPlaceRids.size;
```

**SOURCE.NOTE** — Count sources with non-empty NOTE that was dropped:
```typescript
const sourceNoteCount = sources.filter(s => s.NOTE?.trim()).length;
```

After all processing, populate `summary.warnings` and `summary.skipped`:

```typescript
if (orphanedEvents > 0) summary.skipped.push({
  category: 'Events with no owner (no OWNER_EVENT entry)',
  count: orphanedEvents,
  reason: 'Event not linked to any person or family — orphaned in source data',
});
if (orphanedCitations > 0) summary.skipped.push({
  category: 'Citations with no owner (no OWNER_CITATION entry)',
  count: orphanedCitations,
  reason: 'Citation not linked to any evidence subject — orphaned in source data',
});
if (unknownEventTypes.size > 0) summary.warnings.push(
  `${[...unknownEventTypes].join(', ')} event type(s) not recognised — mapped to 'other'`
);
if (skippedParentLinks > 0) summary.skipped.push({
  category: 'Parent-child relationships with missing link type',
  count: skippedParentLinks,
  reason: 'FATHERLINK or MOTHERLINK is null — relationship not importable',
});
if (unrefPlaceCount > 0) summary.skipped.push({
  category: 'Unreferenced places (no events in those locations)',
  count: unrefPlaceCount,
  reason: 'Place hierarchy entries with no associated events — not imported',
});
if (sourceNoteCount > 0) summary.skipped.push({
  category: 'Source notes (SOURCE.NOTE field)',
  count: sourceNoteCount,
  reason: 'No mapping to app source model — field not imported',
});
```

- [ ] **Step 4: Surface in Genney import IPC and UI**

Update `ipc.ts` Genney handler to return the full summary including warnings/skipped.
Update `ImportExportView.vue` to display these warnings alongside the existing import report display.

- [ ] **Step 5: Run tests**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && npx vitest run tests/unit/import-genney-reporting.test.ts 2>&1 | tail -15
```

- [ ] **Step 6: Full tests**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && npm test 2>&1 | tail -10
```

- [ ] **Step 7: Commit**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && git add src/import/genney/transform.ts tests/unit/import-genney-reporting.test.ts && git commit -m "fix(import-genney): report orphaned events/citations, unknown event types, skipped parent links"
```

---

## Task 5: Documentation

**Files:**
- Modify: `CLAUDE.md` (update MCP tool descriptions for import_* tools to mention ExportReport)
- Modify: `README.md`
- Modify: `.claude/PLAN.md`

- [ ] **Step 1: Update CLAUDE.md**

Add a note under the import/export tools that all import tools return a report with `skipped`/`warnings`/`unmappedData`, and `export_gedcom` returns an `ExportReport` with `excluded` entities.

- [ ] **Step 2: Run full tests**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && npm test 2>&1 | tail -10
```

- [ ] **Step 3: Commit**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && git add CLAUDE.md README.md .claude/PLAN.md && git commit -m "docs: document import/export data integrity reporting"
```

---

## Spec Coverage

| Requirement | Task |
|-------------|------|
| LDS ordinances reported in unmappedData | Task 1 |
| TRAN translations reported in warnings | Task 1 |
| NO negative assertions reported in unmappedData | Task 1 |
| Dropped ASSO (unrecognised RELA) reported | Task 2 |
| GEDCOM export ExportReport with excluded entities | Task 3 |
| Research Tasks / Groups / Assertions excluded — reported | Task 3 |
| Genney orphaned events reported | Task 4 |
| Genney orphaned citations reported | Task 4 |
| Genney unknown EVENT.TYPE reported | Task 4 |
| Genney skipped parent links reported | Task 4 |
| Genney unreferenced places reported | Task 4 |
| Genney SOURCE.NOTE dropped — reported | Task 4 |
| Docs updated | Task 5 |

## Out of Scope (deferred)

- Source call_number not re-exported (Genney roundtrip edge case)
- Media flags (is_printable) not exported
- Citation.place_id citations reported as custom GEDCOM tags
- ENGA unknown TYPE in Holger (rare, maps to 'unknown' subtype which is still imported)
- ADOP without FAMC in Holger (extremely rare in practice)