# Tier 2 Eastern Europe Gazetteers (Batched)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

> Part of the European gazetteer roadmap (`docs/plans/2026-05-09-european-gazetteers-design.md`). Sister plan to `tier2-western-gazetteers.md` and `tier2-central-gazetteers.md`. Mirror their task structure; this document only enumerates the country-specific source decisions and probes.

> Includes Faroe Islands and Greenland as standalone gazetteers (per the design § 2.1 — Danish dependencies treated as their own roots, not folded into `dk-*`). Also includes Cyprus (geographically Asia, politically Europe; the design includes it).

> Russia and Turkey are scoped to their European parts only — `ru-eu-oblasts` covers Russia west of the Urals; `tr-eu-iller` covers Turkey west of the Bosphorus.

---

## User goal

A genealogist with ancestry from eastern-European Tier 2 countries — Bulgaria, Romania, Moldova, Greece, Cyprus, Belarus, Ukraine, European Russia, European Turkey, Faroe Islands, Greenland — types their place in their administrative form and it resolves to admin1 / admin2 / locality, with country-shape polygons + opportunistic admin1 polygons.

User-observable smoke probes:

- "София, България" / "Sofia, Bulgaria" → leaf=Sofia.
- "Plovdiv, Пловдив, България" → admin1=Plovdiv, leaf=Plovdiv.
- "București, România" → leaf=București.
- "Cluj-Napoca, Cluj, România" → admin1=Cluj, leaf=Cluj-Napoca.
- "Chișinău, Moldova" → leaf=Chișinău.
- "Αθήνα, Αττική, Ελλάδα" / "Athens, Attica, Greece" → admin1=Attica, leaf=Athens.
- "Λευκωσία, Κύπρος" / "Nicosia, Cyprus" → leaf=Nicosia.
- "Мінск, Беларусь" / "Minsk, Belarus" → leaf=Minsk.
- "Київ, Україна" / "Kyiv, Ukraine" → leaf=Kyiv.
- "Львів, Львівська область" / "Lviv, Lviv Oblast" → admin1=Lviv Oblast, leaf=Lviv.
- "Санкт-Петербург, Россия" / "Saint Petersburg, Russia" → leaf=Saint Petersburg.
- "Москва, Россия" → leaf=Moscow.
- "İstanbul, Türkiye" → leaf=Istanbul (only the European side; Asian side falls outside scope).
- "Tórshavn, Føroyar" → leaf=Tórshavn (Faroese capital).
- "Nuuk, Kalaallit Nunaat / Greenland" → leaf=Nuuk.

## Scope

**Per-country source decisions:**

| Country | Primary source | License | Admin levels | Notes |
|---|---|---|---|---|
| Bulgaria | NSI + GIS-сектор | CC BY 4.0 | Oblast (28) → Obshtina (~265) → Naseleno mjasto (~5,300) | Cyrillic + Latin aliases. |
| Romania | INS + ANCPI | CC BY 4.0 | Județ (41 + Bucharest) → Comună / Oraș / Municipiu (~3,180) → Sat (~13,000) | Hungarian aliases for Transylvanian places (genealogical relevance). |
| Moldova | BNS + ARFC | CC BY 4.0 (best effort) | Raion (32 + 3 municipalities + Gagauzia + Transnistria) → Comună (~898) | Transnistria as an admin1 facet (de-facto separate; Wikidata models it). |
| Greece | EL.STAT + KEGE | CC BY 4.0 | Periféria (13) → Periferiakí enótita (74) → Dímos (332) → Koinótita (~6,000) | Greek script as `name`, transliterated Latin as alias. |
| Cyprus | CYSTAT + DLS | CC BY 4.0 | Eparchia (6) → Dimotiká diamerísmata (~600) | Both Greek and Turkish names where applicable. |
| Belarus | Belstat + Goskartografia | (verify license) | Voblast (6 + Minsk City) → Rayon (~118) → Sielsavet (~1,400) | License audit critical — Belarus open data is not always CC-compatible. If audit fails, Wikidata-only fallback. |
| Ukraine | Derzhheokadastr + Ukrstat | CC BY 4.0 | Oblast (24 + Kyiv + Sevastopol) → Hromada (post-2020 reform, ~1,469) | Pre-2020 raion structure as aliases for genealogical record continuity. |
| Russia (European part, west of Urals) | Rosreestr + Rosstat (where licensed) | (verify license) | Federalnyy okrug (Central, Northwestern, Volga, Southern, North Caucasian — 5 of 8 fall in European Russia) → Subyekt (oblasts, krais, republics, federal cities — ~50 in European part) → Rayon → Sielskoye poseleniye | License audit critical; Wikidata fallback if Rosreestr inaccessible. Hard country boundary: include subyekty whose territory is entirely west of the Ural ridge; flag mixed-territory subyekty (Sverdlovsk, Chelyabinsk) for special handling — include them as admin1 if their administrative centre is European. |
| Turkey (European part, Thrace) | TÜİK + HGM | CC BY 4.0 | İl (provinces — only 3 fall in European Thrace: İstanbul-European-side, Tekirdağ, Edirne, Kırklareli) → İlçe → Mahalle / Köy | İstanbul is split: emit only the European-side districts as `tr-eu-` content; the Asian-side districts go to a future `tr-asia` plan. |
| Faroe Islands | Hagstova + Umhvørvisstovan | CC BY 4.0 | Kommunur (29) | Standalone tree rooted at `World > Europe > Faroe Islands`, not under DK. |
| Greenland | Statistics Greenland + Asiaq | CC BY 4.0 (best effort) | Kommune (5) → Bygd (~70 settlements) | Standalone tree rooted at `World > North America > Greenland`. |

**11 new gazetteers** (one per country): `bg-obshtini`, `ro-comune`, `md-raioane`, `gr-dimoi`, `cy-eparchies`, `by-rajony`, `ua-hromady`, `ru-eu-oblasts`, `tr-eu-iller`, `fo-kommunur`, `gl-kommune`.

**Scope deviations:**

- **No parishes anywhere.** Greek Orthodox parishes are out (could be a future per-country promotion plan). Romanian Orthodox parishes out.
- **Pre-1918 / pre-1991 historical layers:** Tsarist Russian Empire gubernii, Pale of Settlement, Ottoman vilayets, Habsburg-era Bukovina, Soviet Republics, Yugoslav Macedonia → `europe-historical`.
- **Crimea status:** Wikidata models it as part of Ukraine; we follow. If a record uses Russian-administered Crimean place names, they appear as Russian aliases on the Ukrainian admin1 node. The genealogist's word is what matters; resolution must succeed regardless of political status.
- **Transnistria:** as an admin1 facet of Moldova per Wikidata.
- **Asian Russia, Asian Turkey, Caucasus countries (AM, AZ, GE)** — out of scope per design § 2.3.

## Verification

1. **User smoke-check.** 15 probes resolve in running app.
2. **Per-country probes** appended to `tests/unit/european-coverage.test.ts`.
3. **Script-duality probe** for BG, RU, BY, UA, GR — Cyrillic/Greek and Latin transliterations both resolve.
4. **Standalone-root probe** for FO and GL — they resolve as their own roots, not under DK.
5. **Bundle:** ≤ 3 MB raw / 1 MB gzip per country. Aggregate ≤ 28 MB raw / ≤ 10 MB gzip.

## Failure modes / RCA

- **License-audit gate is the highest-risk step in this batch.** Belarus, Russia, Moldova, Ukraine, Greece, Romania — multiple sources have license ambiguity. The build script's first action MUST be license verification; if uncertain, fall back to Wikidata-only and document in `source.notes`.
- **Script transliteration discipline.** Use ICU / standard transliteration table per script (Cyrillic → Latin via BGN/PCGN; Greek → Latin via ELOT 743). Build script attaches both forms as aliases on every node. Don't roll your own transliteration heuristic.
- **Russia partial-territory subyekty.** Sverdlovsk and Chelyabinsk oblasts straddle the Urals. Document the inclusion rule (administrative-centre-determines-bucket) in the script header, not as a runtime decision.
- **Greenland-as-North-America:** the contract has `World > continent > country` rooting. Greenland's continent is North America (USGS) even though the genealogical user reach is Nordic. Don't move it to Europe to be helpful — that's a Prime Directive frankenstein. Aliases on the Greenland country node carry "Kalaallit Nunaat", "Grønland", and "Greenland" so any of them resolves.

## Tech stack

Per-country: national OGD + ogr2ogr + GeoNames + Wikidata SPARQL fallback.

## File structure

11 new build scripts; 11 new gazetteer JSONs; 11 new normalize-rule sets (`BG_RULES`, `RO_RULES`, `MD_RULES`, `GR_RULES`, `CY_RULES`, `BY_RULES`, `UA_RULES`, `RU_EU_RULES`, `TR_EU_RULES`, `FO_RULES`, `GL_RULES`).

## Tasks

Mirror `tier2-western-gazetteers.md`. Country order: BG → RO → MD → GR → CY → BY → UA → RU-EU → TR-EU → FO → GL.

### Task 0: License audit per country (mandatory)

| Country | URL working? | License OK? | Wikidata fallback ok? | Skip? Reason |
|---|---|---|---|---|
| BG | | | | |
| RO | | | | |
| MD | | | | |
| GR | | | | |
| CY | | | | |
| BY | | | | |
| UA | | | | |
| RU-EU | | | | |
| TR-EU | | | | |
| FO | | | | |
| GL | | | | |

### Task 1: Extend normalize rules per country (TDD)

Per-country suffix lists (longest-first), Cyrillic + Latin or Greek + Latin where applicable:

- **BG_RULES:** `oblast`, `obshtina`, `naseleno mjasto`, `град`, `общи́на`, `област`. Prefix `Град` (Cyrillic).
- **RO_RULES:** `județ`, `comună`, `municipiu`, `oraș`, `sat`. Prefix `Județul`.
- **MD_RULES:** `raion`, `municipiu`, `comună`, `sat`. (Romanian-style.)
- **GR_RULES:** `Periféria`, `Dímos`, `Periferiakí enótita`, `Koinótita`, `Περιφέρεια`, `Δήμος`, `Περιφερειακή ενότητα`, `Κοινότητα`.
- **CY_RULES:** `Eparchia`, `Επαρχία`, `Δήμος`, `Belediye` (Turkish for council, in Northern Cyprus).
- **BY_RULES:** `voblast`, `rayon`, `sielsavet`, `voblasć`, `вобласьць`, `раён`. Cyrillic + Latin.
- **UA_RULES:** `oblast`, `hromada`, `rayon` (legacy), `selyshche`, `область`, `громада`, `район`, `селище`. Cyrillic + Latin.
- **RU_EU_RULES:** `oblast`, `kray`, `respublika`, `gorod federalnogo znacheniya`, `rayon`, `gorodskoy okrug`, `selsky okrug`, plus Cyrillic equivalents (`область`, `край`, `республика`, etc.).
- **TR_EU_RULES:** `il`, `ilçe`, `mahalle`, `köy`, `İli`. Turkish suffixes.
- **FO_RULES:** `kommuna`, `kommunu`. Faroese is small.
- **GL_RULES:** `kommune`, `Kommunia`. Greenlandic + Danish.

### Tasks 2–12: Build per-country gazetteers

One task per country. Mirror DE Task 3.

### Task 13: Wire all 11 gazetteers

Mirror Western plan Task 11.

### Task 14: User smoke-check + close-out

Mirror Western plan Task 12. 15 user-goal probes. Script-duality probe for the five script-dual countries. Standalone-root probe for FO and GL. Minor version bump. Archive.

## Self-review checklist

- [ ] All 15 user-goal probes resolve.
- [ ] Cyrillic / Greek / Latin both resolve for BG, RU-EU, BY, UA, GR.
- [ ] FO and GL emitted as standalone roots; not under DK.
- [ ] Russia partial-territory rule (administrative-centre-determines-bucket) consistently applied.
- [ ] Belarus license audit either passed or Wikidata fallback used.
- [ ] All 11 gazetteers within budget; aggregate ≤ 10 MB gzip.
- [ ] Plan archived; minor version bumped.

---

## Tier 2 closeout

After this plan ships, all of geographical Europe (modulo explicitly-skipped countries documented in audit tables) has admin1 + admin2 + locality coverage. The remaining roadmap plan is `europe-historical`.
