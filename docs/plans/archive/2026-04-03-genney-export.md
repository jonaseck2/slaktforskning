# Plan: Genney Export Profile

**Version:** v0.6.5
**Date:** 2026-04-03
**Status:** Not started
**Depends on:** v0.6.2 (Genney Import Profile)

## Goal

Export the database back to a GEDCOM 5.5.1 file that Genney 4.1 can import cleanly, with Swedish-specific extensions round-tripped correctly. A tree imported from Genney via `profile:'genney'` should survive a full cycle:

```
Genney → export GEDCOM → import (profile:genney) → export (profile:genney) → re-import into Genney
```

## What Changes vs the Base Exporter

The base `exportGedcom` produces valid GEDCOM 5.5.1 but is lossy for Genney-specific data:

| Field | Base exporter | Genney profile |
|-------|--------------|----------------|
| `PLAC` on events | Flat place name (`place.name`) | Hierarchical string rebuilt from `parent_place_id` chain |
| `_UID` | Not exported | Written from `person_identifiers` where value starts with `"Genney UID: "` |
| `_YHAPLOGROUP` | Lost (only in notes) | Extracted from notes, written as `1 _YHAPLOGROUP` |
| `_MHAPLOGROUP` | Lost (only in notes) | Extracted from notes, written as `1 _MHAPLOGROUP` |
| `NOTE` | Written verbatim | Haplogroup lines stripped before writing |
| `NAME TYPE` | Already correct (`MARRIED`/`AKA`/`ALIAS`) | No change |
| `REFN`/`RIN` | Already exported | No change |

## Implementation Plan

### Step 1 — Place hierarchy serializer
**File:** `src/gedcom/swedishPlace.ts` (extend)

Add a new export function:

```typescript
/**
 * Walks the parent_place_id chain upward and reconstructs a Genney-style
 * hierarchical PLAC string: "Fässberg, Mölndals landsförsamling, Göteborgs och Bohus, Sverige"
 * Falls back to just place.name if there are no parent links.
 */
export function buildSwedishPlaceName(db: Database, placeId: string): string
```

Algorithm:
1. Load the place by `placeId`
2. Walk `parent_place_id` repeatedly until null
3. Collect names inner-to-outer
4. Join with `, `
5. Return joined string (or just `place.name` if no parents)

### Step 2 — ExportOptions interface
**File:** `src/gedcom/exporter.ts`

```typescript
export interface ExportOptions {
  /** 'genney' enables Genney 4.1 extensions: hierarchical PLAC strings,
   *  _UID/_YHAPLOGROUP/_MHAPLOGROUP tags. */
  profile?: 'genney';
}

export function exportGedcom(db: Database, options?: ExportOptions): string
```

### Step 3 — Extend exportGedcom with Genney logic
**File:** `src/gedcom/exporter.ts`

Three changes gated on `isGenney = options?.profile === 'genney'`:

**A. Place serialization:**
```typescript
// Instead of: if (place) lines.push(`2 PLAC ${place.name}`);
if (place) {
  const placStr = isGenney ? buildSwedishPlaceName(db, ev.place_id) : place.name;
  lines.push(`2 PLAC ${placStr}`);
}
```

**B. `_UID` from identifiers:**
```typescript
if (isGenney) {
  for (const ident of identifiers) {
    if (ident.identifier_type === 'other' && ident.identifier_value.startsWith('Genney UID: ')) {
      lines.push(`1 _UID ${ident.identifier_value.replace('Genney UID: ', '')}`);
    }
  }
}
```

**C. Haplogroups from notes:**
```typescript
if (isGenney && p.notes) {
  const { cleanNotes, yHaplo, mHaplo } = extractHaplogroups(p.notes);
  if (cleanNotes) lines.push(`1 NOTE ${cleanNotes}`);
  if (yHaplo) lines.push(`1 _YHAPLOGROUP ${yHaplo}`);
  if (mHaplo) lines.push(`1 _MHAPLOGROUP ${mHaplo}`);
} else if (p.notes) {
  lines.push(`1 NOTE ${p.notes}`);
}
```

Helper (private, in exporter.ts):
```typescript
function extractHaplogroups(notes: string): { cleanNotes: string; yHaplo: string | null; mHaplo: string | null }
```
- Splits notes on `\n`
- Lines matching `/^Y-DNA: (.+)$/` → `yHaplo`
- Lines matching `/^mtDNA: (.+)$/` → `mHaplo`
- Remaining lines rejoined → `cleanNotes`

### Step 4 — Update gedcom/index.ts
Export `ExportOptions` from `src/gedcom/index.ts`.

### Step 5 — IPC
**File:** `src/main/ipc.ts`

```typescript
import type { ExportOptions } from '../gedcom/exporter';

wrapHandler('gedcom:export', async (opts) => {
  const options = opts as ExportOptions | undefined;
  const result = await dialog.showSaveDialog({ ... });
  if (result.canceled || !result.filePath) return { canceled: true };
  const gedText = exportGedcom(getDatabase(), options);
  fs.writeFileSync(result.filePath, gedText, 'utf-8');
  return { exported: true, filePath: result.filePath };
});
```

**File:** `src/preload/index.ts`
```typescript
export: (opts?: unknown) => ipcRenderer.invoke('gedcom:export', opts),
```

### Step 6 — MCP
**File:** `src/mcp/createServer.ts`

Extend `export_gedcom` tool:
```typescript
profile: z.enum(['genney']).optional().describe('Export profile. "genney" writes Genney 4.1 extensions: hierarchical PLAC strings, _UID, _YHAPLOGROUP, _MHAPLOGROUP.'),
```

### Step 7 — UI
**File:** `src/renderer/views/ImportExportView.vue`

Add a fourth section below the export card:

```
┌─────────────────────────────────────┐
│ Exportera till Genney 4.1           │
│ Exporterar trädet med svenska       │
│ ortshierarkier och Genney-fält.     │
│                                     │
│ [Spara .ged-fil…]                   │
└─────────────────────────────────────┘
```

Calls `window.api.gedcom.export({ profile: 'genney' })`.

### Step 8 — Unit tests

**File:** `tests/unit/gedcom.test.ts` — extend `exportGedcom` suite:

- Place with parent chain → Genney profile produces hierarchical PLAC string
- Single-level place → same result as base exporter
- Person with `_UID` identifier → written as `1 _UID ...`
- Person with `Y-DNA: R1b\nmtDNA: H1` in notes → written as `_YHAPLOGROUP`/`_MHAPLOGROUP`, NOTE omits haplogroup lines
- Person with mixed notes → non-haplogroup note lines preserved

**File:** `tests/unit/swedishPlace.test.ts` — extend:

- `buildSwedishPlaceName` with 4-level chain → correct comma-separated string
- Single-level place → just the name
- Roundtrip: `findOrCreateSwedishPlace` → `buildSwedishPlaceName` → same as input

### Step 9 — Docs
Update `README.md`, `CLAUDE.md`, `docs/PLAN.md`, `docs/MCP.md`.

## What is NOT in scope

- Exporting `patronymic_base` — Genney has no GEDCOM tag for this. The field is internal metadata; the surname is exported as-is.
- OBJE/media export — not stored in this app.
- `_PRIM` flag — no media to reference.

## Roundtrip coverage

| Data | Import (profile:genney) | Export (profile:genney) |
|------|------------------------|------------------------|
| Place hierarchy | ✓ Split → chain | ✓ Chain → joined string |
| `_UID` | ✓ → `person_identifiers` | ✓ → `1 _UID` |
| Y-DNA haplogroup | ✓ → notes "Y-DNA: R1b" | ✓ → `1 _YHAPLOGROUP R1b` |
| mtDNA haplogroup | ✓ → notes "mtDNA: H1" | ✓ → `1 _MHAPLOGROUP H1` |
| Name types | ✓ MARRIED/AKA/ALIAS | ✓ Already in base exporter |
| REFN/RIN | ✓ Already in base importer | ✓ Already in base exporter |
