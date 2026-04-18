---
name: frontend-design
description: Frontend design patterns for Släktforskning — Vue 3 components, layout, colors, modals, i18n, error handling. Use when building any new view, component, or UI change in the renderer.
---

# Frontend Design Skill — Släktforskning

Use this skill when building any new view, component, or UI change in the renderer. It documents the established patterns that all views must follow for consistency.

**Before committing any UI change:** verify it works in the running app via the UI server (`curl -s http://127.0.0.1:19241/status`) or Chrome DevTools MCP. See the `/test` and `/electron-dev` skills for the full verification workflow. Never commit UI changes based solely on unit tests passing.

---

## Three-Sheet Layout

The app uses a **three-sheet layout**: nav (sidebar), main content (left sheet), and optional side panel (right sheet). All three sit on the `--surface-bg` background as separate elevated sheets at the same visual level.

### App shell (`App.vue`)

```css
.app {
  display: flex;
  height: 100vh;
  background: var(--surface-bg);   /* page background visible between sheets */
  padding: var(--space-md);
  gap: var(--space-md);
}
.sidebar { /* dark themed sheet */ border-radius: var(--radius-lg); }
.content { /* white sheet */ background: var(--surface); border-radius: var(--radius-lg); padding: 24px; }
```

### Paneled views

Views with a side panel (People/Tree, Places/Map, Media) use `content-paneled` class on the `.content` wrapper, which removes its background/padding/radius so the view can render its own sheets:

```css
.content-paneled { padding: 0; background: transparent; border-radius: 0; overflow: hidden; }
```

The view then renders two sheets side by side:

```html
<div class="my-view">
  <!-- Left sheet -->
  <div class="left-sheet">
    <div class="header">...</div>
    <!-- content -->
  </div>
  <!-- Right sheet (panel) -->
  <div class="panel-wrapper">
    <MyPanel ... />
  </div>
</div>
```

Left sheet styling:
```css
.left-sheet {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}
```

Panel wrapper has no background — the panel component itself (PersonPanel, PlacePanel, MediaPanel) owns its sheet look:
```css
.my-panel {
  background: var(--surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}
```

### Content feathering

Content inside sheets must not touch the sheet edges. Add padding:
- **Headers**: `padding: var(--space-lg) var(--space-lg) 0`
- **Tab bars**: `padding: var(--space-xs) var(--space-lg)`
- **Chart/map areas**: `padding: var(--space-sm) var(--space-lg) var(--space-lg)`
- **Panel headers**: `padding: var(--space-lg)`
- **Panel sections**: `padding: 0 var(--space-lg)`

For maps specifically, the map container gets its own border-radius and border within the padded area:
```css
.map-content { padding: var(--space-sm) var(--space-lg) var(--space-lg); }
.base-map-container { border: 1px solid var(--surface-border-subtle); border-radius: var(--radius-md); }
```

### When to use paneled layout

Add the route to `PANELED_ROUTES` or `PANELED_ROUTES_EXACT` in `App.vue`:
- `PANELED_ROUTES` — prefix match (e.g. `/visualisering` matches `/visualisering/123`)
- `PANELED_ROUTES_EXACT` — exact match only (e.g. `/places` but not `/places/123`)

---

## Research View Pattern (Tree/List/Map/Gallery toggles)

The three main research views follow a consistent pattern:

| View | Nav label | Toggle options | Default |
|------|-----------|---------------|---------|
| People | People | Tree / List | Tree |
| Places | Places | List / Map | Map |
| Media | Media | Gallery / Table | Gallery |

### Header layout

All three share the same header structure:

```html
<div class="header">
  <h2>{{ $t('nav.viewName') }}</h2>
  <div class="header-right">
    <div class="view-toggle">
      <AppButton :variant="mode === 'a' ? 'soft' : 'ghost'" size="sm" @click="setMode('a')">A</AppButton>
      <AppButton :variant="mode === 'b' ? 'soft' : 'ghost'" size="sm" @click="setMode('b')">B</AppButton>
    </div>
    <AppButton variant="soft" @click="showAdd = true">+ {{ $t('entity.add') }}</AppButton>
  </div>
</div>
```

```css
.header-right { display: flex; align-items: center; gap: 8px; }
.view-toggle { display: flex; gap: 2px; }
```

### Toggle button styling

- **Active**: `variant="soft"` (filled, muted accent)
- **Inactive**: `variant="ghost"` (transparent, text only)
- Never use `primary`/`secondary` for view toggles

### View mode persistence

Store in localStorage with a descriptive key:
```typescript
const viewMode = ref<ViewMode>(
  (localStorage.getItem('persons-view-mode') as ViewMode) || 'tree'
);
function setViewMode(mode: ViewMode) {
  viewMode.value = mode;
  localStorage.setItem('persons-view-mode', mode);
}
```

### Embedding one view inside another

When a view has two modes (Tree/List, Map/List), the secondary mode can embed an existing view component with an `embedded` prop that hides its header:

```html
<!-- In the host view -->
<GuestView v-if="viewMode === 'list'" embedded />

<!-- In the guest view -->
<div v-if="!embedded" class="header">...</div>
```

The host view's header provides the toggle buttons for both modes.

---

## Colors and Typography

**Never use hardcoded hex values.** Use design tokens from `src/renderer/styles/tokens.css`. Three themes (Forest, Nordic, Twilight) define all token values. Dark and high-contrast modes override tokens in `shared.css`.

Key token categories:
```css
/* Surface */     --surface-bg, --surface, --surface-hover, --surface-border, --surface-border-subtle
/* Text */        --text-primary, --text-secondary, --text-muted
/* Accent */      --accent, --accent-hover, --accent-text
/* Semantic */    --error-bg/text, --warning-bg/text, --success-bg/text, --info-bg/text
/* Spacing */     --space-xs(4) --space-sm(8) --space-md(12) --space-lg(16) --space-xl(24)
/* Typography */  --font-xs(11) --font-sm(13) --font-base(14) --font-md(15) --font-lg(16)
/* Shape */       --radius-sm(4) --radius-md(6) --radius-lg(10)
/* Shadows */     --shadow-sm, --shadow-md, --shadow-lg
```

### Shared CSS classes

Defined in `src/renderer/styles/shared.css`. **Never redefine these in `<style scoped>`** — scoped styles override the CSS variables that power the text-size accessibility feature.

Shared classes include: `.header`, `.data-table`, `.clickable-row`, `.btn-add`, `.btn-sm`, `.btn-delete`, `.btn-cancel`, `.modal-overlay`, `.modal`, `.modal-actions`, `.person-link`, `.sex-badge`, `.tab-bar`, `.tab-btn`, `.filter-chips`, `.chip`, `.count-label`, `.empty`, `.scroll-sentinel`.

---

## Buttons

**Label conventions:**
- Use `+ Noun` format for buttons that create or add something: `+ Person`, `+ Event`, `+ Place`
- Never `+ Add Noun` (the `+` already means add)
- Never use `…` (ellipsis) on any button label
- Keep labels short — `+ Task` not `+ Research Task`
- Submit buttons use action verbs: `$t('common.create')` for new, `$t('common.save')` for updates

**Button variants (AppButton):**
| Variant | Usage |
|---------|-------|
| `primary` | Primary submit action in modals |
| `soft` | Header action buttons (`+ Person`), active toggle |
| `ghost` | Inactive toggle, back button, secondary actions |
| `secondary` | Cancel buttons in modals |
| `danger` | Destructive actions |

---

## Section Headers (Side Panels)

Every collapsible section in a side panel uses `<SectionHeader>`:

```html
<SectionHeader
  :title="$t('section.title')"
  :count="itemCount"
  :collapsed="!sections.sectionKey"
  :action-label="'+ ' + $t('section.addLabel')"
  @toggle="toggleSection('sectionKey')"
  @action="handleAdd()"
/>
```

Rules:
- **Always include `:count`** when the section has countable items — visible even when collapsed
- **Include `:action-label`** for sections where adding makes sense (Events, Citations, Media, Names, etc.)
- **Omit `:action-label`** for derived/read-only sections (People at a place, Timeline, Quality)
- Action labels use the `+ Noun` pattern

---

## Side Panel Design

Side panels (PersonPanel, PlacePanel, MediaPanel) are self-contained sheet components:

```css
.panel {
  background: var(--surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow-y: auto;
}
.panel-header {
  padding: var(--space-lg);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  border-bottom: 1px solid var(--surface-border-subtle);
}
.panel-section {
  padding: 0 var(--space-lg);
  border-bottom: 1px solid var(--surface-border-subtle);
}
```

Section order matters — put the most-used sections first:
- **PersonPanel**: Person > Names > Events > Timeline > Identifiers > Relationships > Groups > Media > Media Timeline > Research Tasks > Quality
- **PlacePanel**: Place Details > People > Events > Citations > Media > Media Timeline > Address > Hierarchy

### Auto-select on load

Paneled views should auto-select an item so the panel is never empty:
- **Media**: select focus person's first media, fallback to first item
- **Places/Map**: select focus person's first place, fallback to first place
- **People/Tree**: panel shows the selected/focal person

---

## Modal Dialogs

All create/edit forms open in a modal. **Always use `<BaseModal>`**. Click-outside does NOT close modals.

```html
<BaseModal v-if="showForm" @close="showForm = false" title-id="modal-title">
  <h3 id="modal-title">+ {{ $t('entity.noun') }}</h3>
  <form @submit.prevent="handleSubmit">
    <!-- fields -->
    <div class="modal-actions">
      <AppButton variant="secondary" @click="showForm = false">{{ $t('common.cancel') }}</AppButton>
      <AppButton variant="primary" type="submit">{{ $t('common.create') }}</AppButton>
    </div>
  </form>
</BaseModal>
```

### Reusable modals

Extract modals into components when used in multiple views:
- `AddPersonModal` — shared between PersonsView (list mode) and VisualizationView (tree mode)
- `AddRelatedPersonModal` — used by PersonDetailView and PersonPanel
- `EventForm`, `CitationForm`, `PersonNameFormModal` — used across detail views and panels

---

## i18n

Every user-visible string goes through `$t()` / `t()`. Add keys to **both** `sv.ts` and `en.ts`.

Key naming for add buttons: use short nouns, not verb phrases:
```typescript
addPerson: 'Person',        // renders as "+ Person"
addSource: 'Source',         // renders as "+ Source"
addTask: 'Task',             // renders as "+ Task"
// NOT: addPerson: 'Add Person'  // would render as "+ Add Person"
```

---

## Error Handling

Every `await window.api.*` call that mutates data must have try/catch with toast:

```typescript
const toast = useToast();
try {
  await window.api.things.create(form);
  emit('saved');
} catch (err) {
  console.error('[ComponentName] save failed:', err);
  toast.error(t('errors.saveFailed'));
}
```

---

## Design Principles

- **Sheets, not borders** — visual separation comes from elevation (shadow + background contrast), not borders between areas
- **No lines between siblings** — remove `border-bottom` between adjacent areas within a sheet (e.g. between toolbar and content). Lines only between collapsible sections
- **Content feathering** — content never touches sheet edges; padding creates breathing room
- **Consistent toggle placement** — view mode toggles always in the header row, right-aligned before the action button
- **External links open in system browser** — use `shell.openExternal()`
- **Enrich at render time** — never store computed/inferred data in the database
