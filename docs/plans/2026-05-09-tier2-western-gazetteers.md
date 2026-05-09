# Tier 2 Western Europe Gazetteers (Batched)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

> Part of the European gazetteer roadmap (`docs/plans/2026-05-09-european-gazetteers-design.md`). This plan covers 11 Tier 2 countries in one batch: per the design's plan-structure section, Tier 2 countries get admin1 + admin2 + localities only (no parishes), and the per-country research is mechanically similar enough to batch.

> Tier 2 countries skipped if no licensed source exists, with the reason documented in this plan's body. The design says: "if a country has no clean licensed source, we skip and document why."

---

## User goal

A genealogist with ancestry from Western European Tier 2 countries — Austria, Switzerland, Italy, Spain, Portugal, Malta, San Marino, Vatican City, Liechtenstein, Monaco, Andorra — types their place in their administrative form and it resolves to admin1 / admin2 / locality granularity, with country-shape polygons from the existing `world-boundaries` and opportunistic sub-national polygons where the national OGD trivially provides them.

User-observable smoke probes:

- "Wien, Österreich" → admin1=Wien, admin2=Wien (Austria capital is its own Bundesland).
- "Salzburg, Salzburg, Österreich" → admin1=Salzburg, admin2=Salzburg-Stadt, leaf=Salzburg.
- "Zürich, Zürich, Schweiz" → admin1=Zürich (canton), admin2=Bezirk Zürich, leaf=Zürich.
- "Genève, Genève, Suisse" → admin1=Genève (canton).
- "Roma, Lazio, Italia" → admin1=Lazio, admin2=Roma Capitale, leaf=Roma.
- "Firenze, Toscana" → admin1=Toscana, admin2=Firenze, leaf=Firenze.
- "Madrid, Comunidad de Madrid, España" → admin1=Comunidad de Madrid, admin2=Madrid, leaf=Madrid.
- "Lisboa, Portugal" → admin1=Área Metropolitana de Lisboa, leaf=Lisboa.
- "Valletta, Malta" → leaf=Valletta.
- "Vaduz, Liechtenstein" → leaf=Vaduz.
- "Andorra la Vella, Andorra" → leaf=Andorra la Vella.

(Smaller microstates — SM, VA, MC — get country-only resolution; their internal admin is too small to model meaningfully. Probes for them assert the country resolves and the capital is in the locality list.)

## Scope

**Per-country source decisions:**

| Country | Primary source | License | Admin levels | Notes |
|---|---|---|---|---|
| Austria | Statistik Austria — Verwaltungsgliederung | CC BY 4.0 | Bundesland (9) → Bezirk (~95) → Gemeinde (~2,100) | Boundaries available trivially; include if budget allows. |
| Switzerland | swisstopo + BfS | CC BY 4.0 | Kanton (26) → Bezirk (depends; some cantons have no Bezirk) → Gemeinde (~2,100) | Trilingual aliases (DE/FR/IT) where present; Romansh in GR canton. |
| Italy | ISTAT — Confini delle unità amministrative | CC BY 4.0 | Regione (20) → Provincia (~107) → Comune (~7,900) | Boundaries: regione + provincia. Comune-level polygons skipped (budget). |
| Spain | INE — Nomenclátor + IGN-CNIG | CC BY 4.0 | Comunidad Autónoma (17 + 2 ciudades) → Provincia (50) → Municipio (~8,100) | Catalan/Basque/Galician name aliases attached. |
| Portugal | INE-PT + DGTerritório | CC BY 4.0 | Distrito (18) → Município (~308) → Freguesia (~3,091) | Freguesias included as admin3 (parish-equivalent). |
| Malta | NSO Malta + Stamen Maps | CC BY 4.0 | Region (5) → Locality (~68) | Single-level admin; small. |
| San Marino | OpenStreetMap admin polygons | ODbL | Castelli (9) | Wikidata for hierarchy — primary; OSM for boundaries. |
| Vatican City | (country only) | (n/a) | (no internal admin) | One leaf, not a separate gazetteer. Folded into world-countries. |
| Liechtenstein | Amt für Statistik FL | CC BY 4.0 | Wahlkreis (2) → Gemeinde (11) | Tiny but has its own data. |
| Monaco | (country only — quartiers as aliases) | (n/a) | Quartier (10) — alias only | One leaf. Folded into world-countries with quartier aliases. |
| Andorra | Govern d'Andorra Open Data | CC BY 4.0 | Parròquia (7) | Single-level admin. |

**One gazetteer per country with viable data, plus aliases-only patches for VA and MC:**

- `at-gemeinden`, `ch-gemeinden`, `it-comuni`, `es-municipios`, `pt-freguesias`, `mt-localities`, `sm-castelli`, `li-gemeinden`, `ad-parroquies` — 9 new gazetteers.
- `vat` and `mc` country-level: extend `world-countries.json` aliases via a build-script touch-up (no separate gazetteer for either).

**Total new bundled gazetteers from this plan: 9.**

**Scope deviations explicit:**

- **No parishes anywhere in Tier 2** (per design). Italian parrocchie, Spanish parroquias, Portuguese paróquias, Austrian Pfarrgemeinden, Swiss Pfarreien — all out of scope. If any Tier 2 country surfaces strong genealogical demand later, that country gets promoted to a Tier 1 follow-up plan.
- **Pre-1918 Habsburg crown lands (Cisleithania), pre-1861 Italian states, pre-1834 Iberian historical kingdoms** out of scope; goes to `europe-historical`.
- **Boundaries:** opportunistic per design § Q4 — included only if the national OGD provides them in the fetch path the build script already has open. No separate boundary build effort.

## Verification

1. **User smoke-check (gate).** ~11 representative probes from § "User goal" resolve in running app.
2. **Per-country smoke probe set** appended to `tests/unit/european-coverage.test.ts`. Each country gets 2–3 probes (one admin1, one locality, one country-only or admin2).
3. **Bundle budget per country:** ≤ 3 MB raw / ≤ 1 MB gzip per gazetteer (Tier 2 budget per design § 5.3). The 9 new gazetteers combined: ≤ 25 MB raw / ≤ 8 MB gzip aggregate.

## Failure modes / RCA

- **Source-availability check is the gate.** For each country, the script's first action is verifying the source URL responds with the expected dataset. If the source has changed schema, vanished, or moved behind a paywall, the build script logs a warning and the country is added to a "skipped" list in this plan body. Don't ship degraded data; ship documented absence.
- **Trilingual / multilingual aliases discipline.** For CH (DE/FR/IT/RM), ES (Castellano/Català/Euskara/Galego), IT (Italian + regional minorities), every node has its dominant-language `name` and other languages as `aliases`. Sources that publish only the dominant language miss the multilingual aliases — Wikidata SPARQL fallback fills these gaps where possible, documented in `source.notes`.
- **Andorra and microstate parròquies/quartiers** — no merge logic in the loader; build scripts emit clean trees per the gazetteer Prime Directive.

## Tech stack

Per-country: national OGD GeoPackage / CSV + ogr2ogr + mapshaper (only where boundaries fit budget) + GeoNames per-country .zip + Wikidata SPARQL for multilingual alias enrichment.

## File structure

For each of the 9 in-scope countries, two changes:

| File | Status | Purpose |
|---|---|---|
| `scripts/build-<cc>-<primitive>.ts` | Create | National OGD + GeoNames → tree |
| `src/api/place-gazetteers/data/<cc>-<primitive>.json` | Create (gen) | Tree |

Plus shared:

| File | Status | Purpose |
|---|---|---|
| `src/gazetteer-build/normalize-rules.ts` | Modify | Add per-country normalize rules (`AT_RULES`, `CH_RULES`, `IT_RULES`, `ES_RULES`, `PT_RULES`, `MT_RULES`, `SM_RULES`, `LI_RULES`, `AD_RULES`) |
| `src/api/place-gazetteers/bundled.ts` | Modify | 9 imports + 9 entries + 9 normalize-rule mappings |
| `tests/unit/european-coverage.test.ts` | Modify | Append 11 country probe sets |
| `tests/unit/gazetteers.test.ts` | Modify | Bump count + IDs |
| `.claude/skills/gazetteers/SKILL.md` | Modify | 9 rows |
| `package.json` + `CHANGELOG.md` | Modify | minor bump |

## Tasks

### Task 0: License audit per country (mandatory pre-step per design § 3.1)

- [ ] **Step 1:** For each of the 11 countries, walk the source-decision matrix in § Scope. For each, verify the source URL responds and the license is compatible. Record per-country findings in this plan body, table form. If a country fails the audit (vanished source, incompatible license, no data), mark it skipped with reason.

| Country | URL working? | License OK? | Skip? Reason |
|---|---|---|---|
| AT | | | |
| CH | | | |
| ... | | | |

- [ ] **Step 2:** No commit — informational.

### Task 1: Extend normalize rules per country (TDD)

For each in-scope country, add a per-country rule set. One commit per country to keep diffs tight. Each commit follows the DE Task 1 pattern:

1. Append country-specific test cases to `tests/unit/normalize-rules.test.ts`.
2. Run, see fail.
3. Add suffixes to `<CC>_RULES`.
4. Run, see pass.
5. Commit `feat(gazetteer): add <CC> normalize rules`.

Suffix lists per country (longest-first within each):

- **AT_RULES:** `Bundesland`, `Bezirk`, `Gemeinde`, `Stadt`, `Markt`, `Pfarre`. (Pfarre included even though parishes are out of scope — strips it from input so admin2 still resolves.)
- **CH_RULES:** `Kanton`, `Bezirk`, `Gemeinde`, `Stadt`, `Canton de`, `Commune de`, `Cantone`, `Comune`. (Trilingual.)
- **IT_RULES:** `Regione`, `Provincia di`, `Provincia`, `Comune di`, `Comune`, `Frazione`, `Borgo`. Prefix `Provincia di`, `Comune di`.
- **ES_RULES:** `Comunidad Autónoma de`, `Provincia de`, `Municipio de`, `Comarca`. Plus prefix `Ciudad de`.
- **PT_RULES:** `Distrito de`, `Município de`, `Freguesia de`, `Concelho de`, `Cidade de`. Catalan/Galician variants where the source publishes them.
- **MT_RULES:** `Region`, `Lokalità`. Maltese is short; few suffixes.
- **SM_RULES:** `Castello di`, `Castello`. (San Marino's 9 castelli.)
- **LI_RULES:** `Wahlkreis`, `Gemeinde`. Same pattern as DE/AT.
- **AD_RULES:** `Parròquia de`, `Parròquia`.

### Task 2 — Task 10: Build per-country gazetteers (one task per country)

For each in-scope country, mirror DE Task 3 (build script structure):

- Download source from URL recorded in Task 0.
- Build tree (country → admin1 → admin2 → leaf).
- Where viable budget-wise, attach polygons from the same source (opportunistic per design § Q4).
- Multilingual aliases enrichment via Wikidata SPARQL — one SPARQL call per country, `?p rdfs:label ?l . FILTER(LANG(?l) IN ('en','sv','de','fr','it','es','pt','ca','eu','gl','rm'))`.
- Bundle-size gate: 3 MB raw / 1 MB gzip per gazetteer.
- Per-country commit: `feat(gazetteer): add <cc>-<primitive>`.

Country build order (alphabetical for review predictability): AT → AD → CH → ES → IT → LI → MT → PT → SM. (LU is in Tier 2 Central; FO and GL are Eastern.)

### Task 11: Wire all 9 gazetteers + extend coverage test

- [ ] **Step 1:** Add 9 static imports + 9 BUNDLED_GAZETTEERS entries + 9 NORMALIZE_RULES_BY_ID mappings in one commit.
- [ ] **Step 2:** Bump gazetteers.test.ts count + add 9 IDs.
- [ ] **Step 3:** Append 11 country probe sets to `tests/unit/european-coverage.test.ts` (VA and MC get country-only probes pulled from `world-countries`; the 9 in-scope countries get 2–3 probes each).
- [ ] **Step 4:** Update `world-countries.json` to add quartier aliases for Monaco and "Holy See" / "Vatican" form for Vatican City. (Or extend `lang-*` if appropriate — decided in the build script for VA/MC.)
- [ ] **Step 5:** Run full unit + lint pass.
- [ ] **Step 6:** Commit `feat(gazetteer): wire Tier 2 Western Europe (9 gazetteers)`.

### Task 12: User smoke-check + version bump + close-out

- [ ] **Step 1:** Run `npm start`. Type each of the 11 user-goal probes. Each must resolve.
- [ ] **Step 2:** Minor version bump.
- [ ] **Step 3:** CHANGELOG: "Add Tier 2 Western Europe gazetteers — Austria, Switzerland, Italy, Spain, Portugal, Malta, San Marino, Liechtenstein, Andorra. Vatican City and Monaco patched into world-countries with capital aliases."
- [ ] **Step 4:** Update `docs/PLAN.md`.
- [ ] **Step 5:** Tick all checkboxes; archive plan.
- [ ] **Step 6:** Final commit.

## Self-review checklist

- [ ] All 11 user-goal probes resolve in the running app.
- [ ] Multilingual aliases work (CH trilingual, ES with Catalan/Euskara/Galego, IT with regional minorities).
- [ ] Skipped countries (if any) documented with reason in Task 0 table.
- [ ] All 9 new gazetteers within per-country budget.
- [ ] Aggregate Tier 2 Western addition ≤ 25 MB raw / ≤ 8 MB gzip.
- [ ] Plan archived; minor version bumped.
