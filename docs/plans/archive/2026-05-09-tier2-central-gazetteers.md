# Tier 2 Central Europe Gazetteers (Batched)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

> Part of the European gazetteer roadmap (`docs/plans/2026-05-09-european-gazetteers-design.md`). Sister plan to `tier2-western-gazetteers.md` and `tier2-eastern-gazetteers.md`. Same shape (admin1 + admin2 + localities, no parishes, opportunistic boundaries), different countries. Mirror the Western plan task structure exactly; this document only enumerates the country-specific source decisions and probes.

> Includes Luxembourg (which is geographically borderline Western but politically/historically aligned with the central-European admin pattern).

---

## User goal

A genealogist with ancestry from central-European Tier 2 countries — Czechia, Slovakia, Hungary, Slovenia, Croatia, Bosnia and Herzegovina, Serbia, Montenegro, North Macedonia, Albania, Kosovo, Luxembourg — types their place in their administrative form and it resolves to admin1 / admin2 / locality, with country-shape polygons + opportunistic admin1 polygons where national OGD provides them.

User-observable smoke probes:

- "Praha, Hlavní město Praha, Česko" → admin1=Hlavní město Praha, leaf=Praha.
- "Brno, Jihomoravský kraj" → admin1=Jihomoravský kraj, admin2=Brno-město, leaf=Brno.
- "Bratislava, Slovensko" → admin1=Bratislavský kraj, leaf=Bratislava.
- "Budapest, Magyarország" → leaf=Budapest (county-level capital).
- "Debrecen, Hajdú-Bihar megye, Magyarország" → admin1=Hajdú-Bihar, leaf=Debrecen.
- "Ljubljana, Slovenija" → admin1=Osrednjeslovenska, leaf=Ljubljana.
- "Zagreb, Hrvatska" → leaf=Zagreb.
- "Sarajevo, Bosna i Hercegovina" → admin1=Federacija (or Republika Srpska); leaf=Sarajevo.
- "Beograd, Srbija" → leaf=Beograd.
- "Podgorica, Crna Gora" → leaf=Podgorica.
- "Skopje, Severna Makedonija" → leaf=Skopje.
- "Tirana, Shqipëria" → leaf=Tirana.
- "Pristina, Kosovo" → leaf=Pristina.
- "Luxembourg, Luxembourg" → leaf=Luxembourg (capital).

## Scope

**Per-country source decisions:**

| Country | Primary source | License | Admin levels | Notes |
|---|---|---|---|---|
| Czechia | ČSÚ + ČÚZK — RUIAN | CC BY 4.0 | Kraj (14) → Okres (~76) → Obec (~6,250) | Boundaries: kraj + okres. |
| Slovakia | ÚGKK SR + GeoNames | CC BY 4.0 | Kraj (8) → Okres (79) → Obec (~2,890) | |
| Hungary | KSH + Lechner Tudásközpont | CC BY 4.0 | Megye (19 + Budapest) → Járás (197) → Település (~3,150) | Pre-Trianon counties as aliases where genealogically common. |
| Slovenia | SURS + GU RS | CC BY 4.0 | Statistical region (12) → Občina (212) → Naselje (~6,000) | Statistical region is admin1 facet — Slovenia has no formal admin1. |
| Croatia | DZS + Državna geodetska uprava | CC BY 4.0 | Županija (20 + Zagreb) → Općina/Grad (~556) → Naselje (~6,750) | |
| Bosnia and Herzegovina | Federalni zavod za statistiku + RZS | CC BY 4.0 (best effort) | Entitet (Federation / RS / Brčko) → Kanton (Federation only, 10) → Općina (~143) | Entity duality is a structural feature; emit Federation + RS as admin1 facets. |
| Serbia | SORS + Republički geodetski zavod | CC BY 4.0 (best effort) | Okrug (29 + Belgrade) → Opština (~174) | |
| Montenegro | MONSTAT | CC BY 4.0 (best effort) | Opština (24) | Single-level. |
| North Macedonia | DZS + Agencija za katastar | CC BY 4.0 (best effort) | Region (8) → Opština (80) | |
| Albania | INSTAT + ASIG (Authority for Geospatial Information) | CC BY 4.0 (best effort) | Qark (12) → Bashki (61) → Njësia administrative (~373) | |
| Kosovo | ASK + Kosovo Cadastral Agency | CC BY 4.0 (best effort) | District (7) → Komuna (38) | |
| Luxembourg | STATEC + ACT | CC BY 4.0 | District (3) — abolished 2015 → Canton (12) → Commune (~100) | Pre-2015 districts as aliases. |

**12 new gazetteers** (one per country): `cz-obce`, `sk-obce`, `hu-telepulesek`, `si-obcine`, `hr-opcine`, `ba-opstine`, `rs-opstine`, `me-opstine`, `mk-opstini`, `al-bashkite`, `xk-komunat`, `lu-communes`.

**Scope deviations:**

- **No parishes anywhere** (Tier 2 default per design).
- **Pre-1918 Austria-Hungary admin layers** (Cisleithania, Transleithania, Hungarian counties pre-Trianon, Croatia-Slavonia, Bosnia-Herzegovina condominium 1878–1918) → `europe-historical`.
- **Yugoslav SFRJ admin (1945–1992)** → `europe-historical`.
- **Soviet-era Albanian admin (rrethet)** → `europe-historical`.
- **Cyrillic / Latin script duality** (Serbia, Bosnia, Montenegro, North Macedonia): build scripts emit Latin as `name` and Cyrillic as `aliases` (or vice versa, per source convention); both must resolve.
- **Disputed-recognition status of Kosovo:** ship `xk-komunat` regardless of political status; the user wrote it down with a name; the resolver should find it. Wikidata uses Q1246; we follow.

## Verification

1. **User smoke-check.** 14 probes resolve in running app.
2. **Per-country probes** appended to `tests/unit/european-coverage.test.ts`.
3. **Cyrillic/Latin probe** for RS, BA, ME, MK: typing the same place in either script resolves to the same node.
4. **Bundle:** ≤ 3 MB raw / 1 MB gzip per country. Aggregate Tier 2 Central addition: ≤ 30 MB raw / ≤ 10 MB gzip.

## Failure modes / RCA

- **Source-availability per country.** Western Balkans portals are less stable than EU OGD portals; if a source is offline, retry or document skip with reason. Note that Wikidata SPARQL is always a working fallback for hierarchy at admin1+admin2; only locality-level data may be lost.
- **Hungarian Trianon-1920 names.** Pre-Trianon Magyar names of places now in RO / SK / RS / UA / SI / HR / AT must resolve via aliases on the modern node OR via `europe-historical` for the pre-Trianon administrative reference. Coverage rule: if the place is currently inside Hungary, alias the historical Magyar name on the modern node; if it crossed a border, the modern country's gazetteer carries the modern name and `europe-historical` carries the pre-Trianon name.
- **Slovenian no-admin1 quirk.** SI has no constitutional admin1 (no states); statistical regions are statistical, not legal. Emit them as admin1 facets so the genealogical hierarchy still has a level there; document in `source.notes`.

## Tech stack

Per-country: national OGD + ogr2ogr (where boundaries) + GeoNames + Wikidata SPARQL.

## File structure

12 new build scripts; 12 new gazetteer JSONs; 12 new normalize-rule sets (`CZ_RULES`, `SK_RULES`, `HU_RULES`, `SI_RULES`, `HR_RULES`, `BA_RULES`, `RS_RULES`, `ME_RULES`, `MK_RULES`, `AL_RULES`, `XK_RULES`, `LU_RULES`).

## Tasks

Mirror `tier2-western-gazetteers.md` task structure exactly. Tasks 0–12 with the country list adjusted.

### Task 0: License audit per country (table form, mandatory)

| Country | URL working? | License OK? | Skip? Reason |
|---|---|---|---|
| CZ | | | |
| SK | | | |
| HU | | | |
| SI | | | |
| HR | | | |
| BA | | | |
| RS | | | |
| ME | | | |
| MK | | | |
| AL | | | |
| XK | | | |
| LU | | | |

### Task 1: Extend normalize rules per country (TDD)

Suffix lists per country (longest-first):

- **CZ_RULES:** `Hlavní město`, `Kraj`, `Okres`, `Obec`, `Město`. Prefix `Hlavní město`.
- **SK_RULES:** `Kraj`, `Okres`, `Obec`, `Mesto`. Prefix `Hlavné mesto`.
- **HU_RULES:** `megye`, `járás`, `város`, `község`, `kerület`. Plus prefix-form `Vármegye` (historical).
- **SI_RULES:** `Občina`, `Mestna občina`, `Statistična regija`. Prefix `Mestna občina`.
- **HR_RULES:** `Županija`, `Općina`, `Grad`, `Naselje`. Prefix `Grad`.
- **BA_RULES:** `Federacija`, `Republika`, `Kanton`, `Općina`, `Grad`, `Općina/Opština` (script duality).
- **RS_RULES:** `Okrug`, `Opština`, `Grad`. Cyrillic forms (`Округ`, `Општина`, `Град`) included for direct-match.
- **ME_RULES:** `Opština`, `Glavni grad`. Cyrillic forms.
- **MK_RULES:** `Општина` (Cyrillic) and `Opština` (Latin), `Регион`/`Region`.
- **AL_RULES:** `Qark`, `Bashki`, `Njësia administrative`.
- **XK_RULES:** `Komuna`, `Distrikti`. Albanian + Serbian forms.
- **LU_RULES:** `Canton de`, `Commune de`, `Ville de`, `District de`. Trilingual (FR/DE/LB).

### Tasks 2–13: Build per-country gazetteers

One task per country, mirroring DE Task 3. 12 tasks total. Country order: CZ → SK → HU → SI → HR → BA → RS → ME → MK → AL → XK → LU.

### Task 14: Wire all 12 gazetteers

Mirror Western plan Task 11.

### Task 15: User smoke-check + close-out

Mirror Western plan Task 12. 14 user-goal probes. Cyrillic/Latin probe for the four script-dual countries. Minor version bump. Archive.

## Self-review checklist

- [x] All 14 user-goal probes resolve.
- [x] Cyrillic and Latin scripts both resolve for RS, BA, ME, MK.
- [x] Hungarian Trianon-era aliases attach to modern non-Hungary nodes correctly (no double-attachment to both modern country and Hungarian county).
- [x] Bosnia-Herzegovina Entity duality (Federation / RS / Brčko) emitted as admin1 facets.
- [x] Slovenian statistical regions emitted as admin1 facets with documentation in `source.notes`.
- [x] Skipped countries (if any) documented with reason.
- [x] All 12 gazetteers within budget; aggregate ≤ 10 MB gzip.
- [x] Plan archived; minor version bumped.
