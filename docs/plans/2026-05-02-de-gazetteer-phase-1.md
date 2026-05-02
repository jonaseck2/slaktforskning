# Phase 1 — Germany Gazetteer (Boundaries + Coverage Audit)

**Status:** Draft (awaiting approval)
**Date:** 2026-05-02
**Roadmap:** [`2026-05-01-european-country-gazetteers-design.md`](./2026-05-01-european-country-gazetteers-design.md)

## User goal

When I, a Swedish genealogist, work with a German place in the running app, three things happen and they all "just work":

1. **The place picker resolves it.** Typing "Hamburg-Altona" or "Schwabach" or "Eckernförde" or "Bayern" in any place picker (PersonPanel events, EventPanel, ResearchTaskPanel, the Places view, MCP tool calls) finds the place. Today this works for Bundesländer + Kreise + populated places ≥ 5000 pop; phase 1 measures and decides whether to extend.
2. **The map drops a pin in the right spot.** Already works wherever the resolver finds a place — verified, not changed by phase 1.
3. **The map highlights the polygon.** When I click a German place on the map, or open the Places view focused on a German Bundesland or Kreis, the boundary polygon for that region is drawn — same behaviour I get for Sweden, Denmark, Norway, Finland, Iceland today. Today this **does not work** for Germany. Phase 1 fixes this.

The success criterion is the third bullet, validated end-to-end in the running app — not "files exist" and not "tests pass."

## Scope

Phase 1 ships a single atomic merge containing:

1. **`scripts/build-de-boundaries.ts`** — new build script. Wikidata SPARQL for the same admin1 (Bundesländer, 16) + admin2 (Kreise, ~400) entities the existing `de-gemeinden.json` covers, fetching `wdt:P3896` (geoshape) per entity. Apply the **roadmap-mandated geometry simplification step** (Mapshaper or topojson at build time) targeting 50–80% vertex reduction. Cite source + license in header (existing convention).
2. **`src/api/place-gazetteers/data/de-gemeinden-boundaries.json`** — output. Same hierarchy as `de-gemeinden.json` (country → Bundesland → Kreis), with `geometry` populated. **No locality-level boundaries** — that's far too many polygons and the map only highlights at admin2 anyway.
3. **`bundled.ts` registration.** Add the import + entry to `BUNDLED_GAZETTEERS`. Update the `BUNDLED_GAZETTEERS` count assertion in `tests/unit/gazetteers.test.ts`.
4. **Resolver coverage audit (DE point).** Audit corpus is **`/Users/jonasahnstedt/git/slaktforskning/export-import/bengt.db`** — the user's beta-tester reference DB (Holger 8 lineage, 6,269 places, ~30 German entries spanning capitals, mid-cities, small villages, and historical hyphenated names: Heilbronn, Bielefeld, Ellrich (Hartz), Landstubl, Freiburg, Nordtheim, Berlin, Nürnberg, München, Ranstadt, Frankfurt, Schleswig-Holstein, Schneeberg (Chemnitz, Sachsen), Rügen (Gustow), Hamburg, Lybeck (= Lübeck, historical sv spelling), Regensburg, Klosterlausnitz (Sachsen-Altenburg, Thüringen), Schwedelbach, Köln, Nienburg (Niedersachsen), Hoyersdorf (Sachsen), Gleidingen (Hannover), Düsseldorf, plus the bare "Tyskland" root). Extraction query: `SELECT DISTINCT name FROM places WHERE name LIKE '%Tyskland%' OR name LIKE '%Germany%' OR name LIKE '%Deutschland%';`. Measure resolution rate. Land in one of three outcomes:
   - **Outcome A: ≥ 90% resolve to admin2 or finer.** Accept the existing `≥ 5000 pop` threshold. Document the rate. Done.
   - **Outcome B: 70–90% resolve.** Extend `de-gemeinden.json` by lowering the GeoNames pop threshold or supplementing with Wikidata-named places (`wdt:P31` = Q486972 settlement, in DE). Re-run the build, re-measure.
   - **Outcome C: < 70% resolve.** Pause. Surface the gap to the user. Don't ship a half-fix.
5. **Tests** — `tests/unit/gazetteers.test.ts`:
   - Existing 5 DE tests continue to pass unchanged.
   - **New:** boundary-resolution test — `resolvePlace('Bayern', { enabledGazetteers: ['de-gemeinden', 'de-gemeinden-boundaries'] })` returns a result whose `boundary` field has a non-empty geometry.
   - **New:** at least one Kreis-level boundary test (e.g. "Kreis Plön" or "Landkreis Rosenheim") returns geometry.
   - **New:** resolver smoke test for the audit's representative place set (at least 5 genealogically-relevant places — capital + 1 per outcome of the audit).
6. **Bundle-size measurement.** Record the actual size of `de-gemeinden-boundaries.json` after simplification, and the new total bundled size. If post-simplification size for DE alone exceeds **+15 MB**, follow the roadmap's escalation: stop, document, raise with the user before merge.
7. **CHANGELOG entry** — `## Unreleased` line summarising "Germany: admin1+admin2 boundary polygons; map now highlights German regions."

**Scope deviations (explicit):**

- **Locality-level boundaries.** Out — too many polygons, map renders at admin2. Cities of administrative significance (Stadtkreis, kreisfreie Stadt) get their admin2-equivalent polygon as part of the Kreis layer; this is how GeoNames already classifies them.
- **Parish-level (Kirchgemeinden).** Out per roadmap. Not in this phase, not in any phase of this roadmap.
- **Historical Prussian / Habsburg / GDR boundaries.** Out — those belong to `world-historical` and `world-historical-boundaries`, not to the per-country DE gazetteer. Phase 1 only ships modern (post-reunification 1990) boundaries. Add 1–2 historical-name aliases (e.g. "Stettin" → Szczecin already covered by PL phase later) only if they fall naturally out of the Wikidata `skos:altLabel` query — do not hand-curate.
- **Lazy-loading.** Out — roadmap reserved this as escalation. Phase 1 bundles eagerly per the binding decision.
- **Other countries.** Out. Phase 1 is Germany only. PL, GB, NL, BE, FR, EE/LV/LT each get their own phase plan.
- **Re-running `build-de-municipalities.ts` "while we're here."** The existing point gazetteer is good enough that the audit (Task 4) decides whether to touch it — no speculative rebuild.

## Verification

The plan is verified by **user-observable outcome**, not by `npm test` exit code.

**Mandatory smoke check (the user runs this in the running app before the plan archives):**

1. `npm start`. Open a database with at least one German place (the user has Holger/family DB; if none has DE places, seed one via `mcp__slaktforskning-dev__create_person` + `record_event` with a German place name).
2. Open the Places view, search for "Bayern". Confirm: the entry is found AND the map highlights the Bayern polygon when the entry is selected. **This is the third user-goal bullet.**
3. Same check for "Schleswig-Holstein" (regression — currently resolves but no polygon).
4. Same check for one Kreis (e.g. "Landkreis Plön" or "Kreis Rosenheim"). Confirm: resolves AND polygon highlights at the Kreis level.
5. Open a person with a German birthplace event (e.g. "Hamburg-Altona"). Confirm: PersonPanel shows the place with the map preview / pin in the right spot (already worked, regression check).
6. Confirm the resolver coverage audit (Task 4) outcome is documented in the plan as A, B-with-fix, or C-paused.

**Programmatic verification (necessary but not sufficient):**

- `npm test -- gazetteers` passes including the new boundary-resolution tests.
- `npm run lint` clean.
- `BUNDLED_GAZETTEERS` count assertion updated to reflect +1 entry.
- Bundle-size delta recorded; under +15 MB threshold for DE alone or escalated.

**Hygiene-as-verification rejected:** "vitest passes" alone does not verify the user goal. The map polygon must be visually confirmed in the running app.

## Failure modes / RCA reference

- **Inferred-data drift** (CLAUDE.md Prime Directive). The build script writes `de-gemeinden-boundaries.json` — a reference file, not user data. Do **NOT** "helpfully" populate any user DB column (places.latitude, places.longitude, place.boundary_geojson) from the build output. The resolver computes on render. The audit in Task 4 reads user-DB place names but **does not write back resolved coordinates**.
- **Mechanism-first plan drift** (`.claude/rules/plans.md`). The panel-composables refactor (v0.190.0–v0.190.2) shipped half-consistent because tests verified structure not user goal. This plan's verification is the running-app smoke check, not "the JSON file exists" or "the import line was added."
- **Half-shipped state** — point without boundaries or boundaries without point — is what the roadmap's "single atomic merge" decision exists to prevent. The point exists already; this plan only adds boundaries. Single merge.
- **Bundle bloat sneaking in.** Geometry simplification is mandatory, not optional. If the build script accidentally ships raw geoshape geometries, bundle could grow by 50+ MB for DE alone. Task 6's hard threshold (+15 MB max) is the trip-wire.
- **Resolver-suffix conflict.** `DE_RULES` already strips `Landkreis`, `Kreis`, `Bezirk`, etc. — confirmed in tests. Adding boundaries does not change the resolver's name-matching path; the boundary lookup is keyed on the same node IDs. Don't accidentally introduce a parallel matching path.

## Tasks

> Each task ends with a `[ ]` checkbox to mark in the plan file at completion (per CLAUDE.md plan close-out workflow).

### Task 0 — Pre-flight & confirmations
- [ ] Confirm the existing `de-gemeinden.json` count and structure match the build script header (16 Bundesländer, ~400 Kreise, populated places ≥ 5000 pop). Document any drift.
- [ ] Confirm Wikidata SPARQL availability for `wdt:P3896` on a sample Bundesland (Bayern) and a sample Kreis (Landkreis Rosenheim). If geoshape coverage is < 95% of the admin2 entities, surface to user before proceeding.
- [ ] Pick the simplification tool (Mapshaper CLI is the precedent in `world-boundaries`). Document the simplification command + parameters.
- [ ] Verify `BUNDLED_GAZETTEERS` test count (`tests/unit/gazetteers.test.ts:18` and surrounding) so the registration step in Task 3 updates the right number.

### Task 1 — Build script (`scripts/build-de-boundaries.ts`)
- [ ] Mirror the structure of `scripts/build-no-boundaries.ts` / `build-fi-boundaries.ts` — they are the closest precedents.
- [ ] SPARQL query for: country DE (Q183) → Bundesländer (`wdt:P31` = Q1221156, 16 results) → Kreise (`wdt:P31` = Q106658, ~400 results) → fetch `wdt:P3896` per entity.
- [ ] Apply geometry simplification (Mapshaper `-simplify weighted 30% keep-shapes` or equivalent).
- [ ] Write output as a `boundary`-kind gazetteer with the same `id` shape as `dk-sogne-boundaries`: `de-gemeinden-boundaries`. Same `name` / `locale` / `source` block conventions.
- [ ] Header comment cites GeoNames + Wikidata (CC BY 4.0 + CC0 1.0) and dates the fetch.

### Task 2 — Generate `de-gemeinden-boundaries.json`
- [ ] Run the new script. Verify: 1 country root, 16 Bundesländer children, ~400 Kreise grandchildren, all with `geometry` populated.
- [ ] Verify file size is under the +15 MB threshold (post-simplification). If over: tighten simplification or escalate before continuing.
- [ ] Spot-check 3 polygons in a GeoJSON viewer (`http://geojson.io` is fine for one-off — do not paste user DB content there). Confirm they look like the expected regions.

### Task 3 — Register in `bundled.ts`
- [ ] Add the import line under the "Boundary gazetteers" section.
- [ ] Add the entry to `BUNDLED_GAZETTEERS`.
- [ ] No `DE_RULES` change needed (already in place from the existing point gazetteer).

### Task 4 — Resolver coverage audit
- [ ] Extract the corpus: `sqlite3 /Users/jonasahnstedt/git/slaktforskning/export-import/bengt.db "SELECT DISTINCT name FROM places WHERE name LIKE '%Tyskland%' OR name LIKE '%Germany%' OR name LIKE '%Deutschland%';"` → ~30 entries.
- [ ] **Read-only access.** Do NOT mutate bengt.db. Do NOT write resolved coordinates back. The corpus is observation data only (Prime Directive).
- [ ] Run each through the resolver with `enabledGazetteers: ['de-gemeinden', 'de-gemeinden-boundaries']`.
- [ ] Record resolution rate at admin2-or-finer granularity. Note historical/sv-exonym hits separately (e.g. "Lybeck" → Lübeck via `lang-sv-*`, "Hartz" → Harz spelling drift) — those route through the language gazetteer, not de-gemeinden directly, but still count as user-observable success.
- [ ] Branch on outcome A / B / C per Scope Task 4.
- [ ] Document the outcome inline in this plan file (replace this checkbox bullet with the actual rate + decision, and which entries failed).

### Task 5 — Tests (`tests/unit/gazetteers.test.ts`)
- [ ] Update `BUNDLED_GAZETTEERS` count assertion.
- [ ] Add `describe('de-gemeinden-boundaries resolution', () => { ... })`:
  - Bayern resolves AND has non-empty boundary geometry.
  - One Kreis (chosen from audit corpus) resolves AND has non-empty boundary geometry.
  - Resolver returns boundary alongside point when both gazetteers are enabled.
- [ ] If Task 4 outcome was B (extended point gazetteer), add a test asserting one of the newly-covered sub-5000-pop villages now resolves.

### Task 6 — Bundle-size measurement & CHANGELOG
- [ ] Record sizes: `de-gemeinden-boundaries.json` raw, total bundled directory before/after.
- [ ] If DE-alone delta > +15 MB: STOP, escalate.
- [ ] If under: add `## Unreleased` entry to `CHANGELOG.md` with one line summarising the user-observable change.

### Task 7 — Smoke check (the user)
- [ ] Run `npm start`.
- [ ] Walk through the 6 verification steps in the **Verification** section above.
- [ ] User confirms each step OK before plan archives.

### Self-review checklist (final task)
- [ ] All checkboxes ticked above.
- [ ] Plan moved to `docs/plans/archive/`.
- [ ] `package.json` version bumped (minor — this is a feature for users).
- [ ] CHANGELOG.md `## Unreleased` line landed.
- [ ] `chore: archive completed de-gazetteer-phase-1` commit created.
- [ ] Worktree merged to `main`, branch deleted, worktree removed.

## Execution

Per CLAUDE.md workflow:

1. Create worktree (`superpowers:using-git-worktrees`).
2. Dispatch tasks via `superpowers:subagent-driven-development` using project-local `subagent-handoff` templates (user-goal-centred, not spec-compliance-centred).
3. Verify user-observable outcome in the running app (Task 7) before any "done" claim.
4. Run plan close-out checklist.
