# Gazetteer Import/Export System

**Date:** 2026-04-13
**Status:** Draft

## Problem

The gazetteer system is read-only and bundled — 5 Swedish gazetteers compiled into the app at build time. Users and agents cannot add gazetteers for other regions. There are no MCP tools for agents to interact with the gazetteer layer.

## Goals

1. Let humans import/export gazetteers as JSON files via the UI
2. Let agents import/export gazetteers via MCP tools, with enough introspection to understand the target format end-to-end
3. Store imported gazetteers per-database (fully self-contained databases)
4. Keep bundled gazetteers unchanged — they remain static imports

## Non-Goals

- In-place update of gazetteers (use delete + re-import instead)
- Shared gazetteer storage across databases
- Building data pipelines for specific sources (agents/humans produce conforming JSON)
- Modifying the resolver algorithm

## Design

### Storage: `gazetteers` Table

New table added to `src/api/schema.ts`:

```sql
CREATE TABLE IF NOT EXISTS gazetteers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  locale TEXT NOT NULL,
  description TEXT,
  source_json TEXT,
  data BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | Matches the gazetteer's `id` field (e.g. `"us-counties"`) |
| `name` | TEXT | Display name |
| `locale` | TEXT | Locale code (e.g. `"en"`, `"sv"`) |
| `description` | TEXT | Human-readable description |
| `source_json` | TEXT | JSON-serialized `GazetteerSource` metadata |
| `data` | BLOB | Full Gazetteer JSON (the complete tree) |
| `created_at` | TEXT | ISO timestamp |

Metadata columns (`name`, `locale`, `description`, `source_json`) are denormalized from the JSON blob for listing without deserializing the full tree.

### API Layer: `src/api/gazetteers.ts`

```typescript
importGazetteer(db, jsonString: string)
  → { id: string, name: string, locale: string, nodeCount: number }
```
- Parses JSON, validates against schema (see Validation section)
- Rejects if `id` collides with a bundled gazetteer ID
- If `id` already exists in DB table, overwrites (upsert) — this is the implicit update path
- Stores metadata columns + full JSON as blob
- Returns summary with recursive node count

```typescript
exportGazetteer(db, id: string) → string | null
```
- For imported gazetteers: reads blob from DB, returns as JSON string
- For bundled gazetteers: serializes the bundled in-memory gazetteer to JSON string
- Returns `null` if ID not found in either source

```typescript
deleteGazetteer(db, id: string) → boolean
```
- Deletes from DB table only (bundled gazetteers cannot be deleted)
- Also removes the ID from `gazetteer_config.enabledGazetteers` if present
- Returns `false` if ID not found or is bundled

```typescript
listGazetteers(db) → GazetteerInfo[]
```
- Merges bundled gazetteers + imported gazetteers from DB
- Returns metadata only (no tree data):
  ```typescript
  interface GazetteerInfo {
    id: string;
    name: string;
    locale: string;
    description?: string;
    source?: GazetteerSource;
    bundled: boolean;
  }
  ```

```typescript
getGazetteerSchema() → object
```
- Returns a JSON Schema describing the `Gazetteer` and `GazetteerNode` types
- Static — no DB parameter needed
- This is the agent's "spec sheet" for understanding what to produce

### Validation

On `importGazetteer`, validate:

1. **Top-level required fields:** `id` (non-empty string), `name`, `locale`, `root`
2. **Root node:** must have `name`, `type`, `lat`, `lon` (all required)
3. **Recursive node validation:** every `GazetteerNode` in the tree must have `name` (string), `type` (string), `lat` (number), `lon` (number). `aliases` (string[]) and `children` (GazetteerNode[]) are optional.
4. **ID collision:** reject if `id` matches a bundled gazetteer ID (e.g. `"sv-socknar"`)
5. **Size limit:** reject if uncompressed JSON exceeds 50 MB
6. **Optional fields:** `description` (string), `source` (object with `name`, `url`, `license`, `fetched` — all optional)

Validation errors return a descriptive message (not a generic "invalid" — tell the agent/user what's wrong and where).

### Resolver Changes

`loadGazetteers` currently takes only a `GazetteerConfig` and returns bundled gazetteers filtered by `enabledGazetteers`. It needs to also load imported gazetteers from the database.

**New signature:**
```typescript
loadGazetteers(config: GazetteerConfig, importedGazetteers: Gazetteer[])
  → Gazetteer[]
```

Merges bundled + imported, filters by `config.enabledGazetteers`.

The caller is responsible for fetching imported gazetteers from the DB. In the renderer, `usePlaceResolver` loads them via IPC on init. In MCP/API context, the caller passes them directly.

**New API function:**
```typescript
getImportedGazetteers(db) → Gazetteer[]
```
Reads all rows from `gazetteers` table, deserializes `data` blob to `Gazetteer` objects. Used by resolver loading and by `loadGazetteers` callers.

### IPC Channels

| Channel | Handler | Renderer API |
|---------|---------|-------------|
| `gazetteers:import` | `importGazetteer(db, json)` | `window.api.gazetteers.import(json)` |
| `gazetteers:export` | `exportGazetteer(db, id)` | `window.api.gazetteers.export(id)` |
| `gazetteers:delete` | `deleteGazetteer(db, id)` | `window.api.gazetteers.delete(id)` |
| `gazetteers:list` | `listGazetteers(db)` | `window.api.gazetteers.list()` |
| `gazetteers:getImported` | `getImportedGazetteers(db)` | `window.api.gazetteers.getImported()` |
| `gazetteers:getSchema` | `getGazetteerSchema()` | `window.api.gazetteers.getSchema()` |

### MCP Tools

| Tool | Input | Output | Purpose |
|------|-------|--------|---------|
| `get_gazetteer_schema` | — | JSON Schema object | Agent's spec sheet for the Gazetteer format |
| `list_gazetteers` | — | `GazetteerInfo[]` | List all gazetteers (bundled + imported) with metadata |
| `import_gazetteer` | `{ json: string }` | `{ id, name, locale, nodeCount }` | Validate and store a gazetteer JSON blob |
| `export_gazetteer` | `{ id: string }` | JSON string | Extract a gazetteer as JSON (bundled or imported) |
| `delete_gazetteer` | `{ id: string }` | `{ success: boolean }` | Remove an imported gazetteer |
| `resolve_place` | `{ name: string }` | `PlaceResolveResult \| null` | Resolve a place string against enabled gazetteers |
| `search_gazetteer` | `{ query: string, limit?: number }` | `GazetteerSearchHit[]` | Search enabled gazetteers for matching nodes |

**Agent workflow example:**
1. `get_gazetteer_schema` — understand the target format
2. `export_gazetteer({ id: "sv-socknar" })` — get a concrete example
3. (Agent produces a new gazetteer JSON from its data source)
4. `import_gazetteer({ json: "..." })` — import the new gazetteer
5. `resolve_place({ name: "some test place" })` — verify it works

### UI Changes: GazetteersView

**Header section:**
- Add **Import** button next to the title
- Opens native file picker for `.json` and `.json.gz` files
- On select: reads file, decompresses if gzipped, calls `window.api.gazetteers.import(json)`
- Shows success toast with `{ name, nodeCount }` or validation error message

**Gazetteer list:**
- Currently shows bundled gazetteers only
- Now merges bundled + imported (via `window.api.gazetteers.list()`)
- Each row shows: checkbox (enable/disable), name, description, locale, source info
- Imported gazetteers get an "Imported" badge (like the "Bundled" distinction)
- **Export button** on every row (bundled and imported)
  - Triggers native save dialog, writes JSON file
- **Delete button** on imported rows only
  - Shows `ConfirmModal` before deleting
  - Calls `window.api.gazetteers.delete(id)`
  - Refreshes list and invalidates resolver cache

**Test lookup section:** No changes — already works against all enabled gazetteers. It will naturally include imported ones once the resolver merges them.

### `usePlaceResolver` Composable Changes

Currently loads only bundled gazetteers. Needs to also fetch imported gazetteers via IPC:

```typescript
async function ensureLoaded() {
  const config = await window.api.db.getSetting('gazetteer_config');
  const imported = await window.api.gazetteers.getImported();
  gazetteers = loadGazetteers(parsedConfig, imported);
}
```

The `invalidate()` function already clears the cache — no change needed there, just call it after import/delete.

## Data Flow

```
Human:  File picker → read file → gazetteers:import → validate → store blob in DB
Agent:  get_gazetteer_schema + export_gazetteer (example) → produce JSON → import_gazetteer → verify with resolve_place

Both:   gazetteer_config (db_settings) controls which are enabled
        Resolver merges bundled + imported, filters by config
        MapView / PlacePicker / PersonMap use resolver as before
```

## Existing Gazetteer Format Reference

The `Gazetteer` type (from `src/api/place-gazetteers/types.ts`):

```typescript
interface GazetteerNode {
  name: string;        // Display name
  type: string;        // "country", "county", "municipality", "parish", etc.
  aliases?: string[];  // Spelling variants, historical names
  lat: number;         // Latitude (WGS 84)
  lon: number;         // Longitude (WGS 84)
  children?: GazetteerNode[];
}

interface GazetteerSource {
  name: string;        // e.g. "Wikidata"
  url: string;
  license: string;     // e.g. "CC0 1.0"
  created?: string;    // ISO date
  fetched: string;     // ISO date
  kgmid?: string;      // Google Knowledge Graph ID
}

interface Gazetteer {
  id: string;          // Unique identifier (e.g. "us-counties")
  name: string;        // Display name
  locale: string;      // Locale code (e.g. "en")
  description?: string;
  source?: GazetteerSource;
  root: GazetteerNode; // Hierarchical tree of places
}
```
