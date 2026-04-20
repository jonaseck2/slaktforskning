# Language Gazetteers — Design Spec

**Date:** 2026-04-18
**Status:** Approved
**Scope:** Swedish language gazetteer (lang-sv); extensible to other languages

## Problem

Users enter place names in their own language — "Danmark", "Brasilien", "Tyskland" — but the gazetteers store canonical English names. These entries get partial or no matches. The same country appears in multiple gazetteers (Denmark in dk-sogne, world-countries, world-admin1, etc.), so adding translations per-gazetteer would duplicate data.

## Solution

A new gazetteer kind — `language` — that contains only name translations. Language gazetteers are merged into point/boundary gazetteers at load time, injecting translated names as aliases. The resolver algorithm doesn't change.

## File Format

```json
{
  "id": "lang-sv-geonames",
  "name": "Swedish place names (GeoNames)",
  "locale": "sv",
  "kind": "language",
  "description": "Swedish translations for countries and admin1 divisions",
  "source": {
    "name": "GeoNames",
    "url": "https://www.geonames.org/",
    "license": "CC BY 4.0",
    "fetched": "2026-04-18"
  },
  "translations": {
    "world-countries": {
      "Denmark": ["Danmark"],
      "Germany": ["Tyskland"],
      "Brazil": ["Brasilien"],
      "United States": ["Förenta staterna", "Amerikas förenta stater"]
    },
    "world-admin1": {
      "Germany > Bavaria": ["Bayern"],
      "Germany > North Rhine-Westphalia": ["Nordrhein-Westfalen"]
    }
  }
}
```

### Rules

- **Only differing names** — if the Swedish name is identical to the canonical name (e.g., "Stockholm"), omit it.
- **Values are arrays** — a language can have multiple names for one place (e.g., "Förenta staterna" and "Amerikas förenta stater" for United States).
- **Path keys use ` > ` separator** for disambiguation — matching the `matchedPath.join(' > ')` pattern already used in the UI. Top-level entries (countries) use bare names; deeper entries use ancestor paths.
- **No `root` field** — language gazetteers have no tree structure.
- **No coordinates or geometry** — purely name data.

## Type Changes

### `Gazetteer` (types.ts)

Add `kind: 'language'` to the existing `'point' | 'boundary'` union. Add optional `translations` field:

```typescript
export interface Gazetteer {
  id: string;
  name: string;
  locale: string;
  description?: string;
  source?: GazetteerSource;
  root: GazetteerNode;
  kind?: 'point' | 'boundary' | 'language';
  translations?: Record<string, Record<string, string[]>>;
}
```

Language gazetteers still have a `root` field for JSON schema compatibility, but it's a minimal placeholder node (name: locale, type: "language", lat: 0, lon: 0, no children).

## Merge Mechanism

In `loadGazetteers()` (index.ts), after filtering enabled gazetteers:

1. **Separate** language gazetteers from point/boundary ones.
2. **For each language gazetteer**, iterate its `translations` entries.
3. **For each target gazetteer ID**, check if that gazetteer is in the enabled set.
4. **Walk the target tree** to find the node matching the path key:
   - Bare key (e.g., `"Denmark"`) → match at any depth by name.
   - Path key (e.g., `"Germany > Bavaria"`) → split on ` > `, walk ancestors to find the exact node.
5. **Inject** translated names into the node's `aliases` array, deduplicating against existing aliases.
6. **Invalidate** the `nameIndexCache` for affected roots (delete the WeakMap entry so the index is rebuilt on next resolve).
7. **Return** only point/boundary gazetteers — language gazetteers are consumed during merge and not passed to the resolver.

### Path Resolution Algorithm

```
function findNodeByPath(root, pathKey):
  parts = pathKey.split(' > ')
  if parts.length == 1:
    // Bare key — find first node with matching name at any depth
    return walkTree(root, parts[0])
  else:
    // Path key — walk down matching each ancestor
    current = root
    for each part in parts:
      current = current.children.find(c => c.name == part)
      if not found: return null
    return current
```

### Performance

Merge is O(T × N) where T = number of translations and N = average tree depth for path lookups. For Swedish with ~300 country + admin1 translations, this is negligible at load time. The name index is rebuilt lazily on first resolve after invalidation.

## Build Scripts

Two separate scripts, two separate output files — one per data source. No merge step.

### `scripts/build-lang-sv-geonames.ts`

- **Source:** GeoNames `alternateNamesV2.zip` — filter `isolanguage == 'sv'`
- **Scope:** Countries (match against `world-countries` gazetteer node names) + admin1 divisions (match against `world-admin1`)
- **Output:** `src/api/place-gazetteers/data/lang-sv-geonames.json` — Swedish names for ~200 countries and ~500 admin1 divisions where names differ from English
- **License:** CC BY 4.0

### `scripts/build-lang-sv-wikidata.ts`

- **Source:** Wikidata SPARQL — query `rdfs:label` with `FILTER(LANG(?label) = "sv")` for Danish, Norwegian, Finnish, Icelandic places
- **Scope:** Municipalities, counties, parishes in dk-sogne, no-kommuner, fi-kunnat, is-sveitarfelog gazetteers (Swedish parishes already use Swedish names natively)
- **Output:** `src/api/place-gazetteers/data/lang-sv-wikidata.json` — Swedish names for Nordic administrative divisions where names differ
- **License:** CC0 1.0

### Only-if-different Filter

Both build scripts compare fetched Swedish names against the canonical gazetteer names and only include entries where they differ. This keeps the files lean.

## UI (GazetteersView)

Language gazetteers appear in the existing card list with a new kind badge value:

- Point → existing blue badge
- Boundary → existing green badge  
- Language → new badge (e.g., purple/indigo)

The `kind-badge` CSS already uses `kind-${gaz.kind}`, so adding `.kind-language` styling is all that's needed.

Toggle behavior is identical to other gazetteers. When a language gazetteer is toggled:
1. Config is saved via `setDbSetting('gazetteer_config', ...)`
2. `usePlaceResolver().invalidate()` is called
3. On next resolve, `loadGazetteers()` re-merges with/without the language translations

## i18n

New keys in `gazetteers` namespace:
- `gazetteers.kindLanguage` → "Language" / "Språk"

## Config

No changes to `GazetteerConfig`. `lang-sv-geonames` and `lang-sv-wikidata` are IDs in `enabledGazetteers[]` like any other gazetteer. New databases default to all bundled gazetteers enabled (existing behavior in `usePlaceResolver.ensureLoaded()`).

## Testing

### Unit Tests

- **Merge tests:** Verify that enabling a language gazetteer injects aliases into target gazetteers and that the name index picks them up.
- **Resolve tests:** Verify "Danmark" resolves to Denmark's coordinates when `lang-sv` is enabled, and doesn't when disabled.
- **Dedup tests:** Verify aliases aren't duplicated if the same translation already exists.
- **Missing target:** Verify graceful handling when a language gazetteer references a gazetteer ID that isn't enabled.
- **Path resolution:** Verify both bare keys and ancestor-path keys find the correct node.

### Manual Testing

- Enable `lang-sv-geonames` in GazetteersView
- Type "Brasilien" in the test lookup → should get exact match for Brazil
- Type "Sao Paulo, Brasilien" → should get exact match for São Paulo state
- Disable `lang-sv-geonames` → "Brasilien" should no longer match
- Enable `lang-sv-wikidata` → verify Nordic place translations work

## Future Extensions

- **More languages:** Add `lang-da-geonames.json`, `lang-no-geonames.json`, etc. with the same format and separate build scripts per source.
- **User-contributed:** Language gazetteers can be imported/exported like any other gazetteer — users can create and share their own translation files.
- **Boundary gazetteers:** The merge targets both point and boundary gazetteers, so boundary resolution also benefits from language translations.
