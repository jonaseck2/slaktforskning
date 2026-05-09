# EE Gazetteer — Tier 1

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

> Part of the European gazetteer roadmap (`docs/plans/2026-05-09-european-gazetteers-design.md`). DE plan is the reference template. The Estonian plan is the first of the three Baltic-state plans (EE, LV, LT) — each is structurally similar but uses its own national open-data portal and has its own dominant church denomination (Lutheran for EE/LV, Catholic for LT).

---

## User goal

A genealogist authoring "Tartu, Tartumaa, Eesti", "Nõo, Tartumaa", "Pärnu, Pärnumaa", "Saaremaa", or "Tartu kihelkond" sees their place resolve to the right vald (rural municipality) or linn (city) under the right maakond (county), with admin suffixes stripped, polygons on the maakond, and historical Lutheran kihelkond (parish) coverage from when Estonia was Russian-Empire Estland and Livland.

User-observable smoke probes:

- "Tartu, Tartumaa" → admin1=Tartumaa, admin2=Tartu linn (city).
- "Nõo, Tartumaa" → admin2=Nõo vald.
- "Pärnu, Pärnumaa" → admin2=Pärnu linn.
- "Saaremaa" → admin1=Saare maakond (the entire island is its own maakond + post-2017 single vald).
- "Tartu kihelkond, Liivimaa" → resolves to a historical Lutheran kihelkond.
- "Eesti" → country (existing `world-countries` + `lang-sv-*`).

## Scope

**Two gazetteers:**

1. `ee-vallad` — Estonia → maakond (admin1, 15) → vald / linn (admin2, ~79 since 2017) → asula (locality, leaf). Polygons on maakond + vald.
2. `ee-kihelkonnad` — Estonia → historical Lutheran kihelkonnad (~104 traditional Estonian parishes, mostly defunct as administrative units but central to genealogy). Type='parish'. Wikidata + EELK (Eesti Evangeelne Luterlik Kirik) data sources.

| Primitive | Source | License |
|---|---|---|
| Maakond + vald + linn | Maa-amet (Estonian Land Board) — Estonian Topographic Database | CC BY 3.0 EE |
| Asula (localities) | GeoNames EE.zip | CC BY 4.0 |
| Boundaries | Maa-amet | CC BY 3.0 EE |
| Historical kihelkonnad | Wikidata + EELK Open Data + Saaga (digitalarhiiv.ra.ee) | CC0 1.0 + CC BY 4.0 |

**Scope deviations:**

- **Russian-Orthodox Apostolic Church parishes** out of scope. Smaller minority, sparser data; folded into kihelkonnad if Wikidata returns them, otherwise excluded.
- **Pre-1918 Russian Empire admin (Estland gubernia)** out of scope; goes to `europe-historical`.
- **Soviet-era admin (rajooni 1950–1991)** out of scope; same.
- **Setomaa cultural region** included as alias on relevant valds, not a separate admin level.

## Verification

1. Six smoke probes from § "User goal".
2. Bundle: `ee-vallad` ≤ 4 MB raw / 1.2 MB gzip; `ee-kihelkonnad` ≤ 500 KB raw / 150 KB gzip.
3. Suffix-strip: typing "Tartu maakond" resolves same as "Tartumaa" (compound suffix); typing "Nõo vald" same as "Nõo".

## Failure modes / RCA

- 2017 admin reform reduced ~213 valds to ~79; the script must use the post-reform admin level. Pre-reform vald names included as aliases for genealogical record continuity.
- Estonian compound forms: `Tartumaa` = "Tartu maakond" written as one word. Normalize rule must strip both forms.

## Tech stack

Maa-amet GeoPackage + ogr2ogr + mapshaper + GeoNames + Wikidata SPARQL.

## File structure

| File | Status | Purpose |
|---|---|---|
| `scripts/build-ee-vallad.ts` | Create | Maa-amet + GeoNames |
| `scripts/build-ee-kihelkonnad.ts` | Create | Wikidata historical Lutheran parishes |
| `src/api/place-gazetteers/data/ee-vallad.json` | Create (gen) | Modern admin + boundaries |
| `src/api/place-gazetteers/data/ee-kihelkonnad.json` | Create (gen) | Historical parishes |
| `src/gazetteer-build/normalize-rules.ts` | Modify | Add `EE_RULES`: `maakond`, `vald`, `linn`, `kihelkond`, `kogudus`, `küla`, `alev`, `alevik`. Plus compound: strip the suffix when joined directly (e.g. `Tartumaa` → `Tartu`). |

## Tasks

### Task 0: License audit + source decisions

- [ ] Maa-amet license (CC BY 3.0 EE) attribution string.
- [ ] Wikidata SPARQL for kihelkonnad: `?p wdt:P31/wdt:P279* wd:Q3308141 . ?p wdt:P17 wd:Q191 .` Verify > 80 results.
- [ ] EE_RULES suffixes (longest-first): `kihelkond`, `kogudus`, `maakond`, `alev`, `alevik`, `linn`, `vald`, `küla`. Plus compound-form rule (handled in build script normalization, not the runtime rule list — but document the rule).

### Task 1: Extend normalize rules (TDD)

```typescript
expect(stripSuffix('Tartu maakond', EE_RULES)).toBe('Tartu');
expect(stripSuffix('Nõo vald', EE_RULES)).toBe('Nõo');
expect(stripSuffix('Pärnu linn', EE_RULES)).toBe('Pärnu');
expect(stripSuffix('Tartu kihelkond', EE_RULES)).toBe('Tartu');
// Compound form — handled by alias generation in build script:
// "Tartumaa" expanded as alias to "Tartu" + "Tartumaa" + "Tartu maakond"
```

### Task 2: Build `ee-vallad`

Maa-amet GeoPackage → tree. Maakond polygons + vald polygons. ~79 valds × polygon = small.

### Task 3: Wire + extend test (mirror DE Task 4)

### Task 4: Build `ee-kihelkonnad`

Wikidata SPARQL on historical Lutheran parishes (Q3308141 + country=Estonia + denomination=Lutheran). Many are defunct administrative units but their names are alive in genealogical records — emit as `type: 'parish'` with parent_path = pre-reform maakond derived from P131 chain.

### Task 5: Wire kihelkonnad

Mirror DE Task 6. Probes pulled from built data.

### Task 6: User smoke-check + close-out

Mirror DE Task 7. Six user-goal probes. Compound-form alias works. Minor bump. Archive.

## Self-review checklist

- [ ] Compound suffixes (`Tartumaa`) and split forms (`Tartu maakond`) both resolve.
- [ ] Post-2017 valds are canonical; pre-reform names are aliases.
- [ ] Setomaa appears as alias on relevant valds.
- [ ] Both gazetteers within budget.
- [ ] Plan archived; minor version bumped.
