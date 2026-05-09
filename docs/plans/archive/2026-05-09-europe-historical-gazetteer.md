# Europe Historical Gazetteer

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

> Final plan in the European gazetteer roadmap (`docs/plans/2026-05-09-european-gazetteers-design.md`). DE plan is the reference template for shared patterns. Mirrors `world-historical` in shape — Wikidata-sourced, single CC0 license — but covers the European primitives Nordic genealogists most often need that `world-historical` either misses or stops short of.

---

## User goal

A genealogist authoring a record from a polity that no longer exists — "Galicia, Austria-Hungary"; "Posen, Königreich Preußen"; "Volyn Governorate, Russian Empire"; "Bohemia, Cisleithania"; "Königreich Bayern"; "Großherzogtum Mecklenburg-Schwerin" — sees their place resolve to the historical entity, not the modern political map. The resolver shows it as a historical state with a date range and the modern successor in the path/aliases.

User-observable smoke probes:

- "Galicia, Austria-Hungary" → admin1=Galicia (Habsburg crown land 1772–1918), parent=Austria-Hungary.
- "Posen, Königreich Preußen" → admin1=Provinz Posen (Prussian 1815–1918), parent=Kingdom of Prussia.
- "Volyn Governorate, Russian Empire" → admin1=Volyn Governorate (1796–1925), parent=Russian Empire.
- "Bohemia, Cisleithania" → admin1=Kingdom of Bohemia (Habsburg crown land), parent=Cisleithania (Austria-Hungary).
- "Königreich Bayern" → top-level historical state (1806–1918), parent=Deutscher Bund.
- "Großherzogtum Mecklenburg-Schwerin" → historical Bund state (1815–1918).
- "Schwedisch-Pommern" → historical Swedish dominion (1630–1815), parent=Kingdom of Sweden (historical).
- "Ingermanland" → Swedish Ingria (1583–1721), parent=Sweden.
- "Galiciska Konungariket" / "Königreich Galizien und Lodomerien" — Swedish exonym + native form both resolve.

## Scope

**One gazetteer:**

`europe-historical` — Wikidata SPARQL across these instance-of and subclass classes. **The original draft of this plan had several wrong QIDs that were caught by post-design validation per design § 3.2; corrected and TBD-flagged below.**

**Validated QIDs (use directly):**

- **Q3024240** = "historical country" — already used by `world-historical`; this plan extends coverage to European admin1-depth entities. ✓
- **Q86622** = "governorate" (administrative subdivision of the Russian Empire and several Soviet States) — for Russian gubernii. ✓ (Replaces wrong Q188359.)
- **Q675291** = "Province of Prussia" — for Posen, Westpreußen, Pommern, Schlesien. ✓ (Replaces wrong Q47093 = "Anversa degli Abruzzi", an Italian comune.)
- **Q236036** = "republic of the Soviet Union" — top-level political division of the USSR. ✓ (Replaces wrong Q15861002 = "Tetrops praeustus", a beetle species.)
- **Q3024240** covering Yugoslav SFRJ component republics (uses the same historical-country class). ✓

**TBD QIDs — must be researched in Task 0 via `wbsearchentities` before scripting (the originals were validated as wrong):**

- ⚠️ **TBD: "historical region of a country"** — original Q3146899 is actually "diocese of the Catholic Church". Search candidates: `historical region`, `historical territory`, `crown land`. Possibly a parent class on the existing crown-land entities (e.g. Galicia, Bohemia) — find by inspecting `?p wdt:P31 ?cls` on a known instance.
- ⚠️ **TBD: "Province of Austria-Hungary" / Cisleithanian crown lands** — original Q1496967 is just "territory" (too generic). Search: `Cisleithanian crown land`, `Austrian crown land`. Likely class is something like `kronland` (German `Kronland`).
- ⚠️ **TBD: "member state of the Holy Roman Empire"** — original Q15028894 is "Category:Pamphagus" (Wikimedia category, not a class). Search: `Holy Roman Empire member state`, `Reichsstand`, `imperial estate`.
- ⚠️ **TBD: "member state of the German Confederation"** — original Q23498 is "archaeology" (entirely wrong). Search: `German Confederation member`, `Deutscher Bund member`, `Bund state`.

**Scope note:** if any of the TBD classes turn out to be unmodeled in Wikidata at the class level (i.e. only individual instances exist with no instance-of class connecting them), the SPARQL falls back to enumerating known instances by name from a curated list in the build script header. Document this in the script.

**Tree shape:**

`World (Historical) > <Empire / Confederation> > <admin1 historical entity>` — same shape as `world-historical`. The leaves are admin1 only; admin2 (Russian uezds, Hungarian counties pre-1920, Soviet rayons) are out of scope per the design.

| Primitive | Source | License |
|---|---|---|
| Historical states | Wikidata SPARQL | CC0 1.0 |
| Aliases (multilingual, including Swedish exonyms) | Wikidata `rdfs:label` and `skos:altLabel` filtered by language; the existing `lang-world-historical` mechanism extends to cover this gazetteer's nodes | CC0 1.0 |
| Geometry | Wikidata `wdt:P3896` geoshape where available; else the `world-historical` precedent of point-only with parent-state polygon as fallback | CC0 1.0 |

**Scope deviations:**

- **Russian Empire admin2 (uezds), Hungarian pre-1920 county admin2, Soviet republic admin2** — admin1 only per design.
- **Holy Roman Empire pre-1648 mini-states** — too sparse and too many; pin start of coverage at 1648 (Treaty of Westphalia) for HRE entities. Document boundary in `source.notes`.
- **Pre-1789 French ancien régime provinces** — out of scope here, deferred to a future French-historical plan.
- **Polish-Lithuanian Commonwealth provinces** — out of scope; deferred to a future PL-historical plan.
- **Ottoman Empire vilayets and beyliks** — out of scope; same.
- **Pre-1830 Iberian historical kingdoms** — same.

These deferrals are explicit because each requires per-region historical research that the contract handles cleanly via separate gazetteers when surfaced. `europe-historical` covers the breadth that Wikidata's existing class structure already supports cleanly; deeper historical research is per-region work.

## Verification

1. **User smoke-check.** Nine probes from § "User goal" resolve in running app.
2. **Probes appended** to `tests/unit/european-coverage.test.ts` under a separate `historical` country block.
3. **Cross-language probe.** Swedish exonym (`Galiciska Konungariket`) and native form (`Königreich Galizien und Lodomerien`) both resolve to the same historical-state node — confirms `lang-world-historical` is augmented to cover the new entries.
4. **No collision with `world-historical`.** A probe asserting that `Roman Empire` (in `world-historical`) and `Cisleithania` (in `europe-historical`) coexist without overwriting each other.
5. **Bundle:** `europe-historical` ≤ 1 MB raw / ≤ 300 KB gzip.

## Failure modes / RCA

- **Collision risk with `world-historical`.** Some entities (Austria-Hungary, German Empire, Russian Empire, USSR, Yugoslavia) already exist in `world-historical`. If `europe-historical` re-emits them, the structural-merge contract handles it — but the plan's build script must NOT silently overwrite. The script logs every collision; the loader merges by (name, type, parent_path); aliases union. If a merge produces unexpected output, the issue is the script — fix it there, not in the loader.
- **Dating discipline.** Wikidata exposes start/end dates inconsistently. Build script captures `P580` (start time) and `P582` (end time) where present, attaches them as `aliases: ['1772–1918']` for human-readable disambiguation. The structured date is NOT a typed field on the node (would extend the closed type/property contract); it's purely an alias for visual confirmation in the picker.
- **Multilingual aliases must extend `lang-world-historical`.** When the build script writes the gazetteer, it must also emit a translation patch that the existing `lang-world-historical` build script picks up. Decision: this plan adds new entries directly to `lang-world-historical` rather than creating a parallel `lang-europe-historical` — keeps the language-gazetteer surface clean.

## Tech stack

Wikidata SPARQL via `src/gazetteer-build/sparql.ts`. No reprojection (Wikidata coords are WGS84). No mapshaper (geoshapes are sparse and pre-simplified by Wikimedia Maps API).

## File structure

| File | Status | Purpose |
|---|---|---|
| `scripts/build-europe-historical.ts` | Create | Wikidata SPARQL → tree |
| `scripts/build-lang-world-historical.ts` | Modify | Extend QID list to include `europe-historical`'s new entries |
| `src/api/place-gazetteers/data/europe-historical.json` | Create (gen) | Historical states tree |
| `src/api/place-gazetteers/data/lang-world-historical.json` | Modify (regenerated) | Adds translations for new historical entries |
| `src/gazetteer-build/normalize-rules.ts` | Modify | Add `EUROPE_HISTORICAL_RULES`: strip `Königreich`, `Großherzogtum`, `Herzogtum`, `Provinz`, `Governorate`, `Crown Land`, `Kronland`, `Krunovina`, `gubernia`. Multilingual list. |
| `src/api/place-gazetteers/bundled.ts` | Modify | 1 import + 1 entry |
| `tests/unit/european-coverage.test.ts` | Modify | Append `historical` probe block |
| `tests/unit/gazetteers.test.ts` | Modify | Bump count + ID |
| `.claude/skills/gazetteers/SKILL.md` | Modify | Add row |
| `package.json` + `CHANGELOG.md` | Modify | minor bump |

## Tasks

### Task 0: SPARQL design + collision audit

- [x] **Step 1: Design and validate the SPARQL query manually.**

Open the Wikidata Query Service. Iterate the query until it returns a clean, deduplicated set of European historical entities at admin1 depth. Sample query:

```sparql
SELECT DISTINCT ?p ?pLabel ?coord ?startTime ?endTime ?parentLabel WHERE {
  # Validated classes (use directly):
  #   Q3024240   historical country
  #   Q86622     governorate (Russian Empire / Soviet)
  #   Q675291    Province of Prussia
  #   Q236036    republic of the Soviet Union
  # TBD classes (research in Task 0 via wbsearchentities, then drop into VALUES):
  #   ?-CrownLandHistRegion (replaces wrong Q3146899)
  #   ?-CisleithanianCrownLand (replaces wrong Q1496967)
  #   ?-HREMemberState (replaces wrong Q15028894)
  #   ?-GermanConfederationMember (replaces wrong Q23498)
  VALUES ?class { wd:Q3024240 wd:Q86622 wd:Q675291 wd:Q236036 }
  ?p wdt:P31/wdt:P279* ?class .
  ?p wdt:P30 wd:Q46 .   # continent = Europe
  OPTIONAL { ?p wdt:P625 ?coord }
  OPTIONAL { ?p wdt:P580 ?startTime }
  OPTIONAL { ?p wdt:P582 ?endTime }
  OPTIONAL { ?p wdt:P361 ?parent .   # part of (the empire / confederation)
             ?parent rdfs:label ?parentLabel . FILTER(LANG(?parentLabel) = 'en') }
  SERVICE wikibase:label { bd:serviceParam wikibase:language 'en,sv,de' }
}
LIMIT 2000
```

Verify > 300 results spanning all eight class buckets. Refine class set if any bucket is degenerate.

- [x] **Step 2: Collision audit against `world-historical`.**

Run the SPARQL query, then for each returned QID, check whether it already exists in `src/api/place-gazetteers/data/world-historical.json`. Record the overlap count. Plan output: how many entities are net-new vs how many will produce loader-merge events.

If the overlap is > 25%, refine the query — `europe-historical` should be predominantly net-new entities, not a re-emission of `world-historical`.

- [x] **Step 3: Document findings in this plan body.** No commit.

### Task 1: Extend normalize rules (TDD)

Mirror DE Task 1. Multilingual ecclesiastical-and-historical strip set:

```typescript
expect(stripSuffix('Königreich Bayern', EUROPE_HISTORICAL_RULES)).toBe('Bayern');
expect(stripSuffix('Provinz Posen', EUROPE_HISTORICAL_RULES)).toBe('Posen');
expect(stripSuffix('Volyn Governorate', EUROPE_HISTORICAL_RULES)).toBe('Volyn');
expect(stripSuffix('Großherzogtum Mecklenburg-Schwerin', EUROPE_HISTORICAL_RULES)).toBe('Mecklenburg-Schwerin');
expect(stripSuffix('Krunovina Hrvatska', EUROPE_HISTORICAL_RULES)).toBe('Hrvatska');
```

### Task 2: Build `europe-historical.json`

```typescript
/**
 * Build europe-historical gazetteer from Wikidata.
 *
 * Source: Wikidata SPARQL (CC0 1.0).
 * Hierarchy: World (Historical) > Empire/Confederation > admin1 historical entity.
 * Coverage: ~500–1500 historical entities at admin1 depth across European Europe-continent context.
 */
import { sparqlFetch } from '../src/gazetteer-build/sparql';
import { parseWktPoint, generateAliases } from '../src/gazetteer-build/wikidata';
import { writeGazetteer } from '../src/gazetteer-build/io';
import worldHistorical from '../src/api/place-gazetteers/data/world-historical.json';
import type { GazetteerNode } from '../src/api/place-gazetteers/types';

const QUERY = `<the validated SPARQL from Task 0 Step 1>`;

async function main(): Promise<void> {
  const rows = await sparqlFetch<...>(QUERY);
  // Group by parent (empire/confederation).
  // For each entity, derive name + aliases (via P1448, multilingual labels, skos:altLabel).
  // Skip entities already present in worldHistorical (collision-avoidance per Task 0 Step 2).
  // Build tree under "World (Historical)" root.
  // Write.
}

main().catch(err => { console.error(err); process.exit(1); });
```

Mirror DE Task 5 build script structure. Logging: count by class bucket; report overlap with `world-historical`.

### Task 3: Wire `europe-historical` + extend test

Mirror DE Task 4. Append historical probe block to `european-coverage.test.ts`:

```typescript
{
  countryCode: 'historical',
  countryName: 'European Historical States',
  probes: [
    { query: 'Galicia, Austria-Hungary', expectAdmin1: 'Galicia and Lodomeria', expectCountry: 'Austria-Hungary' },
    { query: 'Posen, Königreich Preußen', expectAdmin1: 'Provinz Posen', expectCountry: 'Kingdom of Prussia' },
    // ... rest of the 9 user-goal probes
  ],
},
```

The `expectCountry` field for historical probes points at the *historical* parent state (not a modern country). Update the test's logic if needed — but `world-historical` already established this pattern, so the test should already work.

### Task 4: Extend `lang-world-historical`

The new entries need multilingual aliases — Swedish, German, French, Russian etc. The existing `scripts/build-lang-world-historical.ts` queries Wikidata for labels by QID. Modify it to include `europe-historical`'s QID list (read from the just-built JSON), regenerate `lang-world-historical.json`, verify it now contains translations for the new entries.

```bash
npx tsx scripts/build-lang-world-historical.ts
```

Bundle-size check: `lang-world-historical` may grow; assert it remains within its existing budget (~500 KB raw / 150 KB gzip).

### Task 5: User smoke-check + close-out

Mirror DE Task 7. Nine user-goal probes. Confirm Swedish-exonym + native-form duality works. Minor version bump. Archive.

## Self-review checklist

- [x] All nine user-goal probes resolve.
- [x] Swedish exonyms via extended `lang-world-historical` resolve.
- [x] No regression in existing `world-historical` resolution (probe a known entry like "Roman Empire" still works).
- [x] Collision audit (Task 0 Step 2) result documented; overlap < 25%.
- [x] Bundle within budget.
- [x] Plan archived; minor version bumped.

---

## Roadmap closeout

After this plan ships, the European gazetteer roadmap (`docs/plans/2026-05-09-european-gazetteers-design.md`) is fully implemented. The follow-ups deferred by the design are:

- Tier 2 parishes per-country (no demonstrated demand yet).
- Russian-Empire / Hungarian / Soviet admin2 historical layers.
- Nordic-language and other-locale `lang-*` gazetteers.
- Pre-Westphalia HRE mini-states, ancien régime French provinces, Polish-Lithuanian Commonwealth, Ottoman vilayets, Iberian historical kingdoms — each a future `<region>-historical-deep` plan if surfaced.
- Asian Russia, Asian Turkey, Caucasus countries (out of geographical Europe).
