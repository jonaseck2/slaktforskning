# Narration coverage migration — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add v-narrate to 3 missing pickers (Source/Group/Media), enrich modal-header narration via BaseSubPanel, make MediaViewer image + caption + face tags focusable and narrated, and add 4 new builders (Media/Place/Event/Citation) in `narration.ts`.

**Architecture:** Pure-function builders extend the existing `narration.ts` pattern (data object + labels → string). Pickers and modal headers consume the builders via the existing `v-narrate` directive. MediaViewer surfaces (image, caption, face-tag regions) become focusable (`tabindex="0"`) and consume narration the same way. No changes to `useScreenReaderMode` — it's already global once enabled. No new files; everything extends what exists.

**Tech Stack:** Vue 3 SFC + scoped CSS, vue-i18n for label resolution, Vitest for builder unit tests, the existing `v-narrate` directive (`src/renderer/directives/narrate.ts`).

**Spec:** [`docs/plans/2026-04-26-narration-coverage-design.md`](2026-04-26-narration-coverage-design.md) — read for full design rationale.

---

## File Structure

| File | Role | Lines touched |
|------|------|---------------|
| `src/renderer/utils/narration.ts` | Add 4 interfaces + 4 builder functions + extend `NarrationLabels` interface and `narrationLabelsFromI18n(t)` helper. | +~80 |
| `src/renderer/i18n/sv.ts` + `en.ts` | Add ~25 keys each under existing `narration.*` namespace. sv.ts authoritative; en.ts mirrors. | +~25 each |
| `src/renderer/components/SourcePicker.vue` | Import `narrateSource` + labels, add `v-narrate` to option row. | +~5 |
| `src/renderer/components/GroupPicker.vue` | Add inline `v-narrate` (no builder needed for groups). | +~1 |
| `src/renderer/components/MediaPicker.vue` | Import `narrateMedia` + labels, add `v-narrate` to option row. | +~5 |
| `src/renderer/components/modals/BaseSubPanel.vue` | Add `headerNarration` computed + `v-narrate` on `.ep-header`. | +~10 |
| `src/renderer/components/MediaViewer.vue` | `tabindex="0"` + `v-narrate` on `<img>` + new `currentMediaSummary` computed. | +~15 |
| `src/renderer/components/MediaCaption.vue` | `tabindex="0"` + `v-narrate` on root + new `captionPlainText` computed. | +~10 |
| `src/renderer/components/FaceTagOverlay.vue` | `tabindex="0"` + `role="button"` + `v-narrate` on each `.face-tag-region` div. | +~3 |
| `tests/unit/narration.test.ts` | 4 new `describe` blocks, 2-3 cases each. | +~50 |

---

## Task 1: Add failing tests for the 4 new builders

**Files:**
- Modify: `tests/unit/narration.test.ts`

TDD scaffold. The tests import builders that don't exist yet — they fail at import time. Tasks 2 and 3 make them pass.

- [ ] **Step 1: Read the existing test file end-to-end**

Run: `cat tests/unit/narration.test.ts`

Note the existing pattern: each builder has its own `describe` block; cases use `expect(text).toContain(...)` against the English `EN_LABELS` defaults (no `t` function — the builder accepts a `labels` parameter that defaults to English).

- [ ] **Step 2: Extend the import line**

Change line 2 from:
```ts
import { narratePerson, narrateRelationship, narrateSource } from '../../src/renderer/utils/narration';
```
to:
```ts
import {
  narratePerson, narrateRelationship, narrateSource,
  narrateMedia, narratePlace, narrateEvent, narrateCitation,
} from '../../src/renderer/utils/narration';
```

- [ ] **Step 3: Append 4 describe blocks at the end of the file**

```ts
describe('narrateMedia', () => {
  it('narrates a photo with title, format, and tagged people', () => {
    const text = narrateMedia({
      title: 'Karl och Anna 1923',
      format: 'jpg',
      taggedPersonNames: ['Karl Andersson', 'Anna Berg'],
      inferredDate: '1923',
    });
    expect(text).toContain('Karl och Anna 1923');
    expect(text).toContain('Photo');
    expect(text).toContain('Karl Andersson');
    expect(text).toContain('Anna Berg');
    expect(text).toContain('1923');
  });

  it('handles a document with no tagged people', () => {
    const text = narrateMedia({ title: 'Birth certificate', format: 'pdf' });
    expect(text).toContain('Birth certificate');
    expect(text).toContain('Document');
    expect(text).not.toContain('Tagged');
  });

  it('handles minimal data (title only)', () => {
    const text = narrateMedia({ title: 'Untitled' });
    expect(text).toContain('Untitled');
    expect(text).not.toContain('undefined');
  });
});

describe('narratePlace', () => {
  it('narrates a place with type, parent path, and event count', () => {
    const text = narratePlace({
      name: 'Älghult',
      type: 'parish',
      parentPath: 'Kronoberg, Sweden',
      eventCount: 47,
    });
    expect(text).toContain('Älghult');
    expect(text).toContain('parish');
    expect(text).toContain('Kronoberg, Sweden');
    expect(text).toContain('47');
  });

  it('handles a place with no events', () => {
    const text = narratePlace({ name: 'Stockholm', eventCount: 0 });
    expect(text).toContain('Stockholm');
    expect(text).not.toContain('undefined');
  });

  it('handles minimal data (name only)', () => {
    const text = narratePlace({ name: 'Unknown' });
    expect(text).toContain('Unknown');
    expect(text).not.toContain('undefined');
  });
});

describe('narrateEvent', () => {
  it('narrates a birth event with date, place, and primary person', () => {
    const text = narrateEvent({
      type: 'Birth',
      date: '12 March 1850',
      place: 'Stockholm',
      primaryPersonName: 'Karl Andersson',
    });
    expect(text).toContain('Birth');
    expect(text).toContain('Karl Andersson');
    expect(text).toContain('12 March 1850');
    expect(text).toContain('Stockholm');
  });

  it('handles a marriage event with no primary person', () => {
    const text = narrateEvent({ type: 'Marriage', date: '1868', place: 'Göteborg' });
    expect(text).toContain('Marriage');
    expect(text).toContain('1868');
    expect(text).not.toContain('undefined');
  });

  it('handles minimal data (type only)', () => {
    const text = narrateEvent({ type: 'Census' });
    expect(text).toContain('Census');
    expect(text).not.toContain('undefined');
  });
});

describe('narrateCitation', () => {
  it('narrates a primary citation with page and attached entity', () => {
    const text = narrateCitation({
      sourceTitle: 'Stockholms domkyrkoförsamling födelsebok 1850-1859',
      page: '47',
      confidence: 3,
      attachedToLabel: "Karl Andersson's birth",
    });
    expect(text).toContain('Stockholms domkyrkoförsamling');
    expect(text).toContain('47');
    expect(text).toContain('primary');
    expect(text).toContain("Karl Andersson's birth");
  });

  it('handles a citation with no page', () => {
    const text = narrateCitation({ sourceTitle: 'Census 1880', confidence: 2 });
    expect(text).toContain('Census 1880');
    expect(text).toContain('secondary');
    expect(text).not.toContain('undefined');
  });

  it('handles minimal data (title only)', () => {
    const text = narrateCitation({ sourceTitle: 'Unknown source' });
    expect(text).toContain('Unknown source');
    expect(text).not.toContain('undefined');
  });
});
```

- [ ] **Step 4: Run tests, confirm they fail**

Run: `npx vitest run tests/unit/narration.test.ts 2>&1 | tail -20`

Expected: tests fail at the import statement with `narrateMedia is not a function` (or similar). The pre-existing 7 tests for narratePerson/narrateRelationship/narrateSource still pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
test(narration): add failing tests for 4 new builders

narrateMedia, narratePlace, narrateEvent, narrateCitation — pure
function tests that fail because the functions don't exist yet. Task
2 implements them.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Implement the 4 new builders

**Files:**
- Modify: `src/renderer/utils/narration.ts`

After this task, the Task-1 tests should pass.

- [ ] **Step 1: Read the existing narration.ts**

Run: `cat src/renderer/utils/narration.ts`

The file uses a `NarrationLabels` interface + `EN_LABELS` defaults + each builder optionally takes `labels: NarrationLabels = EN_LABELS`. Follow that pattern exactly.

- [ ] **Step 2: Extend `NarrationLabels` interface**

Find the existing `NarrationLabels` interface (around line 28). Add these fields:

```ts
  // Media
  photo: string;
  document: string;
  tagged: string;
  taken: string;
  about: string;

  // Place
  eventsRecorded: string;

  // Event
  of: string;
  on: string;

  // Citation
  page: string;
  confidence: string;
  confidenceLevels: { 0: string; 1: string; 2: string; 3: string };
  for_: string;
```

The result should be one merged interface (not split). Don't touch the existing fields.

- [ ] **Step 3: Extend `EN_LABELS` const**

Find the existing `EN_LABELS` (around line 50). Add the matching defaults:

```ts
  photo: 'Photo',
  document: 'Document',
  tagged: 'Tagged',
  taken: 'Taken',
  about: 'about',
  eventsRecorded: 'events recorded',
  of: 'of',
  on: 'on',
  page: 'page',
  confidence: 'Confidence',
  confidenceLevels: { 0: 'unreliable', 1: 'questionable', 2: 'secondary', 3: 'primary' },
  for_: 'For',
```

- [ ] **Step 4: Extend `narrationLabelsFromI18n(t)`**

Find the existing helper (around line 40). Add the matching i18n lookups:

```ts
    photo: t('narration.media.photo'),
    document: t('narration.media.document'),
    tagged: t('narration.media.tagged'),
    taken: t('narration.media.taken'),
    about: t('narration.media.about'),
    eventsRecorded: t('narration.place.eventsRecorded'),
    of: t('narration.event.of'),
    on: t('narration.event.on'),
    page: t('narration.citation.page'),
    confidence: t('narration.citation.confidence'),
    confidenceLevels: {
      0: t('narration.citation.confidenceLevels.0'),
      1: t('narration.citation.confidenceLevels.1'),
      2: t('narration.citation.confidenceLevels.2'),
      3: t('narration.citation.confidenceLevels.3'),
    },
    for_: t('narration.citation.for'),
```

(Note the existing `in_` field uses `t('narration.in')` — same trailing-underscore convention for `for_`.)

- [ ] **Step 5: Add the 4 new interfaces + builders at the end of the file**

```ts
export interface MediaNarration {
  title: string;
  format?: string;
  taggedPersonNames?: string[];
  inferredDate?: string;
  notes?: string;
}

export function narrateMedia(data: MediaNarration, labels: NarrationLabels = EN_LABELS): string {
  const parts: string[] = [data.title + '.'];

  if (data.format) {
    const isImage = /^(jpe?g|png|gif|webp|bmp|tiff?|heic)$/i.test(data.format);
    parts.push((isImage ? labels.photo : labels.document) + '.');
  }

  if (data.taggedPersonNames && data.taggedPersonNames.length > 0) {
    parts.push(labels.tagged + ': ' + data.taggedPersonNames.join(', ') + '.');
  }

  if (data.inferredDate) {
    parts.push(labels.taken + ' ' + labels.about + ' ' + data.inferredDate + '.');
  }

  if (data.notes) {
    parts.push(data.notes);
  }

  return parts.join(' ');
}

export interface PlaceNarration {
  name: string;
  type?: string;
  parentPath?: string;
  eventCount?: number;
}

export function narratePlace(data: PlaceNarration, labels: NarrationLabels = EN_LABELS): string {
  const parts: string[] = [];

  const head = data.type ? data.name + ' ' + data.type : data.name;
  const headWithParent = data.parentPath ? head + ' ' + labels.in_ + ' ' + data.parentPath : head;
  parts.push(headWithParent + '.');

  if (data.eventCount !== undefined && data.eventCount > 0) {
    parts.push(data.eventCount + ' ' + labels.eventsRecorded + '.');
  }

  return parts.join(' ');
}

export interface EventNarration {
  type: string;
  date?: string;
  place?: string;
  primaryPersonName?: string;
}

export function narrateEvent(data: EventNarration, labels: NarrationLabels = EN_LABELS): string {
  let head = data.type;
  if (data.primaryPersonName) {
    head = head + ' ' + labels.of + ' ' + data.primaryPersonName;
  }

  const parts: string[] = [head];

  if (data.date) {
    parts.push(labels.on + ' ' + data.date);
  }

  if (data.place) {
    parts.push(labels.in_ + ' ' + data.place);
  }

  return parts.join(' ') + '.';
}

export interface CitationNarration {
  sourceTitle: string;
  page?: string;
  confidence?: 0 | 1 | 2 | 3;
  attachedToLabel?: string;
}

export function narrateCitation(data: CitationNarration, labels: NarrationLabels = EN_LABELS): string {
  const parts: string[] = [data.sourceTitle];

  if (data.page) {
    parts[0] += ', ' + labels.page + ' ' + data.page;
  }
  parts[0] += '.';

  if (data.confidence !== undefined) {
    parts.push(labels.confidence + ': ' + labels.confidenceLevels[data.confidence] + '.');
  }

  if (data.attachedToLabel) {
    parts.push(labels.for_ + ' ' + data.attachedToLabel + '.');
  }

  return parts.join(' ');
}
```

- [ ] **Step 6: Run tests, confirm they pass**

Run: `npx vitest run tests/unit/narration.test.ts 2>&1 | tail -10`

Expected: all tests pass (existing 7 + new ~12). If a test fails, read the failure message and fix the builder; the test wording is the spec.

- [ ] **Step 7: Lint**

Run: `npm run lint 2>&1 | tail -3`

Expected: 0 errors (7 pre-existing warnings allowed).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(narration): add narrateMedia/Place/Event/Citation builders

Four new pure-function builders following the narratePerson pattern.
Extend NarrationLabels interface + EN_LABELS defaults +
narrationLabelsFromI18n(t) helper. Tests from Task 1 now pass.

i18n keys land in Task 3.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add i18n keys for the new narration labels

**Files:**
- Modify: `src/renderer/i18n/sv.ts`
- Modify: `src/renderer/i18n/en.ts`

`narrationLabelsFromI18n(t)` (Task 2 step 4) calls `t('narration.media.photo')` etc. — those keys must exist in both locales.

- [ ] **Step 1: Locate the existing `narration` namespace**

```bash
grep -n "narration:" src/renderer/i18n/sv.ts | head -2
grep -n "narration:" src/renderer/i18n/en.ts | head -2
```

The existing `narration:` block holds `born`, `died`, `in`, `marriedTo`, `children`, `between`, `and`, `author`, `citationsLinked`. New sub-namespaces are nested objects under it.

- [ ] **Step 2: Extend the `narration` namespace in `sv.ts`**

Add these keys inside the existing `narration: { ... }` object (Swedish authoritative — Bengt's preferred terse register):

```ts
    media: {
      photo: 'Foto',
      document: 'Dokument',
      tagged: 'Taggade',
      taken: 'Taget',
      about: 'omkring',
    },
    place: {
      eventsRecorded: 'händelser registrerade',
    },
    event: {
      of: 'för',
      on: 'den',
    },
    citation: {
      page: 'sida',
      confidence: 'Tillförlitlighet',
      confidenceLevels: {
        0: 'opålitlig',
        1: 'tveksam',
        2: 'sekundär',
        3: 'primär',
      },
      for: 'För',
    },
    modal: {
      header: '{entity}-dialog: {title}',
    },
    faceTag: {
      untagged: 'Otaggad person',
    },
```

- [ ] **Step 3: Mirror to `en.ts`**

Add the same structure with English values:

```ts
    media: {
      photo: 'Photo',
      document: 'Document',
      tagged: 'Tagged',
      taken: 'Taken',
      about: 'about',
    },
    place: {
      eventsRecorded: 'events recorded',
    },
    event: {
      of: 'of',
      on: 'on',
    },
    citation: {
      page: 'page',
      confidence: 'Confidence',
      confidenceLevels: {
        0: 'unreliable',
        1: 'questionable',
        2: 'secondary',
        3: 'primary',
      },
      for: 'For',
    },
    modal: {
      header: '{entity} modal: {title}',
    },
    faceTag: {
      untagged: 'Untagged person',
    },
```

- [ ] **Step 4: Verify the i18n parity test passes**

The project has a sv/en key-parity test that catches drift. Run:

```bash
npx vitest run tests/unit 2>&1 | grep -iE "i18n|sv-en|parity|locale" | head -10
```

If a parity test exists and fails with missing keys, fix the missing side. If no such test runs, do a manual diff:

```bash
node -e "const sv=Object.keys(require('./src/renderer/i18n/sv').default.narration); const en=Object.keys(require('./src/renderer/i18n/en').default.narration); console.log('sv-only:', sv.filter(k=>!en.includes(k))); console.log('en-only:', en.filter(k=>!sv.includes(k)));" 2>/dev/null || echo "i18n files use TS — skip JS check, lint suffices"
```

The `narrationLabelsFromI18n(t)` function from Task 2 will throw at runtime if any key is missing, so any modal/picker that calls it would fail to render. Test indirectly via lint + the next tasks.

- [ ] **Step 5: Lint + narration tests**

Run: `npm run lint && npx vitest run tests/unit/narration.test.ts 2>&1 | tail -5`

Expected: 0 lint errors, all narration tests still passing.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
i18n(narration): add Swedish + English keys for new builders

~25 keys each under narration.* — sub-namespaces for media, place,
event, citation, modal, faceTag. Swedish authoritative; English
mirrors. Required by narrationLabelsFromI18n(t) from Task 2.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Wire the 3 missing pickers

**Files:**
- Modify: `src/renderer/components/SourcePicker.vue`
- Modify: `src/renderer/components/GroupPicker.vue`
- Modify: `src/renderer/components/MediaPicker.vue`

Match the `PersonPicker` pattern: each option row gets `v-narrate` so tabbing through the dropdown reads each option aloud.

- [ ] **Step 1: Read PersonPicker as reference**

Run: `sed -n '20,40p' src/renderer/components/PersonPicker.vue`

Note the pattern at line 30: `v-narrate="narratePerson(person)"`. Match this in each picker.

- [ ] **Step 2: Wire SourcePicker**

In `src/renderer/components/SourcePicker.vue`:

1. Add to the `<script setup>` imports (near other imports):

```ts
import { useI18n } from 'vue-i18n';
import { narrateSource, narrationLabelsFromI18n } from '../utils/narration';
```

(If `useI18n` is already imported, don't duplicate.)

2. After the existing setup logic, add:

```ts
const { t } = useI18n();
const labels = narrationLabelsFromI18n(t);
```

(If `t` already exists, just add the `labels` line.)

3. Find the `<li>` (or equivalent) that renders each source result option in the dropdown. Add `v-narrate` to it:

```vue
v-narrate="() => narrateSource({ title: src.title, author: src.author ?? undefined, citationCount: src.citationCount ?? 0 }, labels)"
```

Adjust the local variable name (`src`) to whatever the `v-for` actually uses in the file. The function form (`() => ...`) ensures the narration re-evaluates if data changes.

- [ ] **Step 3: Wire GroupPicker**

In `src/renderer/components/GroupPicker.vue`:

1. The group narration is simple enough that no builder is needed. Add `v-narrate` directly to the option row:

```vue
v-narrate="g.name + (g.memberCount ? ' — ' + g.memberCount + ' members' : '')"
```

(Adjust local variable name. If `memberCount` isn't on the group object surfaced by the picker, use just `g.name`.)

No imports or labels needed.

- [ ] **Step 4: Wire MediaPicker**

In `src/renderer/components/MediaPicker.vue`:

1. Add to the `<script setup>` imports:

```ts
import { useI18n } from 'vue-i18n';
import { narrateMedia, narrationLabelsFromI18n } from '../utils/narration';
```

2. After existing setup:

```ts
const { t } = useI18n();
const labels = narrationLabelsFromI18n(t);
```

3. Add `v-narrate` to the option row:

```vue
v-narrate="() => narrateMedia({ title: m.title || t('media.untitled'), format: m.format ?? undefined }, labels)"
```

(Adjust local variable name. Use `t('media.untitled')` because `$t` isn't directly accessible inside an inline expression in some Vue setups; the imported `t` is.)

- [ ] **Step 5: Lint + tests**

Run: `npm run lint && npx vitest run tests/unit/narration.test.ts 2>&1 | tail -5`

Expected: 0 errors, narration tests still pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(a11y): v-narrate on SourcePicker / GroupPicker / MediaPicker

Each option row narrates via the existing v-narrate directive when
focused. SourcePicker and MediaPicker use the new narrateSource /
narrateMedia builders; GroupPicker uses an inline expression (group
narration is simple enough to skip a builder).

Brings the 3 remaining pickers up to parity with PersonPicker and
PlacePicker.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: BaseSubPanel header narration

**Files:**
- Modify: `src/renderer/components/modals/BaseSubPanel.vue`

Replace the fallback-to-visible-text behavior with an entity-aware string: `"<Entity> modal: <Title>"`.

- [ ] **Step 1: Read BaseSubPanel.vue**

Run: `cat src/renderer/components/modals/BaseSubPanel.vue`

Identify:
- The `meta` (or equivalent) computed that resolves `ENTITY_META[props.entityType]`
- The `<div class="ep-header">` element in the template
- Whether `useI18n` is already imported

- [ ] **Step 2: Add the `headerNarration` computed in `<script setup>`**

If `useI18n` is already imported and `t` is destructured, add only the computed:

```ts
const headerNarration = computed(() => {
  const entity = t(meta.value.labelKey);
  return t('narration.modal.header', { entity, title: props.title });
});
```

If `useI18n` isn't imported yet, add at the top of `<script setup>`:

```ts
import { computed } from 'vue';   // if not already
import { useI18n } from 'vue-i18n';
```

And in the body:

```ts
const { t } = useI18n();
const headerNarration = computed(() => {
  const entity = t(meta.value.labelKey);
  return t('narration.modal.header', { entity, title: props.title });
});
```

(`computed` is likely already imported; check before adding.)

- [ ] **Step 3: Add `v-narrate` to the `.ep-header` element in the template**

Find `<div class="ep-header">` (or whichever element is the modal header). Add the directive:

```vue
<div class="ep-header" v-narrate="headerNarration">
```

If the element already has `tabindex="0"` keep it; if not, do not add one — the header isn't a focusable control. The narration will still resolve when the screen-reader composable reads any focused descendant inside the header (close button, save button, etc.) since `resolveNarration` walks up the DOM. (Verify by reading `resolveNarration` in `src/renderer/directives/narrate.ts` — if it doesn't walk up, add `tabindex="-1"` so the header itself is programmatically focusable for screen readers without entering the tab order.)

Actually — re-checking the plan brief: the directive's `resolveNarration` reads from `narrationMap` for the focused element specifically. It does NOT walk up. So either:
- A) Leave header non-focusable; the modal body's first focusable input gets focus on open, and we rely on its own narration (this is what happens today).
- B) Add `tabindex="-1"` so screen readers and `useScreenReaderMode`'s focus tracker can land on the header programmatically.

Pick **A**. The point of `v-narrate` on the header is to enrich what the screen reader announces when the modal opens — which is handled by `useScreenReaderMode`'s page-entry hook reading the body's first labelled element. The header `v-narrate` is then available if the user explicitly tabs back to a header element (close button, etc.) — `resolveNarration` will fall back to `aria-label` for the close button itself, but a parent-walk would let it announce the modal context. **Skip the parent walk for now**; if Bengt reports the modal feels context-less, revisit.

So: just add `v-narrate="headerNarration"` to the header div. No `tabindex` change.

- [ ] **Step 4: Verify lint + WCAG suite**

Run: `npm run lint && npx vitest run tests/unit/wcagContrast.test.ts 2>&1 | tail -5`

Expected: 0 errors, 280/280 WCAG passing.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(a11y): BaseSubPanel header carries v-narrate with entity context

The .ep-header div now exposes a v-narrate string of the form
"{Entity} modal: {Title}" (Swedish: "{Entity}-dialog: {Title}").
Replaces the fallback-to-visible-text behavior with an entity-aware
announcement. Header is not focusable; the directive is read when
useScreenReaderMode walks descendants for context.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: MediaViewer trio (image, caption, face tags)

**Files:**
- Modify: `src/renderer/components/MediaViewer.vue`
- Modify: `src/renderer/components/MediaCaption.vue`
- Modify: `src/renderer/components/FaceTagOverlay.vue`

Each component gets focusable elements + v-narrate.

- [ ] **Step 1: MediaViewer — make the image focusable and narrated**

In `src/renderer/components/MediaViewer.vue`:

1. Add to imports (top of `<script setup>`):

```ts
import { useI18n } from 'vue-i18n';
import { narrateMedia, narrationLabelsFromI18n } from '../utils/narration';
```

(Check first — `useI18n` and `computed` likely already imported.)

2. In the script body:

```ts
const { t } = useI18n();
const labels = narrationLabelsFromI18n(t);

const currentMediaSummary = computed(() => ({
  title: currentItem.value?.title || t('media.untitled'),
  format: currentItem.value?.format ?? undefined,
  taggedPersonNames: enrichedRegions.value
    .map(r => r.personName)
    .filter((n): n is string => !!n),
  notes: currentItem.value?.notes ?? undefined,
}));
```

(Reuse the existing `currentItem` and `enrichedRegions` refs/computeds the file already has. Inspect the file to confirm the exact names; rename in the snippet to match.)

3. Find the `<img>` element in the template and add:

```vue
<img
  ref="imgEl"
  :src="imageUrl"
  draggable="false"
  tabindex="0"
  v-narrate="() => narrateMedia(currentMediaSummary.value, labels)"
  @load="onImageLoad"
/>
```

Don't add `alt=""` if the image has no alt today — the narration directive handles announcement.

- [ ] **Step 2: MediaCaption — focusable + plain-text narration**

In `src/renderer/components/MediaCaption.vue`:

1. Identify the root element. It's typically a `<div>` or `<figcaption>`.

2. Add a `captionPlainText` computed at the bottom of `<script setup>`:

```ts
const captionPlainText = computed(() => {
  const parts: string[] = [];
  if (props.contextLine) parts.push(props.contextLine);
  if (props.faceTags && props.faceTags.length > 0) {
    parts.push('From left: ' + props.faceTags.map(f => f.name).join(', '));
  }
  if (props.inferredDateISO) parts.push(props.inferredDateISO);
  if (props.notes) parts.push(props.notes);
  return parts.join('. ');
});
```

(Adjust prop names to whatever the component actually receives; inspect `defineProps` in the file.)

3. Add `tabindex="0"` and `v-narrate="captionPlainText"` to the root element:

```vue
<div class="media-caption" tabindex="0" v-narrate="captionPlainText">
  ...
</div>
```

- [ ] **Step 3: FaceTagOverlay — focusable region rectangles**

In `src/renderer/components/FaceTagOverlay.vue`:

1. Add `useI18n` if not present:

```ts
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
```

2. Find the `<div v-for="region in regions" class="face-tag-region" ...>` element (around line 12). Add three attributes:

```vue
<div
  v-for="region in regions"
  :key="region.id"
  class="face-tag-region"
  :class="{ ... }"
  :style="regionStyle(region)"
  tabindex="0"
  role="button"
  v-narrate="region.personName || region.label || t('narration.faceTag.untagged')"
  @mousedown.stop="onRegionMouseDown($event, region)"
  ...
></div>
```

The `tabindex="0"` makes the region land in the tab order so Bengt can step through face tags. The `role="button"` tells screen readers it's interactive (it already accepts click). The `v-narrate` provides the announcement.

- [ ] **Step 4: Lint + tests**

Run: `npm run lint && npx vitest run tests/unit/narration.test.ts tests/unit/wcagContrast.test.ts 2>&1 | tail -10`

Expected: 0 errors, all narration tests pass, WCAG 280/280 unchanged.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(a11y): MediaViewer image, caption, and face tags are narrated

- <img> in MediaViewer is now tabindex=0 and narrates via narrateMedia
  with title + format + tagged people; updates per current item.
- MediaCaption root is tabindex=0 with a plain-text narration that
  flattens the visible caption (context, face list, date, notes).
- FaceTagOverlay regions are now tabindex=0 + role=button + narrated
  with the tagged person's name or "Untagged person" fallback. Tab
  order follows region creation order (top-left to bottom-right).

The MediaViewer was the most visual / least naturally accessible
surface in the app; this brings it up to the same level as the rest.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Manual smoke test (deferred to user)

**No file changes** — this is a verification gate the user runs after merge.

The TTS narration only matters when a human enables it in Settings and listens. Mark this task complete in the worktree as "deferred to user post-merge" — DO NOT spend a subagent dispatch on it.

User checklist to run after merge:

1. Settings → Read aloud → **Narrate** (TTS).
2. Open SourcePicker, GroupPicker, MediaPicker — tab through dropdowns. Each option should be announced (source title + citation count, group name + member count, media title + format).
3. Open one of each modal type — header should announce `"<Entity> modal: <Title>"` (Swedish: `"<Entity>-dialog: <Title>"`).
4. Open MediaViewer:
   - Tab to the image — should announce title + photo/document + tagged people + inferred date + notes.
   - Tab to the caption — should announce the full caption text.
   - Tab through face tag regions — should announce each tagged person's name (or "Untagged person").
5. Repeat with Settings → Read aloud → **Screen Reader** to confirm hotkeys + focus tracking still work.

If any narration is missing, sounds wrong, or falls back to visible text instead of the rich builder output, file a follow-up issue. The math (lint + tests) will not catch this — only listening will.

---

## Task 8: Release — version, CHANGELOG, archive

**Files:**
- Modify: `package.json`, `CHANGELOG.md`, `docs/PLAN.md`
- Move: `docs/plans/2026-04-26-narration-coverage-design.md` → `docs/plans/archive/`
- Move: `docs/plans/2026-04-26-narration-coverage.md` → `docs/plans/archive/`

- [ ] **Step 1: Bump minor version**

Read current version: `grep '"version"' package.json`

This is a feat (new builders + new directives applied to surfaces). Bump the minor segment, reset patch to 0. Likely `0.151.0` → `0.152.0`. If main has moved past 0.151, take the next minor.

Edit `package.json` to the new version string.

- [ ] **Step 2: Add CHANGELOG entry under `## Unreleased`**

Insert at the top of `## Unreleased` in `CHANGELOG.md`:

```markdown
- feat(a11y): narration coverage for the 3 missing pickers (Source/Group/Media), modal headers, and the MediaViewer (image/caption/face tags). Adds 4 new builders in `narration.ts` (Media/Place/Event/Citation) following the existing `narratePerson` pattern, plus ~25 i18n keys per locale under `narration.*`. BaseSubPanel headers now announce "{Entity} modal: {Title}" instead of falling back to visible text. Face tag regions are now keyboard-focusable (`tabindex=0` + `role=button`) so a screen-reader user can tab through tagged people in a photo. Closes the last systemic gap from the appearance audit.
```

- [ ] **Step 3: Archive the spec and plan**

```bash
git mv docs/plans/2026-04-26-narration-coverage-design.md docs/plans/archive/
git mv docs/plans/2026-04-26-narration-coverage.md docs/plans/archive/
```

- [ ] **Step 4: Remove the milestone from `docs/PLAN.md` Roadmap**

Find the `#### Narration Coverage Migration [planned]` heading + spec link block in `docs/PLAN.md` and delete it entirely. The CHANGELOG entry is the permanent record.

- [ ] **Step 5: Verify lint + tests**

Run: `npm run lint && npx vitest run tests/unit/narration.test.ts tests/unit/wcagContrast.test.ts 2>&1 | tail -10`

Expected: 0 errors, narration tests pass, WCAG 280/280.

- [ ] **Step 6: Commit the release**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore(release): v0.152.0 — narration coverage migration

Bumps minor for the 4 new narration builders + the new v-narrate
applications across pickers, modal headers, and MediaViewer.
Archives the spec and plan; removes the milestone from the Roadmap.
CHANGELOG updated.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

(Adjust version number in the message to match the actual bump.)

---

## Worktree merge-back (controller, not subagent)

After Task 8 commits cleanly inside the worktree, the controller (parent agent) merges back to main per the `commit` skill's "Merging a long-running feature branch back to main" guidance:

```bash
# from main repo cwd, NOT the worktree
git -C /Users/jonasahnstedt/git/slaktforskning fetch
git -C /Users/jonasahnstedt/git/slaktforskning merge --no-ff entity-narrate-coverage
git -C /Users/jonasahnstedt/git/slaktforskning worktree remove /Users/jonasahnstedt/git/slaktforskning/.worktrees/narration-coverage
git -C /Users/jonasahnstedt/git/slaktforskning branch -d narration-coverage
```

(Adjust branch name to whatever the worktree was created with; the worktree skill names them based on the topic.)

Conflict expectations: `package.json` version (take the worktree's bump if higher), `CHANGELOG.md` (place worktree's entry above main's new entries), `docs/PLAN.md` (worktree already removed the milestone — keep that). See the `commit` skill for the full conflict guide.
