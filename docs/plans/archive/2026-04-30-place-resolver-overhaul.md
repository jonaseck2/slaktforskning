# Plan: Place resolver overhaul — universal rules + per-gazetteer normalization

**Date:** 2026-04-30
**Status:** done (v0.170.0)
**Effort:** M (4 commits, one worktree)
**Source:** Conversation analysis of `ben-inte-trasig.db` (6 266 places used by ≥1 event)

## Background

Place resolution against `ben-inte-trasig.db` resolves only 17 % of places exactly; 36 % don't resolve at all. Categorization of the 5 210 problem rows shows that almost all of them are caused by a small set of input-shape variations that the current resolver doesn't handle, **not** by missing gazetteer data:

| Pattern | Count | Example |
|---|---|---|
| Trailing länsbokstav `(A)`–`(Z)` (and damaged variants) | ~1 440 | `Stockholm (A)`, `Hässleholm L)` |
| Swedish admin abbreviations `kn`/`sn`/`fs` | ~1 400 | `Åkersberga, Österåkers kn` |
| Missing comma between known names | ~430 | `Richmond, Kalifornien USA` |
| Comma without space | 146 | `Robinsville,North Carolina,USA` (already works — was a false flag) |
| Period before uppercase | 5 | `Saint-Claude College, Minn.USA` |
| Whitespace/hyphen drift | 17 | `B roby-Emmislöv` |

`resolver.ts` already hardcodes admin-suffix vocabulary for Swedish/Danish/Norwegian/Finnish/Icelandic/English directly inside `normalize()` ([resolver.ts:8-21](../../src/api/place-gazetteers/resolver.ts#L8-L21)). Adding more country-specific rules on top of this is the wrong direction — the resolver should be language-agnostic and let gazetteers carry their own normalization.

Quality checks (`PLACE_MATCH_PARTIAL`/`AMBIGUOUS`/`NONE`) remain useful as catch-alls, but the current numbers are dominated by false positives caused by the resolver bugs above. We need to fix the resolver first, then add a small number of targeted quality checks for the cases that *are* genuinely user data issues.

## Architecture

Three layers, each language-agnostic where it can be:

1. **Resolver — universal rules only.** `normalize()` strips parens, treats `.` before uppercase and `(`/`)` as comma-equivalents, collapses whitespace, treats `-` and ` ` as equivalent during compare. No country knowledge.
2. **Per-gazetteer normalization rules.** New `Gazetteer.normalize` field carrying `stripSuffixes` and `stripPatterns`. Resolver consults the gazetteer's rules when comparing components against that gazetteer. Migrates the existing 6 hardcoded language vocabularies off `resolver.ts`.
3. **Gazetteer data enrichment.** Länsbokstav A–Z added as aliases on the corresponding Swedish län nodes via the build scripts. No new gazetteer kind.

Plus one bug fix: `checkGazetteerMatchQuality` currently loads gazetteers without language gazetteers, so country-name aliases (`Skottland`, `Tyskland`) appear as unmatched even though they exist in `lang-sv-geonames`.

## Tasks

### 1. Per-gazetteer normalization mechanism

- [x] [src/api/place-gazetteers/types.ts](../../src/api/place-gazetteers/types.ts) — add to `Gazetteer`:
  ```ts
  normalize?: {
    stripSuffixes?: string[];   // e.g. ['kommun','kn','socken','sn','församling','fs']
    stripPatterns?: string[];   // regex source strings, applied after suffix strip
    stripPrefixes?: string[];   // e.g. ['county of','province of','state of']
  };
  ```
- [x] [src/api/place-gazetteers/resolver.ts](../../src/api/place-gazetteers/resolver.ts) — split `normalize()` into:
  - `normalizeUniversal(s)` — lowercase, trim, collapse whitespace, strip parens (replace `(`/`)` with space), treat `-`↔` ` during compare. No language-specific rules.
  - `normalizeForGazetteer(s, gaz)` — applies universal first, then the gazetteer's own `stripSuffixes`/`stripPatterns`/`stripPrefixes`.
- [x] Replace `nodeMatches(node, component)` with `nodeMatches(node, component, gaz)` — uses `normalizeForGazetteer`.
- [x] Update `getNameIndex` to key on universal-normalized names (cross-gazetteer lookup) and `findMatches` to compare with the gazetteer's own rules.
- [x] Migrate the existing 6-language vocabulary out of `resolver.ts` and onto the data gazetteers:
  - Swedish gazetteers (`sv-socknar`, `sv-forsamlingar`, `sv-orter`, `sv-gardar`, `sv-kyrkor`, `sv-sockenstad-boundaries`): `församling`, `socken`, `kommun`, `stad`, `härad`, `län`, `distrikt`, `pastorat` + new `kn`, `sn`, `fs`
  - Danish gazetteers (`dk-sogne`, `dk-sogne-dawa`, `dk-sogne-boundaries`): `sogn`, `kirkedistrikt`, `kommune`, `amt`, `herred`
  - Norwegian (`no-kommuner`, `no-kommuner-boundaries`): `fylke`, `prestegjeld`, `sokn`
  - Finnish (`fi-kunnat`, `fi-kunnat-boundaries`): `kunta`, `kaupunki`, `maakunta`, `seurakunta`
  - Icelandic (`is-sveitarfelog`, `is-sveitarfelog-boundaries`): `sýsla`, `hreppur`, `sveitarfélag`, `sókn`
  - US/UK/Canada (`us-immigration-states`, `us-all-states`, `ca-provinces`, `world-admin1`): `county`, `parish`, `township`, `borough`, `province`, `state` + prefixes `county of`, `province of`, `state of`
- [x] Source rules from a shared `src/gazetteer-build/normalize-rules.ts` (e.g. `SV_RULES`, `DK_RULES`, `EN_RULES`) so build scripts don't duplicate strings.
- [x] Update build scripts to write the rules into each gazetteer JSON.

### 2. Universal resolver tweaks

- [x] [src/api/place-gazetteers/resolver.ts](../../src/api/place-gazetteers/resolver.ts) `resolvePlace` — change the input split so it splits on `,` **and** on `\.(?=[A-Z])`:
  ```ts
  const components = placeName.split(/,|\.(?=[A-Z])/).map(p => p.trim()).filter(Boolean);
  ```
- [x] Strip parens at normalize-input time (already covered in task 1 via `normalizeUniversal`, but verify it's applied to the *component* text before splitting too — ideally before splitting so paren-content doesn't get glued to a token: `Stockholm (A)` → strip → `Stockholm A` → component `Stockholm A`, then token-scan inside).
- [x] Add token-scan-inside-unmatched-component logic — when a component fails to match any node, try whitespace-tokenizing it and matching tokens individually. This is also what the `PLACE_MISSING_COMMA` quality check uses.

### 3. Swedish länsbokstav alias enrichment

- [x] Compile authoritative letter→län mapping from <https://sv.wikipedia.org/wiki/L%C3%A4nsbokstav> (24 entries — A, AB, B, C, D, E, F, G, H, I, K, L, M, N, O, P, R, S, T, U, W, X, Y, Z, AC, BD).
- [x] [scripts/build-sv-parishes.ts](../../scripts/build-sv-parishes.ts) — extend the Wikidata SPARQL output (or a post-process step) to add the letter as an alias on each `Sverige > <Län>` node. Confirm aliases are emitted in `sv-socknar.json` and `sv-forsamlingar.json` after rebuild.
- [x] Same enrichment for [scripts/fetch-sv-orter.ts](../../scripts/fetch-sv-orter.ts) (covers `sv-orter`, `sv-gardar`, `sv-kyrkor`).
- [x] [scripts/build-sv-boundaries.ts](../../scripts/build-sv-boundaries.ts) — same for `sv-sockenstad-boundaries` if it has län-level nodes.
- [x] Rebuild and commit the regenerated JSON files.
- [x] Mark the single-letter aliases as low-confidence somehow, or accept the risk that a bare "A"/"M"/"O" component could match a län — these are unlikely in real input.

### 4. Quality view: include language gazetteers in the load

- [x] [src/api/checks/checks-location.ts:58](../../src/api/checks/checks-location.ts#L58) — verify `checkGazetteerMatchQuality` receives gazetteers loaded with language gazetteers enabled (so country aliases like `Skottland`, `Tyskland`, `Italien`, `Kina` resolve via `lang-sv-geonames`).
- [x] Trace the gazetteer-loading path used by the worker that calls `checkGazetteerMatchQuality` — likely [src/main/db-worker.ts](../../src/main/db-worker.ts) or the `checks:*` IPC dispatcher in [src/main/ipc/main-only.ts](../../src/main/ipc/main-only.ts). Ensure `loadGazetteers(config, getAllGazetteers())` is called with a config that includes language gazetteer IDs.
- [x] Add a unit test in `tests/unit/gazetteers.test.ts`: `resolvePlace("Aberdeen, Skottland", gazetteers)` should return a Scotland match.

### 5. New quality checks

After 1–4 land, partial/unmatched counts will drop dramatically. Re-run [scripts/tmp/analyze-ben-places.ts](../../scripts/tmp/analyze-ben-places.ts) to confirm. Then add these checks. All live in `src/api/checks/checks-place.ts` (data-only checks) or `checks-location.ts` (resolver-aware checks).

- [x] `PLACE_NAME_LOOKS_LIKE_DATE` — error severity. Regex: `/^\d{4}([-\s/]\d{1,2}){0,2}$/`. Detects `1736-11-11`, `1736 11`, `1736/11/11`. Fix suggestion: "Looks like a date. Was the place field used for a date?"
- [x] `PLACE_NAME_BROKEN_LANSBOKSTAV` — warning severity. After the resolver overhaul, this targets the ~14 cases like `Borås (PI`, `Hed (UI`, where the closing paren got mangled into `I` or `|`. Detector: unmatched 2–3 letter token where dropping a trailing `I`/`|` yields a known länsbokstav. Fix suggestion: rebuilt string with proper parens.
- [x] `PLACE_MISSING_COMMA` — warning severity. Token-scan inside an unmatched (or partially-unmatched) component finds 2+ greedy known names; emit suggested fix string with commas inserted. Tighten with a depth check: only flag when the recognized names are at country/admin1 depth (≤2).
- [x] `PLACE_NAME_NO_REGION` — notice severity. Single bare unmatched component with no parent place. Suggest adding a parent or correcting the spelling. Don't auto-fix.

Do **not** add data-quality checks for the patterns the resolver now handles natively (parens, missing-space, period-before-uppercase, kn/sn/fs, hyphen drift) — they're not user errors after the overhaul.

## Out of scope

- A separate "rules pack" gazetteer kind (Option B from the design discussion). Premature; revisit if/when third-party gazetteers ship their own rules.
- A `lang-sv-lansbokstav` gazetteer. Length-2 letter aliases fit naturally on existing nodes; a separate gazetteer adds plumbing without leverage.
- Auto-fixing broken länsbokstav. The user must confirm — different länsbokstav letters are easy to confuse.
- Touching the SQL `places` table to clean strings retroactively. The resolver handles input variations transparently; the user can still see the raw string. Only the quality checks suggest cleaning.
- Improving `Kyrkslätt`/`Brändö` matching (Finnish/Åland coverage gap). Tracked separately in the gazetteer build scripts.

## Verification

- [x] Re-run [scripts/tmp/analyze-ben-places.ts](../../scripts/tmp/analyze-ben-places.ts) against `ben-inte-trasig.db`. Expected: exact ratio rises from 17 % to ≥80 %; unmatched drops from 36 % to <5 %.
- [x] Specific resolution test cases (add to `tests/unit/gazetteers.test.ts`):
  - `"Stockholm (A)"` → exact, Stockholms län (sv-socknar)
  - `"Åkersberga, Österåkers kn"` → exact, Österåkers kommun > Åkersberga (sv-orter)
  - `"Hässleholm L)"` → exact, Skåne län > Hässleholm
  - `"Saint-Claude College, Minn.USA"` → at least partial match including Minnesota, USA
  - `"Aberdeen, Skottland"` → exact, United Kingdom > Scotland > Aberdeen (or partial with Scotland matched)
  - `"Husby Rekarne"` (no hyphen) ≈ `"Husby-Rekarne"`
  - `"Richmond, Kalifornien, USA"` → United States > California > Richmond (was the case that started this thread)
- [x] Existing resolver tests in `tests/unit/gazetteers.test.ts` and `tests/unit/gazetteer-build.test.ts` continue to pass.
- [x] Re-run quality checks against `ben-inte-trasig.db`. The `PLACE_MATCH_PARTIAL`/`PLACE_MATCH_NONE` count should drop dramatically; the new checks should pick up only genuine data issues.

## Implementation order

Tasks 1, 2, 3, 4 ship together (one worktree, one PR — they're interdependent and the verification only works with all four). Task 5 is a follow-up PR that builds on the cleaned baseline.
