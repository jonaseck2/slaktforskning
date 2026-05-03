# Place input is a leaf, never a path (MCP boundary)

## User goal

When an AI agent records a place — directly via `add_place` / `update_place`, or implicitly via `record_event`'s `place` argument — the database stores **one row per geographic component**, with hierarchy expressed as `parent_place_id`. Never as a comma-string crammed into `name`. The genealogist sees authentic place names ("Chennai", "Mosås") in their database, not rendered paths ("Chennai, India, World, India, World") that look like a display bug leaked into storage.

The agent expresses hierarchy explicitly when it has it (root → leaf as `parent_chain`), and just stores the leaf when it doesn't. Coordinates and country come from the gazetteer at render time, as they already do.

## Scope

Every MCP tool whose input writes to `places.name`, or implicitly creates a place from a free-form string:

- [ ] `add_place` ([src/mcp/tools/prod/places.ts:16](../../src/mcp/tools/prod/places.ts#L16)) — reject `name` containing commas; add optional `parent_chain: string[]` (root → leaf, excluding the leaf itself); description rewritten to state "name is a single component."
- [ ] `update_place` ([src/mcp/tools/prod/places.ts:93](../../src/mcp/tools/prod/places.ts#L93)) — reject `name` containing commas. No `parent_chain` here (use `parent_place_id`).
- [ ] `record_event` ([src/mcp/tools/prod/events.ts:111](../../src/mcp/tools/prod/events.ts#L111)) — reject `place` containing commas; add optional `place_chain: string[]` (root → leaf, including the leaf as the last element) which routes through `findOrCreatePlaceWithChain`. Description matches `add_place`.
- [ ] Tool descriptions in `docs/MCP.md` updated to match.
- [ ] Unit tests under `tests/unit/mcp.test.ts` (or its place/event splits) covering: comma-name rejection on each of the three tools; happy-path `parent_chain` / `place_chain` creating the right rows; existing flat-name calls still work.

### Scope deviations (explicit)

- **Importers (GEDCOM, Holger, Genney, archive zip)** — out of scope. Importers preserve what was in the user's source file, including comma-string PLAC values. Per the Prime Directive's import disclosure, anything weird gets surfaced via `ImportReport.warnings` / `unmappedData`. Adding rejection there would silently drop authored data from the source file, which is worse than this bug.
- **Renderer `PlacePanel.onNamePlaceSelected` Prime Directive smell** ([src/renderer/components/PlacePanel.vue:416-430](../../src/renderer/components/PlacePanel.vue#L416)) — this stores `getPath(selected.id)` as `name`, which is the same anti-pattern this plan rejects on the MCP side. Out of scope for this plan because (a) it's a different code path with different ergonomics, (b) WIP edits are already in flight on PlacePanel.vue, (c) the user-observable bug we're closing now is the MCP one. **Tracked as immediate follow-up plan.** `docs/UX_INVENTORY.md` should also be updated to flag this.
- **Map zoom-loss on pin placement** — separate one-line fix on `main` ([src/renderer/views/MapView.vue:12-14](../../src/renderer/views/MapView.vue#L12)), not part of this plan.

## Verification

User-observable outcomes, exercised end-to-end:

1. **Old bug doesn't reproduce.** Running `add_place(name: "Chennai, India, World")` against the dev MCP returns an error message that names the offending comma and points the agent at `parent_chain`. Same for `update_place` and `record_event(place: ...)`.
2. **The right call shape works.** `add_place(name: "Chennai", parent_chain: ["World", "India"])` creates exactly three rows: World (`parent_place_id` null), India (parent World), Chennai (parent India). Re-running the same call reuses the existing rows (idempotent — already guaranteed by `findOrCreatePlaceWithChain`).
3. **`record_event` parity.** `record_event(event_type: "residence", place_chain: ["World", "India", "Chennai"], person_id: "...", date_value: "2024")` creates the same three-row hierarchy and links the event to Chennai.
4. **Smoke check by user.** In a fresh agent session, the user asks me (or another agent) to record "I worked in Chennai for 6 months." DB inspection (`mcp__slaktforskning-dev__db_stats` + `search_places`) shows a single row named `Chennai`, no commas, optional parent chain. The map pin lands in India via the gazetteer (no DB-stored country needed).
5. **Test surface.** `tests/unit/mcp.test.ts` (or split files) has one test per tool for the rejection path and one for the happy path. `npm test` green.

Lint + vitest are hygiene; they do not count toward verification of the user goal above.

## Failure modes / RCA reference

**Incident, 2026-05-03.** During a research session, the agent created a place named `Chennai, India, World, India, World` and the user found it in their database. Sequence (reconstructed from the bug shape):

1. Agent likely called `add_place(name: "Chennai, India, World")` — the description didn't tell it `name` is a single component, and the tool accepted the string verbatim per Prime Directive ("don't synthesize defaults").
2. Agent then likely called `update_place(name: "Chennai, India, World, India, World")` — possibly trying to "fix" what it saw rendered, possibly because it read the path display and re-saved it.
3. The renderer correctly displayed the literal authored name (Prime Directive: never invent values), exposing the bad authored data.

**Why no test caught it.** Coverage for `add_place` / `update_place` only asserted "row written, name field equals input." That's correct given the pass-through contract. The missing test was the contract itself: "name is a leaf component, not a path." This plan adds that contract.

**Why the renderer code suspect (`onNamePlaceSelected`) isn't the primary cause.** That path requires a user click on the name PlacePicker and only doubles once per click. Producing "Chennai, India, World, India, World" via that path needs two clicks against a place whose name is already a path string — possible, but the agent path is the simpler and more likely sequence.

**What this rule prevents next time.** Any future MCP tool that takes a place-shaped string argument inherits the same comma-rejection contract. The tool description carries the convention; the runtime check enforces it. Render-time gazetteer resolution stays unchanged.

## Tasks

- [ ] **Task 1 — Add comma-rejection helper to `src/api/places.ts`.** Pure function `assertLeafPlaceName(name: string): void` that throws a clear error when `name.includes(',')`. Unit-tested. Used by tool wrappers, not by the importers or by the renderer (which writes whatever was in the form).
- [ ] **Task 2 — Update `add_place` MCP tool.** Add `parent_chain?: string[]` to the Zod schema, call `assertLeafPlaceName` first, route through `findOrCreatePlaceWithChain` when `parent_chain` is provided. Description rewritten. Tests for: rejection, happy `parent_chain`, flat-name still works.
- [ ] **Task 3 — Update `update_place` MCP tool.** Call `assertLeafPlaceName` when `name` is provided. Description note. Test for rejection.
- [ ] **Task 4 — Update `record_event` MCP tool.** Add `place_chain?: string[]`. When `place_chain` is set, ignore `place` (or error if both are set — pick one and document it); route through `findOrCreatePlaceWithChain`. When only `place` is set, call `assertLeafPlaceName` on it. Description matches `add_place`. Tests.
- [ ] **Task 5 — Sync `docs/MCP.md`.** Update the prose reference for the three tools to reflect the new contract, and add a short "Place input convention" callout near the Places tool group.
- [ ] **Task 6 — Self-review checklist.**
  - [ ] All three tools reject comma-names with a message that names `parent_chain` (or `place_chain` for events).
  - [ ] All three tools accept the chain form and produce the right rows (verified by test, not by reading code).
  - [ ] `docs/MCP.md` matches the implementation.
  - [ ] No regressions on existing MCP tests.
  - [ ] Importers and renderer untouched (per scope deviations).
  - [ ] Plan file moved to `docs/plans/archive/` and `docs/PLAN.md` / `docs/plans/archive/PLAN.md` updated per CLAUDE.md close-out.
  - [ ] Version bumped patch (no user-visible feature; this is a contract tightening + bug fix).
  - [ ] Follow-up plan written for the renderer `onNamePlaceSelected` smell.
