# Place Gazetteers — Design Spec

**Date:** 2026-04-11
**Status:** Draft

## Problem

Imported place data (especially from Genney and GEDCOM files) arrives as flat text strings like "Vallsjö, Sävsjö, Jönköpings län, Sverige". These places have no coordinates and no hierarchy, so they don't appear on the map and lack geographic context.

Writing inferred data (coordinates, hierarchy) into place records would violate the application's strong sourcing principle — inferred data would be stored as fact.

## Solution

A read-only, render-time place resolution system. Gazetteers are hierarchical reference datasets that the resolver matches against to provide coordinates and context for display. Place records in the database stay untouched.

The pattern mirrors link rules: locale-keyed datasets, user-toggled per database, defaulting to off. The Swedish parishes gazetteer ships as a bundled default and serves as the example for adding more.

## Core Principles

1. **No DB mutation** — The resolver never writes to place records. All enrichment is transient.
2. **Transparent matching** — The UI always shows match quality and what matched vs. what didn't.
3. **Research driver** — Match quality signals encourage users to research and correct place data.
4. **Portable** — The gazetteer format supports any country/region. Swedish parishes are the first implementation.

## Data Model

### Gazetteer Tree

```typescript
interface GazetteerNode {
  name: string;
  type: string;           // "country", "county", "municipality", "parish", etc.
  aliases?: string[];     // spelling variants (e.g. ["Wallsjö", "Vallsjö församling"])
  lat: number;
  lon: number;
  children?: GazetteerNode[];
}

interface Gazetteer {
  id: string;             // e.g. "sv-parishes"
  name: string;           // "Swedish Parishes (Sockenindelningen)"
  locale: string;         // "sv"
  root: GazetteerNode;
}
```

### Example Data

```json
{
  "id": "sv-parishes",
  "name": "Swedish Parishes (Sockenindelningen)",
  "locale": "sv",
  "root": {
    "name": "Sverige",
    "type": "country",
    "lat": 62.0,
    "lon": 15.0,
    "children": [
      {
        "name": "Jönköpings län",
        "type": "county",
        "aliases": ["Jönköping"],
        "lat": 57.78,
        "lon": 14.16,
        "children": [
          {
            "name": "Sävsjö",
            "type": "municipality",
            "lat": 57.40,
            "lon": 14.66,
            "children": [
              {
                "name": "Vallsjö",
                "type": "parish",
                "aliases": ["Wallsjö", "Vallsjö församling"],
                "lat": 57.42,
                "lon": 14.72
              }
            ]
          }
        ]
      }
    ]
  }
}
```

### Resolver Output

```typescript
interface PlaceResolveResult {
  lat: number;
  lon: number;
  matchedPath: string[];        // ["Sverige", "Jönköpings län", "Sävsjö", "Vallsjö"]
  matchDepth: number;           // how many levels matched (4 = full leaf)
  treeDepth: number;            // total depth of this branch in the gazetteer
  matchQuality: 'exact' | 'partial' | 'ambiguous' | 'none';
  matchedNode: GazetteerNode;
  gazetteer: string;            // "sv-parishes"
  unmatchedComponents: string[];// input parts that didn't match any node
}
```

### Match Quality Definitions

| Quality | Meaning | Coordinates |
|---------|---------|-------------|
| `exact` | Every component matched a path to a leaf node | Leaf node coordinates |
| `partial` | Some components matched, but not all the way to a leaf | Deepest matched node's coordinates |
| `ambiguous` | Multiple possible matches found; returning best guess | Best match coordinates, flagged |
| `none` | No match found | No result returned (null) |

## Architecture

### File Layout

```
src/api/place-gazetteers/
├── types.ts              # GazetteerNode, Gazetteer, PlaceResolveResult
├── resolver.ts           # resolvePlace(), match logic, in-memory cache
├── index.ts              # resolveGazetteers() config resolution (like resolveRules)
└── data/
    └── sv-parishes.json  # Bundled Swedish gazetteer
```

### Resolver Function

```typescript
resolvePlace(placeName: string, gazetteers: Gazetteer[]): PlaceResolveResult | null
```

- Pure function — no DB access, no Electron dependencies
- Parses comma-separated place strings into components
- Normalizes each component (lowercase, trim, strip common suffixes like "församling", "län")
- Walks enabled gazetteer trees to find the best match
- Checks node names and aliases
- Returns the deepest match with quality metadata
- Session-only `Map<string, PlaceResolveResult>` cache (keyed on input string + enabled gazetteer IDs)

### Match Algorithm

Given input "Vallsjö, Sävsjö, Jönköpings län, Sverige":

1. Split on commas, trim, normalize: `["vallsjö", "sävsjö", "jönköpings län", "sverige"]`
2. For each enabled gazetteer, try to match from the root down:
   - "sverige" matches root node → descend
   - "jönköpings län" matches child (or alias "jönköping") → descend
   - "sävsjö" matches child → descend
   - "vallsjö" matches leaf → exact match
3. If multiple gazetteers match, prefer the one with deeper match depth
4. If ambiguous within a gazetteer (e.g. "Vallsjö" alone matches two parishes in different counties), return `ambiguous` quality

Input components can appear in any order (some sources write parish-first, some country-first). The resolver tries both directions.

## Configuration

### Per-Database Settings

```typescript
interface GazetteerConfig {
  enabledGazetteers: string[];  // e.g. ["sv-parishes"]
}
```

Stored in `db_settings` table as key `gazetteer_config` (JSON string). Same pattern as link rule config.

**Defaults:** Empty array (all gazetteers off).

**Genney import:** Automatically sets `enabledGazetteers: ["sv-parishes"]` after successful import.

### IPC / MCP

- `window.api.db.getSetting('gazetteer_config')` — read config
- `window.api.db.setSetting('gazetteer_config', json)` — write config
- No new IPC channels needed; reuses existing `db_settings` infrastructure.

## UI Integration

### Map View

- When a place has no stored coordinates, call the resolver
- Show pin at resolved coordinates
- Visual indicator of match quality:
  - Solid pin = exact match
  - Hollow/outlined pin = partial match
  - Dashed pin or different color = ambiguous match
- Tooltip shows matched path and quality

### Place Detail View

- New "Gazetteer Match" section (render-time only, clearly labeled as inferred)
- Shows: matched gazetteer name, matched path with hierarchy, match quality badge, resolved coordinates
- Shows unmatched components so the user sees what couldn't be resolved
- Non-editable — this section is informational only

### Gazetteers Settings View

- New route `/gazetteers` (or section within existing settings)
- Toggle gazetteers on/off per database (like locale toggles in LinkRulesView)
- Shows installed gazetteers with: name, locale, node count, description
- Follows the LinkRulesView pattern

## First Iteration Scope

Focus on Swedish parishes to prove the pattern:

1. Source the Swedish parish dataset (OSM extract or curated from Riksarkivet references)
2. Build `sv-parishes.json` with ~2,500 parishes organized by county and municipality
3. Implement the resolver with cache
4. Wire into the map view for coordinate resolution
5. Show match quality in place detail view
6. Add gazetteer toggle to settings
7. Auto-enable `sv-parishes` on Genney import

## Future Extensions (Out of Scope)

- Additional country gazetteers (Norway, Denmark, Finland, US, etc.)
- User-importable custom gazetteers (JSON file import)
- Historical place name support (parishes that changed names/boundaries over time with date ranges)
- Batch match quality report (how many places resolved, at what quality)
- "Confirm match" workflow — user accepts a gazetteer match and it writes coordinates to the place record
