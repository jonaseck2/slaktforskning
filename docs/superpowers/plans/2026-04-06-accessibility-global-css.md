# Accessibility & Global CSS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a single global CSS file as the design system source of truth, align all list views with consistent summary lines and filter chips, and add a Settings accordion for dark mode, text size (S/M/L), and language.

**Architecture:** A new `src/renderer/styles/shared.css` file defines CSS custom properties for font sizes, all shared class definitions, text-size accessibility tiers (`html.text-medium` / `html.text-large`), and dark mode overrides — all inside `@media screen` so exports are never affected. Each view's `<style scoped>` retains only styles unique to that view. App.vue sidebar bottom gains a settings accordion replacing the current emoji button and language select.

**Tech Stack:** Vue 3 (Composition API), CSS custom properties, localStorage for persistence, `document.documentElement.classList` for theme switching.

**Spec:** `docs/superpowers/specs/2026-04-06-accessibility-global-css-design.md`

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/renderer/styles/shared.css` | **Create** | Single source of truth: CSS vars, shared classes, text-size tiers, dark mode |
| `src/renderer/main.ts` | **Modify** | Import shared.css |
| `src/renderer/App.vue` | **Modify** | Remove dark mode rules (moved to shared.css); replace toggle+select with settings accordion; apply textSize on startup |
| `src/renderer/views/PersonsView.vue` | **Modify** | Remove duplicate scoped styles |
| `src/renderer/views/RelationshipsView.vue` | **Modify** | Remove duplicate scoped styles; fix summary "persons"→"relationships"; add type filter chips |
| `src/renderer/views/PlacesView.vue` | **Modify** | Remove duplicate scoped styles; add type filter chips |
| `src/renderer/views/SourcesView.vue` | **Modify** | Remove duplicate scoped styles |
| `src/renderer/views/GroupsView.vue` | **Modify** | Remove duplicate scoped styles; add summary line |
| `src/renderer/views/MediaView.vue` | **Modify** | Remove duplicate scoped styles (fix blue btn-add → dark); add summary line |
| `src/renderer/views/ResearchTasksView.vue` | **Modify** | Remove duplicate scoped styles; add summary line; add counts to chips |
| `src/renderer/views/QualityView.vue` | **Modify** | Remove duplicate scoped styles |
| `src/renderer/views/VisualizationView.vue` | **Modify** | Rename `.viz-tabs`→`.tab-bar` and `.tab`→`.tab-btn`; remove `div.viz-focal-label` |
| `src/renderer/views/ReportsView.vue` | **Modify** | Remove duplicate tab CSS (moved to shared.css); remove three `focal-person-display` spans |
| `src/renderer/i18n/sv.ts` | **Modify** | Add settings, summary i18n keys |
| `src/renderer/i18n/en.ts` | **Modify** | Add settings, summary i18n keys |

---

## Task 1: Create shared.css

**Files:**
- Create: `src/renderer/styles/shared.css`

- [ ] **Step 1: Create the file**

```css
/* ======================================================
   shared.css — Global design system for Släktforskning
   Imported once in main.ts. Never scope these classes.
   ====================================================== */

/* ── 1. CSS custom properties ──────────────────────────── */
:root {
  --font-xs:   11px;
  --font-sm:   13px;
  --font-base: 14px;
  --font-md:   15px;
  --font-lg:   16px;
}

/* ── 2. Text size tiers (screen only — never affects print/export) */
@media screen {
  html.text-medium {
    --font-xs:   13px;
    --font-sm:   17px;
    --font-base: 18px;
    --font-md:   19px;
    --font-lg:   20px;
  }
  html.text-large {
    --font-xs:   15px;
    --font-sm:   21px;
    --font-base: 22px;
    --font-md:   23px;
    --font-lg:   24px;
  }
}

/* ── 3. Layout ─────────────────────────────────────────── */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.count-label {
  font-size: var(--font-sm);
  color: #666;
  margin: 0 0 8px;
}
.running-hint {
  font-size: var(--font-sm);
  color: #999;
}
.empty {
  color: #999;
  padding: 40px;
  text-align: center;
}
.empty-hint {
  color: #999;
  padding: 40px;
  text-align: center;
  font-style: italic;
}
.scroll-sentinel { height: 1px; }

/* ── 4. Data table ─────────────────────────────────────── */
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
  font-size: var(--font-xs);
  text-transform: uppercase;
  color: #666;
}
.data-table td {
  font-size: var(--font-base);
}
.clickable-row { cursor: pointer; }
.clickable-row:hover { background: #f0f4ff; }

/* ── 5. Filter chips ───────────────────────────────────── */
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
  font-size: var(--font-sm);
}
.chip:hover { background: #e2e8f0; }
.chip.active {
  background: #2c3e50;
  color: white;
  border-color: #2c3e50;
}

/* ── 6. Buttons ────────────────────────────────────────── */
.btn-add {
  background: #2c3e50;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: var(--font-base);
  cursor: pointer;
  font-family: inherit;
}
.btn-add:hover { opacity: 0.9; }

.btn-sm {
  padding: 3px 8px;
  font-size: var(--font-xs);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
}
.btn-delete {
  background: #fee2e2;
  color: #b91c1c;
}
.btn-delete:hover { background: #fecaca; }

.btn-cancel {
  background: #e0e0e0;
  color: #333;
  border: none;
  padding: 7px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: var(--font-base);
  font-family: inherit;
}
.btn-cancel:hover { background: #d0d0d0; }

/* ── 7. Modal ──────────────────────────────────────────── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal {
  background: white;
  border-radius: 8px;
  padding: 24px;
  width: 450px;
  max-width: 95vw;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}
.modal h3 {
  margin: 0 0 16px;
  font-size: var(--font-lg);
}
.modal form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.modal form > label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--font-sm);
  font-weight: 600;
  color: #555;
}
.modal form input[type='text'],
.modal form input[type='url'],
.modal form input[type='number'],
.modal form select,
.modal form textarea {
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: var(--font-base);
  font-family: inherit;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
.modal-actions button {
  padding: 8px 16px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  font-size: var(--font-base);
  font-family: inherit;
}
.modal-actions button[type='submit'] {
  background: #2c3e50;
  color: white;
}

/* ── 8. Person links ───────────────────────────────────── */
.person-link {
  color: #2563eb;
  cursor: pointer;
  text-decoration: none;
}
.person-link:hover { text-decoration: underline; }

/* ── 9. Tabs (Tree + Reports) ──────────────────────────── */
.tab-bar {
  display: flex;
  gap: 0;
  margin-bottom: 16px;
  border-bottom: 2px solid #e0e0e0;
}
.tab-btn {
  padding: 8px 16px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: var(--font-sm);
  color: #666;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  font-family: inherit;
}
.tab-btn:hover { color: #2c3e50; }
.tab-btn.active {
  color: #2c3e50;
  font-weight: 600;
  border-bottom-color: #2c3e50;
}

/* ── 10. Dark mode (screen only) ───────────────────────── */
@media screen {
  html.dark body { background: #111827; color: #e2e8f0; }
  html.dark .content { background: #111827; }

  /* Tables */
  html.dark .data-table th { background: #1f2937; color: #9ca3af; border-bottom-color: #374151; }
  html.dark .data-table td { border-bottom-color: #374151; color: #e2e8f0; }
  html.dark .clickable-row:hover { background: #1e293b; }

  /* Inputs */
  html.dark input[type='text'],
  html.dark input[type='number'],
  html.dark input[type='email'],
  html.dark textarea,
  html.dark select { background: #1f2937; color: #e2e8f0; border-color: #374151; }
  html.dark input::placeholder,
  html.dark textarea::placeholder { color: #6b7280; }

  /* Modals */
  html.dark .modal { background: #1f2937; color: #e2e8f0; box-shadow: 0 8px 32px rgba(0,0,0,0.6); }
  html.dark .modal-overlay { background: rgba(0,0,0,0.65); }
  html.dark .modal h3, html.dark .modal h4 { color: #f3f4f6; }

  /* Buttons */
  html.dark .btn-add { background: #374151; color: #e2e8f0; }
  html.dark .btn-add:hover { background: #4b5563; }
  html.dark .btn-cancel { background: #374151; color: #d1d5db; }
  html.dark .btn-delete { background: #450a0a; color: #fca5a5; }
  html.dark .btn-delete:hover { background: #7f1d1d; }
  html.dark .btn-sm { background: #374151; color: #d1d5db; }
  html.dark .btn-view-tree { background: #374151; color: #93c5fd; border-color: #374151; }
  html.dark .btn-back { background: #374151; color: #d1d5db; border-color: #374151; }

  /* Chips */
  html.dark .chip { background: #1f2937; border-color: #374151; color: #9ca3af; }
  html.dark .chip:hover { background: #374151; }
  html.dark .chip.active { background: #2c3e50; color: white; border-color: #2c3e50; }

  /* Badges */
  html.dark .type-badge { background: #1e293b; color: #94a3b8; border-color: #334155; }
  html.dark .status-chip { opacity: 0.85; }

  /* Text */
  html.dark .count-label { color: #6b7280; }
  html.dark .running-hint { color: #6b7280; }
  html.dark .empty { color: #4b5563; }
  html.dark .empty-hint { color: #4b5563; }
  html.dark label { color: #9ca3af; }
  html.dark h2, html.dark h3, html.dark h4 { color: #f3f4f6; }
  html.dark .section-header h4 { color: #f3f4f6; }

  /* Detail views */
  html.dark .detail-section { border-color: #1f2937; }
  html.dark .field-grid input,
  html.dark .field-grid select,
  html.dark .field-grid textarea { background: #1f2937; color: #e2e8f0; border-color: #374151; }

  /* Links */
  html.dark .person-link { color: #60a5fa; }

  /* Banners */
  html.dark .issues-banner { background: #1e2a3a; border-color: #374151; color: #fbbf24; }
  html.dark .banner-error { background: #2d1a1a; border-color: #7f1d1d; }

  /* Group chips */
  html.dark .group-chip { background: #1f2937; border-color: #374151; color: #93c5fd; }
  html.dark .chip-remove { color: #9ca3af; }

  /* Citation badges */
  html.dark .citation-badge-sourced { background: #14532d; color: #86efac; }
  html.dark .citation-badge-unsourced { background: #78350f; color: #fcd34d; }

  /* Locale option */
  html.dark .locale-switcher option { background: #1f2937; color: #e2e8f0; }

  /* Scrollbars */
  html.dark ::-webkit-scrollbar { background: #1f2937; }
  html.dark ::-webkit-scrollbar-thumb { background: #374151; border-radius: 4px; }

  /* Tabs */
  html.dark .tab-bar { border-bottom-color: #374151; }
  html.dark .tab-btn { color: #9ca3af; }
  html.dark .tab-btn:hover { color: #e2e8f0; }
  html.dark .tab-btn.active { color: #e2e8f0; border-bottom-color: #93c5fd; }
}
```

- [ ] **Step 2: Verify file created**

```bash
wc -l src/renderer/styles/shared.css
```
Expected: ~230 lines.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/styles/shared.css
git commit -m "feat(css): create shared.css design system with CSS vars and dark mode"
```

---

## Task 2: Wire up shared.css + prepare text-size infrastructure

**Files:**
- Modify: `src/renderer/main.ts`
- Modify: `src/renderer/App.vue`

- [ ] **Step 1: Import shared.css in main.ts**

In `src/renderer/main.ts`, add this import after the existing imports (before `createApp`):

```typescript
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { router } from './router';
import { i18n } from './i18n';
import './styles/shared.css';   // ← add this line
import App from './App.vue';
```

- [ ] **Step 2: Remove the dark mode `@media screen` block from App.vue**

In `src/renderer/App.vue`, delete the entire block from line 411 to the closing `} /* end @media screen */` (everything from `@media screen {` down to and including `} /* end @media screen */`). These rules are now in shared.css.

Keep the `@media print` block intact.

- [ ] **Step 3: Remove `.dark-mode-toggle` and `.locale-switcher` CSS from App.vue**

In `src/renderer/App.vue` `<style>`, delete:
```css
.dark-mode-toggle {
  background: rgba(255, 255, 255, 0.12);
  border: none;
  border-radius: 4px;
  color: white;
  font-size: 14px;
  padding: 5px 8px;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
}
.dark-mode-toggle:hover { background: rgba(255, 255, 255, 0.2); }
```
and:
```css
.locale-switcher {
  background: rgba(255, 255, 255, 0.12);
  color: white;
  border: none;
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  outline: none;
}
.locale-switcher option {
  color: #333;
  background: white;
}
```

- [ ] **Step 4: Add textSize state and applyTextSize to App.vue script**

In `src/renderer/App.vue` `<script setup>`, replace the `darkMode` + `applyDarkMode` + `toggleDarkMode` block with:

```typescript
const darkMode = ref(localStorage.getItem('darkMode') === 'true');
const textSize = ref<'small' | 'medium' | 'large'>(
  (localStorage.getItem('textSize') as 'small' | 'medium' | 'large') ?? 'small'
);

function applyDarkMode() {
  document.documentElement.classList.toggle('dark', darkMode.value);
}

function applyTextSize() {
  document.documentElement.classList.remove('text-medium', 'text-large');
  if (textSize.value === 'medium') document.documentElement.classList.add('text-medium');
  if (textSize.value === 'large') document.documentElement.classList.add('text-large');
}
```

- [ ] **Step 5: Call applyTextSize in onMounted**

In `src/renderer/App.vue`, update the `onMounted` call to add `applyTextSize()` right after `applyDarkMode()`:

```typescript
onMounted(() => {
  applyDarkMode();
  applyTextSize();   // ← add this line
  window.addEventListener('keydown', handleGlobalKey);
  // ... rest unchanged
```

- [ ] **Step 6: Launch app and verify dark mode still works**

```bash
npm start
```
Toggle dark mode with the existing emoji button (it still works — we haven't removed it yet). Verify tables, chips, modals all look correct in both modes. Check console for CSS errors.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/main.ts src/renderer/App.vue
git commit -m "feat(css): wire shared.css; add text-size infrastructure"
```

---

## Task 3: Strip duplicate scoped styles — PersonsView + RelationshipsView

**Files:**
- Modify: `src/renderer/views/PersonsView.vue`
- Modify: `src/renderer/views/RelationshipsView.vue`

- [ ] **Step 1: Replace PersonsView `<style scoped>` block**

Replace the entire `<style scoped>` block in `src/renderer/views/PersonsView.vue` with:

```css
<style scoped>
/* Unique to PersonsView */
.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.sex-badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
}
.sex-M { background: #dbeafe; color: #1e40af; }
.sex-F { background: #fce7f3; color: #9d174d; }
.sex-U { background: #f3f4f6; color: #6b7280; }
.radio-group { display: flex; gap: 16px; margin-top: 4px; }
.radio-label { display: flex; flex-direction: row; align-items: center; gap: 6px; font-weight: normal; }
</style>
```

(All `.header`, `.count-label`, `.empty`, `.data-table`, `.clickable-row`, `.person-link`, `.scroll-sentinel`, `.modal*`, `form` styles are now in shared.css.)

- [ ] **Step 2: Replace RelationshipsView `<style scoped>` block**

Replace the entire `<style scoped>` block in `src/renderer/views/RelationshipsView.vue` with:

```css
<style scoped>
/* Unique to RelationshipsView */
.type-badge {
  background: #fef3c7;
  color: #92400e;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
}
.role-label {
  display: block;
  font-size: 11px;
  color: #888;
  margin-top: 1px;
}
</style>
```

- [ ] **Step 3: Verify both views render correctly**

```bash
npm start
```
Check Persons list and Relationships list: table, buttons, modal, chips all still styled. No visual regressions.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/views/PersonsView.vue src/renderer/views/RelationshipsView.vue
git commit -m "refactor(css): migrate PersonsView + RelationshipsView to shared.css"
```

---

## Task 4: Strip duplicate scoped styles — PlacesView + SourcesView + GroupsView

**Files:**
- Modify: `src/renderer/views/PlacesView.vue`
- Modify: `src/renderer/views/SourcesView.vue`
- Modify: `src/renderer/views/GroupsView.vue`

- [ ] **Step 1: Replace PlacesView `<style scoped>` block**

Replace the entire `<style scoped>` block in `src/renderer/views/PlacesView.vue` with:

```css
<style scoped>
/* Unique to PlacesView */
.actions-cell { white-space: nowrap; }
</style>
```

- [ ] **Step 2: Replace SourcesView `<style scoped>` block**

Replace the entire `<style scoped>` block in `src/renderer/views/SourcesView.vue` with:

```css
<style scoped>
/* Unique to SourcesView */
.type-badge {
  background: #ede9fe;
  color: #5b21b6;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
}
</style>
```

- [ ] **Step 3: Replace GroupsView `<style scoped>` block**

Replace the entire `<style scoped>` block in `src/renderer/views/GroupsView.vue` with:

```css
<style scoped>
/* Unique to GroupsView */
.notes-cell {
  color: #777;
  font-size: 13px;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
```

- [ ] **Step 4: Verify all three views render correctly**

```bash
npm start
```
Navigate to Places, Sources, and Groups. Confirm tables, buttons, modals intact.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/views/PlacesView.vue src/renderer/views/SourcesView.vue src/renderer/views/GroupsView.vue
git commit -m "refactor(css): migrate PlacesView + SourcesView + GroupsView to shared.css"
```

---

## Task 5: Strip duplicate scoped styles — MediaView + ResearchTasksView + QualityView

**Files:**
- Modify: `src/renderer/views/MediaView.vue`
- Modify: `src/renderer/views/ResearchTasksView.vue`
- Modify: `src/renderer/views/QualityView.vue`

- [ ] **Step 1: Replace MediaView `<style scoped>` block**

The existing MediaView has a blue `.btn-add` (`#3b82f6`). Removing that scoped rule lets the shared dark `.btn-add` apply instead — this is the fix.

Replace the entire `<style scoped>` block in `src/renderer/views/MediaView.vue` with:

```css
<style scoped>
/* Unique to MediaView */
.media-view { max-width: 900px; }

.file-ref-cell {
  font-family: monospace;
  font-size: 12px;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.missing-file td { opacity: 0.6; }
.missing-badge {
  display: inline-block;
  background: #e53e3e;
  color: white;
  font-size: 10px;
  font-weight: 600;
  border-radius: 4px;
  padding: 1px 5px;
  margin-left: 6px;
  vertical-align: middle;
}
.actions-cell {
  white-space: nowrap;
  display: flex;
  gap: 6px;
  align-items: center;
}
</style>
```

Also update the template: change `class="view-header"` → `class="header"` and remove the `.view-header` h2 font-size style (now a plain `h2`). The `<div class="view-header">` in MediaView is equivalent to the shared `.header` — rename it:

```html
<!-- was: <div class="view-header"> -->
<div class="header">
  <h2>{{ $t('media.title') }}</h2>
  <button class="btn-add" @click="attachFile">{{ $t('media.attach') }}</button>
</div>
```

- [ ] **Step 2: Replace ResearchTasksView `<style scoped>` block**

Replace the entire `<style scoped>` block in `src/renderer/views/ResearchTasksView.vue` with:

```css
<style scoped>
/* Unique to ResearchTasksView */
.priority-badge {
  display: inline-block;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  text-align: center;
  line-height: 24px;
  font-size: 12px;
  font-weight: 700;
  color: white;
}
.priority-0 { background: #9ca3af; }
.priority-1 { background: #60a5fa; }
.priority-2 { background: #f59e0b; }
.priority-3 { background: #ef4444; }

.status-chip {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  transition: opacity 0.15s;
}
.status-chip:hover { opacity: 0.8; }
.status-open { background: #dbeafe; color: #1d4ed8; }
.status-in_progress { background: #fef3c7; color: #92400e; }
.status-done { background: #d1fae5; color: #065f46; }
.status-stopped { background: #f3f4f6; color: #6b7280; }

.task-text {
  max-width: 380px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.person-edit-row { display: flex; align-items: center; gap: 8px; }
.person-edit-row > :first-child { flex: 1; }
.person-link-btn { white-space: nowrap; font-size: 13px; }
.actions-cell { text-align: right; white-space: nowrap; }

.expanded-row td { background: #f8fafc; padding: 0; }
.expanded-content {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.expanded-content label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: #374151;
}
.expanded-content input,
.expanded-content textarea,
.expanded-content select {
  padding: 6px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  font-family: inherit;
}
.expanded-row-inline { display: flex; gap: 16px; }
.expanded-row-inline label { flex: 1; }
.expanded-actions { display: flex; gap: 8px; justify-content: flex-end; }
</style>
```

- [ ] **Step 3: Replace QualityView `<style scoped>` block**

Replace the entire `<style scoped>` block in `src/renderer/views/QualityView.vue` with:

```css
<style scoped>
/* Unique to QualityView */
.severity-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 8px;
  text-transform: uppercase;
  white-space: nowrap;
}
.badge-error   { background: #feb2b2; color: #742a2a; }
.badge-warning { background: #fef3c7; color: #78350f; }
.badge-notice  { background: #bfdbfe; color: #1e3a8a; }

.row-ignored { opacity: 0.5; }
.row-ignored:hover { opacity: 0.7; }
.message-cell { font-size: 13px; }
.persons-cell { font-size: 13px; white-space: nowrap; }

.btn-ignore  { background: #e2e8f0; color: #4a5568; }
.btn-unignore { background: #c6f6d5; color: #276749; }
</style>
```

Also remove the bare `button { ... }` rule from QualityView's scoped styles — it was overriding globally. The `<style scoped>` block above has no bare `button` rule; all buttons use `.btn-*` classes now.

- [ ] **Step 4: Verify all three views render correctly**

```bash
npm start
```
- Media: confirm the Add/Attach button is now dark (not blue)
- Research Tasks: confirm status chips, priority badges, expanded rows work
- Quality: confirm severity badges and ignore/unignore buttons work

- [ ] **Step 5: Commit**

```bash
git add src/renderer/views/MediaView.vue src/renderer/views/ResearchTasksView.vue src/renderer/views/QualityView.vue
git commit -m "refactor(css): migrate MediaView + ResearchTasksView + QualityView to shared.css; fix Media button color"
```

---

## Task 6: Unify tabs + remove focal person labels (VisualizationView + ReportsView)

**Files:**
- Modify: `src/renderer/views/VisualizationView.vue`
- Modify: `src/renderer/views/ReportsView.vue`

- [ ] **Step 1: Rename tab classes in VisualizationView template**

In `src/renderer/views/VisualizationView.vue` template, make two changes:

1. Change `class="viz-tabs"` → `class="tab-bar"` (line 4)
2. Change `:class="['tab', { active: ... }]"` → `:class="['tab-btn', { active: ... }]"` on all four tab buttons (lines 13, 18, 23, 28)

The result for the tab bar section should look like:
```html
<div v-if="focalPerson" class="tab-bar" role="tablist">
  <button
    role="tab" :aria-selected="activeTab === 'pedigree'"
    :class="['tab-btn', { active: activeTab === 'pedigree' }]"
    data-testid="tab-pedigree" @click="setTab('pedigree')"
  >{{ $t('visualization.tab.pedigree') }}</button>
  <button
    role="tab" :aria-selected="activeTab === 'circle'"
    :class="['tab-btn', { active: activeTab === 'circle' }]"
    data-testid="tab-circle" @click="setTab('circle')"
  >{{ $t('visualization.tab.circle') }}</button>
  <button
    role="tab" :aria-selected="activeTab === 'hourglass'"
    :class="['tab-btn', { active: activeTab === 'hourglass' }]"
    data-testid="tab-hourglass" @click="setTab('hourglass')"
  >{{ $t('visualization.tab.hourglass') }}</button>
  <button
    role="tab" :aria-selected="activeTab === 'timeline'"
    :class="['tab-btn', { active: activeTab === 'timeline' }]"
    data-testid="tab-timeline" @click="setTab('timeline')"
  >{{ $t('visualization.tab.timeline') }}</button>
</div>
```

- [ ] **Step 2: Remove viz-focal-label from VisualizationView**

Delete the entire `<div class="viz-focal-label" ...>` block (lines 5–12, the div containing `<PersonName>`). Do not remove the surrounding `v-if="focalPerson"` div — just the inner focal label div.

- [ ] **Step 3: Remove .viz-tabs and .tab and .viz-focal-label CSS from VisualizationView**

In `src/renderer/views/VisualizationView.vue` `<style scoped>`, delete:
- The `.viz-tabs { ... }` rule (around line 218)
- The `.viz-focal-label { ... }` rule (around line 227)
- Any `.tab { ... }` and `.tab.active { ... }` rules

These are now provided by `.tab-bar` and `.tab-btn` in shared.css.

- [ ] **Step 4: Remove focal-person-display from ReportsView (3 occurrences)**

In `src/renderer/views/ReportsView.vue`, delete these three spans (they appear in the ancestor, individual, and ancestor book tabs respectively):

```html
<!-- Delete this line wherever it appears (3 times): -->
<span v-if="focusStore.personName" class="focal-person-display">{{ focusStore.personName }}</span>
```

Lines 21, 87, and 112. Each is inside a `<div class="controls">`.

- [ ] **Step 5: Remove .tab-bar, .tab-btn, .focal-person-display CSS from ReportsView**

In `src/renderer/views/ReportsView.vue` `<style scoped>`, delete:
- `.tab-bar { ... }` rule (line 305)
- `.tab-btn { ... }` and `.tab-btn.active { ... }` rules (lines 306–310)
- `.focal-person-display { ... }` rule (around line 321)

These are now in shared.css.

- [ ] **Step 6: Verify Tree and Reports views**

```bash
npm start
```
- Tree: tabs render with correct active styling, no person name to the left of tabs
- Reports: tabs work, no person name shown next to ancestor chart / individual summary / ancestor book controls

- [ ] **Step 7: Commit**

```bash
git add src/renderer/views/VisualizationView.vue src/renderer/views/ReportsView.vue
git commit -m "refactor(css): unify tab classes; remove redundant focal-person labels from Tree and Reports"
```

---

## Task 7: Fix and add summary lines

**Files:**
- Modify: `src/renderer/views/RelationshipsView.vue`
- Modify: `src/renderer/views/GroupsView.vue`
- Modify: `src/renderer/views/MediaView.vue`
- Modify: `src/renderer/i18n/sv.ts`
- Modify: `src/renderer/i18n/en.ts`

- [ ] **Step 1: Add i18n keys for summary lines**

In `src/renderer/i18n/sv.ts`, add a `relationships.showingOf` key and a `media.missingCount` key:

In the `relationships` section add:
```typescript
showingOf: 'Visar {shown} av {total} relationer',
```

In the `media` section add:
```typescript
missingCount: '{count} saknas',
```

In `src/renderer/i18n/en.ts`, make the same additions:

In the `relationships` section add:
```typescript
showingOf: 'Showing {shown} of {total} relationships',
```

In the `media` section add:
```typescript
missingCount: '{count} missing',
```

- [ ] **Step 2: Fix RelationshipsView summary line**

In `src/renderer/views/RelationshipsView.vue`, find the count-label paragraph:
```html
<p v-if="total > 0" class="count-label">
  {{ $t('persons.showingOf', { shown: relationships.length, total }) }}
</p>
```

Change it to:
```html
<p v-if="total > 0" class="count-label">
  {{ $t('relationships.showingOf', { shown: relationships.length, total }) }}
</p>
```

- [ ] **Step 3: Add summary line to GroupsView**

In `src/renderer/views/GroupsView.vue`, add a `<p class="count-label">` after the header div and before the empty/table:

```html
<div class="header">
  <h2>{{ $t('groups.title') }}</h2>
  <button class="btn-add" @click="showAddForm = true">{{ $t('groups.addGroup') }}</button>
</div>
<p v-if="groups.length > 0" class="count-label">{{ groups.length }} {{ $t('groups.title').toLowerCase() }}</p>
<div v-if="groups.length === 0" class="empty">...
```

- [ ] **Step 4: Add summary line + missingCount computed to MediaView**

In `src/renderer/views/MediaView.vue` script, add a computed for missing count. After the `items` ref declaration:

```typescript
const items = ref<MediaItem[]>([]);
const loading = ref(true);
const missingCount = computed(() => items.value.filter(i => i.is_missing).length);
```

Add `computed` to the vue import:
```typescript
import { ref, computed, onMounted } from 'vue';
```

In the template, add the summary line after the header div:
```html
<div class="header">
  <h2>{{ $t('media.title') }}</h2>
  <button class="btn-add" @click="attachFile">{{ $t('media.attach') }}</button>
</div>
<p v-if="!loading && items.length > 0" class="count-label">
  {{ items.length }} {{ $t('media.title').toLowerCase() }}<template v-if="missingCount > 0"> · {{ $t('media.missingCount', { count: missingCount }) }}</template>
</p>
```

- [ ] **Step 5: Verify summary lines**

```bash
npm start
```
- Relationships: "Visar X av Y relationer" (Swedish) / "Showing X of Y relationships" (English)
- Groups: "12 grupper"
- Media: "12 media · 2 saknas" (if missing files present)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/views/RelationshipsView.vue src/renderer/views/GroupsView.vue src/renderer/views/MediaView.vue src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "feat(views): fix relationship summary label; add summary lines to Groups and Media"
```

---

## Task 8: Add type filter chips to RelationshipsView

**Files:**
- Modify: `src/renderer/views/RelationshipsView.vue`

- [ ] **Step 1: Add activeTypeFilter ref and typeCounts computed**

In `src/renderer/views/RelationshipsView.vue` script, add after `const showAddForm = ref(false)`:

```typescript
const activeTypeFilter = ref<string>('all');

const typeCounts = computed(() => {
  const counts: Record<string, number> = {};
  for (const rel of relationships.value) {
    counts[rel.type] = (counts[rel.type] ?? 0) + 1;
  }
  return counts;
});

const typeFilters = computed(() => [
  { value: 'all', label: `${t('common.all')} (${relationships.value.length})` },
  ...RELATIONSHIP_TYPE_VALUES
    .filter(type => (typeCounts.value[type] ?? 0) > 0)
    .map(type => ({
      value: type,
      label: `${t('relTypes.' + type)} (${typeCounts.value[type] ?? 0})`,
    })),
]);

const filteredRelationships = computed(() =>
  activeTypeFilter.value === 'all'
    ? relationships.value
    : relationships.value.filter(r => r.type === activeTypeFilter.value)
);
```

- [ ] **Step 2: Add "all" i18n key**

In `src/renderer/i18n/sv.ts`, add to `common`:
```typescript
all: 'Alla',
```

In `src/renderer/i18n/en.ts`, add to `common`:
```typescript
all: 'All',
```

- [ ] **Step 3: Add filter chips to RelationshipsView template**

In the template, add the filter chips block between the count label and the table. Also change `v-for="rel in relationships"` to `v-for="rel in filteredRelationships"`:

```html
<p v-if="total > 0" class="count-label">
  {{ $t('relationships.showingOf', { shown: relationships.length, total }) }}
</p>

<div v-if="relationships.length > 0" class="filter-chips">
  <button
    v-for="f in typeFilters"
    :key="f.value"
    :class="['chip', { active: activeTypeFilter === f.value }]"
    @click="activeTypeFilter = f.value"
  >{{ f.label }}</button>
</div>

<div v-if="filteredRelationships.length === 0 && !loading" class="empty">
  {{ $t('relationships.emptyState') }}
</div>
<table v-else class="data-table">
  ...
  <tr v-for="rel in filteredRelationships" ...>
```

- [ ] **Step 4: Reset type filter on load**

In the `load()` function, reset the filter when loading fresh data:
```typescript
async function load() {
  if (!window.api) return;
  loading.value = true;
  activeTypeFilter.value = 'all';   // ← add this line
  try {
```

- [ ] **Step 5: Verify chips work**

```bash
npm start
```
Navigate to Relationships. Confirm chips appear (Alla, Par, Förälder-barn, etc. with counts). Clicking a chip filters the table. "Alla" shows all rows.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/views/RelationshipsView.vue src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "feat(relationships): add type filter chips with counts"
```

---

## Task 9: Add type filter chips to PlacesView

**Files:**
- Modify: `src/renderer/views/PlacesView.vue`

- [ ] **Step 1: Add activeTypeFilter ref and computed**

In `src/renderer/views/PlacesView.vue` script, add after existing refs:

```typescript
const activeTypeFilter = ref<string>('all');

const typeCounts = computed(() => {
  const counts: Record<string, number> = {};
  for (const place of places.value) {
    const key = place.place_type ?? 'other';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
});

const typeFilters = computed(() => [
  { value: 'all', label: `${t('common.all')} (${places.value.length})` },
  ...PLACE_TYPE_VALUES
    .filter(type => (typeCounts.value[type] ?? 0) > 0)
    .map(type => ({
      value: type,
      label: `${t('placeTypes.' + type)} (${typeCounts.value[type] ?? 0})`,
    })),
]);

const filteredPlaces = computed(() =>
  activeTypeFilter.value === 'all'
    ? places.value
    : places.value.filter(p => (p.place_type ?? 'other') === activeTypeFilter.value)
);
```

Add `computed` to the vue import (it's already `import { ref, reactive, onMounted, ... } from 'vue'` — just add `computed`). PlacesView already imports `useI18n` but calls it without destructuring. Change:
```typescript
useI18n();
```
to:
```typescript
const { t } = useI18n();
```

- [ ] **Step 2: Add filter chips and update v-for in template**

Replace the count label + empty + table section:

```html
<p v-if="places.length > 0" class="count-label">{{ places.length }} {{ $t('places.title').toLowerCase() }}</p>

<div v-if="places.length > 0" class="filter-chips">
  <button
    v-for="f in typeFilters"
    :key="f.value"
    :class="['chip', { active: activeTypeFilter === f.value }]"
    @click="activeTypeFilter = f.value"
  >{{ f.label }}</button>
</div>

<div v-if="filteredPlaces.length === 0" class="empty">{{ $t('places.none') }}</div>
<table v-else class="data-table">
  <thead>...</thead>
  <tbody>
    <tr
      v-for="place in filteredPlaces"
      :key="place.id"
      class="clickable-row"
      @click="$router.push('/places/' + place.id)"
    >
```

- [ ] **Step 3: Remove the type column from the table**

The type is now represented in the filter chips. Remove the `<th>{{ $t('places.type') }}</th>` header and the `<td>{{ place.place_type ? $t('placeTypes.' + place.place_type) : '—' }}</td>` cell from the table rows.

- [ ] **Step 4: Verify chips work**

```bash
npm start
```
Navigate to Places. Confirm chips appear with place type counts. Clicking a chip filters rows. The type column is gone from the table (represented by active chip instead).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/views/PlacesView.vue
git commit -m "feat(places): replace type column with filter chips"
```

---

## Task 10: Add counts to ResearchTasksView filter chips + add summary line

**Files:**
- Modify: `src/renderer/views/ResearchTasksView.vue`

- [ ] **Step 1: Add openCount computed**

In `src/renderer/views/ResearchTasksView.vue` script, add after the `tasks` ref:

```typescript
const openCount = computed(() =>
  tasks.value.filter(t => t.status === 'open' || t.status === 'in_progress').length
);
```

- [ ] **Step 2: Add counts to filters computed**

Update the `filters` computed to include counts:

```typescript
const filters = computed(() => [
  { value: 'all',         label: `${t('researchTasks.filterAll')} (${tasks.value.length})` },
  { value: 'open',        label: `${t('researchTasks.statuses.open')} (${tasks.value.filter(t => t.status === 'open').length})` },
  { value: 'in_progress', label: `${t('researchTasks.statuses.in_progress')} (${tasks.value.filter(t => t.status === 'in_progress').length})` },
  { value: 'done',        label: `${t('researchTasks.statuses.done')} (${tasks.value.filter(t => t.status === 'done').length})` },
  { value: 'stopped',     label: `${t('researchTasks.statuses.stopped')} (${tasks.value.filter(t => t.status === 'stopped').length})` },
]);
```

- [ ] **Step 3: Add i18n key for research summary**

In `src/renderer/i18n/sv.ts`, in the `researchTasks` section add:
```typescript
summary: '{count} forskningsmål · {open} aktiva',
```

In `src/renderer/i18n/en.ts`, in the `researchTasks` section add:
```typescript
summary: '{count} research tasks · {open} active',
```

- [ ] **Step 4: Add summary line to template**

In `src/renderer/views/ResearchTasksView.vue` template, add a count-label after the header and before the filter chips:

```html
<div class="header">
  <h2>{{ $t('researchTasks.title') }}</h2>
  <button class="btn-add" @click="showAddModal = true">{{ $t('researchTasks.addTask') }}</button>
</div>

<p v-if="tasks.length > 0" class="count-label">
  {{ $t('researchTasks.summary', { count: tasks.length, open: openCount }) }}
</p>

<!-- Status filter chips -->
<div class="filter-chips">
```

- [ ] **Step 5: Verify**

```bash
npm start
```
Navigate to Research Tasks. Confirm: "14 forskningsmål · 14 aktiva" summary line appears. Chips show counts: "Alla (14) · Öppna (8) · Pågår (6) · Klar (0) · Stoppad (0)".

- [ ] **Step 6: Commit**

```bash
git add src/renderer/views/ResearchTasksView.vue src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "feat(research): add summary line and counts to filter chips"
```

---

## Task 11: Add Settings accordion to App.vue

**Files:**
- Modify: `src/renderer/App.vue`
- Modify: `src/renderer/i18n/sv.ts`
- Modify: `src/renderer/i18n/en.ts`

- [ ] **Step 1: Add i18n keys**

In `src/renderer/i18n/sv.ts`, add a `settings` section and update `nav`:

In the `nav` section, add:
```typescript
settings: 'Inställningar',
```

Add a new top-level section after `nav`:
```typescript
settings: {
  appearance: 'Utseende',
  light: 'Ljust',
  dark: 'Mörkt',
  textSize: 'Textstorlek',
  language: 'Språk',
},
```

In `src/renderer/i18n/en.ts`, make the same additions:

In `nav`:
```typescript
settings: 'Settings',
```

New top-level section:
```typescript
settings: {
  appearance: 'Appearance',
  light: 'Light',
  dark: 'Dark',
  textSize: 'Text Size',
  language: 'Language',
},
```

- [ ] **Step 2: Add isSettingsOpen ref to App.vue script**

In `src/renderer/App.vue` script, add:
```typescript
const isSettingsOpen = ref(false);
```

Add `setDarkMode` and `setTextSize` and `setLocale` functions. Replace the existing `toggleDarkMode` and `switchLocale` functions with:

```typescript
function setDarkMode(on: boolean) {
  darkMode.value = on;
  localStorage.setItem('darkMode', String(on));
  applyDarkMode();
}

function setTextSize(size: 'small' | 'medium' | 'large') {
  textSize.value = size;
  localStorage.setItem('textSize', size);
  applyTextSize();
}

function setLocale(val: SupportedLocale) {
  locale.value = val;
  saveLocale(val);
}
```

- [ ] **Step 3: Replace template bottom with settings accordion**

In `src/renderer/App.vue` template, replace:
```html
<button class="dark-mode-toggle" @click="toggleDarkMode" :title="darkMode ? 'Light mode' : 'Dark mode'">
  {{ darkMode ? '☀️' : '🌙' }}
</button>
<select class="locale-switcher" :value="locale" @change="switchLocale($event)">
  <option value="sv">Svenska</option>
  <option value="en">English</option>
</select>
```

with:
```html
<div class="settings-section">
  <button class="settings-toggle" @click="isSettingsOpen = !isSettingsOpen">
    <span class="nav-icon">⚙️</span>
    <span class="nav-label">{{ $t('nav.settings') }}</span>
    <span class="settings-arrow">{{ isSettingsOpen ? '▴' : '▾' }}</span>
  </button>
  <div v-if="isSettingsOpen" class="settings-panel">
    <div class="settings-group-label">{{ $t('settings.appearance') }}</div>
    <div class="settings-row">
      <button :class="['settings-option', { active: !darkMode }]" @click="setDarkMode(false)">☀ {{ $t('settings.light') }}</button>
      <button :class="['settings-option', { active: darkMode }]" @click="setDarkMode(true)">🌙 {{ $t('settings.dark') }}</button>
    </div>
    <div class="settings-group-label">{{ $t('settings.textSize') }}</div>
    <div class="settings-row">
      <button :class="['settings-option', { active: textSize === 'small' }]" @click="setTextSize('small')">S</button>
      <button :class="['settings-option', { active: textSize === 'medium' }]" @click="setTextSize('medium')">M</button>
      <button :class="['settings-option', { active: textSize === 'large' }]" @click="setTextSize('large')">L</button>
    </div>
    <div class="settings-group-label">{{ $t('settings.language') }}</div>
    <div class="settings-row">
      <button :class="['settings-option', { active: locale === 'sv' }]" @click="setLocale('sv')">Svenska</button>
      <button :class="['settings-option', { active: locale === 'en' }]" @click="setLocale('en')">English</button>
    </div>
  </div>
</div>
```

- [ ] **Step 4: Add settings CSS to App.vue `<style>` block**

In `src/renderer/App.vue` `<style>` (global, not scoped), add:

```css
.settings-section {
  border-top: 1px solid rgba(255, 255, 255, 0.15);
  margin-top: 4px;
  padding-top: 4px;
}
.settings-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  padding: 7px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  text-align: left;
}
.settings-toggle:hover {
  background: rgba(255, 255, 255, 0.12);
  color: white;
}
.settings-arrow { margin-left: auto; font-size: 10px; }
.settings-panel {
  background: rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  padding: 10px;
  margin: 2px 0 4px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.settings-group-label {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.35);
  text-transform: uppercase;
  margin-top: 4px;
}
.settings-group-label:first-child { margin-top: 0; }
.settings-row { display: flex; gap: 4px; }
.settings-option {
  flex: 1;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.6);
  padding: 4px 6px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  font-family: inherit;
  text-align: center;
}
.settings-option:hover {
  background: rgba(255, 255, 255, 0.18);
  color: white;
}
.settings-option.active {
  background: rgba(255, 255, 255, 0.25);
  color: white;
  border-color: rgba(255, 255, 255, 0.4);
  font-weight: 600;
}
```

- [ ] **Step 5: Run unit tests**

```bash
npm test
```
Expected: all tests pass. (These tests cover api/ only, not the UI, so no failures expected.)

- [ ] **Step 6: Verify settings accordion**

```bash
npm start
```
- Click ⚙️ Inställningar — accordion expands
- Toggle dark/light — theme switches instantly
- Click M then L text size — all views scale up, chips/buttons/table text all get larger
- Switch language to English — UI updates
- Reload app — all three settings restored from localStorage

- [ ] **Step 7: Run e2e tests**

```bash
npx playwright test
```
Expected: PASS (smoke test + MCP server test unaffected by UI changes).

- [ ] **Step 8: Commit**

```bash
git add src/renderer/App.vue src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "feat(accessibility): add Settings accordion with dark mode, text size S/M/L, and language"
```
