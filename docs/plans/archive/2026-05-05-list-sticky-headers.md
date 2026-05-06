# Implementation: Sticky table headers across list views

**Date:** 2026-05-05
**Branch strategy:** main (CSS-only)
**Source:** Beta tester report 62 (v0.215.2)

## User goal

Scroll down a long person list and still see the column headers (Förnamn / Efternamn / Född) at the top of the visible area. Today the header row scrolls off, so the user has to scroll back up to remember which column is which — particularly painful when picking a sort.

The user's words (translated): *"In the person list, when the list is long enough that the scroll bar appears and I scroll down, the header row where I select sort criteria disappears. Wish: the header row should stay visible."*

## Scope

Every list view in the renderer with a sortable / scrolling table. Per renderer rules, every entity-list view shares the `usePagedList` infinite-scroll pattern, so all of them have the same scroll-container shape and the fix is one CSS rule shared across them.

Files (audit and apply the same fix to every `.data-table` consumer):
- `src/renderer/views/PersonsListTab.vue`
- `src/renderer/views/PlacesView.vue`
- `src/renderer/views/SourcesView.vue`
- `src/renderer/views/MediaView.vue`
- `src/renderer/views/GroupsView.vue`
- `src/renderer/views/ResearchTasksView.vue`
- `src/renderer/views/QualityView.vue`
- `src/renderer/views/DuplicatesView.vue`
- `src/renderer/views/SearchView.vue`
- Any other view with a `<table class="data-table">` and a `scroll-sentinel` (audit during impl)
- Plus modal pickers that use `.data-table` (PersonPicker, place tree picker, etc.) — audit during impl

The fix lives in **one place**: `src/renderer/styles/shared.css`'s `.data-table` rules. Adding `position: sticky; top: 0;` to `.data-table thead th` makes every consumer benefit. **Do not** copy the rule into per-view scoped blocks (that would silently re-introduce the diverge problem the project already documented; see `shared.css` rules in CLAUDE.md).

### Scope deviations

- Tables that are NOT inside a scroll container (i.e. the page itself scrolls, not the table) are out of scope unless trivially fixable. The default pattern is `flex: 1; min-height: 0; overflow-y: auto` on the scroll container; `position: sticky` on `thead th` works inside that. If a view has the page-scroll shape, file it as a follow-up.
- Mobile-shaped views: out of scope (project is desktop).

## Design summary

### The CSS

In `src/renderer/styles/shared.css`, find the existing `.data-table thead th` rule and add:

```css
.data-table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--surface);  /* opaque so rows don't show through */
  /* keep existing border-bottom / padding etc. */
}
```

Required: solid background — without it, rows scroll *behind* the header and you see content through it. Use `var(--surface)` (the panel/list background token).

`z-index: 1` is enough since rows are at the default z. Avatars and avatars-in-rows are at the same z; sticky parent header beats them via stacking context.

### Edge case: nested sticky inside `<keep-alive>` / scroll restoration

`PersonsView` uses `<keep-alive>` for tab navigation. `position: sticky` works inside keep-alive but only if the scroll container has `overflow-y: auto` (not `visible`). Confirm during impl that the scroll container shape matches; if not, the table needs to be wrapped in `<div class="data-table-scroll" style="overflow-y:auto; flex:1; min-height:0">` first. The `usePagedList` pattern documented in `.claude/rules/renderer.md` already calls for this shape.

## Tasks

- [x] **Audit** every view; PersonsListTab/DuplicatesView/MediaView/PlacesView/SourcesView already had per-view sticky-header rules — consolidated to one shared.css rule.
- [x] **Edit `shared.css`** — sticky `.data-table thead th` rule added with `position: sticky; top: 0; z-index: 1; background: var(--surface)` plus a 1px inset shadow as bottom separator.
- [x] **Per-view scoped overrides removed** — five views had duplicate sticky declarations; replaced each with a single comment pointing at shared.css.
- [x] **Manual visual verification deferred to user** (mechanical correctness verified via code review — single shared rule, opaque background, all consumers use the shared class).
- [x] **Patch bump** to v0.215.5 + CHANGELOG entry.

## Verification (user-observable)

1. Persons view: scroll down past 50 rows. The Förnamn / Efternamn / Född header stays at the top of the table.
2. Click a header to change sort. Header stays visible during the resort.
3. Repeat on Places, Sources, Media, Groups, ResearchTasks, Quality, Duplicates, Search. Same behavior.
4. PersonPicker modal: open it with enough rows to scroll. Header stays visible.

## Failure modes / RCA reference

- **Transparent thead.** Forgetting `background: var(--surface)` makes rows scroll behind the header and the header looks broken. Mandatory.
- **Wrong scroll container.** If `position: sticky` doesn't work, the parent's `overflow` isn't `auto`/`scroll` somewhere up the chain. Use `dom-first-debugging` skill to inspect computed styles.
- **Per-view override.** Don't copy the sticky rule into `<style scoped>` of any view — that's the silently-diverging anti-pattern the renderer rules call out (`shared.css` is the namespace). One change in `shared.css` covers every consumer.
- **Multi-line headers.** If any view has a `<colgroup>` or two-row `<thead>`, the sticky rule may need `top: 0` on the first row and a custom offset on the second. Audit during impl.
