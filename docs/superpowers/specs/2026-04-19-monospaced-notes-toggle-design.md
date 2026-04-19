# Monospaced Notes Toggle — Design

**Date:** 2026-04-19
**Status:** Approved, awaiting implementation plan

## Problem

Imported genealogy notes frequently contain ASCII-aligned content — simple tables, family charts, indented lists — that loses its structure when rendered in a proportional font. Users need a way to flip any notes field to a monospaced font so aligned text renders correctly.

## Scope

Applies to the five "strong-fit" notes locations (long-form, imported free text likely to contain tables):

1. **Person notes** — `PersonNotesSection.vue`, used by `PersonDetailsSection.vue` in both `PersonDetailView` and `PersonPanel`.
2. **Relationship notes** — `RelationshipDetailView.vue`.
3. **Place notes** — `PlaceDetailView.vue` and `PlacePanel.vue`.
4. **Group notes** — `GroupDetailView.vue`.
5. **Media notes** — `MediaView.vue` and `MediaPanel.vue`.

**Out of scope:**
- Small 2-row fields (citation notes, research-task notes, event description) — rarely contain tables, adding toggles clutters the UI.
- Report renderings (`IndividualSummary`, `PersonBiography`, `AncestorBookReport`, `FamilyGroupSheet`) — these are export/print artifacts, not interactive.

## Behavior

- A single toggle per notes type. All person-notes across the app share one setting; all place-notes share another; etc.
- Toggle state is persisted in `localStorage`, not in SQLite. This is a view preference, not real data — same rationale as the existing TTS toggle (`slaktforskning-tts`).
- Keys: `slaktforskning-monospace-notes-person`, `…-relationship`, `…-place`, `…-group`, `…-media`. Values: `"true"` / `"false"`.
- Default: off.
- State loads synchronously on mount (inside the composable's setup) so the textarea never flashes from proportional → monospace on first paint.
- When on, the textarea's `font-family` becomes `var(--font-mono)`. Line height and size stay on the existing tokens.

## UI

A small toggle button in the existing notes heading row, right-aligned:

```
Notes                                           [</> Monospaced]
────────────────────────────────────────────────────────────────
[textarea content]
```

- Component: `AppButton variant="ghost" size="sm"`.
- Content: a `</>` glyph followed by the localized label. **Icon + label**, not icon-only — beta tester Bengt has limited vision and needs clear labels.
- **The label itself is rendered in the monospaced font**, so users who don't know the word immediately see what "monospaced" means. Apply `font-family: var(--font-mono)` to the button's text (but not the `</>` glyph, which already reads as code).
- Accessibility: `aria-pressed="true" | "false"` reflects current state. Tooltip (`title` attribute) explains the purpose.
- Layout: heading row uses `display: flex; align-items: center; justify-content: space-between;` so the button sits on the same baseline as the heading.

## Implementation

### Composable

```ts
// src/renderer/composables/useMonospacedNotes.ts
import { ref, watch } from 'vue';

type NotesEntityType = 'person' | 'relationship' | 'place' | 'group' | 'media';

export function useMonospacedNotes(entityType: NotesEntityType) {
  const storageKey = `slaktforskning-monospace-notes-${entityType}`;
  const monospaced = ref(localStorage.getItem(storageKey) === 'true');

  watch(monospaced, (value) => {
    localStorage.setItem(storageKey, String(value));
  });

  function toggle() {
    monospaced.value = !monospaced.value;
  }

  return { monospaced, toggle };
}
```

### Why a composable, not a shared wrapper component

The five locations have different heading markup (`<label>` wrapping the textarea in `PersonDetailsSection`, `<h4>` standalone in `PlaceDetailView`, inline `<div>` in `PlacePanel`, etc.) and different DOM structures around the textarea. A wrapper component would have to take heading text, slots, and a textarea slot — and would still fight the existing layout in each view. A composable drops in without restructuring: each view keeps its own markup and adds the button + class binding where they fit.

### CSS

A new token `--font-mono` is added to `src/renderer/styles/tokens.css` (it does not currently exist):

```css
--font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
```

Two classes added to `src/renderer/styles/shared.css`:

```css
.notes-mono {
  font-family: var(--font-mono);
}

.toggle-label-mono {
  font-family: var(--font-mono);
}
```

`.toggle-label-mono` is applied to the label text of the toggle button itself (but not the `</>` glyph) so the label visually demonstrates its effect.

### Per-view integration

Each of the 5 locations:

```vue
<script setup lang="ts">
import { useMonospacedNotes } from '../composables/useMonospacedNotes';
const { monospaced, toggle } = useMonospacedNotes('person'); // or 'place', etc.
</script>

<template>
  <div class="notes-heading-row">
    <h4>{{ $t('common.notes') }}</h4>
    <AppButton
      variant="ghost"
      size="sm"
      @click="toggle"
      :aria-pressed="monospaced"
      :title="$t('common.monospacedTooltip')"
    >
      &lt;/&gt; <span class="toggle-label-mono">{{ $t('common.monospaced') }}</span>
    </AppButton>
  </div>
  <textarea :class="{ 'notes-mono': monospaced }" ... />
</template>

<style scoped>
.notes-heading-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}
</style>
```

Note the Person case: the heading is currently inside `PersonDetailsSection.vue` (which owns the `<label>` around `<PersonNotesSection>`). The toggle goes there, but the monospaced class must reach the textarea inside `PersonNotesSection`. Two viable approaches:

- **(A)** Pass `monospaced` as a prop from `PersonDetailsSection` down to `PersonNotesSection`, which applies the class on its textarea.
- **(B)** Move the composable call into `PersonNotesSection`, and have `PersonDetailsSection` pass a ref or use a shared symbol — clumsier.

Pick **(A)**. `PersonNotesSection` accepts a new optional `monospaced: boolean` prop (default `false`) and applies `:class="{ 'notes-mono': monospaced }"` on its textarea.

### i18n keys

Add to both `src/renderer/i18n/sv.ts` and `src/renderer/i18n/en.ts` under `common`:

| Key | English | Swedish |
|-----|---------|---------|
| `common.monospaced` | `Monospaced` | `Fast bredd` |
| `common.monospacedTooltip` | `Show notes in monospaced font for ASCII tables and aligned text` | `Visa anteckningar med fast bredd för ASCII-tabeller och justerad text` |

## Files touched

**New:**
- `src/renderer/composables/useMonospacedNotes.ts`

**Modified:**
- `src/renderer/styles/tokens.css` (+1 token: `--font-mono`)
- `src/renderer/styles/shared.css` (+2 classes: `.notes-mono`, `.toggle-label-mono`)
- `src/renderer/i18n/sv.ts`, `src/renderer/i18n/en.ts` (+2 keys each)
- `src/renderer/components/PersonNotesSection.vue` (add `monospaced` prop, apply class)
- `src/renderer/components/PersonDetailsSection.vue` (add heading row with toggle, pass prop)
- `src/renderer/views/RelationshipDetailView.vue` (add heading row + toggle, class on textarea)
- `src/renderer/views/PlaceDetailView.vue` (add toggle to existing `<h4>` row, class on textarea)
- `src/renderer/components/PlacePanel.vue` (add toggle to notes section label row, class on textarea)
- `src/renderer/views/GroupDetailView.vue` (add heading row + toggle, class on textarea)
- `src/renderer/views/MediaView.vue` (add toggle near media notes heading, class on textarea)
- `src/renderer/components/MediaPanel.vue` (add toggle in notes section, class on textarea)

**Total:** 1 new composable + 1 new CSS token + 2 CSS classes + 2 i18n keys × 2 locales + 9 file edits across 5 entity types.

## Testing

- Unit tests for `useMonospacedNotes`: initial state from empty localStorage (false), initial state from `"true"`, toggle flips state and writes to localStorage.
- Manual verification per entity type: toggle persists across reload, independent between types (flipping person-notes doesn't affect place-notes), aria-pressed reflects state, font changes on toggle.

## Version

Bump minor when complete: feature addition. Current `package.json` version + 0.1.0.
