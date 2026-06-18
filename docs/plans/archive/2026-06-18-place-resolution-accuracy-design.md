# Place Resolution Accuracy — Design Spec

**Date:** 2026-06-18
**Status:** Design approved; implementation plan to follow.

## User goal

Real places in a user's tree resolve to the correct location, and aren't flagged
"ambiguous" when the resolver actually knows the answer. Concretely:

- Swedish/Nordic places stop landing in Senegal / Belarus / Tunisia / Faroe Islands.
- Modern places stop landing in historical empires (Estado Novo, Qajar Iran, Spanish Empire, Edom).
- A place that resolves to one clear spot shows a clean `exact` / `partial` match,
  not `ambiguous`.

This is a place-resolution *accuracy* effort. It is not new functionality — it
corrects how the existing resolver ranks candidates and decides ambiguity, plus
removes junk gazetteer aliases.

## Background — how this was found

Reported by the user as 15 wrong/odd place pins. All 15 were reproduced against
the live `family.db` (the user's exact enabled-gazetteer set) with
`scripts/check-reported-places.ts`. They collapse into 5 root causes, not 15 bugs.

| # | Input | Resolves to (wrong) | Root cause |
|---|-------|---------------------|------------|
| 1 | `Tun, Lidköpings kn (R)` | Sweden, but flagged `ambiguous`; bare `Tun` → Tunisia (`TUN`) | RC2, RC3 |
| 2 | `Tun, Lindköpings kn (R)` | same | RC2, RC3 |
| 3 | `Mellangården, Edum` | `World (Historical) > Edom` | RC1 |
| 4 | `Turkiet` | `Asia > Turkey` flagged `ambiguous` (vs Swedish village "Turkiet") | RC2 |
| 5 | `Rasht, Iran` | `World (Historical) > Qajar Iran` | RC1 |
| 6 | `New York` | `World (Historical) > Estado Novo` (alias `"New"`) | RC1 |
| 7 | `Västra Vingåkers sn` | `Africa > Senegal` (`SN` = socken) | RC3 |
| 8 | `Spanien` | `World (Historical) > Spanish Empire` | RC1 |
| 9 | `Barcelona, Spanien` | Spain > Barcelona, flagged `ambiguous` (province vs city) | RC2 |
| 10 | `Genève, Schweiz` | Switzerland > Geneva, flagged `ambiguous` (canton vs admin1) | RC2 |
| 11 | `Kärret, Hov` | `Faroe Islands > Hov` (should be Sweden) | RC4/RC5 |
| 12 | `Ytre Arna, Hordaland, Norge` | correct Norway, flagged `ambiguous` | RC2 |
| 13 | `Voss, Norge` | correct Norway, flagged `ambiguous` (point gaz + boundary gaz) | RC2 |
| 14 | `Torsvi by, Torsvi (C)` | `Belarus` (`BY` = by/village; `C` = Uppsala län letter) | RC3, RC4 |
| 15 | `Warszawa, Polen` | `Poland > Mazovia`, flagged `ambiguous`, not Warsaw | RC2, RC5 |

### Root causes (evidence)

- **RC1 — Historical gazetteers outrank the correct modern place.**
  `world-historical` nodes sit at depth 2 directly under `World (Historical)`. The
  resolver's final tiebreaker prefers the *shallower* path (stem-over-leaf), so a
  depth-2 historical node beats the correct modern depth-3+ match. Aggravated by
  `lang-world-historical.json` attaching modern Swedish exonyms as aliases onto
  historical nodes. Verified aliases in the data:
  - `Estado Novo` → aliases include `"New State"`, **`"New"`**.
  - `Qajar Iran` → aliases include **`"Iran"`**, **`"Persia"`**, `"Qajar"`.
  - `Spanish Empire` → aliases include `"Spanish"`; Swedish **`"Spanien"`** attached via lang gazetteer.
  - `Edom` → Swedish **`"Edum"`** attached via lang gazetteer (collides with the real Swedish village Edum in Vara).

- **RC2 — Spurious `ambiguous` flag.** `pickBest` flags ambiguous whenever ≥2
  same-`(contradictions, unmatched)` candidates resolve to *different coordinates*
  (`distinctLocations.size > 1`), even when the tiebreaker decisively picks one, or
  when the competitors are the same place from a point + a boundary gazetteer
  (Voss), a famous country vs an obscure namesake (Turkiet), or a province vs its
  own city (Barcelona).

- **RC3 — ISO country-code aliases match bare sub-tokens.** `world-countries.json`
  carries alpha-2 + alpha-3 aliases. Verified: `Senegal → ["SN","SEN"]`,
  `Belarus → ["BY","BLR"]`, `Tunisia → ["TN","TUN"]`. Token-scan tokenizes every
  comma-component and matches these against ordinary Swedish words/abbreviations:
  `sn` (socken) → Senegal, `by` (village) → Belarus, `Tun` → Tunisia (`TUN`).

- **RC4 — län-letter codes `(R)/(C)/(D)` don't anchor.** Swedish county letters
  exist as aliases in the sv gazetteers, but once a foreign country anchors as the
  broad last-component (via RC3), it wins regardless. Expected to be largely
  resolved once RC3 lands; verified per-case.

- **RC5 — Translation / coverage gaps.** `Warszawa` (city) and the Swedish farm at
  `Hov` are not in any enabled gazetteer, and nothing maps `Warszawa↔Warsaw`. These
  are genuine data gaps; the fix is to surface them honestly (correct country/region,
  `partial`) rather than as a wrong `ambiguous` pin.

## Approved design decisions

1. **Ambiguity = "different places," not "different coords."** (RC2)
2. **Modern beats historical via scoring AND data cleanup.** (RC1)
3. **ISO codes match only as whole components, never sub-tokens.** (RC3)
4. **Coverage gaps surface as correct-country `partial`, no new city data this plan.** (RC5)

## Components

### Component 1 — Ambiguity predicate rewrite (RC2)

Rewrite the ambiguity decision in `pickBest` (`src/api/place-gazetteers/resolver.ts`)
and any merged-tree equivalent. Today ambiguity = "same-quality candidates at
different coords." New rule — **ambiguous only when all three hold:**

1. The top-2 candidates are tied on *every* strong signal the tiebreaker uses
   (`contradictions`, `lastComponentMatched`, `unmatched.length`,
   `pathNodesMatched`, `depth`) — the tiebreaker genuinely cannot separate them.
2. Their matched paths are *different places*: neither path is a prefix of the
   other (kills province-vs-its-city, e.g. Barcelona), and they are not the same
   named place contributed by two gazetteers (kills Voss point + boundary). The
   "same named place" test: identical `matched` path-name array (and/or coords
   within an epsilon) ⇒ treat as one place, prefer the point/non-boundary node.
3. They land at materially different coordinates.

Outcome: Voss, Ytre Arna, Turkiet, Barcelona, Genève, Warszawa → clean
`exact`/`partial`. A genuine two-different-cities-named-X case still flags `ambiguous`.

### Component 2 — Modern beats historical (RC1)

**Scoring** (`isBetterCandidate` + `pickBest`): add a signal — a candidate rooted
under the modern `World` root outranks one rooted under `World (Historical)`
*unless the input explicitly named the historical entity* (the historical node's
**own name** was the matched form, not a modern-exonym alias). This signal sits
*above* the depth tiebreaker so a depth-2 historical node no longer wins on depth
alone. "Rooted under historical" is detected via the root node's name/identity on
the candidate's path.

**Data cleanup** (per the `gazetteers` skill, at the data source + build script,
regenerated into `data/`): strip modern-name aliases from `world-historical.json`
and `lang-world-historical.json`:
- `"New"` from Estado Novo
- `"Iran"`, `"Persia"` from Qajar Iran
- `"Edum"` from Edom
- `"Spanien"` from Spanish Empire
- any sibling of the same shape found by an audit pass over the historical/lang
  data (a modern country/place name attached as an alias to a historical polity).

The two prongs are belt-and-suspenders: scoring fixes the ranking generally; data
cleanup removes the false matches at the source so they can't resurface on a tie.

### Component 3 — ISO codes only match whole components (RC3)

At index build (`getNameIndex`), classify an alias as a **code alias** when its
*source* (pre-normalization) form is 2–3 all-caps ASCII letters (`SN`, `BY`,
`TUN`). This requires preserving the raw alias case at index time — currently only
the lowercased/normalized form is retained.

Matching rule: a code alias may match **only when the matched form is a whole
comma-component** (`form === whole` in the `findMatches` per-component loop), never
when it is a sub-token pulled out by token-scan. Regular (non-code) aliases keep
their current sub-token matching.

Outcome: `Vingåkers sn`, `Torsvi by`, bare `Tun` stop matching
Senegal/Belarus/Tunisia. A place string that is literally `SN` as its own
component still resolves (whole-component match preserved).

### Component 4 — Coverage gaps surface honestly (RC5)

No new city data shipped in this plan. After Components 1–3:
- `Warszawa, Polen` → `Poland > Mazovia` (or country), `partial`, not `ambiguous`.
- `Kärret, Hov` → Sweden region or country, `partial` (the Swedish farm is not in
  any gazetteer; the foreign "Hov" no longer wins once it is no longer the only
  match surviving — confirm per-case during implementation; if a foreign namesake
  still wins, fold the fix into Component 2's modern/region preference rather than
  shipping city data).

Documented as a known coverage gap. City-level PL/foreign-locality coverage is a
separate future data plan if desired.

## Verification

1. **User-observable outcome (matches User goal):** each of the 15 reported
   strings resolves to the correct country/region at the correct quality.
2. **The check that proves it — a regression corpus.** A test in
   `tests/unit/resolver.test.ts` (or `gazetteers.test.ts`) asserts, for all 15
   inputs, the expected resolved root country/region and `matchQuality`. Locked
   first (TDD), red before the change, green after.
3. **Real-DB re-audit.** Re-run `scripts/check-reported-places.ts` against
   `family.db`; the 15 cases resolve correctly and the script reports no *new*
   outliers introduced elsewhere. Capture before/after output.
4. **No regression on existing resolver behavior:** the existing resolver/gazetteer
   unit suites stay green (`npx vitest run tests/unit/resolver.test.ts
   tests/unit/gazetteers.test.ts`).

**User-goal-falsifiability check:** if items 2–4 all pass, can the user goal still
be unmet? Only if the corpus omits a real-world shape not in the 15. Mitigation:
the real-DB re-audit (item 3) is the broad net beyond the locked corpus.

## Scope

Files in scope:
- `src/api/place-gazetteers/resolver.ts` — Components 1, 2 (scoring), 3 (index + match).
- `src/api/place-gazetteers/data/world-historical.json`,
  `src/api/place-gazetteers/data/lang-world-historical.json` + their generating
  build scripts under `gazetteer-build/` / `scripts/` — Component 2 data cleanup.
- `tests/unit/resolver.test.ts` (and/or `tests/unit/gazetteers.test.ts`) — corpus.
- `scripts/check-reported-places.ts` — kept as the real-DB audit harness.

### Scope deviations

- **`merge.ts` not rewritten.** The ambiguity rule lives in the resolver, applied
  to the merged tree; the merge's node-fusion (`name === name && type === type`)
  is left as-is. If Voss-style point+boundary duplicates are better solved by
  fusing at merge than by the Component-1 "same named place" test, that is an
  implementation choice the plan may make — but the default is the resolver-side
  predicate, no merge change.
- **No new gazetteer city data (RC5).** Warszawa/Hov resolve to country/region
  only; city-level coverage is explicitly out of scope.
- **Other locales' suffix collisions not enumerated.** RC3's fix is general
  (code-aliases only match whole components), so it covers any locale, but only the
  Swedish `sn`/`by`/`Tun` collisions are in the verification corpus. A broad
  multi-locale audit is future work.

## Risk

Core resolver scoring touches *every* place pin in the app. Mitigations:
- Corpus locked first (TDD); change is red→green against it.
- Existing resolver/gazetteer suites gate the change.
- Full real-DB re-audit beyond the corpus.
- Executed in a git worktree, never on `main`.

## Failure modes / RCA reference

No prior failed attempt. The resolver's tiebreaker comments
(`resolver.ts` `pickBest` / `isBetterCandidate`) document the existing
depth-prefers-stem rule that RC1 exploits, and the skill
`.claude/skills/gazetteer-testing/SKILL.md` lists "two gazetteers' top matches
share lat/lon → drop ambiguity" as a known outlier class — RC2 generalizes that.
