# European Country Gazetteers — Roadmap & Design

**Status:** Approved (design) — implementation plans to follow per phase
**Date:** 2026-05-01

## User goal

When a Swedish genealogist enters a place name from a European country other than the Nordics — a German village, a Polish town, an English parish, a Belgian commune, a French département — the place picker finds it with admin1 + admin2 precision and drops a map pin in the right spot. Same fidelity I have today for Sweden, Denmark, Norway, Finland, Iceland.

Today most of Europe is country-level only: "Bryssel" lands at Belgium's centroid, "Hamburg-Altona" doesn't resolve at all, and the user has to hand-coordinate every non-Nordic place. The user-observable outcome of this roadmap is that across all paneled views (PersonPanel, EventPanel, ResearchTaskPanel, place picker) entries from priority European countries resolve as cleanly as a Swedish parish does today — never again "I had to type the coordinates by hand because the resolver couldn't find Stettin."

## Scope

This is a **roadmap**, not a single implementation plan. It defines the sequencing, conventions, sources, and per-country template that every European-country gazetteer will follow. Each country in the table below becomes **its own implementation plan** when scheduled.

**Countries in scope** (7 priority + 1 deferred):

| # | Country | ISO | Primary admin units |
|---|---|---|---|
| 1 | Germany | DE | Bundesländer + Kreise + Gemeinden |
| 2 | Poland | PL | Województwa + Powiaty + Gminy |
| 3 | United Kingdom | GB | Countries + Counties + Districts/Parishes |
| 4 | Netherlands | NL | Provincies + Gemeenten |
| 5 | Belgium | BE | Régions + Provinces + Communes |
| 6 | France | FR | Régions + Départements + Communes |
| 7 | Estonia / Latvia / Lithuania | EE/LV/LT | Maakonnad / Apriņķi / Apskritys + Vallad / Pagasti / Savivaldybės |
| 8 | Russia | RU | (deferred — see deviations) |

**Each country's plan must deliver:** a `<cc>-<unit>.json` point gazetteer, a `<cc>-<unit>-boundaries.json` boundary gazetteer (subject to the bundle-size strategy below), `bundled.ts` registration, resolver suffix-strip extensions, and unit tests covering the country's capital + at least one secondary city + one historically-known place from that country (e.g. Stettin/Szczecin for PL, Königsberg/Kaliningrad for the Baltics).

**Scope deviations (explicit):**

- **Russia (RU)** — deferred. Source quality varies, ROI for Swedish genealogists is lower than the priority 7, and the political/data sensitivity warrants a separate decision later. Not "out of scope" — explicitly *not in this roadmap's first wave*.
- **Parish-level coverage for non-DK European countries** — out. Each country has its own ecclesiastical record system; treating any of them with the care `sv-forsamlingar` gets is a multi-year per-country project. Phase plans deliver admin1+admin2 only. Parish coverage may be added later as separate roadmaps.
- **Pre-1900 historical empires within Europe** (Habsburg, Prussia in its 1871 borders, Russian Empire boundaries in Finland, etc.) — covered by the existing `world-historical` gazetteer, not by per-country plans. Each phase MAY add country-relevant historical aliases (e.g. "Stettin" → Szczecin) to `lang-sv-*` exonym files, but does not build a new historical-territory gazetteer.
- **Languages other than the country's own + Swedish exonyms** — out. A German village resolves on its German name plus its Swedish exonym (when present in `lang-sv-*`). No English / French / Spanish exonym tables.
- **Country-specific national open-data feeds beyond GeoNames + Wikidata** — out, with one possible exception: if a country has a clearly-licensed, unambiguously-authoritative dataset (DK's DAWA is the exemplar), its per-country plan may use it. Default is GeoNames + Wikidata only.

## Verification

This roadmap is verified — at the roadmap level — by the cumulative user-observable outcome across phases. It is not verified by "the design doc compiled."

**Per phase (each country plan) verifies its own user goal:** open the running app, enter the country's capital + 2 representative secondary places + 1 historically-relevant place in the place picker, confirm each resolves to the right admin2 with a map pin in the correct location. A unit test in `tests/unit/gazetteers.test.ts` asserts the same resolutions programmatically. Lint + vitest passing alone do **not** count.

**At roadmap level**, verification is "the user-observable goal at the top of this doc is true for the priority-7 countries." The roadmap is *complete* when:

1. Every priority-7 country has shipped its phase plan.
2. A roadmap-level smoke check (5 minutes, by the user) walks through one representative place per shipped country and confirms resolution + map pin.
3. The original "Bryssel" gap and the original "Hamburg-Altona" gap that motivated this work both resolve cleanly.

The roadmap is *not* verified by counting JSON files or by `BUNDLED_GAZETTEERS.length` increasing. Structure-only checks are hygiene, not verification.

## Failure modes / RCA reference

No prior failed attempt at European gazetteers. **However**, two failure modes from adjacent work apply and must be read before any phase plan starts:

- **Inferred-data drift** (CLAUDE.md Prime Directive). Build scripts MUST NOT persist resolved coordinates back to the user's DB. The gazetteer JSON is canonical reference data; the resolver computes on render. Do not "helpfully" populate a place's `latitude` / `longitude` columns from the gazetteer build output — that pins the user's DB to a specific build version of the gazetteer.
- **Mechanism-first plan drift** (`.claude/rules/plans.md`). The panel-composables refactor (v0.190.0–v0.190.2) shipped half-consistent because it described mechanism instead of user-observable goal. Each per-country plan must open with "when I type X, I see Y" — not "extract `build-de-municipalities.ts`."

## Already shipped (state of the world, 2026-05-02)

The **DE point gazetteer is already in the bundle**: `de-gemeinden.json` (~600 KB, Bundesland → Kreis → populated places ≥ 5000 pop), `scripts/build-de-municipalities.ts`, `bundled.ts` registration, `DE_RULES` suffix-strip, and 5 unit tests in `tests/unit/gazetteers.test.ts` covering Hamburg, Bayern, "Landkreis Schwabach"-suffix-strip, and Schleswig-Holstein. This shipped before this roadmap was written.

**What's still missing for Germany:**

- **DE boundary gazetteer** — no `de-gemeinden-boundaries.json`, no `build-de-boundaries.ts`. The map can drop pins for German places but cannot highlight the Bundesland or Kreis polygon when a user clicks one.
- **Coverage gap audit.** The existing point gazetteer uses a `≥ 5000 pop` threshold, which excludes a large portion of genealogically-relevant German villages and hamlets. Phase 1 must measure how often real user input fails to resolve, then decide whether to lower the threshold, supplement with Wikidata-named places, or accept the gap (resolver still lands at the parent Kreis, which is acceptable for many cases).
- **Bundle-size measurement** — the binding decision in this roadmap (simplify-and-ship-boundaries) hasn't been validated yet; phase 1 produces the first real number.

Phase 1's user goal is therefore "complete the DE story end-to-end" — not "build DE from scratch."

## Sequencing

Driven by **expected user demand** (Swedish-genealogist context) plus **source quality**. Order is recommended; the user can re-prioritise.

| # | Country | Why prioritised | Sources |
|---|---|---|---|
| 1 | **Germany** (DE) | Largest emigration source historically; Schleswig-Holstein adjoins DK. **Point already shipped; phase 1 finishes boundaries + coverage audit.** | GeoNames admin1+admin2; Wikidata Gemeinden |
| 2 | **Poland** (PL) | Significant Swedish-Polish migration; complex 19th-c. partitioned territory | GeoNames + Wikidata; historical aliases via `lang-sv-pl` |
| 3 | **United Kingdom** (GB) | English/Scottish/Irish parish records widely cross-referenced | GeoNames + ONS open data + Wikidata; parishes are tricky (CofE vs civil) |
| 4 | **Netherlands** (NL) | Strong Dutch-Swedish trade history | GeoNames admin1 (provincies) + admin2 (gemeenten) |
| 5 | **Belgium** (BE) | "Bryssel" gap, immediate fix for the user's flagged case | GeoNames admin1 (régions) + admin2 (communes/gemeenten) |
| 6 | **France** (FR) | Significant migration to/from Sweden; strong open-data ecosystem | GeoNames admin1 (régions) + admin2 (départements + communes) |
| 7 | **Estonia / Latvia / Lithuania** (EE/LV/LT) | Historical Swedish territory (Estonia 1561–1721); Baltic German records | GeoNames + Wikidata |
| — | Russia (RU) | Deferred — see scope deviations | — |

## Per-country file structure (template)

Every European country gazetteer follows this template, mirroring `dk-sogne` / `no-kommuner` / `fi-kunnat`:

| File | Tier | Purpose |
|---|---|---|
| `<cc>-<unit>.json` | point (level 1–3) | Country + admin1 (region) + admin2 (municipality) — sometimes admin3 if relevant |
| `<cc>-<unit>-boundaries.json` | boundary | Same hierarchy with geoshape geometries (subject to bundle-size strategy) |
| (parishes / sogn equivalents) | point — only if a canonical source exists | Out of scope per deviations above |

`<cc>` = ISO 3166-1 alpha-2 lowercased. `<unit>` is country-specific (gemeinden, województwa, comunes, départements, communes, …).

## Canonical sources — non-negotiable

Every country uses **GeoNames + Wikidata** as the two canonical sources. Country-specific national open-data feeds only when clearly open-licensed and unambiguously authoritative.

- **GeoNames** (CC BY 4.0): admin1 + admin2 codes, names, populations, centroids. Mature, audited, the same dataset world-countries / world-admin1 already use.
- **Wikidata** (CC0 1.0): aliases, geoshapes (`wdt:P3896`), historical names, multilingual labels.

Build scripts MUST cite source + license in the file header (existing convention) and store the `source` block in the gazetteer JSON.

## Architecture pattern (per country)

For each country `cc`:

1. `scripts/build-<cc>-municipalities.ts` (point): GeoNames country code → admin1 + admin2 → flat tree under the country root.
2. `scripts/build-<cc>-boundaries.ts` (boundary): Wikidata SPARQL for the same admin1/admin2 entities, fetch geoshape per entity, output the same tree shape with `geometry` populated. **Apply the chosen geometry-simplification step** (see bundle-size strategy below).
3. `bundled.ts` registration. `BUNDLED_GAZETTEERS` count grows by 1–2 per country (point + optionally boundary).
4. Tests in `tests/unit/gazetteers.test.ts`: capital + secondary city + one historically-relevant place must resolve. Count assertion updated.
5. Resolver suffix-strip list extended with the country's admin suffixes (DE: `Land`, `Bezirk`, `Kreis`, `Gemeinde`; FR: `Département`, `Région`; etc.).

## Bundle size strategy

Current bundle ~42 MB has headroom but not unlimited. Each new point gazetteer is typically 500 KB–2 MB; each boundary gazetteer 5–20 MB raw. All 7 priority countries unsimplified ≈ +50–100 MB → ~100–150 MB total. **Significant — must be addressed before phase 1 ships.**

**Decision (binding for phase 1, revisitable thereafter):**

- **Apply geometry simplification** (Mapshaper or topojson) at build time on every boundary gazetteer, targeting 50–80% vertex reduction. Mature pattern — `world-boundaries` already does this. The phase 1 (Germany) plan will measure actual size impact and either confirm this strategy for the rest of the priority-7 or escalate to lazy-loading.
- **Phase 1 ships boundaries** for Germany. If post-simplification the bundle has grown by more than +15 MB for DE alone, phase 2+ defaults to **point-only** and a follow-up roadmap is written for adding boundaries to the rest.
- **Lazy-load per country** is *not* adopted up front — it's a bigger code change in `GazetteersView` and the bundled registration path. Reserved as escalation if simplification proves insufficient.

This decision is binding for the phase 1 (Germany) plan. Phase 2 may revisit based on phase 1's measured outcome.

## Phase 1 deliverable shape

**Decision:** Phase 1 (Germany) ships as a **single atomic plan** that completes the DE story — boundary gazetteer + coverage audit of the existing point gazetteer + tests + bundled.ts registration — in one branch / one merge. The point gazetteer is already shipped (see "Already shipped" above) so phase 1 does not re-build it; it audits coverage and decides whether to extend it (separate scope decision inside the plan).

Subsequent countries follow the **single atomic shape from scratch** — point + boundary + tests in one merge — because nothing of theirs is pre-shipped. Splitting creates half-shipped states where the resolver knows place names but the map can't draw them, which is exactly the half-consistency failure mode `.claude/rules/plans.md` exists to prevent. Internal task breakdown within a plan is fine and expected.

## Open questions (non-blocking for phase 1)

- **CI bundle-size budget enforcement.** Add a check that fails if `dist-*` exceeds a threshold? Worth flagging once phase 1 ships and we have a real number; not a phase 1 prerequisite.
- **Parish coverage for GB.** English/Scottish parish records are heavily used in genealogy and the CofE vs civil distinction is non-trivial. Phase 3 (GB) plan should explicitly call out whether to attempt parishes (raising it from a 1–3 day job to a 1–3 week job) or stay at admin2 with a follow-up parish roadmap.

## Next step

Approved roadmap. Write the implementation plan for **phase 1 only (Germany)**: `docs/plans/2026-05-XX-de-gazetteer.md`, following `.claude/rules/plans.md` (User goal, Scope, Verification, RCA footer if needed). Subsequent countries get their own plans on cadence.
