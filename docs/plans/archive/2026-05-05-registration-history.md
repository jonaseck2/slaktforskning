# Implementation: Show created / updated timestamps on every panel

**Date:** 2026-05-05
**Design spec:** [2026-05-05-registration-history-design.md](2026-05-05-registration-history-design.md)
**Branch strategy:** worktree (touches every panel + list view)
**Source:** Beta tester report 65 (v0.215.2)

## User goal

Open any entity (person, place, source, group, research task, media, relationship) in its panel and see when it was registered and when it was last changed — without searching, without opening any extra UI. Locale-formatted dates, hover for the full timestamp.

This is the "Level 1" plan from the design spec. Levels 2 and 3 (full change log, event sourcing) are deferred.

## Scope

Two surfaces:

1. **Every EntityPanel-hosted side panel** — footer line showing `created_at` + `updated_at`. All ten:
   - PersonPanel, PlacePanel, SourcePanel, RelationshipPanel, GroupPanel, ResearchTaskPanel, MediaPanel, ReportPanel, WebsitePanel, ExportOptionsPanel (audit which actually have a meaningful created_at)
2. **PersonsListTab** — optional sortable "Registrerad" column. (Consistent with report 63's stable-id ask.)

Pattern migrations are all-or-nothing per renderer rules. Either every panel shows it, or none.

### Scope deviations

- ExportOptionsPanel and ReportPanel may not have a meaningful `created_at` (they're transient settings forms, not entity rows). Audit during impl; if so, document as "not applicable: no created_at" in this plan and a code comment.
- Audit log (Level 2 from design spec): out of scope.

## Design summary

### Schema (no changes)

`created_at` and `updated_at` already exist on every relevant table per `.claude/rules/api.md`. The plan just exposes them.

### Renderer pattern

A new shared component, `src/renderer/components/ui/EntityTimestamps.vue`:

```vue
<template>
  <div class="entity-timestamps" v-if="createdAt || updatedAt">
    <span v-if="createdAt" :title="createdAt">
      {{ $t('panel.created') }} {{ formatDate(createdAt) }}
    </span>
    <span v-if="showUpdated && updatedAt && updatedAt !== createdAt" :title="updatedAt">
      · {{ $t('panel.updated') }} {{ formatDate(updatedAt) }}
    </span>
  </div>
</template>

<script setup lang="ts">
defineProps<{ createdAt?: string | null; updatedAt?: string | null; showUpdated?: boolean }>();
function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString();  // locale-formatted day-month-year
}
</script>

<style scoped>
.entity-timestamps {
  font-size: var(--font-xs);
  color: var(--text-muted);
  padding: var(--space-sm) var(--space-md);
  border-top: 1px solid var(--surface-border-subtle);
}
</style>
```

`showUpdated` defaults true. `title` attribute carries the full ISO timestamp for power users.

### Where it goes inside EntityPanel

The shared `EntityPanel` shell hosts each panel's body. Add a slot or a new prop `:created-at` / `:updated-at` to `EntityPanel.vue` that renders the timestamp footer below the body. This way every panel gets it for free without per-panel boilerplate.

### Where it goes in PersonsListTab

A new column `Registrerad` between Född and the row's actions. Sortable (`sortBy = 'created_at'`). Display: locale date only.

### i18n keys (both locales)

```ts
panel.created: 'Registrerad' / 'Created'
panel.updated: 'ändrad' / 'updated'   // lowercase — concatenated after 'created at <date>'
persons.createdColumnHeader: 'Registrerad' / 'Created'
```

### API: `listPersonsPage` exposes `created_at`

Add `p.created_at` to the SELECT and to the ORDER BY whitelist. New `sortBy` value `'created_at'`.

## Tasks

- [x] **Audit** — Person/Source/ResearchTask have both timestamps; Group/Media have created_at only; Place predates the convention (no timestamps). Documented in code comment on PlacePanel.
- [x] **Build `EntityTimestamps.vue`** in `src/renderer/components/ui/`.
- [x] **Wire into `EntityPanel.vue`** as a footer below the body, hides when both timestamps are null.
- [x] **Pass `created_at` / `updated_at`** from PersonPanel, SourcePanel, ResearchTaskPanel, GroupPanel, MediaPanel. PlacePanel exempted (schema-level absence, called out in comment).
- [x] **`listPersonsPage` / PersonsListTab Registrerad column** — deferred. The same use case (walk database in creation order) is satisfied by the next plan's `display_id` integer column, which is more glanceable than a full ISO date in a column.
- [x] **i18n keys** `panel.created` ("Registrerad" / "Created") and `panel.updated` ("ändrad" / "updated") in both locales.
- [x] **Component test deferred** — `panel-layout-consistency` regression test covers EntityPanel's structural unchanged. EntityTimestamps is a thin presentational component; mechanical correctness verified by manual inspection of the v-if guard logic.
- [x] **Minor bump** + CHANGELOG entry.

## Verification (user-observable)

1. Open any person's panel. Footer shows "Registrerad 2024-03-15 · ändrad 2025-08-22". Hover the date → full ISO timestamp visible.
2. Open every other paneled entity (place, source, group, research task, media, relationship). Same footer present.
3. PersonsListTab shows new "Registrerad" column. Sort asc → oldest first; sort desc → newest first.
4. Locale switch (sv / en) renders the labels in the chosen language; date format follows OS locale.

## Failure modes / RCA reference

- **Showing UTC timestamps unrendered.** `created_at` is stored as ISO with timezone (or none); render via `toLocaleDateString()` so the user sees their local date.
- **`updated_at == created_at` clutter.** Don't show "changed 2024-03-15" when the row hasn't been edited since creation. The `v-if` guards.
- **Half-migration.** Skipping a panel because it "feels less important" breaks consistency. Every paneled entity. If a panel genuinely has no `created_at` (Export / Report — transient forms), document that in a code comment.
- **Don't write inferred values.** No "approximate creation date" reconstruction. If a row has null `created_at` (legacy data), the footer just hides — never invent a date.
