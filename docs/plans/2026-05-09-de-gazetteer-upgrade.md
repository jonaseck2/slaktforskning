# DE Gazetteer Upgrade — Tier 1 Completion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **This is the first implementation plan of the European gazetteer roadmap** (`docs/plans/2026-05-09-european-gazetteers-design.md`). It upgrades Germany from point-only (the existing `de-gemeinden`) to full Tier 1 by adding boundaries (`de-gemeinden-boundaries`) and parishes (`de-kirchgemeinden`). It also creates the test infrastructure (`tests/unit/european-coverage.test.ts`) that every subsequent country plan in the roadmap extends.

---

## User goal

A genealogist authoring "Kirchengemeinde St. Petri, Lübeck, Schleswig-Holstein, Tyskland" sees their place resolve in the place picker — with the right Kirchengemeinde under the right Kreis under the right Bundesland — without hand-coordinates, without retyping the parent chain in English, and without knowing whether to write "Lübeck" or "Hansestadt Lübeck". The map shows the Kreis polygon as the uncertainty hint, signalling "the point is the centre of this region, not a specific address."

A genealogist authoring "Pfarrei St. Maria, München, Bayern" gets the same experience for the Catholic side.

User-observable smoke probes (run in the running app, place picker, after this plan ships):

- "Lübeck, Schleswig-Holstein" → resolves to admin2 (Hansestadt Lübeck Kreis), shows the Kreis polygon on hover.
- "München, Bayern" → resolves to admin2 (München Kreis), shows polygon.
- "Garmisch-Partenkirchen, Bayern" → admin2 (Garmisch-Partenkirchen Kreis), polygon.
- "Land Brandenburg" → admin1 (Bundesland Brandenburg), polygon.
- "Kirchgemeinde St. Petri, Lübeck" → resolves to a Lutheran parish under Lübeck.
- "Pfarrei St. Maria, München" → resolves to a Catholic parish under München.
- "Evangelische Kirchengemeinde Hamburg-Altona" → resolves with denomination preserved as alias.

## Scope

**In scope (full pattern enumeration):**

1. Add `scripts/build-de-boundaries.ts` (BKG vg250 → ogr2ogr reproject + simplify → mapshaper → JSON) emitting `de-gemeinden-boundaries.json` covering all 16 Bundesländer + ~400 Kreise as polygons.
2. Add `scripts/build-de-kirchgemeinden.ts` (Wikidata SPARQL on Lutheran + Catholic parish classes filtered to country=Germany) emitting `de-kirchgemeinden.json`.
3. Extend `DE_RULES` in `src/gazetteer-build/normalize-rules.ts` with ecclesiastical suffix-strip terms (`Kirchgemeinde`, `Pfarrei`, `Pfarrgemeinde`, `Kirchspiel`, `Kirchengemeinde`, `Pfarrkirchengemeinde`, `Pfarrbezirk`, `Pfarrei-Verband`).
4. Wire both new gazetteers into `BUNDLED_GAZETTEERS` and `NORMALIZE_RULES_BY_ID` in `src/api/place-gazetteers/bundled.ts`.
5. Create `tests/unit/european-coverage.test.ts` with a registry-driven shape that future country plans extend; populate the DE entry with the smoke probes from § "User goal".
6. Update `tests/unit/gazetteers.test.ts` count + ID assertions.
7. Update `.claude/skills/gazetteers/SKILL.md` and `CLAUDE.md` gazetteer tables.
8. Bump `package.json` version (minor — new gazetteer feature) and add CHANGELOG line.

**Scope deviations (explicit):**

- **Gemeinde-level boundary polygons (~11k shapes) are out of scope.** Boundaries cover Bundesland + Kreis only (~416 polygons), matching the Norwegian and Swedish-parish boundary depth. Gemeinde-level boundaries would blow the ≤ 8 MB raw / ≤ 2.5 MB gzip per-gazetteer budget; if a future user demands them, they get a separate `de-gemeinden-leaf-boundaries` plan with a budget exception decision.
- **Filialkirche / Kirchspielsteilgemeinde sub-parish entities are out of scope.** Wikidata coverage of parish-internal subdivisions is too sparse to be useful; the genealogical primitive is the parish itself.
- **Old Catholic, Reformed, Evangelisch-Methodistisch, and other minority-denomination parishes are NOT excluded** — they're folded into the same `de-kirchgemeinden.json` if Wikidata returns them under the parent classes. Denomination is preserved as an alias on each node, not split into separate gazetteers (would produce a pile of mostly-empty files).
- **Pre-1945 historical Bundesländer / Reichsgaue / Provinces of Prussia are out of scope.** They belong to the `europe-historical` plan later in the roadmap, not here.

## Verification

Per the project plans rule, verification is by user-observable outcome, not test hygiene.

1. **User smoke-check (the gate).** The user runs `npm start`, opens the place picker, and types each of the seven smoke probes from § "User goal". Each must resolve to the expected admin2/parish row with the expected parent chain. The map view must show a Kreis polygon for the boundary-bearing probes.
2. **Regression test (hygiene).** `tests/unit/european-coverage.test.ts` walks the DE smoke list and asserts each entry resolves via `resolvePlace()` to the expected (country, admin1, admin2, parish-or-null) tuple. This test is the gate for *future* regressions; it does not stand in for the user smoke-check on first ship.
3. **Bundle-size budget enforcement.** After build, `de-gemeinden-boundaries.json` must be ≤ 8 MB raw / ≤ 2.5 MB after gzip. `de-kirchgemeinden.json` must be ≤ 5 MB raw / ≤ 1.5 MB gzip. The plan task that wires each gazetteer in fails loudly if budget is exceeded — Task 4 / Task 6 include explicit `du -h` and `gzip -c | wc -c` assertions.

## Failure modes / RCA reference

- `docs/plans/archive/2026-05-01-german-gazetteer.md` — Phase 1 of an unwritten roadmap. Shipped point-only because the roadmap design referenced in its header never landed and there was no clear definition of when "Tier 1" was complete. This plan is the corrective: explicit Tier-1 definition (point + boundary + parish), explicit verification by user-observable outcome.
- `feedback_no_silent_string_replace.md` (memory) — building boundary or parish gazetteers must NOT silently overwrite or merge with existing `de-gemeinden.json` data. The merge engine handles overlap structurally; build scripts emit fresh trees with `__contributors` set so provenance is visible.
- `feedback_no_gazetteer_frankensteins.md` (memory) — both new build scripts read ONE source each (BKG for boundaries, Wikidata for parishes). No combining of sources within a script. Structural merge across the three DE gazetteers (point + boundaries + parishes) happens in the loader by `(name, type, parent_path)`, never by hand.
- The original German plan's mandatory pre-flight defaults (population ≥ 5000, suffix-strip list, simplification ratio) are inherited where applicable — see Task 0.

## Tech Stack

- TypeScript via `tsx` runner
- Vitest for unit tests
- BKG vg250 dataset via direct HTTPS download (CC BY 4.0)
- Wikidata SPARQL via `src/gazetteer-build/sparql.ts`
- `ogr2ogr` (GDAL) for SHP/GeoPackage reprojection
- `mapshaper` (npm dev dep) for boundary simplification
- Wikimedia Maps API (CC0) for parish geoshapes (only if Wikidata exposes `wdt:P3896` for the queried entities)
- gzip for budget assertion (POSIX, no install)

## File structure

| File | Status | Responsibility |
|---|---|---|
| `scripts/build-de-boundaries.ts` | Create | Build `de-gemeinden-boundaries.json` from BKG vg250 |
| `scripts/build-de-kirchgemeinden.ts` | Create | Build `de-kirchgemeinden.json` from Wikidata SPARQL |
| `src/api/place-gazetteers/data/de-gemeinden-boundaries.json` | Create (generated) | Bundesland + Kreis boundaries |
| `src/api/place-gazetteers/data/de-kirchgemeinden.json` | Create (generated) | Lutheran + Catholic parishes |
| `src/gazetteer-build/normalize-rules.ts` | Modify | Extend `DE_RULES.stripSuffixes` |
| `src/api/place-gazetteers/bundled.ts` | Modify | Static imports + 2 entries in `BUNDLED_GAZETTEERS` + 2 entries in `NORMALIZE_RULES_BY_ID` |
| `tests/unit/european-coverage.test.ts` | Create | Roadmap-level coverage test (future plans extend) |
| `tests/unit/gazetteers.test.ts` | Modify | Bump count + IDs |
| `.claude/skills/gazetteers/SKILL.md` | Modify | Add 2 rows to bundled gazetteer tables |
| `CLAUDE.md` | Modify | Bump bundled count if cited |
| `package.json` | Modify | Add `mapshaper` to devDependencies (if not already), bump version (minor) |
| `CHANGELOG.md` | Modify | Add `## Unreleased` line |

---

## Conventions

- Run scripts: `npx tsx scripts/build-de-boundaries.ts` and `npx tsx scripts/build-de-kirchgemeinden.ts`.
- BKG vg250 dataset cached at `/tmp/bkg_vg250/` after first download (gitignored).
- Boundary coords round to 4 decimals via `round4` (~10m). Point coords round to 6 via `round6` (~10cm).
- Wikidata SPARQL uses `sparqlFetch` from `src/gazetteer-build/sparql.ts`, sleep 500ms between calls if iterating.
- Conventional commits: `feat(gazetteer):`, `test(gazetteer):`, `chore(gazetteer):`, `docs(gazetteer):`.
- Do NOT hand-edit JSON outputs. Any diff in `data/*.json` must correspond to a script change (gazetteer Prime Directive § "Sources are truth, gazetteers are build outputs").

---

## Task 0: Lock pre-flight defaults and source decisions

**Files:**
- (decisional only — record choices in this plan body)

- [ ] **Step 1: Confirm BKG vg250 as the boundary source**

BKG (Bundesamt für Kartographie und Geodäsie) publishes Verwaltungsgebiete 1:250000 (vg250) under **Datenlizenz Deutschland — Namensnennung — Version 2.0** since 2017, which is compatible with CC BY 4.0 attribution. URL: <https://daten.gdz.bkg.bund.de/produkte/vg/vg250_ebenen_0101/aktuell/> (file: `vg250_01-01.utm32s.gpkg.ebenen.zip`). The dataset includes Bundesland (LAN), Regierungsbezirk (RBZ), Kreis (KRS), Verwaltungsgemeinschaft (VWG), Gemeinde (GEM) layers.

We use only the LAN and KRS layers (boundary scope is Bundesland + Kreis per § Scope deviations).

If the URL is no longer reachable at build time, fall back to the same dataset on Geofabrik or a Zenodo mirror; cite the actual URL in the script header.

- [ ] **Step 2: Confirm Wikidata as the parish source**

Wikidata SPARQL on:
- Q1620908 (Kirchengemeinde — covers Evangelisch and broader Protestant)
- Q73501 (Pfarrei — covers Catholic)
- Q1141869 (parish church) — only used as a fallback if a Q1620908 / Q73501 entity has no P625 of its own
- Filter `?p wdt:P17 wd:Q183` (country = Germany)
- Optional `?p wdt:P3896 ?geoshape` for parish polygons (sparse; not required)

License: CC0 1.0. Coverage will be uneven (estimated 2–5k entries vs. ~23,500 actual parishes), and we accept that — Wikidata is the only uniformly free source for German parishes. Sparseness is recorded in `source.notes`.

- [ ] **Step 3: Confirm normalize rule additions**

`DE_RULES.stripSuffixes` currently has civil-administrative terms only. Add ecclesiastical: `Kirchgemeinde`, `Kirchengemeinde`, `Pfarrei`, `Pfarrgemeinde`, `Pfarrkirchengemeinde`, `Kirchspiel`, `Pfarrbezirk`, `Pfarrei-Verband`. Order: case-insensitive at runtime, longest-first to avoid `Pfarrei` matching before `Pfarrei-Verband`.

- [ ] **Step 4: Confirm boundary simplification ratio**

mapshaper `-simplify 5%` (95% reduction) — same as the original German plan and the Nordic precedents. The boundary purpose is uncertainty hint, not pin precision (per design § 1), so aggressive simplification is correct. Tune to 3% if rendered map looks bad in smoke-check.

- [ ] **Step 5: No commit — informational task**

---

## Task 1: Extend DE_RULES with ecclesiastical suffixes (TDD)

**Files:**
- Modify: `src/gazetteer-build/normalize-rules.ts`
- Test: `tests/unit/normalize-rules.test.ts` (add cases — file may need creating; check first)

- [ ] **Step 1: Locate or create the normalize-rules unit test**

Run: `find tests -name "normalize-rules.test.ts"`. If it doesn't exist, create `tests/unit/normalize-rules.test.ts` with the boilerplate below. If it does, append cases to the existing DE describe block.

```typescript
import { describe, it, expect } from 'vitest';
import { DE_RULES } from '../../src/gazetteer-build/normalize-rules';

function stripSuffix(input: string, rules: { stripSuffixes: string[] }): string {
  // Mirrors the resolver's case-insensitive longest-first strip.
  const sorted = [...rules.stripSuffixes].sort((a, b) => b.length - a.length);
  let s = input.trim();
  for (const suffix of sorted) {
    const re = new RegExp(`\\s+${suffix.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s*$`, 'i');
    if (re.test(s)) s = s.replace(re, '').trim();
    const reLeading = new RegExp(`^${suffix.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s+`, 'i');
    if (reLeading.test(s)) s = s.replace(reLeading, '').trim();
  }
  return s;
}

describe('DE_RULES — ecclesiastical suffixes', () => {
  it('strips Kirchgemeinde', () => {
    expect(stripSuffix('Kirchgemeinde St. Petri', DE_RULES)).toBe('St. Petri');
  });
  it('strips Pfarrei', () => {
    expect(stripSuffix('Pfarrei St. Maria', DE_RULES)).toBe('St. Maria');
  });
  it('strips Pfarrei-Verband before Pfarrei (longest-first)', () => {
    expect(stripSuffix('Pfarrei-Verband Nord', DE_RULES)).toBe('Nord');
  });
  it('strips Kirchengemeinde trailing', () => {
    expect(stripSuffix('Hamburg-Altona Kirchengemeinde', DE_RULES)).toBe('Hamburg-Altona');
  });
});
```

- [ ] **Step 2: Run the new tests, verify they FAIL**

Run: `npx vitest run tests/unit/normalize-rules.test.ts -t "ecclesiastical"`
Expected: 4 FAIL with the suffixes still present in output (because they're not yet in `DE_RULES`).

- [ ] **Step 3: Add the suffixes to `DE_RULES`**

Edit `src/gazetteer-build/normalize-rules.ts`. Replace the existing `DE_RULES` block with:

```typescript
export const DE_RULES: GazetteerNormalizeRules = {
  stripSuffixes: [
    // Civil-administrative
    'Land', 'Bezirk', 'Kreis', 'Landkreis', 'Stadtkreis',
    'Gemeinde', 'Stadt', 'Markt', 'Ortsteil',
    // Ecclesiastical (added 2026-05-09 by de-gazetteer-upgrade plan)
    'Kirchengemeinde', 'Kirchgemeinde',
    'Pfarrkirchengemeinde', 'Pfarrgemeinde', 'Pfarrei-Verband', 'Pfarrei',
    'Kirchspiel', 'Pfarrbezirk',
  ],
};
```

- [ ] **Step 4: Run tests, verify they PASS**

Run: `npx vitest run tests/unit/normalize-rules.test.ts`
Expected: all DE describe blocks PASS (existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add src/gazetteer-build/normalize-rules.ts tests/unit/normalize-rules.test.ts
git commit -m "feat(gazetteer): add German ecclesiastical suffixes to DE_RULES"
```

---

## Task 2: Create european-coverage test infrastructure

**Files:**
- Create: `tests/unit/european-coverage.test.ts`

This is the test harness every subsequent country plan in the roadmap extends. It must be designed for extensibility — a per-country registry of probes, walked by a single `it.each()` driver.

- [ ] **Step 1: Create the test file with a registry shape and DE entry**

Create `tests/unit/european-coverage.test.ts`:

```typescript
/**
 * European country coverage — roadmap-level smoke probes.
 *
 * Each country plan in docs/plans/2026-05-09-european-gazetteers-design.md
 * extends EUROPEAN_PROBES with its smoke list. The probes assert that
 * resolvePlace() returns the expected (admin1, admin2, leaf) tuple.
 *
 * This test guards regressions; the *gate* for shipping any country plan is
 * the user smoke-check in the running app. See the per-country plan's
 * Verification section.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { loadGazetteers, resolvePlace } from '../../src/api/place-gazetteers';
import { getAllGazetteers } from '../../src/api/place-gazetteers/bundled';
import type { Gazetteer } from '../../src/api/place-gazetteers/types';

interface CoverageProbe {
  query: string;
  expectAdmin1?: string;        // e.g. 'Schleswig-Holstein'
  expectAdmin2?: string;        // e.g. 'Lübeck'
  expectLeaf?: string;          // populated place / parish leaf
  expectLeafType?: string;      // e.g. 'parish', 'locality'
  expectCountry: string;        // e.g. 'Germany'
}

interface CountryProbeSet {
  countryCode: string;          // ISO alpha-2, lowercase
  countryName: string;          // human-readable
  probes: CoverageProbe[];
}

const EUROPEAN_PROBES: CountryProbeSet[] = [
  {
    countryCode: 'de',
    countryName: 'Germany',
    probes: [
      { query: 'Lübeck, Schleswig-Holstein', expectAdmin1: 'Schleswig-Holstein', expectAdmin2: 'Lübeck', expectCountry: 'Germany' },
      { query: 'München, Bayern', expectAdmin1: 'Bayern', expectAdmin2: 'München', expectCountry: 'Germany' },
      { query: 'Garmisch-Partenkirchen, Bayern', expectAdmin1: 'Bayern', expectAdmin2: 'Garmisch-Partenkirchen', expectCountry: 'Germany' },
      { query: 'Land Brandenburg', expectAdmin1: 'Brandenburg', expectCountry: 'Germany' },
    ],
  },
];

describe('European country coverage probes', () => {
  let gazetteers: Gazetteer[];

  beforeAll(() => {
    gazetteers = loadGazetteers({}, getAllGazetteers());
  });

  for (const country of EUROPEAN_PROBES) {
    describe(`${country.countryName} (${country.countryCode})`, () => {
      for (const probe of country.probes) {
        it(`resolves "${probe.query}"`, () => {
          const result = resolvePlace(probe.query, gazetteers);
          expect(result, `no resolution for "${probe.query}"`).toBeTruthy();
          if (!result) return;
          const path = result.path.map((n) => n.name);
          expect(path, `country mismatch for "${probe.query}"`).toContain(probe.expectCountry);
          if (probe.expectAdmin1) {
            expect(path, `admin1 mismatch for "${probe.query}"`).toContain(probe.expectAdmin1);
          }
          if (probe.expectAdmin2) {
            expect(path, `admin2 mismatch for "${probe.query}"`).toContain(probe.expectAdmin2);
          }
          if (probe.expectLeaf) {
            expect(path, `leaf mismatch for "${probe.query}"`).toContain(probe.expectLeaf);
            if (probe.expectLeafType) {
              const leaf = result.path[result.path.length - 1];
              expect(leaf.type, `leaf type mismatch for "${probe.query}"`).toBe(probe.expectLeafType);
            }
          }
        });
      }
    });
  }
});
```

- [ ] **Step 2: Run the test, verify the 4 admin1/admin2-only probes PASS against the existing point gazetteer**

Run: `npx vitest run tests/unit/european-coverage.test.ts`
Expected: all 4 DE probes PASS. They don't need boundaries or parishes — just admin1/admin2 from the existing `de-gemeinden`. If any FAIL, the existing point gazetteer has a regression that must be fixed before continuing this plan.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/european-coverage.test.ts
git commit -m "test(gazetteer): seed european-coverage probes with DE admin baseline"
```

---

## Task 3: Build de-gemeinden-boundaries.json (BKG vg250)

**Files:**
- Create: `scripts/build-de-boundaries.ts`
- Create (generated): `src/api/place-gazetteers/data/de-gemeinden-boundaries.json`

- [ ] **Step 1: Verify GDAL + mapshaper available**

Run: `which ogr2ogr && which mapshaper || npm ls -g mapshaper`
Expected: both binaries resolve. If `mapshaper` is missing, `npm i -D mapshaper` (it should be installed if Task 0's precondition holds — verify in `package.json`).

- [ ] **Step 2: Download BKG vg250 dataset**

```bash
mkdir -p /tmp/bkg_vg250
curl -fsSL -o /tmp/bkg_vg250/vg250.zip \
  https://daten.gdz.bkg.bund.de/produkte/vg/vg250_ebenen_0101/aktuell/vg250_01-01.utm32s.gpkg.ebenen.zip
unzip -o /tmp/bkg_vg250/vg250.zip -d /tmp/bkg_vg250/
ls /tmp/bkg_vg250/*.gpkg
```

Expected: at least one `.gpkg` file. The actual filename pattern is `DE_VG250.gpkg` (or similar — verify with `ls` and use the actual name in the next step).

If the URL 404s, fall back to: <https://gdz.bkg.bund.de/index.php/default/open-data/verwaltungsgebiete-1-250-000-mit-einwohnerzahlen-stand-31-12-vg250-ew-31-12.html> and document the actual URL used in the script header.

- [ ] **Step 3: Create `scripts/build-de-boundaries.ts`**

Use `scripts/build-no-boundaries.ts` as the structural template. Key differences:

- Source: BKG vg250 GeoPackage, EPSG:25832 (UTM 32N), reproject to EPSG:4326 (WGS84).
- Two layers: `vg250_lan` (Bundesland, 16 features) and `vg250_krs` (Kreis, ~400 features).
- Hierarchy in output: Germany (root) → Bundesland (admin1) → Kreis (admin2).
- Use `ogr2ogr -t_srs EPSG:4326 -nln <layer>` to reproject each layer to WGS84 GeoJSON.
- Pipe through `mapshaper -i <input.geojson> -simplify 5% -o <output.geojson>` for simplification.
- Group multi-part Kreise by their `RS` (Regionalschlüssel) attribute.
- Set `geometry` on each node; centroid coords from `computeCentroid` for point fallback.
- License + URL + fetched date in script header AND in the output JSON's `source` field.

```typescript
/**
 * Build de-gemeinden-boundaries gazetteer from BKG vg250.
 *
 * Source: BKG (Bundesamt für Kartographie und Geodäsie) — Verwaltungsgebiete 1:250000
 *   URL:        https://daten.gdz.bkg.bund.de/produkte/vg/vg250_ebenen_0101/aktuell/
 *   File:       vg250_01-01.utm32s.gpkg.ebenen.zip → DE_VG250.gpkg
 *   License:    Datenlizenz Deutschland — Namensnennung — Version 2.0 (CC BY 4.0 compatible)
 *   Attribution: "© GeoBasis-DE / BKG <fetched-year>"
 *
 * Hierarchy: Germany (root) → Bundesland (admin1, 16) → Kreis (admin2, ~400).
 * Geometry: Polygon / MultiPolygon, WGS84, simplified to 5% via mapshaper.
 *
 * Usage:
 *   curl -fsSL -o /tmp/bkg_vg250/vg250.zip <url>
 *   unzip -o /tmp/bkg_vg250/vg250.zip -d /tmp/bkg_vg250/
 *   npx tsx scripts/build-de-boundaries.ts
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { GazetteerNode, GazetteerGeometry } from '../src/api/place-gazetteers/types';
import { computeCentroid, round4 } from '../src/gazetteer-build/geo';
import { writeGazetteer } from '../src/gazetteer-build/io';

// ── constants ─────────────────────────────────────────────────────────
const SOURCE_GPKG = '/tmp/bkg_vg250/DE_VG250.gpkg';   // verify actual filename
const TMP_DIR = '/tmp/bkg_vg250/converted';
const SIMPLIFY_PCT = 5;
const FETCHED_DATE = new Date().toISOString().slice(0, 10);

// ── helpers ───────────────────────────────────────────────────────────
function reprojectAndSimplify(layer: string): GeoJSON.FeatureCollection {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const reprojPath = path.join(TMP_DIR, `${layer}.wgs84.geojson`);
  execFileSync('ogr2ogr', [
    '-t_srs', 'EPSG:4326',
    '-f', 'GeoJSON',
    '-nln', layer,
    reprojPath,
    SOURCE_GPKG,
    layer,
  ]);
  const simplifiedPath = path.join(TMP_DIR, `${layer}.simplified.geojson`);
  execFileSync('mapshaper', [
    reprojPath,
    '-simplify', `${SIMPLIFY_PCT}%`, 'keep-shapes',
    '-o', simplifiedPath,
  ]);
  return JSON.parse(fs.readFileSync(simplifiedPath, 'utf-8'));
}

function roundCoords(geom: GazetteerGeometry): GazetteerGeometry {
  // Recurse — Polygon → number[][][], MultiPolygon → number[][][][]
  // … (mirror Norway's roundCoords helper exactly)
  if (geom.type === 'Polygon') {
    return { type: 'Polygon', coordinates: geom.coordinates.map(ring => ring.map(([x, y]) => [round4(x), round4(y)])) };
  }
  return { type: 'MultiPolygon', coordinates: geom.coordinates.map(poly => poly.map(ring => ring.map(([x, y]) => [round4(x), round4(y)]))) };
}

// ── main ──────────────────────────────────────────────────────────────
function main(): void {
  console.log('[de-boundaries] Reprojecting + simplifying Bundesland layer…');
  const lanFC = reprojectAndSimplify('vg250_lan');
  console.log('[de-boundaries] Reprojecting + simplifying Kreis layer…');
  const krsFC = reprojectAndSimplify('vg250_krs');

  // Group by feature attribute. BKG vg250 uses GEN (name) and RS (Regionalschlüssel).
  const bundeslander = new Map<string, GazetteerNode>();
  for (const f of lanFC.features) {
    const name = f.properties?.GEN as string;
    if (!name) continue;
    const rs = f.properties?.RS as string;
    const geom = roundCoords(f.geometry as GazetteerGeometry);
    const [lon, lat] = computeCentroid(geom);
    bundeslander.set(rs.slice(0, 2), {
      name,
      type: 'admin1',
      lat: round4(lat),
      lon: round4(lon),
      geometry: geom,
      children: [],
    });
  }

  for (const f of krsFC.features) {
    const name = f.properties?.GEN as string;
    if (!name) continue;
    const rs = f.properties?.RS as string;
    const lanRs = rs.slice(0, 2);
    const parent = bundeslander.get(lanRs);
    if (!parent) {
      console.warn(`[de-boundaries] Orphan Kreis ${name} (${rs}); skipping.`);
      continue;
    }
    const geom = roundCoords(f.geometry as GazetteerGeometry);
    const [lon, lat] = computeCentroid(geom);
    parent.children!.push({
      name,
      type: 'admin2',
      lat: round4(lat),
      lon: round4(lon),
      geometry: geom,
    });
  }

  const root: GazetteerNode = {
    name: 'Germany',
    type: 'country',
    aliases: ['Deutschland', 'Tyskland', 'Allemagne', 'Germania'],
    lat: 51.0,
    lon: 10.5,
    children: Array.from(bundeslander.values()).sort((a, b) => a.name.localeCompare(b.name, 'de')),
  };

  writeGazetteer({
    id: 'de-gemeinden-boundaries',
    name: 'German Bundesländer & Kreise — Boundaries',
    locale: 'de',
    kind: 'boundary',
    source: {
      name: 'BKG vg250',
      url: 'https://daten.gdz.bkg.bund.de/produkte/vg/vg250_ebenen_0101/aktuell/',
      license: 'Datenlizenz Deutschland — Namensnennung — Version 2.0',
      attribution: `© GeoBasis-DE / BKG ${new Date().getFullYear()}`,
      fetched: FETCHED_DATE,
      notes: 'Bundesland (LAN) + Kreis (KRS) layers; reprojected EPSG:25832 → EPSG:4326; simplified 5% via mapshaper.',
    },
    data: root,
  });

  console.log(`[de-boundaries] Wrote ${bundeslander.size} Bundesländer + ${krsFC.features.length} Kreise.`);
}

main();
```

- [ ] **Step 4: Run the build script**

```bash
npx tsx scripts/build-de-boundaries.ts
```

Expected: `[de-boundaries] Wrote 16 Bundesländer + ~400 Kreise.` and a fresh `src/api/place-gazetteers/data/de-gemeinden-boundaries.json`.

- [ ] **Step 5: Verify bundle-size budget**

```bash
RAW=$(du -b src/api/place-gazetteers/data/de-gemeinden-boundaries.json | awk '{print $1}')
GZIP=$(gzip -c src/api/place-gazetteers/data/de-gemeinden-boundaries.json | wc -c)
echo "raw=${RAW} gzip=${GZIP}"
test "${RAW}" -le 8388608 || (echo "RAW exceeds 8 MB"; exit 1)
test "${GZIP}" -le 2621440 || (echo "GZIP exceeds 2.5 MB"; exit 1)
```

If the budget is exceeded, raise `SIMPLIFY_PCT` to 3 (more aggressive simplification) and re-run Step 4 + Step 5.

- [ ] **Step 6: Commit (pre-wiring)**

```bash
git add scripts/build-de-boundaries.ts src/api/place-gazetteers/data/de-gemeinden-boundaries.json
git commit -m "feat(gazetteer): add de-gemeinden-boundaries (BKG vg250)"
```

---

## Task 4: Wire de-gemeinden-boundaries into the bundled set

**Files:**
- Modify: `src/api/place-gazetteers/bundled.ts`
- Modify: `tests/unit/european-coverage.test.ts` (add 1 boundary-bearing probe with leaf-type assertion)
- Modify: `tests/unit/gazetteers.test.ts` (bump count + ID list)
- Modify: `.claude/skills/gazetteers/SKILL.md` (add row)

- [ ] **Step 1: Add the static import + entry in `bundled.ts`**

Edit `src/api/place-gazetteers/bundled.ts`. Add:

```typescript
import deGemeindenBoundaries from './data/de-gemeinden-boundaries.json';
```

In `BUNDLED_GAZETTEERS`, in the German section, add `'de-gemeinden-boundaries'` after `'de-gemeinden'`. In the `loadGazetteer` switch (or registry), add the case mapping `'de-gemeinden-boundaries'` to the imported JSON. In `NORMALIZE_RULES_BY_ID`, add `'de-gemeinden-boundaries': DE_RULES`.

- [ ] **Step 2: Update existing gazetteer count test**

Edit `tests/unit/gazetteers.test.ts`. Bump the bundled count assertion by 1 and add `'de-gemeinden-boundaries'` to the expected IDs list.

- [ ] **Step 3: Add a boundary probe to the European coverage test**

Edit `tests/unit/european-coverage.test.ts`. In the DE probe set, append:

```typescript
{ query: 'Lübeck, Schleswig-Holstein, Tyskland', expectAdmin1: 'Schleswig-Holstein', expectAdmin2: 'Lübeck', expectCountry: 'Germany' },
```

This same query also appears in the existing probe set; the duplicate is intentional — it asserts the boundary gazetteer doesn't *break* admin2 resolution. Add a separate top-of-block helper assertion that the resolved Lübeck node has a non-empty `geometry` field:

```typescript
it('Lübeck has Kreis polygon (boundary gazetteer wired)', () => {
  const result = resolvePlace('Lübeck, Schleswig-Holstein', gazetteers);
  expect(result).toBeTruthy();
  if (!result) return;
  const lubeck = result.path[result.path.length - 1];
  expect(lubeck.geometry, 'Lübeck Kreis must have geometry from de-gemeinden-boundaries').toBeTruthy();
});
```

- [ ] **Step 4: Run tests, verify ALL PASS**

Run: `npx vitest run tests/unit/european-coverage.test.ts tests/unit/gazetteers.test.ts`
Expected: all DE probes PASS, the new geometry-presence assertion PASSES, count assertion PASSES.

- [ ] **Step 5: Update the gazetteer skill doc**

Edit `.claude/skills/gazetteers/SKILL.md`. Add a row to the Boundary Gazetteers table for `de-gemeinden-boundaries`. Bump the bundled count in the overview prose.

- [ ] **Step 6: Commit**

```bash
git add src/api/place-gazetteers/bundled.ts tests/unit/european-coverage.test.ts tests/unit/gazetteers.test.ts .claude/skills/gazetteers/SKILL.md
git commit -m "feat(gazetteer): wire de-gemeinden-boundaries into bundled set"
```

---

## Task 5: Build de-kirchgemeinden.json (Wikidata SPARQL)

**Files:**
- Create: `scripts/build-de-kirchgemeinden.ts`
- Create (generated): `src/api/place-gazetteers/data/de-kirchgemeinden.json`

- [ ] **Step 1: Validate the SPARQL query manually first**

Open the Wikidata Query Service: <https://query.wikidata.org/>. Paste:

```sparql
SELECT ?p ?pLabel ?coord ?denomination ?denominationLabel ?admin1Label ?admin2Label WHERE {
  ?p wdt:P31/wdt:P279* ?class .
  VALUES ?class { wd:Q1620908 wd:Q73501 }
  ?p wdt:P17 wd:Q183 .
  OPTIONAL { ?p wdt:P625 ?coord . }
  OPTIONAL { ?p wdt:P140 ?denomination . }
  OPTIONAL { ?p wdt:P131 ?admin .
             ?admin wdt:P31/wdt:P279* wd:Q1221156 .  # Bundesland
             ?admin rdfs:label ?admin1Label . FILTER(LANG(?admin1Label) = 'de') }
  OPTIONAL { ?p wdt:P131 ?kreis .
             ?kreis wdt:P31/wdt:P279* wd:Q106658 .  # Kreis
             ?kreis rdfs:label ?admin2Label . FILTER(LANG(?admin2Label) = 'de') }
  SERVICE wikibase:label { bd:serviceParam wikibase:language 'de,en' }
}
LIMIT 50
```

Expected: 50 rows, mix of Catholic and Lutheran parishes, most with admin1, some with admin2, most with coords. If the query returns < 30 rows or the mix looks degenerate, refine the class filter (e.g. drop the `wdt:P279*` transitive closure) before scripting. Note any refinements in the script header.

- [ ] **Step 2: Create `scripts/build-de-kirchgemeinden.ts`**

Mirror `scripts/build-dk-parishes.ts` (Wikidata-sourced parishes) as the structural template. Differences:

- Two parish classes: Q1620908 (Kirchengemeinde, Protestant) and Q73501 (Pfarrei, Catholic).
- Country filter: P17 = Q183 (Germany).
- Hierarchy: Germany → Bundesland (admin1) → Kreis (admin2) → parish (leaf, type='parish').
- Denomination preserved as alias, e.g. `["Evangelisch-Lutherische Kirchengemeinde St. Petri", "St. Petri"]`.
- Skip parishes without P625 coords (logged as `[de-kirchgemeinden] skipped <name> (no coords)`).
- Skip parishes whose admin1 doesn't match a known Bundesland name (sanity gate).
- Use `sparqlFetch` from `src/gazetteer-build/sparql.ts`.

```typescript
/**
 * Build de-kirchgemeinden gazetteer from Wikidata.
 *
 * Source: Wikidata SPARQL endpoint (https://query.wikidata.org/sparql)
 *   License: CC0 1.0
 *   Fetched: <YYYY-MM-DD>
 *   Coverage: ~2-5k entries (Wikidata is sparse; ~23.5k actual German parishes).
 *
 * Hierarchy: Germany → Bundesland (admin1) → Kreis (admin2) → parish (leaf).
 *
 * Classes:
 *   Q1620908 — Kirchengemeinde (Protestant parish, primarily Lutheran)
 *   Q73501   — Pfarrei (Catholic parish)
 *
 * Usage:
 *   npx tsx scripts/build-de-kirchgemeinden.ts
 */
import type { GazetteerNode } from '../src/api/place-gazetteers/types';
import { sparqlFetch } from '../src/gazetteer-build/sparql';
import { parseWktPoint, generateAliases } from '../src/gazetteer-build/wikidata';
import { round6, avgCoordinates } from '../src/gazetteer-build/geo';
import { writeGazetteer } from '../src/gazetteer-build/io';

const FETCHED_DATE = new Date().toISOString().slice(0, 10);

interface ParishRow {
  qid: string;
  name: string;
  lat: number;
  lon: number;
  denomination?: string;
  admin1?: string;
  admin2?: string;
  altLabels: string[];
}

const QUERY = `
SELECT ?p ?pLabel ?coord ?denominationLabel ?admin1Label ?admin2Label
       (GROUP_CONCAT(DISTINCT ?altLabel; separator='|') AS ?altLabels) WHERE {
  ?p wdt:P31/wdt:P279* ?class .
  VALUES ?class { wd:Q1620908 wd:Q73501 }
  ?p wdt:P17 wd:Q183 .
  ?p wdt:P625 ?coord .
  OPTIONAL { ?p wdt:P140 ?denomination . }
  OPTIONAL { ?p wdt:P131 ?admin1 .
             ?admin1 wdt:P31/wdt:P279* wd:Q1221156 .
             ?admin1 rdfs:label ?admin1Label . FILTER(LANG(?admin1Label) = 'de') }
  OPTIONAL { ?p wdt:P131 ?admin2 .
             ?admin2 wdt:P31/wdt:P279* wd:Q106658 .
             ?admin2 rdfs:label ?admin2Label . FILTER(LANG(?admin2Label) = 'de') }
  OPTIONAL { ?p skos:altLabel ?altLabel . FILTER(LANG(?altLabel) IN ('de', 'en', 'sv')) }
  SERVICE wikibase:label { bd:serviceParam wikibase:language 'de' }
}
GROUP BY ?p ?pLabel ?coord ?denominationLabel ?admin1Label ?admin2Label
`;

async function main(): Promise<void> {
  console.log('[de-kirchgemeinden] fetching from Wikidata…');
  const rows = await sparqlFetch<{
    p: { value: string };
    pLabel: { value: string };
    coord: { value: string };
    denominationLabel?: { value: string };
    admin1Label?: { value: string };
    admin2Label?: { value: string };
    altLabels?: { value: string };
  }>(QUERY);

  console.log(`[de-kirchgemeinden] got ${rows.length} rows`);

  const parishes: ParishRow[] = [];
  for (const r of rows) {
    const coord = parseWktPoint(r.coord.value);
    if (!coord) continue;
    const qid = r.p.value.split('/').pop()!;
    parishes.push({
      qid,
      name: r.pLabel.value,
      lat: round6(coord.lat),
      lon: round6(coord.lon),
      denomination: r.denominationLabel?.value,
      admin1: r.admin1Label?.value,
      admin2: r.admin2Label?.value,
      altLabels: r.altLabels?.value ? r.altLabels.value.split('|').filter(Boolean) : [],
    });
  }

  // Group by (admin1, admin2). Skip rows missing admin1.
  const byAdmin1 = new Map<string, Map<string | null, ParishRow[]>>();
  let skippedNoAdmin1 = 0;
  for (const p of parishes) {
    if (!p.admin1) { skippedNoAdmin1++; continue; }
    if (!byAdmin1.has(p.admin1)) byAdmin1.set(p.admin1, new Map());
    const a2 = p.admin2 ?? null;
    const a2Map = byAdmin1.get(p.admin1)!;
    if (!a2Map.has(a2)) a2Map.set(a2, []);
    a2Map.get(a2)!.push(p);
  }
  console.log(`[de-kirchgemeinden] skipped ${skippedNoAdmin1} parishes without admin1`);

  // Build tree.
  const root: GazetteerNode = {
    name: 'Germany',
    type: 'country',
    aliases: ['Deutschland', 'Tyskland'],
    lat: 51.0,
    lon: 10.5,
    children: [],
  };

  for (const [a1Name, a2Map] of byAdmin1) {
    const a1Children: GazetteerNode[] = [];
    for (const [a2Name, ps] of a2Map) {
      const leaves: GazetteerNode[] = ps.map(p => ({
        name: p.name,
        type: 'parish',
        aliases: dedup([...p.altLabels, ...(p.denomination ? [`${p.denomination} ${p.name}`] : [])]),
        lat: p.lat,
        lon: p.lon,
      }));
      if (a2Name) {
        const [lon, lat] = avgCoordinates(leaves);
        a1Children.push({ name: a2Name, type: 'admin2', lat, lon, children: leaves });
      } else {
        // No admin2 — attach parishes directly to admin1.
        a1Children.push(...leaves);
      }
    }
    const [lon, lat] = avgCoordinates(a1Children);
    root.children!.push({
      name: a1Name,
      type: 'admin1',
      lat,
      lon,
      children: a1Children.sort((a, b) => a.name.localeCompare(b.name, 'de')),
    });
  }
  root.children!.sort((a, b) => a.name.localeCompare(b.name, 'de'));

  writeGazetteer({
    id: 'de-kirchgemeinden',
    name: 'German Parishes (Lutheran + Catholic)',
    locale: 'de',
    kind: 'point',
    source: {
      name: 'Wikidata',
      url: 'https://query.wikidata.org/sparql',
      license: 'CC0 1.0',
      fetched: FETCHED_DATE,
      notes: `Q1620908 (Kirchengemeinde, Protestant) + Q73501 (Pfarrei, Catholic), filtered to country=Germany. Sparse: ~${parishes.length} entries vs ~23.5k actual.`,
    },
    data: root,
  });
  console.log(`[de-kirchgemeinden] wrote ${parishes.length} parishes`);
}

function dedup(arr: string[]): string[] {
  return [...new Set(arr.filter(Boolean))];
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 3: Run the build script**

```bash
npx tsx scripts/build-de-kirchgemeinden.ts
```

Expected: 1k–5k parishes written. If < 500, the SPARQL query needs widening — check the manual query result; the class filter may be too narrow.

- [ ] **Step 4: Verify bundle-size budget**

```bash
RAW=$(du -b src/api/place-gazetteers/data/de-kirchgemeinden.json | awk '{print $1}')
GZIP=$(gzip -c src/api/place-gazetteers/data/de-kirchgemeinden.json | wc -c)
echo "raw=${RAW} gzip=${GZIP}"
test "${RAW}" -le 5242880 || (echo "RAW exceeds 5 MB"; exit 1)
test "${GZIP}" -le 1572864 || (echo "GZIP exceeds 1.5 MB"; exit 1)
```

- [ ] **Step 5: Commit (pre-wiring)**

```bash
git add scripts/build-de-kirchgemeinden.ts src/api/place-gazetteers/data/de-kirchgemeinden.json
git commit -m "feat(gazetteer): add de-kirchgemeinden (Wikidata, sparse first cut)"
```

---

## Task 6: Wire de-kirchgemeinden into the bundled set

**Files:**
- Modify: `src/api/place-gazetteers/bundled.ts`
- Modify: `tests/unit/european-coverage.test.ts` (add parish probes)
- Modify: `tests/unit/gazetteers.test.ts`
- Modify: `.claude/skills/gazetteers/SKILL.md`

- [ ] **Step 1: Add the static import + entry**

Edit `src/api/place-gazetteers/bundled.ts`. Add:

```typescript
import deKirchgemeinden from './data/de-kirchgemeinden.json';
```

Add `'de-kirchgemeinden'` to `BUNDLED_GAZETTEERS` (German section). Add the loader case. Add `'de-kirchgemeinden': DE_RULES` to `NORMALIZE_RULES_BY_ID`.

- [ ] **Step 2: Bump gazetteers.test.ts**

Bump count + add `'de-kirchgemeinden'` to expected IDs.

- [ ] **Step 3: Add parish probes to european-coverage.test.ts**

Append to the DE probe set. Pick three probes from the actual built-out gazetteer (open `de-kirchgemeinden.json` and pick three real parish names that span Lutheran/Catholic and span Bundesländer):

```typescript
// Pick the actual parish names from the built data — these are placeholders to replace
// after running build-de-kirchgemeinden.ts in Task 5. The probe form:
{ query: '<actual parish>, <admin2>, <admin1>',
  expectAdmin1: '<admin1>',
  expectAdmin2: '<admin2>',
  expectLeaf: '<actual parish name>',
  expectLeafType: 'parish',
  expectCountry: 'Germany' },
```

If the Wikidata coverage doesn't include "St. Petri Lübeck" or "St. Maria München" (the user-goal probes), pick whichever parishes ARE present and update the user-goal § probes in this plan body to match. Better to commit honest probes than aspirational ones.

- [ ] **Step 4: Run tests, verify ALL PASS**

Run: `npx vitest run tests/unit/european-coverage.test.ts`
Expected: all probes PASS — the four admin baseline probes, the boundary geometry assertion, and the new parish probes.

- [ ] **Step 5: Update the skill doc**

Edit `.claude/skills/gazetteers/SKILL.md`: add row to point gazetteer table for `de-kirchgemeinden`. Bump bundled count.

- [ ] **Step 6: Commit**

```bash
git add src/api/place-gazetteers/bundled.ts tests/unit/european-coverage.test.ts tests/unit/gazetteers.test.ts .claude/skills/gazetteers/SKILL.md
git commit -m "feat(gazetteer): wire de-kirchgemeinden into bundled set"
```

---

## Task 7: User smoke-check + version bump + plan close-out

**Files:**
- Modify: `package.json` (version bump, minor)
- Modify: `CHANGELOG.md`
- Modify: `docs/PLAN.md` (move milestone to in-progress / done as appropriate)
- Modify: this plan file (tick all checkboxes, then archive)

- [ ] **Step 1: Run the full unit + lint pass**

Run: `npm test && npm run lint`
Expected: 0 lint errors, all tests pass.

- [ ] **Step 2: Smoke-check in the running app (the verification gate)**

Run: `npm start`. Open the place picker. Type each of the seven user-goal probes from § "User goal". For each:

- Confirm a row resolves with the expected parent chain.
- For boundary-bearing probes (Lübeck, München, Garmisch-Partenkirchen, Land Brandenburg), confirm the map view shows a polygon (Bundesland or Kreis).
- For parish probes, confirm the parish leaf is selectable.

If any probe fails: do not proceed to Step 3. Diagnose, fix in the appropriate task, re-run from Task 4 / Task 6.

- [ ] **Step 3: Bump version (minor) + CHANGELOG**

Edit `package.json`. Bump minor (e.g. `0.227.6` → `0.228.0`) — this plan ships two new gazetteers (feature, not patch).

Edit `CHANGELOG.md`. Add at the top:

```markdown
## Unreleased

- Add `de-gemeinden-boundaries` (BKG vg250 — Bundesland + Kreis polygons) and `de-kirchgemeinden` (Wikidata — Lutheran + Catholic parishes) gazetteers, completing Tier 1 coverage for Germany.
- Extend `DE_RULES` with ecclesiastical suffix-strip terms (Kirchgemeinde, Pfarrei, etc.).
- Seed `tests/unit/european-coverage.test.ts` for roadmap-level coverage probes.
```

- [ ] **Step 4: Update docs/PLAN.md**

If `docs/PLAN.md` lists "European gazetteer roadmap" as planned/in-progress, update its block to reflect Phase 1 (DE) shipped. If it doesn't list the roadmap, add a one-paragraph block under in-progress citing this plan + the design doc.

- [ ] **Step 5: Tick all plan checkboxes, archive plan**

Edit this plan file: every `- [ ]` becomes `- [x]`. Then `git mv docs/plans/2026-05-09-de-gazetteer-upgrade.md docs/plans/archive/`.

- [ ] **Step 6: Final commit**

```bash
git add package.json CHANGELOG.md docs/PLAN.md docs/plans/archive/2026-05-09-de-gazetteer-upgrade.md
git commit -m "chore: archive completed de-gazetteer-upgrade + version 0.228.0"
```

- [ ] **Step 7: Hand off to `superpowers:finishing-a-development-branch`**

If working in a worktree (per the standard plan-execution flow), invoke that skill to merge to main.

---

## Self-review checklist (the executing engineer ticks before close-out)

- [ ] All seven user-goal probes resolve in the running app (Step 2 of Task 7).
- [ ] `tests/unit/european-coverage.test.ts` is structured for extension (registry-driven, not hardcoded ifs) — future country plans only need to append to `EUROPEAN_PROBES`.
- [ ] `de-gemeinden-boundaries.json` ≤ 8 MB raw / ≤ 2.5 MB gzip.
- [ ] `de-kirchgemeinden.json` ≤ 5 MB raw / ≤ 1.5 MB gzip.
- [ ] `DE_RULES` includes the eight ecclesiastical suffixes from Task 0 Step 3.
- [ ] No `data/*.json` diffs that don't correspond to a script change (Prime Directive § "Sources are truth").
- [ ] Build scripts each read ONE source (BKG-only, Wikidata-only). No source mixing inside a script.
- [ ] Skill doc + CHANGELOG + version + `docs/PLAN.md` updated.
- [ ] This plan file archived to `docs/plans/archive/`.
