# PL Gazetteer — Tier 1

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

> Part of the European gazetteer roadmap (`docs/plans/2026-05-09-european-gazetteers-design.md`). DE plan is the reference template. This is the largest single-country Tier 1 plan: ~38M population, 16 województwa, 380 powiaty, ~2,500 gminy, ~10k Catholic parafie. Bundle-size budget is the tightest.

---

## User goal

A Polish-line genealogist authoring "Kraków, małopolskie", "Poznań, wielkopolskie", "Gdańsk, pomorskie" or "Parafia św. Marii, Kraków" sees their place resolve under the right gmina under the right powiat under the right województwo, with diacritics stripped and Catholic parafia coverage. Partition-era genealogy ("Posen, Königreich Preußen") is handled by `europe-historical`, not here.

User-observable smoke probes:

- "Kraków, małopolskie" → admin1=małopolskie, admin2=Kraków powiat, leaf=Kraków.
- "Poznań, wielkopolskie" → admin1=wielkopolskie, leaf=Poznań.
- "Gdańsk, pomorskie" → admin1=pomorskie, leaf=Gdańsk.
- "Wrocław, dolnośląskie" → admin1=dolnośląskie, leaf=Wrocław.
- "Parafia św. Marii, Kraków" → resolves to Catholic parafia under Kraków.
- "Polen" / "Poland" / "Polska" — country resolves via existing `world-countries` + `lang-sv-*`.

## Scope

**Two gazetteers:**

1. `pl-gminy` — Poland → województwo (admin1, 16) → powiat (admin2, 380) → gmina (admin3, ~2,500) → miejscowość (locality, leaf). Polygons on województwo + powiat (gmina-level polygons would push budget; deferred).
2. `pl-parafie` — Poland → diocese (alias) → Catholic parafia (point only). Wikidata + opendata.gov.pl Catholic Church data if available; ~10k parafia.

| Primitive | Source | License |
|---|---|---|
| Województwa + powiaty + gminy | GUS (Statistics Poland) — TERYT register | CC BY 4.0 (gov data) |
| Localities | GeoNames PL.zip + GUS BDOT | CC BY 4.0 |
| Boundaries (województwo + powiat) | GUGiK (Head Office of Geodesy) — PRG (Państwowy Rejestr Granic) | CC BY 4.0 |
| Catholic parafie | Wikidata SPARQL on Q1860233, country=Poland | CC0 1.0 |

**Scope deviations:**

- **Gmina-level polygons** out of scope. ~2,500 polygons + 10k parafia points + 38M-pop locality points push the budget. Gmina polygons go to a follow-up `pl-gminy-leaf-boundaries` plan if surfaced.
- **Pre-1989 admin (województwa 1975–1998 — 49 of them)** out of scope; pre-reform province names included as aliases where genealogically common.
- **Partition-era admin (1795–1918)** out of scope here; goes to `europe-historical` (Russian Congress Poland, Galicia under Austria, Posen / Westpreußen under Prussia).
- **Polish Orthodox + Greek Catholic + Lutheran parishes** out of scope — Catholic dominates Polish genealogy. Future per-denomination follow-up.
- **Sołectwa (sub-gmina rural settlements)** out of scope; covered by GeoNames localities as needed.

## Verification

1. Six smoke probes from § "User goal".
2. Bundle: `pl-gminy` ≤ 8 MB raw / 2.5 MB gzip; `pl-parafie` ≤ 5 MB raw / 1.5 MB gzip. The combined ~12.5k node count + voivodeship/powiat polygons is the largest Tier 1 set; tight rounding (round6 → round5 for points if needed) may be required.
3. Diacritic resolve: "Krakow" → "Kraków"; "Lodz" → "Łódź".

## Failure modes / RCA

- 1999 admin reform reduced 49 województwa to 16; pre-reform names are common in genealogy. Aliases on the relevant modern województwa cover this.
- Wikidata Catholic parish coverage for Poland is uneven (Wikipedia.pl-driven, biased toward urban). Document expected count vs reality (~5k vs ~10k actual). Coverage gap is acceptable for first cut; per-diocese fallback portals (e.g. archidiecezjakrakowska.pl) are too heterogeneous to script in this plan.

## Tech stack

GUS TERYT API + GUGiK PRG GeoPackage + ogr2ogr + mapshaper + GeoNames + Wikidata SPARQL.

## File structure

| File | Status | Purpose |
|---|---|---|
| `scripts/build-pl-gminy.ts` | Create | TERYT + PRG + GeoNames |
| `scripts/build-pl-parafie.ts` | Create | Wikidata Catholic parishes |
| `src/api/place-gazetteers/data/pl-gminy.json` | Create (gen) | Województwa + powiaty + gminy + boundaries (admin1+admin2 only) |
| `src/api/place-gazetteers/data/pl-parafie.json` | Create (gen) | Catholic parafie |
| `src/gazetteer-build/normalize-rules.ts` | Modify | Add `PL_RULES`: `województwo`, `powiat`, `gmina`, `parafia`, `miasto`, `wieś`, `osada`, `dzielnica`. Plus prefix `gmina`. |

## Tasks

### Task 0: License audit + source decisions

- [ ] GUS TERYT license (Polish public-sector info, CC BY 4.0 compatible).
- [ ] GUGiK PRG license, attribution string.
- [ ] Wikidata SPARQL for parafie: `?p wdt:P31/wdt:P279* wd:Q1860233 . ?p wdt:P17 wd:Q36 .` Verify > 4,000 results.
- [ ] PL_RULES suffixes (longest-first): `województwo`, `powiat`, `parafia`, `dzielnica`, `gmina`, `miasto`, `osada`, `wieś`. Plus prefix `Gmina ` (case-insensitive, leading).

### Task 1: Extend normalize rules (TDD)

```typescript
expect(stripSuffix('Gmina Kraków', PL_RULES)).toBe('Kraków');
expect(stripSuffix('Województwo małopolskie', PL_RULES)).toBe('małopolskie');
expect(stripSuffix('Powiat krakowski', PL_RULES)).toBe('krakowski');
expect(stripSuffix('Parafia św. Marii', PL_RULES)).toBe('św. Marii');
```

### Task 2: Build `pl-gminy`

TERYT API → tree (województwo → powiat → gmina → miejscowość). PRG GeoPackage → polygons on województwo + powiat. Bundle-size budget enforcement is the critical step here; if exceeded, drop low-population miejscowości (< 1000 pop) and re-test.

### Task 3: Wire + extend test (mirror DE Task 4)

### Task 4: Build `pl-parafie`

Wikidata SPARQL. Diocese as alias. Parent_path = gmina from P131 chain.

### Task 5: Wire parafie (mirror DE Task 6)

### Task 6: User smoke-check + close-out

Mirror DE Task 7. Six user-goal probes. Diacritic resolution check (ł, ż, ź, ć, ó, ś, ń, ą, ę). Minor bump. Archive.

## Self-review checklist

- [ ] All six user-goal probes resolve.
- [ ] Diacritic-stripped queries resolve (Krakow → Kraków, Lodz → Łódź).
- [ ] 1999 admin reform: pre-reform names appear as aliases on modern województwa.
- [ ] Wikidata coverage gap (~50% of actual parishes) documented in `source.notes`.
- [ ] Both gazetteers within budget.
- [ ] Plan archived; minor version bumped.

---

## Tier 1 closeout

After this plan ships, all 10 Tier 1 countries are complete. The next plans in the roadmap are the three Tier 2 batched plans (Western, Central, Eastern) and the `europe-historical` blanket gazetteer.
