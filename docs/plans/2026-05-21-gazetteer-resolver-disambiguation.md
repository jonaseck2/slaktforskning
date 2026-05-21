# 2026-05-21 — Gazetteer resolver disambiguation: famous-city / language-overlay / country-qualifier

## User goal

When a genealogist writes a city name in their family history — using the **Swedish exonym** (`Köpenhamn`), the **English form** (`Copenhagen`), or the city plus a **country qualifier** (`Köpenhamn, Danmark`) — the place pin appears at the actual famous city the user meant (Copenhagen, Denmark — 55.685°N, 12.553°E). Not at:

- A tiny Swedish farm called Köpenhamn near Gnesta (`sv-gardar`, 59.083°N, 16.983°E)
- The American village of Copenhagen, NY, population ~700 (`us-all-states`, 43.893°N, −75.674°W)
- Denmark's country-center coordinate when the user typed the city plus the country (`dk-sogne` root, 56°N, 10°E)

Same shape generalizes: when the same place name exists in multiple gazetteers, the resolver should pick the famous, world-prominent one — not a local namesake. The user's saved memory (`feedback_no_gazetteer_frankensteins.md` and the Richmond/Kalifornien/Canada cautionary tale) already encodes this principle; the resolver doesn't yet honor it across language overlays and same-name leaves.

Implicit user-observable outcome: when the genealogist drops a person born "Charlottenborgs slott, Köpenhamn" into the demo DB and opens the Places map, the pin sits **on the Charlottenborg palace in central Copenhagen** — not 200 km away on a Swedish farm.

## Scope

### Three concrete failure modes, all reproduced 2026-05-21

| Input | Current result | Should resolve to |
|---|---|---|
| `Köpenhamn` | `sv-gardar` / Swedish farm (59.083, 16.983) | Copenhagen, Denmark (55.685, 12.553) |
| `Copenhagen` | `us-all-states` / Copenhagen, NY (43.893, −75.674) | Copenhagen, Denmark (55.685, 12.553) |
| `Köpenhamn, Danmark` | `dk-sogne` / Denmark country root (56, 10) | Copenhagen, Denmark (55.685, 12.553) |
| `Charlottenborgs slott, Köpenhamn` | `sv-gardar` / Swedish farm | Copenhagen, Denmark |

(Source: the throwaway probe test run during the OSS-launch demo build, `tests/unit/cph-probe.test.ts`, deleted after capturing the data above. Reproducer data is captured in Task T02 below.)

The probe also confirmed that **`København`** (the Danish form) DOES resolve correctly to Copenhagen via `dk-sogne-dawa`. So at least one Copenhagen spelling works — the problem is specifically with language overlays and same-name disambiguation.

### Root cause hypotheses (verify during T03)

1. **B1 (`Köpenhamn` → Swedish farm):** the `lang-sv-geonames.json` language overlay is structured as `{ kind: "language", root: { lat: 0, lon: 0, name: "sv", type: "language" }, translations: { ... } }` — not as a normal gazetteer tree. Either the resolver doesn't index translation entries for matching, or it indexes them but they lose to `sv-gardar`'s depth-6 leaf match in `isBetterCandidate`'s rule 5 (prefer shallower / stem).
2. **B2 (`Copenhagen` → Copenhagen, NY):** same family as Richmond/Kalifornien/Canada. Two equally-named places, picker has no notion of "famous-ness" / population / type weight. Currently picks based on contradiction weight + depth — neither of which surfaces "this Copenhagen is the capital of Denmark."
3. **B3 (`Köpenhamn, Danmark` → country center):** when the last input component (`Danmark`) matches a country root and the first component (`Köpenhamn`) matches a city node in a different gazetteer, `isBetterCandidate`'s rule 1 (`lastComponentMatched`) makes the country root win. The user typed the city + country as a qualifier; they meant the city, not the country.

### Scope deviations (explicit)

- **No rebuild of the gazetteer engine.** The change is surgical scoring fixes in `resolver.ts`'s `pickBest` / `isBetterCandidate` + potentially how language overlays are surfaced as matchable nodes. If T03's investigation reveals the fix needs a deeper rearchitecture, **pause and re-plan** rather than expanding scope.
- **No alias additions to underlying gazetteers.** The bug isn't missing data — it's scoring. Adding aliases would mask the scoring problem and not generalize.
- **No "type weight" / "population weight" feature.** That's a tempting fix for B2 specifically but it's a substantial new mechanism. If we can solve B2 with existing signals (e.g., "if multiple gazetteers match a name, prefer the one whose root is also a country") we should. If not, defer the population-weight feature to a future plan and accept B2 staying half-fixed (or fixed via "country-anchored language overlay" only).
- **Demo data does not need re-editing if the resolver fix works.** The same MCP calls that produced "Charlottenborgs slott, Köpenhamn" will produce a correct pin after the fix. If the fix happens to NOT cover one of the demo's actual inputs, then the demo gets a targeted data tweak — but the goal is a generic resolver fix that the demo benefits from passively.
- **`scripts/check-language-overlay-resolution.ts` is in scope as a diagnostic.** Per the `gazetteer-testing` skill: copy `scripts/check-us-places.ts`, retarget it to "find all places where matching via a language overlay diverges from matching via the corresponding native gazetteer." Runs against the real user's DB to catch additional outliers we didn't think of.

## Verification

Every check is **user-observable** and **falsifiable** — if all pass, the user goal is met; if any fails, the user goal is not met.

1. **`tests/unit/gazetteer-disambiguation.test.ts` passes.** New file written in T02, RED before any fix lands. Asserts:
   - `resolvePlace('Köpenhamn', allGazetteers)` → matchedNode is in Denmark (lat 55.6–55.8, lon 12.5–12.6) — NOT in Sweden.
   - `resolvePlace('Copenhagen', allGazetteers)` → matchedNode is in Denmark.
   - `resolvePlace('Köpenhamn, Danmark', allGazetteers)` → matchedNode is the city (lat 55.6–55.8), NOT country-center (lat ~56, lon ~10).
   - `resolvePlace('Charlottenborgs slott, Köpenhamn', allGazetteers)` → matchedNode is in Denmark, matchQuality is 'partial', unmatchedComponents includes 'Charlottenborgs slott'.
   - Saved-memory guard: `resolvePlace('Richmond, Kalifornien USA', allGazetteers)` → matchedNode is in California, USA — NOT in Canada. This is the existing cautionary tale; the fix must not regress it.
2. **The existing `tests/unit/gazetteer*.test.ts` suite stays green.** No regressions in other resolution behavior. `npx vitest run tests/unit/gazetteer*` after the fix.
3. **The full `npm test` suite passes** with the new test included.
4. **Manual verification in the running app, on the OSS-launch demo DB:**
   - Switch the running app's DB to `examples/scratch/swedish-royals.db`.
   - Open `/places`.
   - The map shows a pin for `Charlottenborgs slott, Köpenhamn` **on the Charlottenborg palace in central Copenhagen** (zoom in to confirm visually). Pin tooltip / popup shows "Resolved via: dk-sogne-dawa" (or equivalent), matchQuality: 'partial'.
   - Pin is **not** in Södermanland, not in upstate New York, not at country-center.
5. **`scripts/check-language-overlay-resolution.ts` produces zero outliers** (or at minimum, reports the same outlier count BEFORE and AFTER on a stable corpus — the user's real DB has many places already that the resolver gets wrong for unrelated reasons).

### The user-goal-falsifiability test

Read verification items aloud. Ask: "if every one of these passes, can the user goal still be unmet?" — No. Test #4 is the load-bearing check that actually proves the user-visible outcome. Tests #1–#3 are hygiene; test #5 is bonus.

## Failure modes / RCA reference

- **Don't touch `pickBest` in isolation without re-running ALL the gazetteer regression tests.** The scoring logic is intricate; a "fix" that resolves Copenhagen but breaks Pitcairn-Scotland or Houston-Texas is a regression. The existing tests are the safety net — keep them green throughout.
- **Saved memory: `feedback_no_gazetteer_frankensteins.md`** — gazetteer engine is "contract over fixture; structural merge by (name, type, parent_path); 7-level admin vocab open-ended; no leaf types; clean source → clean script → clean gazetteer → mechanical join." This plan must NOT add ad-hoc per-place special cases. Fix the engine, not the data.
- **Saved memory: `feedback_gazetteers_are_build_outputs.md`** — gazetteer JSONs are derived; build scripts are the source. If the fix requires alias additions, edit the build script, not the JSON.
- **Past incident (Richmond, Kalifornien USA → Canada):** documented in the `gazetteer-testing` skill as the canonical example of "same-name in another sub-region wins." That exact bug should be in the regression test (#1 above). The Copenhagen issues are the same shape; the fix should generalize.
- **Past tension: `lastComponentMatched` scoring rule.** Rule 1 in `isBetterCandidate` (line 624) was added to make "Pitcairn, Skottland" → Scotland beat Pitcairn, PA. Modifying this rule to address B3 (country-qualifier-falls-to-center) risks regressing the Pitcairn case. The fix has to thread the needle: prefer last-component matches **except** when a non-last component matches a more-specific node within the same country tree.

## Cleanup is in-scope when load-bearing

After the fix lands:
- The throwaway probe data noted in Scope above is captured in `tests/unit/gazetteer-disambiguation.test.ts` (not deleted — it becomes the canonical regression test).
- `scripts/check-language-overlay-resolution.ts` is kept in `scripts/` as a future diagnostic tool.
- No demo-data re-editing required if the resolver fix lands clean (per Scope Deviations).
- The OSS-launch demo screenshot work (T08 of `2026-05-21-oss-launch-demo-and-manual.md`) proceeds AFTER this plan ships — the demo benefits passively.

## Tasks

- [ ] **T01** — Plan committed (this file). Commit message: `docs(plan): gazetteer resolver disambiguation — famous-city, language-overlay, country-qualifier`.
- [ ] **T02** — Write `tests/unit/gazetteer-disambiguation.test.ts` capturing the four assertions from Verification #1. Confirm the tests run RED against current main (3 fail, the Richmond one might already pass — verify). Commit as `test: failing reproducers for famous-city / language-overlay / country-qualifier disambiguation`.
- [ ] **T03** — Investigate root causes of B1, B2, B3. Read `lang-sv-geonames.json` structure end-to-end. Trace `loadGazetteers` to see how language overlays are integrated. Trace `findMatches` to see if language-overlay translation entries become matchable nodes. Trace `pickBest` and `isBetterCandidate` to see the actual scoring path for each failure case. Write findings into the plan file as a `## Investigation findings (T03)` section. Commit as `docs(plan): T03 investigation findings`.
- [ ] **T04** — Implement the fix for B1 (Swedish exonym). Likely shape: language overlay translations become matchable nodes with their target gazetteer's coords, AND scoring weights them above same-name leaves in unrelated gazetteers. Verify with the reproducer test going green for B1 only.
- [ ] **T05** — Implement the fix for B2 (Copenhagen → US village). Likely shape: when multiple gazetteers produce same-name matches with no contradictions, prefer the one whose root is a country named in any language overlay matching the input language. (Or: a population-weight signal if simpler; see Scope Deviations.) Verify with reproducer test going green for B2.
- [ ] **T06** — Implement the fix for B3 (country-qualifier-falls-to-center). Likely shape: refine `isBetterCandidate` rule 1 — `lastComponentMatched` wins only when no candidate has a strict subset match against the SAME-country tree. Verify with reproducer test going green for B3. **Crucially: re-run the existing gazetteer test suite to confirm Pitcairn-Skottland → Scotland still wins.**
- [ ] **T07** — Run full gazetteer regression suite + full `npm test`. Both must be green. Capture output in close-out commit message.
- [ ] **T08** — Write `scripts/check-language-overlay-resolution.ts` based on `scripts/check-us-places.ts`. Adapt the SQL filter and outlier rules. Run against the user's actual `family.db` (read-only). Capture the outlier-count delta from before-fix to after-fix.
- [ ] **T09** — Manual verification in the running app, on the OSS-launch demo DB (Verification #4). Take a screenshot of the map showing the correct Copenhagen pin and save under `docs/manual/` (this also feeds the OSS-launch demo plan).
- [ ] **T10** — Close-out: lint clean, full test suite green, `npm run build` exits 0, evidence pasted into close-out commit message per `.claude/rules/plans.md` "Verification discipline at close-out". Version bump (this is a substantive bug fix touching resolver + new tests + new diagnostic script — `minor` is appropriate since the user-observable behavior of map pinning is changing materially). Archive plan to `docs/plans/archive/`. Update `docs/PLAN.md` + `docs/plans/archive/PLAN.md`. Final commit + push to `origin/main`.

## Self-review checklist

- [ ] User goal is the first thing in the plan and is user-observable.
- [ ] Scope is enumerated; deviations explicit.
- [ ] Verification §1 contains at least one falsifiable check (the four unit-test assertions).
- [ ] Verification §4 is the load-bearing user-observable check (map pin in correct location).
- [ ] Past-incident references named: Richmond/Kalifornien/Canada saved memory + Pitcairn-Skottland scoring rule.
- [ ] Scope deviations name what's NOT in scope and why.
- [ ] Cleanup (probe data → regression test; diagnostic script kept) is in scope, not deferred.
- [ ] No "smoke" identifiers anywhere.
- [ ] Tasks list is the smallest set that delivers the user goal.
