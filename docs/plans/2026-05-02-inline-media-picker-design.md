# Inline Media Picker across Entity Panels — Design

## 1. User goal

In every right-side entity panel that has a media section, attaching a photo means **one inline interaction**: type a few letters of an existing media item to link it, or click 📎 to upload a new file — without losing the context of the panel I'm looking at.

Never again "I can't reuse the photo of grandma I already imported because the only button opens a file dialog." Never again "the Group panel's media flow looks different from the Person panel's." All three section flavors expose the same picker shape.

## 2. Background — why this is purely UX

Our schema already supports "one media item linked to many entities" via the `media_links` join table (polymorphic `entity_type ∈ {person|event|relationship|place|source}`). Both GEDCOM 5.5.1 (pointer-style `OBJE` records) and GEDCOM-X (`SourceReference` arrays pointing at one shared `SourceDescription`) model it the same way.

The current `+ Attach` buttons on PersonPanel / PlacePanel / etc. **only call** `window.api.media.attach(...)`, which opens the OS file dialog and creates a new `media` row + a `media_links` row in one step. There is no inline path to add a *second* `media_links` row pointing at an existing `media` row. The capability exists in the data model and in the IPC layer (`media.addLink`); the UI just doesn't surface it.

This design closes that hole and unifies the picker shape across the six panels that host a media section.

## 3. Scope

**In scope (must migrate together):**

| Section component | Hosting panels | Current state |
|---|---|---|
| `PersonMediaSection` | PersonPanel | `+ Attach` opens OS file dialog only |
| `EntityMediaSection` | PlacePanel, RelationshipPanel, SourcePanel | `+ Attach` opens OS file dialog only |
| `LinkedMediaSection` | GroupPanel, ResearchTaskPanel | Already has inline `MediaPicker`; missing 📎 upload path |

**Scope deviations:** none. All three section flavors get the same `MediaAddRow` shape; all six hosting panels behave identically from the user's point of view after this change.

**Out of scope (explicit):**

- Merging `media` and `sources` into a unified GEDCOM-X `SourceDescription` table — separate, much bigger refactor.
- Switching the GEDCOM exporter from inline `OBJE` to pointer-style `OBJE` records — separate cleanup; no UI-visible change for this feature.
- Inline-editing media titles / notes from the panel — still routes to `/media`.
- The `mediaTimeline` section on PersonPanel / PlacePanel — its `+ Attach` triggers the same `attach()` exposed by the regular media section, so it inherits the new flow without any code change in the timeline section itself.
- Any change to how face-tagging / `media_regions` work.

## 4. Components & data flow

### 4a. Enhance `MediaPicker.vue`

Extend the existing autocomplete combobox with the file-upload path:

- **In-field 📎 icon** to the right of the input (before the clear `×`). Click → emit `attachFile` event with the current `searchQuery` as the suggested title. Always available, regardless of whether the dropdown is open or whether there are matches.
- **Dropdown footer item:** `📎 Attach file "<query>"…` (or `📎 Attach file…` when query is empty). Always shown when the dropdown is open. Click → emits the same `attachFile` event. Provides discoverability for the "I searched and got nothing" moment.
- **`excludeIds: string[]` prop:** filters `allMedia` so already-linked items don't show in this entity's picker. (Prevents silent double-linking — `media_links` has no UNIQUE constraint on `(media_id, entity_type, entity_id)`.)

Existing `update:modelValue` and `select` events stay as-is. New event signature:

```ts
emit: { 'attach-file': [suggestedTitle: string] }
```

A11y: the in-field icon needs a labelled `aria-label` (`media.attachFromFile`); the footer item is a `role="option"` like the rest of the dropdown options so keyboard navigation still works.

### 4b. Extract `MediaAddRow.vue` (new, small)

A single-purpose wrapper used by all three section flavors. Replaces the inline add-row markup currently inside `LinkedMediaSection`. Template (essentials):

```vue
<div class="add-row">
  <MediaPicker
    v-model="pickedId"
    :exclude-ids="excludeIds"
    @attach-file="onAttachFile"
  />
  <AppButton variant="primary" size="sm" :disabled="!pickedId" @click="commitExisting">
    {{ $t('common.add') }}
  </AppButton>
  <AppButton variant="ghost" size="sm" @click="cancel">
    {{ $t('common.cancel') }}
  </AppButton>
</div>
```

Props:

```ts
defineProps<{
  excludeIds?: string[];   // media ids already linked to this entity
}>()
```

Events:

```ts
emit: {
  committed: [{ mediaId: string }];
  cancelled: [];
}
```

Internal behavior:

- `commitExisting()` — emit `committed` with the picker's selected `mediaId`. Caller decides whether to call `media.addLink` (Person/Place/Relationship/Source) or `groups.addLink` / `tasks.addLink` (Group/ResearchTask).
- `onAttachFile(suggestedTitle)` — call `window.api.media.createFromFile({ suggestedTitle })` (new IPC; see §4d). On a non-cancelled result, emit `committed` with the new `mediaId`. On cancel, leave the row open.

### 4c. Wire each section

- **`PersonMediaSection` and `EntityMediaSection`** — add `showAddRow = ref(false)`. The parent panel keeps calling `mediaSectionRef.value?.attach()` from the section header's `+ Attach` action; that exposed `attach()` now flips `showAddRow = true` and focuses the picker, instead of opening the file dialog directly.

  When `showAddRow` is true, render `<MediaAddRow :exclude-ids="media.map(m => m.id)" @committed="onCommitted" @cancelled="showAddRow = false" />` above the table. `onCommitted({ mediaId })`:

  ```ts
  await window.api.media.addLink({
    media_id: mediaId,
    entity_type: props.entityType,    // or 'person' for PersonMediaSection
    entity_id: props.entityId,        // or props.personId
  });
  showAddRow.value = false;
  await reload();
  ```

- **`LinkedMediaSection`** — its existing inline picker markup is removed in favor of `<MediaAddRow>`. The parent panel (`GroupPanel` / `ResearchTaskPanel`) already owns the link-table call (`groups.addLink` / `tasks.addLink`); it just receives the `committed` event from the wrapper now and passes the `mediaId` through.

### 4d. IPC additions

Add one new media IPC alongside the existing surface:

- `media.createFromFile({ suggestedTitle?: string })`
  → opens the OS dialog, copies the picked file into `<dbname>-media/` (per [.claude/rules/media.md](.claude/rules/media.md)), creates the `media` row with `title = suggestedTitle ?? filename-without-extension`, and returns `{ id: string; canceled: boolean }`.
  → **Does NOT create any `media_links` / `group_links` / `task_links` row.** That responsibility is the caller's (`MediaAddRow`'s consumer).

The existing `media.attach({ entityType, entityId })` stays — it's still useful for drag-and-drop and other "create + link in one shot" callers. The three section flavors migrate to `media.createFromFile` + the appropriate `addLink` call.

Why split: `media.attach` couples "create media" with "create the link to *this specific* entity." The three section flavors write to three different link tables, so collapsing both steps inside the IPC forces `MediaAddRow` to know which link table to use. The split keeps `MediaAddRow` ignorant of link semantics — exactly the property that makes it reusable across all three flavors.

## 5. Key behaviors

- **Profile-pic semantics unchanged.** Appending an existing media via the picker creates a new `media_links` row at the end of `sort_order`. The PersonMediaSection star button still promotes any row to slot 0. New file uploads also land at the end (current behavior).
- **Already-linked filter.** `excludeIds = media.value.map(m => m.id)` is recomputed on every reload. A photo already attached to grandma doesn't appear in grandma's panel picker. It still appears in grandpa's panel picker (sharing is the whole point).
- **Single-add per reveal.** Committing closes the add-row. To attach a second item, click `+ Attach` again. Matches the existing `LinkedMediaSection` behavior; avoids "did I save? what's the state?" ambiguity.
- **Empty library.** When `media.list()` returns `[]` (fresh DB), the dropdown shows only the footer "📎 Attach file…" item; the in-field icon also works. No misleading "no results" empty state.
- **Title prefill on file upload.** If the user typed `Grandma 1942` and then clicked 📎 (or the dropdown footer), `suggestedTitle = "Grandma 1942"`. The OS dialog still picks the file; `media.title` is set to the prefill. If query is empty, title falls back to filename-without-extension (current `media.attach` behavior).
- **Read-only mode unchanged.** When the panel is `:readonly="true"`, the section header doesn't render its `+ Attach` action; `MediaAddRow` is never instantiated.
- **Cross-view reactivity unchanged.** Add operations call `mutating()`-wrapped IPCs (`media.addLink`, `media.createFromFile`), which fan out to `onDataChanged` listeners. List/chart/map auto-refresh continues to work via `useEntityData` / `usePagedList`.

## 6. New i18n keys

Add to both `src/renderer/i18n/sv.ts` and `src/renderer/i18n/en.ts`:

| Key | English | Swedish |
|---|---|---|
| `media.attachFromFile` | Attach file… | Bifoga fil… |
| `media.attachFromFileWithQuery` | Attach file "{query}"… | Bifoga fil "{query}"… |
| `media.alreadyAttached` | Already attached to this {entityType} | Redan kopplat till denna {entityType} |

(`alreadyAttached` is reserved as an a11y hint in case we ever switch from filtering to greying out already-linked rows. Not used in v1.)

## 7. Failure modes / RCA reference

The panel-composables refactor (v0.190.0–v0.190.2) shipped half-consistent panels because the plan was scoped at the wrong granularity ("the 6 entity panels") without enumerating that those 6 panels actually use 3 different section components. This design avoids that trap by enumerating the three section flavors in §3 and verifying the user-observable outcome (§8 items 1 and 7) rather than just "tests pass."

The plan must remember: when migrating, don't refactor PersonMediaSection's profile-pic logic, don't unify the three section flavors into one. Those are separate concerns — the picker change rides on top of whatever section flavor is already there.

## 8. Verification

User-observable outcomes the plan must prove, not the structure:

1. **All 6 panels look identical.** Open `/persons/:id`, `/places/:id`, `/relationships/:id`, `/sources/:id`, `/groups/:id`, `/research-tasks/:id` in the running app. Click `+ Attach` in the media section on each; the same inline `[picker | Add | Cancel]` row appears with the same visual shape.
2. **Pick existing — cross-entity sharing (smoke).** In PersonPanel A, click `+ Attach`, click 📎, upload a photo. Open PersonPanel B, click `+ Attach`, type the photo's title, select it, click Add. Both persons' media tables show the same image; both load thumbnails; deleting the link from B leaves it intact on A.
3. **Pick existing works in all six.** Repeat the existing-pick path on Place, Source, Relationship, Group, ResearchTask. Picker dropdown lists existing media; selection works; link is added.
4. **File upload via in-field 📎 (smoke).** In any panel, click `+ Attach`, click 📎 in the picker input, choose a file. New media row appears at end of the list with the chosen filename as title.
5. **File upload via dropdown footer (smoke).** In any panel, click `+ Attach`, type "Brand New Title" (no match), click `📎 Attach file "Brand New Title"…`, choose a file. New media row appears with `title = "Brand New Title"`.
6. **Already-linked filter.** In PersonPanel, attach photo X. Click `+ Attach` again and search for X — confirm X does **not** appear in the dropdown. Open a different person's panel — confirm X **does** appear.
7. **Component-consistency test** at `tests/components/media-picker-add-row-consistency.test.ts`: mount each of the three section flavors (`PersonMediaSection`, `EntityMediaSection`, `LinkedMediaSection`) with `readonly=false`, trigger the exposed reveal action, assert a `MediaAddRow` is rendered with `MediaPicker` inside it. Catches half-migrations.
8. **GEDCOM round-trip unchanged.** Existing exporter/importer media tests stay green; this design touches no GEDCOM code.

Lint + the unit suite passing is hygiene, not user-goal verification. Items 1–6 are the user-observable proof and must be exercised in the running app before the plan closes.
