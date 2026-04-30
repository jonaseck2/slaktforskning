# Design Spec: Place picker rework — parent-aware autocomplete + tree expander

**Date:** 2026-04-29
**Status:** design
**Source:** `BENGT.md` #19b, #27, #34
**Effort:** L (substantial UX + algorithm work)

## Problem

Three Bengt tickets all point at the same root cause: today's `PlacePicker` matches the user's typed string against place *names* directly, ignoring administrative hierarchy.

Specific failures:
- **#19b — dataloss bug.** Typing "Solna (B)" in the EventModal place field, then clicking "Skapa ny ort: Solna (B)" closes the place picker *and* the surrounding event modal, losing all event data the user typed.
- **#27 — wrong map pins on imported data.** "Hörningsholm, Mosås (T)" matches "Hörningsholm" in northern Sweden because the picker doesn't read tokens right-to-left. Bengt observes that Swedish place strings are conventionally written from specific (farm) to general (county), so the matcher should peel from the right.
- **#34 — stale "Skapa ny plats" suggestion.** After creating "Stockholms Matteus församling" via the picker, the same suggestion still appears in the autocomplete on next focus. Plus: user-created places have no `place_type` classification (e.g., `sv-församling`) so they don't get the same gazetteer treatment as imported places.

These are symptoms of the same problem: the picker treats places as flat strings instead of hierarchical entities.

## Decision

**Two-tier picker:**

1. **Tier 1 (primary, fast path) — smart autocomplete.** User types freely. As they type, the picker:
   - Tokenizes the input on commas, parentheses, and configurable separators
   - Reads tokens right-to-left, attempting to match each token against gazetteers in increasing specificity (country → admin1 → county/län → municipality → parish/socken → village/farm)
   - Each successful match constrains the next match's search space
   - The leftmost (most specific) unmatched token becomes the leaf; remaining matched tokens become its `parent_place_id` chain
   - Suggestion list shows: `[best match leaf] · [parent chain] · [confidence]`

2. **Tier 2 (fallback / power user) — tree picker.** Icon button next to the autocomplete opens a side dialog with a tree picker:
   - Top selector: choose the gazetteer (Sweden / Denmark / Finland / etc.)
   - Tree navigates Country → admin1 → county → municipality → parish → leaves
   - Final field for the leaf name (free text — gazetteer rarely covers individual farms)
   - On confirm, returns a `Place` with the full parent chain set
   - The tree shape is gazetteer-specific (some gazetteers have parish-level data, some only municipality-level)

## Algorithm — smart autocomplete (Tier 1)

```
input: "Hörningsholm, Mosås (T)"
tokens: ["Hörningsholm", "Mosås", "T"]

step 1 — match rightmost: "T"
  → matches "Örebro län" (county code T) in sv-counties gazetteer
  → search space narrowed to descendants of Örebro län

step 2 — match next: "Mosås"
  → search within Örebro län descendants
  → matches "Mosås församling" in sv-församlingar gazetteer
  → parent chain so far: [Mosås församling, Örebro län, Sverige]

step 3 — match next: "Hörningsholm"
  → search within Mosås församling descendants
  → no match (gårdar gazetteer has limited coverage)
  → use as leaf name with parent_place_id = Mosås församling
  → place_type = "farm" (heuristic from un-matched leaf)

output:
  Place {
    name: "Hörningsholm",
    parent_place_id: <Mosås församling>,
    place_type: "farm",
    latitude/longitude: inherit-from-parent for map display
  }
```

For unsuccessful right-to-left matches (e.g., user typed only "Solna"):
- Try whole-string match against all gazetteers (current behavior)
- If multiple ambiguous matches, show all in the suggestion list with their parent chain visible
- If no match, offer "Skapa ny plats" with a parent picker inline

## Fixing the dataloss bug (#19b)

Root cause: clicking "Skapa ny plats" in the picker dropdown propagates as a click that bubbles to the modal overlay or triggers a route change.

**Fix (independent of the larger rework, can land first):**
- Verify event handlers in PlacePicker `@click.stop` properly
- Verify the `findOrCreate` call doesn't navigate or close any parent modal
- The picker should resolve to a place ID and stay open — only the surrounding modal's save action commits anything to DB

## Fixing the stale-suggestion bug (#34)

Root cause: after creating a place, the picker's local debounce/autocomplete cache isn't invalidated, so it keeps showing "Skapa ny plats: X" even though X now exists.

**Fix:**
- After `findOrCreatePlace` succeeds, clear the picker's internal suggestion list
- Re-run search with the just-typed value — should now return the newly created place as a real match
- For user-created places without gazetteer classification: show them in autocomplete but don't badge them with `sv-församling`. Future plan: let users classify a place via PlaceModal.

## What stays out

- **Multi-gazetteer fuzzy match scoring** — keep simple right-to-left exact match for v1. Fuzzy/scoring later
- **Coordinates from leaf** — leaves inherit parent coordinates. Adding lat/lon for individual farms is a manual or import-time concern
- **Cross-language matching** — Swedish input matches Swedish gazetteers only. International support later
- **Wikidata transcription parsing** — Bengt's "Norrb sockn Fsp" example lives in `transcription` field of the citation, not the place. Out of scope here
