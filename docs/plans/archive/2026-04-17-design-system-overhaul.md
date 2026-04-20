# Design System Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform every view in the app to use a consistent design system with three color themes, shared primitive components, and a restructured sidebar.

**Architecture:** Phase 1 creates design tokens (CSS custom properties) for three themes. Phase 2 builds 11 shared Vue components. Phase 3 applies them to all 28 screens. Phase 4 restructures the sidebar. Each phase is independently committable and testable.

**Tech Stack:** Vue 3 Composition API, CSS custom properties, localStorage for theme persistence.

**Spec:** docs/plans/2026-04-17-design-system-spec.md

---

## File Map

### New Files
| File | Purpose |
|------|---------|
| `src/renderer/styles/tokens.css` | All design tokens: colors (3 themes), spacing, typography, shapes |
| `src/renderer/components/ui/AppButton.vue` | Button with variant/size props |
| `src/renderer/components/ui/AppBadge.vue` | Badge with semantic variants |
| `src/renderer/components/ui/AppAvatar.vue` | Initials circle with sex-based colors |
| `src/renderer/components/ui/AppInput.vue` | Styled input/select/textarea with error state |
| `src/renderer/components/ui/AppEmptyState.vue` | Empty state with icon, text, action button |
| `src/renderer/components/ui/AppLoadingState.vue` | Skeleton/spinner loading indicator |
| `src/renderer/components/ui/FilterChips.vue` | Filter chip bar with active accent color |
| `src/renderer/components/ui/SectionHeader.vue` | Collapsible section header with count + action |
| `src/renderer/components/MediaPanel.vue` | Media linking workbench panel |
| `src/renderer/views/SettingsView.vue` | Settings page absorbing 4 config views |

### Modified Files
| File | Changes |
|------|---------|
| `src/renderer/styles/shared.css` | Replace hardcoded colors with token references |
| `src/renderer/main.ts` | Import tokens.css before shared.css |
| `src/renderer/App.vue` | Sidebar restructure + theme class application |
| `src/renderer/router.ts` | Add /settings route, redirect /map to /places |
| `src/renderer/i18n/en.ts` | New nav labels, theme names, empty state text |
| `src/renderer/i18n/sv.ts` | Same i18n additions in Swedish |
| All 21 view files | Adopt primitives, tokens, consistent patterns |
| `src/renderer/components/PersonPanel.vue` | Refactor to use primitives |
| `src/renderer/components/PlacePanel.vue` | Refactor to use primitives |
| `src/renderer/components/BaseModal.vue` | Token-based styling |

---

## Phase 1: Design Tokens

### Task 1: Create tokens.css with three themes

**Files:**
- Create: `src/renderer/styles/tokens.css`
- Modify: `src/renderer/main.ts`

- [ ] **Step 1: Create the token file with Forest theme as default**

Create `src/renderer/styles/tokens.css` with all CSS custom properties. The Forest theme values go on `:root`. Nordic and Twilight themes override via `.theme-nordic` and `.theme-twilight` classes.

Token categories:
- **Sidebar colors** (6 tokens): bg, text, text-muted, active-bg, active-text, border
- **Surface colors** (5 tokens): bg, surface, surface-hover, border, border-subtle
- **Text colors** (3 tokens): primary, secondary, muted
- **Accent colors** (3 tokens): accent, accent-hover, accent-text
- **Semantic colors** (12 tokens): sex-f/m/u bg+text, error/warning/success bg+text
- **Spacing** (6 tokens): xs through 2xl
- **Typography** (9 tokens): font sizes xs-xl + weights normal/medium/bold
- **Shape** (7 tokens): radius sm/md/lg/full + shadow sm/md/lg

Forest default values:
- Sidebar: `#1a2e1a` bg, `#8fb88f` text, `#2e4a2e` active-bg
- Surface: `#eae5dc` bg, `#faf8f5` surface
- Accent: `#2d5a27` accent
- Text: `#1a2e1a` primary, `#6a8a6a` secondary

Nordic overrides (`.theme-nordic`):
- Sidebar: `#0f1a2e`, text `#7a9abe`, active-bg `#1a3050`
- Surface: `#f0f2f6` bg, `#fafbfd` surface
- Accent: `#1d4ed8`

Twilight overrides (`.theme-twilight`):
- Sidebar: `#1e1b2e`, text `#9a8cc0`, active-bg `#2e2848`
- Surface: `#f4f2f8` bg, `#faf8fd` surface
- Accent: `#6c5ce7`

Semantic colors (same across all themes):
- Sex F: `#f5e8ee` bg / `#8a5068` text
- Sex M: `#e0eaf2` bg / `#3a5a7a` text
- Sex U: `#e8e8e8` bg / `#666666` text
- Error: `#fee2e2` bg / `#b91c1c` text
- Warning: `#fef3c7` bg / `#92400e` text
- Success: `#dcfce7` bg / `#15803d` text

- [ ] **Step 2: Import tokens.css in main.ts before shared.css**

In `src/renderer/main.ts`, add `import './styles/tokens.css'` before the existing `import './styles/shared.css'` line.

- [ ] **Step 3: Add theme initialization to App.vue**

In `src/renderer/App.vue` `onMounted`, read `localStorage.getItem('slaktforskning-theme')` and apply the class (`theme-forest`, `theme-nordic`, or `theme-twilight`) to `document.documentElement`. Default to `theme-forest` if not set.

Add a `setTheme(theme: string)` function alongside the existing `setAppearance` function. It should:
1. Remove all theme classes from `document.documentElement`
2. Add the new theme class
3. Save to localStorage

- [ ] **Step 4: Verify tokens load without breaking existing styles**

Run: `npm test`
Run: `npm start` — verify app looks identical (tokens defined but not yet consumed)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add design tokens with three color themes (Forest/Nordic/Twilight)"
```

### Task 2: Migrate shared.css to use tokens

**Files:**
- Modify: `src/renderer/styles/shared.css`

- [ ] **Step 1: Replace existing :root color variables with token references**

In `shared.css`, the existing `:root` block (lines 7-61) defines variables like `--color-primary`, `--color-bg`, etc. Map these to the new token names:

| Old variable | New token |
|-------------|-----------|
| `--color-primary` | `var(--color-accent)` |
| `--color-primary-hover` | `var(--color-accent-hover)` |
| `--color-bg` | `var(--color-surface)` |
| `--color-bg-subtle` | `var(--color-bg)` |
| `--color-bg-muted` | `var(--color-bg)` |
| `--color-text` | `var(--color-text-primary)` |
| `--color-text-muted` | `var(--color-text-secondary)` |
| `--color-text-subtle` | `var(--color-text-muted)` |
| `--color-border` | `var(--color-border)` |
| `--color-row-hover` | `var(--color-surface-hover)` |
| `--color-sex-m-bg/text` | `var(--color-sex-m-bg/text)` (already matches) |
| `--color-danger-bg/text` | `var(--color-error-bg/text)` |
| `--color-link` | `var(--color-accent)` |

Keep the old variable names as aliases pointing to tokens, so existing views don't break:
```css
:root {
  --color-primary: var(--color-accent);
  --color-bg: var(--color-surface);
  /* ... etc */
}
```

This way every existing `var(--color-primary)` reference still works but now derives from the theme.

- [ ] **Step 2: Update dark mode overrides to use token structure**

The `html.dark` block (lines 520-677) overrides color variables. Update it to override the NEW token names instead. The old aliases will cascade automatically.

- [ ] **Step 3: Update high-contrast mode similarly**

The `html.high-contrast` block (lines 680-786) — same approach.

- [ ] **Step 4: Verify all three modes still work**

Run: `npm start`
- Toggle Light/Dark/Contrast in settings — verify no visual regressions
- Check PersonsView, QualityView, VisualizationView in each mode

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: migrate shared.css to use design tokens"
```

---

## Phase 2: Primitive Components

### Task 3: AppButton

**Files:**
- Create: `src/renderer/components/ui/AppButton.vue`

- [ ] **Step 1: Create AppButton component**

Props:
- `variant`: `'primary' | 'secondary' | 'danger' | 'ghost'` (default: `'secondary'`)
- `size`: `'sm' | 'md'` (default: `'md'`)
- `loading`: `boolean` (default: false — shows spinner, disables click)
- `disabled`: `boolean`

Template: `<button>` with `:class` binding for variant and size. Slot for content. When loading, prepend a CSS spinner and set `disabled`.

Styles (scoped, using tokens only):
- `primary`: `background: var(--color-accent); color: var(--color-accent-text)`
- `secondary`: `background: none; border: 1px solid var(--color-border); color: var(--color-text-secondary)`
- `danger`: `background: var(--color-error-bg); color: var(--color-error-text)`
- `ghost`: `background: none; border: none; color: var(--color-text-muted)`
- `sm`: `padding: var(--space-xs) var(--space-sm); font-size: var(--font-sm)`
- `md`: `padding: var(--space-sm) var(--space-lg); font-size: var(--font-md)`
- Border-radius: `var(--radius-md)`

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: add AppButton primitive component"
```

### Task 4: AppBadge

**Files:**
- Create: `src/renderer/components/ui/AppBadge.vue`

- [ ] **Step 1: Create AppBadge component**

Props:
- `variant`: `'sex-f' | 'sex-m' | 'sex-u' | 'severity-high' | 'severity-medium' | 'severity-low' | 'status' | 'count' | 'event'`

Template: `<span>` with computed class. Slot for content.

Styles: Each variant maps to semantic token pairs:
- `sex-f`: `var(--color-sex-f-bg)` / `var(--color-sex-f-text)`
- `sex-m`: `var(--color-sex-m-bg)` / `var(--color-sex-m-text)`
- `severity-high`: `var(--color-error-bg)` / `var(--color-error-text)`
- `severity-medium`: `var(--color-warning-bg)` / `var(--color-warning-text)`
- `count`: `var(--color-accent)` bg with `var(--color-accent-text)` text
- All: `padding: 1px 6px; border-radius: var(--radius-sm); font-size: var(--font-xs); font-weight: var(--font-weight-medium)`

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: add AppBadge primitive component"
```

### Task 5: AppAvatar

**Files:**
- Create: `src/renderer/components/ui/AppAvatar.vue`

- [ ] **Step 1: Create AppAvatar component**

Props:
- `givenName`: `string` (default: `''`)
- `surname`: `string` (default: `''`)
- `sex`: `'M' | 'F' | 'U'` (default: `'U'`)
- `size`: `'sm' | 'md' | 'lg' | 'xl'` (default: `'md'`)
- `src`: `string | null` (profile image URL — falls back to initials when null)

Computed:
- `initials`: first char of givenName + first char of surname (uppercase). If only one name, use first two chars.
- `bgColor`: F → `var(--color-sex-f-bg)`, M → `var(--color-sex-m-bg)`, U → `var(--color-sex-u-bg)`
- `textColor`: F → `var(--color-sex-f-text)`, M → `var(--color-sex-m-text)`, U → `var(--color-sex-u-text)`

Template: If `src` is provided, render `<img>` with `border-radius: var(--radius-full)`. Otherwise render `<div>` with initials text.

Sizes: sm=20px, md=28px, lg=36px, xl=56px (width, height, and font-size scaled proportionally).

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: add AppAvatar primitive component"
```

### Task 6: AppInput

**Files:**
- Create: `src/renderer/components/ui/AppInput.vue`

- [ ] **Step 1: Create AppInput component**

Props:
- `modelValue`: `string`
- `label`: `string` (optional — renders above input)
- `type`: `'text' | 'select' | 'textarea'` (default: `'text'`)
- `error`: `string` (optional — shows inline error message below)
- `placeholder`: `string`
- `options`: `Array<{ value: string; label: string }>` (for select type)

Emits: `update:modelValue`

Template:
- Optional `<label>` above (font-size: var(--font-sm), color: var(--color-text-secondary))
- `<input>`, `<select>`, or `<textarea>` based on `type` prop
- Optional error message `<div>` below (color: var(--color-error-text), font-size: var(--font-xs))

Styles:
- Border: `1px solid var(--color-border)`, radius `var(--radius-md)`
- Focus: `outline: 2px solid var(--color-accent); outline-offset: 1px`
- Error state: border becomes `var(--color-error-text)`
- Padding: `var(--space-sm) var(--space-md)`

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: add AppInput primitive component"
```

### Task 7: AppEmptyState and AppLoadingState

**Files:**
- Create: `src/renderer/components/ui/AppEmptyState.vue`
- Create: `src/renderer/components/ui/AppLoadingState.vue`

- [ ] **Step 1: Create AppEmptyState**

Props:
- `icon`: `string` (emoji or text, default: `'📭'`)
- `title`: `string` (required — e.g. "No persons yet.")
- `description`: `string` (optional — guidance text)
- `actionLabel`: `string` (optional — button text)

Emits: `action` (when button clicked)

Template: Centered flex column with icon (font-size: 48px), title (font-weight: bold, color: var(--color-text-primary)), description (color: var(--color-text-muted)), and optional AppButton primary.

- [ ] **Step 2: Create AppLoadingState**

Props:
- `rows`: `number` (default: 3 — number of skeleton rows to show)

Template: Repeats `rows` number of animated skeleton rectangles. Each is a `<div>` with:
- Background: `var(--color-border-subtle)`
- Height: 20px, border-radius: var(--radius-sm)
- CSS animation: shimmer (opacity 0.5 → 1 → 0.5, 1.5s infinite)
- Varying widths (100%, 80%, 60%) for visual interest

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add AppEmptyState and AppLoadingState primitives"
```

### Task 8: FilterChips and SectionHeader

**Files:**
- Create: `src/renderer/components/ui/FilterChips.vue`
- Create: `src/renderer/components/ui/SectionHeader.vue`

- [ ] **Step 1: Create FilterChips**

Props:
- `options`: `Array<{ value: string; label: string; count?: number }>`
- `modelValue`: `string` (currently active value)

Emits: `update:modelValue`

Template: Flex row of buttons. Active chip: `background: var(--color-accent); color: var(--color-accent-text)`. Inactive: `background: var(--color-bg); border: 1px solid var(--color-border); color: var(--color-text-secondary)`. Optional count shown as small number after label.

- [ ] **Step 2: Create SectionHeader**

Props:
- `title`: `string`
- `count`: `number` (optional — shown in parentheses)
- `collapsed`: `boolean` (default: false)
- `actionLabel`: `string` (optional — e.g. "+ Add")

Emits: `toggle`, `action`

Template: Flex row with chevron (▼/►), title, count, spacer, and optional action button (AppButton ghost size sm). Click on title/chevron emits `toggle`.

Styles: font-weight: var(--font-weight-bold), font-size: var(--font-base), color: var(--color-text-primary). Count in var(--color-text-muted).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add FilterChips and SectionHeader primitives"
```

### Task 9: Refactor BaseModal to use tokens

**Files:**
- Modify: `src/renderer/components/BaseModal.vue`

- [ ] **Step 1: Update BaseModal styles to use tokens**

Replace hardcoded colors in shared.css `.modal` and `.modal-overlay` rules:
- `.modal`: background → `var(--color-surface)`, color → `var(--color-text-primary)`, border-radius → `var(--radius-lg)`, box-shadow → `var(--shadow-lg)`
- `.modal-overlay`: background → `rgba(0,0,0,0.5)`
- `.modal h3`: color → `var(--color-text-primary)`, font-weight → `var(--font-weight-bold)`
- `.modal-actions`: border-top → `1px solid var(--color-border-subtle)`
- Form labels: color → `var(--color-text-secondary)`, font-size → `var(--font-sm)`
- Form inputs: border-color → `var(--color-border)`, focus outline → `var(--color-accent)`

- [ ] **Step 2: Verify modals still work**

Run: `npm start`
Open Add Person modal, Add Source modal, Confirm Delete modal — verify styling matches tokens.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: BaseModal uses design tokens"
```

---

## Phase 3a: List Views

### Task 10: PersonsView (reference implementation)

**Files:**
- Modify: `src/renderer/views/PersonsView.vue`

- [ ] **Step 1: Import and use primitives**

Replace in template:
- `.btn-add` button → `<AppButton variant="primary">{{ ('common.addPerson') }}</AppButton>`
- `.chip` buttons → `<FilterChips :options="filterOptions" v-model="activeFilter" />`
- Sex badge `<span class="sex-badge">` → `<AppBadge :variant="'sex-' + person.sex.toLowerCase()">`
- Add `<AppAvatar :given-name="person.given_name" :surname="person.surname" :sex="person.sex" />` before each name
- Condense birth date, birth place, death date, death place columns into one "Info" column showing `"b. 1938 · Stockholm"` style text
- Loading state: replace `('common.loading')` with `<AppLoadingState />`
- Empty state: replace `('persons.empty')` div with `<AppEmptyState icon="🌳" :title="('persons.empty')" :description="('persons.emptyHint')" :action-label="('common.addPerson')" @action="showForm = true" />`

- [ ] **Step 2: Update scoped styles**

Remove all hardcoded colors from `<style scoped>`. Replace with token references. Remove any classes that duplicate shared.css (the primitives handle their own styling).

- [ ] **Step 3: Add i18n keys for empty state guidance**

In `src/renderer/i18n/en.ts`, add:
```
persons: { emptyHint: 'Add your first person to start building your family tree.' }
```
In `src/renderer/i18n/sv.ts`:
```
persons: { emptyHint: 'Lagg till din forsta person for att borja bygga ditt slaktrad.' }
```

- [ ] **Step 4: Verify PersonsView looks correct**

Run: `npm start`
Check: avatars show, filter chips work, empty state shows with guidance, sex badges use new component, table rows are tight and height-efficient.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: PersonsView uses design system primitives"
```

### Task 11: Remaining list views (8 views)

**Files:**
- Modify: `src/renderer/views/SourcesView.vue`
- Modify: `src/renderer/views/RelationshipsView.vue`
- Modify: `src/renderer/views/PlacesView.vue`
- Modify: `src/renderer/views/GroupsView.vue`
- Modify: `src/renderer/views/MediaView.vue`
- Modify: `src/renderer/views/ResearchTasksView.vue`
- Modify: `src/renderer/views/QualityView.vue`
- Modify: `src/renderer/views/SearchView.vue`

Apply the same pattern as PersonsView to each list view. For each view:

- [ ] **Step 1: SourcesView** — Replace buttons with AppButton, add AppBadge for source type, add AppEmptyState, replace hardcoded colors with tokens.

- [ ] **Step 2: RelationshipsView** — Replace buttons, add AppAvatar for both person1 and person2, replace filter chips with FilterChips component, add AppEmptyState.

- [ ] **Step 3: PlacesView** — Replace buttons, replace filter chips with FilterChips, add AppEmptyState. Add list/map view toggle (similar to MediaView gallery/table). The map toggle renders the existing MapView content inline.

- [ ] **Step 4: GroupsView** — Replace buttons, add AppBadge for member count, add AppEmptyState.

- [ ] **Step 5: MediaView** — Replace buttons, replace hardcoded colors with tokens. Gallery thumbnails and table mode already exist — just restyle with tokens.

- [ ] **Step 6: ResearchTasksView** — Replace filter chips with FilterChips, replace status badges with AppBadge, add AppEmptyState.

- [ ] **Step 7: QualityView** — Replace filter chips with FilterChips, replace severity badges with AppBadge, add AppAvatar for person links, add AppEmptyState.

- [ ] **Step 8: SearchView** — Add AppAvatar for person results, replace section styling with tokens, add AppEmptyState for no results.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: all list views use design system primitives"
```

---

## Phase 3b: Detail Views

### Task 12: PersonDetailView

**Files:**
- Modify: `src/renderer/views/PersonDetailView.vue`

- [ ] **Step 1: Redesign header section**

Replace the current header with:
- AppAvatar size `xl` (56px) on the left
- Full name as h2 (font-size: var(--font-xl), font-weight: var(--font-weight-bold))
- Birth summary line below ("Born 1938 in Stockholm · Living")
- AppBadge for sex and living status
- AppButton "Edit" on the right

- [ ] **Step 2: Replace section headers with SectionHeader**

For each section (Names, Events, Relationships, Media, Citations, Identifiers, Quality, Notes):
- Replace the current `<div class="section-header">` with `<SectionHeader :title="..." :count="..." :collapsed="..." :action-label="'+ Add'" @toggle="..." @action="..." />`
- Secondary sections (Media, Citations, Identifiers, Quality when count is 0) default to collapsed

- [ ] **Step 3: Replace inline buttons and badges with primitives**

- All `btn-add` → AppButton ghost sm
- All `btn-delete` → AppButton danger sm
- Sex badges → AppBadge
- Person links in relationships section → AppAvatar sm + router-link

- [ ] **Step 4: Remove hardcoded colors from scoped styles**

Replace all hex colors with token references.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: PersonDetailView uses design system"
```

### Task 13: Remaining detail views (4 views)

**Files:**
- Modify: `src/renderer/views/SourceDetailView.vue`
- Modify: `src/renderer/views/PlaceDetailView.vue`
- Modify: `src/renderer/views/RelationshipDetailView.vue`
- Modify: `src/renderer/views/GroupDetailView.vue`

Apply the same header + SectionHeader pattern:

- [ ] **Step 1: SourceDetailView** — Source type AppBadge in header. Editable fields use AppInput. Citations section uses SectionHeader.

- [ ] **Step 2: PlaceDetailView** — Place name + type badge header. Info fields, events, persons sections use SectionHeader. Mini map stays as-is.

- [ ] **Step 3: RelationshipDetailView** — Two AppAvatars in header. Type/subtype as badges. Events and notes sections use SectionHeader.

- [ ] **Step 4: GroupDetailView** — Group name header. Members section uses SectionHeader with add/remove.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: all detail views use design system"
```

---

## Phase 3c: Panels

### Task 14: Refactor PersonPanel and PlacePanel

**Files:**
- Modify: `src/renderer/components/PersonPanel.vue`
- Modify: `src/renderer/components/PlacePanel.vue`

- [ ] **Step 1: PersonPanel — use primitives**

- Replace sex-bar colored div with AppAvatar lg in header
- Replace `.btn-dark` add-relative buttons with AppButton secondary sm
- Replace section headers with SectionHeader component
- Replace hardcoded colors with tokens
- Event/relationship rows use compact styling from tokens (font-size: var(--font-sm), border-left: 2px solid var(--color-border-subtle))

- [ ] **Step 2: PlacePanel — use primitives**

- Replace header styling with tokens
- Replace section headers with SectionHeader
- Person rows show AppAvatar sm
- Remove hardcoded colors

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: PersonPanel and PlacePanel use design system"
```

### Task 15: Create MediaPanel

**Files:**
- Create: `src/renderer/components/MediaPanel.vue`
- Modify: `src/renderer/views/MediaView.vue`

- [ ] **Step 1: Create MediaPanel component**

Props:
- `mediaId`: `string | null`

The component is self-loading (watches `mediaId`, loads data via `window.api.media.get()` and `window.api.media.getLinks()`).

Template structure:
- **Header**: Thumbnail image (aspect 4:3, border-radius var(--radius-md)), title, format + file size text
- **Linked Persons section** (SectionHeader): List of linked persons with AppAvatar sm + name + unlink (✕) button. "+ Link Person" action opens PersonPicker in a dropdown.
- **Linked Events section**: Event type + date + participant name. "+ Link Event" action.
- **Linked Places section**: Place name. "+ Link Place" action opens PlacePicker.
- **Face Tags section** (SectionHeader): Placeholder text "No face tags yet." (drawing UI is out of scope — just the section).
- **Source section**: Link a citation. Uses SourcePicker.

Panel uses the same layout pattern as PersonPanel/PlacePanel: fixed width, border-left accent, scrollable content.

- [ ] **Step 2: Wire MediaPanel into MediaView**

In MediaView, add a `selectedMediaId` ref. When a gallery thumbnail or table row is clicked, set `selectedMediaId`. Render `<MediaPanel :media-id="selectedMediaId" />` on the right side (same layout pattern as VisualizationView with PersonPanel).

The lightbox (`MediaLightbox`) continues to open on double-click or an "Open" button — it stays as a clean viewing experience.

- [ ] **Step 3: Add i18n keys**

In en.ts/sv.ts, add keys for MediaPanel sections:
- `media.linkedPersons`, `media.linkedEvents`, `media.linkedPlaces`
- `media.faceTags`, `media.noFaceTags`
- `media.linkPerson`, `media.linkEvent`, `media.linkPlace`
- `media.unlinkConfirm`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: MediaPanel linking workbench for media perspective"
```

---

## Phase 3d: Modals

### Task 16: Restyle all modals with primitives

**Files:**
- Modify: `src/renderer/views/PersonsView.vue` (Add Person modal)
- Modify: `src/renderer/components/AddRelatedPersonModal.vue`
- Modify: `src/renderer/components/PersonNameFormModal.vue`
- Modify: `src/renderer/components/EventForm.vue`
- Modify: `src/renderer/components/CitationForm.vue` (CitationEditModal)
- Modify: `src/renderer/components/ConfirmModal.vue`

For each modal:

- [ ] **Step 1: Replace form inputs with AppInput where practical**

For simple text/select fields, replace raw `<input>`/`<select>` with `<AppInput>`. Keep specialized inputs (DateInput, PersonPicker, PlacePicker, SourcePicker) as-is — they have their own interaction patterns.

- [ ] **Step 2: Replace buttons with AppButton**

- Cancel: `<AppButton variant="secondary" @click="close">`
- Submit: `<AppButton variant="primary" :loading="saving">` with action verb label
- Delete confirm: `<AppButton variant="danger">`

- [ ] **Step 3: Ensure consistent modal-actions layout**

All modals: `<div class="modal-actions">` with cancel on left, action on right. Gap: var(--space-sm). Border-top: 1px solid var(--color-border-subtle). Padding-top: var(--space-lg).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: all modals use design system primitives"
```

---

## Phase 3e: Settings Page

### Task 17: Create SettingsView absorbing config views

**Files:**
- Create: `src/renderer/views/SettingsView.vue`
- Modify: `src/renderer/router.ts`
- Modify: `src/renderer/App.vue`

- [ ] **Step 1: Create SettingsView with tabs**

Template structure:
- Page header: "Settings" (h2)
- Tab bar using FilterChips: Appearance, Database, Import/Export, Link Rules, Gazetteers
- Tab content area (v-if per tab):
  - **Appearance**: Move settings panel content from App.vue sidebar. Add theme switcher (3 color dots for Forest/Nordic/Twilight). Keep existing Mode, Text Size, Language, Read Aloud groups.
  - **Database**: Import DatabaseView content (current db path, recent list, tree subject picker, New/Open/Backup/Restore buttons).
  - **Import/Export**: Import ImportExportView content (all 6 tabs: GEDCOM, Genney, Holger, Archive, CSV, HTML Site). Render as nested tabs or accordion within this tab.
  - **Link Rules**: Import LinkRulesView content.
  - **Gazetteers**: Import GazetteersView content.

- [ ] **Step 2: Add /settings route**

In `src/renderer/router.ts`, add:
```typescript
{ path: '/settings', name: 'Settings', component: () => import('./views/SettingsView.vue') }
```

Add redirects for old routes:
```typescript
{ path: '/database', redirect: '/settings' }
{ path: '/import-export', redirect: '/settings' }
{ path: '/link-rules', redirect: '/settings' }
{ path: '/gazetteers', redirect: '/settings' }
```

- [ ] **Step 3: Remove settings panel from App.vue sidebar**

Remove the `.settings-section` from the sidebar template (lines 81-112). Replace with a simple `<router-link to="/settings">` nav item at the bottom.

Remove the old `.nav-bottom` links for Database and Import/Export.

- [ ] **Step 4: Add i18n keys**

Add `settings.title`, tab labels (`settings.tabs.appearance`, `settings.tabs.database`, etc.), theme names (`settings.themes.forest`, `settings.themes.nordic`, `settings.themes.twilight`).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: SettingsView absorbs Database, ImportExport, LinkRules, Gazetteers"
```

---

## Phase 3f: Visualization & Reports

### Task 18: Restyle charts and reports with tokens

**Files:**
- Modify: `src/renderer/views/VisualizationView.vue`
- Modify: `src/renderer/views/ReportsView.vue`

- [ ] **Step 1: VisualizationView**

- Replace tab bar with FilterChips pattern (Pedigree, Hourglass, Descendants, Circle, Timeline tabs)
- Replace hardcoded colors in chart box styles with token references
- PersonPanel on the right already handled in Task 14

- [ ] **Step 2: ReportsView**

- Replace tab bar with FilterChips
- Replace buttons with AppButton
- Replace hardcoded colors with tokens

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: VisualizationView and ReportsView use design system"
```

---

## Phase 4: Sidebar Restructure

### Task 19: Restructure sidebar navigation

**Files:**
- Modify: `src/renderer/App.vue`
- Modify: `src/renderer/i18n/en.ts`
- Modify: `src/renderer/i18n/sv.ts`
- Modify: `src/renderer/router.ts`

- [ ] **Step 1: Update sidebar template with workflow groups**

Replace the flat nav item list in App.vue (lines 23-69) with grouped structure:

Three `.nav-section-label` headers: "Research", "Organize", "Review"

Research group:
- Family Tree (route: /visualisering, was "Visualisation")
- People (route: /, was "Persons")
- Sources (route: /sources)
- Places & Map (route: /places, merges Places + Map)
- Media (route: /media)

Organize group:
- Relationships (route: /relationships)
- Groups (route: /groups)
- Research Tasks (route: /research-tasks)

Review group:
- Quality (route: /quality, was "Data Quality") with badge
- Reports (route: /reports)

Bottom:
- Settings (route: /settings)

- [ ] **Step 2: Update sidebar styles for theme**

Replace the current sidebar colors with token references:
- Background: `var(--color-sidebar-bg)`
- Text: `var(--color-sidebar-text)`
- Active item: `background: var(--color-sidebar-active-bg); color: var(--color-sidebar-active-text)`
- Hover: slight opacity change
- Section labels: `var(--color-sidebar-text-muted)`, uppercase, smaller font

- [ ] **Step 3: Add /map redirect to /places**

In router.ts, add: `{ path: '/map', redirect: '/places?view=map' }`

- [ ] **Step 4: Update i18n keys**

Rename nav labels:
- `nav.visualization` → `nav.familyTree` ("Family Tree" / "Slaktrad")
- `nav.persons` → `nav.people` ("People" / "Personer")
- `quality.nav` → keep but display as "Quality" / "Kvalitet"
- Add section labels: `nav.research`, `nav.organize`, `nav.review`

- [ ] **Step 5: Verify navigation works**

Run: `npm start`
- All sidebar links navigate correctly
- /map redirects to /places with map view
- /database, /import-export, /link-rules, /gazetteers redirect to /settings
- Quality badge still shows count
- Theme persists across page reload

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: sidebar restructured into Research/Organize/Review groups"
```

---

## Task 20: Final cleanup and verification

**Files:**
- All renderer files

- [ ] **Step 1: Grep for remaining hardcoded colors**

Run: `grep -rn "#[0-9a-fA-F]\{3,8\}" src/renderer/ --include="*.vue" --include="*.css" | grep -v tokens.css | grep -v node_modules`

Fix any remaining hardcoded hex colors by replacing with token references.

- [ ] **Step 2: Run all tests**

Run: `npm test`
All tests must pass.

- [ ] **Step 3: Visual smoke test**

Run: `npm start`
Test each theme (Forest, Nordic, Twilight) × each mode (Light, Dark, Contrast) = 9 combinations.
For each: check PersonsView, PersonDetailView, VisualizationView, MediaView, QualityView, Settings.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: design system cleanup — remove remaining hardcoded colors"
```

- [ ] **Step 5: Update CLAUDE.md and PLAN.md**

- Update CLAUDE.md file map with new files (tokens.css, ui/ components, MediaPanel, SettingsView)
- Update PLAN.md: mark "Design System Overhaul" as done with version number
- Update docs as needed

```bash
git add -A
git commit -m "docs: update CLAUDE.md and PLAN.md for design system overhaul"
```
