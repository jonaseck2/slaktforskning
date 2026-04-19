# Empty Entity States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace scattered empty-state i18n keys and literal `—` / `--` placeholders with a single canonical `empty.*` namespace keyed per entity type, rendered consistently via `.empty-hint`.

**Architecture:** Add one `empty` i18n namespace with 18 entity keys + `withFilter` suffix. Swap ~30 caller sites. Replace 7 dash-placeholder sites in PersonPanel / MediaPanel / PlacePanel. Compose filter variants as `empty.<entity> + empty.withFilter`. Rename "ansiktsmärken" → "ansiktsmarkeringar" in Swedish. Remove orphaned keys.

**Tech Stack:** Vue 3 Composition API, vue-i18n, TypeScript. No new components, no new CSS classes — `.empty-hint` already exists in `shared.css`.

**Spec:** [docs/superpowers/specs/2026-04-19-empty-entity-states-design.md](../superpowers/specs/2026-04-19-empty-entity-states-design.md)

---

## Task 1: Add `empty.*` i18n namespace

**Files:**
- Modify: `src/renderer/i18n/sv.ts`
- Modify: `src/renderer/i18n/en.ts`

- [ ] **Step 1: Add `empty` block to `src/renderer/i18n/sv.ts`**

Insert a new top-level block. Pick a location alphabetically between existing top-level keys (e.g. after `duplicates` or before `events`). The block:

```ts
  empty: {
    persons: 'Inga personer',
    events: 'Inga händelser',
    relationships: 'Inga relationer',
    places: 'Inga platser',
    sources: 'Inga källor',
    citations: 'Inga hänvisningar',
    media: 'Ingen media',
    names: 'Inga namn',
    identifiers: 'Inga identifierare',
    groups: 'Inga grupper',
    researchTasks: 'Inga forskningsuppgifter',
    qualityIssues: 'Inga problem',
    faceTags: 'Inga ansiktsmarkeringar',
    duplicates: 'Inga dubbletter',
    linkRules: 'Inga regler',
    gazetteers: 'Inga ortsregister',
    recentDatabases: 'Inga tidigare databaser',
    children: 'Inga barn',
    withFilter: 'med detta filter',
  },
```

- [ ] **Step 2: Add matching `empty` block to `src/renderer/i18n/en.ts`**

```ts
  empty: {
    persons: 'No persons',
    events: 'No events',
    relationships: 'No relationships',
    places: 'No places',
    sources: 'No sources',
    citations: 'No citations',
    media: 'No media',
    names: 'No names',
    identifiers: 'No identifiers',
    groups: 'No groups',
    researchTasks: 'No research tasks',
    qualityIssues: 'No issues',
    faceTags: 'No face tags',
    duplicates: 'No duplicates',
    linkRules: 'No rules',
    gazetteers: 'No gazetteers',
    recentDatabases: 'No previous databases',
    children: 'No children',
    withFilter: 'with this filter',
  },
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "i18n: add canonical empty.* namespace"
```

---

## Task 2: Swap AppEmptyState callers in view-level lists

**Files (all under `src/renderer/views/`):**
- Modify: `PersonsView.vue`
- Modify: `RelationshipsView.vue`
- Modify: `SourcesView.vue`
- Modify: `GroupsView.vue`
- Modify: `PlacesView.vue`
- Modify: `MapView.vue`
- Modify: `ResearchTasksView.vue`
- Modify: `MediaView.vue`
- Modify: `LinkRulesView.vue`
- Modify: `GazetteersView.vue`
- Modify: `SettingsView.vue` (DatabaseView section — grep for `database.noRecent`)

- [ ] **Step 1: Swap keys**

For each view, grep the current key and replace with the new one. Exact mappings (line numbers may have drifted — grep to locate):

| Caller | Old key | New key |
|---|---|---|
| `PersonsView.vue` | `persons.emptyState` | `empty.persons` |
| `PersonsView.vue` | `persons.emptyHint` | `empty.persons` (or delete if redundant with AppEmptyState message prop) |
| `PersonsView.vue` (duplicates subview L19) | `duplicates.noDuplicates` | `empty.duplicates` |
| `RelationshipsView.vue` | `relationships.emptyState` | `empty.relationships` |
| `SourcesView.vue` | `sources.emptyState` | `empty.sources` |
| `GroupsView.vue` | `groups.emptyState` | `empty.groups` |
| `PlacesView.vue` | `places.none` | `empty.places` |
| `MapView.vue` | `map.empty` | `empty.places` |
| `ResearchTasksView.vue` | `researchTasks.noTasks` | `empty.researchTasks` |
| `MediaView.vue` | `media.noMedia` | `empty.media` |
| `LinkRulesView.vue` | `linkRules.noRules` | `empty.linkRules` |
| `GazetteersView.vue` | `gazetteers.noGazetteers` | `empty.gazetteers` |
| DatabaseView (wherever it lives — grep `database.noRecent`) | `database.noRecent` | `empty.recentDatabases` |

Find each with:
```bash
grep -rn "persons\.emptyState\|persons\.emptyHint\|duplicates\.noDuplicates\|relationships\.emptyState\|sources\.emptyState\|groups\.emptyState\|places\.none\|map\.empty\|researchTasks\.noTasks\|media\.noMedia\|linkRules\.noRules\|gazetteers\.noGazetteers\|database\.noRecent" src/renderer/views src/renderer/components
```

Swap each. Do NOT delete the old keys from sv.ts/en.ts yet — Task 11 removes orphans once all call sites have been migrated.

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/views
git commit -m "i18n: swap view-level empty-state keys to empty.*"
```

---

## Task 3: Swap section-level component callers

**Files (all under `src/renderer/components/`):**
- Modify: `PersonChecksSection.vue`
- Modify: `PersonMediaSection.vue`
- Modify: `PersonIdentifiersSection.vue`
- Modify: `EventList.vue`
- Modify: `EntityMediaSection.vue`
- Modify: `PlacePersonsSection.vue`
- Modify: `PlaceCitationsSection.vue`
- Modify: `PersonRelationshipsSection.vue`
- Modify: `MediaTimeline.vue`
- Modify: `EventForm.vue`

- [ ] **Step 1: Swap keys**

| File | Old key | New key |
|---|---|---|
| `PersonChecksSection.vue` | `quality.noIssues` | `empty.qualityIssues` |
| `PersonMediaSection.vue` | `media.noMedia` | `empty.media` |
| `PersonIdentifiersSection.vue` | `identifiers.none` | `empty.identifiers` |
| `EventList.vue` | `events.noEvents` | `empty.events` |
| `EntityMediaSection.vue` | `media.noMedia` | `empty.media` |
| `PlacePersonsSection.vue` | `places.noPersons` | `empty.persons` |
| `PlaceCitationsSection.vue` | `sourceDetail.noCitations` | `empty.citations` |
| `PersonRelationshipsSection.vue` | `personDetail.noRelationships` | `empty.relationships` |
| `MediaTimeline.vue` | `mediaTimeline.empty` | `empty.media` |
| `EventForm.vue` | `citations.none` | `empty.citations` |

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components
git commit -m "i18n: swap section-level empty-state keys to empty.*"
```

---

## Task 4: Swap detail-view section callers

**Files:**
- Modify: `src/renderer/views/PersonDetailView.vue`
- Modify: `src/renderer/views/SourceDetailView.vue`
- Modify: `src/renderer/views/GroupDetailView.vue`

- [ ] **Step 1: Swap keys**

| File | Old key | New key |
|---|---|---|
| `PersonDetailView.vue` (names section) | `personDetail.noNames` | `empty.names` |
| `PersonDetailView.vue` (groups section) | `groups.noGroups` | `empty.groups` |
| `PersonDetailView.vue` (tasks section) | `researchTasks.noTasks` | `empty.researchTasks` |
| `SourceDetailView.vue` | `sourceDetail.noCitations` | `empty.citations` |
| `GroupDetailView.vue` (members section) | `groups.noGroups` | `empty.persons` |

Note: `GroupDetailView` changes from `empty.groups`-flavored to `empty.persons`-flavored because the section shows persons (group members), not groups.

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/views
git commit -m "i18n: swap detail-view section empty-state keys to empty.*"
```

---

## Task 5: Replace dash placeholders in PersonPanel

**Files:**
- Modify: `src/renderer/components/PersonPanel.vue`

Currently shows `—` via `.panel-empty-section` class in three sections.

- [ ] **Step 1: Replace each placeholder**

At line 56 (names section):
```vue
<div v-if="names.length === 0" class="empty-hint">{{ $t('empty.names') }}</div>
```

At line 113 (groups section):
```vue
<div v-if="groups.length === 0" class="empty-hint">{{ $t('empty.groups') }}</div>
```

At line 138 (research tasks section):
```vue
<div v-if="researchTasks.length === 0" class="empty-hint">{{ $t('empty.researchTasks') }}</div>
```

- [ ] **Step 2: Remove the `.panel-empty-section` CSS rule**

At line 469, delete:
```css
.panel-empty-section { padding: var(--space-xs) 0; color: var(--text-muted); font-size: var(--font-xs); }
```

If `.empty-hint` in `shared.css` does not already have compact panel-appropriate padding, verify by running the app and inspecting a panel section. `.empty-hint` is already used throughout the codebase for identical rendering — no CSS change should be needed.

- [ ] **Step 3: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/PersonPanel.vue
git commit -m "i18n: replace PersonPanel dash placeholders with empty.* keys"
```

---

## Task 6: Replace dash placeholders in MediaPanel

**Files:**
- Modify: `src/renderer/components/MediaPanel.vue`

Currently shows `--` via `.panel-empty-section` in three linked-entity sections, plus a proper i18n key for face tags.

- [ ] **Step 1: Replace placeholders**

At line 66 (linked persons):
```vue
<div v-if="linkedPersons.length === 0 && !showPersonPicker" class="empty-hint">{{ $t('empty.persons') }}</div>
```

At line 90 (linked places):
```vue
<div v-if="linkedPlaces.length === 0 && !showPlacePicker" class="empty-hint">{{ $t('empty.places') }}</div>
```

At line 107 (linked events):
```vue
<div v-if="linkedEvents.length === 0" class="empty-hint">{{ $t('empty.events') }}</div>
```

At line 126 (face tags — keep as-is functionally, just update the key):
```vue
<div v-if="regions.length === 0 && !drawMode" class="empty-hint">{{ $t('empty.faceTags') }}</div>
```

- [ ] **Step 2: Remove the `.panel-empty-section` CSS rule**

At line 603, delete the `.panel-empty-section` block.

- [ ] **Step 3: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/MediaPanel.vue
git commit -m "i18n: replace MediaPanel dash placeholders with empty.* keys"
```

---

## Task 7: Replace dash placeholder in PlacePanel

**Files:**
- Modify: `src/renderer/components/PlacePanel.vue`

- [ ] **Step 1: Replace placeholder**

At line 176 (hierarchy section):
```vue
<div v-if="ancestors.length === 0 && childPlaces.length === 0" class="empty-hint">{{ $t('empty.places') }}</div>
```

- [ ] **Step 2: Remove the `.panel-empty-section` CSS rule**

At line 427, delete the `.panel-empty-section` block.

- [ ] **Step 3: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/PlacePanel.vue
git commit -m "i18n: replace PlacePanel hierarchy dash placeholder with empty.* key"
```

---

## Task 8: Wire filter-empty composition

**Files:**
- Modify: `src/renderer/views/RelationshipsView.vue`
- Modify: `src/renderer/views/PlacesView.vue`
- Modify: `src/renderer/views/QualityView.vue`

Filter-empty states compose the entity key with `empty.withFilter`.

- [ ] **Step 1: RelationshipsView — swap `relationships.noMatchingFilter`**

Find the AppEmptyState usage (around line 11-12 in the spec survey). Replace the filter-branch message with composition:

```vue
<!-- When a filter is applied and no matches found -->
<AppEmptyState
  v-else-if="filteredRelationships.length === 0"
  :message="$t('empty.relationships') + ' ' + $t('empty.withFilter')"
/>
```

Keep the non-filtered empty branch using `empty.relationships` alone.

- [ ] **Step 2: PlacesView — swap `places.noMatchingFilter`**

Same pattern — find the filter-branch and use `$t('empty.places') + ' ' + $t('empty.withFilter')`.

- [ ] **Step 3: QualityView — swap `quality.noResults`**

Find the filter-empty branch (around line 19). Replace with `$t('empty.qualityIssues') + ' ' + $t('empty.withFilter')`.

Leave `quality.notRun` alone — it is a prompt, not an empty state.

- [ ] **Step 4: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/views/RelationshipsView.vue src/renderer/views/PlacesView.vue src/renderer/views/QualityView.vue
git commit -m "i18n: compose filter-empty as empty.<entity> + empty.withFilter"
```

---

## Task 9: Wire VisualizationView hardcoded Swedish

**Files:**
- Modify: `src/renderer/views/VisualizationView.vue`

- [ ] **Step 1: Locate hardcoded string**

Run:
```bash
grep -n "Lägg till en person" src/renderer/views/VisualizationView.vue
```

Expected: one match on an `.empty-state` div (survey found it around line 38).

- [ ] **Step 2: Replace with `$t('visualization.empty')`**

The key `visualization.empty` already exists in both locale files ("Lägg till en person för att börja visualisera." / "Create a person to start visualizing."). Swap the hardcoded literal for `{{ $t('visualization.empty') }}`.

- [ ] **Step 3: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/views/VisualizationView.vue
git commit -m "i18n: wire VisualizationView hardcoded Swedish to visualization.empty"
```

---

## Task 10: Rename "ansiktsmärken" → "ansiktsmarkering(ar)"

**Files:**
- Modify: `src/renderer/i18n/sv.ts`

Only Swedish strings need to change. English "Face Tags" stays. CSS classes and TypeScript identifiers (e.g. `face-tag-row`, `faceTags`) are unchanged — this is purely a Swedish terminology rename.

- [ ] **Step 1: Swap Swedish label**

At `src/renderer/i18n/sv.ts` line 991, change:
```ts
    faceTags: 'Ansiktsmärken',
```
to:
```ts
    faceTags: 'Ansiktsmarkeringar',
```

- [ ] **Step 2: Verify no other Swedish occurrences remain**

Run:
```bash
grep -rn "ansiktsmärk" src/
```
Expected: zero results (Task 11 will remove `media.noFaceTags` entirely).

- [ ] **Step 3: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/i18n/sv.ts
git commit -m "i18n(sv): rename ansiktsmärken to ansiktsmarkeringar"
```

---

## Task 11: Remove orphaned i18n keys

**Files:**
- Modify: `src/renderer/i18n/sv.ts`
- Modify: `src/renderer/i18n/en.ts`

After Tasks 2–9, these keys should have no callers. Verify and remove.

- [ ] **Step 1: For each key below, verify zero callers remain**

Run each grep — expected output: no hits in `src/renderer/components` or `src/renderer/views`.

```bash
for key in \
  "events.noEvents" \
  "groups.noGroups" \
  "groups.emptyState" \
  "personDetail.noNames" \
  "personDetail.noRelationships" \
  "sourceDetail.noCitations" \
  "identifiers.none" \
  "media.noMedia" \
  "media.noFaceTags" \
  "mediaTimeline.empty" \
  "places.none" \
  "places.noPersons" \
  "places.noMatchingFilter" \
  "relationships.emptyState" \
  "relationships.noMatchingFilter" \
  "persons.emptyState" \
  "persons.emptyHint" \
  "sources.emptyState" \
  "researchTasks.noTasks" \
  "quality.noIssues" \
  "quality.noResults" \
  "duplicates.noDuplicates" \
  "linkRules.noRules" \
  "gazetteers.noGazetteers" \
  "database.noRecent" \
  "citations.none" \
  "map.empty"; do
  echo "=== $key ==="
  grep -rn "$key" src/renderer/components src/renderer/views 2>/dev/null || echo "(none)"
done
```

Any key with remaining callers — fix the caller first (should have been handled by earlier tasks; if a site was missed, add it to the appropriate task retroactively).

- [ ] **Step 2: Remove the keys from `sv.ts`**

Open `src/renderer/i18n/sv.ts`. For each key in the list above, find the line (use `grep -n "noEvents:" src/renderer/i18n/sv.ts` etc.) and delete it. Be careful not to remove keys that share a name but live in a different namespace — e.g. `reports.noEvents` stays; only `events.noEvents` is being removed.

Keys that may leave empty parent objects after deletion (`duplicates`, `linkRules`, `map`, `mediaTimeline`):
- If the namespace only had this one key, delete the whole namespace object.
- If it has other keys, leave the namespace and just delete the target key.

For `relationships.noMatchingFilter` / `relationships.emptyState`: these are inside the larger `relationships: { ... }` object which has other keys. Delete only these two lines.

Same logic for all other keys.

- [ ] **Step 3: Remove the same keys from `en.ts`**

Mirror every deletion in `src/renderer/i18n/en.ts`.

- [ ] **Step 4: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 errors. If TypeScript flags a missing key, that caller was missed — fix and re-run.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "i18n: remove orphaned empty-state keys"
```

---

## Task 12: Verification

**Files:** none (verification only)

- [ ] **Step 1: Run full test suite**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 2: Run lint**

```bash
npm run lint
```
Expected: 0 errors.

- [ ] **Step 3: Launch the app and smoke-test empty states**

```bash
npm start
```

Manually walk through:
- **PersonPanel** on a person with no names / no groups / no research tasks → each section shows the new text, no `—`.
- **MediaPanel** on a media item with no linked persons / places / events / face tags → each section shows the new text, no `--`.
- **PlacePanel** on a root place with no parents and no children → hierarchy section shows "Inga platser" (or English equivalent), no `—`.
- **PersonsView / RelationshipsView / PlacesView** with a filter that matches nothing → shows `<entity> med detta filter` composition.
- **VisualizationView** with an empty database → shows the `visualization.empty` prompt via i18n.
- **QualityView** with an active filter and no matches → shows "Inga problem med detta filter".
- Toggle language to English in Settings → repeat a subset of the above, confirm English renders.

- [ ] **Step 4: Bump version**

Per CLAUDE.md: "Features bump minor (x.Y.0) when done." This is a consistency pass spanning many files — decide minor vs patch. Treat as patch (x.y.Z) since no new user-facing feature is added; only text consistency.

Edit `package.json` version field. Bump the patch number. Commit:

```bash
git add package.json
git commit -m "release: vX.Y.Z — unified empty-state i18n"
```

- [ ] **Step 5: Update CHANGELOG / docs if applicable**

If there is a `CHANGELOG.md`, add an entry. If not, skip.

Update `docs/PLAN.md` if the roadmap has a pointer to the spec — mark it done and move the spec to `docs/superpowers/specs/archive/` per CLAUDE.md archival convention.

```bash
git mv docs/superpowers/specs/2026-04-19-empty-entity-states-design.md docs/superpowers/specs/archive/
git mv docs/plans/2026-04-19-empty-entity-states.md docs/plans/archive/
git add docs/PLAN.md 2>/dev/null || true
git commit -m "docs: archive empty-states spec and plan"
```

---

## Out of scope (explicitly NOT in this plan)

- Reports empty placeholders (`reports.noEvents`, `reports.noChildren`, `reports.noRelationships`, `reports.noEventsForPlace`) — separate design question.
- Selection prompts (`panel.noPersonSelected`, `placePanel.noPlaceSelected`, `media.selectMedia`, `reports.selectXxx`, `search.emptyState`).
- `search.noResults` (has `{query}` param, stays as-is).
- `quality.notRun` (prompt, not an empty state).
- `AppEmptyState` component API changes.
- CSS token changes.
