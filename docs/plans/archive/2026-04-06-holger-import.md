# Holger/OurKind Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `import_holger` path that accepts a Holger/OurKind GEDCOM export (`.ged` or `.zip`) and maps its non-standard ENGA/ADOP semantics cleanly onto our data model. Remove the DBISAM/EDB import path entirely (it was never released; the GEDCOM export contains all useful data). Also handle the four Holger custom GEDCOM tags that currently produce "Unrecognised" warnings.

**Architecture:** New `src/import/holger/index.ts` orchestrator normalises file input (`.ged`, `.zip`, or a HolgerData folder/zip) and calls the existing GEDCOM importer with profile `'holger'`. The profile is wired into `src/gedcom/importer.ts` to handle Holger's couple-type encoding (ENGA TYPE) and parent-child subtype encoding (ADOP TYPE). Media file paths are remapped from Windows-style absolute paths to a user-supplied local directory.

**Tech Stack:** TypeScript, existing `src/gedcom/importer.ts` + `encoding.ts`, fflate (already a dependency), Vitest, Vue 3

**Parallelism:** Can run in parallel with GEDCOM 7.0 Export (`2026-04-06-gedcom-70-export.md`) — no file overlap.
Must complete before Gap Closure (`2026-04-07-gedcom-import-gap-closure.md`) — both modify `src/import/gedcom/import-core.ts`.

---

## Background & Analysis

### Database format (DBISAM 4 — REMOVED)

An earlier plan explored an ElevateDB/Docker import path (`transformEdb.ts`, `EDBExtractor.py`) that would parse the binary `.EDBTbl` tables via a Python container. **This path is being removed entirely.** The GEDCOM export contains all genealogically useful data (see table below) and the Docker/binary approach adds significant complexity for no extra genealogical value. All code, IPC handlers, MCP tool args, and UI sections referencing EDB/DBISAM are deleted in Task 0.

### What the GEDCOM export contains vs the backup

| Data | In GEDCOM | Notes |
|------|-----------|-------|
| Persons | ✅ 22 221 INDI records | Complete |
| Families/couples | ✅ 7 934 FAM records | Complete |
| Notes / "Kommentarsfältet" | ✅ NOTE records | User confirmed included |
| Media file references | ✅ inline OBJE FILE paths | Windows paths; need remapping |
| Sources (Kalltab) | ⚠️ essentially empty | Only 160 bytes in the EDB tables |
| Citations (Citattab) | ⚠️ essentially empty | Only 128 bytes in the EDB tables |
| Groups | ⚠️ 1 group only | Not in GEDCOM; trivial |
| Embedded media BLOBs | ❌ not in GEDCOM | Thumbnails in Mediatab.EDBBlb; skip |

**Conclusion:** the GEDCOM contains all data worth importing. Binary DBISAM parsing is not needed.

### Why a custom Holger GEDCOM profile is needed

Holger uses standard GEDCOM 5.5 tags but with non-standard semantics in two places:

#### 1. FAM-level `ENGA` = couple relationship type (not an event)

Standard GEDCOM uses `ENGA` as an engagement event; Holger uses it to mark non-marriage couples:

```
0 @F40099@ FAM
1 HUSB @I1@
1 WIFE @I16664@
1 ENGA
2 TYPE Partner       ← Holger semantics: this IS the relationship type
```

Type mapping:

| Holger ENGA TYPE | Our `subtype` |
|-----------------|---------------|
| `Sambo` | `cohabitation` |
| `Partner` | `cohabitation` |
| `Parter` | `cohabitation` |
| `Särbo` | `cohabitation` |
| `Relation` | `other` |
| `Förlovade` | `unknown` |
| (anything else) | `unknown` |

When a FAM has only `ENGA` (no `MARR`), the ENGA node sets the couple subtype and no engagement event is created.

#### 2. INDI-level `ADOP` carries parent-child subtype

Standard GEDCOM uses `PEDI` on FAM CHIL; Holger uses `ADOP` on the child INDI:

```
0 @I174@ INDI
...
1 ADOP
2 TYPE Fosterbarn    ← 'foster'
2 FAMC @F22386@      ← which family
3 ADOP BOTH
```

Type mapping:

| Holger ADOP TYPE | Our `subtype` |
|-----------------|---------------|
| `Fosterbarn` | `foster` |
| `Adoptivbarn` | `adopted` |
| (anything else) | `biological` |

#### 3. Media Windows paths → local directory

OBJE FILE contains `C:\OurKind\Media\P12\&filename.jpg`. When `mediaDir` option is given, remap to `{mediaDir}/P12/&filename.jpg`.

#### 4. Custom Holger tags (previously generating "Unrecognised" warnings)

Analysed from `OurKind - Komplett - Gedcom i Holgerformat - 20260406.ged` (22 221 INDI, 7 934 FAM):

| Tag | Count | Level | Location | Action |
|-----|-------|-------|----------|--------|
| `_HDP` | 22 233 | 1 | INDI | Holger internal metadata (sort key, display IDs, ISO dates, created/updated timestamps). All data is redundant with standard GEDCOM tags. **Discarded — reported transparently**: keep out of `KNOWN_INDI_TAGS` so the tag appears in `skipped`. Also add an `unmappedData` entry for the holger profile with a descriptive category string so the user sees *why* it was dropped, not just a bare tag name. |
| `_H8P` | 22 233 | 1 | INDI | Holger 8 internal flags (4 comma-separated numbers). No genealogical value. Same reporting approach as `_HDP`. |
| `REMA` | 6 573 | 1 | INDI | Holger's per-person "remark" field — free-text notes identical in purpose to `NOTE`. **Import as person notes**: append `REMA` value to `persons.notes`, with `\n\n` separator if notes are non-empty. Add to `KNOWN_INDI_TAGS` (data is handled, not skipped). Add a `warnings` entry: `"6573 REMA remarks imported as person notes"` so the user sees the count. |
| `MISC` | 11 | 1 | INDI | Holger's "miscellaneous" note, same semantics as `REMA`. **Import as person notes**: same append logic. Add to `KNOWN_INDI_TAGS`. Count included in the same `warnings` entry as `REMA`. |

#### 5. SUBM record — tree subject / default focus person

```
0 @S1@ SUBM
1 NAME Bengt Sareld
```

In standard GEDCOM, `SUBM` is the file submitter (creator). In Holger, it is the tree *subject* — the person the tree is about. The first INDI record (`@I1@`) is always the tree subject in Holger exports (Bengt Sareld = `@I1@`).

**Action**: after import completes, look up the `personMap` entry for the first INDI xref encountered. Return that person's DB id as `defaultPersonId?: string` in `ImportReport`. The UI uses this to navigate to that person after import.

No SUBM name-matching is needed — Holger always puts the subject first.

#### 6. Encoding, dates, same-sex couples

- **Encoding**: already handled — `readGedcomFile` in `encoding.ts` reads ANSI as latin1 (correct for Windows-1252 Swedish).
- **FROM...TO dates**: already handled — `parseGedcomDate` in `date.ts` maps `FROM x TO y` → `between`.
- **Same-sex couples**: GEDCOM uses HUSB/WIFE but our model stores `person1_id`/`person2_id` neutrally — no special handling needed.

---

## File Map

| File | Change |
|------|--------|
| `src/import/holger/transformEdb.ts` | **Delete** — EDB transform (DBISAM removal) |
| `src/import/holger/EDBExtractor.py` | **Delete** — Docker Python extractor (DBISAM removal) |
| `src/import/holger/index.ts` | **Modify** — strip EDB path; accepts only `.ged` and `.zip`; add `defaultPersonId` to result |
| `src/import/gedcom/import-core.ts` | **Modify** — add `'holger'` profile: ENGA TYPE → couple subtype, ADOP TYPE map, media path remapping, REMA/MISC → notes, `_HDP`/`_H8P` suppression, `defaultPersonId` in report |
| `src/import/gedcom/index.ts` | **Modify** — add `defaultPersonId?` to `ImportReport` |
| `src/mcp/createServer.ts` | **Modify** — register `import_holger` tool (remove EDB tool args) |
| `src/main/ipc.ts` | **Modify** — keep `import:holgerSelectFile`, `import:holgerRun`; remove `import:holgerSelectEdbDir`, `import:holgerEdbRun` |
| `src/preload/index.ts` | **Modify** — keep holger GEDCOM handlers; remove EDB handlers |
| `src/renderer/views/ImportExportView.vue` | **Modify** — keep Holger GEDCOM section; remove EDB subsection; navigate to `defaultPersonId` after import |
| `tests/unit/import-holger.test.ts` | **Create** — unit tests for profile behaviour (ENGA, ADOP, media, REMA/MISC, defaultPersonId) |
| `CLAUDE.md` | **Modify** — add `import_holger` to MCP tool list |
| `README.md` | **Modify** — mention Holger import |

---

## Task 0: Remove DBISAM / EDB import path

**Goal**: Delete the Docker/Python ElevateDB pipeline and all code that depended on it.

**Files to delete:**
- `src/import/holger/transformEdb.ts`
- `src/import/holger/EDBExtractor.py`

**Files to modify:**
- `src/import/holger/index.ts` — remove `HolgerEdbImportOptions`, `HolgerEdbImportResult`, `hasEdbCatalog`, `importHolgerEdb`; remove `Worker`/`spawn` imports; remove folder-scanning branch from `importFromHolger` (keep only `.ged` and `.zip`); update docstring
- `src/main/ipc.ts` — remove `import:holgerSelectEdbDir` and `import:holgerEdbRun` handlers (around lines 280–305)
- `src/preload/index.ts` — remove `holgerEdbPickDir`, `holgerEdbRun`, `onHolgerEdbProgress` entries
- `src/renderer/views/ImportExportView.vue` — remove the EDB subsection (the `<p class="subsection-label">…holgerEdbTitle…</p>` block and associated template/script); remove `holgerEdbPath`, `holgerEdbProgress` refs and `holgerEdbPickDir`, `handleImportFromHolgerEdb` functions
- Remove any EDB i18n keys from locale files

- [ ] **Step 1: Delete EDB source files**

```bash
rm /Users/jonasahnstedt/git/slaktforskning/src/import/holger/transformEdb.ts
rm /Users/jonasahnstedt/git/slaktforskning/src/import/holger/EDBExtractor.py
```

- [ ] **Step 2: Strip EDB code from `src/import/holger/index.ts`**

Remove all exports and code related to EDB: `HolgerEdbImportOptions`, `HolgerEdbImportResult`, `hasEdbCatalog`, `importHolgerEdb`, and the Worker/spawn imports. Remove the `stat.isDirectory()` branch from `importFromHolger` (Holger GEDCOM import now accepts only `.ged` and `.zip`). Update the file-level docstring.

- [ ] **Step 3: Remove EDB IPC handlers from `src/main/ipc.ts`**

Remove the `import:holgerSelectEdbDir` and `import:holgerEdbRun` handlers.

- [ ] **Step 4: Remove EDB entries from `src/preload/index.ts`**

Remove `holgerEdbPickDir`, `holgerEdbRun`, `onHolgerEdbProgress`.

- [ ] **Step 5: Remove EDB UI from `src/renderer/views/ImportExportView.vue`**

Remove the EDB subsection from the template, the `holgerEdbPath`/`holgerEdbProgress` refs, and the `holgerEdbPickDir`/`handleImportFromHolgerEdb` functions. Remove EDB-related i18n keys from all locale files.

- [ ] **Step 6: Verify TypeScript compilation**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 7: Run full unit tests**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && npm test 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && git add -A && git commit -m "refactor(holger): remove DBISAM/EDB import path — GEDCOM export has all useful data"
```

---

## Task 1: GEDCOM importer — holger couple subtype

**Files:**
- Modify: `src/gedcom/importer.ts` (around line 238, 276, 492–503)
- Test: `tests/unit/import-holger.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/import-holger.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers';
import { parseGedcom } from '../../src/gedcom/parser';
import { importGedcom } from '../../src/gedcom/importer';

const HOLGER_SAMBO_GED = `
0 HEAD
1 GEDC
2 VERS 5.5
0 @I1@ INDI
1 NAME Kalle /Svensson/
1 SEX M
0 @I2@ INDI
1 NAME Stina /Nilsson/
1 SEX F
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 ENGA
2 TYPE Sambo
0 TRLR
`.trim();

const HOLGER_MARR_GED = `
0 HEAD
1 GEDC
2 VERS 5.5
0 @I1@ INDI
1 NAME Kalle /Svensson/
1 SEX M
0 @I2@ INDI
1 NAME Stina /Nilsson/
1 SEX F
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARR
2 DATE 15 JUN 1985
0 TRLR
`.trim();

describe('holger profile — couple subtype', () => {
  it('maps ENGA TYPE Sambo → cohabitation', () => {
    const db = createTestDb();
    importGedcom(db, parseGedcom(HOLGER_SAMBO_GED), { profile: 'holger' });
    const row = db.get('SELECT subtype FROM relationships WHERE type=?', ['couple']) as { subtype: string } | undefined;
    expect(row?.subtype).toBe('cohabitation');
  });

  it('does not create an engagement event for Holger ENGA couples', () => {
    const db = createTestDb();
    importGedcom(db, parseGedcom(HOLGER_SAMBO_GED), { profile: 'holger' });
    const row = db.get('SELECT COUNT(*) as n FROM events WHERE event_type=?', ['engagement']) as { n: number };
    expect(row.n).toBe(0);
  });

  it('still uses marriage subtype for MARR families', () => {
    const db = createTestDb();
    importGedcom(db, parseGedcom(HOLGER_MARR_GED), { profile: 'holger' });
    const row = db.get('SELECT subtype FROM relationships WHERE type=?', ['couple']) as { subtype: string } | undefined;
    expect(row?.subtype).toBe('marriage');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && npx vitest run tests/unit/import-holger.test.ts 2>&1 | tail -20
```

Expected: 3 failures.

- [ ] **Step 3: Add `'holger'` to `ImportOptions.profile` and implement couple subtype**

In `src/gedcom/importer.ts`:

```typescript
// Around line 238–240 — extend the type:
profile?: 'genney' | 'holger';
```

Add a helper near line 276 (after `const isGenney = ...`):

```typescript
const isHolger = options?.profile === 'holger';

function holgerEngaSubtype(engaNode: GedcomNode): string {
  const type = getChild(engaNode, 'TYPE')?.value?.trim() ?? '';
  if (['Sambo', 'Partner', 'Parter', 'Särbo'].includes(type)) return 'cohabitation';
  if (type === 'Relation') return 'other';
  return 'unknown';
}
```

Replace the couple subtype block (around line 492–496):

```typescript
// Old:
const hasMarr = getChildren(node, 'MARR').length > 0;
const coupleSubtype = extSubtype ?? (hasMarr ? 'marriage' : 'unknown');

// New:
const hasMarr = getChildren(node, 'MARR').length > 0;
let coupleSubtype: string;
if (extSubtype) {
  coupleSubtype = extSubtype;
} else if (hasMarr) {
  coupleSubtype = 'marriage';
} else if (isHolger) {
  const engaNodes = getChildren(node, 'ENGA');
  coupleSubtype = engaNodes.length > 0 ? holgerEngaSubtype(engaNodes[0]) : 'unknown';
} else {
  coupleSubtype = 'unknown';
}
```

Skip ENGA event import for Holger FAMs that have no MARR. In the family events loop (around line 512–514), add:

```typescript
for (const [gedTag, appType] of Object.entries(FAMILY_EVENT_TAGS)) {
  // Holger: ENGA in a FAM record is a relationship-type marker, not an event
  if (isHolger && gedTag === 'ENGA' && !hasMarr) continue;
  for (const evNode of getChildren(node, gedTag)) {
    importEventNode(db, evNode, appType, sourceMap, { relationship_id: couple.id }, resolvePlaceFn, placeIdMap, eventIdMap, noteMap, objeMap);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && npx vitest run tests/unit/import-holger.test.ts 2>&1 | tail -10
```

Expected: 3 passing.

- [ ] **Step 5: Run full unit tests to check no regressions**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && npm test 2>&1 | tail -15
```

Expected: all existing tests pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && git add src/gedcom/importer.ts tests/unit/import-holger.test.ts && git commit -m "feat(holger): add holger GEDCOM profile — couple subtype from ENGA TYPE"
```

---

## Task 2: GEDCOM importer — holger ADOP parent-child subtype

**Files:**
- Modify: `src/gedcom/importer.ts`
- Test: `tests/unit/import-holger.test.ts`

- [ ] **Step 1: Write failing test**

Append to `tests/unit/import-holger.test.ts`:

```typescript
const HOLGER_FOSTER_GED = `
0 HEAD
1 GEDC
2 VERS 5.5
0 @I1@ INDI
1 NAME AlfredFoster /Svensson/
1 SEX M
0 @I2@ INDI
1 NAME BertaFoster /Nilsson/
1 SEX F
0 @I3@ INDI
1 NAME KidFoster /Svensson/
1 SEX M
1 ADOP
2 TYPE Fosterbarn
2 FAMC @F1@
3 ADOP BOTH
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARR
1 CHIL @I3@
0 TRLR
`.trim();

describe('holger profile — ADOP parent-child subtype', () => {
  it('maps ADOP TYPE Fosterbarn → foster on parent_child relationships', () => {
    const db = createTestDb();
    importGedcom(db, parseGedcom(HOLGER_FOSTER_GED), { profile: 'holger' });
    const rows = db.all('SELECT subtype FROM relationships WHERE type=?', ['parent_child']) as { subtype: string }[];
    expect(rows.length).toBe(2); // one per parent
    expect(rows.every(r => r.subtype === 'foster')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && npx vitest run tests/unit/import-holger.test.ts 2>&1 | tail -10
```

Expected: 1 new failure (foster test).

- [ ] **Step 3: Implement adoption map in importer**

In `doImportGedcom`, declare the map at the top of the function (right after personMap):

```typescript
// Holger: ADOP on INDI → collect subtype override per (person, family) pair
const holgerAdoptionMap = new Map<string, Map<string, string>>(); // personXref → familyXref → subtype
```

In the INDI processing loop, after creating the person, add (inside the `if (isHolger)` branch):

```typescript
if (isHolger) {
  for (const adopNode of getChildren(node, 'ADOP')) {
    const famcNode = getChild(adopNode, 'FAMC');
    const typeNode = getChild(adopNode, 'TYPE');
    if (!famcNode) continue;
    const raw = typeNode?.value?.trim() ?? '';
    const subtype = raw === 'Fosterbarn' ? 'foster' : raw === 'Adoptivbarn' ? 'adopted' : 'biological';
    if (!holgerAdoptionMap.has(node.xref!)) holgerAdoptionMap.set(node.xref!, new Map());
    holgerAdoptionMap.get(node.xref!)!.set(famcNode.value, subtype);
  }
}
```

Replace the FAM CHIL subtype logic (around line 522–525). Current code:

```typescript
const pedi = getChild(chil, 'PEDI')?.value;
const childSubtype = pedi ? (pedi === 'birth' ? 'biological' : pedi) : 'biological';
```

New code:

```typescript
const pedi = getChild(chil, 'PEDI')?.value;
let childSubtype = pedi ? (pedi === 'birth' ? 'biological' : pedi) : 'biological';
if (isHolger && childId) {
  const adopSubtype = holgerAdoptionMap.get(chil.value)?.get(node.xref ?? '');
  if (adopSubtype) childSubtype = adopSubtype;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && npx vitest run tests/unit/import-holger.test.ts 2>&1 | tail -10
```

Expected: all 4 holger tests pass.

- [ ] **Step 5: Run full unit tests**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && npm test 2>&1 | tail -10
```

- [ ] **Step 6: Commit**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && git add src/gedcom/importer.ts tests/unit/import-holger.test.ts && git commit -m "feat(holger): map ADOP TYPE Fosterbarn/Adoptivbarn to parent_child subtype"
```

---

## Task 3: GEDCOM importer — holger media path remapping

**Files:**
- Modify: `src/gedcom/importer.ts`
- Test: `tests/unit/import-holger.test.ts`

- [ ] **Step 1: Write failing test**

Append to `tests/unit/import-holger.test.ts`:

```typescript
const HOLGER_MEDIA_GED = `
0 HEAD
1 GEDC
2 VERS 5.5
0 @I1@ INDI
1 NAME Kalle /Svensson/
1 SEX M
1 OBJE
2 FORM JPG
2 TITL 
2 FILE C:\\OurKind\\Media\\P12\\&SvenssonKalle(f1945).jpg
2 NOTE Portrait of Kalle.
0 TRLR
`.trim();

describe('holger profile — media path remapping', () => {
  it('remaps Windows OBJE FILE path to local mediaDir', () => {
    const db = createTestDb();
    importGedcom(db, parseGedcom(HOLGER_MEDIA_GED), { profile: 'holger', mediaDir: '/local/Media' });
    const row = db.get('SELECT file_ref FROM media LIMIT 1') as { file_ref: string } | undefined;
    expect(row?.file_ref).toBe('/local/Media/P12/&SvenssonKalle(f1945).jpg');
  });

  it('keeps path as-is when no mediaDir provided', () => {
    const db = createTestDb();
    importGedcom(db, parseGedcom(HOLGER_MEDIA_GED), { profile: 'holger' });
    const row = db.get('SELECT file_ref FROM media LIMIT 1') as { file_ref: string } | undefined;
    expect(row?.file_ref).toContain('SvenssonKalle');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && npx vitest run tests/unit/import-holger.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Add `mediaDir` to ImportOptions and wire into OBJE handler**

Extend `ImportOptions` (around line 238):

```typescript
/** Local directory containing media files, used to remap Windows-style paths in Holger GEDCOM exports. */
mediaDir?: string;
```

Add a helper near `holgerEngaSubtype`:

```typescript
function remapHolgerMediaPath(winPath: string, mediaDir: string): string {
  // Extract the part after 'Media\' (case-insensitive), then normalise slashes
  const idx = winPath.search(/[Mm]edia[\\/]/);
  if (idx === -1) return winPath;
  const relative = winPath.slice(idx + 'Media\\'.length).replace(/\\/g, '/');
  return `${mediaDir.replace(/\/$/, '')}/${relative}`;
}
```

In `importObjeNode` (around line 140), the function receives `options?: ImportOptions`. If it doesn't currently receive options, thread them through. Find the call to `createMedia` and prepend the remap:

```typescript
// In importObjeNode, before createMedia:
let fileRef = fileNode?.value ?? null;
if (fileRef && options?.mediaDir) {
  fileRef = remapHolgerMediaPath(fileRef, options.mediaDir);
}
```

Ensure `importObjeNode` signature includes `options?: ImportOptions` and passes `options` down from `importEventNode` and the INDI/FAM OBJE loops. Check how it's currently called:

```bash
grep -n "importObjeNode" /Users/jonasahnstedt/git/slaktforskning/src/gedcom/importer.ts
```

Thread `options` through as needed (add as last parameter).

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && npx vitest run tests/unit/import-holger.test.ts 2>&1 | tail -10
```

Expected: all 6 holger tests pass.

- [ ] **Step 5: Run full tests**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && npm test 2>&1 | tail -10
```

- [ ] **Step 6: Commit**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && git add src/gedcom/importer.ts tests/unit/import-holger.test.ts && git commit -m "feat(holger): remap Windows OBJE FILE paths to local mediaDir"
```

---

## Task 3.5: Holger custom tags — REMA/MISC → notes, _HDP/_H8P reported with explanation

**Files:**
- Modify: `src/import/gedcom/import-core.ts`
- Test: `tests/unit/import-holger.test.ts`

`REMA` (6 573) and `MISC` (11) are Holger's note fields — import as person notes, add to `KNOWN_INDI_TAGS` (handled, not skipped). `_HDP` and `_H8P` are internal Holger metadata with no genealogical value — they must **not** be silently suppressed; they stay out of `KNOWN_INDI_TAGS` so they appear in `skipped`, and the holger profile additionally adds an `unmappedData` entry with a human-readable explanation of what was discarded and why.

- [ ] **Step 1: Write failing tests**

Append to `tests/unit/import-holger.test.ts`:

```typescript
const HOLGER_REMA_GED = `
0 HEAD
1 GEDC
2 VERS 5.5
0 @I1@ INDI
1 NAME Kalle /Svensson/
1 SEX M
1 REMA Född i Karolinska sjukhuset.
1 _HDP 6,0,n,n,,PKalleSven1945M,2010-11-03,2026-04-05,0,0,0,P,,1945-03-13,,,
1 _H8P 0,0,0,0
0 TRLR
`.trim();

const HOLGER_REMA_EXISTING_NOTE_GED = `
0 HEAD
1 GEDC
2 VERS 5.5
0 @I1@ INDI
1 NAME Kalle /Svensson/
1 SEX M
1 NOTE Befintlig anteckning.
2 CONT Fortsättning.
1 REMA Extra notering.
0 TRLR
`.trim();

const HOLGER_MISC_GED = `
0 HEAD
1 GEDC
2 VERS 5.5
0 @I1@ INDI
1 NAME Kalle /Svensson/
1 SEX M
1 MISC Totalt 15 barn, alla med Johan
0 TRLR
`.trim();

describe('holger profile — REMA/MISC → notes, _HDP/_H8P suppression', () => {
  it('imports REMA as person notes', () => {
    const db = createTestDb();
    importGedcom(db, parseGedcom(HOLGER_REMA_GED), { profile: 'holger' });
    const row = db.get('SELECT notes FROM persons LIMIT 1') as { notes: string } | undefined;
    expect(row?.notes).toContain('Född i Karolinska sjukhuset.');
  });

  it('appends REMA to existing notes with double newline separator', () => {
    const db = createTestDb();
    importGedcom(db, parseGedcom(HOLGER_REMA_EXISTING_NOTE_GED), { profile: 'holger' });
    const row = db.get('SELECT notes FROM persons LIMIT 1') as { notes: string } | undefined;
    expect(row?.notes).toContain('Befintlig anteckning.');
    expect(row?.notes).toContain('Extra notering.');
    expect(row?.notes).toMatch(/\n\n/);
  });

  it('imports MISC as person notes', () => {
    const db = createTestDb();
    importGedcom(db, parseGedcom(HOLGER_MISC_GED), { profile: 'holger' });
    const row = db.get('SELECT notes FROM persons LIMIT 1') as { notes: string } | undefined;
    expect(row?.notes).toContain('Totalt 15 barn');
  });

  it('lists _HDP and _H8P in skipped tags (not silently ignored)', () => {
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(HOLGER_REMA_GED), { profile: 'holger' });
    const tags = report.skipped.map(s => s.tag);
    expect(tags).toContain('_HDP');
    expect(tags).toContain('_H8P');
  });

  it('adds unmappedData entry for _HDP/_H8P with descriptive category', () => {
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(HOLGER_REMA_GED), { profile: 'holger' });
    const entry = report.unmappedData?.find(u => u.category.includes('_HDP'));
    expect(entry).toBeTruthy();
    expect(entry?.category).toMatch(/internal metadata/i);
  });

  it('adds a warnings entry summarising REMA/MISC as imported notes', () => {
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(HOLGER_REMA_GED), { profile: 'holger' });
    expect(report.warnings.some(w => w.includes('REMA') && w.includes('note'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && npx vitest run tests/unit/import-holger.test.ts 2>&1 | tail -20
```

- [ ] **Step 3: Implement in `src/import/gedcom/import-core.ts`**

**`REMA` and `MISC`** — add to `KNOWN_INDI_TAGS` (data is handled, should not appear in `skipped`):

```typescript
'REMA', 'MISC',
```

In the INDI processing loop (Phase 2, around the `updatePerson` call), add a holger-specific block that collects `REMA` and `MISC` values and appends them to the person's notes. Locate where the person's notes are set (they come from the `NOTE` tag processing). After all NOTE lines are assembled into `noteText`, add:

```typescript
// Holger: append REMA and MISC as additional notes
if (isHolger) {
  const extras: string[] = [];
  for (const child of node.children) {
    if (child.tag === 'REMA' || child.tag === 'MISC') {
      const val = child.value?.trim();
      if (val) extras.push(val);
    }
  }
  if (extras.length > 0) {
    const extra = extras.join('\n');
    noteText = noteText ? `${noteText}\n\n${extra}` : extra;
  }
}
```

Track the total REMA+MISC count across all INDIs (add a counter `holgerRemarkCount` in `doImportGedcom`). After Phase 2, if `isHolger && holgerRemarkCount > 0`, push to `warnings`:

```typescript
warnings.push(`${holgerRemarkCount} Holger REMA/MISC remarks imported as person notes`);
```

**`_HDP` and `_H8P`** — do **not** add to `KNOWN_INDI_TAGS`. They will naturally appear in `skipped`. After Phase 2, if `isHolger`, add an `unmappedData` entry (using the existing mechanism around line 967):

```typescript
// In the post-processing that builds unmappedData:
if (isHolger) {
  const hdpCount = skippedTags.get('_HDP') ?? 0;
  const h8pCount = skippedTags.get('_H8P') ?? 0;
  if (hdpCount + h8pCount > 0) {
    unmappedData.push({
      category: '_HDP / _H8P — Holger internal metadata (sort keys, display IDs, timestamps). All data is present in standard GEDCOM tags; nothing was lost.',
      count: hdpCount + h8pCount,
    });
  }
}
```

This ensures the discarded data is both counted in `skipped` (raw tag list) and explained in `unmappedData` (human-readable description).

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && npx vitest run tests/unit/import-holger.test.ts 2>&1 | tail -10
```

- [ ] **Step 5: Run full unit tests**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && npm test 2>&1 | tail -10
```

- [ ] **Step 6: Commit**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && git add src/import/gedcom/import-core.ts tests/unit/import-holger.test.ts && git commit -m "feat(holger): import REMA/MISC as person notes; suppress _HDP/_H8P from unrecognised tags"
```

---

## Task 3.6: SUBM → default focus person

**Files:**
- Modify: `src/import/gedcom/import-core.ts` (return `defaultPersonId` in report)
- Modify: `src/import/gedcom/index.ts` (add `defaultPersonId?` to `ImportReport`)
- Modify: `src/renderer/views/ImportExportView.vue` (navigate to person after import)
- Test: `tests/unit/import-holger.test.ts`

In Holger exports, the first INDI xref is always the tree subject (the person the tree is about). The `SUBM` record's `NAME` confirms this identity. We use the first INDI encountered in the tree as the default focus person — no name-matching needed.

- [ ] **Step 1: Add `defaultPersonId?` to `ImportReport` in `src/import/gedcom/index.ts`**

```typescript
export interface ImportReport {
  // … existing fields …
  /** DB id of the tree subject (first INDI), if detectable. Currently set for profile='holger'. */
  defaultPersonId?: string;
}
```

- [ ] **Step 2: Write failing test**

Append to `tests/unit/import-holger.test.ts`:

```typescript
const HOLGER_SUBM_GED = `
0 HEAD
1 GEDC
2 VERS 5.5
0 @S1@ SUBM
1 NAME Bengt Sareld
0 @I1@ INDI
1 NAME Bengt Gunnar/Sareld/
1 SEX M
0 @I2@ INDI
1 NAME Anna /Sareld/
1 SEX F
0 TRLR
`.trim();

describe('holger profile — defaultPersonId from first INDI', () => {
  it('sets defaultPersonId to the DB id of the first INDI', () => {
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(HOLGER_SUBM_GED), { profile: 'holger' });
    expect(report.defaultPersonId).toBeTruthy();
    const row = db.get('SELECT id FROM persons WHERE id=?', [report.defaultPersonId]) as { id: string } | undefined;
    expect(row?.id).toBe(report.defaultPersonId);
  });
});
```

- [ ] **Step 3: Implement in `src/import/gedcom/import-core.ts`**

At the top of `doImportGedcom`, declare:

```typescript
let firstPersonId: string | null = null;
```

In Phase 2 (INDI loop), after `createPerson` returns and is inserted into `personMap`, add:

```typescript
if (isHolger && firstPersonId === null) firstPersonId = person.id;
```

At the end of `doImportGedcom`, return `firstPersonId` alongside the existing return values. Thread it through `importGedcom` → `ImportReport.defaultPersonId`.

- [ ] **Step 4: Wire into ImportExportView**

After a successful Holger import, if `result.report.defaultPersonId` is set, navigate to `/persons/${result.report.defaultPersonId}`:

```typescript
if (result.success && result.report?.defaultPersonId) {
  router.push(`/persons/${result.report.defaultPersonId}`);
}
```

- [ ] **Step 5: Run tests**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && npx vitest run tests/unit/import-holger.test.ts 2>&1 | tail -10
```

- [ ] **Step 6: Run full tests**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && npm test 2>&1 | tail -10
```

- [ ] **Step 7: Commit**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && git add src/import/gedcom/import-core.ts src/import/gedcom/index.ts src/renderer/views/ImportExportView.vue tests/unit/import-holger.test.ts && git commit -m "feat(holger): set defaultPersonId to first INDI; navigate to tree subject after import"
```

---

## Task 4: Holger input orchestrator

**Files:**
- Modify: `src/import/holger/index.ts` (EDB code was removed in Task 0; this task ensures the remaining GEDCOM path is correct)

The orchestrator accepts only:
- A `.ged` file → use directly
- A `.zip` containing one or more `.ged` files → unzip to temp dir, use the largest `.ged`

The folder-scanning branch was removed in Task 0 along with the EDB path.

- [ ] **Step 1: Create `src/import/holger/index.ts`**

```typescript
/**
 * Holger/OurKind import orchestrator.
 *
 * Accepts:
 *   - A .ged file — used directly
 *   - A .zip file — unzipped to a temp dir; the largest .ged inside is used
 *   - A HolgerData folder — scanned for .ged files; error if none found
 *
 * In all cases, calls importGedcom() with profile='holger'.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Unzip, UnzipInflate } from 'fflate';
import type { Database } from 'node-sqlite3-wasm';
import { readGedcomFile } from '../../gedcom/encoding';
import { parseGedcom } from '../../gedcom/parser';
import { importGedcom, type ImportOptions } from '../../gedcom/importer';
import type { ImportReport } from '../../gedcom/importer';

export interface HolgerImportOptions {
  /** Path to a .ged file, .zip file, or HolgerData folder/zip */
  sourcePath: string;
  /**
   * Optional: path to the local OurKind Media directory.
   * If supplied, Windows-style FILE paths in OBJE records are remapped here.
   * Example: '/Users/me/OurKind/Media'
   */
  mediaDir?: string;
  onProgress?: (msg: string) => void;
}

export interface HolgerImportResult {
  report: ImportReport;
  gedPath: string;
}

/** Synchronously extract a zip buffer, returning { path→Uint8Array } */
function extractZipSync(zipBuf: Buffer): Map<string, Uint8Array> {
  // Use fflate sync decompress
  const { unzipSync } = require('fflate') as typeof import('fflate');
  const result = unzipSync(new Uint8Array(zipBuf));
  return new Map(Object.entries(result));
}

function findGedFiles(entries: Map<string, Uint8Array>): string[] {
  return [...entries.keys()]
    .filter(k => k.toLowerCase().endsWith('.ged'))
    .sort((a, b) => (entries.get(b)!.length - entries.get(a)!.length)); // largest first
}

function pickGedFromFolder(folderPath: string): string | null {
  const walk = (dir: string): string[] => {
    let results: string[] = [];
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) results = results.concat(walk(full));
        else if (entry.toLowerCase().endsWith('.ged')) results.push(full);
      } catch { /* skip */ }
    }
    return results;
  };
  const files = walk(folderPath).sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);
  return files[0] ?? null;
}

const HOLGER_EXPORT_INSTRUCTIONS =
  'No GEDCOM file found. Export from Holger: Arkiv → Exportera GEDCOM → Generellt format, teckenrepresentation ANSI. Then provide the resulting .ged or .zip file.';

export async function importFromHolger(
  db: Database,
  opts: HolgerImportOptions,
): Promise<HolgerImportResult> {
  const { sourcePath, mediaDir, onProgress } = opts;
  const progress = (msg: string) => onProgress?.(msg);

  let gedPath: string;
  let tmpDir: string | null = null;

  const ext = path.extname(sourcePath).toLowerCase();
  const stat = fs.statSync(sourcePath);

  if (ext === '.ged') {
    // Direct .ged file
    gedPath = sourcePath;
  } else if (ext === '.zip') {
    // Zip containing .ged files OR HolgerData zip
    progress('Extracting zip…');
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holger-'));
    const zipBuf = fs.readFileSync(sourcePath);
    const entries = extractZipSync(zipBuf);
    const gedFiles = findGedFiles(entries);
    if (gedFiles.length === 0) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      throw new Error(HOLGER_EXPORT_INSTRUCTIONS);
    }
    gedPath = path.join(tmpDir, path.basename(gedFiles[0]));
    fs.writeFileSync(gedPath, Buffer.from(entries.get(gedFiles[0])!));
    progress(`Using ${path.basename(gedPath)} from zip`);
  } else if (stat.isDirectory()) {
    // HolgerData folder
    const found = pickGedFromFolder(sourcePath);
    if (!found) throw new Error(HOLGER_EXPORT_INSTRUCTIONS);
    gedPath = found;
    progress(`Found ${path.basename(gedPath)} in folder`);
  } else {
    throw new Error(`Unsupported file type: ${ext}. Provide a .ged or .zip file.`);
  }

  try {
    progress('Reading GEDCOM…');
    const text = readGedcomFile(gedPath);
    progress('Parsing GEDCOM…');
    const tree = parseGedcom(text);
    progress('Importing…');
    const importOptions: ImportOptions = { profile: 'holger', ...(mediaDir ? { mediaDir } : {}) };
    const report = importGedcom(db, tree, importOptions);
    progress(`Done — ${report.persons} persons, ${report.families} families`);
    return { report, gedPath };
  } finally {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors (or only pre-existing errors unrelated to new file).

- [ ] **Step 3: Commit**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && git add src/import/holger/index.ts && git commit -m "feat(holger): add importFromHolger orchestrator (.ged, .zip, folder)"
```

---

## Task 5: IPC handlers + preload

**Files:**
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add IPC handlers to `src/main/ipc.ts`**

Add import near the other import lines:

```typescript
import { importFromHolger } from '../import/holger/index';
```

Add handlers after the existing Genney handlers (around line 233):

```typescript
wrapHandler('import:holgerSelectFile', async () => {
  const win = BrowserWindow.getFocusedWindow();
  const result = await dialog.showOpenDialog(win ?? null, {
    title: 'Select Holger GEDCOM export',
    properties: ['openFile'],
    filters: [
      { name: 'GEDCOM / Zip', extensions: ['ged', 'zip'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePaths.length) return { canceled: true };
  return { canceled: false, path: result.filePaths[0] };
});

wrapHandler('import:holgerSelectMedia', async () => {
  const win = BrowserWindow.getFocusedWindow();
  const result = await dialog.showOpenDialog(win ?? null, {
    title: 'Select OurKind Media folder (optional)',
    properties: ['openDirectory'],
  });
  if (result.canceled || !result.filePaths.length) return { canceled: true };
  return { canceled: false, path: result.filePaths[0] };
});

wrapHandler('import:holgerRun', async (opts: { sourcePath: string; mediaDir?: string }) => {
  const win = BrowserWindow.getFocusedWindow();
  try {
    const result = await importFromHolger(getDatabase(), {
      sourcePath: opts.sourcePath,
      mediaDir: opts.mediaDir,
      onProgress: (msg) => {
        if (win) win.webContents.send('import:holgerProgress', { message: msg });
      },
    });
    return { success: true, report: result.report };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});
```

- [ ] **Step 2: Add preload entries to `src/preload/index.ts`**

In the `import:` block (alongside the genney entries):

```typescript
holgerSelectFile: () => ipcRenderer.invoke('import:holgerSelectFile'),
holgerSelectMedia: () => ipcRenderer.invoke('import:holgerSelectMedia'),
holgerRun: (opts: unknown) => ipcRenderer.invoke('import:holgerRun', opts),
onHolgerProgress: (cb: (msg: string) => void) =>
  ipcRenderer.on('import:holgerProgress', (_e, data: { message: string }) => cb(data.message)),
```

- [ ] **Step 3: Verify TypeScript compilation**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && git add src/main/ipc.ts src/preload/index.ts && git commit -m "feat(holger): add IPC handlers and preload for Holger import"
```

---

## Task 6: MCP tool

**Files:**
- Modify: `src/mcp/createServer.ts`

- [ ] **Step 1: Register `import_holger` tool in `src/mcp/createServer.ts`**

Add the import at the top:

```typescript
import { importFromHolger } from '../import/holger/index';
```

Add the tool registration after `import_genney`:

```typescript
server.registerTool('import_holger', {
  description:
    'Import a Holger/OurKind GEDCOM export (.ged or .zip) into the database. ' +
    'Handles Holger-specific ENGA TYPE semantics (couple subtypes: Sambo, Partner, etc.) ' +
    'and ADOP TYPE (Fosterbarn, Adoptivbarn). ' +
    'Optionally remaps Windows-style media paths to a local directory. ' +
    'To generate the GEDCOM from Holger: Arkiv → Exportera GEDCOM → Generellt format, ANSI encoding.',
  inputSchema: {
    type: 'object',
    properties: {
      source_path: {
        type: 'string',
        description: 'Path to a .ged file, a .zip containing a .ged, or a HolgerData folder',
      },
      media_dir: {
        type: 'string',
        description: 'Optional: path to local OurKind/Media directory for remapping image paths',
      },
    },
    required: ['source_path'],
  },
}, async (args: { source_path: string; media_dir?: string }) => {
  try {
    const result = await importFromHolger(db, {
      sourcePath: args.source_path,
      mediaDir: args.media_dir,
    });
    const r = result.report;
    return {
      content: [{
        type: 'text',
        text: `Holger import complete: ${r.persons} persons, ${r.families} families, ${r.events} events, ${r.media} media records.`,
      }],
    };
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
    };
  }
});
```

- [ ] **Step 2: Verify compilation**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && git add src/mcp/createServer.ts && git commit -m "feat(holger): register import_holger MCP tool"
```

---

## Task 7: UI — Holger section in ImportExportView

**Files:**
- Modify: `src/renderer/views/ImportExportView.vue`

The Holger section sits between the Genney section and the GEDCOM section. It has:
1. A "Select file" button (opens file picker for `.ged`/`.zip`)
2. An optional "Select Media folder" button
3. An "Import" button (enabled when a file is selected)
4. A progress line
5. Shares the existing `importReport` / `setStatus` pattern

- [ ] **Step 1: Add Holger section to template in `ImportExportView.vue`**

After the closing `</div>` of the Genney section (after line ~17), add:

```html
<!-- Holger / OurKind -->
<div class="section">
  <h3>{{ $t('importExport.holgerTitle') }}</h3>
  <p class="section-desc">{{ $t('importExport.holgerDesc') }}</p>
  <div class="section-buttons">
    <button @click="holgerPickFile" :disabled="busy">{{ $t('importExport.holgerPickFile') }}</button>
    <button @click="holgerPickMedia" :disabled="busy">{{ $t('importExport.holgerPickMedia') }}</button>
    <button @click="handleImportFromHolger" :disabled="busy || !holgerSourcePath">{{ $t('importExport.holgerImport') }}</button>
  </div>
  <p v-if="holgerSourcePath" class="section-instructions">{{ holgerSourcePath }}<span v-if="holgerMediaDir"> + {{ holgerMediaDir }}</span></p>
  <p v-if="holgerProgress" class="section-progress">{{ holgerProgress }}</p>
</div>
```

- [ ] **Step 2: Add reactive state and handlers to `<script setup>` in `ImportExportView.vue`**

After `const genneyProgress = ref('')`:

```typescript
const holgerSourcePath = ref('');
const holgerMediaDir = ref('');
const holgerProgress = ref('');

async function holgerPickFile() {
  const r = await window.api.import.holgerSelectFile() as { canceled: boolean; path?: string };
  if (!r.canceled && r.path) holgerSourcePath.value = r.path;
}

async function holgerPickMedia() {
  const r = await window.api.import.holgerSelectMedia() as { canceled: boolean; path?: string };
  if (!r.canceled && r.path) holgerMediaDir.value = r.path;
}

async function handleImportFromHolger() {
  if (!holgerSourcePath.value) return;
  busy.value = true;
  holgerProgress.value = t('importExport.holgerRunning');
  window.api.import.onHolgerProgress((msg: string) => { holgerProgress.value = msg; });
  try {
    const result = await window.api.import.holgerRun({
      sourcePath: holgerSourcePath.value,
      mediaDir: holgerMediaDir.value || undefined,
    }) as { success: boolean; report?: Record<string, number>; error?: string };
    if (result.success && result.report) {
      const r = result.report;
      setStatus(t('importExport.holgerSuccess', { persons: r.persons ?? 0, events: r.events ?? 0 }));
      importReport.value = {
        events: { persons: r.persons, events: r.events, media: r.media, families: r.families },
        warnings: [],
        skipped: [],
      };
    } else {
      setStatus(t('importExport.holgerError', { error: result.error ?? 'Unknown error' }), 'error');
    }
  } catch (err) {
    setStatus(t('importExport.holgerError', { error: err instanceof Error ? err.message : String(err) }), 'error');
  } finally {
    busy.value = false;
    holgerProgress.value = '';
  }
}
```

- [ ] **Step 3: Add i18n strings**

Find the i18n locale files and add keys. Search for where `importExport.genneyTitle` is defined:

```bash
grep -rl "genneyTitle" /Users/jonasahnstedt/git/slaktforskning/src
```

Add alongside the genney keys:

```json
"holgerTitle": "Holger / OurKind",
"holgerDesc": "Import from a Holger 8 GEDCOM export (.ged or .zip). Export from Holger: Arkiv → Exportera GEDCOM → Generellt format, ANSI.",
"holgerPickFile": "Select GEDCOM file…",
"holgerPickMedia": "Select Media folder (optional)…",
"holgerImport": "Import",
"holgerRunning": "Importing…",
"holgerSuccess": "Import complete: {persons} persons, {events} events.",
"holgerError": "Import failed: {error}"
```

- [ ] **Step 4: Verify app starts**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && npm start &
sleep 8 && kill %1
```

Expected: no startup errors in terminal output.

- [ ] **Step 5: Run full tests**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && npm test 2>&1 | tail -10
```

- [ ] **Step 6: Commit**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && git add src/renderer/views/ImportExportView.vue && git commit -m "feat(holger): add Holger import section to ImportExportView"
```

---

## Task 8: Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`
- Modify: `docs/PLAN.md`

- [ ] **Step 1: Update CLAUDE.md MCP tool list**

In the `**GEDCOM/import tools:**` section, add:

```
`import_holger` (`.ged` files or zip containing `.ged` — for Holger/OurKind GEDCOM exports use `profile: "holger"`; accepts `mediaDir` for remapping Windows media paths)
```

- [ ] **Step 2: Update README.md**

Add Holger to the import section (alongside Genney):

```markdown
- **Holger/OurKind** — import via the Import/Export screen or `import_holger` MCP tool. Export from Holger: Arkiv → Exportera GEDCOM → Generellt format, ANSI encoding. Optionally provide the OurKind/Media directory to remap image paths.
```

- [ ] **Step 3: Bump version in package.json**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json'));
const [maj, min, patch] = pkg.version.split('.').map(Number);
pkg.version = \`\${maj}.\${min}.\${patch+1}\`;
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
console.log('Version:', pkg.version);
"
```

- [ ] **Step 4: Final test run**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && npm test 2>&1 | tail -15
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/jonasahnstedt/git/slaktforskning && git add CLAUDE.md README.md package.json docs/PLAN.md && git commit -m "docs: document Holger import, bump version"
```

---

## Spec Coverage Self-Review

| Requirement | Task |
|-------------|------|
| Remove DBISAM/EDB import path from code + GUI | Task 0 |
| Analyse DBISAM format (why GEDCOM suffices) | Background section |
| What data is missing in GEDCOM vs backup | Background table |
| ENGA TYPE → couple subtype | Task 1 |
| ADOP TYPE → parent_child subtype | Task 2 |
| Media path remapping | Task 3 |
| `REMA` / `MISC` → person notes + reported in warnings | Task 3.5 |
| `_HDP` / `_H8P` → in `skipped` + explained in `unmappedData` (never silently discarded) | Task 3.5 |
| `SUBM` → `defaultPersonId` / navigate to tree subject | Task 3.6 |
| Accept `.ged` or `.zip` (only) | Task 4 |
| IPC + preload | Task 5 |
| MCP tool | Task 6 |
| UI section (GEDCOM only, no EDB) | Task 7 |
| Tests for profile behaviour | Tasks 1–3, 3.5, 3.6 |
| Docs updated | Task 8 |