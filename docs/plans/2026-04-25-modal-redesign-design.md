# Modal Redesign — Design Spec

## Goals

Fix the fragmented, inconsistent modal system by replacing it with a unified architecture: one canonical modal component per entity type, reused as side-panel sub-panels when creating linked entities. The result is a fast, keyboard-first research entry flow with no redundant components and consistent visual language.

**Non-goals:** Full accessibility rewrite, drag-and-drop, undo inside modals, bulk editing.

---

## Core Architecture

### One modal per entity

Every entity type (Person, Event, Source, Citation, Place, Relationship, ResearchTask) has exactly one modal component. That same component renders in two modes:

- **Standalone:** Centered overlay, used when navigating to create/edit from a list view or detail view.
- **Sub-panel:** Grows to the right of its parent panel, used when creating/editing a linked entity from within another modal.

The mode is controlled by a single prop (`mode: 'standalone' | 'subpanel'`). No layout logic leaks into parent components.

### Sub-panel mechanics

- Sub-panels open to the **right** of the parent panel (side by side).
- Each sub-panel has a plain **×** in the top-right corner to close it.
- Closing × discards unsaved changes in the sub-panel and returns focus to the parent's search bar.
- Nesting is recursive: Event sub-panel can open a Place sub-panel; that Place sub-panel can open a Parent Place sub-panel.
- Depth ≥ 3 is rare but supported by the same component structure — no special casing.
- The leftmost (deepest-parent) panel dims to 50% opacity when a sub-panel is open, signaling focus shift.

### Keyboard navigation

| Key | Action |
|-----|--------|
| `Tab` | Next field |
| `Shift+Tab` | Previous field |
| `↩` (Enter) | Open selected dropdown result as sub-panel; Save focused footer button |
| `↑↓` | Navigate dropdown results |
| `←→` | Move within segmented controls |
| `Esc` | Close sub-panel (if open) or cancel modal |

---

## Section Headers Inside Modals

Entity sections embedded in a modal (e.g., Events section inside Person modal) use the **flush section header** style:

- Full width — no inset, no padding offset.
- Rounded top corners only (`border-radius: 8px 8px 0 0`).
- `border-bottom: 1px solid <entity-color-border>` — same as the entity's modal header.
- Background = entity header background (`--<entity>-hd`).
- Label: entity icon + entity title (plain text, no badge chip) + count (muted) + "Open ›" right.
- Content area below: search bar + entity row list, with the standard `8px 14px` padding.

This creates a "card placed on card" metaphor — the Events section header looks identical to an Event modal header dropped onto the Person modal.

---

## Entity Modals

### Person

**Fields:**
- **Name:** Given name + Surname (side by side, equal width)
- **Sex:** Segmented control — Male | Female | Unknown

**Sections:**
- 📅 **Events** (orange) — list of events + search bar
- 🔗 **Relationships** (green) — list of relationships + search bar

No Born/Died shortcuts. Life events (birth, death, emigration, marriage, etc.) are Event entities, accessible via the Events section.

---

### Event

**Fields:**
- **Type:** Segmented control for the common types (Birth | Marriage | Death | …); selecting "…" opens a dropdown for the full list.
- **Date:** `DateInput` component (YYYY-MM-DD with auto-advance between year/month/day segments; date type selector for approximate/between/unknown).
- **Place:** Inline text field with autocomplete — searches existing places, selects or creates inline via `findOrCreate`. No Place sub-panel in MVP.

**Sections:**
- 📚 **Sources** (purple) — list of citations + source search bar

---

### Source

**Fields:**
- **Title**
- **Type** (dropdown: vital_record, census, church_record, newspaper, …)
- **Author**
- **Publication info**
- **Repository / URL**

**Sections:**
- None in the sub-panel view. When viewed as standalone (SourceDetailView equivalent), shows a Citations list (read-only).

---

### Citation

**Fields:**
- **Source** (read-only — pre-filled from the source that was selected/created in the parent Event's search bar)
- **Page / location** (text, first focused field when sub-panel opens)
- **Confidence** (segmented: Unreliable | Questionable | Secondary | Primary)
- **Transcription** (textarea, optional)
- **Notes** (text, optional)

Citation sub-panel is always opened by the parent's search bar, never standalone. Its header uses the green citation color (`--cite-*`).

---

### Place

**Fields (MVP):**
- **Name**
- **Type** (dropdown: parish, city, county, …)
- **Parent place** (inline picker — selects existing place)

Only shown as a sub-panel when typing a new place name in an Event's Place field and triggering "Create new place".

---

### Relationship

**Fields:**
- **Person 1** (`PersonPicker`)
- **Person 2** (`PersonPicker`)
- **Type** (segmented: Couple | Parent–Child | Sibling | Godparent | Other)
- **Subtype** (shown when type is Couple or Parent–Child; dropdown)

**Sections:**
- 📅 **Events** (orange) — shared events for this relationship

---

### ResearchTask

**Fields:**
- **Task** (text)
- **Priority** (segmented: Low | Medium | High)
- **Status** (segmented: Open | In Progress | Done | Stopped)
- **Person** (optional `PersonPicker`)
- **Notes** (textarea)
- **Result** (textarea, shown when status is Done/Stopped)

Only used as a standalone modal (no sub-panel use case).

---

## Citation Add Flow (Option C)

This is the full keyboard flow for adding a source citation to an event:

1. In the Event sub-panel, tab to the **Sources search bar**.
2. Type a source name → dropdown shows matching sources + "**+ Create new source** ↩".
3. **↩ on an existing source** → Citation sub-panel opens to the right. Cursor lands on **Page / location** field. Source field is pre-filled and read-only.
4. Fill Page, tab to Confidence (arrow keys to choose), tab to Transcription (optional), tab to Notes (optional).
5. **Save ↩** → Citation is saved; Citation sub-panel closes. Cursor returns to Event's Sources search bar. The new citation appears in the sources list.
6. **↩ on "+ Create new source"** → Source sub-panel opens. User fills Title, Type, Author, etc. **Save ↩** → source is created → Citation sub-panel opens automatically for that source (same as step 3 above). Cursor lands on Page.

**Rule:** Citation fields (page, confidence, transcription) never appear in Event or Source panels. Each entity owns its own fields.

---

## Entity Color System

| Entity | Header bg | Header text | Border |
|--------|-----------|-------------|--------|
| Person | `#f5f3ff` | `#4f46e5` | `#c7d2fe` |
| Event | `#fff3e8` | `#c2410c` | `#fed7aa` |
| Source | `#faf5ff` | `#7e22ce` | `#e9d5ff` |
| Citation | `#f0fdf4` | `#166534` | `#bbf7d0` |
| Place | `#f0fdf4` | `#166534` | `#bbf7d0` |
| Relationship | `#f0fdf4` | `#166534` | `#bbf7d0` |
| ResearchTask | `#fffbeb` | `#92400e` | `#fde68a` |

Section headers inside a modal use the entity color of the *section's entity type*, not the host modal's color.

---

## What Gets Replaced / Removed

| Current component | Replaced by |
|-------------------|-------------|
| `AddPersonModal.vue` | `PersonModal.vue` (standalone mode) |
| `AddRelatedPersonModal.vue` | `PersonModal.vue` (sub-panel mode, opened from Relationship picker) |
| `EventForm.vue` | `EventModal.vue` |
| `EventFormBody.vue` | Fields area of `EventModal.vue` |
| `CitationForm.vue` | `CitationModal.vue` (always sub-panel mode) |
| `CitationEditModal.vue` | `CitationModal.vue` (sub-panel or standalone) |
| Inline research task form in `ResearchTasksView` | Kept as-is; `ResearchTaskModal.vue` added for standalone add/edit |

`PersonPicker`, `DateInput`, `PlacePicker`, `SourcePicker` composables/components remain and are embedded inside the entity modals.

---

## Component Structure

```
src/renderer/components/
├── modals/
│   ├── PersonModal.vue       # Person fields + Events/Relationships sections
│   ├── EventModal.vue        # Event fields + Sources section
│   ├── SourceModal.vue       # Source fields (standalone: also Citations list)
│   ├── CitationModal.vue     # Citation fields (always sub-panel)
│   ├── PlaceModal.vue        # Place fields (sub-panel only in MVP)
│   ├── RelationshipModal.vue # Relationship fields + Events section
│   ├── ResearchTaskModal.vue # ResearchTask fields
│   └── BaseSubPanel.vue      # Shared layout shell (header, body, footer, × button)
└── (existing pickers, DateInput, etc. unchanged)
```

`BaseSubPanel` provides the shared layout: entity-colored header (icon + title + ×), scrollable body, Cancel/Save footer. Each entity modal uses `BaseSubPanel` and fills its slots.

---

## Open Questions / Deferred

- **"Open ›" behavior:** Clicking the section header label ("Open ›") could expand/collapse the section content, or navigate to the entity's standalone view. For MVP: it does nothing — the section is always expanded. Collapse is a future enhancement.
- **Multiple participants on an event:** Currently `EventParticipant` supports roles (primary, spouse, witness, etc.). The Event modal's initial MVP shows only the owning person. Future: participant list in the Event sub-panel.
- **Date input UX:** `DateInput` component's auto-advance behavior (year → month → day) is preserved. Date type (exact / about / before / after / between / unknown) is a compact selector above the date field.
