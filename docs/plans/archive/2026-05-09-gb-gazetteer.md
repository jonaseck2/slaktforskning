# GB Gazetteer — Tier 1

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Part of the European gazetteer roadmap** (`docs/plans/2026-05-09-european-gazetteers-design.md`). Cites the DE plan (`docs/plans/2026-05-09-de-gazetteer-upgrade.md`) as the reference for shared patterns: european-coverage test extension, gzip budget gate, mapshaper boundary simplification, license-audit step, the "wire + extend test + commit" rhythm of the final tasks.

---

## User goal

A British or Irish-diaspora genealogist authoring "Dirleton, East Lothian, Scotland", "St Mary's, Woodbridge, Suffolk, England", "Llanrwst, Conwy, Wales", or "Coleraine, County Londonderry, Northern Ireland" sees their place resolve to the right civil parish (or kirk session in Scotland) under the right ceremonial county under the right home nation, with a polygon hint on the map.

User-observable smoke probes:

- "Dirleton, East Lothian, Scotland" → admin1=Scotland, admin2=East Lothian, leaf=Dirleton (parish, kirk session).
- "Inveraray, Argyll and Bute, Scotland" → admin1=Scotland, admin2=Argyll and Bute, leaf=Inveraray.
- "Woodbridge, Suffolk, England" → admin1=England, admin2=Suffolk, leaf=Woodbridge (civil parish).
- "Llanrwst, Conwy, Wales" → admin1=Wales, admin2=Conwy, leaf=Llanrwst (community).
- "Coleraine, County Londonderry, Northern Ireland" → admin1=Northern Ireland, admin2=County Londonderry, leaf=Coleraine.
- "St Mary's, Woodbridge" → resolves to a Church of England parish under Woodbridge.
- "Skottland" → admin1=Scotland (via Swedish exonym from `lang-sv-*`).

## Scope

**In scope.** GB = England, Scotland, Wales, Northern Ireland (the UK as a single political entity, with the home nations as admin1).

| Primitive | Source | License |
|---|---|---|
| admin1 (home nation, 4) | ONS Open Geography Portal — CTRY (Countries) | OGL v3 (CC-BY-4.0 compatible) |
| admin2 — England | ONS — CTY (ceremonial counties, 48) | OGL v3 |
| admin2 — Scotland | NRS — Council Areas (32) | OGL v3 |
| admin2 — Wales | ONS — Principal Areas (22) | OGL v3 |
| admin2 — N. Ireland | NISRA — Counties (6 historical) + Council areas (11) | OGL v3 |
| Civil parishes (England) | ONS — PAR (10,449 civil parishes) | OGL v3 |
| Communities (Wales) | ONS — COMM (~860) | OGL v3 |
| Kirk session parishes (Scotland) | NRS — historical parishes pre-1975 | OGL v3 |
| C of E ecclesiastical parishes | Church of England — Parishes (CofE Open Data) | CC BY 4.0 |
| Localities | GeoNames GB.zip | CC BY 4.0 |
| Boundaries | ONS Open Geography Portal — same layers as admin2 + parish | OGL v3 |

**Two gazetteers will ship from this plan:**

1. `gb-civil-divisions` — country → home nation → ceremonial county / council area → civil parish / community / NRS parish, with polygons.
2. `gb-cofe-parishes` — country → diocese → archdeaconry → ecclesiastical parish, point only. (CofE structure parallels but does not match civil parishes — keeping them separate respects the contract's "scripts produce clean output" rule.)

**Scope deviations:**

- **Townlands** are out of scope here. Townlands are the genealogical sub-parish primitive in (Northern) Ireland and exist below civil parish; they belong in the IE plan because the same townland data covers the whole island.
- **Catholic parishes in Northern Ireland** are out of scope here; the IE plan handles Catholic-parish coverage island-wide.
- **Methodist / Baptist / other denomination parishes** in any home nation are excluded — no uniform open data, would require per-denomination scripts that don't carry their weight.
- **Hundreds and Wapentakes** (pre-1889 administrative divisions in England) are historical — go to `europe-historical` if covered at all.

## Verification

1. **User smoke-check (gate).** Run `npm start`, place picker, type the seven probes from § "User goal". Each must resolve.
2. **Regression test.** Append GB probe set to `tests/unit/european-coverage.test.ts` (the registry created in the DE plan).
3. **Bundle budget per design § 5.3:** `gb-civil-divisions` ≤ 8 MB raw / 2.5 MB gzip; `gb-cofe-parishes` ≤ 5 MB raw / 1.5 MB gzip.

## Failure modes / RCA

- The CofE Open Data portal has historically published patchy schemas; if a query returns < 12,000 parishes, it's degraded — fall back to Wikidata SPARQL filtered to England. **QID for "Church of England parish" is TBD** — the originally-drafted Q2389005 was wrong (it is "Siebe", a male given name). Q5116872 ("Church of England parish church") is the *building*, not the parish-as-entity. Run design § 3.2 validation with `wbsearchentities` for "Church of England parish" / "Anglican parish" and confirm the right class before scripting; document the substitution in the script header.
- ONS Open Geography Portal serves multiple geographic generations; pin to the latest "Census 2021 boundaries" generation to avoid mixing 2011/2021 boundaries silently.
- Past failure to learn from: the original German plan went point-only because boundaries felt "later" — this plan ships point + boundary + ecclesial together to avoid the same drift.

## Tech stack

ONS Open Geography Portal REST API (ArcGIS FeatureServer, GeoJSON output) + CofE Open Data portal + GeoNames GB.zip + ogr2ogr + mapshaper + Wikidata SPARQL fallback. License: OGL v3 + CC BY 4.0.

## File structure

| File | Status | Purpose |
|---|---|---|
| `scripts/build-gb-civil-divisions.ts` | Create | ONS + NRS + NISRA → admin1/admin2/parishes + polygons |
| `scripts/build-gb-cofe-parishes.ts` | Create | CofE Open Data → ecclesiastical parish point gazetteer |
| `src/api/place-gazetteers/data/gb-civil-divisions.json` | Create (gen) | All civil divisions + boundaries |
| `src/api/place-gazetteers/data/gb-cofe-parishes.json` | Create (gen) | C of E parishes |
| `src/gazetteer-build/normalize-rules.ts` | Modify | Add `EN_RULES_GB` (or extend existing `EN_RULES`) with British-isles suffixes (parish, civil parish, ecclesiastical parish, council area, principal area, community, ceremonial county, royal burgh, burgh, town, village, hamlet) |
| `src/api/place-gazetteers/bundled.ts` | Modify | 2 imports + 2 entries + 2 normalize-rule mappings |
| `tests/unit/european-coverage.test.ts` | Modify | Append GB probe set |
| `tests/unit/gazetteers.test.ts` | Modify | Bump count + IDs |
| `.claude/skills/gazetteers/SKILL.md` | Modify | 2 rows |
| `package.json` + `CHANGELOG.md` | Modify | minor bump |

## Tasks

### Task 0: Lock source decisions (license audit per design § 3.1)

- [x] **Step 1:** Confirm ONS Open Geography Portal as the civil-divisions source. URL: <https://geoportal.statistics.gov.uk/>. Verify OGL v3 attribution string for the script header.
- [x] **Step 2:** Confirm CofE Open Data as the C of E parish source. URL: <https://opendata.churchofengland.org/>. License: CC BY 4.0. If the portal is down or the schema is degraded, fall back to Wikidata SPARQL — document the choice in the script header.
- [x] **Step 3:** Confirm normalize rule additions. Order longest-first: `Civil Parish`, `Ecclesiastical Parish`, `Royal Burgh`, `Council Area`, `Principal Area`, `Ceremonial County`, `Burgh`, `Town`, `Village`, `Hamlet`, `Parish`, `Community`. Plus prefixes: `County of`, `City of`, `Borough of`.
- [x] **Step 4:** No commit — informational.

### Task 1: Extend normalize rules (TDD)

Mirror DE plan Task 1 exactly. Test cases:

```typescript
expect(stripSuffix('East Lothian Council Area', GB_RULES)).toBe('East Lothian');
expect(stripSuffix('County of Suffolk', GB_RULES)).toBe('Suffolk');
expect(stripSuffix('Civil Parish of Woodbridge', GB_RULES)).toBe('Woodbridge');
expect(stripSuffix('Llanrwst Community', GB_RULES)).toBe('Llanrwst');
```

If `EN_RULES` already exists and is shared with US/CA/world-admin1, create a new `GB_RULES` rather than mutating shared rules — British-isles ecclesiastical and Welsh suffixes don't apply elsewhere.

### Task 2: Build `gb-civil-divisions` (ONS + NRS + NISRA)

Mirrors DE Task 3 (boundary script). Differences:

- Source: ONS Open Geography Portal FeatureServer — query four layers (`Countries_*_Boundaries`, `Counties_and_Unitary_Authorities`, `Civil_Parishes`, `Communities`) for England/Wales; NRS WFS for Scottish council areas + historical parishes; NISRA for NI counties.
- Hierarchy: UK (root, country) → England/Scotland/Wales/Northern Ireland (admin1) → ceremonial county / council area / principal area / NI county (admin2) → civil parish / community / NRS parish (admin3, type='parish' for ecclesiastical-flavoured leaves; type='civil-parish' for England civil parishes; type='community' for Welsh).

Wait — `type` is closed vocab. Per the contract: `world | continent | country | admin1 | admin2 | admin3 | admin4 | locality | parish | farm | church | city | landskap | historical-state | other`. `parish` is the right type for all leaf flavours; the *flavour* (civil vs ecclesiastical vs kirk session) is captured in the contributing gazetteer ID and aliases.

So: leaves are `type: 'parish'` regardless of flavour; the gazetteer's name and the node's aliases distinguish flavours.

Reproject to EPSG:4326. Simplify boundaries 5% via mapshaper. Group multi-part features by `OBJECTID`. Write JSON via `writeGazetteer`.

Tasks 2.x mirror DE Task 3 steps 1–6 (download, build, run, budget gate, commit).

### Task 3: Wire `gb-civil-divisions`, extend test (mirrors DE Task 4)

- [x] **Step 1:** Static import + `BUNDLED_GAZETTEERS` entry + `NORMALIZE_RULES_BY_ID['gb-civil-divisions'] = GB_RULES`.
- [x] **Step 2:** Bump `gazetteers.test.ts` count, add ID.
- [x] **Step 3:** Append GB probe set to `EUROPEAN_PROBES` in `european-coverage.test.ts`. Include the Swedish exonym probe (`Skottland`) — it asserts `lang-sv-*` translations propagate to GB.
- [x] **Step 4:** Run tests. Expected: GB probes pass.
- [x] **Step 5:** Skill doc + commit.

### Task 4: Build `gb-cofe-parishes` (CofE Open Data)

- [x] **Step 1:** Fetch the CofE parish dataset (parishes + dioceses + archdeaconries). REST: <https://opendata.churchofengland.org/api/3/action/datastore_search?resource_id=...>. If portal is down, Wikidata fallback.
- [x] **Step 2:** Hierarchy: UK → England → diocese (custom type? — closest match is `admin2` since the diocese is the parish's organisational parent; OR add no admin2 and put the diocese in aliases. **Decision: skip diocese as a structural level; put diocese in parish aliases.** Rationale: the genealogist writes "St Mary's, Woodbridge" not "St Mary's, Diocese of St Edmundsbury and Ipswich, Woodbridge". Resolver matches by path containment; parent path is `England → Suffolk → Woodbridge → St Mary's` from the civil-divisions gazetteer; this gazetteer attaches the parish point at `England → St Mary's (in Woodbridge as alias)`.)

Wait — reconsidering. If the CofE gazetteer doesn't share the civil-divisions parent_path, the structural-merge contract puts St Mary's at a different node than where the genealogist looks. Better: emit CofE parishes under the civil-divisions hierarchy when the CofE record's parent civil parish is known. CofE records *do* include the civil parish field. So:

- CofE → derive `parent_path = England > <ceremonial county> > <civil parish>` from CofE record's metadata.
- Leaf: type='parish' or type='church' (— but `church` is for buildings; the parish IS a `parish`).
- Aliases: include "Diocese of <X>", "Archdeaconry of <Y>" so genealogists searching by ecclesiastical hierarchy find them.

This means the CofE gazetteer merges into `gb-civil-divisions` at parish level by name+type+parent_path. ✓ The contract handles it.

- [x] **Step 3:** Build script writes `gb-cofe-parishes.json`.
- [x] **Step 4:** Bundle-size gate.
- [x] **Step 5:** Commit.

### Task 5: Wire `gb-cofe-parishes`, add CofE probes

Mirrors DE Task 6. Probes pulled from actual built data. The "St Mary's, Woodbridge" probe asserts the CofE gazetteer correctly attaches under the civil parish.

### Task 6: User smoke-check + version + close-out

Mirrors DE Task 7. Minor version bump. CHANGELOG line. Plan archive. `npm start` + place picker + map polygon visual confirmation.

## Self-review checklist

- [x] All seven user-goal probes resolve in the running app.
- [x] CofE parishes correctly attach under their civil parishes (no orphan diocese-rooted parishes).
- [x] Both gazetteers within budget.
- [x] Swedish exonym `Skottland` → Scotland still works (lang-sv merge regression check).
- [x] No `type` outside the closed vocab in any leaf.
- [x] Plan archived; minor version bumped.
