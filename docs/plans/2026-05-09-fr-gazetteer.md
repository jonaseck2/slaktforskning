# FR Gazetteer — Tier 1

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

> Part of the European gazetteer roadmap (`docs/plans/2026-05-09-european-gazetteers-design.md`). DE plan is the reference template.

---

## User goal

A French-line genealogist authoring "Saint-Brieuc, Côtes-d'Armor, France", "Strasbourg, Bas-Rhin, Alsace", "Carcassonne, Aude, Occitanie", or "Paris 6e Arrondissement" sees their place resolve to the right commune under the right département under the right région, with the commune's polygon as uncertainty hint.

User-observable smoke probes:

- "Saint-Brieuc, Côtes-d'Armor" → admin1=Bretagne, admin2=Côtes-d'Armor, leaf=Saint-Brieuc.
- "Strasbourg, Bas-Rhin" → admin1=Grand Est, admin2=Bas-Rhin, leaf=Strasbourg.
- "Carcassonne, Aude" → admin1=Occitanie, admin2=Aude, leaf=Carcassonne.
- "Paris 6e Arrondissement" → resolves to a sub-Paris arrondissement (admin3 inside Paris commune).
- "Frankrike" / "Frankreich" / "Francia" — country resolves via existing `lang-sv-*` and other locales.

## Scope

**One primary gazetteer:**

`fr-communes` — France → région (admin1, 18) → département (admin2, 101) → commune (~35,000) → Paris/Lyon/Marseille arrondissements (admin3 within those three communes only). Polygons on régions + départements + selected high-population communes. Lower-population commune polygons skipped (would blow budget); ~35k commune-level polygons even simplified is too much.

| Primitive | Source | License |
|---|---|---|
| Régions (admin1) | INSEE COG (Code Officiel Géographique) | Etalab Open License v2 (CC BY-compatible) |
| Départements (admin2) | INSEE COG + IGN ADMIN-EXPRESS | Etalab v2 |
| Communes (~35,000) | INSEE COG | Etalab v2 |
| Paris/Lyon/Marseille arrondissements | INSEE COG | Etalab v2 |
| Boundaries (régions, départements, top-2000 communes by population) | IGN ADMIN-EXPRESS | Etalab v2 |
| Localities | GeoNames FR.zip (supplemental, for non-commune named places like châteaux, hameaux) | CC BY 4.0 |

**Scope deviations:**

- **Communes pre-1789 paroisses** — French Revolution-era restructuring made the commune the legal successor to the paroisse. The modern commune IS the genealogical primitive; we don't ship a separate `fr-paroisses` gazetteer. Pre-1789 entities go to `europe-historical`.
- **Communes associées and communes déléguées** (sub-commune entities created when communes merged) excluded from the primary tree; included as aliases on the parent commune so a record naming the former commune still resolves.
- **Boundaries for all 35,000 communes** out of scope per budget; only top-2000 by population get polygons. Document the inclusion rule in script header.
- **Overseas departments (DOM-TOM)** — Mayotte, Guadeloupe, Martinique, Guyane, Réunion — out of scope (not in geographical Europe). They're already in `world-admin1`.

## Verification

1. Five smoke probes from § "User goal".
2. Bundle: `fr-communes` ≤ 8 MB raw / 2.5 MB gzip even with 35k commune points + 2k commune polygons. Aggressive simplification + tight node serialization.
3. Specific probe: "Saint-Brieuc" with diacritic; "Saint Brieuc" without — both resolve. (`universal` normalize layer handles diacritic strip; FR_RULES handles civil suffixes.)

## Failure modes / RCA

- Communes have a published merger history — many pre-2017 communes are now `commune déléguée`. Build script must use the latest INSEE COG and add legacy commune names as aliases so old genealogical records resolve.
- 35k communes is a lot. Bundle budget can fail; if it does, escalate to: drop communes < 200 population (tail of GeoNames noise), simplify polygons further, or split into `fr-communes` + `fr-communes-leaves`. The plan task fails loudly on budget breach.

## Tech stack

INSEE COG CSV/JSON + IGN ADMIN-EXPRESS GeoPackage + ogr2ogr + mapshaper + GeoNames.

## File structure

| File | Status | Purpose |
|---|---|---|
| `scripts/build-fr-communes.ts` | Create | INSEE COG + IGN → tree with selective polygons |
| `src/api/place-gazetteers/data/fr-communes.json` | Create (gen) | All 35k communes + selective polygons |
| `src/gazetteer-build/normalize-rules.ts` | Modify | Add `FR_RULES` (commune de, ville de, département de, région, arrondissement, canton, paroisse, paroisse de, hameau, lieu-dit) |

## Tasks

### Task 0: License audit + source decisions

- [ ] INSEE COG (Etalab v2 license) — confirm latest year's CSV (e.g. `commune2025.csv`).
- [ ] IGN ADMIN-EXPRESS — version pinned, fetched-date documented.
- [ ] Population threshold for commune-with-polygon: top 2,000 by population (~63% of FR population).
- [ ] FR_RULES suffixes: `Commune de`, `Ville de`, `Département de`, `Région`, `Arrondissement`, `Canton de`, `Paroisse de`, `Paroisse`, `Hameau`, `Lieu-dit`. Longest-first.

### Task 1: Extend normalize rules (TDD)

```typescript
expect(stripSuffix('Commune de Strasbourg', FR_RULES)).toBe('Strasbourg');
expect(stripSuffix('Département de Bas-Rhin', FR_RULES)).toBe('Bas-Rhin');
expect(stripSuffix('Saint-Brieuc Ville', FR_RULES)).toBe('Saint-Brieuc');
expect(stripSuffix('Carcassonne Canton', FR_RULES)).toBe('Carcassonne');
```

### Task 2: Build `fr-communes`

Mirror DE Task 3 + 5 combined. Tree shape: France → région → département → commune. Leaves include Paris/Lyon/Marseille arrondissements as `admin3` children of those three communes. Polygons on top-2000 communes only.

Bundle-size gate is the critical part — 35k node points alone are ~3 MB. Budget for polygons leaves only ~5 MB raw. Aggressive simplification (-simplify 2% for tail communes; 5% for major ones).

### Task 3: Wire `fr-communes`

Mirror DE Task 4. Append FR probe set.

### Task 4 (no separate parish task)

French communes are the parish primitive — no separate parish gazetteer. Skip Task 4 / 5 from DE; renumber.

### Task 4: User smoke-check + close-out

Mirror DE Task 7. Five user-goal probes. Diacritic resolve check. Minor version bump. Archive.

## Self-review checklist

- [ ] All five user-goal probes resolve.
- [ ] Diacritic-stripped queries resolve.
- [ ] Paris arrondissements resolve as admin3 children of Paris.
- [ ] Bundle within budget.
- [ ] Plan archived; minor version bumped.
