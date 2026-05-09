# IE Gazetteer — Tier 1

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

> Part of the European gazetteer roadmap (`docs/plans/2026-05-09-european-gazetteers-design.md`). DE plan is the reference template (`docs/plans/2026-05-09-de-gazetteer-upgrade.md`). The GB plan should land first, because Northern Ireland appears in *both* `gb-civil-divisions` (as a UK home nation) and this plan (Catholic parish + townland coverage spans the island).

---

## User goal

A genealogist authoring "Wicklow, County Wicklow, Ireland", "Ballymote, County Sligo", "Inishbofin, County Galway", or "Knockboha townland, Civil Parish of Killinkere, County Cavan" sees their place resolve under the right county, with townland-level granularity where typed and Catholic-parish granularity where typed.

User-observable smoke probes:

- "Wicklow, County Wicklow" → admin1=Republic of Ireland (or Ireland — see § Scope), admin2=County Wicklow, leaf=Wicklow.
- "Ballymote, County Sligo" → admin2=County Sligo, leaf=Ballymote.
- "Killinkere, County Cavan" → admin2=County Cavan, leaf=Killinkere (civil parish).
- "Knockboha townland, Killinkere, Cavan" → leaf=Knockboha (type='other', alias-tagged 'townland').
- "Catholic Parish of Tullamore, County Offaly" → resolves to the Catholic parish of Tullamore.
- "County Londonderry, Northern Ireland" → resolves via the GB gazetteer (cross-gazetteer), but townlands of Londonderry must also resolve via this gazetteer.

## Scope

**Island-wide coverage.** Republic of Ireland and Northern Ireland get civil-parish + townland coverage from the same source data (the 19th-century Ordnance Survey of Ireland indexed both jurisdictions before partition). Catholic parish coverage spans the island.

| Primitive | Source | License |
|---|---|---|
| admin1 — RoI | OSi (Ordnance Survey Ireland) — Counties of Republic | CC BY 4.0 |
| admin1 — NI | OSNI / NISRA — N. Ireland (also covered by GB plan; this gazetteer cross-references) | OGL v3 |
| admin2 — Counties (32 historical, 26 RoI + 6 NI) | OSi + OSNI | CC BY 4.0 / OGL v3 |
| Civil parishes (~2,500) | OSi townlands.ie open data | CC BY 4.0 |
| Townlands (~62,000) | OSi townlands.ie open data | CC BY 4.0 |
| Catholic parishes | Catholic Heritage / National Archives Ireland (NLI registers) | CC BY 4.0 (where available) — Wikidata fallback (Q17143723 Catholic parish, P17=Ireland) |
| Boundaries (counties + civil parishes) | OSi vector boundaries | CC BY 4.0 |

**Two gazetteers ship from this plan:**

1. `ie-civil-divisions` — Ireland (root, the island as a single tree) → admin1 (RoI / NI) → admin2 (32 historical counties) → civil parish (admin3, type='parish') → townland (leaf, type='other', alias-tagged 'townland'). Boundaries on counties + civil parishes (not townlands — too many, would blow budget).
2. `ie-catholic-parishes` — Ireland → admin1 → diocese → Catholic parish (point only). Diocese as alias on the parish, structural parent is the civil county for genealogist-search alignment with civil-divisions.

**Scope deviations:**

- **Townland boundaries** are out of scope. ~62,000 polygons would blow budget even at heavy simplification. Townlands ship as points only; civil parish polygons give the uncertainty hint.
- **Pre-1922 administrative divisions** (Lordship of Ireland, Kingdom of Ireland under UK) are out of scope; they belong in `europe-historical`.
- **Church of Ireland (Anglican) parishes** are out of scope — Wikidata coverage is patchy and the Catholic parish is the dominant genealogical primitive on the island. CofI parishes can be a follow-up plan.
- **Presbyterian congregations in NI** are out of scope; same rationale.

**Tree root choice.** Ireland-the-island is the root, with RoI and NI as admin1 children. This deviates from the `gb-civil-divisions` shape (where NI sits under UK). The structural-merge contract handles this gracefully: NI counties appear under both `UK > Northern Ireland > <county>` (from GB gazetteer) and `Ireland > Northern Ireland > <county>` (from this gazetteer). They merge by `(name, type, parent_path)` — different parent_paths means they're treated as distinct facts, which is genealogically correct (a 19thC NI record could legitimately resolve via either path depending on what the user typed). Aliases union, geometry first-wins (probably from GB which lands first).

## Verification

1. **User smoke-check (gate).** Six probes from § "User goal" resolve in running app.
2. **Cross-gazetteer probe.** Type "County Londonderry" — assert it resolves via GB or IE without divergence (both should produce the same admin2 node when merged).
3. **Townland probe.** Type "Knockboha townland, Killinkere, Cavan" — assert leaf type is `other` and aliases include `townland`. Townlands as points only.
4. **Bundle budgets:** `ie-civil-divisions` ≤ 8 MB raw / 2.5 MB gzip (townlands push raw size); `ie-catholic-parishes` ≤ 3 MB raw / 1 MB gzip.

## Failure modes / RCA

- townlands.ie has had outages and schema migrations; if the API is unreachable, fall back to the static dump on the OSi data portal and document the URL used.
- Cross-gazetteer NI duplication is a *feature* (per the contract); silent-merge bugs that collapse the two NI subtrees inappropriately are a regression. The european-coverage probe for "County Londonderry" guards this.
- Catholic parish coverage in Wikidata is sparse (~600 entries vs ~1,300 actual). Document expected coverage in `source.notes`.

## Tech stack

OSi townlands.ie REST + bulk dump + ogr2ogr + mapshaper + Wikidata SPARQL (Catholic parishes). License: CC BY 4.0 + OGL v3 + CC0.

## File structure

| File | Status | Purpose |
|---|---|---|
| `scripts/build-ie-civil-divisions.ts` | Create | OSi townlands.ie → civil-divisions tree + boundaries |
| `scripts/build-ie-catholic-parishes.ts` | Create | Wikidata Catholic parishes |
| `src/api/place-gazetteers/data/ie-civil-divisions.json` | Create (gen) | Counties + parishes + townlands + boundaries |
| `src/api/place-gazetteers/data/ie-catholic-parishes.json` | Create (gen) | Catholic parishes |
| `src/gazetteer-build/normalize-rules.ts` | Modify | Add `IE_RULES` (County, Civil Parish of, Catholic Parish of, Townland of) |
| `src/api/place-gazetteers/bundled.ts` | Modify | 2 imports |
| `tests/unit/european-coverage.test.ts` | Modify | Append IE probe set including the cross-gazetteer NI probe |
| Standard: gazetteers.test.ts, SKILL.md, package.json, CHANGELOG.md |

## Tasks

### Task 0: License audit + source decisions

- [ ] OSi townlands.ie license, attribution string for script header.
- [ ] Wikidata Catholic parish query: `?p wdt:P31/wdt:P279* wd:Q17143723 . ?p wdt:P17 wd:Q27 .` (Ireland) — confirm > 500 results before scripting; widen via P31 wd:Q102496 if degraded.
- [ ] IE_RULES suffixes: `Civil Parish of`, `Catholic Parish of`, `County of`, `Diocese of`, `Townland of`, `Townland`, `Civil Parish`, `Parish`, `Co.`, `County`. Longest-first.
- [ ] No commit.

### Task 1: Extend normalize rules (TDD)

Mirror DE Task 1. Test cases:

```typescript
expect(stripSuffix('County of Wicklow', IE_RULES)).toBe('Wicklow');
expect(stripSuffix('Civil Parish of Killinkere', IE_RULES)).toBe('Killinkere');
expect(stripSuffix('Knockboha townland', IE_RULES)).toBe('Knockboha');
expect(stripSuffix('Co. Sligo', IE_RULES)).toBe('Sligo');
```

### Task 2: Build `ie-civil-divisions`

OSi townlands.ie has REST + GeoJSON. Two-step:

1. Fetch the bulk dump (CSV + WKT for civil parishes, townlands, counties).
2. Fetch boundary polygons for counties + civil parishes (skip townlands per § Scope).
3. Build hierarchical tree, reproject to EPSG:4326 if needed, simplify polygons via mapshaper @ 5%.
4. Townland leaves carry `aliases: ['townland', '<civil parish name> townland']` so the resolver can match `townland` keyword.

NI counties: include them under `Ireland > Northern Ireland > <county>`. Don't try to dedupe with GB at build time — the merge engine handles it.

Bundle-size gate: 8 MB raw / 2.5 MB gzip. If exceeded, drop townlands → 5 MB raw / 1.5 MB gzip target. If still exceeded, the plan needs replanning (split into civil-only + townlands gazetteer).

### Task 3: Wire `ie-civil-divisions`

Mirror DE Task 4. Append IE probe set including the cross-gazetteer NI probe.

### Task 4: Build `ie-catholic-parishes`

Wikidata SPARQL (mirror DE Task 5). One class (Q17143723 Catholic parish) + country=Ireland. Diocese as alias on each parish; parent_path is the civil county derived from P131 chain. No P3896 geoshapes (parish-level geoshapes for Ireland are virtually nonexistent on Wikidata — accept point-only).

### Task 5: Wire `ie-catholic-parishes`

Mirror DE Task 6. Catholic-parish probes pulled from built data — pick three real parishes that span dioceses.

### Task 6: User smoke-check + close-out

Mirror DE Task 7. Verify the cross-gazetteer NI probe in the running app (type "County Londonderry, Ireland" AND "County Londonderry, UK" — both should resolve to the same conceptual place even though they live in different gazetteer trees). Minor version bump. CHANGELOG. Archive.

## Self-review checklist

- [ ] All six user-goal probes resolve in the running app.
- [ ] Cross-gazetteer NI duplication doesn't break either path.
- [ ] Townland leaves are `type: 'other'` with `townland` alias (closed-vocab compliance).
- [ ] Both gazetteers within budget.
- [ ] Catholic parishes correctly attach under civil counties (not under dioceses).
- [ ] Plan archived; minor version bumped.
