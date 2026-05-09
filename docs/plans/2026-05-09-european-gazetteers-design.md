# European Gazetteers — Design Spec

**Date:** 2026-05-09
**Status:** Draft, awaiting user review
**Scope:** All ~50 countries of geographical Europe; admin1 → admin2 → localities everywhere; parishes + boundaries for Tier 1; one blanket historical-states gazetteer.

This design is the strategy document the `2026-05-01-german-gazetteer.md` plan referred to as "the multi-country roadmap" but which never landed. Germany was Phase 1 of an unwritten roadmap; this is that roadmap, written eight days late, with Germany retro-upgraded to full Tier 1.

---

## 1. User goal

A genealogist anywhere in Europe types their place name in the administrative form they have it written down in — present-day or historical — and the resolver finds it. They do not hand-place coordinates. They do not retype the parent chain. They do not switch their authoring language. The Nordic countries (SE/DK/NO/FI/IS) already enjoy this; Germany got there at locality level a week ago; the rest of Europe still does not.

Concrete probes the user must observe working in the running app:

- "Lübeck, Schleswig-Holstein, Tyskland" resolves with parish-level granularity.
- "Wicklow, Co. Wicklow, Ireland" resolves to the right Wicklow.
- "Saint-Brieuc, Côtes-d'Armor, France" resolves with Breton variant aliases.
- "Nõo, Tartumaa, Eesti" resolves with Estonian admin suffix stripped.
- "Galicia, Austria-Hungary" resolves to the historical entity, not modern Galicia in Spain.
- "Posen, Preußen" resolves to the Prussian-partition Posen, even though the user's modern map says Poznań, Poland.
- "Vilnius, Lietuva" resolves natively without the user typing English "Lithuania".

## 2. Scope

### 2.1 Countries in scope

**Tier 1 (10 countries) — admin1 + admin2 + localities + parishes + boundaries.**

| Country | Status | Parish primitive (genealogical record-keeping unit) |
|---|---|---|
| Germany | Point gazetteer shipped; upgrade adds boundaries + Kirchengemeinden | Kirchengemeinde (Lutheran/Catholic) |
| United Kingdom | Net new | Civil parish + Church of England parish (England), kirk session parish (Scotland), parish of Wales |
| Ireland | Net new | Civil parish + Catholic parish |
| Netherlands | Net new | Gemeente (modern); historical kerkdorp / parochie where data exists |
| Belgium | Net new | Gemeente / commune (bilingual) |
| France | Net new | Commune (the parish primitive — French communes were ecclesiastical paroisses pre-1789) |
| Estonia | Net new | Vald + kihelkond (historical Lutheran parish) |
| Latvia | Net new | Pagasts + draudze (historical Lutheran parish) |
| Lithuania | Net new | Seniūnija + parapija (Catholic parish) |
| Poland | Net new | Gmina + parafia (Catholic parish) |

**Tier 2 — admin1 + admin2 + localities (no parishes, opportunistic boundaries).**

Geographic Europe minus Tier 1 minus already-shipped Nordics: Andorra, Austria, Belarus, Bosnia and Herzegovina, Bulgaria, Croatia, Cyprus, Czechia, European Russia, European Turkey, Faroe Islands (DK dependency), Greece, Greenland (DK dependency), Hungary, Italy, Kosovo, Liechtenstein, Luxembourg, Malta, Moldova, Monaco, Montenegro, North Macedonia, Portugal, Romania, San Marino, Serbia, Slovakia, Slovenia, Spain, Switzerland, Ukraine, Vatican City. ~33 entities.

The Faroe Islands and Greenland are scoped as Tier 2 *standalone* gazetteers (`fo-kommunur`, `gl-kommune`) rather than as Danish addenda — the contract treats them as their own root subtrees of `World > Europe > Faroe Islands` and `World > North America > Greenland`. They are under-covered today even though Denmark itself has full Tier 1 depth.

### 2.2 One historical-states gazetteer

`europe-historical` — extends the `world-historical` pattern to the German Bund states, Habsburg crown lands, Russian Empire gubernii (admin1 only), Polish-partition territories (1795–1918), pre-1922 Ireland, Yugoslav successor predecessors, Soviet Union republics. Wikidata-sourced, single CC0 license. Genealogist's modern probe: "Volyn Governorate, Russian Empire" resolves; "Posen Province, Kingdom of Prussia" resolves; "Bohemia, Cisleithania" resolves.

### 2.3 Out of scope (explicit deviations)

- **Russian-Empire admin2 (uezds), Hungarian pre-1920 county admin2, Soviet republic admin2.** The historical-states gazetteer covers admin1 only. Going deeper requires per-country historical research that a coverage plan cannot absorb. → Future "European historical depth" plan.
- **Tier 2 parishes.** No demonstrated user demand and uneven licensed source availability. → Per-country follow-up plan if a user surfaces the need.
- **Nordic-language `lang-*` gazetteers** (`lang-da-geonames`, `lang-no-geonames`, `lang-fi-geonames`, `lang-is-geonames`) and other locale variants (`lang-de-geonames`, `lang-fr-geonames`). → Follow-up "Nordic language gazetteers" plan.
- **Asian Russia and Asian Turkey.** Geographical-Europe scope. → Future "diaspora-relevant Asia" plan if surfaced.
- **Eastern-Caucasus countries** (Armenia, Azerbaijan, Georgia). → Same future plan.

## 3. Source priority per primitive

Per-primitive source choice within each country, as agreed:

| Primitive | First-choice source | Second-choice | Third-choice |
|---|---|---|---|
| admin1 (state/region) | National statistical office / official gazetteer | Wikidata (P31 = first-level admin division) | GeoNames ADM1 |
| admin2 (county/department) | National statistical office | Wikidata | GeoNames ADM2 |
| localities | GeoNames (uniform feature classes) | Wikidata | National open-data populated places |
| parishes (Tier 1) | National church/civil register | Wikidata (denomination-specific class) | Skip — not openly licensed |
| boundaries (Tier 1) | National OGD (INSPIRE-compliant where available) | OpenStreetMap admin polygons via Overpass | Wikidata `wdt:P3896` geoshape |

Each per-country implementation plan documents the actual source picked per primitive, with license, fetched-date, and rationale, in the script header and the plan body.

### 3.1 License audit gate (mandatory pre-step per country)

Before authoring a build script for any country, the per-country plan runs the audit procedure from `.claude/skills/gazetteers/SKILL.md` § "License & redundancy audit":

1. List every existing or candidate gazetteer touching that country/region.
2. For each pair, decide distinct vs redundant.
3. For each redundant pair, decide drop or absorb.
4. Record the decision in the per-country plan body.

The Tier 2 batched plans run this audit per country as their first task.

### 3.2 Wikidata QID validation gate (mandatory pre-step for any Wikidata-sourced gazetteer)

**Authored Wikidata QIDs are unvalidated until checked. Don't dispatch a build subagent without validating every QID the script will use.** This rule was written against the DE Gazetteer Upgrade plan, which committed `Q1620908` ("historical region", not Kirchengemeinde) and `Q73501` ("Bredevoort", a Dutch town) as parish classes. The subagent caught the error before producing data — but only because the SPARQL returned near-zero rows on those QIDs. A QID that *happens* to return rows for an unrelated class is a silent disaster: the resulting gazetteer would ship as authoritative data while modeling the wrong primitive.

**The procedure** (run in Task 0 of every plan that uses Wikidata SPARQL, before any build subagent dispatch):

1. List every QID the plan's SPARQL will reference — class IDs, country IDs, denomination IDs, P31/P279/P131 targets.
2. Batch-validate via the `wbgetentities` API:

```bash
curl -s "https://www.wikidata.org/w/api.php?action=wbgetentities&ids=Q1|Q2|Q3&props=labels|descriptions&languages=en&format=json" \
  | python3 -c "import sys, json; [print(f'{k:14s} {(v.get(\"labels\",{}).get(\"en\") or {}).get(\"value\",\"?\")} — {(v.get(\"descriptions\",{}).get(\"en\") or {}).get(\"value\",\"\")[:80]}') for k,v in json.load(sys.stdin).get('entities',{}).items()]"
```

3. Confirm each QID's label and description match the intended class. Document the validation result in the plan body as a table.
4. Any QID whose label / description doesn't match → either find the correct QID (use `wbsearchentities` with relevant search terms) or mark `TBD-validate-at-Task-0` and surface to the operator before scripting.

**This gate is non-negotiable.** A plan that dispatches a build subagent without this validation has skipped Task 0 of itself, and the build is at risk of silently shipping wrong data — which violates the Prime Directive's "the genealogist's data is sacred" framing one layer up (the gazetteer is the lookup truth; getting it wrong corrupts every render).

The validation procedure also covers the existing-gazetteer audit: when adding a new Wikidata source for a region already covered, re-validate the existing scripts' QIDs at the same time. The `sv-socknar` script's `Q18333556` ("registration district in Sweden", not historical socken `Q60495698`/`Q1523821`) is a documented drift the original author introduced before this rule existed; re-validation will catch new instances.

## 4. Plan structure

This design → 14 implementation plans, sequenced:

**Tier 1 — one plan per country (10 plans).**
Order: DE upgrade → GB → IE → NL → BE → FR → EE → LV → LT → PL.
Reasoning: DE first because the existing point gazetteer makes parish-and-boundary work additive; GB/IE next because they are the highest-volume diaspora pair; NL/BE/FR next as Western European cluster; Baltics together because parish primitives are similar; Poland last in Tier 1 because it is the largest single-country effort.

**Tier 2 — batched plans (3 plans, ~11 countries each).**
Order: Western Tier 2 (AT, CH, IT, ES, PT, MT, SM, VA, LI, MC, AD) → Central Tier 2 (CZ, SK, HU, SI, HR, BA, RS, ME, MK, AL, XK) → Eastern Tier 2 (BG, RO, MD, GR, CY, BY, UA, RU-EU, TR-EU, FO, GL).

**One historical-states plan (1 plan).** `europe-historical` Wikidata-sourced extension.

Total: 14 implementation plans following this design.

Each implementation plan follows `.claude/rules/plans.md` (User goal first, scope explicit with deviations, verification by user-observable resolution probes, RCA footer where applicable). Each plan is dispatched to a fresh subagent via `superpowers:subagent-driven-development` + `subagent-handoff` templates. Each plan's worktree branches from `main` at dispatch time.

The Tier 1 plans are not fungible — each country's national open-data ecosystem is different enough that batching them dilutes the audit and surface-research that makes the per-country plan useful. The Tier 2 plans batch by region because the per-country work is mechanically similar (GeoNames + Wikidata, no parishes, no national-OGD deep dive).

## 5. Verification

Per the project plans rule, verification is by user-observable outcome, not test hygiene.

### 5.1 Per-country (each implementation plan)

A `european-coverage.test.ts` (created in the DE-upgrade plan, extended in every subsequent plan) walks every in-scope country and asserts a per-country smoke list of 8–12 representative places resolves correctly to admin1, admin2, locality, and (Tier 1) parish granularity. The test is the gate; if it fails, the plan is not done.

The test is not a substitute for the user smoke-check. Each plan's final task includes a one-liner the user can run in the running app: open the place picker, type each smoke-list place, see it resolve to a row with the right parent chain.

### 5.2 Aggregate (this design's deliverable)

When all 14 plans land, every country in geographical Europe (minus the explicit deviations) has at minimum admin1 + admin2 + locality coverage with a non-empty smoke list passing in `european-coverage.test.ts`. The Tier 1 ten have parish-level smoke probes passing. `europe-historical` has its smoke probes passing. Bundle size after gzip stays under the budget below.

### 5.3 Bundle-size budget

After gzip (Track A of `compress-shipped-json-assets` already in main):

- Per Tier 1 point gazetteer: ≤ 5 MB raw / ≤ 1.5 MB gzip.
- Per Tier 1 boundary gazetteer: ≤ 8 MB raw / ≤ 2.5 MB gzip (aggressive simplification — boundary purpose is uncertainty hint, not pin precision).
- Per Tier 2 point gazetteer: ≤ 3 MB raw / ≤ 1 MB gzip.
- `europe-historical`: ≤ 1 MB raw / ≤ 300 KB gzip.
- Aggregate addition to the shipped bundle (all 14 plans landed): ≤ 90 MB raw / ≤ 25 MB gzip.

A plan that exceeds its slot must either (a) raise the locality population threshold and re-derive, (b) simplify boundaries more aggressively, or (c) split the gazetteer (e.g. admin1+admin2 as one file, localities as another). Exceeding the budget is not silently accepted — it triggers a plan-body decision.

## 6. Anti-patterns this design rejects

Past failures in the gazetteer space and adjacent that this design is written against:

- **"Phase 1 ships first, then we'll figure out the rest."** Exactly what the German plan did. Result: DE shipped point-only, Kirchengemeinden never landed, the roadmap doc never got written. This design is the corrective.
- **One mega-script per region.** The contract is structural-merge by `(name, type, parent_path)`. There is no benefit to one cross-country script. Per-country scripts read one source, emit one tree, named by the country.
- **Hand-edited gazetteer JSON.** All 14 plans must produce JSON via deterministic re-runnable scripts. Any diff in `data/*.json` that doesn't correspond to a script change is a violation of the gazetteer Prime Directive ("sources are truth, gazetteers are build outputs").
- **Persisted resolver output.** The gazetteer Prime Directive forbids writing resolver-derived coordinates back to the `places` table. Every plan in this roadmap is render-time-only; nothing in the design changes the resolver's persistence contract.
- **Inferred parish boundaries from points.** Boundaries are sourced from authoritative polygon data or skipped — not derived from a Voronoi diagram of the point gazetteer. Doing the latter would persist inferred geometry as if authored, which is a Prime Directive violation in spirit even though the data is not in the `places` table.

## 7. Failure modes / RCA reference

Specific commits and prior plans this design is reading against:

- `docs/plans/archive/2026-05-01-german-gazetteer.md` — Phase 1 of an unwritten roadmap. Header line: *"The roadmap covering all 7 priority European countries (DE, PL, GB, NL, BE, FR, EE/LV/LT) lives at `docs/plans/2026-05-01-european-country-gazetteers-design.md`."* That file does not exist. Eight days later: this design.
- `.claude/skills/gazetteers/SKILL.md` Prime Directives § "Contract over fixture" and § "Cleanly sourced, clearly processed, cleanly joined" — every plan in this roadmap respects them; no per-country merge logic in `merge.ts`, no `place-detection-at-load-time`.
- `.claude/rules/plans.md` — every implementation plan opens with User goal in plain-language form, scope-with-deviations explicit, verification by user-observable outcome. Mechanism-first plans get rejected at the spec-review step.
- `feedback_no_silent_string_replace.md` (memory) — the historical-states extension MUST NOT silently overwrite existing `world-historical` entries; the build script either appends new entities or fails loudly on collision.

## 8. Out-of-band references

- Project skill `gazetteers` — the contract that every plan in this roadmap implements against.
- Project skill `subagent-handoff` — the dispatch wrapper every implementation plan uses.
- Project skill `gazetteer-testing` — for per-country resolution smoke probes.
- `src/gazetteer-build/` — shared utilities every per-country script imports from (`geo`, `geonames`, `wikidata`, `sparql`, `tree`, `io`).

---

## Open questions deferred to per-country plans

- DE upgrade — whether Kirchengemeinden are sourced from Wikidata (uniform but sparse) or a per-Bundesland church-register portal (richer but heterogeneous). Decided in the DE plan, not here.
- GB — whether Scottish kirk session parishes are a separate primitive from Church of England parishes (probably yes; decided in the GB plan).
- IE — civil parish vs Catholic parish vs townland. Townlands are deeper than admin2 but are the actual genealogical primitive in 19thC Ireland. Decided in the IE plan.
- FR — whether to subdivide pre-Revolutionary paroisses or treat the modern commune as the single primitive (likely the latter; ~35k modern communes already covers it). Decided in the FR plan.
- PL — partition-era parishes vs modern parafia. The historical-states gazetteer carries the partition admin1; modern parishes carry parafia; whether to bridge them is decided in the PL plan.
