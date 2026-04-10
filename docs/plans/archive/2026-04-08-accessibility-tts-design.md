# Accessibility (WCAG 2.1 AA) + Built-in TTS — Design Spec

**Date:** 2026-04-08
**Target:** WCAG 2.1 AA compliance + built-in text-to-speech on detail views
**Approach:** Bottom-up component fix — shared components first, then views, then charts, then TTS
**Dependencies:** None (all browser/Electron built-in APIs)

---

## 1. Foundation: Shared Components

### 1.1 BaseModal Accessibility

Current state: Simple overlay + slot, no ARIA semantics, no focus management.

Changes to `src/renderer/components/BaseModal.vue`:

- Add `role="dialog"`, `aria-modal="true"` to the `.modal` div
- Accept a `titleId` prop, wire `aria-labelledby` to the modal's `<h3>`
- **Focus trap implementation:**
  - On mount: find all focusable elements inside the modal (`button`, `input`, `select`, `textarea`, `a[href]`, `[tabindex]`)
  - Intercept Tab: if focus is on last element, move to first. Shift+Tab on first moves to last.
  - On open: focus the first focusable element (or the element with `autofocus`)
  - On close: restore focus to the element that triggered the modal (store `document.activeElement` before opening)
- Escape key already closes — keep existing behavior

All modals (PersonNameFormModal, EventForm, CitationForm, AddRelatedPersonModal, AddResearchTaskModal, etc.) inherit these fixes automatically through BaseModal.

### 1.2 Clickable Table Rows

Affects: PersonNamesTable, ResearchTasksTable, GroupsTable, and any other component using `<tr @click>`.

Changes per clickable row:

- Add `tabindex="0"` so rows are focusable via Tab
- Add `role="button"` to indicate interactivity
- Add `@keydown.enter` and `@keydown.space.prevent` handlers mirroring the click behavior
- Add `aria-label` describing the row action (e.g. "Edit name Erik Johansson", "Expand task: Find birth certificate")

### 1.3 Picker Components (Combobox Pattern)

Affects: PersonPicker, PlacePicker, GroupPicker.

ARIA combobox pattern implementation:

- Input element: `role="combobox"`, `aria-expanded="true|false"`, `aria-activedescendant="option-id"`, `aria-autocomplete="list"`, `aria-controls="listbox-id"`
- Dropdown list: `role="listbox"`, `id` matching `aria-controls`
- Each option: `role="option"`, unique `id`, `aria-selected="true|false"`
- Keyboard behavior:
  - Arrow Down/Up: move highlight through options
  - Enter: select highlighted option
  - Escape: close dropdown, restore previous value
- Status region: `aria-live="polite"` span announcing result count (e.g. "3 results found")

### 1.4 Skip Link

Add as the first focusable element in `src/renderer/App.vue`:

```html
<a href="#main-content" class="skip-link">Skip to main content</a>
```

Visually hidden until focused (CSS: `position: absolute; left: -9999px` with `:focus` override). The `<main>` element gets `id="main-content"`.

### 1.5 Live Regions

| Component | Change |
|-----------|--------|
| ToastNotification | Add `role="alert"` or `aria-live="assertive"` |
| Error badge (App.vue nav) | Wrap count in `aria-live="polite"` region |
| Search results | Add `aria-live="polite"` on result container |
| List views after add/delete | `aria-live="polite"` status announcing "N items" |

---

## 2. Detail Views & Forms

### 2.1 Heading Hierarchy

All detail views (PersonDetailView, RelationshipDetailView, SourceDetailView, PlaceDetailView):

- Page title: `<h2>` (person name, relationship label, etc.)
- Section headings: `<h4>` (already in place for most sections)
- Each `<section>` uses `aria-labelledby` pointing to its heading's `id`

### 2.2 Form Improvements

- DateInput: add `aria-label` to the date type `<select>` (currently unlabeled)
- Required fields: add `aria-required="true"` to required inputs
- Validation errors: set `aria-invalid="true"` on invalid fields, with `aria-describedby` pointing to an error message element
- Form submission errors: announce via `aria-live="polite"` region

### 2.3 Icon Button Labels

| Button | Location | aria-label |
|--------|----------|------------|
| Back (`←`) | Detail views | "Go back" |
| Settings toggle | App.vue | "Settings" |
| Delete buttons | Various | "Delete [entity name]" (contextual) |

### 2.4 Navigation Improvements

App.vue sidebar:

- Nav section labels: change from `<div>` to `<h2>` (or `role="heading" aria-level="2"`)
- Decorative emoji in nav links: wrap in `<span aria-hidden="true">` so screen readers skip them
- Error badge on Research Tasks link: include count in link's `aria-label` (e.g. "Research Tasks, 3 open")

---

## 3. Chart Accessibility

### 3.1 Pedigree Chart

- Chart container: `role="tree"`, `aria-label="Pedigree chart"`
- Each person node: `role="treeitem"`, `aria-level` (generation number), `aria-label` with name + birth/death years + relationship to root person
- Visually-hidden summary before chart: "Pedigree chart showing N generations for [person name]"
- **Keyboard navigation:**
  - Left/Right: navigate between siblings in same generation
  - Up: move to parent
  - Down: move to child
  - Visible focus ring on active node
  - Node label announced automatically via aria-label on focus

### 3.2 Circle Chart

Same approach as pedigree:

- Nodes get `role="treeitem"` with aria-labels
- Arrow key navigation follows radial layout logically
- Focus ring on active node

### 3.3 TTS Integration with Charts

When TTS is activated on a chart view:

- Read chart summary first: "Pedigree chart, 4 generations for Erik Johansson"
- Read focused node details: name, dates, relationship to root (e.g. "paternal grandmother")
- As user navigates with arrow keys, each node is narrated with generation and relationship context

### 3.4 Text Alternative: List View Toggle

A "List view" toggle button on chart views that renders the same data as a nested `<ul>`:

```
- Erik Johansson (1842-1910) — root
  - Johan Eriksson (1810-1878) — father
    - Erik Persson (1780-1845) — paternal grandfather
    - Maria Larsdotter (1785-1850) — paternal grandmother
  - Karin Andersdotter (1815-1880) — mother
```

Each person is a `<li>` with a link to their detail view. Serves both as screen reader alternative and a useful non-visual view for any user.

---

## 4. Built-in Text-to-Speech

### 4.1 Composable: `useTTS()`

Location: `src/renderer/composables/useTTS.ts`

```typescript
interface UseTTS {
  speak(text: string): void
  stop(): void
  isSpeaking: Ref<boolean>
  isSupported: Ref<boolean>
}
```

Implementation:

- Uses `window.speechSynthesis` API (built into Chromium/Electron)
- Selects voice matching the app's current locale via `speechSynthesis.getVoices()`
- Falls back to default voice if no locale match
- `isSpeaking` reactively tracks `speechSynthesis.speaking`
- `isSupported` is false when `window.speechSynthesis` is unavailable

### 4.2 UI Pattern

Each detail view header gets a "Read aloud" button:

- Visual: speaker icon (🔊 / 🔇), toggles between play and stop states
- `aria-label="Read aloud"` / `aria-label="Stop reading"`
- Hidden when `isSupported` is false
- Pressing while speaking stops current narration

### 4.3 Narration Content

Utility module: `src/renderer/utils/narration.ts`

Functions per entity type that take entity data and return a localized narration string using the i18n system.

**PersonDetailView narration:**
> "[Name], born [date] in [place]. Died [date] in [place]. Married to [spouse] in [year]. [N] children: [names]."

**RelationshipDetailView narration:**
> "[Type] between [person1] and [person2]. [Event type] [date] in [place]. [N] children."

**SourceDetailView narration:**
> "[Title]. Author: [author]. [N] citations linked."

**Chart narration:** Summary + focused node details (see Section 3.3).

### 4.4 Settings

A toggle in the settings area: "Enable read aloud" (on by default). When disabled, the TTS button is hidden across all views. Speech rate follows the OS setting automatically.

---

## 5. Testing & Verification

### 5.1 Automated Tests

| Test | Framework | What it verifies |
|------|-----------|-----------------|
| `useTTS()` composable | Vitest | speak/stop/isSpeaking with mocked speechSynthesis, voice selection, locale matching |
| Narration text generation | Vitest | Correct natural-language output for person/relationship/source objects |
| BaseModal focus trap | Vitest + vue-test-utils | Mount modal, simulate Tab, assert focus stays inside; assert focus restore on close |
| Clickable row keyboard | Vitest + vue-test-utils | Simulate Enter/Space on row, assert same handler as click |

### 5.2 Manual Testing Checklist

- [ ] VoiceOver (macOS): navigate full app with keyboard only, verify all interactive elements reachable and announced
- [ ] Tab through every modal — focus must not escape to background
- [ ] All clickable rows respond to Enter and Space
- [ ] Picker dropdowns navigate with arrow keys, Enter selects, Escape closes
- [ ] TTS reads correct content on PersonDetailView
- [ ] TTS reads correct content on RelationshipDetailView
- [ ] TTS reads correct content on SourceDetailView
- [ ] Chart keyboard navigation: arrow keys move between nodes, focus ring visible
- [ ] Chart TTS: narrates focused node with relationship context
- [ ] List view toggle on charts renders correct nested list
- [ ] Skip link appears on Tab from page top, jumps to main content
- [ ] Toast notifications announced by screen reader
- [ ] Color contrast meets WCAG AA (4.5:1 normal text, 3:1 large text) in light mode
- [ ] Color contrast meets WCAG AA in dark mode

### 5.3 No New Dependencies

All implementation uses built-in APIs:

- ARIA attributes: plain HTML
- Focus trapping: ~30 lines of JS in BaseModal
- Keyboard navigation: Vue `@keydown` event handlers
- TTS: `window.speechSynthesis` (Chromium built-in)
- Narration text: template strings + i18n

---

## Scope Summary

| Area | Components Affected | Effort |
|------|-------------------|--------|
| BaseModal ARIA + focus trap | BaseModal (propagates to all modals) | Medium |
| Clickable rows | PersonNamesTable, ResearchTasksTable, GroupsTable, others | Small per component |
| Picker combobox pattern | PersonPicker, PlacePicker, GroupPicker | Medium per component |
| Skip link + live regions | App.vue, ToastNotification | Small |
| Detail view headings + forms | All detail views, DateInput | Small |
| Icon button labels | App.vue, detail views | Small |
| Nav improvements | App.vue | Small |
| Chart accessibility | PedigreeChart, CircleChart | Large |
| Chart list view toggle | New component | Medium |
| TTS composable | New file | Medium |
| TTS narration utils | New file | Medium |
| TTS UI (read aloud buttons) | All detail views + chart views | Small per view |
| Tests | New test files | Medium |
