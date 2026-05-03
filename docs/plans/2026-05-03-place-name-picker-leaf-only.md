# PlacePicker on Place panel writes a leaf, not a path (renderer follow-up)

## Status

Stub. Sibling to [2026-05-03-place-leaf-only-mcp.md](2026-05-03-place-leaf-only-mcp.md). Write the full plan after the MCP plan lands so this one can reuse the `assertLeafPlaceName` helper and any test patterns the MCP plan introduces.

## User goal

When the genealogist uses the name PlacePicker on a Place panel to merge or pivot to another existing place, the picked place's **leaf name** (and its parent linkage) is what gets written — not a comma-string path. The DB stays in the "one row = one component" shape that the schema is built around. The genealogist never sees their place named "Mosås, Örebro län, Sverige" because they clicked something in the picker.

## The smell

[src/renderer/components/PlacePanel.vue:416-430](../../src/renderer/components/PlacePanel.vue#L416), `onNamePlaceSelected`:

```ts
const path = (await window.api.places.getPath(selected.id)) as string;
const updates: Record<string, unknown> = { name: path || selected.name };
```

This writes the **rendered path** of the picked place into the current place's `name`. Same Prime Directive failure mode as the MCP bug we're closing in the sibling plan: storing a display-shaped value instead of an authored leaf. Compounds if triggered on a place whose name is already a path.

## Scope (preliminary)

- `PlacePanel.onNamePlaceSelected` — write `selected.name`, not `path`. Set `parent_place_id` from the picked place's parent if not already set, OR copy the picked place's whole parent chain (decision pending — depends on whether the picker is meant to "merge from" or "pivot to").
- Any other call site that conflates `places.getPath()` output with `places.name` writes (search before scoping).
- Tests for the renderer-side write contract.
- Update `docs/UX_INVENTORY.md` if the picker's behaviour materially changes.

## Verification (preliminary)

1. From a Place panel on "Chennai", picking another existing place "Mumbai" via the name PlacePicker results in the current place being renamed to `Mumbai` (leaf), with `parent_place_id` set/preserved correctly. Not `Mumbai, India`.
2. Repeating the same pick a second time is idempotent — the name stays `Mumbai`, no compounding.
3. A unit/component test asserts the call to `places.update` carries `name: <leaf>`, not `name: <path>`.

## Why deferred

- WIP edits already in flight on PlacePanel.vue, PlaceModal.vue, PlaceFormFields.vue, useResolvedPlace.ts (2026-05-03 working tree). Land the MCP plan first; pick this up against a clean tree.
- The bug we shipped is on the MCP side (more frequent, agent-driven). The renderer path needs a user click on a specific picker on a specific surface — narrower exposure.
- Sharing `assertLeafPlaceName` (introduced by the MCP plan) keeps the contract in one place.
