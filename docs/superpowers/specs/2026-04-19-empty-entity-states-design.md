# Empty Entity States — Consistent i18n and Rendering

**Date:** 2026-04-19
**Status:** Design
**Scope:** All renderer list/section/panel empty states

## Problem

Empty-state rendering is inconsistent across the renderer. Some lists show `AppEmptyState`, some show `.empty-hint`, some show a literal `—` or `--` with no i18n, and one view (VisualizationView) has hardcoded Swedish. The i18n keys themselves are scattered across ~15 namespaces (`events.noEvents`, `groups.noGroups`, `personDetail.noNames`, `media.noFaceTags`, `identifiers.none`, `places.none`, `database.noRecent`, etc.) with no per-entity convention.

Specific gaps flagged:

- PersonPanel: Names, Groups, Research, Identifiers, Quality — mix of `—` and ad-hoc keys.
- MediaPanel: Linked Places / Events / Persons — literal `--`.
- PlacePanel: Hierarchy — literal `—`.
- VisualizationView — hardcoded Swedish string.

## Goal

Every entity type has **one canonical i18n string** for "nothing here", used consistently wherever a list of that entity is empty.

## Design

### 1. Single `empty` i18n namespace

One key per entity type. Replaces all scattered `*.noX` / `*.emptyState` / `*.none` keys and all hardcoded dash placeholders.

| Key | Swedish | English | Entity |
|---|---|---|---|
| `empty.persons` | Inga personer | No persons | Person |
| `empty.events` | Inga händelser | No events | GenealogyEvent |
| `empty.relationships` | Inga relationer | No relationships | Relationship |
| `empty.places` | Inga platser | No places | Place (list & hierarchy) |
| `empty.sources` | Inga källor | No sources | Source |
| `empty.citations` | Inga hänvisningar | No citations | Citation |
| `empty.media` | Ingen media | No media | Media |
| `empty.names` | Inga namn | No names | PersonName |
| `empty.identifiers` | Inga identifierare | No identifiers | PersonIdentifier |
| `empty.groups` | Inga grupper | No groups | Group |
| `empty.researchTasks` | Inga forskningsuppgifter | No research tasks | ResearchTask |
| `empty.qualityIssues` | Inga problem | No issues | Quality check |
| `empty.faceTags` | Inga ansiktsmarkeringar | No face tags | MediaRegion |
| `empty.duplicates` | Inga dubbletter | No duplicates | Duplicate candidate |
| `empty.linkRules` | Inga regler | No rules | Link rule |
| `empty.gazetteers` | Inga ortsregister | No gazetteers | Gazetteer |
| `empty.recentDatabases` | Inga tidigare databaser | No previous databases | Database |
| `empty.children` | Inga barn | No children | Children (used in family views) |

### 2. Shared filter suffix

Filter-empty states compose the entity key with a shared suffix instead of maintaining per-entity filter variants.

| Key | Swedish | English |
|---|---|---|
| `empty.withFilter` | med detta filter | with this filter |

**Template pattern:**

```vue
<div v-if="!items.length" class="empty-hint">
  {{ $t('empty.' + entityKey) }}
  <template v-if="hasFilter"> {{ $t('empty.withFilter') }}</template>
</div>
```

Produces:

- Base: `Inga personer` / `No persons`
- Filtered: `Inga personer med detta filter` / `No persons with this filter`

Replaces: `relationships.noMatchingFilter`, `places.noMatchingFilter`, `quality.noResults`.

### 3. Out of scope for `empty.*`

These are **selection prompts**, not empty data — they stay in their current namespaces:

- `panel.noPersonSelected` — "Click a person in the tree"
- `placePanel.noPlaceSelected` — "Click a pin on the map"
- `media.selectMedia` — "Select a media item"
- `reports.selectPersonFirst` / `reports.selectCoupleFirst` / `reports.selectPlaceFirst` / `reports.ancestorBook.noPersonSelected`
- `search.emptyState` — "Enter a name or keyword to search"
- `search.noResults` — "No results for '{query}'" (has query param)

**Reports also stay out of scope.** `reports.noEvents`, `reports.noChildren`, `reports.noRelationships`, `reports.noEventsForPlace` remain — report copy has narrative tone ("Inga händelser registrerade" vs bare "Inga händelser"). Whether reports should show empty placeholders at all is a separate question.

### 4. Rendering — two tiers only

**Tier 1: `AppEmptyState` (view-level)**
Top-level list views. Unchanged.

**Tier 2: `.empty-hint` (section/panel-level)**
Every section and panel empty state. Single line, muted italic (already defined in `shared.css`).

```vue
<div v-if="!items.length" class="empty-hint">{{ $t('empty.<entity>') }}</div>
```

**Retired patterns:**

- `.panel-empty-section` with literal `—` / `--` — replaced by `.empty-hint`.
- Hardcoded Swedish strings.

No new component is introduced.

### 5. Terminology fix: ansiktsmärken → ansiktsmarkering

Rename throughout the codebase, not just in the empty-state key:

- `empty.faceTags` = "Inga ansiktsmarkeringar"
- MediaPanel face-tag section header
- `mediaRegions.noRegions` and any other keys referencing "ansiktsmärke"
- a11y / screen-reader narration strings
- Grep for `ansiktsmärk` to locate all sites.

## Affected call sites

### Components and views using existing keys → swap to `empty.*`

| File | Current key | New key |
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
| `MediaPanel.vue` (face tags) | `media.noFaceTags` | `empty.faceTags` |
| `PersonDetailView.vue` (names) | `personDetail.noNames` | `empty.names` |
| `PersonDetailView.vue` (groups) | `groups.noGroups` | `empty.groups` |
| `PersonDetailView.vue` (tasks) | `researchTasks.noTasks` | `empty.researchTasks` |
| `SourceDetailView.vue` | `sourceDetail.noCitations` | `empty.citations` |
| `GroupDetailView.vue` (members) | `groups.noGroups` | `empty.persons` |
| `PersonsView.vue` | `persons.emptyState` | `empty.persons` |
| `RelationshipsView.vue` | `relationships.emptyState` | `empty.relationships` |
| `SourcesView.vue` | `sources.emptyState` | `empty.sources` |
| `GroupsView.vue` | `groups.emptyState` | `empty.groups` |
| `PlacesView.vue` | `places.none` | `empty.places` |
| `MapView.vue` | `map.empty` | `empty.places` |
| `ResearchTasksView.vue` | `researchTasks.noTasks` | `empty.researchTasks` |
| `QualityView.vue` (notRun) | `quality.notRun` | (stays — it's a prompt, not empty data) |
| `MediaView.vue` | `media.noMedia` | `empty.media` |
| `LinkRulesView.vue` | `linkRules.noRules` | `empty.linkRules` |
| `GazetteersView.vue` (none installed) | `gazetteers.noGazetteers` | `empty.gazetteers` |
| `DatabaseView.vue` | `database.noRecent` | `empty.recentDatabases` |
| `EventForm.vue` | `citations.none` | `empty.citations` |
| `PersonsView.vue` (duplicates subview) | `duplicates.noDuplicates` | `empty.duplicates` |
| `FamilyGroupSheet.vue` | `reports.noChildren` | (stays — reports out of scope) |
| `FamilyNarrative.vue` | `reports.noChildren` | (stays — reports out of scope) |

### Components using `—` / `--` literals → use `empty.*` with `.empty-hint`

| File | Section | New key |
|---|---|---|
| `PersonPanel.vue` | Names | `empty.names` |
| `PersonPanel.vue` | Groups | `empty.groups` |
| `PersonPanel.vue` | Research tasks | `empty.researchTasks` |
| `MediaPanel.vue` | Linked persons | `empty.persons` |
| `MediaPanel.vue` | Linked places | `empty.places` |
| `MediaPanel.vue` | Linked events | `empty.events` |
| `PlacePanel.vue` | Hierarchy | `empty.places` |

### Filter-empty variants → compose with `empty.withFilter`

| File | Current key | New composition |
|---|---|---|
| `RelationshipsView.vue` | `relationships.noMatchingFilter` | `empty.relationships` + `empty.withFilter` |
| `PlacesView.vue` | `places.noMatchingFilter` | `empty.places` + `empty.withFilter` |
| `QualityView.vue` (no results) | `quality.noResults` | `empty.qualityIssues` + `empty.withFilter` |

### Hardcoded Swedish → proper i18n

| File | Current | New |
|---|---|---|
| `VisualizationView.vue` | "Lägg till en person…" hardcoded | `visualization.empty` (already exists, just wire it up) |

## Migration order

1. Add `empty.*` keys (including `empty.withFilter`) to `src/renderer/i18n/sv.ts` and `en.ts`.
2. Replace callers in the tables above.
3. Replace `—` / `--` dash placeholders in PersonPanel, MediaPanel, PlacePanel with `.empty-hint` blocks using the new keys.
4. Wire `VisualizationView` hardcoded string to `visualization.empty`.
5. Rename `ansiktsmärk*` → `ansiktsmarkering*` across i18n, component headers, and a11y strings.
6. Remove orphaned keys from `sv.ts` / `en.ts` once no callers remain:
   - `events.noEvents`, `groups.noGroups`, `groups.emptyState`, `personDetail.noNames`, `personDetail.noRelationships`, `sourceDetail.noCitations`, `identifiers.none`, `media.noMedia`, `media.noFaceTags`, `mediaTimeline.empty`, `places.none`, `places.noPersons`, `places.noMatchingFilter`, `relationships.emptyState`, `relationships.noMatchingFilter`, `persons.emptyState`, `persons.emptyHint`, `sources.emptyState`, `researchTasks.noTasks`, `quality.noIssues`, `quality.noResults`, `duplicates.noDuplicates`, `linkRules.noRules`, `gazetteers.noGazetteers`, `database.noRecent`, `citations.none`, `map.empty`.

## Out of scope

- Reports empty placeholders (separate design question: should reports render empty placeholders at all?).
- Selection prompt keys (`panel.noPersonSelected`, `media.selectMedia`, etc.).
- Search empty states (`search.emptyState`, `search.noResults`).
- `AppEmptyState` component API changes.

## Testing

- Every empty-state site renders the expected Swedish and English string after the swap.
- Filter-empty variants produce the expected `<entity> + med detta filter` composition.
- WCAG tests (`tests/unit/wcagContrast.test.ts`) unaffected — `.empty-hint` already uses tokens.
- Manual pass through PersonPanel, MediaPanel, PlacePanel with a person/media/place that has no linked data, confirming no dashes remain.
