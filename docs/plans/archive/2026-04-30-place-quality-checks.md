# Plan: Place resolver — targeted quality checks

**Date:** 2026-04-30
**Status:** done (v0.171.0)
**Effort:** S (one PR, single worktree)
**Source:** Follow-up to v0.170.0 place resolver overhaul (`docs/plans/archive/2026-04-30-place-resolver-overhaul.md`)

## Background

After v0.170.0 the resolver handles parens, periods-before-uppercase, hyphen↔space, Swedish `kn`/`sn`/`fs` abbreviations, länsbokstav, and language-translation aliases. Against `bengt-inte-trasig.db`, exact-match coverage rose from 16.9 % to 38.7 % and unmatched dropped from 36.1 % to 2.6 %.

The remaining 2.6 % unmatched (~164 places) are genuine data-quality issues that the resolver cannot fix transparently — typos, occupations entered as places, dates entered as places, street addresses without parent context. These need human review. This plan adds four targeted checks that surface them clearly with suggested fixes where safe.

## Tasks

### 1. `PLACE_NAME_LOOKS_LIKE_DATE` (error severity)

Detects when a date string was entered into the place name field.

- File: `src/api/checks/checks-place.ts`
- Pattern: `/^\d{4}([-\s/.]\d{1,2}){0,2}$/` — matches `1736`, `1736-11`, `1736-11-11`, `1736 11 11`, `1736/11/11`. Also catches obvious year-only ambiguities.
- Severity: `error` — high-confidence wrong-field, no auto-fix.
- Message (sv): `Platsen "{name}" ser ut som ett datum — kontrollera att det inte är fel fält`.
- Result rows include `placeIds: [id]`.

### 2. `PLACE_NAME_BROKEN_LANSBOKSTAV` (warning severity)

Detects mangled länsbokstav notation where the closing paren got typed as `I` or `|`.

- File: `src/api/checks/checks-place.ts`
- Pattern: `/\(([A-ZÅÄÖ]{1,2})[I|]/i` — matches `(PI`, `(EI`, `(UI`, `(ACI`, `(P|`, etc.
- Validate: the captured letter(s) must be in the länsbokstav set (`A`, `AB`, `B`, `C`, `D`, `E`, `F`, `G`, `H`, `I`, `K`, `L`, `M`, `N`, `O`, `P`, `R`, `S`, `T`, `U`, `W`, `X`, `Y`, `Z`, `AC`, `BD`). Source the set from `bundled.ts:LAN_LETTER_CODES` keys' values, or hardcode (small + stable).
- Severity: `warning` — high confidence but final character is ambiguous (could be `I` letter or `)` paren).
- Suggested fix: rebuilt name with proper parens — `"Borås (PI"` → `"Borås (P)"`. Pass via `messageParams.suggestion`.
- Message (sv): `Platsen "{name}" verkar ha trasig länsbokstavnotation — föreslagen rättelse: "{suggestion}"`.

### 3. `PLACE_MISSING_COMMA` (warning severity)

Detects when two known place names are jammed into a single comma-component without a separator. The classic case: `Richmond, Kalifornien USA`.

- File: `src/api/checks/checks-location.ts` (resolver-aware — needs gazetteer index access).
- Approach: for each place referenced by ≥1 event with `latitude IS NULL`, build full path, run resolver, look at `unmatchedComponents`. For each unmatched component, whitespace-tokenize and try greedy longest-match against the gazetteer name index. If 2+ adjacent tokens each match a known node, flag.
- **Tighten:** only flag when at least one of the recognized names is at depth ≤2 (country / admin1) — avoids false positives on multi-word leaf names like `Saint Mary's Parish` or `New York City`.
- Severity: `warning`.
- Suggested fix: rebuilt component with commas inserted between recognized names.
- Message (sv): `Platsen "{name}" verkar saknas komma — föreslagen rättelse: "{suggestion}"`.

### 4. `PLACE_NAME_NO_REGION` (notice severity)

Detects single bare unmatched components with no parent place — typos, addresses, occupations, hyperlocal names without context.

- File: `src/api/checks/checks-location.ts`
- Approach: place is referenced by ≥1 event, has `parent_place_id IS NULL`, and `resolvePlace(name, gazetteers)` returns `null`. The single-component constraint is implicit (no commas, no parent).
- Severity: `notice` — needs human review, no auto-fix possible.
- Message (sv): `Platsen "{name}" kunde inte placeras geografiskt — kontrollera stavning eller lägg till en överordnad plats`.

### 5. Wiring

- [ ] Add 4 check entries to the dispatcher in `src/api/checks/index.ts`. Tasks 3 & 4 need gazetteer access — follow the `checkGazetteerMatchQuality` pattern (build gazetteer set inside the dispatch closure with language gazetteers always included).
- [ ] Add Swedish + English i18n keys for all 4 codes in `src/renderer/i18n/sv.ts` and `src/renderer/i18n/en.ts`.
- [ ] If the QualityView UI auto-renders unknown codes (it does — uses the message field directly), no further UI changes needed.

## Tests

Unit tests in `tests/unit/checks-place.test.ts` and `tests/unit/checks-location.test.ts`:

- `PLACE_NAME_LOOKS_LIKE_DATE`: positive on `1736`, `1736-11-11`, `1736/11/11`. Negative on `1736 Frederiksberg` (space-then-name), `Stockholm`, etc.
- `PLACE_NAME_BROKEN_LANSBOKSTAV`: positive on `Borås (PI`, `Hed (UI`, `Byske (ACI`. Negative on `Stockholm (A)` (clean parens), `Gotland (I)` (single I is a real länsbokstav).
- `PLACE_MISSING_COMMA`: positive on `Richmond Kalifornien USA` (with parent place). Negative on `Saint Mary's` (legit multi-word leaf).
- `PLACE_NAME_NO_REGION`: positive on `Stockhom` (typo, no parent), `Fredsgatan 16`. Negative on `Stockholm` (resolves), `Hus`'s child place (has parent).

## Verification

- All new tests pass.
- Full unit suite still passes (currently 2246).
- Run quality checks against `bengt-inte-trasig.db` and verify each new code surfaces real issues:
  - `LOOKS_LIKE_DATE` should pick up at least `1736-11-11` (seen in unmatched bucket).
  - `BROKEN_LANSBOKSTAV` should pick up the ~14 known cases (`Borås (PI`, `Hed (UI`, etc.).
  - `MISSING_COMMA` should pick up `(City of) Ontario, Calif. USA`-style residues if any survive after the resolver overhaul.
  - `NO_REGION` should pick up the typo / address / occupation cases.
- No false positives on a clean Swedish dataset of ~6 000 places.

## Out of scope

- Auto-fix actions in the UI (suggested fixes are presented as text only).
- Extending `lang-sv-geonames` to inject US state translations into `us-all-states` (would fix `Richmond, Kalifornien, USA` → California). Tracked separately — gazetteer data, not a quality check.
- Place merge UI for the `DUPLICATE_PLACE` checks (already on roadmap).

## Implementation order

All 4 checks + i18n + wiring ship together in one PR. Tasks are independent enough to implement in any order, but the test-first approach should run the existing test suite after each check to catch regressions early.
