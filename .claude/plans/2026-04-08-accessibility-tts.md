# Accessibility (WCAG 2.1 AA) + TTS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Släktforskning app WCAG 2.1 AA compliant and add a built-in text-to-speech feature on all detail views.

**Architecture:** Bottom-up component fix — shared components first (BaseModal, pickers, clickable rows), then views, then charts, then TTS composable. All changes use built-in browser APIs — no new dependencies.

**Tech Stack:** Vue 3 Composition API, ARIA attributes, Web Speech API (speechSynthesis), vue-i18n

**Spec:** `docs/superpowers/specs/2026-04-08-accessibility-tts-design.md`

---

## File Map

### New files
| File | Responsibility |
|------|---------------|
| `src/renderer/composables/useFocusTrap.ts` | Reusable focus trap composable for modals |
| `src/renderer/composables/useTTS.ts` | Text-to-speech composable (speak/stop/isSpeaking) |
| `src/renderer/utils/narration.ts` | Per-entity narration text builders |
| `src/renderer/components/charts/PedigreeListView.vue` | Accessible list alternative for pedigree chart |
| `tests/unit/useTTS.test.ts` | Unit tests for TTS composable |
| `tests/unit/narration.test.ts` | Unit tests for narration text generation |
| `tests/unit/useFocusTrap.test.ts` | Unit tests for focus trap |

### Modified files
| File | Changes |
|------|---------|
| `src/renderer/components/BaseModal.vue` | Add role=dialog, aria-modal, aria-labelledby, focus trap |
| `src/renderer/components/ToastNotification.vue` | Add role=alert, aria-live |
| `src/renderer/components/PersonPicker.vue` | ARIA combobox pattern, keyboard nav |
| `src/renderer/components/PlacePicker.vue` | ARIA combobox pattern, keyboard nav |
| `src/renderer/components/GroupPicker.vue` | ARIA combobox pattern, keyboard nav |
| `src/renderer/components/PersonNamesTable.vue` | Keyboard-accessible clickable rows |
| `src/renderer/components/ResearchTasksTable.vue` | Keyboard-accessible clickable rows |
| `src/renderer/components/EventList.vue` | Keyboard-accessible clickable rows |
| `src/renderer/components/DateInput.vue` | aria-label on inputs |
| `src/renderer/App.vue` | Skip link, nav aria, settings aria, emoji aria-hidden |
| `src/renderer/views/PersonDetailView.vue` | Heading hierarchy, icon labels, TTS button |
| `src/renderer/views/RelationshipDetailView.vue` | Heading hierarchy, TTS button |
| `src/renderer/views/SourceDetailView.vue` | Heading hierarchy, TTS button |
| `src/renderer/components/charts/PedigreeChart.vue` | SVG ARIA tree roles, keyboard nav, focus ring |
| `src/renderer/styles/shared.css` | Focus-visible styles, skip-link styles |
| `src/renderer/i18n/en.ts` | Accessibility i18n keys |
| `src/renderer/i18n/sv.ts` | Accessibility i18n keys (Swedish) |

---

## Task 1: Focus Trap Composable

**Files:**
- Create: `src/renderer/composables/useFocusTrap.ts`
- Create: `tests/unit/useFocusTrap.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/useFocusTrap.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("useFocusTrap", () => {
  it("should be importable", async () => {
    const mod = await import("../../src/renderer/composables/useFocusTrap");
    expect(mod.useFocusTrap).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/unit/useFocusTrap.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the composable**

```typescript
// src/renderer/composables/useFocusTrap.ts
import { onMounted, onUnmounted, ref, type Ref } from "vue";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export function useFocusTrap(containerRef: Ref<HTMLElement | null>) {
  const previouslyFocused = ref<HTMLElement | null>(null);

  function getFocusableElements(): HTMLElement[] {
    if (!containerRef.value) return [];
    return Array.from(containerRef.value.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key !== "Tab") return;
    const focusable = getFocusableElements();
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function activate() {
    previouslyFocused.value = document.activeElement as HTMLElement;
    const focusable = getFocusableElements();
    const autofocusEl = containerRef.value?.querySelector<HTMLElement>("[autofocus]");
    if (autofocusEl) {
      autofocusEl.focus();
    } else if (focusable.length > 0) {
      focusable[0].focus();
    }
    containerRef.value?.addEventListener("keydown", handleKeydown);
  }

  function deactivate() {
    containerRef.value?.removeEventListener("keydown", handleKeydown);
    previouslyFocused.value?.focus();
  }

  onMounted(activate);
  onUnmounted(deactivate);

  return { activate, deactivate };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/unit/useFocusTrap.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(a11y): add useFocusTrap composable"
```

---

## Task 2: BaseModal Accessibility

**Files:**
- Modify: `src/renderer/components/BaseModal.vue`
- Modify: `src/renderer/styles/shared.css`

- [ ] **Step 1: Add focus-visible styles to shared.css**

Add at the end of shared.css (before dark mode section):

```css
/* Focus visible — accessibility */
:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.skip-link {
  position: absolute;
  left: -9999px;
  top: 0;
  z-index: 10000;
  padding: 8px 16px;
  background: var(--color-primary);
  color: white;
  text-decoration: none;
  font-size: var(--font-sm);
  border-radius: 0 0 4px 4px;
}
.skip-link:focus {
  left: 8px;
}
```

- [ ] **Step 2: Rewrite BaseModal.vue with ARIA and focus trap**

Replace the full content of `src/renderer/components/BaseModal.vue`:

```vue
<!-- src/renderer/components/BaseModal.vue -->
<template>
  <div class="modal-overlay" role="presentation" @click.self="('close')">
    <div
      ref="modalRef"
      class="modal"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
    >
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useFocusTrap } from "../composables/useFocusTrap";

defineProps<{ titleId?: string }>();
const emit = defineEmits<{ close: [] }>();

const modalRef = ref<HTMLElement | null>(null);
useFocusTrap(modalRef);

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close");
}

import { onMounted, onUnmounted } from "vue";
onMounted(() => window.addEventListener("keydown", handleKeydown));
onUnmounted(() => window.removeEventListener("keydown", handleKeydown));
</script>
```

- [ ] **Step 3: Update all BaseModal consumers to pass titleId**

Each modal that uses BaseModal needs to add an `id` to its `<h3>` and pass `:title-id` to BaseModal. Example for PersonNameFormModal:

Find: `<BaseModal @close="('close')">`
Replace: `<BaseModal :title-id="'modal-title-name'" @close="('close')">`

And add `id="modal-title-name"` to the `<h3>` in that modal.

Repeat for all consumers: EventForm, CitationForm, AddRelatedPersonModal, AddResearchTaskModal, and any other modals using BaseModal. Each should have a unique id string (e.g. `modal-title-event`, `modal-title-citation`, etc.).

- [ ] **Step 4: Manually verify modal focus trap**

Run: `npm start`
Open any modal. Tab through it — focus should cycle within the modal. Press Escape — modal closes. After close, focus returns to the trigger button.

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(a11y): add ARIA dialog roles and focus trap to BaseModal"
```

---

## Task 3: Toast Notification Accessibility

**Files:**
- Modify: `src/renderer/components/ToastNotification.vue`

- [ ] **Step 1: Add aria-live and role to toast container**

In `ToastNotification.vue`, change the toast container and individual toasts:

Find:
```html
    <div class="toast-container">
```
Replace:
```html
    <div class="toast-container" aria-live="assertive" aria-atomic="true">
```

Find:
```html
          @click="dismiss(toast.id)"
```
Replace:
```html
          role="alert"
          @click="dismiss(toast.id)"
          @keydown.enter="dismiss(toast.id)"
          @keydown.space.prevent="dismiss(toast.id)"
          tabindex="0"
```

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(a11y): add aria-live and role=alert to toast notifications"
```

---

## Task 4: Accessibility i18n Keys

**Files:**
- Modify: `src/renderer/i18n/en.ts`
- Modify: `src/renderer/i18n/sv.ts`

- [ ] **Step 1: Add accessibility keys to en.ts**

Add an `a11y` section to the English translations:

```typescript
  a11y: {
    skipToMain: "Skip to main content",
    readAloud: "Read aloud",
    stopReading: "Stop reading",
    goBack: "Go back",
    settings: "Settings",
    clearSearch: "Clear selection",
    searchResults: "{count} result | {count} results",
    noResults: "No results",
    deleteItem: "Delete {item}",
    editItem: "Edit {item}",
    expandRow: "Expand {item}",
    collapseRow: "Collapse {item}",
    openTasks: "{count} open task | {count} open tasks",
    qualityIssues: "{count} quality issue | {count} quality issues",
    pedigreeChart: "Pedigree chart",
    pedigreeChartDesc: "Pedigree chart showing {count} generations for {name}",
    circleChart: "Circle chart",
    circleChartDesc: "Circle chart showing {count} generations for {name}",
    generation: "Generation {n}",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    resetZoom: "Reset zoom",
    listView: "List view",
    chartView: "Chart view",
    ttsNotSupported: "Text-to-speech is not available on this device",
    dateTypeLabel: "Date precision",
    dateStartLabel: "Date",
    dateEndLabel: "End date",
    dateOriginalLabel: "Original date text",
    primaryName: "Primary name",
  },
```

- [ ] **Step 2: Add accessibility keys to sv.ts**

Add the same keys in Swedish:

```typescript
  a11y: {
    skipToMain: "Hoppa till huvudinnehåll",
    readAloud: "Läs upp",
    stopReading: "Sluta läsa",
    goBack: "Gå tillbaka",
    settings: "Inställningar",
    clearSearch: "Rensa val",
    searchResults: "{count} resultat",
    noResults: "Inga resultat",
    deleteItem: "Ta bort {item}",
    editItem: "Redigera {item}",
    expandRow: "Expandera {item}",
    collapseRow: "Stäng {item}",
    openTasks: "{count} öppen uppgift | {count} öppna uppgifter",
    qualityIssues: "{count} kvalitetsproblem",
    pedigreeChart: "Antavla",
    pedigreeChartDesc: "Antavla med {count} generationer för {name}",
    circleChart: "Cirkeldiagram",
    circleChartDesc: "Cirkeldiagram med {count} generationer för {name}",
    generation: "Generation {n}",
    zoomIn: "Zooma in",
    zoomOut: "Zooma ut",
    resetZoom: "Återställ zoom",
    listView: "Listvy",
    chartView: "Diagramvy",
    ttsNotSupported: "Text-till-tal är inte tillgängligt på den här enheten",
    dateTypeLabel: "Datumprecision",
    dateStartLabel: "Datum",
    dateEndLabel: "Slutdatum",
    dateOriginalLabel: "Ursprunglig datumtext",
    primaryName: "Primärt namn",
  },
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(a11y): add accessibility i18n keys for en and sv"
```

---

## Task 5: App.vue — Skip Link, Nav ARIA, Settings ARIA

**Files:**
- Modify: `src/renderer/App.vue`

- [ ] **Step 1: Add skip link as first element inside the app div**

Find:
```html
  <div class="app">
    <nav class="sidebar">
```
Replace:
```html
  <div class="app">
    <a href="#main-content" class="skip-link">{{ ('a11y.skipToMain') }}</a>
    <nav class="sidebar" aria-label="Main navigation">
```

- [ ] **Step 2: Add id to main element**

Find:
```html
    <main class="content">
```
Replace:
```html
    <main id="main-content" class="content">
```

- [ ] **Step 3: Wrap nav emojis in aria-hidden spans**

For each nav-item, wrap the emoji span in aria-hidden. Example for the first nav link:

Find:
```html
        <span class="nav-icon">🌳</span>
```
Replace:
```html
        <span class="nav-icon" aria-hidden="true">🌳</span>
```

Repeat for all nav-icon spans: 👥, 🔗, 📍, 📚, 🏷️, 🖼️, 🔬, ⚠️, 🖨️, ⚙️.

- [ ] **Step 4: Add aria-label to nav links with badge counts**

Find:
```html
      <router-link to="/research-tasks" class="nav-item">
```
Replace:
```html
      <router-link to="/research-tasks" class="nav-item" :aria-label="openTaskCount > 0 ? ('researchTasks.nav') + ', ' + openTaskCount + ' ' + ('a11y.openTasks', openTaskCount) : undefined">
```

Do the same for the quality nav link with `qualityErrorCount`.

- [ ] **Step 5: Add aria-expanded to settings toggle**

Find:
```html
        <button class="settings-toggle" @click="isSettingsOpen = !isSettingsOpen">
```
Replace:
```html
        <button class="settings-toggle" :aria-expanded="isSettingsOpen" :aria-label="('a11y.settings')" @click="isSettingsOpen = !isSettingsOpen">
```

- [ ] **Step 6: Add role=radiogroup to settings button groups**

For each settings row (theme, text size, language), add `role="radiogroup"` and `aria-label`:

Find:
```html
          <div class="settings-row">
            <button :class="['settings-option', { active: !darkMode }]" @click="setDarkMode(false)">☀ {{ ('settings.light') }}</button>
            <button :class="['settings-option', { active: darkMode }]" @click="setDarkMode(true)">🌙 {{ ('settings.dark') }}</button>
          </div>
```
Replace:
```html
          <div class="settings-row" role="radiogroup" :aria-label="('settings.appearance')">
            <button :class="['settings-option', { active: !darkMode }]" role="radio" :aria-checked="!darkMode" @click="setDarkMode(false)">☀ {{ ('settings.light') }}</button>
            <button :class="['settings-option', { active: darkMode }]" role="radio" :aria-checked="darkMode" @click="setDarkMode(true)">🌙 {{ ('settings.dark') }}</button>
          </div>
```

Repeat for text size row (`role="radiogroup"` with `:aria-label="('settings.textSize')"`) and language row (`:aria-label="('settings.language')"`).

- [ ] **Step 7: Change nav-section-label from div to h2**

Find:
```html
      <div class="nav-section-label">{{ ('nav.navigate') }}</div>
```
Replace:
```html
      <h2 class="nav-section-label">{{ ('nav.navigate') }}</h2>
```

- [ ] **Step 8: Run tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat(a11y): add skip link, nav ARIA, settings radiogroup to App.vue"
```

---

## Task 6: PersonPicker — ARIA Combobox + Keyboard Navigation

**Files:**
- Modify: `src/renderer/components/PersonPicker.vue`

- [ ] **Step 1: Add ARIA attributes to the template**

Replace the template section of PersonPicker.vue:

```vue
<template>
  <div class="person-picker">
    <div class="picker-input-wrap">
      <input
        ref="inputEl"
        type="text"
        role="combobox"
        :value="searchQuery"
        :placeholder="placeholder"
        :aria-expanded="open && results.length > 0"
        aria-autocomplete="list"
        aria-controls="person-picker-listbox"
        :aria-activedescendant="highlightIndex >= 0 ? 'person-option-' + results[highlightIndex]?.id : undefined"
        @input="onInput"
        @focus="open = true"
        @blur="onBlur"
        @keydown="onKeydown"
      />
      <button v-if="modelValue" type="button" class="picker-clear" :aria-label="('a11y.clearSearch')" @click="clear">&times;</button>
    </div>
    <ul v-if="open && results.length > 0" id="person-picker-listbox" role="listbox" class="picker-dropdown">
      <li
        v-for="(person, idx) in results"
        :key="person.id"
        :id="'person-option-' + person.id"
        role="option"
        :aria-selected="idx === highlightIndex"
        :class="['picker-option', { highlighted: idx === highlightIndex }]"
        @mousedown.prevent="select(person)"
      >
        <span class="picker-name"><PersonName :given-name="person.given_name" :surname="person.surname" :preferred-name="person.preferred_name" :nickname="person.nickname" /></span>
        <span class="picker-sex">{{ person.sex }}</span>
      </li>
    </ul>
    <div v-if="open && results.length > 0" class="sr-only" aria-live="polite">
      {{ ('a11y.searchResults', { count: results.length }, results.length) }}
    </div>
  </div>
</template>
```

- [ ] **Step 2: Add keyboard handling and highlight state to script**

Add to the script section:

```typescript
const highlightIndex = ref(-1);

// Reset highlight when results change
watch(results, () => { highlightIndex.value = -1; });

function onKeydown(e: KeyboardEvent) {
  if (!open.value || results.value.length === 0) return;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    highlightIndex.value = Math.min(highlightIndex.value + 1, results.value.length - 1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    highlightIndex.value = Math.max(highlightIndex.value - 1, 0);
  } else if (e.key === "Enter" && highlightIndex.value >= 0) {
    e.preventDefault();
    select(results.value[highlightIndex.value]);
  } else if (e.key === "Escape") {
    open.value = false;
  }
}
```

- [ ] **Step 3: Add highlight and sr-only styles**

Add to the scoped styles:

```css
.picker-option.highlighted {
  background: var(--color-row-hover);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(a11y): add ARIA combobox pattern and keyboard nav to PersonPicker"
```

---

## Task 7: PlacePicker + GroupPicker — Same ARIA Pattern

**Files:**
- Modify: `src/renderer/components/PlacePicker.vue`
- Modify: `src/renderer/components/GroupPicker.vue`

- [ ] **Step 1: Apply the same ARIA combobox pattern to PlacePicker**

Same approach as PersonPicker (Task 6): add `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant` to input. Add `role="listbox"` and `role="option"` to dropdown. Add `highlightIndex` ref and `onKeydown` handler with ArrowUp/Down/Enter/Escape. Add `aria-live` status for result count. Add `:aria-label="('a11y.clearSearch')"` to clear button if present.

- [ ] **Step 2: Apply the same pattern to GroupPicker**

Same changes as PlacePicker. GroupPicker has a "Create new" option — give it `role="option"` as well with an appropriate label.

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(a11y): add ARIA combobox and keyboard nav to PlacePicker and GroupPicker"
```

---

## Task 8: Clickable Table Rows — Keyboard Accessible

**Files:**
- Modify: `src/renderer/components/PersonNamesTable.vue`
- Modify: `src/renderer/components/ResearchTasksTable.vue`
- Modify: `src/renderer/components/EventList.vue`

- [ ] **Step 1: Fix PersonNamesTable clickable rows**

Find in PersonNamesTable.vue:
```html
      <tr v-for="name in names" :key="name.id" class="clickable-row" @click="('edit', name)">
```
Replace:
```html
      <tr v-for="name in names" :key="name.id" class="clickable-row" tabindex="0" role="button" :aria-label="('a11y.editItem', { item: (name.given_name || '') + ' ' + (name.surname || '') })" @click="('edit', name)" @keydown.enter="('edit', name)" @keydown.space.prevent="('edit', name)">
```

Also add `:aria-label="('a11y.deleteItem', { item: (name.given_name || '') + ' ' + (name.surname || '') })"` to the delete button.

- [ ] **Step 2: Fix ResearchTasksTable clickable rows**

Same pattern: add `tabindex="0"`, `role="button"`, `aria-label`, `@keydown.enter`, `@keydown.space.prevent` to each clickable `<tr>`.

For the expanded state, add `aria-expanded` to the row:
`:aria-expanded="expandedId === task.id"`

- [ ] **Step 3: Fix EventList clickable rows**

Same pattern for event rows in EventList.vue. Only add keyboard handlers when `!readonly`.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(a11y): add keyboard support to clickable table rows"
```

---

## Task 9: DateInput — ARIA Labels

**Files:**
- Modify: `src/renderer/components/DateInput.vue`

- [ ] **Step 1: Add aria-labels to all inputs**

Find:
```html
      <select :value="dateType" @change="updateDateType()">
```
Replace:
```html
      <select :value="dateType" :aria-label="('a11y.dateTypeLabel')" @change="updateDateType()">
```

Find:
```html
        type="date"
        :value="dateValue"
        @input="updateDateValue()"
```
Replace:
```html
        type="date"
        :value="dateValue"
        :aria-label="('a11y.dateStartLabel')"
        @input="updateDateValue()"
```

For the "between" end date input:
```html
        type="date"
        :value="dateValueEnd"
        :aria-label="('a11y.dateEndLabel')"
        @input="updateDateValueEnd()"
```

For the original text input:
```html
        :value="dateOriginal"
        :aria-label="('a11y.dateOriginalLabel')"
        :placeholder="('dateInput.originalPlaceholder')"
```

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(a11y): add aria-labels to DateInput fields"
```

---

## Task 10: Detail View Heading Hierarchy + Icon Labels

**Files:**
- Modify: `src/renderer/views/PersonDetailView.vue`
- Modify: `src/renderer/views/RelationshipDetailView.vue`
- Modify: `src/renderer/views/SourceDetailView.vue`

- [ ] **Step 1: PersonDetailView — add aria-label to back button**

Find:
```html
<button class="btn-back" @click=".back()">
```
Replace:
```html
<button class="btn-back" :aria-label="('a11y.goBack')" @click=".back()">
```

- [ ] **Step 2: Add aria-labelledby to sections**

For each `<section class="detail-section">` in PersonDetailView, add an id to the `<h4>` and `aria-labelledby` to the `<section>`. Example:

```html
<section class="detail-section" aria-labelledby="section-names">
  <div class="section-header">
    <h4 id="section-names">{{ ('personDetail.names') }}</h4>
```

Repeat for events, relationships, identifiers, media, research tasks, groups, notes sections.

- [ ] **Step 3: RelationshipDetailView — same pattern**

Add `aria-label` to back button and `aria-labelledby` to sections.

- [ ] **Step 4: SourceDetailView — same pattern**

Add `aria-label` to back button and `aria-labelledby` to sections.

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(a11y): add heading hierarchy and icon labels to detail views"
```

---

## Task 11: Pedigree Chart Accessibility

**Files:**
- Modify: `src/renderer/components/charts/PedigreeChart.vue`
- Create: `src/renderer/components/charts/PedigreeListView.vue`

- [ ] **Step 1: Add ARIA tree roles to PedigreeChart SVG**

Add to the `<svg>` element:
```html
role="tree"
:aria-label="('a11y.pedigreeChart')"
```

For each person box `<g>`, add:
```html
role="treeitem"
:aria-level="box.generation"
:aria-label="boxAriaLabel(box)"
tabindex="0"
@keydown="onBoxKeydown(, box)"
@focus="focusedBoxId = box.person.id"
```

- [ ] **Step 2: Add keyboard navigation and focus state**

Add to the script section:

```typescript
const focusedBoxId = ref<string | null>(null);

function boxAriaLabel(box: BoxLayout): string {
  const name = (box.person.givenName ?? "") + " " + (box.person.surname ?? "");
  const birth = box.person.birthDate ? "* " + box.person.birthDate : "";
  const death = box.person.deathDate ? "† " + box.person.deathDate : "";
  return [name.trim(), birth, death].filter(Boolean).join(", ");
}

function onBoxKeydown(e: KeyboardEvent, box: BoxLayout) {
  const boxes = layout.value.boxes;
  const idx = boxes.findIndex((b) => b.person.id === box.person.id);
  let targetIdx = -1;

  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    emit("navigate", box.person.id);
    return;
  }
  if (e.key === "ArrowRight") {
    targetIdx = boxes.findIndex((b, i) => i > idx && b.generation === box.generation);
  } else if (e.key === "ArrowLeft") {
    for (let i = idx - 1; i >= 0; i--) {
      if (boxes[i].generation === box.generation) { targetIdx = i; break; }
    }
  } else if (e.key === "ArrowUp") {
    targetIdx = boxes.findIndex((b) => b.generation === box.generation - 1);
  } else if (e.key === "ArrowDown") {
    targetIdx = boxes.findIndex((b) => b.generation === box.generation + 1);
  }

  if (targetIdx >= 0) {
    e.preventDefault();
    const targetEl = scrollRef.value?.querySelector(
          ) as HTMLElement | null;
    targetEl?.focus();
  }
}
```

- [ ] **Step 3: Add visible focus ring style**

Add to PedigreeChart scoped styles:

```css
.person-box:focus-visible {
  outline: none;
}
.person-box:focus-visible > rect:first-child {
  stroke: var(--color-primary);
  stroke-width: 2.5;
}
```

- [ ] **Step 4: Add aria-labels to zoom controls**

Find:
```html
      <button class="zoom-btn" @click="zoomIn" title="Zoom in (Ctrl+scroll)">+</button>
      <span class="zoom-level">{{ Math.round(zoom * 100) }}%</span>
      <button class="zoom-btn" @click="zoomOut">−</button>
      <button class="zoom-btn" @click="resetZoom" title="Reset zoom">↺</button>
```
Replace:
```html
      <button class="zoom-btn" :aria-label="('a11y.zoomIn')" @click="zoomIn">+</button>
      <span class="zoom-level" aria-live="polite">{{ Math.round(zoom * 100) }}%</span>
      <button class="zoom-btn" :aria-label="('a11y.zoomOut')" @click="zoomOut">−</button>
      <button class="zoom-btn" :aria-label="('a11y.resetZoom')" @click="resetZoom">↺</button>
```

- [ ] **Step 5: Create PedigreeListView component**

```vue
<!-- src/renderer/components/charts/PedigreeListView.vue -->
<template>
  <div class="pedigree-list-view">
    <ul v-if="tree" class="ancestor-list">
      <PedigreeListNode :tree="tree" :ahnentafel="1" :generation="0" />
    </ul>
    <p v-else class="empty">{{ ('common.loading') }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent } from "vue";
import type { PedigreeTree } from "../../utils/chartLayout";

// Self-referencing component for recursion
const PedigreeListNode = defineAsyncComponent(() => import("./PedigreeListNode.vue"));

defineProps<{ tree: PedigreeTree | null }>();
</script>

<style scoped>
.pedigree-list-view {
  padding: 16px;
  overflow-y: auto;
}
.ancestor-list {
  list-style: none;
  padding: 0;
}
</style>
```

Also create PedigreeListNode.vue for recursive rendering:

```vue
<!-- src/renderer/components/charts/PedigreeListNode.vue -->
<template>
  <li>
    <router-link v-if="person" :to="'/persons/' + person.id" class="person-link">
      {{ (person.givenName || '') + ' ' + (person.surname || '') }}
    </router-link>
    <span v-if="person?.birthDate || person?.deathDate" class="dates">
      ({{ person.birthDate || '?' }}–{{ person.deathDate || '' }})
    </span>
    <span v-if="!person" class="unknown">{{ ('common.unknown') }}</span>
    <ul v-if="father || mother">
      <PedigreeListNode v-if="father" :tree="tree" :ahnentafel="ahnentafel * 2" :generation="generation + 1" />
      <PedigreeListNode v-if="mother" :tree="tree" :ahnentafel="ahnentafel * 2 + 1" :generation="generation + 1" />
    </ul>
  </li>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { PedigreeTree } from "../../utils/chartLayout";

const props = defineProps<{
  tree: PedigreeTree;
  ahnentafel: number;
  generation: number;
}>();

const person = computed(() => props.tree.nodes.get(props.ahnentafel) ?? null);
const father = computed(() => props.tree.nodes.get(props.ahnentafel * 2) ?? null);
const mother = computed(() => props.tree.nodes.get(props.ahnentafel * 2 + 1) ?? null);
</script>

<style scoped>
li {
  padding: 4px 0;
}
ul {
  list-style: none;
  padding-left: 24px;
  border-left: 1px solid var(--color-border);
}
.dates {
  color: var(--color-text-muted);
  font-size: var(--font-sm);
  margin-left: 4px;
}
.unknown {
  color: var(--color-text-muted);
  font-style: italic;
}
</style>
```

- [ ] **Step 6: Add list/chart toggle to VisualizationView**

In VisualizationView.vue, add a toggle button near the chart area for switching between chart and list view. When list view is active, render PedigreeListView instead of PedigreeChart.

- [ ] **Step 7: Run tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat(a11y): add ARIA tree roles, keyboard nav, focus ring, and list view to pedigree chart"
```

---

## Task 12: TTS Composable

**Files:**
- Create: `src/renderer/composables/useTTS.ts`
- Create: `tests/unit/useTTS.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/useTTS.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock speechSynthesis
const mockCancel = vi.fn();
const mockSpeak = vi.fn();
const mockGetVoices = vi.fn(() => [
  { lang: "sv-SE", name: "Anna", default: false },
  { lang: "en-US", name: "Samantha", default: true },
]);

Object.defineProperty(globalThis, "speechSynthesis", {
  value: {
    cancel: mockCancel,
    speak: mockSpeak,
    getVoices: mockGetVoices,
    speaking: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  },
  writable: true,
});
Object.defineProperty(globalThis, "SpeechSynthesisUtterance", {
  value: class {
    text = "";
    voice: unknown = null;
    lang = "";
    constructor(text: string) { this.text = text; }
  },
  writable: true,
});

describe("useTTS", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should be importable", async () => {
    const mod = await import("../../src/renderer/composables/useTTS");
    expect(mod.useTTS).toBeDefined();
  });

  it("should report isSupported as true when speechSynthesis exists", async () => {
    const { useTTS } = await import("../../src/renderer/composables/useTTS");
    const { isSupported } = useTTS();
    expect(isSupported.value).toBe(true);
  });

  it("should call speechSynthesis.speak when speak() is called", async () => {
    const { useTTS } = await import("../../src/renderer/composables/useTTS");
    const { speak } = useTTS();
    speak("Hello world", "en");
    expect(mockCancel).toHaveBeenCalled();
    expect(mockSpeak).toHaveBeenCalled();
  });

  it("should call speechSynthesis.cancel when stop() is called", async () => {
    const { useTTS } = await import("../../src/renderer/composables/useTTS");
    const { stop } = useTTS();
    stop();
    expect(mockCancel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/unit/useTTS.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the composable**

```typescript
// src/renderer/composables/useTTS.ts
import { ref } from "vue";

export function useTTS() {
  const isSpeaking = ref(false);
  const isSupported = ref(typeof speechSynthesis !== "undefined");

  function findVoice(locale: string): SpeechSynthesisVoice | null {
    if (!isSupported.value) return null;
    const voices = speechSynthesis.getVoices();
    // Exact match first (sv-SE), then prefix (sv)
    return (
      voices.find((v) => v.lang === locale) ??
      voices.find((v) => v.lang.startsWith(locale.split("-")[0])) ??
      voices.find((v) => v.default) ??
      null
    );
  }

  function speak(text: string, locale = "sv") {
    if (!isSupported.value || !text) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = findVoice(locale);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = locale;
    }
    utterance.onstart = () => { isSpeaking.value = true; };
    utterance.onend = () => { isSpeaking.value = false; };
    utterance.onerror = () => { isSpeaking.value = false; };
    speechSynthesis.speak(utterance);
  }

  function stop() {
    if (!isSupported.value) return;
    speechSynthesis.cancel();
    isSpeaking.value = false;
  }

  return { speak, stop, isSpeaking, isSupported };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/unit/useTTS.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(tts): add useTTS composable with Web Speech API"
```

---

## Task 13: Narration Text Generation

**Files:**
- Create: `src/renderer/utils/narration.ts`
- Create: `tests/unit/narration.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/narration.test.ts
import { describe, it, expect } from "vitest";
import { narratePerson, narrateRelationship, narrateSource } from "../../src/renderer/utils/narration";

describe("narratePerson", () => {
  it("narrates a person with birth and death", () => {
    const text = narratePerson({
      name: "Erik Johansson",
      birthDate: "1842-03-15",
      birthPlace: "Göteborg",
      deathDate: "1910-01-03",
      deathPlace: "Stockholm",
      spouseName: "Anna Nilsson",
      marriageYear: "1868",
      childrenNames: ["Karl", "Maria", "Gustaf"],
    });
    expect(text).toContain("Erik Johansson");
    expect(text).toContain("1842");
    expect(text).toContain("Göteborg");
    expect(text).toContain("1910");
    expect(text).toContain("Stockholm");
    expect(text).toContain("Anna Nilsson");
    expect(text).toContain("Karl");
  });

  it("handles missing data gracefully", () => {
    const text = narratePerson({ name: "Unknown Person" });
    expect(text).toContain("Unknown Person");
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("null");
  });
});

describe("narrateRelationship", () => {
  it("narrates a couple relationship", () => {
    const text = narrateRelationship({
      type: "couple",
      person1Name: "Erik Johansson",
      person2Name: "Anna Nilsson",
      eventSummary: "Married 12 June 1868 in Göteborg",
      childCount: 3,
    });
    expect(text).toContain("Erik Johansson");
    expect(text).toContain("Anna Nilsson");
    expect(text).toContain("3");
  });
});

describe("narrateSource", () => {
  it("narrates a source", () => {
    const text = narrateSource({
      title: "Church records, Göteborg parish",
      author: "Swedish Church",
      citationCount: 4,
    });
    expect(text).toContain("Church records");
    expect(text).toContain("Swedish Church");
    expect(text).toContain("4");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/unit/narration.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the narration utility**

```typescript
// src/renderer/utils/narration.ts

export interface PersonNarration {
  name: string;
  birthDate?: string;
  birthPlace?: string;
  deathDate?: string;
  deathPlace?: string;
  spouseName?: string;
  marriageYear?: string;
  childrenNames?: string[];
}

export interface RelationshipNarration {
  type: string;
  person1Name: string;
  person2Name: string;
  eventSummary?: string;
  childCount?: number;
}

export interface SourceNarration {
  title: string;
  author?: string;
  citationCount: number;
}

export function narratePerson(data: PersonNarration): string {
  const parts: string[] = [data.name + "."];

  if (data.birthDate || data.birthPlace) {
    const born = ["Born", data.birthDate, data.birthPlace ? "in " + data.birthPlace : ""]
      .filter(Boolean)
      .join(" ");
    parts.push(born + ".");
  }

  if (data.deathDate || data.deathPlace) {
    const died = ["Died", data.deathDate, data.deathPlace ? "in " + data.deathPlace : ""]
      .filter(Boolean)
      .join(" ");
    parts.push(died + ".");
  }

  if (data.spouseName) {
    const marriage = data.marriageYear
      ? "Married to " + data.spouseName + " in " + data.marriageYear + "."
      : "Married to " + data.spouseName + ".";
    parts.push(marriage);
  }

  if (data.childrenNames && data.childrenNames.length > 0) {
    parts.push(
      data.childrenNames.length + " children: " + data.childrenNames.join(", ") + "."
    );
  }

  return parts.join(" ");
}

export function narrateRelationship(data: RelationshipNarration): string {
  const parts: string[] = [];
  const typeLabel = data.type.charAt(0).toUpperCase() + data.type.slice(1).replace("_", " ");
  parts.push(typeLabel + " between " + data.person1Name + " and " + data.person2Name + ".");

  if (data.eventSummary) {
    parts.push(data.eventSummary + ".");
  }

  if (data.childCount !== undefined && data.childCount > 0) {
    parts.push(data.childCount + " children.");
  }

  return parts.join(" ");
}

export function narrateSource(data: SourceNarration): string {
  const parts: string[] = [data.title + "."];

  if (data.author) {
    parts.push("Author: " + data.author + ".");
  }

  parts.push(data.citationCount + " citations linked.");

  return parts.join(" ");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/unit/narration.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(tts): add narration text generation utilities"
```

---

## Task 14: TTS Read Aloud Button on Detail Views

**Files:**
- Modify: `src/renderer/views/PersonDetailView.vue`
- Modify: `src/renderer/views/RelationshipDetailView.vue`
- Modify: `src/renderer/views/SourceDetailView.vue`

- [ ] **Step 1: Add TTS button to PersonDetailView header**

Import the composable and narration utility at the top of the script:

```typescript
import { useTTS } from "../composables/useTTS";
import { narratePerson } from "../utils/narration";

const { speak, stop, isSpeaking, isSupported: ttsSupported } = useTTS();
```

Add a `readAloud` function that gathers person data and calls `speak()`:

```typescript
function readAloud() {
  if (isSpeaking.value) { stop(); return; }
  // Gather data from the loaded person, names, events, relationships
  const name = personNames.value?.[0]
    ? (personNames.value[0].given_name || "") + " " + (personNames.value[0].surname || "")
    : "Unknown";
  const birthEvent = events.value?.find((e: { event_type: string }) => e.event_type === "birth");
  const deathEvent = events.value?.find((e: { event_type: string }) => e.event_type === "death");
  // Build narration data object from loaded state and call narratePerson()
  const text = narratePerson({
    name: name.trim(),
    birthDate: birthEvent?.date_value,
    birthPlace: birthEvent?.place_name,
    deathDate: deathEvent?.date_value,
    deathPlace: deathEvent?.place_name,
  });
  speak(text, locale.value);
}
```

Add the button in the template header area, next to the "View in tree" button:

```html
<button v-if="ttsSupported" class="btn-sm" :aria-label="isSpeaking ? ('a11y.stopReading') : ('a11y.readAloud')" @click="readAloud">
  {{ isSpeaking ? '🔇' : '🔊' }}
</button>
```

- [ ] **Step 2: Add TTS button to RelationshipDetailView**

Same pattern: import useTTS and narrateRelationship, add readAloud function and button.

- [ ] **Step 3: Add TTS button to SourceDetailView**

Same pattern: import useTTS and narrateSource, add readAloud function and button.

- [ ] **Step 4: Manually verify TTS works**

Run: `npm start`
Navigate to a person detail view. Click the speaker button. Verify speech output matches the person's data. Click again to stop.

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(tts): add read aloud button to person, relationship, and source detail views"
```

---

## Task 15: TTS Settings Toggle

**Files:**
- Modify: `src/renderer/App.vue`

- [ ] **Step 1: Add TTS enable/disable setting**

Add a `ttsEnabled` ref with localStorage persistence in App.vue (following the existing darkMode/textSize pattern):

```typescript
const ttsEnabled = ref(localStorage.getItem("slaktforskning-tts") !== "false");
function setTtsEnabled(val: boolean) {
  ttsEnabled.value = val;
  localStorage.setItem("slaktforskning-tts", String(val));
}
```

Provide it so detail views can read it:

```typescript
import { provide } from "vue";
provide("ttsEnabled", ttsEnabled);
```

Add a toggle in the settings panel:

```html
<div class="settings-group-label">{{ ('a11y.readAloud') }}</div>
<div class="settings-row" role="radiogroup" :aria-label="('a11y.readAloud')">
  <button :class="['settings-option', { active: ttsEnabled }]" role="radio" :aria-checked="ttsEnabled" @click="setTtsEnabled(true)">{{ ('common.yes') }}</button>
  <button :class="['settings-option', { active: !ttsEnabled }]" role="radio" :aria-checked="!ttsEnabled" @click="setTtsEnabled(false)">{{ ('common.no') }}</button>
</div>
```

- [ ] **Step 2: Update detail views to respect ttsEnabled**

In PersonDetailView (and other detail views), inject the setting:

```typescript
const ttsEnabled = inject<Ref<boolean>>("ttsEnabled", ref(true));
```

Change the TTS button visibility:

```html
<button v-if="ttsSupported && ttsEnabled" ...>
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(tts): add TTS enable/disable toggle in settings"
```

---

## Task 16: Final Test Pass + Documentation

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `.claude/PLAN.md`

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 2: Run linter**

Run: `npm run lint`
Fix any linting issues.

- [ ] **Step 3: Update README.md**

Add an "Accessibility" section to README.md mentioning WCAG 2.1 AA compliance and the TTS feature.

- [ ] **Step 4: Update CLAUDE.md**

Add the new composables (`useFocusTrap`, `useTTS`) and utility (`narration.ts`) to the file map. Add the `a11y` i18n key namespace to the documentation. Add the TTS settings to the settings documentation.

- [ ] **Step 5: Update .claude/PLAN.md**

Mark the accessibility milestone as complete.

- [ ] **Step 6: Bump version in package.json**

Bump the minor version in package.json.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "docs: update documentation for accessibility and TTS features"
```

---
