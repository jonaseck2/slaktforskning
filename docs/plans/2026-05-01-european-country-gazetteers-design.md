# European Country Gazetteers — Roadmap & Design

**Status:** Approved (design) — implementation plans to follow per phase
**Date:** 2026-05-01

## Goal

Bring European countries (other than the existing SE/DK/NO/FI/IS/CA/US/IS) to parity with the Nordics for genealogical place resolution. Today the bundled set leaves most of Europe at the country level only (`world-countries.json`) — no admin1 (regions), no admin2 (municipalities/districts), no parishes. A Belgian, German, Polish, French, or British genealogical entry pretty much has to be hand-coordinated by the user; the resolver can't help.

This is **the largest of the five gazetteer-improvement specs.** It's not one feature — it's a programme of per-country builds. The design here is the *roadmap* (sequencing, sources, conventions). Each individual country gets its own implementation plan when its turn comes.

## Why

- Genealogy in Europe routinely crosses borders. Swedish-American records reference German and Polish villages. Danish records reference Schleswig-Holstein (now Germany). Brussels-the-city is a known data gap (probe earlier this session).
- The existing infrastructure (GeoNames + Wikidata + the `gazetteers` skill + the build pipeline) makes adding a country *mechanical* once you have a source. The blocker is choosing the right source per country and accepting it's a 1–3 day job per country to do well.

## Sequencing — high to low priority

Driven by **expected user demand** (Swedish-genealogist context) plus **source quality**. We don't try to build all of Europe at once.

| # | Country | Why prioritised | Sources |
|---|---|---|---|
| 1 | **Germany** (DE) | Largest emigration source historically; Schleswig-Holstein adjoins DK | GeoNames admin1+admin2; Wikidata Gemeinden; OpenStreetMap-derived for parishes if available |
| 2 | **Poland** (PL) | Significant Swedish-Polish migration; complex 19th-c. partitioned territory | GeoNames + Wikidata; historical-territory note via existing `world-historical` |
| 3 | **United Kingdom** (GB) | English/Scottish/Irish parish records widely cross-referenced | GeoNames + ONS open data + Wikidata; parishes are tricky (CofE vs civil) |
| 4 | **Netherlands** (NL) | Strong Dutch-Swedish trade history | GeoNames admin1 (provincies) + admin2 (gemeenten); Kadaster for parishes |
| 5 | **Belgium** (BE) | "Bryssel" gap, immediate fix for the user's flagged case | GeoNames admin1 (régions/communautés) + admin2 (communes/gemeenten) |
| 6 | **France** (FR) | Significant migration to/from Sweden; strong open-data ecosystem | GeoNames admin1 (régions) + admin2 (départements + communes) |
| 7 | **Estonia / Latvia / Lithuania** (EE/LV/LT) | Historical Swedish territory (Estonia 1561–1721); Baltic German records | GeoNames + Wikidata |
| 8 | **Russia** (RU) | Historical Swedish-Russian wars; Russian Empire records | Out of immediate scope — separate consideration due to political/data sensitivity |

Each row in the table becomes its own implementation plan when scheduled. Order is recommended but not binding — the user can re-prioritise based on actual needs.

## Per-country structure (template)

Every European country gazetteer follows this template, mirroring the existing `dk-sogne` / `no-kommuner` / `fi-kunnat` shape:

| File | Tier | Purpose |
|---|---|---|
| `<cc>-<unit>.json` | point (level 1–3) | The country itself + admin1 (region) + admin2 (municipality) — sometimes admin3 if relevant |
| `<cc>-<unit>-boundaries.json` | boundary | Same hierarchy, with geoshape geometries for the map |
| (parishes / sogn equivalents) | point — only if a canonical source exists | Some countries have well-curated parish datasets (DK has DAWA + Folkekirken); most don't. **No invented parish data.** |

`<cc>` = ISO 3166-1 alpha-2 lowercased (de, pl, gb, nl, be, fr, ee, lv, lt, ru). `<unit>` is country-specific (kommuner, gemeinden, woiwództwa, comunes, départements, communes, …).

## Canonical sources — non-negotiable

Every country uses **GeoNames + Wikidata** as the two canonical sources. No country-specific national open-data feeds unless they are clearly licensed open and unambiguously authoritative (DK's DAWA is one such; most countries don't have a clean equivalent).

- **GeoNames** (CC BY 4.0): admin1 + admin2 codes, names, populations, centroids. Mature, audited, the same dataset the existing world-countries/world-admin1 uses.
- **Wikidata** (CC0 1.0): aliases, geoshapes, historical names, multilingual labels. Mature SPARQL endpoint.

Build scripts MUST cite source + license in the file header (existing convention) and store the `source` block in the gazetteer JSON.

## Architecture pattern (per country)

For each country `cc`:

1. `scripts/build-<cc>-municipalities.ts` (point): GeoNames country code → admin1 + admin2 → output flat tree under the country root.
2. `scripts/build-<cc>-boundaries.ts` (boundary): Wikidata SPARQL for the same admin1/admin2 entities, fetch `wdt:P3896` geoshape for each, output the same tree shape with `geometry` populated.
3. `bundled.ts` registration. `BUNDLED_GAZETTEERS` count grows by 2 per country (point + boundary).
4. Tests: existing pattern in `tests/unit/gazetteers.test.ts` — count assertions, smoke resolution test for the country's capital + one secondary city.
5. Resolver suffix-strip list extended with the country's admin suffixes (e.g. for DE: `Land`, `Bezirk`, `Kreis`, `Gemeinde`).

## Bundle size budget

The current ~42 MB bundle has headroom. Each new country point gazetteer is typically 500 KB–2 MB; boundaries can be 5–20 MB depending on geometry detail. Adding all 7 priority countries' point + boundary gazetteers is roughly +50–100 MB — pushing the bundle to ~100–150 MB. **This is significant and warrants discussion before phase 1 ships.** Three mitigation options:

a. **Geometry simplification.** Use a build-time simplifier (Mapshaper, topojson) on the boundary GeoJSON to reduce vertex count by 50–80% with negligible visual impact at the zoom levels the map renders. Mature pattern — the existing world-boundaries already does this.
b. **Lazy-load per country.** Don't bundle every country's boundaries — load on demand from the dist folder when the user enables that country in `GazetteersView`. Bigger code change; defer unless option (a) isn't enough.
c. **Skip boundaries for non-Nordic countries.** Point gazetteers only for the new countries; map pins still work, polygon highlighting just doesn't. The cheapest option, smallest UX hit.

Recommendation: **(a)** + **(c) for the lower-priority countries**. Phase 1 (Germany) tests whether the simplification budget is sufficient.

## Out of scope

- **Russia and Eastern European post-Soviet states' detailed admin trees.** Politically sensitive, source quality varies, ROI for Swedish genealogists is lower. Tackle separately.
- **Pre-1900 historical empires within Europe.** Already partially covered by `world-historical`. Better aligned to that gazetteer than to per-country builds.
- **Parish-level coverage for non-DK European countries.** Each country has its own ecclesiastical record system; treating them with the same level of care as Sweden's `sv-forsamlingar` is a multi-year project per country. Out of immediate scope.
- **Languages other than the country's own + Swedish exonyms.** A German village resolved by a Swedish user gets its German name + the Swedish exonym (when present in `lang-sv-*`). We do not also include English/French/Spanish translations.

## Open questions

- **Phase 1 deliverable shape:** does Germany ship as a single PR/release (point + boundaries + tests + resolver suffixes), or split into smaller chunks? Recommend single ship per country for atomicity, but the implementation plan can split internally.
- **Bundle-size budget enforcement:** add a CI check that fails if `dist-*` exceeds a threshold? Out of scope for this design but worth flagging once phase 1 ships.

## Next step after this spec

Approve this roadmap. Then write the implementation plan for **phase 1 only (Germany)**. Subsequent countries get their own plans on cadence.
