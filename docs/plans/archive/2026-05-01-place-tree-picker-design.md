# Place Tree Picker — Design

**Status:** Approved (design only — implementation plan to follow)
**Date:** 2026-05-01

## Goal

Add a tree-button to the existing `PlacePicker` (mirroring the calendar-button on `SimpleDateInput`) that opens a modal with a hierarchical browse-and-select view of places. The tree merges the user's database places with the bundled gazetteers, and lets the user create a new place as a child of any existing node.

## Why

- The current picker is text-input only. Users can autocomplete or accept gazetteer suggestions, but they can't *browse* — they have to know what to type.
- For genealogy work the parent context is often the obvious thing to find first ("the parish I was just looking at"); adding a child farm/locality to it should be one click, not a two-step "type the parent path, then create".
- This is purely additive. The existing picker, autocomplete, and `findOrCreate` flows all stay intact.

## Non-goals

- No changes to the data model, gazetteer format, IPC, or MCP.
- No edit/delete of places from the tree (those flows live in `PlaceModal` / `PlacePanel`).
- No persisted gazetteer-derived values. Only authored names and structural parent links go to the DB. Coordinates and `place_type` stay inferred at render time. (CLAUDE.md prime directive.)

## Architecture

### New files

| Path | Purpose |
|------|---------|
| `src/renderer/components/modals/PlaceTreePickerModal.vue` | Modal wrapper. Uses `BaseSubPanel` with `entity-type="place"`. Owns filter input, root-node container, the inline-create state, and the commit/close logic. |
| `src/renderer/components/PlaceTreeNode.vue` | Recursive row component: chevron · icon · name · type badge · `+ add child` button · inline-create form when expanded. Renders its own children (recursive instance). |
| `src/renderer/composables/usePlaceTree.ts` | Builds the merged tree, exposes `roots`, `expandNode`, `collapseNode`, `filter`, `createChild`, `findPathTo`. No Vue component dependencies. |

### Modified files

| Path | Change |
|------|--------|
| `src/renderer/components/PlacePicker.vue` | Add tree-button next to the input; mount `PlaceTreePickerModal` when open; route its `select` event through the existing `select()` so `modelValue` / path-display / event-emits stay consistent. |
| `src/renderer/i18n/sv.ts` and `en.ts` | New keys under `places.tree.*` (open button label, filter placeholder, "Add child", "Create '<name>' under <parent>", empty state, errors). |

### Small API additions

`places.ts` currently exposes `listPlaces` (returns all rows, no parent filter) and `getPlacePath` (string path), but **no parent-scoped child lookup and no ancestor-chain accessor**. The tree needs both. Add:

| Function | Signature | Purpose |
|---|---|---|
| `listPlaceChildren(db, parentId \| null)` | `(Place & { hasChildren: boolean })[]` | Direct children of a node (null = root places). `hasChildren` is computed via `EXISTS` subquery so the tree can show/hide chevrons without an extra round-trip per row. |
| `getPlaceAncestors(db, id)` | `Place[]` ordered root → self | Used for pre-population (expand the chain when `modelValue` is set). Walk `parent_place_id` recursively, capped at e.g. 32 to defend against accidental cycles. |

These get the standard wiring: type defs in `src/api/places.ts`, channel registration in `src/shared/channels/places.ts` (`places:listChildren`, `places:getAncestors`), worker handlers in `src/main/ipc/places.ts`, preload exposure in `src/preload/index.ts`, and the matching MCP read tools (`list_place_children`, `get_place_ancestors`) in `src/mcp/createProdServer.ts` since they're useful read-only operations for agents too.

### No changes

`src/api/place-gazetteers/*`, the schema, migrations. The existing `places.findOrCreatePlaceWithChain` and `places.findOrCreatePlace` cover materialization and create-as-child.

## Tree data model

```ts
type PlaceTreeNode = {
  key: string;                            // 'db:<id>' or 'gaz:<gazId>:<path-joined>'
  name: string;
  type: string | null;                    // place_type (DB) or node.type (gaz)
  source: 'db' | 'gazetteer' | 'merged';  // 'merged' = DB row paired with a gazetteer node by name
  dbId: string | null;                    // place_id once materialized
  gazId: string | null;                   // gazetteer id (e.g. 'lang-sv-geonames')
  gazPath: { name: string }[] | null;     // ancestor chain incl. self, used for materialization
  parentKey: string | null;
  hasChildren: boolean;                   // whether expand should be enabled
  childrenLoaded: boolean;                // children only computed on first expand
  children: PlaceTreeNode[];
};
```

### Build rules

- **Roots:** every DB place with `parent_place_id IS NULL` (from `places.list`) ∪ every enabled gazetteer's `root` (from `usePlaceResolver.getGazetteers()`). Dedupe by `normalizedName(name)` → `source: 'merged'`, with both `dbId` and `gazPath` populated.
- **Children of node N (computed on expand):**
  - DB children: `places.listChildren(N.dbId)` if `N.dbId` is non-null.
  - Gazetteer children: descendant of `N.gazPath` (single lookup against the in-memory gazetteer tree).
  - Dedupe by lowercased name; matching DB rows keep their `dbId` and merge with the gazetteer node.
- **`hasChildren`:** roughly `(dbId && childCountFn(dbId) > 0) || (gazNode?.children?.length ?? 0) > 0`. To avoid an extra query per row, we use `(gazNode children) || (DB-children-count cached at parent build time)`.

### Lazy loading

- Root level builds eagerly (cheap: O(roots)).
- Children build on first expand. We cache results on the node so re-expand is free.
- After inline-create, we splice the new DB row into the parent's `children` and mark its key.

## Filter behavior

- Filter input at the top of the modal, debounced 150 ms. Mirrors the list-view filter pattern (e.g. `PersonsView`).
- Empty filter → only roots are shown; user expands manually.
- Non-empty filter (≥2 chars):
  - Walk the *entire* merged tree (eagerly building any unloaded children — it's a one-time cost, capped by the actual gazetteer + DB size).
  - Keep nodes whose `normalizedName(name)` includes the normalized query, **plus all of their ancestors**.
  - Auto-expand kept ancestors. Hide non-matching siblings.
  - The inline `+ Add child` action remains usable on any visible row.
- Filter is plain substring match on the (diacritic-stripped, lowercased) name. The hierarchical `tokenizePlaceString` resolver is *not* used here — that's for parsing user-typed paths, not for filtering an already-shaped tree.

## Interactions

| Action | Result |
|--------|--------|
| Click chevron | Expand or collapse the node's children (lazy-builds on first expand) |
| Click row name | Commit selection: `emit('select', place)` then close modal. If row is gazetteer-only, materialize via `places.findOrCreateWithChain(node.name, node.gazPath.slice(0, -1))` first. |
| Click `+ Add child` | Inline input row appears under the node (text field + Save + Cancel) |
| Save inline child | Materialize parent if needed; `places.create({ name, parent_place_id: parent.dbId })`; insert into tree; commit selection of the new place; close modal |
| Type in filter | Tree narrows per §Filter |
| Esc / Cancel | Close without changes |

### Pre-population on open

- If `modelValue` is set → call `places.getAncestors(modelValue)` to load the full ancestor chain; expand each ancestor (lazy-building children along the way); scroll the selected row into view; mark it `aria-selected`.
- Else if the picker input has typed text → pre-fill the filter with that text, triggering the auto-expand-matches behavior.
- Else → empty filter, all roots collapsed.

## Inline child-create flow

When the user clicks `+` on a row:

1. Inline `<form>` appears as a pseudo-child of that row: text input + Save / Cancel buttons.
2. On Save:
   1. If `parent.dbId` is null (parent is gazetteer-only), call `places.findOrCreateWithChain(parent.name, parent.gazPath.slice(0, -1))` to get a real `place_id`. Update `parent.dbId` in place.
   2. Call `places.create({ name: typed, parent_place_id: parent.dbId })`.
   3. Insert the new node into `parent.children` (so it's visible if the user wants to add more siblings later — though the modal commits & closes immediately).
   4. Emit `select(newPlace)`; close the modal.
3. Errors → toast `errors.saveFailed`. Modal stays open.

### Data-fidelity contract

The only fields we write are:
- `places.name` — typed by the user OR matched from the gazetteer node the user clicked (= authored).
- `places.parent_place_id` — structural; the user explicitly chose the parent by clicking through it.
- (Auto: `id`, `created_at`, `updated_at`, `normalized_name` — the allowed-exception derivations from CLAUDE.md.)

We do **not** write `latitude`, `longitude`, `place_type`, or any other gazetteer-derived field. Coordinates remain inferred by the resolver at render time. This is the same contract `selectGazetteer()` in the current picker already follows.

## A11y

- Modal: `BaseSubPanel` provides focus-trap + Escape + entity-colored header.
- Tree role: container `role="tree"`; rows `role="treeitem"` with `aria-level`, `aria-expanded` (when `hasChildren`), and `aria-selected` on the active row.
- Keyboard (focused row):
  - **↓ / ↑** — move to next / previous visible row
  - **→** — expand if collapsed; if already expanded, move to first child
  - **←** — collapse if expanded; if already collapsed, move to parent
  - **Enter** — commit (same as click row)
  - **+** — open the inline create-child form on this row
  - **Esc** — close modal
- `v-narrate` on each row narrates `name + type + ancestor-chain` for screen-reader mode.
- Inline create input: `aria-label` = "New place under <parent name>".

## i18n keys (added to both `sv.ts` and `en.ts`)

```
places.tree.openTree            // tree-button aria-label / title
places.tree.title               // modal title ("Browse places" / "Bläddra platser")
places.tree.filterPlaceholder
places.tree.addChild            // "+ Add child" button
places.tree.newChildLabel       // input label inside inline form
places.tree.savingChild         // toast / busy
places.tree.empty               // empty-tree state
places.tree.noResults           // empty filter result
places.tree.fromGazetteerBadge  // small badge: "from gazetteer"
```

## Testing

- **Unit — `places.ts` API (Vitest, in-memory DB):**
  - `listPlaceChildren(parentId)` — root level (parentId=null), nested level, `hasChildren` flag correctness.
  - `getPlaceAncestors(id)` — root → self order; depth cap on cycles.
- **Unit — `usePlaceTree` (Vitest):**
  - Build merged roots: DB-only, gazetteer-only, and merged-by-name cases.
  - Lazy-expand a node, verify `childrenLoaded` flips and dedup is correct.
  - Filter: ancestor-keeping with diacritics; ≥2-char threshold; empty-result state.
  - `findPathTo(placeId)` returns full ancestor chain.
- **Unit — `PlaceTreePickerModal.vue` (Vitest + Vue Test Utils):**
  - Pre-population: passes `initialPlaceId` → emits scroll/expand for ancestor chain.
  - `+ Add child` flow on a gazetteer-only parent calls `findOrCreatePlaceWithChain` then `createPlace`.
- **E2E (Playwright):** open `EventModal`, click tree button on the place picker, filter for "Solna", expand it, add child "Testgård", confirm picker shows "Sweden › Stockholm län › Solna › Testgård" and the new place is in the DB with the correct `parent_place_id`.

## Out of scope (explicit non-goals)

- Reordering, renaming, or deleting nodes from the tree (use `PlacePanel` / `PlaceModal`).
- Editing gazetteers (they're bundled JSON; user-imported gazetteers stay read-only here too).
- Showing per-node counts (DB child count, person count). Could be added later as a non-blocking enhancement.
- Drag-and-drop re-parenting. Out of scope; would invite accidental DB changes during browse.

## Open questions

None at this point — design approved by user 2026-05-01.
