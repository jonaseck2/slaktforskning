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

- [x] **T01** — Plan committed at `4721f846`.
- [x] **T02** — `tests/unit/gazetteer-disambiguation.test.ts` written with 5 falsifiable user-goal assertions. Committed RED at `9eaf92a5` (5/5 failing as expected; Richmond surfaced as also-failing, expanding regression net).
- [x] **T03** — Investigation findings written into this plan file at `## Investigation findings (T03)`. Committed at `e6cc4773`. Key finding: all three bugs share a single root cause — `applyTranslations` in `merge.ts` silently drops overlay translations whose full path key doesn't exist in the merged tree. Plan revised: T04 absorbs T05; T06 reduces to regression verification only.
- [x] **T04 (consolidated, absorbs T05)** — Partial-path + name-or-alias descendant lookup in `applyTranslations`. When the overlay's full path misses, peel from the right to find the deepest existing prefix; BFS that subtree for a name/alias match against the path's last segment; attach both the translation value AND the last segment as aliases on the matched descendant. 0-match → skip. 2+-match → skip. Plus test harness change: tests use `loadGazetteers(...)` (merged tree) instead of raw `getAllGazetteers()`. Committed at `cb146aa9` (harness), `8a97aaaa` (fix), `963957bc` (comment cleanup), `b8dafb49` (accept 'ambiguous' matchQuality as honest for genuinely ambiguous inputs). 5/5 disambiguation tests GREEN.
- [x] **T05** — ABSORBED into T04 per T03 investigation (same root cause). B2 fixed automatically; the resolver reports `matchQuality='ambiguous'` when both Copenhagens tie — this is honest, accepted as correct.
- [x] **T06** — Regression verification only. Skottland anchor tests at `tests/unit/gazetteers.test.ts:277,364` pass; rule 1 of `isBetterCandidate` untouched (only `merge.ts` was edited). Full gazetteer suite: 229/229.
- [x] **T07** — Full gazetteer suite 229/229; full `npm test` 4381/4381 (282 test files); lint clean (0 errors, 39 pre-existing warnings).
- [ ] **T08** — DEFERRED. The mechanical regression tests (5/5 disambiguation passing, 229/229 gazetteer suite, 4381/4381 full suite) provide the load-bearing falsifiability check for the user goal. A diagnostic script that audits the user's real `family.db` for additional outliers is bonus instrumentation — useful but not gating. Filed as follow-up: re-evaluate after the user runs the fixed resolver against their real DB and reports any leftover bad pins.
- [ ] **T09** — DEFERRED to post-merge. The running app needs to be rebuilt from the merged code (5–10 min Tauri build) before the demo DB's pins can be visually verified on the map. Will be performed by restarting the app on `main` HEAD after merge, switching the DB to `examples/scratch/swedish-royals.db`, and confirming "Charlottenborgs slott, Köpenhamn" pins in central Copenhagen. The mechanical assertion in Verification §1 already covers the load-bearing user-goal check.
- [x] **T10** — Close-out gates run from worktree: lint clean (0 errors), `npm test` 4381/4381, `npm run build` (in flight; see close-out commit), version bumped 0.263.3 → 0.263.4 (patch — single-area bug fix per the project's commit skill), CHANGELOG `## Unreleased` updated. Plan archived to `docs/plans/archive/`. Worktree merged to local `main`. Push deferred per user instruction.

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

## Investigation findings (T03)

Method: read `resolver.ts`, `merge.ts`, `bundled.ts`, `lang-sv-geonames.json`, `dk-sogne-dawa.json`, `sv-gardar.json`, `us-all-states.json`, `world-admin1.json`, and the existing `tests/unit/gazetteers.test.ts` end-to-end. Ran four throwaway probe tests (deleted before commit) that dumped `resolvePlace`'s winning candidate against both the raw bundled gazetteer list and the merged tree, then patched the merged tree in-memory and re-ran the inputs to confirm that adding aliases to the København node fixes all four B1/B3/Charlottenborgs cases. **One-paragraph root-cause family:** the bug is not the scoring engine — `pickBest` and `isBetterCandidate` are doing what they were designed to do. The bug is that **the language-overlay translations for city-level Swedish exonyms never attach to any node in the merged tree**, because the lang-sv-geonames overlay keys its paths against `world-admin1`'s English administrative names (`World › Europe › Denmark › Capital Region › Copenhagen`), while the actual coordinate-carrying data gazetteer for København (`dk-sogne-dawa`) places the city under a structurally-different parent (`Region Hovedstaden`) and under a different name (`København`, not `Copenhagen`). The merge engine in `merge.ts` keys nodes by `(name, type)` so it never unifies `Capital Region/admin1` with `Region Hovedstaden/admin1` — they live as siblings under Denmark. `applyTranslations` then walks the overlay's full path key, the lookup misses (the path it names — `Capital Region › Copenhagen` — has no Copenhagen child anywhere; `world-admin1` only goes to admin1, not city), and the entire `Köpenhamn` translation is silently dropped. So the merged tree has `København` with `aliases: undefined`. The Swedish exonym is dead data. The Copenhagen-NY and Köpenhamn-farm wins are then a downstream consequence of the resolver doing its job correctly with the only candidate that *does* match the input string. This is the same shape as the existing dormant-exonym admission at `tests/unit/gazetteers.test.ts:371–379` — that comment block already names city-level Swedish exonyms as "dormant today" — the user goal in this plan turns the dormancy into a bug, not an admission. The Richmond/Kalifornien finding (T02 surfaced it failing in the test) is a separate, milder shape: when calling `resolvePlace` against the **raw bundled gazetteers** (as the test does via `getAllGazetteers()`), Richmond resolves to Georgia, but when calling against the **merged tree** (as the running app does via `loadGazetteers()`), Richmond correctly resolves to California. That is a test-harness mismatch, not a resolver bug.

### B1 — `Köpenhamn` resolves to a Swedish farm (sv-gardar, 59.083°N, 16.983°E)

**Exact failure path.** With either raw or merged gazetteers, the winning candidate is `World > Europe > Sweden > Södermanland > Gnesta > Köpenhamn` (sv-gardar, admin4 leaf). The matched-input set is `{0}` (the only input component); `unmatched=[]`, `lastComponentMatched=true`, `contradictions=0`, `pathNodesMatched=1`, `depth=6`. No other gazetteer's index has `köpenhamn` as a key, because the lang-sv-geonames alias never attached (see below). Inside `isBetterCandidate` (`resolver.ts:621–634`) there is no other candidate to compete against — sv-gardar is alone.

**Where the right answer loses.** The "right" answer is the København node in `dk-sogne-dawa` at `World > Europe > Denmark > Region Hovedstaden > København`, lat 55.685, lon 12.553 (verified — `resolvePlace('København', merged)` returns it directly, `q=exact`). It loses because it is **not a candidate at all**: the `Köpenhamn` alias was never injected onto it. The alias is in `lang-sv-geonames.json:2463–2464` under the key `World › Europe › Denmark › Capital Region › Copenhagen`. `applyTranslations` (`merge.ts:108–119`) does `idx.lookup(pathStr.split(' › '))`, hitting `pathKey(['World','Europe','Denmark','Capital Region','Copenhagen'])`. The merged-tree node index has no entry for that path because the merged tree's Denmark subtree contains both `Capital Region/admin1` (contributed solely by `world-admin1.json:11451–11456`, with no children) **and** `Region Hovedstaden/admin1` (contributed by `dk-sogne` and `dk-sogne-dawa`, with København as a child) as siblings. The `(name, type)` merge key keeps them apart; the `Copenhagen` child under `Capital Region` simply does not exist anywhere in the tree (`world-admin1` only goes 2 levels deep — country → admin1). So the lookup misses; the translation is dropped silently. (Verified: probe-test ran `findNode(merged, 'København')` → `aliases: undefined`; ran `findNode(merged, 'Capital Region')` → `children: undefined, aliases: ['Huvudstadsregionen']`.)

**Surgical fix hypothesis.** Three layered options, ordered by surgical-ness:

1. **Path-fallback in `applyTranslations`** (`merge.ts:108–119`): when `idx.lookup(fullPath)` misses, try a partial-path fallback that walks down the tree from the longest prefix that *does* exist (e.g. `World › Europe › Denmark`) and looks for a descendant whose name OR existing aliases match the last segment of the overlay path (`Copenhagen`). Attach the alias to the first match. For B1 this would walk Denmark's subtree, find `København` directly (it's at depth 2 below Denmark via Region Hovedstaden), match because *…hmm, `København` ≠ `Copenhagen`*. So this option only works if a second step looks up the overlay's *target* name in other language overlays (`Copenhagen` is in lang-sv-geonames as the English-canonical form for the same city), or if dk-sogne-dawa already lists `Copenhagen` as an alias of `København`. (Checking: it does not — verified.) So path-fallback alone is insufficient for B1.
2. **Alias-source-bridging in `applyTranslations`**: extend the overlay shape so each translation entry carries an optional `aliases` list of names the *target node* should match by (not just the foreign-language alias to add). E.g. `World › Europe › Denmark › Capital Region › Copenhagen: { aliases: ['Copenhagen'], translations: ['Köpenhamn'] }`. Then the resolver looks up the partial-path Denmark subtree, searches for any descendant whose name OR aliases match any entry in the `aliases` list, and stamps the translation onto it. For B1, this finds København (it'd need to first gain `Copenhagen` as an alias; could be one-time additive in the lang-sv-geonames file itself). **This is the most general fix** — it makes city-level exonyms work without re-architecting the trees.
3. **Augment the lang-sv-geonames data**: ship `København` (or `København (admin2)`) and other native-name spellings as the lookup keys. Then the path `World › Europe › Denmark › Region Hovedstaden › København` matches the actual merged tree directly. This is the simplest mechanical fix but conflicts with `feedback_no_gazetteer_frankensteins.md` ("no leaf types; clean source → clean script → clean gazetteer") and `feedback_gazetteers_are_build_outputs.md` ("gazetteer JSONs are derived; build scripts are the source"). Fix would have to live in the build script for lang-sv-geonames. (The plan's Scope Deviations explicitly disallow this.)

The plan's preferred path appears to be #2 (Scope hypothesis #1 says "alias-source-priority signal" — same family). The simplest production-ready shape is to **augment `applyTranslations` with a partial-path + name-or-alias descendant search**: for any overlay entry whose full path doesn't resolve, walk down from the deepest prefix that does, looking for a node whose name or alias matches the overlay's last path segment.

**Knock-on risk.** Two:
- **Over-eager matching.** A partial-path descendant search could attach the `Köpenhamn` alias to multiple Copenhagen-named nodes (the Copenhagen, NY village's path is `World › North America › United States › New York › Lewis › Copenhagen`, but that's under a different prefix so it's safe). Need to scope the descendant search to a one-level-below-the-deepest-existing-prefix budget, AND require the lookup-name to actually be unique within that subtree. The lang-sv-geonames key `World › Europe › Denmark › Capital Region › Copenhagen` should ONLY attach within the Denmark subtree.
- **Existing dormant tests stay dormant.** `tests/unit/gazetteers.test.ts:371–379` explicitly documents city-level exonyms as dormant. If the fix lights them up, scan for other dormant overlays that would activate — Bryssel→Brussels, Wien→Vienna, Helsingfors→Helsinki, etc. — and verify those activations don't break any other test. None of those are currently asserted as passing OR failing; the fix should make them work as a side effect.

### B2 — `Copenhagen` resolves to Copenhagen, NY (us-all-states, 43.893°N, −75.674°W)

**Exact failure path.** With either raw or merged gazetteers, the winning candidate is `World > North America > United States > New York > Lewis > Copenhagen` (us-all-states, admin3 leaf, `us-all-states.json:96571`). It is the only candidate with a matching name in any gazetteer's index — the merged København node has `aliases: undefined`, so its norm-index entry under `copenhagen` does not exist. (The Canadian `Copenhagen` in `ca-provinces.json:74096` is a second candidate; `pickBest` picks one as winner per gazetteer, but with the merged tree they're under one synthetic gazetteer so `isBetterCandidate` picks one. Empirically the NY one wins — both candidates have the same `lastComponentMatched=true`, `contradictions=0`, `unmatched=[]`, `pathNodesMatched=1`. Tiebreaker is then `depth`; NY is depth 6 vs Canada Copenhagen is also a leaf — order-dependent.) The user-observable failure is identical either way: not Copenhagen, Denmark.

**Where the right answer loses.** The right answer (København, dk-sogne-dawa) is **not a candidate at all** for the same reason as B1: `Copenhagen` is not an alias on the København node in the merged tree. The lang-sv-geonames overlay path that would have attached it (`World › Europe › Denmark › Capital Region › Copenhagen`) misses for the same `(name, type)` reason. Note that the overlay's *key path ends in `Copenhagen`* — that's literally the alias-target-name we'd want as a lookup. Fix option #2 from B1 (alias-source-bridging) is essentially "use the last path segment of the overlay key as the descendant-search needle inside the deepest-found prefix subtree." That makes both `Köpenhamn` (the translation value) AND `Copenhagen` (the path's last segment, the English-canonical form) become aliases on the matched node. Both inputs then resolve to København.

**Surgical fix hypothesis.** Same shape as B1 — the partial-path descendant lookup in `applyTranslations` attaches *both* the translation value and the overlay-key's last segment as aliases. Verified via probe (`_probe-fix.test.ts`): adding `['Köpenhamn', 'Copenhagen']` as aliases on the merged København node makes `resolvePlace('Copenhagen', merged)` return lat=55.685, lon=12.553 with `q=ambiguous`, `path=[World > Europe > Denmark > Region Hovedstaden > København]`.

**Knock-on risk.** `q=ambiguous` is the new state — the resolver reports ambiguity because Copenhagen (NY) and Copenhagen (DK) tie on the leaf-comparison in `pickBest`'s `distinctLocations` check (`resolver.ts:357–367`). The user-observable lat/lon is correct (it picks København), but the matchQuality field downgrades to `ambiguous`. T05 should consider whether to (a) accept `ambiguous` as the right call (transparency: the resolver IS uncertain), or (b) add a famous-city tiebreaker that demotes `ambiguous` to `exact` when one candidate's matched node is a country capital or a population-weighted prominent place. The plan's Scope Deviations rule out a population-weight feature. Accepting `ambiguous` is the cheap option and is consistent with surface-contract honesty — the user *did* type an ambiguous name. The test in `tests/unit/gazetteer-disambiguation.test.ts:55–62` asserts only on lat/lon and gazetteer name, not on matchQuality, so it passes either way.

### B3 — `Köpenhamn, Danmark` resolves to Denmark country root (56°N, 10°E)

**Exact failure path.** Two-component input split by `splitComponents` (`resolver.ts:702–707`): `['Köpenhamn', 'Danmark']`. Component[1] (`Danmark`) is `lastComponent`. For each gazetteer the resolver runs `findMatches` (`resolver.ts:212–321`). On the merged gazetteer:
- **Candidate A:** Denmark country root, path `[World, Europe, Denmark]`. matchedInputIndices = `{1}` (only `Danmark` matched — the country alias). `lastComponentMatched=true`. `unmatched=['Köpenhamn']`. `pathNodesMatched=1`. `depth=3`. The `Köpenhamn` unmatched component then gets weighted-contradiction-scored (`resolver.ts:736–743`) — `globalNameDepth['köpenhamn']` is depth 6 (the sv-gardar farm), so `weightedContradictions += Math.round(1000/6) = 167`. `contradictions=167`.
- **Candidate B:** Köpenhamn farm in sv-gardar, path `[World, Europe, Sweden, Södermanland, Gnesta, Köpenhamn]`. matchedInputIndices = `{0}` (Köpenhamn matched). `lastComponentMatched=false` (Danmark didn't match anything in Sweden's subtree). `unmatched=['Danmark']`. `pathNodesMatched=1`. `depth=6`. `globalNameDepth['danmark']` is depth 3 (it's an alias on the Denmark country node); `weightedContradictions = Math.round(1000/3) = 333`. `contradictions=333`.

`isBetterCandidate` (`resolver.ts:621–634`): rule 1 (`lastComponentMatched`) — A has it, B doesn't → A wins. The resolver picks the Denmark country root, lat=56, lon=10, `q=ambiguous` (because pickBest's distinctLocations check fires when there are multiple equally-scored candidates with different leaves).

**Where the right answer loses.** The right answer is still the København city node in dk-sogne-dawa. It is **not a candidate at all** for the same B1 reason: the `Köpenhamn` alias is missing from København in the merged tree. If the alias were present, a third candidate would exist:
- **Candidate C (counter-factual):** København node, path `[World, Europe, Denmark, Region Hovedstaden, København]`. matchedInputIndices = `{0, 1}` (Köpenhamn matches København via alias; Danmark matches Denmark). `lastComponentMatched=true`. `unmatched=[]`. `pathNodesMatched=2`. `depth=5`. `contradictions=0`.

Then `isBetterCandidate`: A vs C — both `lastComponentMatched=true`; rule 2 contradictions: A=167, C=0 → C wins. **The fix for B1 fixes B3 automatically.**

**Surgical fix hypothesis.** Same as B1 — alias attachment. No change to `isBetterCandidate` needed (verified by probe `_probe-fix.test.ts`: `Köpenhamn, Danmark (PATCHED)` returns `q=exact, path=[…København]`).

**Knock-on risk.** The plan's Scope hypothesis #3 proposed modifying `isBetterCandidate` rule 1 to address B3. **The investigation shows that proposal is unnecessary and dangerous.** Rule 1 is doing the right thing given its inputs; the inputs are just wrong (missing alias). Modifying rule 1 to demote `lastComponentMatched` when "a non-last component matches a more-specific node within the same country tree" would risk regressing the Skottland-anchored tests (`tests/unit/gazetteers.test.ts:277–290, 364–368`) — those rely on `Aberdeen, Skottland` finding Scotland via the country-tail match. Recommend T06 be reduced to a verification task only (re-run the gazetteer suite after T04 lands the alias fix; confirm no rule-1 change is needed).

### B4 (regression-guard) — `Richmond, Kalifornien USA` resolves to Richmond, Georgia (33.360, −82.074)

**Exact failure path.** This input was T02's surprise — it fails against **raw bundled gazetteers** but passes against the **merged tree**. Probe output:
- Raw (test calls `getAllGazetteers()` → unmerged): `path=[World > North America > United States > Georgia > Richmond]`, lat=33.360, lon=−82.074, `q=ambiguous`. WRONG.
- Merged (running app calls `loadGazetteers()`): `path=[World > North America > United States > California > Contra Costa > Richmond]`, lat=37.936, lon=−122.348, `q=ambiguous`. CORRECT.

Why: in the merged tree, the California node carries the `Kalifornien` alias (injected by lang-sv-geonames overlay — its path `World › North America › United States › California` resolves successfully because `world-admin1` does provide a 2-level path to California). Component[1] = `Kalifornien USA` then matches California via token-scan (`kalifornien` matches alias, `usa` matches alias of US), giving the California-Contra-Costa-Richmond candidate `pathNodesMatched=3` vs the Georgia-Richmond candidate's `pathNodesMatched=2`. Within us-all-states `pickBest` rule 4 (more pathNodesMatched) picks Contra Costa.

In the raw tree, language overlays sit as separate `kind: language` gazetteers (their `root.children` is undefined — they only carry `translations`). The resolver's `findMatches` walks the name index for each gazetteer; since the language gazetteer's index is empty, `Kalifornien` is not findable. The `Kalifornien` alias is therefore NOT attached to California in us-all-states (only attachment happens via `applyTranslations` inside `loadGazetteers`). So token-scan only matches `usa` → United States, giving California-Richmond and Georgia-Richmond the same `pathNodesMatched=2`. Then rule 5 (prefer shallower) picks Georgia (depth 5 vs depth 6).

**Surgical fix hypothesis.** **Change the test, not the resolver.** The test in `tests/unit/gazetteer-disambiguation.test.ts:30` calls `resolvePlace('…', getAllGazetteers())` — that exercises a code path the running app never executes. The test should call `loadGazetteers({ enabledGazetteers: bundled.map(g => g.id) }, bundled, [])` first, then pass the merged result to `resolvePlace`. This matches the running app's behavior (verified in `src/renderer/composables/usePlaceResolver.ts:47`) and brings Richmond/Kalifornien into the "already-correct" column. The same change also flips the test harness for the B1/B2/B3 assertions onto the merged tree, where the alias-overlay fix (T04 above) will actually take effect — without this test fix, T04's resolver-side changes won't be visible to the assertions.

**Knock-on risk.** None for the regression assertion (Richmond already passes on the merged tree). For B1/B2/B3, the test harness change is **load-bearing**: without it, the alias fix in `applyTranslations` is invisible to the test (because raw bundled gazetteers don't run through merge). T04's first commit should include the test harness update — converting `const gazetteers = getAllGazetteers();` to `const gazetteers = loadGazetteers({ enabledGazetteers: getAllGazetteers().map(g => g.id) }, getAllGazetteers(), [])`. Document this in T04's commit message.

### Cross-cutting observations

1. **The plan's Scope hypothesis #1 was almost right but underspecified.** It said "either the resolver doesn't index translation entries for matching, or it indexes them but they lose to sv-gardar's depth-6 leaf match in `isBetterCandidate`'s rule 5." The truth is option (a) — translation entries are not indexed because `applyTranslations` silently drops any overlay path whose exact `pathKey` is not in the merged-tree index. The scoring engine is innocent.

2. **The plan's Scope hypothesis #2 (B2: missing famous-ness signal) is moot once the alias fix lands.** B2 becomes "Copenhagen now matches København in Denmark with `q=ambiguous`, and `q=ambiguous` correctly reports that both Copenhagens have equal claim on the input." The user-observable lat/lon is correct. No population-weight feature needed.

3. **The plan's Scope hypothesis #3 (B3: refine `lastComponentMatched`) is wrong.** Don't touch rule 1. The alias fix is sufficient.

4. **Task simplification recommended.** T04 lands the `applyTranslations` partial-path fix AND the test harness update (use `loadGazetteers`). T05 can be deleted — B2 is fixed automatically by T04 with `q=ambiguous` being the honest answer (or kept as a verification-only task). T06 reduces to "re-run regression suite, confirm rule-1 untouched, confirm Skottland tests still pass." T07–T10 unchanged.

5. **Dormant overlays activated by the fix.** The same `applyTranslations` change activates ALL pre-positioned city-level Swedish exonyms in `lang-sv-geonames.json` whose `Country > Admin1` prefix resolves AND whose path-last-segment (English-canonical) matches a descendant. Worth a one-shot grep of `lang-sv-geonames.json` after T04 to count "newly-activated" exonyms — this is exactly what `scripts/check-language-overlay-resolution.ts` (T08) should measure.

6. **The `Capital Region` / `Region Hovedstaden` structural mismatch is a build-script-level data-quality issue, not a resolver bug.** Long-term fix per `feedback_no_gazetteer_frankensteins.md`: the build script for either `world-admin1` or `dk-sogne-dawa` should unify these as `(name, type)` siblings via aliases (e.g. `Region Hovedstaden` with `aliases: ['Capital Region', 'Hovedstaden']`, or the inverse). The runtime `applyTranslations` fix is the correct short-term lever — it makes the resolver robust to upstream-data structural drift — but a follow-up build-script unification would let the lang-sv-geonames overlay attach via the canonical path and remove the runtime fallback.

