# Narration coverage migration — design

## Problem

The Släktforskning app has two read-aloud systems:

- **Narrate mode (TTS)** via `v-narrate` directive (writes to `narrationMap` WeakMap; `resolveNarration` reads from there with fallback to `data-narrate` → `aria-label` → visible text).
- **Screen Reader mode** via `useScreenReaderMode` composable (singleton module-level state; once enabled in Settings, tracks focus globally — not per-view).

Coverage gaps remaining after the appearance audit (only systemic gap left after entity-color theming and the small-fixes commit `afd0a37`):

- `narration.ts` has builders for Person/Relationship/Source only. Missing: Media, Place, Event, Citation.
- Three pickers (`SourcePicker`, `GroupPicker`, `MediaPicker`) have no `v-narrate` on their option rows. PersonPicker + PlacePicker do.
- The 12 modals in `src/renderer/components/modals/` have no header narration enrichment — they fall back to visible text, which yields generic strings like "Person — Add new" instead of an entity-aware announcement.
- `MediaViewer` is the most visual / least naturally accessible surface in the app: the `<img>` itself, the caption, and the face-tag regions are not focusable or narrated.

The primary persona for this work is the user's beta tester Bengt (limited vision). Narration text must be terse but informative, in Swedish first.

## Goal

Bring picker, modal-header, and media-viewer narration up to the same standard the rest of the app meets, so a TTS or screen-reader user can:

- Hear a rich description of each option as they tab through any picker dropdown.
- Hear "[Entity] modal: [Title]" when a modal opens or the header is focused.
- Reach and hear the image, caption, and each face tag inside MediaViewer.

## Decisions (from brainstorming)

| # | Question | Decision |
|---|----------|----------|
| Q1 | Scope | **Outside-in.** Pickers + MediaViewer (high-yield: surfaces with no `<label>` fallback) + modal *headers* only. Per-input narration in modals deferred — `<label>` elements already work for screen readers. |
| Q2 | Picker pattern | Match `PersonPicker` — `v-narrate="narrateX(item)"` on each option row. |
| Q3 | MediaViewer specifics | Image, caption, and face-tag regions all become focusable and narrate. Prev/next arrows already have aria-labels (commit `afd0a37`); no change needed. |
| Q4 | New builders | Four: `narrateMedia`, `narratePlace`, `narrateEvent`, `narrateCitation`. Same shape as `narratePerson` (data object + labels → string). |
| Q5 | Screen-reader activation | No change needed. The composable is a global singleton; once Settings → Read aloud → Screen Reader is on, it tracks focus everywhere — modals included. |
| Q6 | i18n namespace | Extend the existing `narration.*` namespace. New sub-keys: `narration.media.*`, `narration.place.*`, `narration.event.*`, `narration.citation.*`, `narration.modal.header`, `narration.faceTag.untagged`. |

## Out of scope

- Per-input narration inside modals. Browser screen readers handle `<label>`-input association natively; spending time here is low-yield versus pickers/MediaViewer.
- Builders for Identifier, LinkRule, Group-as-entity, Citation-as-standalone-entity (only added when a future surface needs them).
- Hotkey activation inside modals. Mode is global; nothing to activate per-modal.
- Modifying `useScreenReaderMode` itself. Existing behavior is correct.
- ARIA-label sweep on icon-only buttons — done in commit `afd0a37`.

## `narration.ts` additions

Four new builders in `src/renderer/utils/narration.ts`. Each takes a typed data object plus the existing `NarrationLabels` (extended with the new keys) and returns a single string. Pure functions; unit-testable.

```ts
export interface MediaNarration {
  title: string;
  format?: string;             // 'jpg', 'pdf', etc. — read as "Photo" / "Document"
  taggedPersonNames?: string[];
  inferredDate?: string;
  notes?: string;
}
export function narrateMedia(data: MediaNarration, labels: NarrationLabels): string;

export interface PlaceNarration {
  name: string;
  type?: string;               // 'parish', 'city', 'country', etc.
  parentPath?: string;         // "Älghult, Kronoberg, Sweden"
  eventCount?: number;
}
export function narratePlace(data: PlaceNarration, labels: NarrationLabels): string;

export interface EventNarration {
  type: string;                // i18n-resolved event type label
  date?: string;               // already formatted
  place?: string;
  primaryPersonName?: string;
}
export function narrateEvent(data: EventNarration, labels: NarrationLabels): string;

export interface CitationNarration {
  sourceTitle: string;
  page?: string;
  confidence?: number;         // 0-3, mapped to confidence label
  attachedToLabel?: string;    // "for Karl Andersson's birth"
}
export function narrateCitation(data: CitationNarration, labels: NarrationLabels): string;
```

Example output (English):
- Media: `"Karl och Anna 1923. Photo. Tagged: Karl Andersson, Anna Berg. Taken about 1923."`
- Place: `"Älghult parish in Kronoberg, Sweden. 47 events recorded."`
- Event: `"Birth of Karl Andersson on 12 March 1850 in Stockholm."`
- Citation: `"Stockholms domkyrkoförsamling födelsebok 1850–1859, page 47. Confidence: primary. For Karl Andersson's birth."`

`NarrationLabels` interface extends to include new label keys (about 12 new fields). Existing `narrationLabelsFromI18n(t)` helper extends accordingly.

## i18n additions

New keys in both `sv.ts` and `en.ts` under the existing `narration.*` namespace. Approximate count: 25 keys.

```
narration.modal.header                    "{entity} modal: {title}"
narration.media.photo                     "Photo"
narration.media.document                  "Document"
narration.media.tagged                    "Tagged"
narration.media.taken                     "Taken"
narration.media.about                     "about"
narration.place.eventsRecorded            "events recorded"
narration.place.in                        "in"
narration.event.of                        "of"
narration.event.on                        "on"
narration.event.in                        "in"
narration.citation.page                   "page"
narration.citation.confidence             "Confidence"
narration.citation.confidenceLevels.0..3  "unreliable" | "questionable" | "secondary" | "primary"
narration.citation.for                    "For"
narration.faceTag.untagged                "Untagged person"
```

Translations in Swedish follow Bengt's preferred terse-but-clear register (e.g., `narration.modal.header: '{entity}-dialog: {title}'`).

## Picker changes

Three components, each ~3 LOC change:

**`SourcePicker.vue`** — option row gets `v-narrate="() => narrateSource({ title: src.title, author: src.author, citationCount: src.citationCount ?? 0 }, labels)"`.

**`GroupPicker.vue`** — option row gets `v-narrate="g.name + (g.memberCount ? ' — ' + g.memberCount + ' members' : '')"` (no builder needed; group has no rich shape).

**`MediaPicker.vue`** — option row gets `v-narrate="() => narrateMedia({ title: m.title || $t('media.untitled'), format: m.format }, labels)"`.

Each picker imports `narrationLabelsFromI18n` once and computes `labels` in setup. Pattern is mechanical.

## Modal header narration

`BaseSubPanel.vue` — add `v-narrate="headerNarration"` on the `.ep-header` element. `headerNarration` is a computed function:

```ts
const headerNarration = computed(() => {
  const entity = t(meta.value.labelKey);
  return t('narration.modal.header', { entity, title: props.title });
});
```

Re-runs when `props.title` or `props.entityType` changes. Replaces the fallback "Person — Add new" with "Person modal: Add new" or, in Swedish, "Person-dialog: Lägg till ny".

## MediaViewer changes

Three components touched.

**`MediaViewer.vue`** — the `<img>` element gets `tabindex="0"` and `v-narrate="() => narrateMedia(currentMediaSummary, labels)"`. `currentMediaSummary` is a computed object built from `currentItem` + the live face-tag list. When the user navigates with prev/next, the focused image re-narrates because v-narrate uses a function.

**`MediaCaption.vue`** — root element gets `tabindex="0"` + `v-narrate="captionPlainText"`. `captionPlainText` is a computed string built from the existing face-tag/notes data — same content the visual caption shows, just flattened to one string for the narration directive.

**`FaceTagOverlay.vue`** — each `.face-tag-region` SVG element gets `tabindex="0"`, `role="button"`, and `v-narrate="r.personName ?? t('narration.faceTag.untagged')"`. They were not focusable before. Tab order follows region creation order, which matches the visual top-left-to-bottom-right reading order.

## Testing

`tests/unit/narration.test.ts` exists (82 lines, covering `narratePerson` / `narrateRelationship` / `narrateSource`). Extend with four new `describe` blocks — one per new builder. Each block has 2–3 test cases:

- Minimal data (just the required fields)
- Full data (every optional field present)
- One edge case (e.g., zero events for Place, no notes for Media)

~10 new test cases total. No browser tests; the `v-narrate` directive is already covered indirectly by the directive's own tests.

i18n parity test (already exists in the project) catches sv.ts/en.ts key drift automatically.

## Files changed

| File | Change |
|------|--------|
| `src/renderer/utils/narration.ts` | +~80 LOC: 4 new interfaces + 4 new builder functions + extended `NarrationLabels` + extended `narrationLabelsFromI18n`. |
| `src/renderer/i18n/sv.ts` | +~25 keys under `narration.*` |
| `src/renderer/i18n/en.ts` | +~25 keys under `narration.*` (must mirror sv.ts) |
| `src/renderer/components/SourcePicker.vue` | +1 v-narrate on option row, +1 import |
| `src/renderer/components/GroupPicker.vue` | +1 v-narrate on option row |
| `src/renderer/components/MediaPicker.vue` | +1 v-narrate on option row, +1 import |
| `src/renderer/components/modals/BaseSubPanel.vue` | +1 computed `headerNarration` + v-narrate on `.ep-header` |
| `src/renderer/components/MediaViewer.vue` | +tabindex + v-narrate on `<img>` + currentMediaSummary computed |
| `src/renderer/components/MediaCaption.vue` | +tabindex + v-narrate on root + captionPlainText computed |
| `src/renderer/components/FaceTagOverlay.vue` | +tabindex + role + v-narrate on each region |
| `tests/unit/narration.test.ts` | +4 describe blocks, ~10 new cases |

## Acceptance

- `npm run lint` — 0 errors (7 pre-existing warnings allowed).
- `npx vitest run tests/unit/narration.test.ts` — all existing + new cases pass.
- `npx vitest run tests/unit/wcagContrast.test.ts` — still 280/280 (no regression).
- sv.ts / en.ts key parity test still passes.
- Manual smoke (Settings → Read aloud → Narrate, then optionally → Screen Reader):
  - Tab through SourcePicker dropdown — each source title + author + citation count is announced.
  - Open one of each modal type — header announces `"<Entity> modal: <Title>"` (e.g. `"Person modal: Add new"`).
  - In MediaViewer, tab reaches the image (announces title + format + tagged people), then the caption (full caption text), then each face tag (person name or "Untagged person").
  - No regressions in PersonPicker / PlacePicker / Person/Relationship/Source narration.
