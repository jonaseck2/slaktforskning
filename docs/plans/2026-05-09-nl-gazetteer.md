# NL Gazetteer — Tier 1

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

> Part of the European gazetteer roadmap (`docs/plans/2026-05-09-european-gazetteers-design.md`). DE plan is the reference template.

---

## User goal

A genealogist authoring "Leiden, Zuid-Holland, Nederland", "Hoorn, Noord-Holland", "Smilde, Drenthe", or "Pieterskerk, Leiden" sees their place resolve to the right gemeente under the right province, with a polygon hint, and historical pre-merger gemeenten resolve too (Dutch local governments have merged repeatedly since 1900; many ancestor records reference gemeenten that no longer exist as separate entities).

User-observable smoke probes:

- "Leiden, Zuid-Holland" → admin1=Zuid-Holland, admin2=Leiden, leaf=Leiden.
- "Smilde, Drenthe" → admin1=Drenthe, admin2=Midden-Drenthe (current gemeente), with `Smilde` as alias / historical gemeente.
- "Pieterskerk, Leiden" → resolves to a Dutch Reformed kerkdorp / parish under Leiden.
- "Hoorn, Noord-Holland" → distinguishes Hoorn (NH) from Hoorn (Friesland) via parent disambiguation.
- "Nederland" → resolves to country (already covered by `world-countries` + `lang-sv-*`; this plan asserts it doesn't break).

## Scope

**One primary gazetteer + one historical gazetteer:**

1. `nl-gemeenten` — Netherlands → province (admin1, 12) → gemeente (admin2, ~342) → populated places. With boundaries.
2. `nl-historical-gemeenten` — Pre-merger gemeenten (1812–present) keyed under the *current* gemeente parent so a record saying "Smilde, Drenthe" still resolves under modern Midden-Drenthe. ~1,200 historical gemeenten. Point-only.

| Primitive | Source | License |
|---|---|---|
| Provinces (admin1) | CBS / Kadaster — BRT-bestand | CC0 1.0 (Kadaster open data) |
| Gemeenten (admin2) | CBS — Gemeentegrenzen | CC0 1.0 |
| Populated places | GeoNames NL.zip | CC BY 4.0 |
| Boundaries (provinces + gemeenten) | Kadaster BRT | CC0 1.0 |
| Historical gemeenten | Wikidata SPARQL on Q2039348 (former municipality of the Netherlands) | CC0 1.0 |
| Reformed kerkdorpen / parochies | Wikidata SPARQL — sparse | CC0 1.0 |

**Scope deviations:**

- **Buurten (sub-gemeente neighbourhoods, ~13,000)** out of scope. Too granular for genealogy primary use; covered by GeoNames populated places where notable.
- **Roman Catholic parochies post-1853** (when Catholic hierarchy was restored) get whatever Wikidata has, attached under the gemeente. No separate `nl-catholic-parishes` gazetteer — Dutch genealogy is overwhelmingly Reformed/Protestant since the 17thC.
- **Pre-1815 sovereignty (Republic of the Seven United Netherlands, French period)** out of scope; goes to `europe-historical`.
- **Caribbean Netherlands (Bonaire, Sint Eustatius, Saba) and the constituent countries (Aruba, Curaçao, Sint Maarten)** out of scope — they're not in geographical Europe.

## Verification

1. User smoke-check: five probes from § "User goal".
2. Probes append to `tests/unit/european-coverage.test.ts`.
3. Specific test: "Smilde" resolves with current gemeente (Midden-Drenthe) AS its admin2 even though the historical gazetteer carries the `Smilde` name — i.e. the historical gazetteer attaches under modern parent_path.
4. Bundle: `nl-gemeenten` ≤ 5 MB raw / 1.5 MB gzip. Boundaries integrated in same file (~342 polygons fits). `nl-historical-gemeenten` ≤ 1 MB raw / 300 KB gzip.

## Failure modes / RCA

- Dutch gemeenten merge frequently (every few years). The build script must use the latest CBS dataset; document the date in `source.fetched`. Re-running this script in 2027 will yield different boundaries — that's correct.
- Historical gemeenten under modern parents can confuse the resolver if the alias says "Smilde" and a populated place also says "Smilde" — disambiguate via `type='historical-state'` for the historical entries (closed-vocab; `historical-state` is appropriate for pre-merger admin units).

## Tech stack

Kadaster BRT GeoPackage + ogr2ogr + mapshaper + Wikidata SPARQL. License: CC0 + CC BY 4.0.

## File structure

| File | Status | Purpose |
|---|---|---|
| `scripts/build-nl-gemeenten.ts` | Create | Kadaster + GeoNames → gemeenten + boundaries |
| `scripts/build-nl-historical-gemeenten.ts` | Create | Wikidata historical municipalities |
| `src/api/place-gazetteers/data/nl-gemeenten.json` | Create (gen) | Provinces + gemeenten + populated places + polygons |
| `src/api/place-gazetteers/data/nl-historical-gemeenten.json` | Create (gen) | Pre-merger gemeenten |
| `src/gazetteer-build/normalize-rules.ts` | Modify | Add `NL_RULES` (gemeente, dorp, stad, provincie, kerkdorp) |
| `src/api/place-gazetteers/bundled.ts` | Modify | 2 imports |
| Standard test/skill/version bumps |

## Tasks

### Task 0: License audit + source decisions

- [ ] Confirm Kadaster BRT or CBS Open Data as the boundary + admin source. Both CC0. Pick whichever has the cleanest GeoPackage download (probably Kadaster's BRT250).
- [ ] Wikidata SPARQL for historical gemeenten: `?p wdt:P31 wd:Q2039348 . ?p wdt:P582 ?endTime` — Q2039348 is **"municipality of the Netherlands"** (validated, covers BOTH active and dissolved), so the `P582` (end-time) clause is what selects *former* gemeenten specifically. Without it, the query returns the ~342 active municipalities, not the ~1,200 historical ones we want. Verify > 1,000 results.
- [ ] NL_RULES: `Gemeente`, `Stad`, `Dorp`, `Kerkdorp`, `Provincie`, `Buurt`, plus prefix `Provincie van`. Longest-first.

### Task 1: Extend normalize rules (TDD, mirror DE Task 1)

```typescript
expect(stripSuffix('Gemeente Leiden', NL_RULES)).toBe('Leiden');
expect(stripSuffix('Provincie Drenthe', NL_RULES)).toBe('Drenthe');
expect(stripSuffix('Hoorn Stad', NL_RULES)).toBe('Hoorn');
```

### Task 2: Build `nl-gemeenten`

Single combined point + boundary gazetteer (small enough to fit one file under budget). Hierarchy: NL → province (admin1, 12) → gemeente (admin2, ~342) → populated place (leaf, type='locality'). Polygons on provinces + gemeenten.

### Task 3: Wire `nl-gemeenten`

Mirror DE Task 4. Append NL probes.

### Task 4: Build `nl-historical-gemeenten`

Wikidata SPARQL on Q2039348. For each historical gemeente, derive `parent_path` from P131 chain (which points at the *current* successor gemeente). Type='historical-state' for the leaf. Aliases include the historical gemeente name and any common spelling variants from `skos:altLabel`.

### Task 5: Wire historical gazetteer

Mirror DE Task 6. Probe specifically asserts "Smilde" resolves under "Midden-Drenthe" (modern parent).

### Task 6: User smoke-check + close-out

Mirror DE Task 7. Five user-goal probes. Minor version bump. Archive.

## Self-review checklist

- [ ] All five user-goal probes resolve.
- [ ] Historical gemeenten attach under modern parents (Smilde → Midden-Drenthe).
- [ ] Hoorn-NH vs Hoorn-Fr disambiguates correctly via parent path.
- [ ] Both gazetteers within budget.
- [ ] Plan archived; minor version bumped.
