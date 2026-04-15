# Design: Gazetteer Quality Checks, Confirm Match, Media Editor

**Date:** 2026-04-15
**Status:** Approved for implementation
**Scope:** Three independent features designed for parallel implementation

---

## Feature 1: Gazetteer Match Quality Checks

### Goal

Add quality checks that evaluate how well places resolve against gazetteers, surfaced in the existing QualityView alongside other checks. Users can filter, ignore, and act on results.

### Check Codes

| Code | Severity | Trigger | Message |
|------|----------|---------|---------|
| `PLACE_MATCH_AMBIGUOUS` | warning | `matchQuality === 'ambiguous'` | "Plats har tvetydig matchning: {name} — matchade {matchedPath}" |
| `PLACE_MATCH_PARTIAL` | notice | `matchQuality === 'partial'` | "Plats delvis matchad: {name} — omatchade: {unmatched}" |
| `PLACE_MATCH_NONE` | notice | No match and no manual coordinates | "Plats utan koordinater: {name}" |
| `PLACE_MATCH_WRONG_LEVEL` | warning | Matched node depth suggests wrong geographic level (single-word input matching a leaf parish when it looks like a country/region) | "Plats matchad på fel nivå: {name} matchade {matchedPath}" |

### Wrong-Level Detection

Heuristic: if the input place name is a single component (no commas) AND the matched node is a leaf (no children) AND the node's depth > 2, flag it. This catches "Amerika" matching a village named "Amerika" instead of being left unresolved. Also flag when a well-known country/region name (from a short built-in list: Sverige, Norway, Danmark, Finland, England, Amerika, USA, Tyskland, Germany, etc.) matches a non-root node.

### Implementation

**New function:** `checkGazetteerMatchQuality(db: Database, gazetteers: Gazetteer[])` in `checks-location.ts`.

**Algorithm:**
1. Query all distinct place names from `places` table that lack manual coordinates (`latitude IS NULL`)
2. For each unique place name, call `resolvePlace(name, gazetteers)`
3. Evaluate result against check rules above
4. Find linked persons via `events` → `event_participants` JOIN (places link to events, events link to persons)
5. Return `CheckResult[]`

**Performance:**
- Resolve each unique place name once (Map cache within the check function)
- Places with manual lat/lon are skipped entirely (already confirmed or manually set)
- The check function receives pre-loaded gazetteers to avoid reloading per call

**Registration:** Add to `runAllCheckFunctions()` in `checks/index.ts`. Gazetteers loaded once at check-run start using `loadGazetteers()` + `getImportedGazetteers(db)`, passed to the check function.

**Dependencies:**
- `resolvePlace` from `src/api/place-gazetteers/resolver.ts`
- `loadGazetteers`, `getImportedGazetteers` from `src/api/place-gazetteers/index.ts`
- Must work in both IPC context (renderer calls checks) and MCP context (agent calls checks)

### i18n Keys

Add to `checks` namespace in both `sv.ts` and `en.ts`:
- `PLACE_MATCH_AMBIGUOUS`
- `PLACE_MATCH_PARTIAL`
- `PLACE_MATCH_NONE`
- `PLACE_MATCH_WRONG_LEVEL`

### QualityView Filter

No new filter chips needed — these checks use existing `warning` and `notice` severities. They'll appear under the existing "Warning" and "Notice" filters.

---

## Feature 2: Confirm/Reject Match Workflow

### Goal

Let users act on gazetteer match results: confirm good matches (write coordinates to place record), reject bad matches, or navigate to fix manually.

### Actions

#### Confirm Match
- Writes `resolvePlace()` result's `lat`/`lon` to `places.latitude`/`places.longitude` via `updatePlace()`
- Once a place has manual coordinates, the quality check skips it on next run (check only runs on `latitude IS NULL` places)
- Button label: "Bekräfta" / "Confirm"

#### Reject Match
- Stores place ID in `db_settings` key `gazetteer_rejections` (JSON array of place IDs)
- The check function reads this setting and skips rejected place IDs
- Rejected places can be un-rejected from QualityView's ignore mechanism or from PlaceDetailView
- Button label: "Avvisa" / "Reject"

#### Fix Manually
- Navigates to `/places/:id` (PlaceDetailView) where the user can set coordinates manually or review the gazetteer match
- Button label: "Visa plats" / "View place"
- Uses `router-link` in QualityView action column

### QualityView Integration

For `PLACE_MATCH_*` check results, the action column shows three buttons instead of the single "Ignore" button:
- Confirm (writes coordinates, result disappears on re-run)
- Reject (adds to rejection list, result disappears on re-run)  
- View place (navigates to PlaceDetailView)
- Ignore (existing mechanism, hides from view but doesn't affect data)

### Data Flow

```
QualityView → confirm click
  → window.api.places.update(placeId, { latitude, longitude })
  → place record updated
  → re-run checks → place now has coords → check skipped
```

```
QualityView → reject click
  → window.api.db.getSetting('gazetteer_rejections')
  → add placeId to array
  → window.api.db.setSetting('gazetteer_rejections', updated)
  → re-run checks → place in rejection list → check skipped
```

### CheckResult Extension

Gazetteer check results need to carry extra data for the confirm action (resolved lat/lon, place ID). Options:

**Chosen approach:** Add optional fields to `CheckResult`:
- `placeIds?: string[]` — place IDs involved (analogous to existing `personIds`)
- `resolvedLat?: number` — from gazetteer resolution
- `resolvedLon?: number` — from gazetteer resolution
- `matchedPath?: string` — human-readable matched path

These fields are only populated for `PLACE_MATCH_*` checks. QualityView reads them to enable the confirm button.

---

## Feature 3: Media Editor Rework

### Goal

Let users edit media metadata (title, notes) and browse media in a table view alongside the existing gallery view.

### API Layer

**New function:** `updateMedia(db, id, { title?, notes?, format?, is_printable? })` in `src/api/media.ts`

```typescript
export function updateMedia(
  db: Database,
  id: string,
  data: { title?: string; notes?: string; format?: string | null; is_printable?: boolean }
): Media | null
```

Standard UPDATE pattern matching `updatePlace`, `updateSource`, etc. Returns updated record or null if not found.

### IPC

**New handler:** `media:update` in `src/main/ipc/media.ts`
```typescript
wrapHandler('media:update', (id, data) => media.updateMedia(getDb(), id as string, data as ...));
```

### Preload

Add to `window.api.media`:
```typescript
update: (id: string, data: Record<string, unknown>) => ipcRenderer.invoke('media:update', id, data),
```

### MCP

**New tool:** `update_media` in `src/mcp/tools/media.ts`
- Input: `id` (required), `title?`, `notes?`, `format?`, `is_printable?`
- Calls `updateMedia(getDb(), id, data)`

### MediaView Changes

**Toggle:** Add a view-mode toggle (gallery / table) at the top of MediaView, persisted to localStorage key `media-view-mode`.

**Table mode columns:**

| Column | Width | Editable | Content |
|--------|-------|----------|---------|
| Thumbnail | 48px | no | Small preview image |
| Title | flex | yes (blur-to-save) | `<input>` bound to title |
| Format | 60px | no | File extension badge |
| Notes | flex | yes (blur-to-save) | `<textarea>` or `<input>` |
| Links | 80px | no | Count of linked entities |
| Status | 40px | no | Missing-file badge if applicable |

**Blur-to-save pattern:**
```typescript
async function saveField(mediaId: string, field: string, value: string) {
  await window.api.media.update(mediaId, { [field]: value });
}
```

**Gallery mode:** Unchanged from current implementation.

### Existing PersonMediaSection

No changes to PersonMediaSection — it remains a per-entity attachment manager. Users who want to edit media metadata go to MediaView.

### i18n

Add to `media` namespace:
- `tableView` / `galleryView` — toggle labels
- `editTitle` / `editNotes` — placeholder text
- `noNotes` — empty state for notes column

### Unit Tests

- `updateMedia` — update title, notes, format, is_printable; partial updates; not-found returns null
- Integration: create media → update → verify fields changed

---

## Cross-Cutting Concerns

### No Shared Dependencies

These three features are fully independent:
1. Gazetteer checks — adds to `checks-location.ts`, touches `checks/index.ts` registration
2. Confirm/reject — extends QualityView actions, uses existing `updatePlace` + `db_settings`
3. Media editor — adds `updateMedia` API, extends MediaView

They can be implemented in any order or in parallel without conflicts.

### Testing Strategy

Each feature gets unit tests in `tests/unit/`:
- Gazetteer checks: test each check code with mock places and gazetteers
- Confirm/reject: test that confirmed places are skipped, rejected places are skipped
- Media update: test CRUD completeness

### Migration

No schema migrations needed:
- Gazetteer checks use existing tables + runtime resolution
- Confirm writes to existing `places.latitude`/`places.longitude` columns
- Reject uses existing `db_settings` table
- `updateMedia` operates on existing `media` table columns
