# GEDCOM Full Support Plan
**Created:** 2026-04-06  
**Status:** Research / Planning

---

## Goal

Full standards-conformant import of GEDCOM 5.5.1, 5.5.5, and 7.0, exposed as distinct import buttons in the UI. Includes a data-loss validation report, code refactoring into `src/import/gedcom/`, and consideration of round-trip export quality.

---

## Research Summary

### GEDCOM 5.5.5

5.5.5 (released Oct 2019, by Tamura Jones) is a **maintenance release** of 5.5.1 — a stricter, cleaner spec with no new features. Key properties:

- Any valid 5.5.5 file is structurally valid 5.5.1 (just change the version number in HEAD).
- Requires Unicode encoding (not ANSEL). Our importer already handles UTF-8.
- Removes ambiguity from 5.5.1 (one encoding, one place format, no deprecated elements).
- **No major apps explicitly export 5.5.5** — it occupies an awkward middle ground before 7.0.
- **Implementation strategy:** Parse 5.5.5 identically to 5.5.1. Just accept the version string `5.5.5` in the header without rejecting it. No separate code path needed.

### GEDCOM 7.0

Released May 2021 by FamilySearch. Breaking changes from 5.5.1. Adoption is growing in 2025–2026 (Heredis, RootsMagic 10, Legacy FT 10, Ancestris, webtrees).

#### Key breaking differences relevant to our importer

| Area | 5.5.1 | 7.0 | Our Action |
|------|-------|-----|------------|
| Encoding | Multi (ANSEL/UTF-8/etc.) | UTF-8 only | Already handle UTF-8 |
| `CONC` | Line continuation without break | **Reserved** — not a valid tag | Skip CONC lines (don't crash) |
| Notes | `NOTE` = inline OR pointer to record | `NOTE` = inline only; `SNOTE` = pointer | Handle `SNOTE` same as pointer `NOTE` |
| Source citations | `SOUR` = inline text OR pointer | `SOUR` = pointer only (inline text gone) | Inline `SOUR` values: wrap as anonymous source |
| External IDs | `AFN`, `RFN`, `RIN` | `EXID` with `TYPE` URI | Map `EXID` to `person_identifiers` with type=`exid` |
| Name translations | `ROMN`, `FONE` | `TRAN` with `LANG` | Store first `TRAN` as `aka` name type, or ignore |
| Relationship roles | `RELA` free text | `ROLE` enumerated | Map known values; treat unknowns as `other` |
| Object linking | `OBJE` inline or pointer | `OBJE` pointer only | Already handle pointers |
| `SUBN` record | Present | Removed | Already ignored |
| `AFN`/`RFN`/`RIN` | Present | Replaced by `EXID` | Kept in 5.5.1 path; new `EXID` handler for 7.0 |
| Name pieces | Each sub-tag once | Multiple `SURN`, `GIVN` allowed | Concatenate multiples with space |
| TYPE values | Lowercase: `birth`, `married` | Uppercase: `BIRTH`, `MARRIED` | Normalize to lowercase on read |
| `PHRASE` sub-tag | Not in spec | Non-standard value clarifier | Store as `date_original` or append to description |
| `SCHMA`/`TAG` | Not in spec | Extension mechanism in HEAD | Parse and log; use URI→tag mapping for known extensions |
| `NO` record | Not in spec | Negative assertion (event didn't happen) | Log as warning; skip import |
| Dual dates | In payload: `1648/9` | `PHRASE` sub-tag | Read `PHRASE` if present for `date_original` |

#### What does NOT change in 7.0

- `INDI`, `FAM`, `SOUR`, `REPO`, `OBJE`, `TRLR` record types
- `HUSB`, `WIFE`, `CHIL` in FAM (structure preserved, gender-neutral in semantics)
- `FAMS`, `FAMC` back-references
- `MARR`, `DIV`, `BIRT`, `DEAT`, and all event tags
- `PLAC`, `DATE`, `PAGE`, `QUAY` sub-tags
- `NPFX`, `NSFX`, `GIVN`, `SURN`, `SPFX`, `NICK` name pieces

### Existing Importer Assessment

**Current file:** `src/gedcom/importer.ts` (831 lines)

Strengths:
- 5-phase import order (SOUR → INDI → FAM → ASSO → _PLAC)
- Statement caching (pre-compiles ~50 SQL statements)
- Profile system (genney/holger) for app-specific extensions
- ADDR/MAP sub-tag handling for places
- Media path remapping (Holger)
- Reports skipped tags

Gaps for full 5.5.1 compliance:
- `REPO` records are silently ignored (no Repository import from GEDCOM)
- `ASSO` only handles event participants and non-primary relationships — drops `RELA` free-text values that don't match our schema
- No handling of `TITL` on individuals (personal title/nobility)
- `_LIVING` tag currently handled (non-standard) but standard `RESN` (restriction notice) is not
- Inline `SOUR` citations (non-pointer) produce no citation — silently dropped
- `NOTE` records at level 0 are collected into `noteMap` but notes on sources, FAMs, and events may be inconsistently applied

Gaps for 7.0:
- `SNOTE` tag not recognized → skipped
- `EXID` tag not recognized → skipped
- `TRAN` tag not recognized → skipped
- Inline `SOUR` workaround not needed (they're invalid in 7.0) but `PHRASE` sub-tags on dates need handling
- `SCHMA` block in header not parsed
- TYPE values in uppercase not normalized

### Round-Trip Quality Assessment

**Export (`src/gedcom/exporter.ts`):** Currently targets 5.5.1. Exports:
- `INDI` with `NAME`, `SEX`, `BIRT`/`DEAT`/etc. events
- `FAM` with `HUSB`, `WIFE`, `CHIL`, and family events
- `SOUR` records

Round-trip losses (import then export):
1. **`name_prefix`/`name_suffix`** — exported as `NPFX`/`NSFX` ✓ (already supported)
2. **`patronymic_base`** — not exported (no standard GEDCOM tag; could use `SPFX`)
3. **`person_identifiers`** — not exported (should emit `REFN`/`RIN` for standard types; `EXID` for 7.0)
4. **`place.latitude`/`longitude`** — not exported (should emit `MAP.LATI`/`MAP.LONG`)
5. **`place.street`/`city`/`postal_code`** — not exported (should emit `ADDR` under events)
6. **`place.parent_place_id`** — not exported (place hierarchy lost)
7. **`citation.transcription`** — export unclear (should emit `DATA.TEXT`)
8. **`citation.notes`** — not exported
9. **`repositories`** — not exported
10. **`groups`** — no GEDCOM equivalent (acceptable loss)
11. **`research_tasks`** — no GEDCOM equivalent (acceptable loss)
12. **`media`** — exported as `OBJE` file references ✓

---

## Proposed Architecture

### Directory Structure

```
src/import/
├── gedcom/
│   ├── index.ts          # Public API: importGedcom(db, text, opts) → ImportReport
│   ├── parser.ts         # Raw line-by-line parser → GedcomNode tree (version-agnostic)
│   ├── detect.ts         # Version detection from HEAD (5.5.1 / 5.5.5 / 7.0)
│   ├── normalize.ts      # 7.0 → 5.5.1 normalization (SNOTE→NOTE, EXID→RIN, etc.)
│   ├── import-core.ts    # Core 5-phase import logic (refactored from importer.ts)
│   ├── profiles/
│   │   ├── genney.ts     # Genney-specific overrides (findOrCreateSwedishPlace, etc.)
│   │   └── holger.ts     # Holger/OurKind overrides (ENGA TYPE, ADOP TYPE, media paths)
│   └── validation.ts     # Diff report: what was in the file vs what was imported
├── genney/
│   ├── index.ts          # Unchanged (Derby → transform pipeline)
│   └── transform.ts      # Unchanged
└── holger/
    └── index.ts          # Simplified: now calls src/import/gedcom/ directly
src/gedcom/
├── exporter.ts           # Existing exporter (improve round-trip in a follow-up)
└── [importer.ts → deleted, moved to src/import/gedcom/]
```

### Version Detection

```typescript
// src/import/gedcom/detect.ts
export type GedcomVersion = '5.5.1' | '5.5.5' | '7.0' | 'unknown';

export function detectVersion(nodes: GedcomNode[]): GedcomVersion {
  const head = nodes.find(n => n.tag === 'HEAD');
  const gedc = head && getChild(head, 'GEDC');
  const vers = gedc && getChild(gedc, 'VERS');
  const raw = vers?.value?.trim() ?? '';
  if (raw === '7.0') return '7.0';
  if (raw === '5.5.5') return '5.5.5';
  if (raw === '5.5.1' || raw === '5.5') return '5.5.1';
  return 'unknown'; // treat as 5.5.1
}
```

### 7.0 Normalization Strategy

Rather than a separate import pipeline for 7.0, **normalize the node tree to 5.5.1 conventions** before running the shared import-core:

```typescript
// src/import/gedcom/normalize.ts
export function normalizeV70(nodes: GedcomNode[]): GedcomNode[] {
  // 1. SNOTE pointer → resolve to inline NOTE value (expand from snoteMap)
  // 2. EXID → synthetic RIN/REFN sub-node based on TYPE URI
  // 3. TRAN → generate additional NAME node with name_type='aka'
  // 4. Uppercase TYPE values → lowercase (BIRTH→birth, MARRIED→married)
  // 5. CONC lines → skip (they're reserved in 7.0, shouldn't appear)
  // 6. PHRASE under DATE → use as date_original if date_original missing
  // 7. Inline SOUR text (invalid in 7.0, but tolerate gracefully) → anonymous source
  // 8. Multiple GIVN/SURN → concatenate with space
  return normalizedNodes;
}
```

This keeps import-core.ts clean — it only deals with normalized 5.5.1-shaped trees.

### Validation / Data Loss Detection

The most important deliverable. A `ValidationReport` that shows exactly what was in the file and what couldn't be imported:

```typescript
// src/import/gedcom/validation.ts

export interface GedcomStat {
  tag: string;
  occurrences: number;
  imported: number;       // how many were successfully mapped
  dropped: number;        // how many were silently dropped
  reason?: string;        // why dropped ("no app model", "parse error", etc.)
}

export interface ValidationReport extends ImportReport {
  version: GedcomVersion;
  // Aggregate counts from the raw file
  rawCounts: {
    individuals: number;
    families: number;
    sources: number;
    repositories: number;
    notes: number;         // level-0 NOTE/SNOTE records
    objects: number;       // OBJE records
    submitters: number;    // SUBM records (always dropped)
  };
  // Per-tag breakdown
  tagStats: GedcomStat[];
  // Data that was in the file but couldn't be stored
  unmappedData: {
    category: string;     // e.g. "REPO records", "SUBN", "LDS ordinances"
    count: number;
    example?: string;     // first occurrence for debugging
  }[];
  // Data model limitations hit
  modelLimitations: string[];  // e.g. "TRAN sub-tags not stored (no multi-language name model)"
}
```

The validation report replaces the current `ImportReport.skipped` array with a much richer structure. The UI shows this after import so users can see if anything was lost.

### UI Changes

In `ImportExportView.vue`, the GEDCOM import section becomes three distinct buttons:

```
[ Import GEDCOM 5.5.1 / 5.5.5 ]   (existing behavior, cleaned up)
[ Import GEDCOM 7.0 ]              (new: same pipeline + normalization)
[ Import GEDCOM (auto-detect) ]    (optional: detect version from header)
```

Or alternatively: one button that auto-detects the version and shows which version was detected in the result modal.

The import report modal gains a new "Data Loss" tab showing `unmappedData` and `modelLimitations`.

---

## Implementation Steps

### Step 1: Refactor `src/gedcom/importer.ts` → `src/import/gedcom/` ✅ DONE

- Move `src/gedcom/importer.ts` to `src/import/gedcom/import-core.ts`
- Extract pure parser into `src/import/gedcom/parser.ts` (already somewhat separate)
- Create `src/import/gedcom/index.ts` as the new public API
- Update all imports in `src/main/ipc.ts`, `src/mcp/createServer.ts`, `src/import/holger/index.ts`
- Move Genney/Holger profile logic into `src/import/gedcom/profiles/`

**No behavior change in this step — pure refactor.**

### Step 2: Add Version Detection and 5.5.5 Support

- Add `src/import/gedcom/detect.ts`
- Accept `5.5.5` and `7.0` in the version check without warning
- For `5.5.5`: no normalization needed — parse identically to 5.5.1
- Update the import report to include `version: GedcomVersion`

### Step 3: Add 7.0 Normalization

- Add `src/import/gedcom/normalize.ts`
- Handle `SNOTE`, `EXID`, `TRAN`, uppercase TYPE values, `PHRASE`, `CONC`
- Run normalization before import-core when version is 7.0
- Test with a `maximal70.ged` sample file

### Step 4: Add Validation / Data Loss Report

- Add `src/import/gedcom/validation.ts`
- Instrument import-core to track counts and drops
- Replace `ImportReport.skipped` with full `ValidationReport`
- Update the UI import report modal to show data loss section
- Update MCP `import_gedcom` tool return schema

### Step 5: Improve Round-Trip Export

- Export `person_identifiers` as `REFN`/`RIN` (5.5.1) or `EXID` (7.0)
- Export `place.latitude`/`longitude` as `MAP.LATI`/`MAP.LONG`
- Export `place.street`/`city`/`postal_code` as `ADDR` under residence events
- Export `citation.transcription` as `DATA.TEXT`
- Export `repositories` as `REPO` records linked to `SOUR` with `REPO` pointer
- Add 7.0 export option (swap `RIN`→`EXID`, `NOTE` pointer→`SNOTE`, emit `HEAD.SCHMA`)

### Step 6: Move Genney/Holger Overlapping Logic to Standard

Per the user's requirement: if any Holger/Genney-specific adaptation already exists in the standard (no data loss), move it to standard.

**Candidates to move from profile → standard:**
- `ADDR` sub-tag parsing (currently Holger-specific) → move to standard 5.5.1 (it's in the spec)
- `MAP.LATI`/`MAP.LONG` parsing → move to standard (it's in 5.5.1)
- `NPFX`/`NSFX` handling → already standard ✓
- `OBJE FILE` path linking → already standard ✓

**Keep in profiles (Holger-specific, no standard equivalent):**
- `ENGA TYPE Sambo/Partner/Parter` → relationship subtype mapping
- `ADOP TYPE Fosterbarn/Adoptivbarn` → parent-child subtype from Swedish text
- Windows-to-local media path remapping (`remapHolgerMediaPath`)

**Keep in profiles (Genney-specific, no standard equivalent):**
- `_UID`, `_ANID`, `_RAID`, `_PNUMMER` identifiers
- `_FSI` → FamilySearch identifier
- Asterisk notation in given names (`*preferred*`)
- `findOrCreateSwedishPlace` hierarchy parsing
- `_PLAC_ID` for stable place UUIDs

---

## Data Model Considerations

### Changes Needed

| Gap | Proposed Fix |
|-----|-------------|
| `EXID` with TYPE URI | Store in `person_identifiers` with `identifier_type='exid'` and `identifier_value='URI:value'` |
| `TRAN` name translations | New `person_name_translations` table (person_name_id, lang, value) — **defer to v0.5.x** |
| `REPO` records from GEDCOM | Already have `repositories` table; add `gedcom:import_repo` to import them |
| Multiple `GIVN`/`SURN` (7.0) | Concatenate on import (acceptable); store joined string |
| `PHRASE` on dates | Already have `date_original` field; use it ✓ |
| `NO` negative assertions | Already have `assertions` table (schema only); populate if needed — **defer** |

### No Data Model Changes Required for Initial Implementation

The current schema handles 5.5.1 and 7.0 adequately for a first pass. The `person_identifiers` table already has `identifier_type='other'` for EXID. Deferred gaps (TRAN, NO, ASSO improvements) go on the roadmap.

---

## GEDCOM 5.5.5 vs 5.5.1: No Separate Import Button Needed

Because 5.5.5 is backward-compatible with 5.5.1, a separate UI button adds confusion without value. **Decision:** Auto-detect the version from the HEAD.GEDC.VERS tag and show it in the import report. One import button handles 5.5.1/5.5.5/unknown transparently. The "GEDCOM 7.0" button (or auto-detection) is the meaningful distinction.

**Final UI:** One "Import GEDCOM" button that auto-detects and shows the detected version in the result. Or two buttons: "Import GEDCOM (5.5.x)" and "Import GEDCOM 7.0".

---

## Testing Strategy

### Unit Tests

- `tests/unit/gedcom-detect.test.ts` — version detection from HEAD
- `tests/unit/gedcom-normalize.test.ts` — SNOTE, EXID, TRAN, PHRASE normalization
- `tests/unit/gedcom-validation.test.ts` — data loss report structure
- Extend `tests/unit/import-gedcom.test.ts` with 7.0-specific fixtures

### Test Fixtures

Add to `tests/fixtures/gedcom/`:
- `minimal551.ged` — smallest valid 5.5.1 file (already exists or create)
- `minimal555.ged` — version header changed to 5.5.5
- `minimal70.ged` — minimal GEDCOM 7.0 with SNOTE, EXID, PHRASE
- `maximal70.ged` — FamilySearch's official maximal 7.0 test file (download from gedcom.io)
- `roundtrip.ged` — export from our DB, re-import, verify no data loss

### Round-Trip Validation Approach

```typescript
// Pseudocode for round-trip test
const db1 = createTestDb();
// ... populate with known data ...
const gedcomText = exportGedcom(db1);
const db2 = createTestDb();
importGedcom(db2, gedcomText);
// Compare db1 vs db2 for each entity type
assertSamePersons(db1, db2);
assertSameEvents(db1, db2);
// etc.
```

---

## Roadmap / Milestones

- [ ] **Step 1** — Refactor: move to `src/import/gedcom/` (pure refactor, no behavior change)
- [ ] **Step 2** — 5.5.5 support + version detection in report
- [ ] **Step 3** — 7.0 normalization layer + 7.0 import support
- [ ] **Step 4** — Data loss validation report (replaces skipped tags)
- [ ] **Step 5** — Round-trip export improvements (place coordinates, identifiers, repos)
- [ ] **Step 6** — Move standard-compliant code out of profiles
- [ ] **Step 7** — UI: update import report modal with data loss section
- [ ] **Step 8** — Tests: fixtures + round-trip tests

---

## Out of Scope (Explicit Non-Goals)

- LDS ordinance import (`BAPL`, `SLGC`, `CONL`, `ENDL`, `SLGS`) — not relevant for Swedish genealogy
- `TRAN` multi-language name storage (requires schema change, defer to v0.5.x)
- `NO` negative assertion import (requires assertions table UI, defer)
- `SUBM` submitter records (no app concept)
- GEDCOM-X (JSON/XML) — separate format, not in scope
- GEDZIP archive format (7.0 media bundle) — defer
- ANSEL encoding for legacy 5.5.1 files — if needed, use iconv-lite (add only if users report issues)