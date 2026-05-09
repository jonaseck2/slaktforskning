# LV Gazetteer — Tier 1

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

> Part of the European gazetteer roadmap (`docs/plans/2026-05-09-european-gazetteers-design.md`). DE plan is the reference template. EE plan (`2026-05-09-ee-gazetteer.md`) is the most-similar precedent — same Baltic post-Soviet admin pattern, same Lutheran-dominant genealogy.

---

## User goal

A genealogist authoring "Rīga, Latvija", "Cēsis, Vidzeme", "Liepāja, Kurzeme", "Latgale", or "Cēsis draudze" sees their place resolve under the right novads (since the 2009/2021 admin reform) and historical apriņķis (uezds before 1949), with diacritics and Latvian admin suffixes stripped, and Lutheran draudze (parish) coverage.

User-observable smoke probes:

- "Rīga, Latvija" → admin1=Latvia (no admin1 since reform; Riga is its own valstspilsēta), leaf=Rīga.
- "Cēsis, Vidzeme" → admin1=Vidzeme region (cultural-historical, alias only), admin2=Cēsu novads, leaf=Cēsis.
- "Liepāja" → leaf=Liepāja (valstspilsēta).
- "Latgale" → admin1=Latgale (cultural region; resolves via alias on relevant novads).
- "Cēsis draudze" → resolves to Cēsis Lutheran parish.
- "Lettland" / "Latvia" / "Lettia" — country resolves via existing `world-countries` + `lang-sv-*`.

## Scope

**Two gazetteers:**

1. `lv-novadi` — Latvia → cultural region (Vidzeme, Kurzeme, Zemgale, Latgale — as admin1 facets via alias) → novads / valstspilsēta (admin2, ~43 since 2021 reform) → pagasts (admin3, where applicable) → ciemats (locality, leaf). Polygons on novads.
2. `lv-draudzes` — Latvia → historical apriņķis (alias) → draudze (Lutheran parish, point only). Wikidata + LELB (Latvian Evangelical Lutheran Church) sources.

| Primitive | Source | License |
|---|---|---|
| Novadi + pagasti | Latvian Geospatial Information Agency (LĢIA) — Administrative Territories | CC BY 4.0 |
| Localities (ciemati) | GeoNames LV.zip | CC BY 4.0 |
| Boundaries (novadi, pagasti) | LĢIA | CC BY 4.0 |
| Historical draudzes | Wikidata + LELB Open Data | CC0 1.0 + CC BY 4.0 (best effort) |

**Scope deviations:**

- **Pre-2021 admin reform (rajons 1949–2009, novads 2009–2021)** out of scope as separate primitives; pre-reform names included as aliases.
- **Russian Orthodox / Catholic parishes** out of scope (Lutheran is dominant). Catholic in Latgale region is significant — fold into `lv-draudzes` as `denomination` alias if Wikidata returns them; document coverage in `source.notes`.
- **Pre-1918 Russian Empire (Lifland gubernia, Kurland gubernia)** goes to `europe-historical`.
- **Riga's bezirks (city districts)** out of scope; Rīga as a single leaf is sufficient for genealogy.

## Verification

1. Six smoke probes from § "User goal".
2. Bundle: `lv-novadi` ≤ 3 MB raw / 1 MB gzip; `lv-draudzes` ≤ 500 KB raw / 150 KB gzip.
3. Diacritic resolve: typing "Cesis" without macron resolves to "Cēsis".

## Failure modes / RCA

- Latvia has had three admin reforms in 25 years (rajons 1949–2009 → novadi 2009–2021 → reformed novadi 2021). Build script uses post-2021 admin; older names as aliases. Document the reform-date rule in script header.
- Cultural regions (Vidzeme/Kurzeme/Zemgale/Latgale) have no current legal admin status; treat them as cultural facets attached as aliases to the relevant novads, NOT as admin1 nodes.

## Tech stack

LĢIA GeoPackage + ogr2ogr + mapshaper + GeoNames + Wikidata SPARQL.

## File structure

| File | Status | Purpose |
|---|---|---|
| `scripts/build-lv-novadi.ts` | Create | LĢIA + GeoNames |
| `scripts/build-lv-draudzes.ts` | Create | Wikidata Lutheran parishes |
| `src/api/place-gazetteers/data/lv-novadi.json` | Create (gen) | Modern admin + boundaries |
| `src/api/place-gazetteers/data/lv-draudzes.json` | Create (gen) | Lutheran parishes |
| `src/gazetteer-build/normalize-rules.ts` | Modify | Add `LV_RULES`: `novads`, `pagasts`, `pilsēta`, `valstspilsēta`, `apriņķis`, `draudze`, `ciemats`. |

## Tasks

### Task 0: License audit + source decisions

- [ ] LĢIA license check (CC BY 4.0).
- [ ] Wikidata SPARQL for draudzes: `?p wdt:P31/wdt:P279* wd:Q3308141 . ?p wdt:P17 wd:Q211 .` Verify > 100 results.
- [ ] LV_RULES suffixes (longest-first): `valstspilsēta`, `apriņķis`, `draudze`, `pilsēta`, `pagasts`, `novads`, `ciemats`. Plus prefix `Pilsēta`.

### Task 1: Extend normalize rules (TDD)

```typescript
expect(stripSuffix('Cēsu novads', LV_RULES)).toBe('Cēsu');
expect(stripSuffix('Liepājas pilsēta', LV_RULES)).toBe('Liepājas');
expect(stripSuffix('Cēsis draudze', LV_RULES)).toBe('Cēsis');
expect(stripSuffix('Saldus pagasts', LV_RULES)).toBe('Saldus');
```

### Task 2: Build `lv-novadi`

Mirror EE Task 2.

### Task 3: Wire + extend test

Mirror DE Task 4.

### Task 4: Build `lv-draudzes`

Wikidata SPARQL. If LELB Open Data is available (check at <https://lelb.lv/lv/?ct=zinas>), use it as primary; Wikidata as supplemental.

### Task 5: Wire draudzes

Mirror DE Task 6.

### Task 6: User smoke-check + close-out

Mirror DE Task 7. Six user-goal probes. Diacritic resolution check. Cultural-region alias check. Minor bump. Archive.

## Self-review checklist

- [ ] All six user-goal probes resolve.
- [ ] Diacritic-stripped queries resolve.
- [ ] Cultural regions (Latgale, Vidzeme, Kurzeme, Zemgale) are aliases on relevant novads, not admin1 nodes.
- [ ] Post-2021 novadi canonical; pre-reform names as aliases.
- [ ] Both gazetteers within budget.
- [ ] Plan archived; minor version bumped.
