# Screen Reader Mode — Design Spec

**Date:** 2026-04-09
**Status:** Approved
**Approach:** Vue Directive + Composable Layer

## Overview

A standalone screen reader mode that enables visually impaired genealogists to fully navigate and use the application without an external screen reader. The app continuously narrates every focused element using the Web Speech API, provides single-key hotkey navigation, and supports arrow-key traversal of family trees in chart views.

This is the third Read Aloud mode alongside Off (no TTS) and Narrate (current auto-narrate on page load).

## Architecture

### Approach: Vue Directive + Composable Layer

- A \`v-narrate\` Vue directive on interactive elements provides explicit narration text
- A \`useScreenReaderMode\` composable manages global mode state, the focus-driven narration engine, and hotkey registry
- Extends the existing \`useTTS\` composable for speech synthesis
- Incremental rollout — can be added view by view

### Key Files (New)

| File | Purpose |
|------|---------|
| \`src/renderer/directives/narrate.ts\` | \`v-narrate\` directive implementation |
| \`src/renderer/composables/useScreenReaderMode.ts\` | Global mode state, focus listener, hotkey registry |
| \`src/renderer/composables/useChartNavigation.ts\` | Arrow-key tree traversal for charts |
| \`src/renderer/composables/useHotkeyRegistry.ts\` | Hotkey management (global + view-scoped) |

### Key Files (Modified)

| File | Change |
|------|--------|
| \`src/renderer/main.ts\` | Register \`v-narrate\` directive globally |
| \`src/renderer/composables/useTTS.ts\` | No API changes, used by useScreenReaderMode |
| \`src/renderer/utils/narration.ts\` | Add narration builders for all entity types and UI contexts |
| \`src/renderer/App.vue\` | Initialize screen reader mode, route-change announcements |
| All views + components | Add \`v-narrate\` directives, view-specific hotkeys |
| Settings in App.vue | Three-way Appearance (Light/Dark/High Contrast), three-way Read Aloud |
| \`src/renderer/styles/shared.css\` | High contrast theme, enhanced focus indicators |
| \`src/renderer/locales/en.ts\` | \`screenReader.*\` namespace |
| \`src/renderer/locales/sv.ts\` | \`screenReader.*\` namespace |

---

## Section 1: Mode Activation & Global State

### Settings Layout

| Section | Options |
|---------|---------|
| **Appearance** | Light / Dark / High Contrast |
| **Read Aloud** | Off / Narrate / Screen Reader |
| **Text Size** | Small / Medium / Large |
| **Language** | Swedish / English |

High Contrast is a visual theme independent of screen reader mode. A sighted user with low vision can use High Contrast without Screen Reader, and vice versa.

### \`useScreenReaderMode\` Composable

\`\`\`typescript
interface ScreenReaderMode {
  mode: Ref<'off' | 'narrate' | 'screenReader'>
  isScreenReader: ComputedRef<boolean>
  registerHotkeys(hotkeys: Hotkey[]): () => void  // returns cleanup fn
  announceRoute(routeName: string, count?: number): void
}
\`\`\`

- \`mode\` persisted to localStorage key \`slaktforskning-tts-mode\`
- When screen reader mode activates:
  - Registers global \`focusin\` listener for narration
  - Registers global \`keydown\` listener for hotkeys
  - Applies \`html.screen-reader\` CSS class
  - Announces: "Screen reader mode active. Press question mark for available commands."
- When deactivating: cleans up all listeners, removes CSS class

---

## Section 2: Focus-Driven Narration Engine

### Narration Resolution Order

When an element receives focus, the engine resolves narration text in this order (first match wins):

1. \`v-narrate\` directive value — explicit narration string or function
2. \`data-narrate\` attribute — static narration text
3. \`aria-label\` — fallback for simple elements
4. Visible text content — last resort

### \`v-narrate\` Directive

\`\`\`vue
<!-- Static string -->
<tr v-narrate="'Anna Johansson, born 1892, died 1965'">

<!-- Computed function — called on focus -->
<tr v-narrate="() => narratePersonRow(person)">

<!-- Reactive — updates when dependency changes -->
<button v-narrate="saveButtonLabel">
\`\`\`

The directive stores the narration source in a WeakMap keyed by element. The focus listener reads from that map. No DOM pollution.

### Interruption

- Any new focus event cancels the current utterance and starts the new one immediately
- No queueing — keeps it responsive
- \`Ctrl+.\` stops speech entirely (silence until next focus change)

### Non-Focusable Content

Status messages, save confirmations, and toast notifications use \`aria-live="assertive"\` regions. The narration engine watches these regions via MutationObserver and speaks insertions. This covers the existing toast system.

---

## Section 3: Hotkey System

### Global Hotkeys

Active only in screen reader mode. Suppressed when focus is on \`<input>\`, \`<textarea>\`, or \`<select>\`.

| Key | Action | Narration |
|-----|--------|-----------|
| \`?\` | Announce available hotkeys for current context | "Available commands: P persons, R relationships, ..." |
| \`P\` | Navigate to Persons list | "Persons list, {count} persons" |
| \`R\` | Navigate to Relationships list | "Relationships, {count} relationships" |
| \`S\` | Navigate to Sources list | "Sources, {count} sources" |
| \`L\` | Navigate to Places list | "Places, {count} places" |
| \`T\` | Navigate to Research Tasks | "Research tasks, {count} tasks" |
| \`V\` | Navigate to Visualization | "Visualization view" |
| \`Q\` | Navigate to Quality checks | "Quality checks" |
| \`D\` | Navigate to Database view | "Database settings" |
| \`/\` or \`F\` | Focus search input | "Search, type to find persons" |
| \`N\` | Add new item (context-dependent) | "New person" / "New source" / etc. |
| \`E\` | Edit focused item | Opens edit form, narrates "Editing {item}" |
| \`Delete\` | Delete focused item | "Delete Anna Johansson? Press Enter to confirm, Escape to cancel" |
| \`Escape\` | Close modal / stop speech / deselect | Context-dependent |
| \`Ctrl+.\` | Stop current speech | Silence |
| \`H\` | Go to home (focus person or persons list) | "Home, {focus person name}" |

### View-Specific Hotkeys

Each view registers additional hotkeys via \`useScreenReaderMode().registerHotkeys()\` (auto-cleaned on unmount):

| Context | Key | Action |
|---------|-----|--------|
| Person detail | \`1-6\` | Jump to section (Names, Events, Relationships, Media, Identifiers, Checks) |
| Visualization | \`Arrow keys\` | Tree navigation (Section 5) |
| Any list view | \`Arrow Up/Down\` | Move between rows |
| Any list view | \`Enter\` | Open focused row's detail view |

### Implementation

\`HotkeyRegistry\` class manages global + view-scoped bindings. Checks \`document.activeElement.tagName\` to suppress in text inputs. Each hotkey entry: \`{ key: string, action: () => void, description: string }\`. The \`?\` key dynamically lists all registered commands.

---

## Section 4: Table & List Navigation

### Row Navigation

All table rows and list items get \`tabindex="0"\`. Arrow Up/Down moves focus between rows. Enter opens the detail view.

### Row Narration by View

| View | Example narration |
|------|-------------------|
| Persons | "Anna Johansson, female, born 1892, 3 events, 2 relationships" |
| Relationships | "Couple: Erik Johansson and Anna Persson, married 1880" |
| Sources | "Church record: Husforhorslangd Lund 1845-1850, 5 citations" |
| Places | "Lund, city, Skane, Sweden" |
| Research Tasks | "High priority, open: Find baptism record for Erik. Assigned to Anna Johansson" |
| Events | "Birth, 15 March 1892, Lund, primary participant: Anna Johansson" |
| Quality checks | "Warning: Anna Johansson — missing birth date" |

### Empty States

When a list is empty, focus lands on the empty-state element: "No persons found. Press N to add a new person."

### Dynamic Feedback

- Search/filter changes: live region announces "{count} results" or "No results found."
- Route changes: narration engine announces page title and item count: "Persons list, 47 persons."

---

## Section 5: Chart Tree Navigation

### Arrow Key Traversal

Works on pedigree, circle, and hourglass charts:

| Key | Movement | Example narration |
|-----|----------|-------------------|
| \`Up\` | Navigate to father | "Father: Erik Johansson, born 1845 in Lund" |
| \`Down\` | Navigate to first child | "Child: Anna Johansson, born 1892" |
| \`Left\` | Mother or previous sibling | "Mother: Maria Persson, born 1850" |
| \`Right\` | Spouse or next sibling | "Spouse: Per Andersson, married 1910" |
| \`Enter\` | Open person detail view | "Opening Anna Johansson" |
| \`Space\` | Expand/collapse subtree | "Collapsed ancestors of Erik Johansson" |

### Context Narration

Focus on a chart node includes relationship context relative to the root person:

- "Paternal grandfather: Johan Eriksson, born 1810, died 1875 in Malmo. 2 children."
- "Focus person: Anna Johansson, born 1892, generation 1. Parents available above, 3 children below."

### Boundary Announcements

When navigating beyond the loaded tree:
- "No father recorded"
- "No further ancestors loaded"
- "No children recorded"
- "No spouse recorded"

### Implementation

\`useChartNavigation(tree, focusPersonId)\` composable manages a cursor position in the tree data structure. Arrow key handlers move the cursor and update both the visual focus indicator (existing \`.focused\` class) and trigger narration. Operates on tree data, not SVG DOM.

---

## Section 6: Detail View Navigation

### Section-Based Navigation

On page load, narrates a summary: "Person detail: Anna Johansson, female, born 1892 in Lund, died 1965. 6 sections available. Press 1 through 6 to jump to a section, or Tab to move through."

### Number Key Sections (PersonDetailView)

| Key | Section | Entry narration |
|-----|---------|-----------------|
| \`1\` | Names | "Names section, 2 names. Primary: Anna Johansson, birth name." |
| \`2\` | Events | "Events section, 4 events. Birth 1892, Marriage 1910, Census 1920, Death 1965." |
| \`3\` | Relationships | "Relationships section, 3 relationships. Spouse: Per Andersson. Parent of: Erik, Maria." |
| \`4\` | Media | "Media section, 2 items. Profile: Portrait photo 1920." |
| \`5\` | Identifiers | "Identifiers section, 1 identifier. FamilySearch ID: XXXX-YYY." |
| \`6\` | Quality checks | "Quality checks section, 1 warning. Missing burial place." |

### Within a Section

Arrow Up/Down moves between items. Each item narrates its row summary. \`N\` adds new item in section context. \`E\` edits focused item. \`Delete\` deletes with confirmation.

### Notes Field

When focused: "Notes: {content}" or "Notes: empty." Hotkeys suppressed while textarea is focused.

### Auto-Save Feedback

Field auto-save on blur triggers live region: "Saved."

---

## Section 7: Modal & Form Narration

### Modal Open

Narrates title and structure: "Add new person. Form with 3 fields: given name, surname, sex. Tab to move between fields."

### Field Focus Narration

| Field type | Example |
|------------|---------|
| Text input | "Given name, text field, empty" / "Given name, text field, Anna" |
| Select | "Sex, dropdown, female. Options: male, female, unknown" |
| DateInput | "Date type, dropdown, exact. Date value, 15 March 1892. Original text, den 15 mars 1892" |
| PersonPicker | "Person, search field. Type to search, {current value or empty}" |
| PlacePicker | "Place, search field. Type to search, {current value or empty}" |

### Search Dropdowns (PersonPicker, PlacePicker)

- As user types, live region: "3 matches."
- Arrow Up/Down through results: "Anna Johansson, born 1892."
- Enter selects: "Selected Anna Johansson."

### Form Actions

- Submit: "Save, button"
- Cancel: "Cancel, button"
- Success: "Saved. Modal closed." (focus returns to trigger element)
- Error: "Error: given name is required."

### Delete Confirmation

Replace browser \`confirm()\` with accessible custom modal: "Confirm delete. Delete Anna Johansson? This cannot be undone. Enter to confirm, Escape to cancel."

---

## Section 8: WCAG 2.1 AAA Visual Enhancements

### High Contrast Theme (Appearance setting, independent of Screen Reader)

- Text contrast minimum 7:1 ratio (WCAG AAA)
- Focus indicator: 3px solid high-contrast outline, 3px offset
- Links always underlined (not color-only)

### Color Independence (applies in High Contrast theme)

- Sex indicators: text labels "M", "F", "U" alongside colored bar
- Confidence badges: "Primary (3)", "Secondary (2)" text, not color-only
- Status: "Living" / "Deceased" text always visible
- Event type chips: text label always present

### Heading Structure (applies in Screen Reader mode)

- Each page gets \`<h1>\`: "Persons", "Person: Anna Johansson", "Sources", etc.
- Hierarchy enforced: h1 (page) -> h2 (major sections) -> h3 (subsections)

### Focus Management (applies in Screen Reader mode)

- Route change: focus moves to \`<h1>\`
- Modal close: focus returns to trigger element
- After delete: focus moves to next item in list (or empty state)

### Independent Controls

Text size and dark mode remain separate toggles. Screen reader mode does not force appearance settings.

---

## Section 9: Narration Utilities

### Entity Narration Functions

All in \`src/renderer/utils/narration.ts\`. All take i18n \`t\` for localization.

| Function | Example output |
|----------|----------------|
| \`narratePersonRow(person, t)\` | "Anna Johansson, female, born 1892, 3 events" |
| \`narratePersonDetail(person, names, events, rels, t)\` | "Person detail: Anna Johansson, female, born 1892 in Lund, died 1965. 6 sections available." |
| \`narrateRelationshipRow(rel, t)\` | "Couple: Erik Johansson and Anna Persson, married 1880" |
| \`narrateSourceRow(source, t)\` | "Church record: Husforhorslangd Lund 1845, 5 citations" |
| \`narratePlaceRow(place, t)\` | "Lund, city, Skane, Sweden" |
| \`narrateEventRow(event, t)\` | "Birth, 15 March 1892, Lund" |
| \`narrateTaskRow(task, t)\` | "High priority, open: Find baptism record for Erik" |
| \`narrateMediaRow(media, t)\` | "Portrait photo 1920, JPEG, profile image" |
| \`narrateQualityRow(check, t)\` | "Warning: missing birth date" |

### Chart Narration Functions

| Function | Example output |
|----------|----------------|
| \`narrateChartNode(person, relationship, generation, t)\` | "Paternal grandfather: Johan Eriksson, born 1810, generation 3. 2 children." |
| \`narrateChartBoundary(direction, t)\` | "No father recorded" |

### UI Narration Functions

| Function | Example output |
|----------|----------------|
| \`narratePageEntry(routeName, count, t)\` | "Persons list, 47 persons" |
| \`narrateModalOpen(title, fieldCount, t)\` | "Add new person. Form with 3 fields." |
| \`narrateFieldFocus(label, type, value, t)\` | "Given name, text field, Anna" |
| \`narrateSearchResults(count, t)\` | "3 matches" |
| \`narrateAction(action, target, t)\` | "Saved" / "Deleted Anna Johansson" |

Existing \`narratePerson()\`, \`narrateRelationship()\`, \`narrateSource()\` remain unchanged for Narrate mode.

---

## Section 10: i18n Extensions

### New \`screenReader\` Namespace

| Group | Example keys |
|-------|-------------|
| \`screenReader.welcome\` | "Screen reader mode active. Press question mark for available commands." |
| \`screenReader.hotkeys.*\` | "Available commands: {list}" / per-hotkey descriptions |
| \`screenReader.nav.*\` | "Persons list, {count} persons" / "Person detail: {name}" |
| \`screenReader.chart.*\` | "Father: {name}, born {date}" / "No mother recorded" / "Expanded, {n} generations" |
| \`screenReader.form.*\` | "Add new person. Form with {n} fields." / "{label}, text field, {value}" / "3 matches" |
| \`screenReader.action.*\` | "Saved" / "Deleted {name}" / "Selected {name}" / "Modal closed" |
| \`screenReader.section.*\` | "Names section, {n} names" / "Events section, {n} events" |
| \`screenReader.table.*\` | "No results found. Press N to add." / "{count} results" |

Existing \`a11y.*\` and \`narration.*\` namespaces unchanged.

---

## Out of Scope

- Speech rate/pitch/volume controls (minimal controls: interrupt only)
- Cell-by-cell table navigation (row summary only)
- Braille display support
- Custom voice selection UI (uses existing locale-based voice selection)
