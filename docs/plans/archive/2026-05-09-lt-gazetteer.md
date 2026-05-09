# LT Gazetteer — Tier 1

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

> Part of the European gazetteer roadmap (`docs/plans/2026-05-09-european-gazetteers-design.md`). DE plan is the reference template. EE / LV plans are the closest precedents — same Baltic post-Soviet pattern. Lithuania differs from EE/LV in dominant denomination (Catholic, not Lutheran).

---

## User goal

A genealogist authoring "Vilnius, Lietuva", "Kaunas, Kauno apskritis", "Klaipėda", "Žemaitija" (cultural region), or "Šv. Mikalojaus parapija, Vilnius" sees their place resolve under the right savivaldybė (since the 2010 abolition of apskritys), with diacritics stripped and Catholic parapija coverage.

User-observable smoke probes:

- "Vilnius, Lietuva" → leaf=Vilnius (savivaldybė).
- "Kaunas" → leaf=Kaunas (savivaldybė).
- "Klaipėda" → leaf=Klaipėda (savivaldybė).
- "Žemaitija" → cultural region; resolves via aliases on relevant savivaldybės.
- "Šv. Mikalojaus parapija, Vilnius" → resolves to Catholic parish under Vilnius.
- "Litauen" / "Lithuania" — country resolves via existing `world-countries` + `lang-sv-*`.

## Scope

**Two gazetteers:**

1. `lt-savivaldybes` — Lithuania → cultural region (Aukštaitija, Žemaitija, Dzūkija, Suvalkija — alias only) → savivaldybė (admin1, 60 since 2010) → seniūnija (admin2, ~546) → gyvenvietė (locality, leaf). Polygons on savivaldybė.
2. `lt-parapijos` — Lithuania → diocese (alias) → Catholic parapija (point only). Wikidata + Catholic-Hierarchy.org.

| Primitive | Source | License |
|---|---|---|
| Savivaldybės + seniūnijos | Registrų Centras (RC) — Administrative Territories | CC BY 4.0 |
| Localities | GeoNames LT.zip | CC BY 4.0 |
| Boundaries (savivaldybė) | RC | CC BY 4.0 |
| Catholic parapijos | Wikidata + Catholic-Hierarchy.org open data | CC0 1.0 + CC BY 4.0 (best effort) |

**Scope deviations:**

- **Apskritys (counties, abolished 2010 as admin units, retained statistically)** included as aliases on relevant savivaldybės, not as admin1 nodes.
- **Russian Orthodox parishes** out of scope — small minority, very sparse data.
- **Pre-1918 Russian Empire (Vilna gubernia, Kovno gubernia)** out of scope; goes to `europe-historical`.
- **Soviet-era admin (rajons 1950–1995)** out of scope; goes to `europe-historical` if covered at all.
- **Lutheran parishes in Klaipėda region (formerly East Prussia / Memelland)** could be relevant but coverage on Wikidata is too sparse — Lutheran probes deferred to a follow-up if a user surfaces the need.

## Verification

1. Six smoke probes from § "User goal".
2. Bundle: `lt-savivaldybes` ≤ 3 MB raw / 1 MB gzip; `lt-parapijos` ≤ 500 KB raw / 150 KB gzip.
3. Diacritic resolve: "Klaipeda" without ė resolves to "Klaipėda".

## Failure modes / RCA

- 2010 abolition of apskritys is the structural cutoff. Build script uses post-2010 admin; pre-2010 county names as aliases for record continuity.
- Lithuanian compound suffix forms: `Klaipėdos savivaldybė` (genitive case + suffix). Normalize rule must handle Lithuanian case endings — the universal layer does some of this; LT_RULES adds the suffix list. If the resolver still can't match, document the limitation; full Lithuanian morphological strip is out of scope.

## Tech stack

RC GeoPackage + ogr2ogr + mapshaper + GeoNames + Wikidata SPARQL.

## File structure

| File | Status | Purpose |
|---|---|---|
| `scripts/build-lt-savivaldybes.ts` | Create | RC + GeoNames |
| `scripts/build-lt-parapijos.ts` | Create | Wikidata Catholic parishes |
| `src/api/place-gazetteers/data/lt-savivaldybes.json` | Create (gen) | Modern admin + boundaries |
| `src/api/place-gazetteers/data/lt-parapijos.json` | Create (gen) | Catholic parishes |
| `src/gazetteer-build/normalize-rules.ts` | Modify | Add `LT_RULES`: `savivaldybė`, `seniūnija`, `apskritis`, `parapija`, `gyvenvietė`, `kaimas`, `miestas`. |

## Tasks

### Task 0: License audit + source decisions

- [x] RC license (CC BY 4.0).
- [x] Wikidata SPARQL for parapijos: `?p wdt:P31/wdt:P279* wd:Q17143723 . ?p wdt:P17 wd:Q37 .` Verify > 600 results (Lithuania has ~700 active Catholic parishes).
- [x] LT_RULES suffixes (longest-first): `savivaldybė`, `seniūnija`, `gyvenvietė`, `apskritis`, `parapija`, `miestas`, `kaimas`. Genitive forms (`savivaldybės`, `seniūnijos`, `apskrities`, `parapijos`) included.

### Task 1: Extend normalize rules (TDD)

```typescript
expect(stripSuffix('Klaipėdos savivaldybė', LT_RULES)).toBe('Klaipėdos');
expect(stripSuffix('Vilniaus apskritis', LT_RULES)).toBe('Vilniaus');
expect(stripSuffix('Šv. Mikalojaus parapija', LT_RULES)).toBe('Šv. Mikalojaus');
expect(stripSuffix('Kauno seniūnija', LT_RULES)).toBe('Kauno');
```

### Task 2: Build `lt-savivaldybes`

Mirror EE Task 2.

### Task 3: Wire + extend test

Mirror DE Task 4.

### Task 4: Build `lt-parapijos`

Wikidata SPARQL. Diocese as alias on each parapija; parent_path = savivaldybė from P131 chain.

### Task 5: Wire parapijos

Mirror DE Task 6.

### Task 6: User smoke-check + close-out

Mirror DE Task 7. Six user-goal probes. Diacritic resolution check. Minor bump. Archive.

## Self-review checklist

- [x] All six user-goal probes resolve.
- [x] Diacritic-stripped queries resolve.
- [x] Cultural regions (Žemaitija etc.) as aliases.
- [x] Lithuanian genitive-case suffix forms handled (Klaipėdos = Klaipėda + suffix).
- [x] Post-2010 savivaldybės canonical; apskritys as aliases.
- [x] Both gazetteers within budget.
- [x] Plan archived; minor version bumped.
