# Plan: Bengt feedback — place picker rework

**Date:** 2026-04-29
**Status:** planned
**Source:** `BENGT.md` (#19b, #27, #34)
**Design:** [2026-04-29-bengt-place-picker-design.md](2026-04-29-bengt-place-picker-design.md)
**Effort:** L

## Background
Three Bengt tickets reduce to one root cause: the place picker treats place strings as flat names instead of hierarchical entities. See linked design spec for full analysis.

## Tickets covered
- BENGT #19b — Creating a new place mid-event-edit loses event data
- BENGT #27 — Place strings should be matched right-to-left (general → specific)
- BENGT #34 — After creating a place, "Skapa ny plats" suggestion still appears for the same name; user-created places have no gazetteer classification

## Approach
Phased delivery. The two bugs (#19b, #34) ship first as quick wins; the algorithm work follows.

## Tasks

### Phase 0 — Quick bug fixes (ship first)
- [ ] **#19b dataloss** — `PlacePicker.vue` audit click handlers, ensure `@click.stop` on dropdown items, ensure `findOrCreate` doesn't bubble or trigger navigation
- [ ] Reproduce: open EventModal for Birth, type "Solna (B)" in place field, click "Skapa ny ort", verify event form data is preserved
- [ ] **#34 stale suggestion** — after `findOrCreatePlace` resolves, invalidate the picker's suggestion cache and re-run search with current input
- [ ] Verify: type "Stockholms Matteus", create, save event, edit again, type "Matteus" — see only the existing match, not "Skapa ny plats"

### Phase 1 — Smart autocomplete (Tier 1)
- [ ] Read [src/api/place-gazetteers/resolver.ts](../../src/api/place-gazetteers/resolver.ts) to understand current matching
- [ ] Add `resolveHierarchical(input: string, enabledGazetteers: string[])` that:
  - Tokenizes on `,`, `()`, ` ` with configurable separators
  - Walks tokens right-to-left
  - Returns `{ matched: GazetteerNode[], unmatched: string[], leafName: string }`
- [ ] Each gazetteer node has a `level` and a `parent`. Use this to filter the next match's candidate set
- [ ] Wire `PlacePicker.vue` to call `resolveHierarchical` on debounced input
- [ ] Render suggestion list as `<leaf> · <parent chain>` with badges showing level (e.g., "församling · län")

### Phase 2 — Place-create flow
- [ ] When user accepts a suggestion: call `findOrCreatePlace` with the full parent chain, creating intermediate places that don't exist yet
- [ ] Each created place gets `place_type` from its gazetteer level
- [ ] Lat/lon inherits from parent if leaf has no coordinates

### Phase 3 — Tree expander (Tier 2)
- [ ] Add an icon button (📂 or similar) next to PlacePicker
- [ ] On click, open a side dialog with:
  - Gazetteer selector (top): list of `enabledGazetteers` from `gazetteer_config` setting
  - Tree view: lazy-load children per node
  - Leaf input: free text for the most specific name
  - Confirm: returns the place_id (creating new places as needed)
- [ ] Tree shape is per-gazetteer — abstract over GazetteerNode `children` traversal
- [ ] Acknowledge in code comments: this is a flexible-shape tree, exact UI per gazetteer may need iteration

### Phase 4 — User-created place classification
- [ ] Allow user to set `place_type` on user-created places via PlaceModal
- [ ] If user picks a `place_type` matching a gazetteer level (e.g., `parish`), surface it in the picker badge

## Out of scope
- Fuzzy matching / Levenshtein scoring — exact matches only for v1
- Multi-language matching (Swedish input → English gazetteer)
- Bengt's "Norrb sockn Fsp" transcription parsing — that's a citation transcription concern, not a place picker concern
- Coordinates for individual farms

## Verification
- Type "Hörningsholm, Mosås (T)" — picker shows "Hörningsholm · Mosås församling · Örebro län"; on confirm, creates a new "Hörningsholm" with parent_place_id = Mosås församling
- Type "Solna (B)" — matches Solna kommun in Stockholms län
- Open the tree expander on the Sweden gazetteer — navigate to Hökhuvud församling
- Create a custom place → tree expander shows it under its assigned parent
- Verify the bug fix from Phase 0: dataloss in #19b doesn't reproduce; stale suggestion in #34 doesn't reproduce

## Risks
- Tree shape varies per gazetteer (some have parish, some only municipality, world has admin1 only). UI may need per-gazetteer hints
- Right-to-left token matching is heuristic — corner cases (place names containing commas, multi-word counties) need test coverage
- Migration of existing user-created places that lack parent_place_id stays as-is — this rework only affects new picker usage
