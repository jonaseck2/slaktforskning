# Design System Spec — Släktforskning

Date: 2026-04-17

## Goal

Transform the app from a feature-rich developer tool into a polished, consistent product that feels finished to a new user. Build a design system (tokens + primitives) and apply it to every view, detail page, modal, and panel in the app.

## Core UX Concept: Three Research Perspectives

The app supports three primary research workflows, each with the same interaction pattern: a spatial/visual main view on the left, a detail panel workbench on the right.

| Perspective | Main View | Selection Action | Right Panel | Panel Purpose |
|------------|-----------|-----------------|-------------|---------------|
| People | Family Tree (chart) | Click person | PersonPanel | Add events, relationships, media, sources |
| Places | Map / Place list | Click pin or row | PlacePanel | See events, persons, citations at place |
| Media | Gallery / Table | Click image | MediaPanel | Link persons, events, places, face tags |

**Panel is the workbench** — all entity linking happens in the panel, not in the main view. Lightbox stays clean (navigation and viewing only). Cross-linking: click a person in MediaPanel opens PersonPanel in tree; click media in PersonPanel opens lightbox.

## Visual Direction

**Deep Forest** as the default theme — dark green sidebar, warm off-white content area, earthy neutrals. Three switchable color themes via CSS custom properties:

| Theme | Sidebar | Accent | Background | Personality |
|-------|---------|--------|------------|-------------|
| Forest (default) | `#1a2e1a` | `#2d5a27` | `#eae5dc` / `#faf8f5` | Earthy, rooted, serious |
| Nordic | `#0f1a2e` | `#1d4ed8` | `#f0f2f6` / `#fafbfd` | Clean, precise, Scandinavian |
| Twilight | `#1e1b2e` | `#6c5ce7` | `#f4f2f8` / `#faf8fd` | Soft, personal, warm |

**Theme vs mode:** Themes control the color palette (sidebar, accent, borders, tints). Modes control brightness (light/dark/high-contrast). These are orthogonal — a user can use Forest+Dark or Nordic+Light.

**Semantic colors stay fixed across themes:** Sex badges (pink `#f5e8ee`/`#8a5068` for F, blue `#e0eaf2`/`#3a5a7a` for M), quality severity badges (red/orange/yellow), and success/error states use fixed semantic colors that don't change with theme.

## Implementation Order

### Phase 1: Design Tokens

Define all visual properties as CSS custom properties in a single token file. No visible change to the app yet — this is the foundation.

**Color tokens:**
```
--color-sidebar-bg           /* Theme-dependent */
--color-sidebar-text
--color-sidebar-text-muted
--color-sidebar-active-bg
--color-sidebar-active-text
--color-sidebar-border

--color-bg                   /* Warm off-white page background */
--color-surface              /* Content card background */
--color-surface-hover
--color-border
--color-border-subtle

--color-text-primary
--color-text-secondary
--color-text-muted

--color-accent               /* Theme-dependent primary action */
--color-accent-hover
--color-accent-text          /* Text on accent bg */

--color-sex-f-bg: #f5e8ee   /* Fixed semantic */
--color-sex-f-text: #8a5068
--color-sex-m-bg: #e0eaf2
--color-sex-m-text: #3a5a7a
--color-sex-u-bg: #e8e8e8
--color-sex-u-text: #666

--color-error-bg
--color-error-text
--color-warning-bg
--color-warning-text
--color-success-bg
--color-success-text
```

**Spacing tokens:**
```
--space-xs: 4px
--space-sm: 8px
--space-md: 12px
--space-lg: 16px
--space-xl: 24px
--space-2xl: 32px
```

**Typography tokens** (extend existing `--font-*` variables):
```
--font-xs: 10px    /* badges, labels */
--font-sm: 12px    /* table cells, secondary text */
--font-base: 13px  /* body text */
--font-md: 14px    /* inputs, buttons */
--font-lg: 16px    /* section headings */
--font-xl: 18px    /* page titles */
--font-weight-normal: 400
--font-weight-medium: 500
--font-weight-bold: 600
```

**Shape tokens:**
```
--radius-sm: 4px     /* badges, small chips */
--radius-md: 6px     /* buttons, inputs */
--radius-lg: 10px    /* cards, panels */
--radius-full: 9999px /* avatars, pills */

--shadow-sm: 0 1px 2px rgba(0,0,0,0.04)
--shadow-md: 0 2px 8px rgba(0,0,0,0.06)
--shadow-lg: 0 4px 16px rgba(0,0,0,0.08)
```

**Theme application:** Three CSS classes on `<html>`: `.theme-forest`, `.theme-nordic`, `.theme-twilight`. The existing `.dark`, `.contrast` classes continue to work alongside. Theme stored in localStorage, applied on load.

**Token file location:** `src/renderer/styles/tokens.css`, imported before `shared.css` in `main.ts`.

### Phase 2: Primitive Components

Standardize the shared components that appear on every view. Each primitive uses only token variables — no hardcoded colors.

**Components to build/refactor:**

| Component | Current State | Target |
|-----------|--------------|--------|
| `AppButton` | Inline styles + `.btn-add`, `.btn-delete`, `.btn-cancel` classes | Single component with `variant` prop: `primary`, `secondary`, `danger`, `ghost`. Sizes: `sm`, `md`. Uses accent token for primary. |
| `AppBadge` | Hardcoded hex colors per badge type | Single component with `variant` prop: `sex-f`, `sex-m`, `sex-u`, `severity-high`, `severity-medium`, `severity-low`, `status`, `count`. All use semantic tokens. |
| `AppAvatar` | Text symbols (♀/♂/?) | Round circle with initials (first letters of given + surname). Background color derived from sex: pink for F, blue for M, gray for U. Size prop: `sm` (20px), `md` (28px), `lg` (36px), `xl` (56px for detail headers). Falls back to profile picture when media is linked. |
| `AppInput` | Raw `<input>` with scoped styles | Styled input with focus ring using accent color, consistent padding, label positioning. Supports `error` state with inline message. Also covers `<select>` and `<textarea>`. |
| `AppTable` | `.data-table` class with per-view overrides | Consistent row height, hover state using surface-hover token, clickable-row cursor. Header styling from tokens. |
| `AppModal` | `BaseModal` (good foundation) | Keep BaseModal, add consistent form layout: title, body, footer with button alignment. Loading state on submit button. |
| `AppEmptyState` | Per-view "No X yet." text | Shared component with icon, title, description, and optional action button. |
| `AppLoadingState` | "Loading..." text or nothing | Skeleton/spinner component. Replaces bare text. Used in all async views. |
| `AppToast` | Toast that disappears | Keep disappearing toast for success. Errors get a persistent inline banner with retry action. |
| `FilterChips` | `.filter-chips` + `.chip` classes | Component with `options` + `modelValue` props. Active chip uses accent color. |
| `SectionHeader` | Inconsistent per-view section headers | Shared component for collapsible detail sections: title + count + add button. Used in detail views and panels. |

**Rule:** No scoped `<style>` block may define colors, spacing values, or font sizes directly. Everything references tokens. Enforced by convention.

### Phase 3: All Views

Apply tokens and primitives to every view in the app. Organized by view type.

#### Phase 3a: List Views (9 views — same template)

All follow one pattern: page header + filter chips + table with avatars/badges + empty/loading state + add modal.

| View | Key Changes |
|------|-------------|
| **PersonsView** (reference) | AppAvatar + condensed birth info column + AppBadge sex. Filters: All/Unsourced/Duplicates. |
| **SourcesView** | AppBadge for source type. Add search filter. |
| **PlacesView** | Merge with MapView (list/map toggle like gallery/table). Type filter chips. |
| **RelationshipsView** | Person link avatars for both persons. Type filter chips. |
| **GroupsView** | Member count badge. Simple list. |
| **MediaView** | Gallery/table toggle (existing). AppAvatar thumbnails. |
| **ResearchTasksView** | Status filter chips. Priority badge. Inline expand-to-edit. |
| **QualityView** | Severity filter chips. Fix action buttons. Person link with avatar. |
| **SearchView** | Cross-entity results with type section headers. Avatar for person results. |

**Shared list view pattern:**
```
┌─────────────────────────────────────────┐
│ Page Title              [count]  [+ Add]│
│ [All] [Filter1] [Filter2]               │
├─────────────────────────────────────────┤
│ [avatar] Name         Info      [badge] │
│ [avatar] Name         Info      [badge] │
│ [avatar] Name         Info      [badge] │
│                                         │
│         — or —                          │
│                                         │
│    [icon]                               │
│    No items yet.                        │
│    Description text.                    │
│    [+ Add First Item]                   │
└─────────────────────────────────────────┘
```

#### Phase 3b: Detail Views (5 views)

Each shows one entity with a header card and collapsible sections.

**Shared detail view pattern:**
```
┌─────────────────────────────────────────┐
│ ← Back to list                          │
│                                         │
│ [avatar XL]  Entity Name                │
│              Summary line · badges      │
│              [Edit]                     │
├─────────────────────────────────────────┤
│ ▼ Section 1 (count)            [+ Add] │
│   Content rows...                       │
│                                         │
│ ▼ Section 2 (count)            [+ Add] │
│   Content rows...                       │
│                                         │
│ ► Section 3 (0)  · ► Section 4 (0)     │
│   (collapsed secondary sections)        │
└─────────────────────────────────────────┘
```

| View | Header | Primary Sections | Secondary Sections (collapsed when empty) |
|------|--------|-----------------|------------------------------------------|
| **PersonDetailView** | Avatar XL + full name + birth summary + sex/living badges | Names, Events, Relationships | Media, Citations, Identifiers, Quality, Notes |
| **SourceDetailView** | Source type badge + title | Editable fields (title, author, type, publication, repository, URL, abstract), Citations | — |
| **PlaceDetailView** | Place name + type badge + parent path | Info fields (type, parent, coordinates, address), Events at place, Persons at place | Media, Citations, Child places, Notes |
| **RelationshipDetailView** | Two person avatars + type/subtype | Person links, Events, Notes | Citations |
| **GroupDetailView** | Group name | Members list (add/remove), Notes | — |

#### Phase 3c: Panels (3 panels — the research workbenches)

Right-side sliding panels for the three research perspectives. Same interaction pattern: header + quick actions + collapsible sections.

**Shared panel pattern:**
```
┌──────────────────────┐
│ [avatar] Entity Name │
│          Summary     │
│ [action] [action]    │
├──────────────────────┤
│ ▼ Section 1 (count)  │
│   Compact rows...    │
│ ▼ Section 2 (count)  │
│   Compact rows...    │
│ ► Section 3 (0)      │
└──────────────────────┘
```

| Panel | Header | Quick Actions | Sections |
|-------|--------|---------------|----------|
| **PersonPanel** (existing) | Avatar + name + birth summary | + Father, + Mother, + Spouse, + Child | Events, Relationships, Media, Citations, Quality |
| **PlacePanel** (existing) | Place name + type + coordinates | — | Events at place, Persons, Media, Citations, Child places |
| **MediaPanel** (new) | Thumbnail + title + format/size | + Link Person, + Link Event, + Link Place | Linked Persons (with unlink ✕), Linked Events, Linked Places, Face Tags, Source |

**MediaPanel specifics:**
- Shows a thumbnail preview of the selected media at the top
- "Linked Persons" section shows avatars with unlink (✕) buttons + "Link Person" action (opens PersonPicker)
- "Linked Events" shows event type + date + person name + unlink
- "Linked Places" shows place name + unlink
- "Face Tags" section — future home for region tagging UI (draws from existing API/MCP infrastructure, i18n strings already present)
- "Source" section — link a source/citation to this media
- Appears when clicking a media item in MediaView gallery/table
- MediaLightbox stays as-is for full-screen viewing/navigation — clean, no editing

**Panel ↔ Panel cross-linking:**
- Click a person name in MediaPanel → navigates to Family Tree and opens PersonPanel for that person
- Click a person name in PlacePanel → navigates to Family Tree and opens PersonPanel
- Click media thumbnail in PersonPanel → opens MediaLightbox (not MediaPanel — lightbox is for viewing)
- Click place name in PersonPanel → navigates to Places & Map and opens PlacePanel

#### Phase 3d: Modals (7 modals)

All modals use BaseModal with consistent form layout from tokens.

**Shared modal pattern:**
```
┌──────────────────────────────┐
│ Modal Title                  │
├──────────────────────────────┤
│ [Label]                      │
│ [Input field                ]│
│                              │
│ [Label]                      │
│ [Input field                ]│
│                              │
│ [Label]        [Label]       │
│ [Select ▾]     [Checkbox]    │
├──────────────────────────────┤
│           [Cancel] [Action]  │
└──────────────────────────────┘
```

| Modal | Fields | Submit Label |
|-------|--------|-------------|
| **Add Person** | Given name, Surname, Sex (select), Living (checkbox), Birth date/place (collapsible) | "Create Person" |
| **AddRelatedPersonModal** | New/existing toggle, Given name, Surname, Sex (auto-inferred), Birth date/place/source (collapsible) | "Create & Link" |
| **PersonNameFormModal** | Given name, Surname, Name type (select), Preferred name, Nickname | "Save Name" / "Add Name" |
| **EventForm** | Event type (select), Date fields (DateInput), Place (PlacePicker), Description, Source (SourcePicker) | "Save Event" / "Add Event" |
| **CitationEditModal** | Source (SourcePicker), Page, Confidence (select), Transcription, Notes | "Save Citation" |
| **MergePersonsModal** | Side-by-side person comparison, merge direction | "Merge Persons" |
| **ConfirmModal** | Title, message (danger styling for deletes) | "Delete" / "Confirm" |

**Modal rules:**
- Action verb buttons (never "OK" or "Submit")
- Cancel always on the left, action on the right
- Primary action uses AppButton `primary` variant
- Delete confirmations use AppButton `danger` variant
- Loading spinner on submit button during async operations
- Escape closes, click-outside does NOT close

#### Phase 3e: Settings Page (absorbs 4 config views)

New full-page view at `/settings` with tabs:

| Tab | Content (absorbed from) |
|-----|------------------------|
| **Appearance** | Theme switcher (Forest/Nordic/Twilight dots), Mode (Light/Dark/Contrast), Text Size (S/M/L), Language (sv/en), Read Aloud (Off/Narrate/Screen Reader) |
| **Database** | Current database path, recent databases list, tree subject picker, New/Open/Backup/Restore buttons (from DatabaseView) |
| **Import / Export** | All import/export tabs: GEDCOM, Genney, Holger, Archive, CSV, HTML Site (from ImportExportView) |
| **Link Rules** | Locale toggles, rule table, custom rules, test field (from LinkRulesView) |
| **Gazetteers** | Gazetteer management: toggle on/off, test lookup, import/export (from GazetteersView) |

#### Phase 3f: Visualization & Reports

Charts and reports keep their existing layout logic — only surface styling changes:
- Chart box colors, fonts, and connector styles use tokens
- Report views use AppButton, AppBadge, FilterChips from primitives
- VisualizationView tab bar uses FilterChips pattern
- No changes to chart rendering algorithms or SVG generation

### Phase 4: Sidebar Restructure

Reorganize sidebar navigation into workflow groups.

**Structure:**
```
[🌿 Släktforskning]
[🔍 Search...]

RESEARCH
  🌳 Family Tree        (was: Visualisation)
  👤 People             (was: Persons)
  📚 Sources
  📍 Places & Map       (Places + Map merged)
  📷 Media

ORGANIZE
  📄 Relationships
  📁 Groups
  🔍 Research Tasks     (was: Research)

REVIEW
  ⚠ Quality             (was: Data Quality) [badge: count]
  📋 Reports

─────────────────
  ⚙ Settings            (absorbs: Link Rules, Gazetteers,
                          Database, Import/Export)
```

**Places & Map merge:** PlacesView keeps its route (`/places`). Map becomes a toggle within PlacesView (list vs map), similar to MediaView's gallery/table toggle. One sidebar item, two modes. The existing `/map` route redirects to `/places?view=map`.

**Naming changes:**
- "Visualisation" → "Family Tree"
- "Persons" → "People"
- "Data Quality" → "Quality"
- "Research" → "Research Tasks"

## Audit Fixes (included across all phases)

| Issue | Phase | Fix |
|-------|-------|-----|
| No loading indicators | Phase 2 | AppLoadingState component used in all views |
| Empty states don't guide | Phase 2 | AppEmptyState with action buttons |
| Hardcoded colors everywhere | Phase 1 | All colors from tokens |
| Inconsistent sex badges | Phase 2 | AppBadge with semantic sex variants |
| Profile shows ♀/♂/? symbols | Phase 2 | AppAvatar with initials |
| Errors disappear with no recovery | Phase 2 | Persistent error banner with retry |
| Form validation is `required` only | Phase 2 | AppInput with inline error state |
| PersonDetailView sections all look equal | Phase 3b | SectionHeader component with visual hierarchy |
| aria-narrate attributes never update | Phase 3b | Fix during view adoption |
| MCP ui_navigate accepts invalid routes | Separate | Bug fix: validate route before navigating |

## Out of Scope

- Responsive/mobile layout (acceptable for desktop Electron app)
- Dark mode color refinement (existing dark mode continues to work; theme-aware dark mode refinement is a follow-up)
- Onboarding wizard / welcome screen (separate spec after design system is in place)
- Visualization view empty state with "+" outline (separate feature)
- Face/region tagging drawing UI (MediaPanel includes the "Face Tags" section but the canvas drawing interaction is a separate spec — the API/MCP/i18n infrastructure already exists)
- Wall chart generation UI (separate spec)

## Component File Structure

```
src/renderer/
├── styles/
│   ├── tokens.css          # NEW: all design tokens + theme definitions
│   └── shared.css          # REFACTORED: references tokens, no hardcoded values
├── components/
│   ├── ui/                 # NEW: design system primitives
│   │   ├── AppButton.vue
│   │   ├── AppBadge.vue
│   │   ├── AppAvatar.vue
│   │   ├── AppInput.vue
│   │   ├── AppTable.vue
│   │   ├── AppEmptyState.vue
│   │   ├── AppLoadingState.vue
│   │   ├── AppToast.vue
│   │   ├── FilterChips.vue
│   │   └── SectionHeader.vue
│   ├── MediaPanel.vue      # NEW: media linking workbench
│   ├── PersonPanel.vue     # EXISTING: refactored to use primitives
│   ├── PlacePanel.vue      # EXISTING: refactored to use primitives
│   ├── BaseModal.vue       # EXISTING: refactored to use tokens
│   └── ...existing components
├── views/
│   ├── SettingsView.vue    # NEW: absorbs Database, ImportExport, LinkRules, Gazetteers
│   └── ...existing views refactored
```

## Success Criteria

1. Every color in the app derives from a token — `grep -r "#[0-9a-f]" src/renderer/` returns zero matches outside of `tokens.css`
2. Theme switcher works: changing theme updates entire app instantly, persists across sessions
3. All 9 list views follow the shared list pattern (header + filters + avatar table + empty/loading)
4. All 5 detail views follow the shared detail pattern (header card + collapsible sections)
5. All 3 panels follow the shared panel pattern (header + quick actions + collapsible sections)
6. All 7 modals use consistent form layout with action verb buttons
7. Sidebar uses grouped workflow layout (Research / Organize / Review)
8. MediaPanel exists and supports entity linking from the media perspective
9. Settings page absorbs Link Rules, Gazetteers, Database, Import/Export
10. All views have proper loading and empty states (using shared components)
11. No visual regression in existing functionality
