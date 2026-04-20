# Language Gazetteers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new "language" gazetteer kind that injects multilingual place name translations as aliases into point/boundary gazetteers at load time, starting with Swedish.

**Architecture:** Language gazetteers are JSON files with `kind: "language"` and a `translations` map keyed by target gazetteer ID. At load time, `loadGazetteers()` merges translations into target gazetteer nodes as aliases before returning. The resolver algorithm is unchanged.

**Tech Stack:** TypeScript, GeoNames data, Wikidata SPARQL, Vitest

**Spec:** `docs/plans/2026-04-18-language-gazetteers-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/api/place-gazetteers/types.ts` | Modify | Add `"language"` to `kind` union, add `translations` field |
| `src/api/place-gazetteers/index.ts` | Modify | Merge logic in `loadGazetteers()`, register bundled language gazetteers |
| `src/api/place-gazetteers/data/lang-sv-geonames.json` | Create | Swedish translations from GeoNames |
| `src/api/place-gazetteers/data/lang-sv-wikidata.json` | Create | Swedish translations from Wikidata |
| `scripts/build-lang-sv-geonames.ts` | Create | Build script for GeoNames Swedish translations |
| `scripts/build-lang-sv-wikidata.ts` | Create | Build script for Wikidata Swedish translations |
| `src/renderer/views/GazetteersView.vue` | Modify | Language kind badge + label |
| `src/renderer/i18n/en.ts` | Modify | Add `kindLanguage` key |
| `src/renderer/i18n/sv.ts` | Modify | Add `kindLanguage` key |
| `tests/unit/place-gazetteers.test.ts` | Modify | Tests for merge + resolve with language gazetteers |

---

### Task 1: Types — add language kind and translations field

**Files:**
- Modify: `src/api/place-gazetteers/types.ts:32-41`

- [ ] **Step 1: Add `language` to the `kind` union and `translations` field**

In `src/api/place-gazetteers/types.ts`, update the `Gazetteer` interface:

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

The `translations` field maps target gazetteer ID → place path key → array of translated names.

- [ ] **Step 2: Commit**

```bash
git add src/api/place-gazetteers/types.ts
git commit -m "feat: add language kind and translations field to Gazetteer type"
```

---

### Task 2: Merge logic — inject translations as aliases in loadGazetteers

**Files:**
- Modify: `src/api/place-gazetteers/index.ts`
- Test: `tests/unit/place-gazetteers.test.ts`

- [ ] **Step 1: Write failing tests for the merge logic**

Add these tests to `tests/unit/place-gazetteers.test.ts`:

```typescript
import { resolvePlace } from '../../src/api/place-gazetteers/resolver';
import { loadGazetteers } from '../../src/api/place-gazetteers/index';
import type { Gazetteer, GazetteerConfig } from '../../src/api/place-gazetteers/types';

// Minimal world gazetteer for testing language merge
const worldGazetteer: Gazetteer = {
  id: 'world-countries',
  name: 'World Countries',
  locale: 'en',
  root: {
    name: 'World',
    type: 'root',
    lat: 0,
    lon: 0,
    children: [
      { name: 'Denmark', type: 'country', aliases: ['DK', 'DNK'], lat: 56.0, lon: 10.0 },
      { name: 'Germany', type: 'country', aliases: ['DE', 'DEU'], lat: 51.0, lon: 9.0,
        children: [
          { name: 'Bavaria', type: 'admin1', lat: 48.8, lon: 11.5 },
        ],
      },
      { name: 'Brazil', type: 'country', aliases: ['BR', 'BRA'], lat: -10.0, lon: -55.0 },
    ],
  },
};

const langSvGeonames: Gazetteer = {
  id: 'lang-sv-geonames',
  name: 'Swedish place names (GeoNames)',
  locale: 'sv',
  kind: 'language',
  root: { name: 'sv', type: 'language', lat: 0, lon: 0 },
  translations: {
    'world-countries': {
      'Denmark': ['Danmark'],
      'Germany': ['Tyskland'],
      'Brazil': ['Brasilien'],
      'Germany > Bavaria': ['Bayern'],
    },
  },
};

describe('language gazetteer merge', () => {
  it('injects translations as aliases so resolver matches Swedish names', () => {
    const config: GazetteerConfig = { enabledGazetteers: ['world-countries', 'lang-sv-geonames'] };
    const gazetteers = loadGazetteers(config, [worldGazetteer, langSvGeonames]);

    // Only point/boundary gazetteers returned, not language ones
    expect(gazetteers).toHaveLength(1);
    expect(gazetteers[0].id).toBe('world-countries');

    // "Danmark" should now resolve to Denmark
    const result = resolvePlace('Danmark', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.lat).toBe(56.0);
    expect(result!.lon).toBe(10.0);
    expect(result!.matchedPath).toContain('Denmark');
  });

  it('resolves path-keyed translations (Germany > Bavaria -> Bayern)', () => {
    const config: GazetteerConfig = { enabledGazetteers: ['world-countries', 'lang-sv-geonames'] };
    const gazetteers = loadGazetteers(config, [worldGazetteer, langSvGeonames]);

    const result = resolvePlace('Bayern, Tyskland', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.lat).toBe(48.8);
    expect(result!.matchQuality).toBe('exact');
  });

  it('does not duplicate aliases that already exist', () => {
    const langWithExisting: Gazetteer = {
      ...langSvGeonames,
      translations: {
        'world-countries': {
          'Denmark': ['DK'],  // DK already exists as alias
        },
      },
    };
    const config: GazetteerConfig = { enabledGazetteers: ['world-countries', 'lang-sv-geonames'] };
    const gazetteers = loadGazetteers(config, [worldGazetteer, langWithExisting]);
    const dk = gazetteers[0].root.children!.find(c => c.name === 'Denmark')!;
    // Should not have duplicate 'DK'
    expect(dk.aliases!.filter(a => a === 'DK')).toHaveLength(1);
  });

  it('skips translations targeting a gazetteer that is not enabled', () => {
    const config: GazetteerConfig = { enabledGazetteers: ['lang-sv-geonames'] };
    // Only language gaz enabled, no target — should return empty
    const gazetteers = loadGazetteers(config, [worldGazetteer, langSvGeonames]);
    expect(gazetteers).toHaveLength(0);
  });

  it('without language gazetteer, Swedish names do not resolve', () => {
    const config: GazetteerConfig = { enabledGazetteers: ['world-countries'] };
    const gazetteers = loadGazetteers(config, [worldGazetteer]);
    const result = resolvePlace('Danmark', gazetteers);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --grep "language gazetteer merge"`
Expected: FAIL — loadGazetteers doesn't filter or merge language gazetteers yet.

- [ ] **Step 3: Implement the merge logic in loadGazetteers**

In `src/api/place-gazetteers/index.ts`, add a `mergeTranslations` function and update `loadGazetteers`:

```typescript
/**
 * Find a node in the tree by path key.
 * Bare key ("Denmark") — match first node by name at any depth.
 * Path key ("Germany > Bavaria") — walk down matching each ancestor from root's children.
 */
function findNodeByPath(root: GazetteerNode, pathKey: string): GazetteerNode | null {
  const parts = pathKey.split(' > ');
  if (parts.length === 1) {
    // Bare key — depth-first search for first match
    function walk(node: GazetteerNode): GazetteerNode | null {
      if (node.name === parts[0]) return node;
      if (node.children) {
        for (const child of node.children) {
          const found = walk(child);
          if (found) return found;
        }
      }
      return null;
    }
    // Search children of root (root itself is typically "World" or a country)
    if (root.name === parts[0]) return root;
    if (root.children) {
      for (const child of root.children) {
        const found = walk(child);
        if (found) return found;
      }
    }
    return null;
  }
  // Path key — walk down from root's children
  let current: GazetteerNode | null = root;
  for (const part of parts) {
    if (!current.children) return null;
    const child = current.children.find(c => c.name === part);
    if (!child) {
      // Also check if root itself matches first part
      if (current === root && current.name === part) continue;
      return null;
    }
    current = child;
  }
  return current;
}

/**
 * Merge language gazetteer translations into target gazetteers as aliases.
 * Mutates target gazetteer nodes in place.
 */
function mergeTranslations(
  langGaz: Gazetteer,
  targets: Gazetteer[],
): void {
  if (!langGaz.translations) return;
  const targetMap = new Map(targets.map(g => [g.id, g]));

  for (const [targetId, translations] of Object.entries(langGaz.translations)) {
    const target = targetMap.get(targetId);
    if (!target) continue;

    for (const [pathKey, names] of Object.entries(translations)) {
      const node = findNodeByPath(target.root, pathKey);
      if (!node) continue;

      const existing = new Set(node.aliases ?? []);
      const merged = [...(node.aliases ?? [])];
      for (const name of names) {
        if (!existing.has(name)) {
          merged.push(name);
          existing.add(name);
        }
      }
      (node as GazetteerNode).aliases = merged;
    }
  }
}
```

Update `loadGazetteers`:

```typescript
export function loadGazetteers(config: GazetteerConfig, imported: Gazetteer[] = []): Gazetteer[] {
  const enabled = new Set(config.enabledGazetteers);
  const all = [...BUNDLED_GAZETTEERS, ...imported];
  const filtered = all.filter(g => enabled.has(g.id));

  // Separate language gazetteers from point/boundary
  const langGazetteers = filtered.filter(g => g.kind === 'language');
  const dataGazetteers = filtered.filter(g => g.kind !== 'language');

  // Merge translations into data gazetteers
  for (const lang of langGazetteers) {
    mergeTranslations(lang, dataGazetteers);
  }

  return dataGazetteers;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --grep "language gazetteer merge"`
Expected: All 5 tests PASS.

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All existing tests still pass (merge only affects gazetteers that have translations).

- [ ] **Step 6: Commit**

```bash
git add src/api/place-gazetteers/index.ts tests/unit/place-gazetteers.test.ts
git commit -m "feat: merge language gazetteer translations into target gazetteers"
```

---

### Task 3: Build script — Swedish translations from GeoNames

**Files:**
- Create: `scripts/build-lang-sv-geonames.ts`
- Create: `src/api/place-gazetteers/data/lang-sv-geonames.json`

- [ ] **Step 1: Write the build script**

Create `scripts/build-lang-sv-geonames.ts`:

```typescript
/**
 * Build Swedish language gazetteer from GeoNames alternate names.
 *
 * Produces: src/api/place-gazetteers/data/lang-sv-geonames.json
 *
 * Source: GeoNames (https://www.geonames.org/) — CC BY 4.0
 *
 * Usage: npx tsx scripts/build-lang-sv-geonames.ts
 *
 * Prerequisites:
 *   curl -o /tmp/alternateNamesV2.zip https://download.geonames.org/export/dump/alternateNamesV2.zip
 *   unzip -o /tmp/alternateNamesV2.zip -d /tmp/geonames_altnames/
 *   curl -o /tmp/countryInfo.txt https://download.geonames.org/export/dump/countryInfo.txt
 *   curl -o /tmp/admin1CodesASCII.txt https://download.geonames.org/export/dump/admin1CodesASCII.txt
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, '..', 'src', 'api', 'place-gazetteers', 'data');
const ALT_NAMES_FILE = '/tmp/geonames_altnames/alternateNamesV2.txt';
const COUNTRY_INFO_FILE = '/tmp/countryInfo.txt';
const ADMIN1_FILE = '/tmp/admin1CodesASCII.txt';

// Load existing gazetteers to get canonical names
const worldCountries = JSON.parse(
  fs.readFileSync(path.join(DATA_DIR, 'world-countries.json'), 'utf-8')
);
const worldAdmin1 = JSON.parse(
  fs.readFileSync(path.join(DATA_DIR, 'world-admin1.json'), 'utf-8')
);

interface GazetteerNode {
  name: string;
  type: string;
  aliases?: string[];
  lat: number;
  lon: number;
  children?: GazetteerNode[];
}

// ── Parse GeoNames reference data ──────────────────────────────────

function parseCountryInfo(): Map<string, { iso2: string; name: string; geonameId: string }> {
  const content = fs.readFileSync(COUNTRY_INFO_FILE, 'utf-8');
  const countries = new Map<string, { iso2: string; name: string; geonameId: string }>();
  for (const line of content.split('
')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const cols = line.split('	');
    const iso2 = cols[0];
    const name = cols[4];
    const geonameId = cols[16]; // geonameid column
    if (iso2 && name && geonameId) {
      countries.set(geonameId, { iso2, name, geonameId });
    }
  }
  return countries;
}

function parseAdmin1Codes(): Map<string, { code: string; name: string; geonameId: string }> {
  const content = fs.readFileSync(ADMIN1_FILE, 'utf-8');
  const admin1s = new Map<string, { code: string; name: string; geonameId: string }>();
  for (const line of content.split('
')) {
    if (!line.trim()) continue;
    const cols = line.split('	');
    // Columns: 0=code (CC.admin1), 1=name, 2=nameAscii, 3=geonameId
    const code = cols[0];
    const name = cols[1];
    const geonameId = cols[3];
    if (code && name && geonameId) {
      admin1s.set(geonameId, { code, name, geonameId });
    }
  }
  return admin1s;
}

// ── Parse alternate names ──────────────────────────────────────────

interface AltName {
  geonameId: string;
  svName: string;
}

function parseSwedishAltNames(
  countryGeonameIds: Set<string>,
  admin1GeonameIds: Set<string>,
): Map<string, string[]> {
  const content = fs.readFileSync(ALT_NAMES_FILE, 'utf-8');
  const svNames = new Map<string, string[]>();

  for (const line of content.split('
')) {
    if (!line.trim()) continue;
    const cols = line.split('	');
    // alternateNamesV2 columns: 0=alternateNameId, 1=geonameid, 2=isolanguage,
    // 3=alternate name, 4=isPreferredName, 5=isShortName, 6=isColloquial, 7=isHistoric
    const geonameId = cols[1];
    const lang = cols[2];
    const altName = cols[3];

    if (lang !== 'sv' || !altName) continue;
    if (!countryGeonameIds.has(geonameId) && !admin1GeonameIds.has(geonameId)) continue;

    if (!svNames.has(geonameId)) svNames.set(geonameId, []);
    const existing = svNames.get(geonameId)!;
    if (!existing.includes(altName)) {
      existing.push(altName);
    }
  }

  return svNames;
}

// ── Find canonical name in gazetteer tree ──────────────────────────

function findCountryName(countryEnglishName: string): string | null {
  const node = worldCountries.root.children?.find(
    (c: GazetteerNode) => c.name === countryEnglishName
  );
  return node ? node.name : null;
}

function findAdmin1Path(countryCode: string, admin1EnglishName: string): string | null {
  // Find country in world-admin1 gazetteer by ISO code alias
  const country = worldAdmin1.root.children?.find(
    (c: GazetteerNode) => c.aliases?.includes(countryCode)
  );
  if (!country) return null;

  const admin1 = country.children?.find(
    (c: GazetteerNode) => c.name === admin1EnglishName
  );
  if (!admin1) return null;

  return country.name + ' > ' + admin1.name;
}

// ── Main ───────────────────────────────────────────────────────────

function main() {
  console.log('Parsing country info...');
  const countries = parseCountryInfo();
  console.log('Parsing admin1 codes...');
  const admin1s = parseAdmin1Codes();

  const countryGeonameIds = new Set(
    [...countries.values()].map(c => c.geonameId)
  );
  const admin1GeonameIds = new Set(
    [...admin1s.values()].map(a => a.geonameId)
  );

  console.log('Parsing Swedish alternate names (this may take a moment)...');
  const svNames = parseSwedishAltNames(countryGeonameIds, admin1GeonameIds);
  console.log("Found Swedish names for " + svNames.size + " places");

  // Build translations
  const countryTranslations: Record<string, string[]> = {};
  const admin1Translations: Record<string, string[]> = {};

  // Countries
  for (const [geonameId, names] of svNames) {
    const country = countries.get(geonameId);
    if (country) {
      const canonical = findCountryName(country.name);
      if (!canonical) continue;
      // Filter out names that are identical to the canonical English name
      const different = names.filter(n => n !== canonical);
      if (different.length > 0) {
        countryTranslations[canonical] = different;
      }
      continue;
    }

    const admin1 = admin1s.get(geonameId);
    if (admin1) {
      const countryCode = admin1.code.split('.')[0];
      const pathKey = findAdmin1Path(countryCode, admin1.name);
      if (!pathKey) continue;
      const different = names.filter(n => n !== admin1.name);
      if (different.length > 0) {
        admin1Translations[pathKey] = different;
      }
    }
  }

  const translations: Record<string, Record<string, string[]>> = {};
  if (Object.keys(countryTranslations).length > 0) {
    translations['world-countries'] = countryTranslations;
  }
  if (Object.keys(admin1Translations).length > 0) {
    translations['world-admin1'] = admin1Translations;
  }

  const gazetteer = {
    id: 'lang-sv-geonames',
    name: 'Swedish place names (GeoNames)',
    locale: 'sv',
    kind: 'language',
    description: 'Swedish translations for countries and admin1 divisions',
    source: {
      name: 'GeoNames',
      url: 'https://www.geonames.org/',
      license: 'CC BY 4.0',
      fetched: new Date().toISOString().split('T')[0],
    },
    root: { name: 'sv', type: 'language', lat: 0, lon: 0 },
    translations,
  };

  const outPath = path.join(DATA_DIR, 'lang-sv-geonames.json');
  fs.writeFileSync(outPath, JSON.stringify(gazetteer, null, 2) + '
');
  console.log("Written to " + outPath);
  console.log("Countries: " + Object.keys(countryTranslations).length);
  console.log("Admin1: " + Object.keys(admin1Translations).length);
}

main();
```

- [ ] **Step 2: Download prerequisites and run the build**

```bash
curl -o /tmp/alternateNamesV2.zip https://download.geonames.org/export/dump/alternateNamesV2.zip
unzip -o /tmp/alternateNamesV2.zip -d /tmp/geonames_altnames/
# countryInfo.txt and admin1CodesASCII.txt may already exist from build-world.ts
curl -o /tmp/countryInfo.txt https://download.geonames.org/export/dump/countryInfo.txt
curl -o /tmp/admin1CodesASCII.txt https://download.geonames.org/export/dump/admin1CodesASCII.txt
npx tsx scripts/build-lang-sv-geonames.ts
```

Expected: Creates `src/api/place-gazetteers/data/lang-sv-geonames.json` with ~150-200 country translations and ~200-500 admin1 translations.

- [ ] **Step 3: Spot-check the output**

Verify the output JSON contains expected entries:

```bash
node -e "const g = require('./src/api/place-gazetteers/data/lang-sv-geonames.json'); console.log('Countries:', Object.keys(g.translations['world-countries'] || {}).length); console.log('Admin1:', Object.keys(g.translations['world-admin1'] || {}).length); console.log('Denmark:', g.translations['world-countries']?.['Denmark']); console.log('Germany:', g.translations['world-countries']?.['Germany']);"
```

Expected: Denmark → ["Danmark"], Germany → ["Tyskland"].

- [ ] **Step 4: Commit**

```bash
git add scripts/build-lang-sv-geonames.ts src/api/place-gazetteers/data/lang-sv-geonames.json
git commit -m "feat: add Swedish language gazetteer from GeoNames"
```

---

### Task 4: Build script — Swedish translations from Wikidata

**Files:**
- Create: `scripts/build-lang-sv-wikidata.ts`
- Create: `src/api/place-gazetteers/data/lang-sv-wikidata.json`

- [ ] **Step 1: Write the build script**

Create `scripts/build-lang-sv-wikidata.ts`. This script queries Wikidata SPARQL for Swedish labels of Danish, Norwegian, Finnish, and Icelandic administrative divisions, then matches them against the canonical names in the existing gazetteers.

```typescript
/**
 * Build Swedish language gazetteer from Wikidata.
 *
 * Produces: src/api/place-gazetteers/data/lang-sv-wikidata.json
 *
 * Queries Wikidata for Swedish labels of Danish, Norwegian, Finnish,
 * and Icelandic administrative divisions. Only includes entries where
 * the Swedish name differs from the canonical gazetteer name.
 *
 * Source: Wikidata (https://www.wikidata.org/) — CC0 1.0
 *
 * Usage: npx tsx scripts/build-lang-sv-wikidata.ts
 *
 * No prerequisites — fetches data directly from Wikidata SPARQL endpoint.
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, '..', 'src', 'api', 'place-gazetteers', 'data');
const WIKIDATA_ENDPOINT = 'https://query.wikidata.org/sparql';

interface GazetteerNode {
  name: string;
  type: string;
  aliases?: string[];
  lat: number;
  lon: number;
  children?: GazetteerNode[];
}

// Target gazetteers to match against
const TARGETS: { gazId: string; file: string }[] = [
  { gazId: 'dk-sogne', file: 'dk-sogne.json' },
  { gazId: 'dk-sogne-dawa', file: 'dk-sogne-dawa.json' },
  { gazId: 'no-kommuner', file: 'no-kommuner.json' },
  { gazId: 'fi-kunnat', file: 'fi-kunnat.json' },
  { gazId: 'is-sveitarfelog', file: 'is-sveitarfelog.json' },
];

// ── SPARQL queries ─────────────────────────────────────────────────

// Each query fetches: native-language label, Swedish label
// for administrative divisions in the target country.

const QUERIES: Record<string, string> = {
  // Danish municipalities (Q29946056 = municipality of Denmark)
  dk: "
    SELECT ?item ?nativeLabel ?svLabel WHERE {
      ?item wdt:P31/wdt:P279* wd:Q29946056 .
      ?item rdfs:label ?nativeLabel . FILTER(LANG(?nativeLabel) = 'da')
      ?item rdfs:label ?svLabel . FILTER(LANG(?svLabel) = 'sv')
      FILTER(?nativeLabel != ?svLabel)
    }
  ",
  // Danish regions (Q183480 = region of Denmark)
  dk_regions: "
    SELECT ?item ?nativeLabel ?svLabel WHERE {
      ?item wdt:P31 wd:Q183480 .
      ?item rdfs:label ?nativeLabel . FILTER(LANG(?nativeLabel) = 'da')
      ?item rdfs:label ?svLabel . FILTER(LANG(?svLabel) = 'sv')
      FILTER(?nativeLabel != ?svLabel)
    }
  ",
  // Norwegian municipalities (Q755707 = municipality of Norway)
  no: "
    SELECT ?item ?nativeLabel ?svLabel WHERE {
      ?item wdt:P31/wdt:P279* wd:Q755707 .
      ?item rdfs:label ?nativeLabel . FILTER(LANG(?nativeLabel) = 'no')
      ?item rdfs:label ?svLabel . FILTER(LANG(?svLabel) = 'sv')
      FILTER(?nativeLabel != ?svLabel)
    }
  ",
  // Norwegian counties (Q194203 = county of Norway)
  no_counties: "
    SELECT ?item ?nativeLabel ?svLabel WHERE {
      ?item wdt:P31 wd:Q194203 .
      ?item rdfs:label ?nativeLabel . FILTER(LANG(?nativeLabel) = 'no')
      ?item rdfs:label ?svLabel . FILTER(LANG(?svLabel) = 'sv')
      FILTER(?nativeLabel != ?svLabel)
    }
  ",
  // Finnish municipalities (Q515708 = municipality of Finland)
  fi: "
    SELECT ?item ?nativeLabel ?svLabel WHERE {
      ?item wdt:P31/wdt:P279* wd:Q515708 .
      ?item rdfs:label ?nativeLabel . FILTER(LANG(?nativeLabel) = 'fi')
      ?item rdfs:label ?svLabel . FILTER(LANG(?svLabel) = 'sv')
      FILTER(?nativeLabel != ?svLabel)
    }
  ",
  // Icelandic municipalities (Q132700 = municipality of Iceland)
  is: "
    SELECT ?item ?nativeLabel ?svLabel WHERE {
      ?item wdt:P31/wdt:P279* wd:Q132700 .
      ?item rdfs:label ?nativeLabel . FILTER(LANG(?nativeLabel) = 'is')
      ?item rdfs:label ?svLabel . FILTER(LANG(?svLabel) = 'sv')
      FILTER(?nativeLabel != ?svLabel)
    }
  ",
};

async function sparqlQuery(query: string): Promise<Array<{ nativeLabel: string; svLabel: string }>> {
  const url = WIKIDATA_ENDPOINT + '?query=' + encodeURIComponent(query);
  const resp = await fetch(url, {
    headers: {
      'Accept': 'application/sparql-results+json',
      'User-Agent': 'Slaktforskning-Gazetteer-Builder/1.0',
    },
  });
  if (!resp.ok) throw new Error("SPARQL query failed: " + resp.status + " " + resp.statusText);
  const json = await resp.json();
  return json.results.bindings.map((b: { nativeLabel: { value: string }; svLabel: { value: string } }) => ({
    nativeLabel: b.nativeLabel.value,
    svLabel: b.svLabel.value,
  }));
}

// ── Match against gazetteer ────────────────────────────────────────

function collectNames(node: GazetteerNode, parentPath: string): Map<string, string> {
  // Map of node name → path key
  const names = new Map<string, string>();
  const pathKey = parentPath ? parentPath + ' > ' + node.name : node.name;
  names.set(node.name, pathKey);
  if (node.children) {
    for (const child of node.children) {
      for (const [name, childPath] of collectNames(child, pathKey)) {
        names.set(name, childPath);
      }
    }
  }
  return names;
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  const translations: Record<string, Record<string, string[]>> = {};

  // Load target gazetteers and build name→pathKey maps
  const gazNameMaps = new Map<string, Map<string, string>>();
  for (const target of TARGETS) {
    const filePath = path.join(DATA_DIR, target.file);
    if (!fs.existsSync(filePath)) {
      console.log("Skipping " + target.gazId + " — file not found");
      continue;
    }
    const gaz = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const nameMap = new Map<string, string>();
    if (gaz.root.children) {
      for (const child of gaz.root.children) {
        for (const [name, pathKey] of collectNames(child, '')) {
          nameMap.set(name, pathKey);
        }
      }
    }
    gazNameMaps.set(target.gazId, nameMap);
  }

  // Run SPARQL queries and match results against gazetteers
  for (const [queryKey, query] of Object.entries(QUERIES)) {
    const countryPrefix = queryKey.split('_')[0]; // dk, no, fi, is
    console.log("Querying Wikidata for " + queryKey + "...");

    let results: Array<{ nativeLabel: string; svLabel: string }>;
    try {
      results = await sparqlQuery(query);
    } catch (err) {
      console.error("Failed: " + (err as Error).message);
      continue;
    }
    console.log("  Got " + results.length + " results");

    // Find which target gazetteers match this country
    const matchingTargets = TARGETS.filter(t => t.gazId.startsWith(countryPrefix));

    for (const result of results) {
      for (const target of matchingTargets) {
        const nameMap = gazNameMaps.get(target.gazId);
        if (!nameMap) continue;

        // Try to find the native label in the gazetteer
        const pathKey = nameMap.get(result.nativeLabel);
        if (!pathKey) continue;

        // Only include if Swedish name differs from the canonical name
        if (result.svLabel === result.nativeLabel) continue;

        if (!translations[target.gazId]) translations[target.gazId] = {};
        const key = pathKey.includes(' > ') ? pathKey : result.nativeLabel;
        if (!translations[target.gazId][key]) translations[target.gazId][key] = [];
        if (!translations[target.gazId][key].includes(result.svLabel)) {
          translations[target.gazId][key].push(result.svLabel);
        }
      }
    }
  }

  const gazetteer = {
    id: 'lang-sv-wikidata',
    name: 'Swedish place names (Wikidata)',
    locale: 'sv',
    kind: 'language',
    description: 'Swedish translations for Nordic administrative divisions',
    source: {
      name: 'Wikidata',
      url: 'https://www.wikidata.org/',
      license: 'CC0 1.0',
      fetched: new Date().toISOString().split('T')[0],
    },
    root: { name: 'sv', type: 'language', lat: 0, lon: 0 },
    translations,
  };

  const outPath = path.join(DATA_DIR, 'lang-sv-wikidata.json');
  fs.writeFileSync(outPath, JSON.stringify(gazetteer, null, 2) + '
');
  console.log("Written to " + outPath);
  for (const [gazId, trans] of Object.entries(translations)) {
    console.log("  " + gazId + ": " + Object.keys(trans).length + " translations");
  }
}

main();
```

- [ ] **Step 2: Run the build**

```bash
npx tsx scripts/build-lang-sv-wikidata.ts
```

Expected: Creates `src/api/place-gazetteers/data/lang-sv-wikidata.json` with translations for Nordic places. Finnish places especially should have many Swedish names (Finland has official Swedish names for municipalities).

- [ ] **Step 3: Spot-check the output**

```bash
node -e "const g = require('./src/api/place-gazetteers/data/lang-sv-wikidata.json'); for (const [k,v] of Object.entries(g.translations)) console.log(k + ':', Object.keys(v).length, 'translations');"
```

- [ ] **Step 4: Commit**

```bash
git add scripts/build-lang-sv-wikidata.ts src/api/place-gazetteers/data/lang-sv-wikidata.json
git commit -m "feat: add Swedish language gazetteer from Wikidata"
```

---

### Task 5: Register bundled language gazetteers

**Files:**
- Modify: `src/api/place-gazetteers/index.ts`

- [ ] **Step 1: Import and register the language gazetteer data files**

Add imports to `src/api/place-gazetteers/index.ts`:

```typescript
// Language gazetteers
import langSvGeonames from './data/lang-sv-geonames.json';
import langSvWikidata from './data/lang-sv-wikidata.json';
```

Add them to the `BUNDLED_GAZETTEERS` array:

```typescript
  // Language gazetteers
  langSvGeonames as Gazetteer,
  langSvWikidata as Gazetteer,
```

- [ ] **Step 2: Run tests to verify nothing breaks**

Run: `npm test`
Expected: All tests pass. The existing `loadGazetteers` tests should still work because language gazetteers are filtered out when not enabled, and the `getAllGazetteers` count increases by 2.

- [ ] **Step 3: Fix the getAllGazetteers count test if needed**

The test `getAllGazetteers returns all bundled gazetteers` uses `toBeGreaterThanOrEqual(2)` so it should still pass. If any test uses an exact count, update it.

- [ ] **Step 4: Commit**

```bash
git add src/api/place-gazetteers/index.ts
git commit -m "feat: register bundled Swedish language gazetteers"
```

---

### Task 6: UI — language kind badge in GazetteersView

**Files:**
- Modify: `src/renderer/views/GazetteersView.vue:34-35`
- Modify: `src/renderer/i18n/en.ts:1182-1183`
- Modify: `src/renderer/i18n/sv.ts:1161-1162`

- [ ] **Step 1: Update the badge label in GazetteersView template**

In `src/renderer/views/GazetteersView.vue`, replace the ternary badge text (line 35) with a computed label that handles three kinds:

```vue
<span :class="['kind-badge', 'kind-' + (gaz.kind || 'point')]">
  {{ ('gazetteers.kind' + (gaz.kind === 'boundary' ? 'Boundary' : gaz.kind === 'language' ? 'Language' : 'Point')) }}
</span>
```

- [ ] **Step 2: Add i18n keys**

In `src/renderer/i18n/en.ts`, after `kindBoundary`:

```typescript
    kindLanguage: 'Language',
```

In `src/renderer/i18n/sv.ts`, after `kindBoundary`:

```typescript
    kindLanguage: 'Språk',
```

- [ ] **Step 3: Add CSS for the language badge**

In `src/renderer/views/GazetteersView.vue`, add after the `.kind-boundary` rule:

```css
.kind-language {
  background: var(--sex-u-bg);
  color: var(--sex-u-text);
}
```

This uses the neutral/unknown sex color tokens (typically purple/indigo) for a distinct third color.

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/views/GazetteersView.vue src/renderer/i18n/en.ts src/renderer/i18n/sv.ts
git commit -m "feat: add language kind badge to GazetteersView"
```

---

### Task 7: Integration test — end-to-end resolve with language gazetteers

**Files:**
- Modify: `tests/unit/place-gazetteers.test.ts`

- [ ] **Step 1: Write integration test using actual bundled data**

Add a test that loads the real bundled gazetteers including the language ones:

```typescript
describe('language gazetteer integration', () => {
  it('resolves "Danmark" when lang-sv-geonames is enabled with world-countries', () => {
    const config: GazetteerConfig = { enabledGazetteers: ['world-countries', 'lang-sv-geonames'] };
    const gazetteers = loadGazetteers(config);
    const result = resolvePlace('Danmark', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.matchedPath).toContain('Denmark');
    expect(result!.matchQuality).not.toBe('ambiguous');
  });

  it('resolves "Brasilien" when lang-sv-geonames is enabled', () => {
    const config: GazetteerConfig = { enabledGazetteers: ['world-countries', 'lang-sv-geonames'] };
    const gazetteers = loadGazetteers(config);
    const result = resolvePlace('Brasilien', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.matchedPath).toContain('Brazil');
  });

  it('does not resolve "Danmark" without language gazetteer', () => {
    const config: GazetteerConfig = { enabledGazetteers: ['world-countries'] };
    const gazetteers = loadGazetteers(config);
    const result = resolvePlace('Danmark', gazetteers);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test -- --grep "language gazetteer integration"`
Expected: All 3 tests PASS.

- [ ] **Step 3: Run full suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/place-gazetteers.test.ts
git commit -m "test: add integration tests for language gazetteer resolve"
```

---

### Task 8: Documentation — update CLAUDE.md and PLAN.md

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/PLAN.md`

- [ ] **Step 1: Add lang-sv-geonames and lang-sv-wikidata to the data directory listing in CLAUDE.md**

In the file map under `data/`, add:

```
│           ├── lang-sv-geonames.json  # Swedish place name translations (GeoNames)
│           └── lang-sv-wikidata.json  # Swedish place name translations (Wikidata)
```

Update the gazetteer count from "23 bundled gazetteers" to "25 bundled gazetteers (~40 MB) — 15 point + 8 boundary + 2 language".

- [ ] **Step 2: Add build script references to CLAUDE.md commands section**

In the common commands section, note the new build scripts alongside existing ones.

- [ ] **Step 3: Update docs/PLAN.md roadmap**

Add a done entry for language gazetteers with a pointer to the spec and plan files.

- [ ] **Step 4: Archive the design spec**

Move `docs/plans/2026-04-18-language-gazetteers-design.md` to `docs/plans/archive/`.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/PLAN.md docs/plans/
git commit -m "docs: add language gazetteers to CLAUDE.md and PLAN.md"
```
