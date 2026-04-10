# Plan: UX Design System — Align All List Views to Data Quality

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make PersonsView, RelationshipsView, PlacesView, SourcesView, ResearchTasksView, and ReportsView all share the same visual design language as QualityView (the reference).

**Architecture:** Shared CSS design tokens live in each view's scoped styles. No global stylesheet — keep consistency by copying the exact same CSS blocks. The QualityView is canonical; all other views copy its table, header, chip, and button styles.

**Tech Stack:** Vue 3 Composition API, scoped CSS in each `.vue` file.

---

## Reference: QualityView Design Language

Key CSS to replicate in every view:

```css
/* Header */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

/* Count / status label */
.count-label {
  font-size: 13px;
  color: #666;
  margin: 0 0 8px;
}

/* Running hint (top-right of header) */
.running-hint {
  font-size: 13px;
  color: #999;
}

/* Filter chips */
.filter-chips {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.chip {
  padding: 4px 12px;
  border-radius: 12px;
  border: 1px solid #c8d0db;
  background: #f0f4f8;
  color: #4a5568;
  cursor: pointer;
  font-size: 13px;
}
.chip:hover { background: #e2e8f0; }
.chip.active { background: #2c3e50; color: white; border-color: #2c3e50; }

/* Table */
.data-table {
  width: 100%;
  border-collapse: collapse;
}
.data-table th,
.data-table td {
  padding: 8px 12px;
  border-bottom: 1px solid #ddd;
  text-align: left;
}
.data-table th {
  background: #eee;
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  color: #666;
}
.clickable-row { cursor: pointer; }
.clickable-row:hover { background: #f0f4ff; }

/* Person links (blue, clickable inline) */
.person-link {
  color: #2563eb;
  cursor: pointer;
  text-decoration: none;
}
.person-link:hover { text-decoration: underline; }

/* Small action buttons */
.btn-sm {
  padding: 3px 8px;
  font-size: 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
.btn-delete { background: #fee2e2; color: #b91c1c; }
.btn-delete:hover { background: #fecaca; }

/* Primary add button (header) */
.btn-add {
  background: #2c3e50;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
}
.btn-add:hover { opacity: 0.9; }

/* Empty state */
.empty {
  color: #999;
  padding: 40px;
  text-align: center;
}
```

---

## Task 1: PersonsView — Blue person name links

**Files:**
- Modify: `src/renderer/views/PersonsView.vue`

The given-name column currently shows `<PersonName>` with no link wrapper. The row is clickable, but names should also be visually blue links (matching QualityView's `.person-link` style).

- [x] In the `given_name` `<td>`, wrap `<PersonName>` in `<a class="person-link" @click.stop="goToDetail(person)">...</a>`.
- [x] Ensure the view container is `<div>` (no inner max-width). Check `<style scoped>` for any width constraints and remove them.
- [x] Align `<style scoped>` CSS: replace `.data-table`, `.data-table th`, `.data-table td`, `.clickable-row`, `.btn-sm`, `.btn-delete`, `.header`, `.count-label` with the canonical versions above.
- [x] Rename `btn-add` or `Add Person` button style to use `.btn-add` class and canonical CSS.
- [x] Run `npm test` — all 462 tests pass.
- [x] Commit: `fix(ux): PersonsView — blue person links, canonical table styles`

---

## Task 2: RelationshipsView — Reorder columns + blue name links

**Files:**
- Modify: `src/renderer/views/RelationshipsView.vue`

Current column order: Type | Person1 | Person2 | Subtype | Actions.
Target order: Person1 | Person2 | Type | Subtype | Actions. Person names should be blue router-links.

- [x] Reorder `<th>` columns: move Type after Person2.
- [x] Reorder `<td>` columns to match.
- [x] Wrap each person's `<PersonName>` in `<a class="person-link" @click.stop="$router.push('/persons/' + rel.person1_id)">...</a>` (person1) and same for person2. Only render the link if the person ID is not null.
- [x] Align `<style scoped>` CSS to canonical versions. The `Add Relationship` button should use `.btn-add`.
- [x] Run `npm test`.
- [x] Commit: `fix(ux): RelationshipsView — persons first, blue name links, canonical styles`

---

## Task 3: PlacesView — Full-width, canonical table styles

**Files:**
- Modify: `src/renderer/views/PlacesView.vue`

- [x] Check `<style scoped>` for `.places-view` or `.list-header` or `.data-table` — remove any `max-width`, ensure `width: 100%` on table.
- [x] Replace `.list-header` with `.header` and canonical header CSS.
- [x] Replace `.btn-add` with canonical `.btn-add` CSS.
- [x] Add `.count-label` paragraph showing total place count (using `places.length`).
- [x] Align all table and button styles to canonical versions.
- [x] Run `npm test`.
- [x] Commit: `fix(ux): PlacesView — full-width, canonical styles`

---

## Task 4: SourcesView — Canonical table styles

**Files:**
- Modify: `src/renderer/views/SourcesView.vue`

- [x] Check `<style scoped>` for any deviations from canonical `.data-table`, `.header`, button styles.
- [x] Update `Add Source` button to use `.btn-add` canonical style.
- [x] Add `.count-label` paragraph showing total source count.
- [x] Align all styles to canonical versions.
- [x] Run `npm test`.
- [x] Commit: `fix(ux): SourcesView — canonical table styles`

---

## Task 5: ResearchTasksView — Button, chips, full-width

**Files:**
- Modify: `src/renderer/views/ResearchTasksView.vue`

- [x] Change `Add Task` button from `btn-primary` class to `.btn-add` canonical style (dark background, matching other add buttons).
- [x] Verify `.chip` and `.chip.active` CSS exactly matches canonical versions. If `ResearchTasksView` has its own `.chip` definition, replace it with the canonical one.
- [x] Check container for any `max-width` — remove if present.
- [x] Check `<style scoped>` for `.view-header` — replace with canonical `.header` if styles differ.
- [x] Run `npm test`.
- [x] Commit: `fix(ux): ResearchTasksView — add button, chips, full-width`

---

## Task 6: ReportsView — Font alignment, zoom bottom-right, loading notification

**Files:**
- Modify: `src/renderer/views/ReportsView.vue`

The Reports view renders `<AncestorBookReport>` and other report components inside a preview. The user wants:
1. **Font alignment**: The view-level headings and controls should use consistent fonts (matching other views, not the report's Georgia font bleeding out).
2. **Zoom controls bottom-right**: Move zoom controls from the top header to a floating bottom-right position (matching tree views which have `.zoom-controls` at bottom).
3. **Loading notification**: When the report is loading/rendering, show a status hint like "Laddar rapport…" in the top-right of the header (matching QualityView's `.running-hint`).

- [x] Add a `loading` ref that is `true` while any report is fetching. Pass it into each report component via a `@loading` emit or use a `v-if/v-else` approach.

  Simpler approach: Add a `reportLoading` ref, set it true when `activeTab` changes or `ancestorRootId`/`individualPersonId`/`ancestorBookPersonId` changes, set it false once the report component emits `ready` (or after a short timeout). Show `<span v-if="reportLoading" class="running-hint">Laddar rapport…</span>` in the header.

  Actually the simplest: watch `activeTab`/person IDs and set `reportLoading = true`, then listen for a `load` event from the preview iframe or just use a 300ms timeout to clear it (report components are fast). OR just add a CSS transition.

  **Recommended implementation**: Each report component (AncestorBookReport, AncestorChartReport, etc.) should emit `loaded` when its data is ready. The ReportsView sets `reportLoading = true` on prop change, `false` when `loaded` fires.

  For now: simpler approach — watch active person ID + tab, set `reportLoading = true`, clear it after `nextTick` + rAF (the report renders synchronously in the same tick once data arrives, so a simple debounce suffices).

- [x] Move zoom controls: remove from `.view-header` row, add as a fixed/absolute positioned `.zoom-controls` div at the bottom-right of the `.preview-area` container (like tree views have theirs at bottom of chart area).
- [x] Align header font size to match other views (h2 at default size, not oversized).
- [x] Add `.running-hint` CSS to match QualityView.
- [x] Run `npm test`.
- [x] Commit: `fix(ux): ReportsView — zoom bottom-right, loading hint, font alignment`

---

## Task 7: Update skills to document UI conventions

**Files:**
- Modify: `CLAUDE.md` (add a "UI Conventions" section to the Vue Component Patterns area)
- Optionally: Modify `.claude/skills/add-feature.md` if it exists

The canonical CSS design tokens (table, header, chip, button, person-link) should be documented so future agents don't invent their own variants.

- [x] Add a "## UI Design System" section to `CLAUDE.md` (under Vue Component Patterns) documenting:
  - The canonical `.data-table` CSS
  - The `.chip` / `.chip.active` filter chip pattern
  - The `.person-link` pattern for blue inline person name links
  - The `.btn-add` pattern for primary action buttons
  - The `.header` layout pattern
  - The `.running-hint` pattern for async status
  - Note: "Copy these styles into each view's `<style scoped>` block. Do not create a global stylesheet."
- [x] Run `npm test`.
- [x] Commit: `docs: add UI design system conventions to CLAUDE.md`
