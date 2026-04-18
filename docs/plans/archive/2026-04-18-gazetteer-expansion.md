# Gazetteer Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the gazetteer system from Sweden-only to global coverage — Scandinavia at parish/municipality level, North America (9 US states + 5 Canadian provinces) at county+populated-places level, and worldwide at country+admin1 level. All bundled.

**Architecture:** One build script per country/source. Each produces standalone JSON files in `src/api/place-gazetteers/data/`. The loader (`index.ts`) imports all new gazetteers. The resolver already handles arbitrary hierarchies — no changes needed there. The normalizer needs minor suffix additions for Danish/Norwegian/Finnish place name patterns.

**Tech Stack:** TypeScript build scripts (`npx tsx`), Wikidata SPARQL (Denmark), GeoNames TSV dumps (Norway, Finland, Iceland, USA, Canada, global), existing Gazetteer JSON format.

---

## File Structure

### Build Scripts (one per country/source)

| File | Source | Output |
|------|--------|--------|
| `scripts/build-dk-parishes.ts` | Wikidata SPARQL | `dk-sogne.json` |
| `scripts/build-dk-parishes-dawa.ts` | DAWA API | `dk-sogne-dawa.json` |
| `scripts/build-no-municipalities.ts` | GeoNames NO.zip | `no-kommuner.json` |
| `scripts/build-fi-municipalities.ts` | GeoNames FI.zip | `fi-kunnat.json` |
| `scripts/build-is-municipalities.ts` | GeoNames IS.zip | `is-sveitarfelog.json` |
| `scripts/build-us-places.ts` | GeoNames US.zip | `us-immigration-states.json` |
| `scripts/build-ca-places.ts` | GeoNames CA.zip | `ca-provinces.json` |
| `scripts/build-world.ts` | GeoNames countryInfo + admin1 | `world-countries.json`, `world-admin1.json` |

### Data Files (new, in `src/api/place-gazetteers/data/`)

| File | Nodes est. | Size est. |
|------|-----------|-----------|
| `dk-sogne.json` | ~2,500 | ~700 KB |
| `dk-sogne-dawa.json` | ~2,200 | ~600 KB |
| `no-kommuner.json` | ~400 | ~100 KB |
| `fi-kunnat.json` | ~350 | ~90 KB |
| `is-sveitarfelog.json` | ~100 | ~30 KB |
| `us-immigration-states.json` | ~8,000 | ~3 MB |
| `ca-provinces.json` | ~4,000 | ~2 MB |
| `world-countries.json` | ~250 | ~80 KB |
| `world-admin1.json` | ~4,000 | ~500 KB |

### Modified Files

| File | Change |
|------|--------|
| `src/api/place-gazetteers/index.ts` | Import + register all new gazetteers |
| `src/api/place-gazetteers/resolver.ts` | Add Scandinavian/global suffix normalization |
| `tests/unit/gazetteers.test.ts` | Tests for new gazetteers loading + resolution |

---

## Task 1: World Countries Gazetteer (GeoNames countryInfo)

**Files:**
- Create: `scripts/build-world.ts`
- Create: `src/api/place-gazetteers/data/world-countries.json`
- Create: `src/api/place-gazetteers/data/world-admin1.json`

This is the simplest gazetteer and establishes the GeoNames download pattern used by all subsequent tasks.

- [ ] **Step 1: Write the build script**

Create `scripts/build-world.ts`:

```typescript
/**
 * Build world gazetteers from GeoNames data.
 *
 * Produces TWO gazetteers:
 *   1. world-countries   — All countries (~250 entries)
 *   2. world-admin1      — Countries + states/provinces (~4,000 entries)
 *
 * Usage:
 *   curl -o /tmp/countryInfo.txt https://download.geonames.org/export/dump/countryInfo.txt
 *   curl -o /tmp/admin1CodesASCII.txt https://download.geonames.org/export/dump/admin1CodesASCII.txt
 *   npx tsx scripts/build-world.ts
 *
 * Source: GeoNames (https://www.geonames.org/) — CC BY 4.0
 */

import * as fs from "fs";
import * as path from "path";

const DATA_DIR = path.join(__dirname, "..", "src", "api", "place-gazetteers", "data");
const COUNTRY_FILE = "/tmp/countryInfo.txt";
const ADMIN1_FILE = "/tmp/admin1CodesASCII.txt";

interface GazetteerNode {
  name: string;
  type: string;
  aliases?: string[];
  lat: number;
  lon: number;
  children?: GazetteerNode[];
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

interface CountryRow {
  iso: string;
  iso3: string;
  name: string;
  capital: string;
  continent: string;
  lat: number;
  lon: number;
}

interface Admin1Row {
  code: string;       // CC.ADM1
  name: string;
  asciiName: string;
  geonameId: string;
}

// Continent codes → names
const CONTINENTS: Record<string, string> = {
  AF: "Africa",
  AN: "Antarctica",
  AS: "Asia",
  EU: "Europe",
  NA: "North America",
  OC: "Oceania",
  SA: "South America",
};

function parseCountryInfo(filePath: string): CountryRow[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const rows: CountryRow[] = [];

  for (const line of content.split("\n")) {
    if (!line.trim() || line.startsWith("#")) continue;
    const cols = line.split("\t");
    // Columns: 0=ISO, 1=ISO3, 2=ISONumeric, 3=fips, 4=Country, 5=Capital,
    // 6=Area, 7=Population, 8=Continent, 9=tld, 10=CurrencyCode, 11=CurrencyName,
    // 12=Phone, 13=PostalFormat, 14=PostalRegex, 15=Languages, 16=geonameid,
    // 17=neighbours, 18=EquivFips
    if (cols.length < 17) continue;

    // GeoNames countryInfo doesn't have lat/lon — we'll fill from admin1 centroids
    // or use a separate lookup. For now, use the GeoNames feature search.
    rows.push({
      iso: cols[0],
      iso3: cols[1],
      name: cols[4],
      capital: cols[5],
      continent: cols[8],
      lat: 0,  // filled later from admin1 centroid
      lon: 0,
    });
  }

  return rows;
}

function parseAdmin1(filePath: string): Admin1Row[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const rows: Admin1Row[] = [];

  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    const cols = line.split("\t");
    // Columns: 0=code (CC.ADM1), 1=name, 2=asciiName, 3=geonameId
    if (cols.length < 4) continue;
    rows.push({
      code: cols[0],
      name: cols[1],
      asciiName: cols[2],
      geonameId: cols[3],
    });
  }

  return rows;
}

// We need lat/lon for admin1 entries — fetch from allCountries or use a cities file
// For simplicity, download the admin1 coordinates from the GeoNames API
// Actually, admin1CodesASCII doesn't have coordinates. We need to get them
// from the main GeoNames dump. Let's use cities15000 as a simpler source for
// country centroids, and for admin1 we'll need the full dump.
// 
// Better approach: download the GeoNames admin divisions file which has coordinates.
// Or use the GeoNames search API.
//
// Simplest approach: Use the geonames "shapes" files or pre-computed centroids.
// For a bundled gazetteer, we can fetch coordinates via the GeoNames web API.

async function fetchAdmin1Coordinates(): Promise<Map<string, { lat: number; lon: number }>> {
  // Parse the admin1 codes file for names, then use the GeoNames search
  // to get coordinates. Since admin1CodesASCII.txt has geonameIds,
  // we can use the bulk download approach instead.
  //
  // Best approach: Download allCountries.zip, filter for ADM1 feature codes,
  // and extract coordinates. But that's a 300MB file.
  //
  // Pragmatic approach for ~4000 entries: use cities15000.zip (~24k cities)
  // and compute admin1 centroids from city coordinates.
  return new Map();
}

async function main() {
  console.log("Building world gazetteers from GeoNames...\n");

  if (!fs.existsSync(COUNTRY_FILE)) {
    console.error("Country info file not found. Download it first:");
    console.error("  curl -o /tmp/countryInfo.txt https://download.geonames.org/export/dump/countryInfo.txt");
    process.exit(1);
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });

  const countries = parseCountryInfo(COUNTRY_FILE);
  console.log("Countries: " + countries.length);

  // Build country-only gazetteer
  // For coordinates, we use a bundled centroid lookup (from Natural Earth or similar)
  // The approach is to download cities15000.zip and compute country centroids from it.
  
  // ... (implementation continues — see actual code in step 3)
}
```

**Actually — the cleanest approach is to download the GeoNames feature file for just ADM1 and PCLI features.** The `allCountries.zip` is 300MB but individual small files work. Let me revise:

The script should:
1. Parse `countryInfo.txt` for country list (no coords in this file)  
2. Download `cities15000.zip` (~1.2MB) which has lat/lon for 24k cities — compute country centroids from these
3. Parse `admin1CodesASCII.txt` for admin1 names — compute admin1 centroids from cities in that admin1
4. Build two gazetteers: countries-only and countries+admin1

Full implementation:

```typescript
/**
 * Build world gazetteers from GeoNames data.
 *
 * Produces TWO gazetteers:
 *   1. world-countries — All sovereign countries (~250)
 *   2. world-admin1    — Countries + first-level admin divisions (~4,000)
 *
 * Prerequisites — download these GeoNames files:
 *   curl -o /tmp/countryInfo.txt https://download.geonames.org/export/dump/countryInfo.txt
 *   curl -o /tmp/cities15000.zip https://download.geonames.org/export/dump/cities15000.zip
 *   unzip -o /tmp/cities15000.zip -d /tmp/geonames_cities/
 *   curl -o /tmp/admin1CodesASCII.txt https://download.geonames.org/export/dump/admin1CodesASCII.txt
 *
 * Usage:
 *   npx tsx scripts/build-world.ts
 *
 * Source: GeoNames (https://www.geonames.org/) — CC BY 4.0
 */

import * as fs from "fs";
import * as path from "path";

const DATA_DIR = path.join(__dirname, "..", "src", "api", "place-gazetteers", "data");
const COUNTRY_FILE = "/tmp/countryInfo.txt";
const CITIES_FILE = "/tmp/geonames_cities/cities15000.txt";
const ADMIN1_FILE = "/tmp/admin1CodesASCII.txt";

interface GazetteerNode {
  name: string;
  type: string;
  aliases?: string[];
  lat: number;
  lon: number;
  children?: GazetteerNode[];
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

// ── Parsing ──────────────────────────────────────────────────────────

interface CityRow {
  name: string;
  lat: number;
  lon: number;
  countryCode: string;
  admin1Code: string;
  population: number;
}

function parseCities(filePath: string): CityRow[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const rows: CityRow[] = [];
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    const cols = line.split("\t");
    if (cols.length < 15) continue;
    rows.push({
      name: cols[1],
      lat: parseFloat(cols[4]),
      lon: parseFloat(cols[5]),
      countryCode: cols[8],
      admin1Code: cols[10],
      population: parseInt(cols[14]) || 0,
    });
  }
  return rows;
}

interface CountryInfo {
  iso: string;
  iso3: string;
  name: string;
  continent: string;
}

function parseCountryInfo(filePath: string): CountryInfo[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const rows: CountryInfo[] = [];
  for (const line of content.split("\n")) {
    if (!line.trim() || line.startsWith("#")) continue;
    const cols = line.split("\t");
    if (cols.length < 17) continue;
    rows.push({ iso: cols[0], iso3: cols[1], name: cols[4], continent: cols[8] });
  }
  return rows;
}

interface Admin1Info {
  code: string;  // CC.ADM1
  name: string;
}

function parseAdmin1(filePath: string): Admin1Info[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const rows: Admin1Info[] = [];
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    const cols = line.split("\t");
    if (cols.length < 2) continue;
    rows.push({ code: cols[0], name: cols[1] });
  }
  return rows;
}

// ── Centroid computation ─────────────────────────────────────────────

function computeCentroid(cities: CityRow[]): { lat: number; lon: number } {
  // Population-weighted centroid for better placement
  const totalPop = cities.reduce((s, c) => s + Math.max(c.population, 1), 0);
  const lat = cities.reduce((s, c) => s + c.lat * Math.max(c.population, 1), 0) / totalPop;
  const lon = cities.reduce((s, c) => s + c.lon * Math.max(c.population, 1), 0) / totalPop;
  return { lat: round6(lat), lon: round6(lon) };
}

// ── Main ─────────────────────────────────────────────────────────────

function main() {
  for (const f of [COUNTRY_FILE, CITIES_FILE, ADMIN1_FILE]) {
    if (!fs.existsSync(f)) {
      console.error("Missing file: " + f);
      console.error("Download prerequisites first — see script header.");
      process.exit(1);
    }
  }

  console.log("Building world gazetteers from GeoNames...\n");
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const countries = parseCountryInfo(COUNTRY_FILE);
  const cities = parseCities(CITIES_FILE);
  const admin1s = parseAdmin1(ADMIN1_FILE);

  console.log("Countries: " + countries.length);
  console.log("Cities: " + cities.length);
  console.log("Admin1 divisions: " + admin1s.length);

  // Group cities by country
  const citiesByCountry = new Map<string, CityRow[]>();
  for (const c of cities) {
    if (!citiesByCountry.has(c.countryCode)) citiesByCountry.set(c.countryCode, []);
    citiesByCountry.get(c.countryCode)!.push(c);
  }

  // Group cities by country+admin1
  const citiesByAdmin1 = new Map<string, CityRow[]>();
  for (const c of cities) {
    const key = c.countryCode + "."+  c.admin1Code;
    if (!citiesByAdmin1.has(key)) citiesByAdmin1.set(key, []);
    citiesByAdmin1.get(key)!.push(c);
  }

  // Group admin1 by country
  const admin1ByCountry = new Map<string, Admin1Info[]>();
  for (const a of admin1s) {
    const cc = a.code.split(".")[0];
    if (!admin1ByCountry.has(cc)) admin1ByCountry.set(cc, []);
    admin1ByCountry.get(cc)!.push(a);
  }

  // ── 1. World Countries ──────────────────────────────────────────
  const countryNodes: GazetteerNode[] = [];
  let skippedNoCoords = 0;

  for (const c of countries.sort((a, b) => a.name.localeCompare(b.name, "en"))) {
    const countryCities = citiesByCountry.get(c.iso);
    if (!countryCities || countryCities.length === 0) {
      skippedNoCoords++;
      continue;
    }
    const centroid = computeCentroid(countryCities);
    const node: GazetteerNode = {
      name: c.name,
      type: "country",
      lat: centroid.lat,
      lon: centroid.lon,
    };
    // Add ISO codes as aliases
    const aliases = [c.iso, c.iso3].filter(a => a && a !== c.name);
    if (aliases.length > 0) node.aliases = aliases;
    countryNodes.push(node);
  }

  const countriesGaz = {
    id: "world-countries",
    name: "World Countries",
    locale: "en",
    description: "All countries with ISO codes as aliases. Enables resolution of country-level place strings.",
    source: {
      name: "GeoNames",
      url: "https://www.geonames.org/countries/",
      license: "CC BY 4.0",
      fetched: new Date().toISOString().slice(0, 10),
    },
    root: {
      name: "World",
      type: "root",
      lat: 0,
      lon: 0,
      children: countryNodes,
    },
  };

  let outPath = path.join(DATA_DIR, "world-countries.json");
  let json = JSON.stringify(countriesGaz, null, 2);
  fs.writeFileSync(outPath, json + "\n");
  console.log("world-countries: " + countryNodes.length + " countries (" + skippedNoCoords + " skipped, no cities) → " + (Buffer.byteLength(json) / 1024).toFixed(0) + " KB");

  // ── 2. World Admin1 ─────────────────────────────────────────────
  const countryNodesWithAdmin1: GazetteerNode[] = [];

  for (const c of countries.sort((a, b) => a.name.localeCompare(b.name, "en"))) {
    const countryCities = citiesByCountry.get(c.iso);
    if (!countryCities || countryCities.length === 0) continue;
    const centroid = computeCentroid(countryCities);

    const admin1List = admin1ByCountry.get(c.iso) || [];
    const admin1Nodes: GazetteerNode[] = [];

    for (const a of admin1List.sort((x, y) => x.name.localeCompare(y.name, "en"))) {
      const a1Cities = citiesByAdmin1.get(a.code);
      if (!a1Cities || a1Cities.length === 0) continue;
      const a1Centroid = computeCentroid(a1Cities);
      admin1Nodes.push({
        name: a.name,
        type: "admin1",
        lat: a1Centroid.lat,
        lon: a1Centroid.lon,
      });
    }

    const node: GazetteerNode = {
      name: c.name,
      type: "country",
      lat: centroid.lat,
      lon: centroid.lon,
    };
    const aliases = [c.iso, c.iso3].filter(a => a && a !== c.name);
    if (aliases.length > 0) node.aliases = aliases;
    if (admin1Nodes.length > 0) node.children = admin1Nodes;
    countryNodesWithAdmin1.push(node);
  }

  const admin1Gaz = {
    id: "world-admin1",
    name: "World States & Provinces",
    locale: "en",
    description: "Countries with first-level administrative divisions (states, provinces, regions). Enables resolution of state/province-level place strings.",
    source: {
      name: "GeoNames",
      url: "https://www.geonames.org/countries/",
      license: "CC BY 4.0",
      fetched: new Date().toISOString().slice(0, 10),
    },
    root: {
      name: "World",
      type: "root",
      lat: 0,
      lon: 0,
      children: countryNodesWithAdmin1,
    },
  };

  outPath = path.join(DATA_DIR, "world-admin1.json");
  json = JSON.stringify(admin1Gaz, null, 2);
  fs.writeFileSync(outPath, json + "\n");
  const totalAdmin1 = countryNodesWithAdmin1.reduce((s, c) => s + (c.children?.length || 0), 0);
  console.log("world-admin1: " + countryNodesWithAdmin1.length + " countries, " + totalAdmin1 + " admin1 → " + (Buffer.byteLength(json) / 1024).toFixed(0) + " KB");

  console.log("\nDone!");
}

main();
```

- [ ] **Step 2: Download GeoNames prerequisites and run the script**

```bash
curl -o /tmp/countryInfo.txt https://download.geonames.org/export/dump/countryInfo.txt
curl -o /tmp/admin1CodesASCII.txt https://download.geonames.org/export/dump/admin1CodesASCII.txt
curl -o /tmp/cities15000.zip https://download.geonames.org/export/dump/cities15000.zip
unzip -o /tmp/cities15000.zip -d /tmp/geonames_cities/
npx tsx scripts/build-world.ts
```

Expected: Two JSON files created in `src/api/place-gazetteers/data/`.

- [ ] **Step 3: Verify output**

```bash
# Check file sizes are reasonable
ls -la src/api/place-gazetteers/data/world-*.json
# Spot-check structure
head -30 src/api/place-gazetteers/data/world-countries.json
# Verify some countries exist
grep -c "\\country\\" src/api/place-gazetteers/data/world-countries.json
```

Expected: `world-countries.json` ~50-100 KB with ~250 countries. `world-admin1.json` ~300-600 KB with ~4,000 admin1 divisions.

- [ ] **Step 4: Commit**

```bash
git add scripts/build-world.ts src/api/place-gazetteers/data/world-countries.json src/api/place-gazetteers/data/world-admin1.json
git commit -m "feat: add world countries + admin1 gazetteers (GeoNames)"
```

---

## Task 2: Danish Parish Gazetteer (Wikidata SPARQL)

**Files:**
- Create: `scripts/build-dk-parishes.ts`
- Create: `src/api/place-gazetteers/data/dk-sogne.json`

Denmark has ~2,197 parishes in Wikidata with coordinates (Q814648). Same approach as `build-sv-parishes.ts`.

- [ ] **Step 1: Write the build script**

Create `scripts/build-dk-parishes.ts`. Key differences from Swedish script:
- Wikidata class: `Q814648` (parish of Denmark) + `Q102854139` (former parish)
- Hierarchy: Danmark > Region > Kommune > Sogn
- Suffix stripping: `/\s+(sogn|pastorat|kirkedistrikt)$/i`
- Root: Danmark at lat 56.0, lon 10.0, aliases: ["Denmark"]
- Locale: `da`

The SPARQL query structure is nearly identical to the Swedish one — query items of class Q814648, get P625 coords, P131 (kommune), kommune's P131 (region), and sv→da altLabels.

```sparql
SELECT ?item ?itemLabel ?coord ?kommuneLabel ?regionLabel
  (GROUP_CONCAT(DISTINCT ?altLabel; SEPARATOR="|") AS ?altLabels)
WHERE {
  { ?item wdt:P31 wd:Q814648 . }
  UNION
  { ?item wdt:P31 wd:Q102854139 . }
  ?item wdt:P625 ?coord .
  ?item wdt:P131 ?kommune .
  ?kommune wdt:P131 ?region .
  OPTIONAL {
    ?item skos:altLabel ?altLabel .
    FILTER(LANG(?altLabel) = "da")
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "da,en". }
}
GROUP BY ?item ?itemLabel ?coord ?kommuneLabel ?regionLabel
```

Tree structure: `Danmark > [Region] > [Kommune] > [Sogn]`

Follow the same patterns as `build-sv-parishes.ts`:
- `parseWktPoint()` for coordinate extraction
- `generateAliases()` with Danish suffix patterns
- `buildTree()` grouping by region > kommune > parish
- `fetchClassMetadata()` for source metadata
- Centroid computation for kommune and region levels

- [ ] **Step 2: Run the script**

```bash
npx tsx scripts/build-dk-parishes.ts
```

Expected: `dk-sogne.json` created with ~2,000+ parishes.

- [ ] **Step 3: Verify output**

```bash
ls -la src/api/place-gazetteers/data/dk-sogne.json
# Check hierarchy
python3 -c "import json; d=json.load(open(\"src/api/place-gazetteers/data/dk-sogne.json\")); print(d[\"root\"][\"name\"]); print(len(d[\"root\"][\"children\"]), \"regions\"); total=sum(len(m.get(\"children\",[])) for r in d[\"root\"][\"children\"] for m in r.get(\"children\",[])); print(total, \"parishes\")"
```

Expected: ~5 regions, ~98 kommuner, ~2,000+ parishes.

- [ ] **Step 4: Commit**

```bash
git add scripts/build-dk-parishes.ts src/api/place-gazetteers/data/dk-sogne.json
git commit -m "feat: add Danish parish gazetteer (Wikidata)"
```

---

## Task 3: Danish Parish Gazetteer (DAWA API)

**Files:**
- Create: `scripts/build-dk-parishes-dawa.ts`
- Create: `src/api/place-gazetteers/data/dk-sogne-dawa.json`

Separate gazetteer from the official Danish government API. Higher coordinate precision than Wikidata.

- [ ] **Step 1: Write the build script**

Create `scripts/build-dk-parishes-dawa.ts`.

This script:
1. Fetches all parishes from `https://api.dataforsyningen.dk/sogne`
2. For each parish, gets `kode`, `navn`, and `visueltcenter` [lon, lat]
3. Also fetches kommuner from `https://api.dataforsyningen.dk/kommuner` to build hierarchy
4. Also fetches regioner from `https://api.dataforsyningen.dk/regioner` for top-level grouping
5. Builds tree: Danmark > Region > Kommune > Sogn

The DAWA API returns JSON directly — no SPARQL or file parsing needed.

Key API endpoints:
- `GET https://api.dataforsyningen.dk/sogne` → `[{ kode, navn, kommune: { kode, navn }, region: { kode, navn }, visueltcenter: [lon, lat] }]`
- No auth required, no rate limit documented

```typescript
/**
 * Build Danish parish gazetteer from DAWA (Danmarks Adressers Web API).
 *
 * Source: Danish Agency for Data Supply and Infrastructure
 * URL: https://api.dataforsyningen.dk/
 * License: Open Government Data (free, no restrictions)
 *
 * Usage:
 *   npx tsx scripts/build-dk-parishes-dawa.ts
 *
 * Output:
 *   src/api/place-gazetteers/data/dk-sogne-dawa.json
 */

import * as fs from "fs";
import * as path from "path";

const DATA_DIR = path.join(__dirname, "..", "src", "api", "place-gazetteers", "data");
const SOGNE_URL = "https://api.dataforsyningen.dk/sogne";

interface GazetteerNode {
  name: string;
  type: string;
  aliases?: string[];
  lat: number;
  lon: number;
  children?: GazetteerNode[];
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

interface DawaSogn {
  kode: string;
  navn: string;
  kommune: { kode: string; navn: string };
  region: { kode: string; navn: string };
  visueltcenter: [number, number]; // [lon, lat]
}

async function main() {
  console.log("Fetching Danish parishes from DAWA API...");

  const response = await fetch(SOGNE_URL);
  if (!response.ok) throw new Error("DAWA API error: " + response.status);
  const sogne: DawaSogn[] = await response.json();
  console.log("  Parishes: " + sogne.length);

  // Group: region > kommune > sogn
  const regionMap = new Map<string, { name: string; kommuner: Map<string, { name: string; sogne: DawaSogn[] }> }>();

  for (const s of sogne) {
    if (!regionMap.has(s.region.kode)) {
      regionMap.set(s.region.kode, { name: s.region.navn, kommuner: new Map() });
    }
    const region = regionMap.get(s.region.kode)!;
    if (!region.kommuner.has(s.kommune.kode)) {
      region.kommuner.set(s.kommune.kode, { name: s.kommune.navn, sogne: [] });
    }
    region.kommuner.get(s.kommune.kode)!.sogne.push(s);
  }

  // Build tree
  const regionNodes: GazetteerNode[] = [];

  for (const [, region] of [...regionMap.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name, "da"))) {
    const kommuneNodes: GazetteerNode[] = [];

    for (const [, kommune] of [...region.kommuner.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name, "da"))) {
      const sognNodes: GazetteerNode[] = kommune.sogne
        .sort((a, b) => a.navn.localeCompare(b.navn, "da"))
        .map(s => {
          const node: GazetteerNode = {
            name: s.navn,
            type: "parish",
            lat: round6(s.visueltcenter[1]),
            lon: round6(s.visueltcenter[0]),
          };
          // Strip " Sogn" suffix for alias
          const bare = s.navn.replace(/\s+Sogn$/i, "").trim();
          if (bare && bare !== s.navn) node.aliases = [bare];
          return node;
        });

      const avgLat = sognNodes.reduce((s, n) => s + n.lat, 0) / sognNodes.length;
      const avgLon = sognNodes.reduce((s, n) => s + n.lon, 0) / sognNodes.length;

      // Strip " Kommune" for alias
      const kommuneAliases: string[] = [];
      const bareK = kommune.name.replace(/\s+Kommune$/i, "").trim();
      if (bareK && bareK !== kommune.name) kommuneAliases.push(bareK);

      const kNode: GazetteerNode = {
        name: kommune.name,
        type: "municipality",
        lat: round6(avgLat),
        lon: round6(avgLon),
        children: sognNodes,
      };
      if (kommuneAliases.length > 0) kNode.aliases = kommuneAliases;
      kommuneNodes.push(kNode);
    }

    const avgLat = kommuneNodes.reduce((s, n) => s + n.lat, 0) / kommuneNodes.length;
    const avgLon = kommuneNodes.reduce((s, n) => s + n.lon, 0) / kommuneNodes.length;

    // Strip "Region " prefix for alias
    const regionAliases: string[] = [];
    const bareR = region.name.replace(/^Region\s+/i, "").trim();
    if (bareR && bareR !== region.name) regionAliases.push(bareR);

    const rNode: GazetteerNode = {
      name: region.name,
      type: "region",
      lat: round6(avgLat),
      lon: round6(avgLon),
      children: kommuneNodes,
    };
    if (regionAliases.length > 0) rNode.aliases = regionAliases;
    regionNodes.push(rNode);
  }

  const gazetteer = {
    id: "dk-sogne-dawa",
    name: "Danish Parishes — DAWA (Sogne)",
    locale: "da",
    description: "Danish parishes (sogne) from the official DAWA government API. Higher coordinate precision than the Wikidata version.",
    source: {
      name: "DAWA (Danmarks Adressers Web API)",
      url: "https://api.dataforsyningen.dk/sogne",
      license: "Danish Open Government Data",
      fetched: new Date().toISOString().slice(0, 10),
    },
    root: {
      name: "Danmark",
      type: "country",
      aliases: ["Denmark"],
      lat: 56.0,
      lon: 10.0,
      children: regionNodes,
    } as GazetteerNode,
  };

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const outPath = path.join(DATA_DIR, "dk-sogne-dawa.json");
  const json = JSON.stringify(gazetteer, null, 2);
  fs.writeFileSync(outPath, json + "\n");

  const totalSogne = regionNodes.reduce((s, r) => s + (r.children || []).reduce((s2, k) => s2 + (k.children || []).length, 0), 0);
  console.log("  Regions: " + regionNodes.length);
  console.log("  Kommuner: " + regionNodes.reduce((s, r) => s + (r.children || []).length, 0));
  console.log("  Sogne: " + totalSogne);
  console.log("  Output: " + (Buffer.byteLength(json) / 1024).toFixed(0) + " KB");
  console.log("\nDone!");
}

main().catch(err => { console.error("Error:", err); process.exit(1); });
```

- [ ] **Step 2: Run the script**

```bash
npx tsx scripts/build-dk-parishes-dawa.ts
```

- [ ] **Step 3: Verify and commit**

```bash
ls -la src/api/place-gazetteers/data/dk-sogne-dawa.json
git add scripts/build-dk-parishes-dawa.ts src/api/place-gazetteers/data/dk-sogne-dawa.json
git commit -m "feat: add Danish parish gazetteer from DAWA API"
```

---

## Task 4: Norwegian Municipality Gazetteer (GeoNames)

**Files:**
- Create: `scripts/build-no-municipalities.ts`
- Create: `src/api/place-gazetteers/data/no-kommuner.json`

Norway lacks parish-level data in Wikidata. Use GeoNames NO.zip for municipalities + populated places.

- [ ] **Step 1: Write the build script**

Create `scripts/build-no-municipalities.ts`. Pattern follows `fetch-sv-orter.ts` but for Norway.

Key differences:
- Input: `/tmp/geonames_no/NO.txt`
- Root: `Norge` at lat 65.0, lon 13.0, aliases: ["Norway"]
- Hierarchy: Norge > Fylke (ADM1) > Kommune (ADM2) > Places (PPL)
- Locale: `no`
- Include all populated places (featureClass P) within each kommune
- Admin1 names: Norwegian county names from GeoNames altNames (prefer Norwegian over English)
- Admin2 names: Municipality names
- Suffix stripping for aliases: `/\s+(kommune|fylke)$/i`

Download:
```bash
curl -o /tmp/NO.zip https://download.geonames.org/export/dump/NO.zip
unzip -o /tmp/NO.zip -d /tmp/geonames_no/
```

The script structure mirrors `fetch-sv-orter.ts`:
1. Parse GeoNames TSV, collect ADM1/ADM2 names from admin rows
2. Filter for populated places (featureClass P)
3. Build tree: Norway > fylke > kommune > places
4. Write JSON

- [ ] **Step 2: Run and verify**

```bash
curl -o /tmp/NO.zip https://download.geonames.org/export/dump/NO.zip
unzip -o /tmp/NO.zip -d /tmp/geonames_no/
npx tsx scripts/build-no-municipalities.ts
ls -la src/api/place-gazetteers/data/no-kommuner.json
```

- [ ] **Step 3: Commit**

```bash
git add scripts/build-no-municipalities.ts src/api/place-gazetteers/data/no-kommuner.json
git commit -m "feat: add Norwegian municipality gazetteer (GeoNames)"
```

---

## Task 5: Finnish Municipality Gazetteer (GeoNames)

**Files:**
- Create: `scripts/build-fi-municipalities.ts`
- Create: `src/api/place-gazetteers/data/fi-kunnat.json`

Same GeoNames pattern as Norway.

- [ ] **Step 1: Write the build script**

Create `scripts/build-fi-municipalities.ts`. Same structure as Norwegian script.

Key differences:
- Input: `/tmp/geonames_fi/FI.txt`
- Root: `Suomi` at lat 64.0, lon 26.0, aliases: ["Finland"]
- Hierarchy: Suomi > Maakunta/Region (ADM1) > Kunta/Kommun (ADM2) > Places (PPL)
- Locale: `fi`
- Finland has bilingual names (Finnish + Swedish) — GeoNames altNames include both
- Admin names: prefer Finnish names, add Swedish as aliases where available

Download:
```bash
curl -o /tmp/FI.zip https://download.geonames.org/export/dump/FI.zip
unzip -o /tmp/FI.zip -d /tmp/geonames_fi/
```

- [ ] **Step 2: Run and verify**

```bash
curl -o /tmp/FI.zip https://download.geonames.org/export/dump/FI.zip
unzip -o /tmp/FI.zip -d /tmp/geonames_fi/
npx tsx scripts/build-fi-municipalities.ts
ls -la src/api/place-gazetteers/data/fi-kunnat.json
```

- [ ] **Step 3: Commit**

```bash
git add scripts/build-fi-municipalities.ts src/api/place-gazetteers/data/fi-kunnat.json
git commit -m "feat: add Finnish municipality gazetteer (GeoNames)"
```

---

## Task 6: Icelandic Municipality Gazetteer (GeoNames)

**Files:**
- Create: `scripts/build-is-municipalities.ts`
- Create: `src/api/place-gazetteers/data/is-sveitarfelog.json`

Smallest dataset. Same GeoNames pattern.

- [ ] **Step 1: Write the build script**

Create `scripts/build-is-municipalities.ts`.

Key differences:
- Input: `/tmp/geonames_is/IS.txt`
- Root: `Ísland` at lat 65.0, lon -18.5, aliases: ["Iceland"]
- Hierarchy: Ísland > Region (ADM1) > Sveitarfélag (ADM2) > Places (PPL)
- Locale: `is`
- Small dataset (~79 municipalities, ~1,000 populated places)

Download:
```bash
curl -o /tmp/IS.zip https://download.geonames.org/export/dump/IS.zip
unzip -o /tmp/IS.zip -d /tmp/geonames_is/
```

- [ ] **Step 2: Run and verify**

```bash
curl -o /tmp/IS.zip https://download.geonames.org/export/dump/IS.zip
unzip -o /tmp/IS.zip -d /tmp/geonames_is/
npx tsx scripts/build-is-municipalities.ts
ls -la src/api/place-gazetteers/data/is-sveitarfelog.json
```

- [ ] **Step 3: Commit**

```bash
git add scripts/build-is-municipalities.ts src/api/place-gazetteers/data/is-sveitarfelog.json
git commit -m "feat: add Icelandic municipality gazetteer (GeoNames)"
```

---

## Task 7: US Immigration States Gazetteer (GeoNames)

**Files:**
- Create: `scripts/build-us-places.ts`
- Create: `src/api/place-gazetteers/data/us-immigration-states.json`

County + populated places for 9 key Scandinavian immigration states.

- [ ] **Step 1: Write the build script**

Create `scripts/build-us-places.ts`.

Key design:
- Input: `/tmp/geonames_us/US.txt` (~2.2M rows, filter to 9 states)
- States: MN, WI, IA, IL, ND, SD, WA, OR, NE (GeoNames admin1 codes)
- Hierarchy: United States > State (ADM1) > County (ADM2) > Places (PPL)
- Locale: `en`
- Root: `United States` at lat 39.8, lon -98.6, aliases: ["USA", "US", "United States of America"]
- Filter: featureClass P (populated places) + featureClass A, featureCode ADM2 (counties for hierarchy)
- Node types: state → "state", county → "county", place → "locality"

```typescript
// Target states for Scandinavian immigration research
const TARGET_STATES = new Set([
  "MN", // Minnesota — largest Scandinavian settlement
  "WI", // Wisconsin
  "IA", // Iowa
  "IL", // Illinois (Chicago was major port of entry)
  "ND", // North Dakota
  "SD", // South Dakota
  "WA", // Washington (Pacific Northwest)
  "OR", // Oregon
  "NE", // Nebraska
]);
```

The script follows the same GeoNames TSV parsing pattern as `fetch-sv-orter.ts`:
1. First pass: collect ADM1 and ADM2 names (state and county names) from admin rows
2. Filter to TARGET_STATES by admin1 code
3. Second pass: collect populated places in target states
4. Build tree: US > State > County > Place

Download — US.zip is large (~50MB), warn in header:
```bash
curl -o /tmp/US.zip https://download.geonames.org/export/dump/US.zip
unzip -o /tmp/US.zip -d /tmp/geonames_us/
```

- [ ] **Step 2: Run and verify**

```bash
curl -o /tmp/US.zip https://download.geonames.org/export/dump/US.zip
unzip -o /tmp/US.zip -d /tmp/geonames_us/
npx tsx scripts/build-us-places.ts
ls -la src/api/place-gazetteers/data/us-immigration-states.json
```

Expected: ~3-5 MB JSON with 9 states, ~500 counties, ~5,000-8,000 populated places.

- [ ] **Step 3: Commit**

```bash
git add scripts/build-us-places.ts src/api/place-gazetteers/data/us-immigration-states.json
git commit -m "feat: add US immigration states gazetteer (GeoNames)"
```

---

## Task 8: Canadian Provinces Gazetteer (GeoNames)

**Files:**
- Create: `scripts/build-ca-places.ts`
- Create: `src/api/place-gazetteers/data/ca-provinces.json`

Same GeoNames pattern, filtered to 5 provinces with Scandinavian settlement history.

- [ ] **Step 1: Write the build script**

Create `scripts/build-ca-places.ts`.

Key design:
- Input: `/tmp/geonames_ca/CA.txt`
- Provinces: 01 (Alberta), 02 (British Columbia), 03 (Manitoba), 08 (Ontario), 11 (Saskatchewan) — GeoNames admin1 codes
- Hierarchy: Canada > Province (ADM1) > Census Division (ADM2) > Places (PPL)
- Locale: `en`
- Root: `Canada` at lat 56.0, lon -96.0, aliases: ["CA"]

```typescript
const TARGET_PROVINCES = new Set([
  "01", // Alberta
  "02", // British Columbia
  "03", // Manitoba
  "08", // Ontario
  "11", // Saskatchewan
]);
```

Download:
```bash
curl -o /tmp/CA.zip https://download.geonames.org/export/dump/CA.zip
unzip -o /tmp/CA.zip -d /tmp/geonames_ca/
```

- [ ] **Step 2: Run and verify**

```bash
curl -o /tmp/CA.zip https://download.geonames.org/export/dump/CA.zip
unzip -o /tmp/CA.zip -d /tmp/geonames_ca/
npx tsx scripts/build-ca-places.ts
ls -la src/api/place-gazetteers/data/ca-provinces.json
```

Expected: ~2-3 MB JSON with 5 provinces.

- [ ] **Step 3: Commit**

```bash
git add scripts/build-ca-places.ts src/api/place-gazetteers/data/ca-provinces.json
git commit -m "feat: add Canadian provinces gazetteer (GeoNames)"
```

---

## Task 9: Register All Gazetteers in Loader

**Files:**
- Modify: `src/api/place-gazetteers/index.ts`

- [ ] **Step 1: Add imports and register all new gazetteers**

Add imports for all 9 new JSON files alongside the existing Swedish ones. Add them to the `BUNDLED_GAZETTEERS` array.

```typescript
// Add after existing Swedish imports:
import dkSogne from "./data/dk-sogne.json";
import dkSogneDawa from "./data/dk-sogne-dawa.json";
import noKommuner from "./data/no-kommuner.json";
import fiKunnat from "./data/fi-kunnat.json";
import isSveitarfelog from "./data/is-sveitarfelog.json";
import usImmigrationStates from "./data/us-immigration-states.json";
import caProvinces from "./data/ca-provinces.json";
import worldCountries from "./data/world-countries.json";
import worldAdmin1 from "./data/world-admin1.json";
```

Add to `BUNDLED_GAZETTEERS` array:
```typescript
const BUNDLED_GAZETTEERS: Gazetteer[] = [
  // Swedish
  svSocknar as Gazetteer,
  svForsamlingar as Gazetteer,
  svOrter as Gazetteer,
  svGardar as Gazetteer,
  svKyrkor as Gazetteer,
  svSockenstadBoundaries as Gazetteer,
  // Danish
  dkSogne as Gazetteer,
  dkSogneDawa as Gazetteer,
  // Norwegian
  noKommuner as Gazetteer,
  // Finnish
  fiKunnat as Gazetteer,
  // Icelandic
  isSveitarfelog as Gazetteer,
  // North American
  usImmigrationStates as Gazetteer,
  caProvinces as Gazetteer,
  // Global
  worldCountries as Gazetteer,
  worldAdmin1 as Gazetteer,
].map(enrichHistoricalAliases);
```

The `enrichHistoricalAliases` function only affects Swedish counties (it checks `HISTORICAL_LAN_ALIASES` by name) so it's safe to run on all gazetteers — it'll be a no-op for non-Swedish ones.

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/api/place-gazetteers/index.ts
git commit -m "feat: register all new gazetteers in bundled loader"
```

---

## Task 10: Extend Resolver Normalization

**Files:**
- Modify: `src/api/place-gazetteers/resolver.ts`
- Test: `tests/unit/gazetteers.test.ts`

The resolver's `normalize()` currently strips Swedish suffixes only. Add patterns for other countries.

- [ ] **Step 1: Write failing tests**

Add tests to `tests/unit/gazetteers.test.ts` (or create if needed):

```typescript
import { resolvePlace, loadGazetteers } from "../../src/api/place-gazetteers";
// ... or test normalize() directly if exported

describe("resolver normalization", () => {
  it("strips Danish suffixes", () => {
    // "Roskilde Sogn, Roskilde Kommune, Region Sjælland, Danmark"
    // should match "Roskilde" parish node
  });

  it("strips Norwegian suffixes", () => {
    // "Oslo kommune, Norge" should match "Oslo" municipality node
  });

  it("strips Finnish suffixes", () => {
    // "Helsingin kaupunki" should match "Helsinki"
  });

  it("strips English admin suffixes", () => {
    // "Chisago County, Minnesota" should match county node
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --grep "resolver normalization"
```

- [ ] **Step 3: Update normalize() in resolver.ts**

Change the `normalize` function from:

```typescript
function normalize(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*(församling|socken|kommun|stad|härad|län)$/i, "");
}
```

To:

```typescript
function normalize(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    // Swedish
    .replace(/\s*(församling|socken|kommun|stad|härad|län|distrikt|pastorat)$/i, "")
    // Danish
    .replace(/\s*(sogn|kirkedistrikt|kommune|region|amt|herred)$/i, "")
    // Norwegian
    .replace(/\s*(fylke|prestegjeld|sokn)$/i, "")
    // Finnish
    .replace(/\s*(kunta|kaupunki|kommun|maakunta|seurakunta|församling)$/i, "")
    // Icelandic
    .replace(/\s*(sýsla|hreppur|sveitarfélag|sókn)$/i, "")
    // English / North American
    .replace(/\s*(county|parish|township|borough|municipality|province|state|region)$/i, "")
    // Common prefixes
    .replace(/^(region|county of|province of|state of)\s+/i, "");
}
```

Note: The regex replacements are applied sequentially, each stripping one suffix at a time. Since we only expect one suffix per name, this is correct. The order doesn't matter because each regex is independent and anchored to the end (`$`).

Watch out for conflicts: "kommun" appears in both Swedish and Finnish. "församling" appears in both Swedish and Finnish. "region" appears in Danish and English. These duplicates are harmless — the regex just won't match twice on the same string.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --grep "resolver normalization"
npm test  # full suite to ensure no regressions
```

- [ ] **Step 5: Commit**

```bash
git add src/api/place-gazetteers/resolver.ts tests/unit/gazetteers.test.ts
git commit -m "feat: extend resolver normalization for Scandinavian and global suffixes"
```

---

## Task 11: Unit Tests for New Gazetteers

**Files:**
- Modify or create: `tests/unit/gazetteers.test.ts`

- [ ] **Step 1: Write tests verifying all gazetteers load correctly**

```typescript
import { getAllGazetteers } from "../../src/api/place-gazetteers";

describe("bundled gazetteers", () => {
  const gazetteers = getAllGazetteers();

  it("loads all 15 bundled gazetteers", () => {
    expect(gazetteers.length).toBe(15);
  });

  const expectedIds = [
    "sv-socknar", "sv-forsamlingar", "sv-orter", "sv-gardar", "sv-kyrkor", "sv-sockenstad-boundaries",
    "dk-sogne", "dk-sogne-dawa",
    "no-kommuner",
    "fi-kunnat",
    "is-sveitarfelog",
    "us-immigration-states",
    "ca-provinces",
    "world-countries",
    "world-admin1",
  ];

  for (const id of expectedIds) {
    it("includes " + id, () => {
      const gaz = gazetteers.find(g => g.id === id);
      expect(gaz).toBeDefined();
      expect(gaz!.root).toBeDefined();
      expect(gaz!.root.name).toBeTruthy();
      expect(gaz!.root.children).toBeDefined();
      expect(gaz!.root.children!.length).toBeGreaterThan(0);
    });
  }

  it("world-countries has ~250 countries", () => {
    const wc = gazetteers.find(g => g.id === "world-countries")!;
    expect(wc.root.children!.length).toBeGreaterThan(180);
    expect(wc.root.children!.length).toBeLessThan(300);
  });

  it("us-immigration-states has 9 states", () => {
    const us = gazetteers.find(g => g.id === "us-immigration-states")!;
    expect(us.root.children!.length).toBe(9);
  });

  it("ca-provinces has 5 provinces", () => {
    const ca = gazetteers.find(g => g.id === "ca-provinces")!;
    expect(ca.root.children!.length).toBe(5);
  });
});
```

- [ ] **Step 2: Write resolution tests for cross-country matching**

```typescript
import { resolvePlace } from "../../src/api/place-gazetteers/resolver";

describe("cross-country place resolution", () => {
  const gazetteers = getAllGazetteers();

  it("resolves a Danish parish", () => {
    const result = resolvePlace("Roskilde, Danmark", gazetteers);
    expect(result).not.toBeNull();
    expect(result!.matchedPath).toContain("Danmark");
  });

  it("resolves a Norwegian municipality", () => {
    const result = resolvePlace("Oslo, Norge", gazetteers);
    expect(result).not.toBeNull();
  });

  it("resolves a US county", () => {
    const result = resolvePlace("Chisago County, Minnesota, United States", gazetteers);
    expect(result).not.toBeNull();
    expect(result!.matchedPath).toContain("United States");
  });

  it("resolves a country by ISO code", () => {
    const result = resolvePlace("SE", gazetteers);
    expect(result).not.toBeNull();
  });
});
```

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: All pass, including new gazetteer tests.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/gazetteers.test.ts
git commit -m "test: add unit tests for all bundled gazetteers and cross-country resolution"
```

---

## Task 12: Update Documentation and CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` — update gazetteer list in File Map and data file inventory
- Modify: `README.md` — mention expanded gazetteer coverage
- Modify: `docs/PLAN.md` — mark gazetteer expansion milestone as done

- [ ] **Step 1: Update CLAUDE.md**

In the File Map section, update the `place-gazetteers/data/` listing to include all new files. Update the bundled gazetteer count from 6 to 15.

- [ ] **Step 2: Update README.md**

Add a note about global place resolution coverage in the features section.

- [ ] **Step 3: Update docs/PLAN.md**

Add a milestone entry for gazetteer expansion and mark it done.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md README.md docs/PLAN.md
git commit -m "docs: update documentation for expanded gazetteer coverage"
```

---

## Task 13: Final Integration Verification

- [ ] **Step 1: Run lint**

```bash
npm run lint
```

Expected: 0 errors.

- [ ] **Step 2: Run full test suite**

```bash
npm test
```

Expected: All tests pass including new gazetteer tests.

- [ ] **Step 3: Verify bundle size is reasonable**

```bash
du -sh src/api/place-gazetteers/data/
ls -la src/api/place-gazetteers/data/*.json | awk "{total += \\} END {print total/1048576 \" MB total\"}"
```

Expected: Total data directory ~20-25 MB (12 MB existing + ~8-12 MB new). This is acceptable for a desktop app.

- [ ] **Step 4: Smoke test in the app**

```bash
npm start
```

Navigate to Settings > Gazetteers. Verify all 15 gazetteers appear in the list. Enable a few new ones. Navigate to a place and verify resolution works.

- [ ] **Step 5: Version bump and final commit**

```bash
# Bump minor version in package.json
npm version minor --no-git-tag-version
git add -A
git commit -m "feat(vX.Y.0): expand gazetteers to global coverage — Scandinavia, North America, world"
```
