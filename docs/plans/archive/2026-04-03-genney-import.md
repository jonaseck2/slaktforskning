# Plan: Genney Import Profile

**Date:** 2026-04-03
**Status:** Not started
**Depends on:** v0.6.0 (GEDCOM Import/Export)

## Background

[Genney](https://genny.se) (by Genney Digit) is the leading Swedish-made genealogy desktop application. First released 2015, v4.0 in 2024. It runs on Windows, macOS, and Linux (written in Java) and is designed specifically for Scandinavian genealogy research. It is the most widely used Swedish genealogy program among serious researchers and the primary tool used with records from Riksarkivet, DISBYT, and ArkivDigital.

**Key data point:** Genney uses GEDCOM 5.5.1 as its primary interchange format. This means the base GEDCOM importer from v0.6.0 will handle Genney exports — but with gaps. This milestone adds a Genney-specific import profile that:

1. Handles Genney's custom GEDCOM tags (`_UID`, `_YHAPLOGROUP`, `_MHAPLOGROUP`, etc.) rather than silently dropping them
2. Correctly parses Swedish place name hierarchies (socken → härad → landskap/län → Sverige)
3. Detects patronymic surnames and stores them in `patronymic_base`
4. Preserves DISBYT and external references in `person_identifiers`
5. Provides a dedicated "Importera från Genney" UI flow with step-by-step instructions

## What Genney Exports (GEDCOM 5.5.1 + Extensions)

### Standard GEDCOM (covered by v0.6.0 base importer)
- `INDI` records: names (`NAME`, `GIVN`, `SURN`, `NPFX`, `NSFX`), sex (`SEX`), birth/death events
- `FAM` records: couple + parent-child relationships
- `SOUR`/`CITA` blocks: sources and citations
- `PLAC` tags on events: place name strings
- `DATE` tags: standard GEDCOM date format (EXACT, ABT, BEF, AFT, BET/AND)
- `NOTE` tags: free-text notes

### Genney-specific extensions (NEW in this milestone)

| GEDCOM tag | Meaning | Target field |
|------------|---------|--------------|
| `_UID` on INDI | Genney internal UUID | `person_identifiers` (type: `other`, label "Genney UID") |
| `_YHAPLOGROUP` on INDI | Y-DNA haplogroup (paternal line) | `persons.notes` (prefixed "Y-DNA: ") |
| `_MHAPLOGROUP` on INDI | mtDNA haplogroup (maternal line) | `persons.notes` (prefixed "mtDNA: ") |
| `REFN` on INDI | External reference number (DISBYT, Ancestry, etc.) | `person_identifiers` (type: `refn`) |
| `RIN` on INDI | Record Identification Number | `person_identifiers` (type: `rin`) |
| `_PRIM` on OBJE | Primary media flag | Ignored (media dropped) |

### Swedish PLAC format
Genney follows the Swedish ecclesiastical hierarchy in PLAC tags:

```
Fässberg, Mölndals landsförsamling, Göteborgs och Bohus län, Sverige
Örby, Marks härad, Älvsborgs län, Sverige
Kungsbacka socken, Halland, Sverige
```

The base GEDCOM importer calls `findOrCreatePlace(name)` — this creates a flat record from the full string. This milestone replaces that with a hierarchical parser that:
1. Splits on commas
2. Trims each part
3. Creates or finds each level as a `Place` with `parent_place_id` linking to the next level
4. Returns the innermost (most specific) place

### Patronymic surname detection
Swedish patronymics (-son/-dotter) were in use until roughly 1900. A person with `SURN = Johansson` and birth year before ~1890 likely has a patronymic, not a hereditary surname. On import:
- Detect surnames ending in `son` or `dotter` (case-insensitive)
- Extract the base: "Johansson" → base "Johan", "Persdotter" → base "Per"  
- Store base in `person_names.patronymic_base`

This is heuristic — the user can correct it. False positives (e.g. "Karlsson" as a hereditary surname) are acceptable; the field is informational only.

### Name type mapping
Genney uses GEDCOM `NAME` record types (`_TYPE` or `TYPE` sub-tag):
- `BIRTH` → `name_type: 'birth'`
- `MARRIED` → `name_type: 'married'`
- `AKA` → `name_type: 'aka'`
- Default (first NAME record) → `name_type: 'birth'`

## Implementation Plan

### Step 1 — Swedish place hierarchy parser
**File:** `src/gedcom/swedishPlace.ts` (new)

```typescript
// Parses "Fässberg, Mölndals landsförsamling, Göteborg och Bohus, Sverige"
// Creates: Fässberg (parent: Mölndals) → Mölndals (parent: GoBohus) → GoBohus (parent: Sverige) → Sverige
export function findOrCreateSwedishPlace(db: Database, placTag: string): Place
```

- Splits on `, ` (comma-space)
- Calls `findOrCreatePlace` for each level, outer-to-inner
- Sets `parent_place_id` to chain the hierarchy
- Returns the innermost place

### Step 2 — Patronymic detector
**File:** `src/gedcom/swedishNames.ts` (new)

```typescript
export function extractPatronymic(surname: string): string | null
// "Johansson" → "Johan"
// "Persdotter" → "Per"
// "Lindström" → null  (not a patronymic)
```

- Regex: `/^(.+?)(s?son|dotter)$/i`
- Applied in importer when `person_names.surname` matches

### Step 3 — Extend GEDCOM importer for Genney tags
**File:** `src/gedcom/importer.ts` (extend v0.6.0)

In the INDI handler, after creating the person:
- Loop `indi.children` looking for `_UID`, `REFN`, `RIN`, `_YHAPLOGROUP`, `_MHAPLOGROUP`
- For `_UID`/`REFN`/`RIN` → call `addPersonIdentifier(db, personId, { type, value })`
- For `_YHAPLOGROUP`/`_MHAPLOGROUP` → append to `notes` via `updatePerson`

In place resolution:
- Replace `findOrCreatePlace(db, placTag)` calls with `findOrCreateSwedishPlace(db, placTag)` (gracefully falls back to flat if parse fails)

In name handler:
- After `addPersonName`, call `extractPatronymic(surname)` and update `patronymic_base` if non-null

### Step 4 — Unit tests
**File:** `tests/unit/swedishPlace.test.ts` (new)
- "Fässberg, Mölndals landsförsamling, Göteborg och Bohus, Sverige" → 4-level chain
- Single-part place → flat place, no parent
- Already-existing place → reuses without duplicate

**File:** `tests/unit/swedishNames.test.ts` (new)
- "Johansson" → "Johan"
- "Persdotter" → "Per"  
- "Andersson" → "Ander"
- "Lindström" → null
- "Eriksson" → "Erik"

Extend `tests/unit/gedcom.test.ts` with Genney-tagged fixtures:
- INDI with `_UID`, `REFN`, `_YHAPLOGROUP` → verify identifiers + notes
- PLAC with Swedish hierarchy → verify place chain

### Step 5 — UI: Genney import flow
**File:** `src/renderer/views/PersonsView.vue` (extend)

Add "Importera från Genney" button alongside the existing "Importera GEDCOM" button. Clicking it shows a modal with:
1. Instructions: "Öppna Genney → Arkiv → Exportera → GEDCOM (.ged) → Spara"
2. Screenshot placeholder of Genney export menu (optional)
3. "Välj fil..." button → triggers `gedcom:import` IPC (reuses the same import pipeline)
4. Progress/result display identical to base GEDCOM import

No new IPC channel needed — the Genney importer is a superset of the GEDCOM importer, toggled by a flag passed to the importer.

**i18n keys needed:**
```
gedcom.importFromGenney          = "Importera från Genney"
gedcom.genneyInstructions        = "Exportera din Genney-databas som GEDCOM: Arkiv → Exportera GEDCOM"
gedcom.genneyInstructionsEn      = "Export your Genney database as GEDCOM: File → Export GEDCOM"
```

### Step 6 — IPC flag
**File:** `src/main/ipc.ts`

Add optional `{ profile: 'genney' }` option to `gedcom:import` handler. When set:
- Routes place strings through `findOrCreateSwedishPlace`
- Processes Genney custom tags
- Applies patronymic detection

Default (no flag) = base GEDCOM import (no Swedish extensions, matches v0.6.0 behaviour).

### Step 7 — MCP tool
Extend `import_gedcom` tool with optional `profile?: 'genney'` parameter:
```typescript
profile: z.enum(['genney']).optional().describe('Import profile for Genney-specific GEDCOM extensions')
```

### Step 8 — Docs
Update `README.md`, `CLAUDE.md`, `docs/PLAN.md`, `docs/MCP.md`.

## What is NOT supported

| Feature | Reason | Workaround |
|---------|--------|------------|
| Genney XML format | Schema not publicly documented | Export as GEDCOM from Genney |
| Media/photos (OBJE) | Dropped by base importer | Attach manually after import |
| DNA match data | Not in GEDCOM | Store haplogroup in notes only |
| DISBYT source links | DISBYT requires separate authentication | REFN value preserved as identifier |
| Living person suppression | Genney may omit living persons | Known limitation; document in UI |

## Scope Note

This milestone intentionally reuses the v0.6.0 GEDCOM infrastructure. It is an additive profile layer, not a separate importer. The combined deliverable is a single GEDCOM importer that handles both generic GEDCOM and Genney's Swedish extensions, selectable via the `profile` flag.

## Test Data

A sample Genney GEDCOM export for the Ahnstedt/Eckerström family (the user's own tree) would be the ideal integration test fixture. Ask the user to export a small subtree (5-10 persons) from Genney as GEDCOM and place it in `tests/fixtures/genney-sample.ged`.
