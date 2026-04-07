---
name: frontend-design
description: Frontend design patterns for Släktforskning — Vue 3 components, layout, colors, modals, i18n, error handling. Use when building any new view, component, or UI change in the renderer.
---

# Frontend Design Skill — Släktforskning

Use this skill when building any new view, component, or UI change in the renderer. It documents the established patterns that all views must follow for consistency.

---

## Layout

### App shell

The app is a fixed-height two-column layout: sidebar (185px, `#2c3e50`) + scrollable content area (`flex: 1`, `padding: 24px`, `background: #f5f5f5`).

### View root element

Every view is a `<div>` (no wrapper classes needed — content area provides padding).

---

## Colors and typography

**Never use hardcoded hex values in any CSS.** Use CSS custom properties from `src/renderer/styles/shared.css`. Adding a new color requires a variable in `shared.css` first, then a `html.dark` override.

| CSS variable | Light value | Usage |
|---|---|---|
| `--color-primary` | `#2c3e50` | Primary button bg, active chip, tab active, sidebar |
| `--color-bg` | `#ffffff` | Card/table/modal backgrounds |
| `--color-bg-subtle` | `#f8f9fa` | Hover backgrounds |
| `--color-bg-muted` | `#f0f4f8` | Chip backgrounds |
| `--color-bg-table-head` | `#eeeeee` | Table `<th>` backgrounds |
| `--color-border` | `#dddddd` | Table borders, section dividers, tab bar |
| `--color-border-input` | `#cccccc` | Form input borders |
| `--color-text` | `#333333` | Body copy |
| `--color-text-muted` | `#555555` | Form labels |
| `--color-text-subtle` | `#666666` | Table headers, secondary labels |
| `--color-text-faint` | `#999999` | Placeholders, hints, empty state |
| `--color-danger-bg` | `#fee2e2` | Delete button background |
| `--color-danger-text` | `#b91c1c` | Delete button text |
| `--color-danger-hover` | `#fecaca` | Delete button hover |
| `--color-link` | `#2563eb` | `router-link` inside content, person links |
| `--color-row-hover` | `#f0f4ff` | Clickable row hover |
| `--color-success-bg` | `#dcfce7` | Success/living status badge background |
| `--color-success-text` | `#15803d` | Success/living status badge text |

The content area background (`#f5f5f5`) and sidebar (`--color-primary`) are set directly on layout elements in App.vue.

| Element | Font size |
|---|---|
| View heading (h2) | 22–24px (browser default) |
| Section heading (h4) | 15px |
| Table header (th) | 12px, uppercase, `#666` |
| Table row text | 13px |
| Input / select | 14px |
| Button | 13–14px |
| Badge / label | 10–12px |

---

## View header pattern

Every list and detail view starts with a header row:

```html
<div class="header">
  <h2>{{ $t('entity.title') }}</h2>
  <div class="header-actions">
    <button @click="showAddForm = true">{{ $t('entity.add') }}</button>
  </div>
</div>
```

**Detail view header** also includes a back link:
```html
<div class="header">
  <router-link to="/entity-list" class="back-link">← {{ $t('common.back') }}</router-link>
  <h2>{{ displayName }}</h2>
  <div class="header-actions">
    <!-- optional action buttons like Cite, Export -->
  </div>
</div>
```

Rules:
- No form controls in the header — no selects, toggles, or inputs
- Header only contains: back link, display name, action buttons
- `header-actions` floats right via `margin-left: auto`

---

## Section pattern (detail views)

All related-data sections inside a detail view use:

```html
<section class="detail-section">
  <div class="section-header">
    <h4>{{ $t('section.title') }}</h4>
    <button class="btn-add" @click="...">+ {{ $t('section.add') }}</button>
  </div>
  <!-- section content -->
</section>
```

CSS (copy from SourceDetailView or PersonDetailView):
```css
.detail-section { background: var(--color-bg); border-radius: 8px; padding: 20px; margin-bottom: 16px; }
.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.section-header h4 { font-size: var(--font-md); color: var(--color-text); margin: 0; }
```

---

## Entity detail fields — 2-column grid

The entity's own editable fields (the DB columns) go into a 2-column grid **before** any related-data sections:

```html
<section class="detail-section">
  <div class="section-header"><h4>{{ $t('entity.details') }}</h4></div>
  <div class="field-grid">
    <label class="field-label">
      {{ $t('field.name') }}
      <input class="field-input" v-model="editValue" @blur="save()" />
    </label>
    <label class="field-label">
      {{ $t('field.other') }}
      <select class="field-input" v-model="editOther" @change="saveOther()">...</select>
    </label>
    <label class="field-label" style="grid-column: 1 / -1">
      {{ $t('field.notes') }}
      <textarea class="field-input" v-model="editNotes" @blur="saveNotes()" />
    </label>
  </div>
</section>
```

```css
.field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.field-label { display: flex; flex-direction: column; gap: 4px; font-size: var(--font-xs); color: var(--color-text-subtle); }
.field-input { padding: 6px 8px; border: 1px solid var(--color-border-input); border-radius: 4px; font-size: var(--font-base); font-family: inherit; }
.field-input:focus { border-color: var(--color-link); outline: none; }
```

**Auto-save rules:**
- Text fields: `@blur="save()"`
- Selects / checkboxes: `@change="save()"`
- Never add a Save button for inline-edit fields
- Never save on every keystroke (`@input`) — only on blur/change

---

## List views

Standard list view structure:
1. `<div class="header">` — title + Add button
2. Count label: `<p class="count-label">{{ $t('persons.showingOf', { shown: items.length, total }) }}</p>`
3. Empty state: `<div class="empty">{{ $t('entity.emptyState') }}</div>`
4. Data table: `<table class="data-table">`
5. Scroll sentinel: `<div ref="sentinel" class="scroll-sentinel"></div>` — triggers infinite scroll

```html
<p v-if="total > 0" class="count-label">
  {{ $t('persons.showingOf', { shown: items.length, total }) }}
</p>
<div v-if="items.length === 0 && !loading" class="empty">
  {{ $t('entity.emptyState') }}
</div>
<table v-else class="data-table">
  <thead>
    <tr>
      <th>{{ $t('field.name') }}</th>
      <th>{{ $t('common.actions') }}</th>
    </tr>
  </thead>
  <tbody>
    <tr
      v-for="item in items"
      :key="item.id"
      class="clickable-row"
      @click="router.push('/entity/' + item.id)"
    >
      <td>{{ item.name }}</td>
      <td>
        <button class="btn-sm btn-delete" @click.stop="deleteItem(item.id)">
          {{ $t('common.delete') }}
        </button>
      </td>
    </tr>
  </tbody>
</table>
<div ref="sentinel" class="scroll-sentinel"></div>
```

```css
.count-label { font-size: var(--font-sm); color: var(--color-text-subtle); margin: 0 0 8px; }
.scroll-sentinel { height: 1px; }
```

Rules:
- **Never use a "Load More" button** — use infinite scroll (IntersectionObserver on the sentinel)
- `@click.stop` on delete to prevent row navigation
- Actions column is always last
- Delete requires `confirm()` before calling API

---

## Modal dialogs

All create/edit forms open in a modal, never on a new page. **Always use `<BaseModal>`** — it owns the overlay, click-to-close, and Escape key. Never write the `div.modal-overlay > div.modal` shell directly.

```html
<BaseModal v-if="showAddForm" @close="showAddForm = false">
  <h3>{{ $t('entity.add') }}</h3>
  <form @submit.prevent="handleSubmit">
    <label>
      {{ $t('field.name') }} *
      <input v-model="form.name" type="text" required autofocus />
    </label>
    <div class="modal-actions">
      <button type="button" class="btn-cancel" @click="showAddForm = false">
        {{ $t('common.cancel') }}
      </button>
      <button type="submit">{{ $t('common.save') }}</button>
    </div>
  </form>
</BaseModal>
```

```typescript
import BaseModal from '../components/BaseModal.vue';
```

Rules:
- `autofocus` on first field
- Escape and overlay-click are handled by `BaseModal` — no local keyboard handler needed
- Required fields marked with ` *` in label text

---

## Buttons

| Class | Usage | Color |
|---|---|---|
| (default `<button>`) | Primary action | `var(--color-primary)` |
| `btn-cancel` | Cancel in modals | Gray/transparent |
| `btn-delete` | Destructive action | `var(--color-danger-bg)` / `var(--color-danger-text)` |
| `btn-sm` | Small inline button (table rows) | Smaller padding |
| `btn-add` | Add in section headers | Muted, small |

**Button label conventions:**

- Use `+ Word` format for buttons that create or add something (e.g., `+ Händelse`, `+ Namn`, `+ Partner`). The `+` is the signal — no other marker needed.
- For file/folder inputs, use `+ Fil` or `+ Mapp` — never `…` or `Browse` to indicate a dialog opens.
- Do **not** use `…` (ellipsis) after button labels to indicate a dialog will open.
- Do **not** use different button colors to communicate different purposes. Color encodes only: blue = primary, red = destructive, gray = cancel. Purpose is communicated through label text and `+` prefix alone.

---

## Keyboard handling

`BaseModal` handles Escape-to-close and overlay click-to-close — views with modals no longer need a global keydown listener. Only add a view-level keydown listener for non-modal keyboard shortcuts (e.g. focus jump, custom hotkeys).

---

## Shared components — when to use them

| Component | Use when |
|---|---|
| `PersonName` | Rendering any person's name (handles preferred name underline + nickname in quotes) |
| `PersonPicker` | Any input where user selects an existing person |
| `PlacePicker` | Any input where user selects or creates a place |
| `GroupPicker` | Adding a person to a group |
| `DateInput` | Any genealogy date field (supports date types: exact, about, before, after, between) |
| `EventList` | Embedding events on a person or relationship detail view |
| `EventForm` | Creating or editing a life event |
| `CitationForm` | Adding a citation to any entity |
| `CitationBadge` | Showing a count of citations inline in a table cell |

---

## i18n

Every user-visible string goes through `$t()` / `t()`. No hardcoded Swedish or English in templates.

Key structure mirrors the entity/section hierarchy:
```
persons.title, persons.addPerson, persons.givenName, ...
groups.title, groups.addGroup, groups.name, groups.members, ...
common.save, common.cancel, common.delete, common.back, common.unknown, ...
nav.tree, nav.persons, nav.groups, nav.focusPerson, ...
```

Add keys to **both** `src/renderer/i18n/sv.ts` (primary) and `src/renderer/i18n/en.ts` in the same PR.

---

## window.api typing

`window.api` is typed globally via `src/renderer/api.d.ts` — an ambient declaration that augments the `Window` interface with all IPC methods and their exact types. **Never add a local `declare const window` block in a component.** Just use `window.api.*` directly.

When adding new IPC channels, update `api.d.ts` to add the typed method signatures under the correct namespace.

## Error handling

Every `await window.api.*` call that mutates or reads data must have a try/catch that shows a toast. Never silently swallow errors with `console.error` alone.

```typescript
import { useToast } from '../composables/useToast';
import { useI18n } from 'vue-i18n';

const toast = useToast();
const { t } = useI18n();

async function save() {
  try {
    await window.api.things.create(form);
    emit('saved');
  } catch (err) {
    console.error('[ComponentName] save failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}
```

Use `errors.saveFailed` for mutations, `errors.deleteFailed` for deletes, `errors.loadFailed` for read failures. These keys exist in both `en.ts` and `sv.ts`.

---

## Data loading pattern

List views use paginated loading with infinite scroll — never load all rows at once.

```typescript
import { ref, watch, onMounted, onActivated, onUnmounted } from 'vue';

const PAGE_SIZE = 100;
const items = ref<ItemRow[]>([]);
const total = ref(0);
const offset = ref(0);
const loading = ref(false);
const sentinel = ref<HTMLElement | null>(null);

let observer: IntersectionObserver | null = null;

watch(sentinel, (el) => {
  if (observer) { observer.disconnect(); observer = null; }
  if (!el) return;
  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && items.value.length < total.value && !loading.value) {
        loadMore();
      }
    },
    // Trigger ~50 rows (~40px each) before the sentinel enters the viewport
    { rootMargin: '2000px 0px' }
  );
  observer.observe(el);
});

async function load() {
  loading.value = true;
  try {
    const result = await window.api.entity.listPage(PAGE_SIZE, 0) as { items: ItemRow[]; total: number };
    items.value = result.items;
    total.value = result.total;
    offset.value = PAGE_SIZE;
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  if (loading.value) return;
  loading.value = true;
  try {
    const result = await window.api.entity.listPage(PAGE_SIZE, offset.value) as { items: ItemRow[]; total: number };
    items.value = [...items.value, ...result.items];
    total.value = result.total;
    offset.value += PAGE_SIZE;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
onUnmounted(() => { if (observer) observer.disconnect(); });
```

The backend `listPage` query must JOIN related tables to return all display data in one query — never fetch related data row-by-row in the view (N+1 anti-pattern).

---

## UX reviewer

After implementing a new view, invoke the `ux-reviewer` agent (`.claude/agents/ux-reviewer.md`) with a specific task prompt to validate it against the established patterns. Fix any `ISSUES_FOUND` before committing.
