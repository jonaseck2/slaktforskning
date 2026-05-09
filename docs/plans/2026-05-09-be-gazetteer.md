# BE Gazetteer — Tier 1

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

> Part of the European gazetteer roadmap (`docs/plans/2026-05-09-european-gazetteers-design.md`). DE plan is the reference template.

---

## User goal

A genealogist authoring "Antwerpen, België", "Liège, Belgique", "Brussel-Stad", "Bruges (Brugge), West-Vlaanderen", or "Sint-Michielsparochie, Leuven" sees their place resolve correctly across the Dutch / French / German linguistic regions, with both Flemish and Walloon naming forms accepted, polygons on the gemeente / commune level, and Catholic parish coverage.

User-observable smoke probes:

- "Antwerpen, België" → admin1=Vlaanderen → admin2=Antwerpen province → admin3=Antwerpen city.
- "Liège, Belgique" → admin1=Wallonie → admin2=Liège province → admin3=Liège city.
- "Brugge, West-Vlaanderen" / "Bruges, West-Vlaanderen" — both forms resolve.
- "Brussel-Stad" / "Bruxelles-Ville" — both resolve to the Brussels-Capital Region.
- "Eupen, Liège, Belgique" — German-speaking community gemeente resolves.
- "Sint-Michielsparochie, Leuven" — resolves to Catholic parish under Leuven.

## Scope

**One bilingual primary gazetteer + one parish gazetteer:**

1. `be-communes` — Belgium → region (admin1, 3: Vlaams, Wallonie, Brussels) + linguistic community as alias → province (admin2, 10) → arrondissement (admin3, 43) → gemeente/commune (leaf, ~581) with polygons. Both Dutch and French (and German for Eastern Belgium) names attached as aliases on every node where a translation exists.
2. `be-catholic-parishes` — Belgium → diocese-as-alias → Catholic parish (point only) attached to civil commune via parent_path.

| Primitive | Source | License |
|---|---|---|
| Provinces, arrondissements, communes | Statbel + IGN-NGI municipal boundaries | CC BY 4.0 |
| Bilingual names | Wikidata (P1448 official name, language-tagged) | CC0 1.0 |
| Boundaries | IGN-NGI / Statbel | CC BY 4.0 |
| Catholic parishes | Wikidata SPARQL on Q1860233 (Catholic parish), country=Belgium | CC0 1.0 |

**Scope deviations:**

- **Sub-commune deelgemeenten / sections** out of scope. Roughly 2,500 deelgemeenten exist (former merged communes pre-1977) — analogous to NL historical gemeenten. They go in a follow-up `be-historical-communes` gazetteer if user demand surfaces.
- **Église Réformée / Protestant parishes** out of scope — small minority, sparse data. Future plan if needed.
- **Pre-1830 sovereignty (Spanish / Austrian Netherlands, French period, United Netherlands)** belong to `europe-historical`.

## Verification

1. Six smoke probes from § "User goal".
2. Bilingual aliases probe: typing "Bruxelles" and "Brussel" both resolve to the same Brussels-Capital Region node.
3. Cross-language probe: typing "Bruges" (French exonym for Flemish Brugge) resolves correctly via alias.
4. Bundle: `be-communes` ≤ 5 MB raw / 1.5 MB gzip; `be-catholic-parishes` ≤ 2 MB raw / 600 KB gzip.

## Failure modes / RCA

- Bilingual data discipline: each node carries `name` (canonical, picked by region — Dutch in Flemish region, French in Walloon, official-bilingual in Brussels) and `aliases` (the other-language form, plus colloquial variants). Build script picks `name` rule deterministically; never silently drops the second-language form.
- IGN-NGI dataset includes both Dutch and French commune names in different attributes; always read both.

## Tech stack

Statbel + IGN-NGI GeoPackage + ogr2ogr + mapshaper + Wikidata SPARQL.

## File structure

| File | Status | Purpose |
|---|---|---|
| `scripts/build-be-communes.ts` | Create | Bilingual communes + boundaries |
| `scripts/build-be-catholic-parishes.ts` | Create | Wikidata Catholic parishes |
| `src/api/place-gazetteers/data/be-communes.json` | Create (gen) | Bilingual hierarchy |
| `src/api/place-gazetteers/data/be-catholic-parishes.json` | Create (gen) | Catholic parishes |
| `src/gazetteer-build/normalize-rules.ts` | Modify | Add `BE_RULES` (gemeente, commune, ville, stad, arrondissement, province, provincie, parochie, paroisse) |

## Tasks

### Task 0: License audit + bilingual rule

- [ ] Statbel + IGN-NGI license check.
- [ ] Wikidata SPARQL for parishes — coverage check, expect ~600.
- [ ] BE_RULES: `Gemeente`, `Commune`, `Ville`, `Stad`, `Arrondissement`, `Province de`, `Provincie`, `Parochie`, `Paroisse`.
- [ ] **Bilingual canonicalization rule** (document in script header): for nodes in Vlaanderen → name=Dutch, alias=French; in Wallonie → name=French, alias=Dutch; in Brussels-Capital → name=hybrid bilingual (e.g. "Brussel-Stad / Bruxelles-Ville"), aliases include each unilingual form.

### Task 1: Extend normalize rules (mirror DE Task 1)

```typescript
expect(stripSuffix('Commune de Liège', BE_RULES)).toBe('Liège');
expect(stripSuffix('Gemeente Antwerpen', BE_RULES)).toBe('Antwerpen');
expect(stripSuffix('Province de Liège', BE_RULES)).toBe('Liège');
expect(stripSuffix('Brugge Stad', BE_RULES)).toBe('Brugge');
```

### Task 2: Build `be-communes`

Statbel + IGN-NGI → tree with bilingual aliases. Each commune carries both names; the canonical `name` is picked by the linguistic region rule from Task 0.

### Task 3: Wire `be-communes`

Mirror DE Task 4. Smoke probes assert both linguistic forms resolve.

### Task 4: Build `be-catholic-parishes`

Wikidata SPARQL on Q1860233, country=Belgium. Diocese as alias. Parent_path = civil commune from P131 chain.

### Task 5: Wire `be-catholic-parishes`

Mirror DE Task 6.

### Task 6: User smoke-check + close-out

Mirror DE Task 7. Six user-goal probes. Bilingual confirmation: type each probe in both languages where applicable.

## Self-review checklist

- [ ] Bilingual aliases work both directions (Dutch ↔ French).
- [ ] Eupen (German-speaking community) resolves with German name as canonical and French as alias (per Task 0 rule for Wallonie).
- [ ] Brussels-Capital uses bilingual canonical form.
- [ ] Both gazetteers within budget.
- [ ] Plan archived; minor version bumped.
