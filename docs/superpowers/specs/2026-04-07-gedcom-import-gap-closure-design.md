# Design: GEDCOM Import Gap Closure

**Date:** 2026-04-07  
**Status:** Approved

## Problem

The GEDCOM importer (`src/import/gedcom/import-core.ts`) silently drops several data categories that the app fully supports:

| Data | Count in Linda_Ahnstedt_utf8_260403.ged | Reason dropped |
|------|----------------------------------------|----------------|
| `_GRP` top-level group records | 20 | Unrecognised top-level tag |
| `1 _GRP` person→group links | 965 | Not in `KNOWN_INDI_TAGS` |
| `_TODO` research task records | 13 | Unrecognised top-level tag |
| `REPO` repository records | 3 | No importer (reported as unmapped) |
| `SUBM` submitter | 1 | No app concept (now: default person) |

`EVEN` with `2 TYPE` sub-tag is already handled correctly (TYPE goes into `description`). A unit test will confirm.

---

## Architecture

All changes live in `src/import/gedcom/import-core.ts` (inline Genney-gated phases, consistent with existing pattern). No new files. Three additional API functions in `src/api/db_settings.ts`. Schema gets one new table.

---

## Section 1: New Import Phases

### Phase 0.7 — REPO records (all profiles)

Runs before Phase 1 (SOUR) so sources can link to repos.

```
for each top-level REPO node:
  createRepository(db, { name, address, city, postal_code, state, country, phone, email, web, notes })
  repoMap.set(node.xref, repository.id)
```

Fields mapped from GEDCOM REPO sub-tags:

| GEDCOM tag | Repository field |
|-----------|-----------------|
| `1 NAME`  | `name` |
| `1 ADDR` / `2 ADR1` | `address` |
| `2 CITY`  | `city` |
| `2 POST`  | `postal_code` |
| `2 STAE`  | `state` |
| `2 CTRY`  | `country` |
| `1 PHON`  | `phone` |
| `1 EMAIL` | `email` |
| `1 WWW`   | `web` |
| `1 NOTE`  | `notes` |

**Phase 1 update (SOUR):** When `2 REPO @Rxxx@` is an xref (starts with `@`), look up `repoMap` and call `linkSourceRepository(db, src.id, repoId)` after creating the source. The existing `repository: ''` fallback for xref-based REPO remains (the `repository` text field is left empty; the relationship lives in `source_repositories`).

**ValidationReport update:** REPO no longer appears in `unmappedData`. Add `repositories: number` field to the report.

### Phase 0.8 — `_GRP` records (Genney-gated)

Runs before Phase 2 (INDI) so memberships can be linked.

```
if isGenney:
  for each top-level _GRP node:
    createGroup(db, { name: getChild('NAME').value, notes: resolveNote(...) })
    grpMap.set(node.xref, group.id)
```

**Phase 2 update:** For each `1 _GRP @Gxx@` on an INDI node:
```
if isGenney:
  const groupId = grpMap.get(grpNode.value)
  if groupId: addGroupMember(db, groupId, person.id)
```

Add `'_GRP'` to `KNOWN_INDI_TAGS` so it no longer appears in skipped tag stats.

**ValidationReport update:** Add `groups: number` field.

### Phase 6 — `_TODO` records (Genney-gated)

Runs after Phase 5 (`_PLAC`) so `personMap` is fully populated.

```
if isGenney:
  for each top-level _TODO node:
    const targXref = getChild('_TARG').value   // e.g. "@I86@"
    const person_id = personMap.get(targXref) ?? null
    const statVal = getChild('_STAT').value ?? '0'
    const status = statVal === '1' ? 'done' : 'open'
    const priority = parseInt(getChild('_PRIO').value ?? '1', 10)
    const task = getChild('_TASK').value ?? ''
    const notes = resolveNote(node, noteMap)
    createResearchTask(db, { task, notes, person_id, priority, status })
```

**ValidationReport update:** Add `researchTasks: number` field.

---

## Section 2: Submitter → Default Person

### Schema change

New table added to `src/api/schema.ts`:

```sql
CREATE TABLE IF NOT EXISTS db_settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
```

### New API: `src/api/db_settings.ts`

```typescript
getDbSetting(db, key: string): string | null
setDbSetting(db, key: string, value: string): void
deleteDbSetting(db, key: string): void
```

### Import: SUBM → default_person_id

During import, after Phase 2 (personMap is populated):

```
for each top-level SUBM node:
  const rawName = getChild('NAME').value   // e.g. "Linda Ahnstedt"
  // Split on last space as naive given/surname split
  match rawName against person_names in the newly-created persons
  if unique case-insensitive match found:
    setDbSetting(db, 'default_person_id', matchedPersonId)
```

Match strategy: query person_names for the just-imported persons (all are in `personMap`) using a case-insensitive `given_name || ' ' || surname` concatenation. If exactly one match, store it. If zero or multiple matches, skip (no default set).

### IPC + Renderer

- Add IPC handler `db:getSetting` → calls `getDbSetting(db, key)`.
- Expose as `window.api.db.getSetting(key)` via preload.
- In `App.vue`, after the initial database connection is confirmed (or on `database-switched` event): call `window.api.db.getSetting('default_person_id')`. If non-null and current route is `/`, navigate to `/persons/:id`.
- Navigates only when the route is `/` (the list view), so it doesn't interrupt a user already browsing.

---

## Section 3: EVEN TYPE — Verification Only

Lines 303–307 of `import-core.ts` already capture `2 TYPE` into `description`:

```typescript
const typeValue = getChild(evNode, 'TYPE')?.value ?? '';
const noteRaw = resolveNote(evNode, noteMap);
const noteValue = typeValue && noteRaw
  ? `${typeValue}: ${noteRaw}`
  : typeValue || noteRaw;
```

**No code change.** Add one unit test: create an INDI with `1 EVEN / 2 TYPE Efternamnsbyte / 2 DATE 1986`, import, assert `event.description === 'Efternamnsbyte'`.

---

## Report Changes

`ValidationReport` (returned by `importGedcom`) gains three fields:

```typescript
repositories: number;   // REPO records imported
groups: number;         // _GRP records imported (Genney only)
researchTasks: number;  // _TODO records imported (Genney only)
```

The import summary UI (`GenneyImportSection.vue`, `ImportExportView.vue`) should display these counts alongside the existing persons/families/sources/events counts.

---

## Testing

- **Unit tests** (`tests/unit/import-gedcom.test.ts` or new file):
  - REPO imported + linked to source
  - `_GRP` creates groups + memberships (Genney profile)
  - `_TODO` creates research tasks with correct status/person link (Genney profile)
  - SUBM sets `default_person_id` in `db_settings` when name matches
  - EVEN TYPE preserved in description

- **Existing tests must continue to pass** (no regressions).

---

## Files Changed

| File | Change |
|------|--------|
| `src/api/schema.ts` | Add `db_settings` table |
| `src/api/db_settings.ts` | New file: `getDbSetting`, `setDbSetting`, `deleteDbSetting` |
| `src/import/gedcom/import-core.ts` | Phases 0.7, 0.8, 6; Phase 1 REPO link; Phase 2 `_GRP` member; `KNOWN_INDI_TAGS` update; SUBM parsing; `ValidationReport` fields |
| `src/main/ipc.ts` | Add `db:getSetting` handler |
| `src/preload/index.ts` | Expose `window.api.db.getSetting` |
| `src/renderer/App.vue` | Navigate to default person on startup |
| `src/renderer/components/import/GenneyImportSection.vue` | Show groups + researchTasks counts |
| `src/renderer/views/ImportExportView.vue` | Show repositories count |
| `tests/unit/` | New/updated import tests + EVEN TYPE test |
