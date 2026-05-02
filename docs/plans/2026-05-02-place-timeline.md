# Place Timeline section — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a chronological Timeline section to PlacePanel that mirrors PersonPanel's Timeline section, with the person ↔ place axis swapped. Read-only, derived view of the same events the Events section already shows.

**Architecture:** New self-loading Vue component (`PlaceTimeline.vue`) wired into `PlacePanel.vue` between Events and Citations. Loads via the existing `events.forPlace(placeId)` IPC channel — no new IPC, no new API, no new data shape. Visual rules (rail, dots, gaps, dated/undated split, approximate-date affordance) are copied verbatim from `PersonTimeline.vue` so the two timelines are visually identical apart from the dropped person-only concepts.

**Tech Stack:** Vue 3 (`<script setup>`), TypeScript, vue-i18n, Vitest + @vue/test-utils, `useEntityData` composable.

---

## User goal

When I open a place panel, I see every event that happened at this place laid out chronologically — same dots, same gaps, same dated/undated split, same approximate-date affordance as a person's life timeline — focused on what happened at this place instead of what happened to a person. The visual rhythm of the place (clusters, gaps, eras) is visible at a glance, alongside the existing tabular Events section.

## Scope

**In scope (the full pattern instance set for this change):**

- Create `src/renderer/components/PlaceTimeline.vue`
- Modify `src/renderer/components/PlacePanel.vue` — register the new section, add the import, extend the `usePanelSections` defaults
- Modify `src/renderer/i18n/sv.ts` — add `placeTimeline.{title,gap,undated,empty}` keys
- Modify `src/renderer/i18n/en.ts` — add the same four keys
- Create `tests/components/PlaceTimeline.test.ts` — observes rendered DOM structure, not just function existence
- Modify `docs/UX_INVENTORY.md` — add `PlacePanel → Timeline section` entry + index row

### Scope deviations

- **RelationshipPanel does not get a `RelationshipTimeline` section.** It is the third event-host panel and structurally could host the same component, but a relationship is a join, not a primary research entity — researchers do not open a marriage and ask "show me the chronology of this couple's events" the way they ask the same of a person or a place. Documented in the design spec; not an oversight.

## Verification

**User-observable check (manual smoke, run before committing):**

1. `npm start` → open a place that has multiple events spanning varied dates (Stockholm and Falun on a typical seed DB are good candidates).
2. PlacePanel shows a new **Timeline** section between **Events** and **Citations**, default-collapsed.
3. Expanding it renders events on a vertical rail with the same dots, date column, badges, and dashed/italic affordance for approximate dates as `PersonPanel → Timeline`.
4. Gaps of >20 years between consecutive dated events render the dashed gap segment with the `{years}` label.
5. Undated events appear under the same separator + label pattern.
6. Clicking a row opens `EventModal` standalone with that event prefilled — same edit path as the Events section.
7. The `+ Event` chip in the section header invokes the same add flow as the Events section.
8. After saving an event in `EventModal`, the Timeline reflects the change without panel close/reopen — `useEntityData` is auto-subscribed to `onDataChanged`.

**Automated check:** `tests/components/PlaceTimeline.test.ts` mounts the component against a fixture (mix of dated, undated, approximate, >20-year gap) and asserts the rendered DOM contains: one `.timeline-entry` per fixture event in chronological order; a `.timeline-gap` with the expected `{years}` label between two events ≥ 20 years apart; the undated bucket renders only undated fixture events; per-event-type dot class matches the event type; the participant-name slot is populated for events with `participant_names` set.

**What is NOT verification on its own:** lint passing, type-check passing, "the function exists." Those are hygiene gates the rest of the codebase already enforces; they do not observe the user goal.

## File structure

| File | Responsibility |
|------|----------------|
| `src/renderer/components/PlaceTimeline.vue` (new) | Self-loading chronological view of `events.forPlace(id)`. Visual rules and CSS copied from `PersonTimeline.vue`; person-only concepts (age, family-tier, birth-first sort priority) dropped; person-name string substituted for the place-name slot. |
| `src/renderer/components/PlacePanel.vue` (modify) | Add `<PlaceTimeline>` between Events and Citations sections; register `timeline` in `usePanelSections` defaults; import the component. |
| `src/renderer/i18n/{sv,en}.ts` (modify) | Add `placeTimeline.{title,gap,undated,empty}` block, mirroring the `personTimeline` block. |
| `tests/components/PlaceTimeline.test.ts` (new) | Mount-based assertions on rendered structure: order, gap marker, undated bucket, dot color, approximate styling, participant-name rendering, empty state. |
| `docs/UX_INVENTORY.md` (modify) | New entry `PlacePanel → Timeline section` with Purpose + CTA grid, plus a row in the Places-view index table. |

---

## Tasks

### Task 1: Add i18n keys

**Files:**
- Modify: `src/renderer/i18n/sv.ts:1197` (the existing `personTimeline:` block)
- Modify: `src/renderer/i18n/en.ts` (the corresponding `personTimeline:` block — find with `grep -n personTimeline src/renderer/i18n/en.ts`)

- [ ] **Step 1: Add `placeTimeline` block to `sv.ts`**

After the existing `personTimeline: { ... },` block in `src/renderer/i18n/sv.ts`, insert:

```ts
  placeTimeline: {
    title: 'Tidslinje',
    gap: '{years} års lucka',
    undated: 'Odaterade',
    empty: 'Inga händelser på denna plats',
  },
```

- [ ] **Step 2: Add `placeTimeline` block to `en.ts`**

In the same relative position (right after the `personTimeline: { ... },` block) in `src/renderer/i18n/en.ts`, insert:

```ts
  placeTimeline: {
    title: 'Timeline',
    gap: '{years}-year gap',
    undated: 'Undated',
    empty: 'No events at this place yet',
  },
```

- [ ] **Step 3: Verify i18n parity**

Run: `npx tsx -e "const sv = require('./src/renderer/i18n/sv.ts').sv; const en = require('./src/renderer/i18n/en.ts').en; console.log('sv:', Object.keys(sv.placeTimeline)); console.log('en:', Object.keys(en.placeTimeline));"`

Expected: both lists contain `title`, `gap`, `undated`, `empty`. (If the inline tsx invocation has issues, just visually inspect the two blocks side by side — they must have the same keys.)

- [ ] **Step 4: Commit**

```bash
git add src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "feat(i18n): add placeTimeline keys (sv, en)"
```

---

### Task 2: Write the failing component test

**Files:**
- Create: `tests/components/PlaceTimeline.test.ts`

Mirror the structure of `tests/components/PersonTimeline.test.ts` but assert place-side behaviour: chronological ordering, gap marker, undated bucket, dot color per event type, approximate styling, participant-name rendering, empty state.

- [ ] **Step 1: Create the test file**

Write `tests/components/PlaceTimeline.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PlaceTimeline from '../../src/renderer/components/PlaceTimeline.vue';
import { i18n } from './setup';

function makeApi(events: unknown[]) {
  return {
    events: {
      forPlace: vi.fn().mockResolvedValue(events),
    },
    onDataChanged: vi.fn().mockReturnValue(() => {}),
    db: { getSetting: vi.fn().mockResolvedValue(null) },
    citations: { forEvent: vi.fn().mockResolvedValue([]) },
  };
}

const eventBirth = {
  id: 'ev-1',
  event_type: 'birth',
  date_type: 'exact',
  date_value: '1850-04-12',
  date_value_end: null,
  date_original: '12 april 1850',
  place_id: 'place-1',
  place_name: 'Stockholm',
  description: '',
  cause: null,
  citation_count: 1,
  participant_names: 'Anders Eckerström',
};

const eventMarriageApprox = {
  id: 'ev-2',
  event_type: 'marriage',
  date_type: 'about',
  date_value: '1880-06-01',
  date_value_end: null,
  date_original: 'omkring 1880',
  place_id: 'place-1',
  place_name: 'Stockholm',
  description: '',
  cause: null,
  citation_count: 0,
  participant_names: 'Anders Eckerström & Greta Lindström',
};

const eventUndatedDeath = {
  id: 'ev-3',
  event_type: 'death',
  date_type: 'exact',
  date_value: null,
  date_value_end: null,
  date_original: '',
  place_id: 'place-1',
  place_name: 'Stockholm',
  description: 'Drunknad',
  cause: null,
  citation_count: 0,
  participant_names: 'Erik Andersson',
};

describe('PlaceTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (window as unknown as { api: unknown }).api = makeApi([
      eventBirth,
      eventMarriageApprox,
      eventUndatedDeath,
    ]);
  });

  it('renders one timeline-entry per dated event in chronological order', async () => {
    const wrapper = mount(PlaceTimeline, {
      global: { plugins: [i18n] },
      props: { placeId: 'place-1' },
    });
    await flushPromises();

    const dated = wrapper.findAll('.timeline-track .timeline-entry');
    expect(dated).toHaveLength(2);
    expect(dated[0].text()).toContain('Anders Eckerström');
    expect(dated[1].text()).toContain('Greta Lindström');
  });

  it('renders undated events in a separate bucket', async () => {
    const wrapper = mount(PlaceTimeline, {
      global: { plugins: [i18n] },
      props: { placeId: 'place-1' },
    });
    await flushPromises();

    const undated = wrapper.findAll('.timeline-undated .timeline-entry');
    expect(undated).toHaveLength(1);
    expect(undated[0].text()).toContain('Erik Andersson');
    expect(undated[0].classes()).toContain('is-undated');
  });

  it('shows a gap marker when consecutive dated events are >20 years apart', async () => {
    const wrapper = mount(PlaceTimeline, {
      global: { plugins: [i18n] },
      props: { placeId: 'place-1' },
    });
    await flushPromises();

    const gaps = wrapper.findAll('.timeline-gap');
    expect(gaps).toHaveLength(1);
    // 1850 → 1880 is 30 years
    expect(gaps[0].text()).toContain('30');
  });

  it('marks approximate-date events with is-approximate class', async () => {
    const wrapper = mount(PlaceTimeline, {
      global: { plugins: [i18n] },
      props: { placeId: 'place-1' },
    });
    await flushPromises();

    const dated = wrapper.findAll('.timeline-track .timeline-entry');
    // eventMarriageApprox is the second dated entry, date_type 'about'
    expect(dated[1].classes()).toContain('is-approximate');
  });

  it('uses event-type-specific dot color class', async () => {
    const wrapper = mount(PlaceTimeline, {
      global: { plugins: [i18n] },
      props: { placeId: 'place-1' },
    });
    await flushPromises();

    const dots = wrapper.findAll('.timeline-track .timeline-dot');
    expect(dots[0].classes()).toContain('dot-birth');
    expect(dots[1].classes()).toContain('dot-marriage');
  });

  it('renders empty state when no events', async () => {
    (window as unknown as { api: unknown }).api = makeApi([]);
    const wrapper = mount(PlaceTimeline, {
      global: { plugins: [i18n] },
      props: { placeId: 'place-1' },
    });
    await flushPromises();

    expect(wrapper.findAll('.timeline-entry')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/components/PlaceTimeline.test.ts
```

Expected: FAIL — `Cannot find module '../../src/renderer/components/PlaceTimeline.vue'` (the component does not exist yet).

---

### Task 3: Create PlaceTimeline.vue

**Files:**
- Create: `src/renderer/components/PlaceTimeline.vue`

A near-mirror of `src/renderer/components/PersonTimeline.vue`. Differences listed at the top of the file as a comment for future readers; full template/script/style below.

- [ ] **Step 1: Create the component file**

Write `src/renderer/components/PlaceTimeline.vue`:

```vue
<template>
  <div class="place-timeline">
    <SectionEmpty v-if="loading" :message="$t('common.loading')" />
    <SectionEmpty v-else-if="datedEvents.length === 0 && undatedEvents.length === 0" :message="$t('placeTimeline.empty')" />
    <template v-else>
      <!-- Dated events -->
      <div class="timeline-track">
        <template v-for="item in datedEvents" :key="item.event.id">
          <div v-if="item.gapYears" class="timeline-gap">
            <span class="gap-label">{{ $t('placeTimeline.gap', { years: item.gapYears }) }}</span>
          </div>
          <div
            class="timeline-entry"
            :class="{ 'is-approximate': item.isApproximate }"
            tabindex="0"
            role="button"
            :aria-label="entryAriaLabel(item)"
            @click="handleEntryClick(item)"
            @keydown.enter="handleEntryClick(item)"
            @keydown.space.prevent="handleEntryClick(item)"
          >
            <div class="timeline-date">{{ item.dateDisplay }}</div>
            <div class="timeline-dot" :class="'dot-' + item.event.event_type"></div>
            <div class="timeline-content">
              <span class="event-badge">{{ $t('eventTypes.' + item.event.event_type) }}</span>
              <span v-if="item.participantNames" class="timeline-persons">{{ item.participantNames }}</span>
              <span v-if="item.event.description" class="timeline-desc">{{ item.event.description }}</span>
              <span v-if="item.event.citation_count" class="cite-badge" :title="$t('events.citeSources')">{{ item.event.citation_count }}</span>
            </div>
          </div>
        </template>
      </div>

      <!-- Undated events -->
      <div v-if="undatedEvents.length > 0" class="timeline-undated">
        <div class="undated-label">{{ $t('placeTimeline.undated') }}</div>
        <div
          v-for="item in undatedEvents"
          :key="item.event.id"
          class="timeline-entry is-undated"
          tabindex="0"
          role="button"
          :aria-label="entryAriaLabel(item)"
          @click="handleEntryClick(item)"
          @keydown.enter="handleEntryClick(item)"
          @keydown.space.prevent="handleEntryClick(item)"
        >
          <div class="timeline-date">????</div>
          <div class="timeline-dot dot-undated"></div>
          <div class="timeline-content">
            <span class="event-badge">{{ $t('eventTypes.' + item.event.event_type) }}</span>
            <span v-if="item.participantNames" class="timeline-persons">{{ item.participantNames }}</span>
            <span v-if="item.event.description" class="timeline-desc">{{ item.event.description }}</span>
            <span v-if="item.event.citation_count" class="cite-badge">{{ item.event.citation_count }}</span>
          </div>
        </div>
      </div>
    </template>

    <EventModal
      v-if="showForm"
      mode="standalone"
      :place-id="placeId"
      :editing-event="editingEvent"
      @cancel="closeForm"
      @close="closeForm"
      @saved="onSaved"
    />
  </div>
</template>

<script setup lang="ts">
// Mirror of PersonTimeline.vue, axis swapped (person ↔ place).
// Drops: age column, family-tier rendering, birth-first sort priority — all person-specific.
// Adds: participant_names string in place of the timeline-place slot.
import { ref, computed, watch, toRef } from 'vue';
import { useI18n } from 'vue-i18n';
import EventModal from './modals/EventModal.vue';
import SectionEmpty from './ui/SectionEmpty.vue';
import { isSpanEventType } from '../constants/eventTypes';
import { useEntityData } from '../composables/useEntityData';

interface EventRow {
  id: string;
  event_type: string;
  date_type: string;
  date_value: string | null;
  date_value_end: string | null;
  date_original: string;
  place_id: string | null;
  place_name: string | null;
  description: string;
  cause: string | null;
  citation_count: number;
  participant_names?: string;
}

interface TimelineItem {
  event: EventRow;
  participantNames: string;
  dateDisplay: string;
  isApproximate: boolean;
  year: number | null;
  gapYears: number | null;
}

interface TimelineData {
  dated: TimelineItem[];
  undated: TimelineItem[];
}

const props = defineProps<{ placeId: string }>();
const { t } = useI18n();

const showForm = ref(false);
const editingEvent = ref<EventRow | null>(null);

function extractYear(dateValue: string | null): number | null {
  if (!dateValue) return null;
  const m = dateValue.match(/^(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}

function formatDate(event: EventRow): string {
  if (event.date_original) return event.date_original;
  if (!event.date_value) return '';
  const prefix =
    event.date_type === 'about' ? t('datePrefix.about') :
    event.date_type === 'before' ? t('datePrefix.before') :
    event.date_type === 'after' ? t('datePrefix.after') : '';
  if (event.date_value_end &&
      (event.date_type === 'between' || isSpanEventType(event.event_type))) {
    return `${event.date_value} – ${event.date_value_end}`;
  }
  return `${prefix}${event.date_value}`;
}

function entryAriaLabel(item: TimelineItem): string {
  const eventLabel = t('eventTypes.' + item.event.event_type);
  return t('a11y.editItem', { item: eventLabel });
}

const idRef = toRef(props, 'placeId');
const { data, loading, error, reload } = useEntityData<TimelineData>(idRef, async (id) => {
  const events = (await window.api.events.forPlace(id)) as EventRow[] | null;
  if (!events) return { dated: [], undated: [] };

  const dated: TimelineItem[] = [];
  const undated: TimelineItem[] = [];

  for (const event of events) {
    const year = extractYear(event.date_value);
    const isApproximate = ['about', 'before', 'after', 'between', 'calculated'].includes(event.date_type);

    const item: TimelineItem = {
      event,
      participantNames: event.participant_names ?? '',
      dateDisplay: formatDate(event),
      isApproximate,
      year,
      gapYears: null,
    };

    if (year !== null) dated.push(item);
    else undated.push(item);
  }

  // Chronological by date_value (server already sorts; keep a client sort for safety).
  // No birth-first / death-last priority — that is person-specific.
  dated.sort((a, b) => {
    const dateA = a.event.date_value ?? '';
    const dateB = b.event.date_value ?? '';
    return dateA.localeCompare(dateB);
  });

  for (let i = 1; i < dated.length; i++) {
    const prevYear = dated[i - 1].year!;
    const currYear = dated[i].year!;
    const gap = currYear - prevYear;
    if (gap > 20) dated[i].gapYears = gap;
  }

  return { dated, undated };
});

const datedEvents = computed<TimelineItem[]>(() => data.value?.dated ?? []);
const undatedEvents = computed<TimelineItem[]>(() => data.value?.undated ?? []);

watch(error, (err) => {
  if (err) console.error('[PlaceTimeline] load failed:', err);
});

function handleEntryClick(item: TimelineItem) {
  editingEvent.value = item.event;
  showForm.value = true;
}

function closeForm() {
  showForm.value = false;
  editingEvent.value = null;
}

function onSaved() {
  closeForm();
  reload();
}

defineExpose({ reload });
</script>

<style scoped>
/* Visuals copied verbatim from PersonTimeline.vue so the two timelines look identical. */
.place-timeline { padding: 4px 0; }
.timeline-track { position: relative; padding-left: 80px; }
.timeline-track::before {
  content: ''; position: absolute; left: 74px; top: 8px; bottom: 8px; width: 2px;
  background: var(--color-border, #e2e8f0);
}
.timeline-entry {
  position: relative; display: flex; align-items: flex-start; gap: 12px;
  padding: 6px 8px 6px 0; margin-left: -80px; cursor: pointer; border-radius: 4px;
}
.timeline-entry:hover { background: var(--color-bg-hover, #f8fafc); }
.timeline-entry:focus-visible { outline: 2px solid var(--color-primary, #3b82f6); outline-offset: -2px; }
.timeline-date {
  width: 64px; flex-shrink: 0; text-align: right; font-size: var(--font-xs);
  color: var(--color-text-muted, #64748b); font-variant-numeric: tabular-nums; padding-top: 2px;
}
.is-approximate .timeline-date { font-style: italic; }
.timeline-dot {
  position: relative; flex-shrink: 0; width: 10px; height: 10px; border-radius: 50%;
  background: var(--color-primary, #3b82f6); border: 2px solid var(--color-bg, #fff);
  box-shadow: 0 0 0 2px var(--color-border, #e2e8f0); margin-top: 3px; z-index: 1;
}
.dot-birth { background: #22c55e; box-shadow: 0 0 0 2px #bbf7d0; }
.dot-death { background: #6b7280; box-shadow: 0 0 0 2px #d1d5db; }
.dot-baptism { background: #60a5fa; box-shadow: 0 0 0 2px #bfdbfe; }
.dot-burial { background: #9ca3af; box-shadow: 0 0 0 2px #e5e7eb; }
.dot-marriage { background: #f472b6; box-shadow: 0 0 0 2px #fbcfe8; }
.dot-name_change { background: #a78bfa; box-shadow: 0 0 0 2px #ddd6fe; }
.dot-undated { background: transparent; border: 2px dashed var(--color-text-faint, #94a3b8); box-shadow: none; }
.is-approximate .timeline-dot { border-style: dashed; }
.timeline-content {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-width: 0; padding-top: 1px;
}
.event-badge {
  background: var(--color-event-badge-bg, #f1f5f9); color: var(--color-event-badge-text, #475569);
  padding: 1px 8px; border-radius: 10px; font-size: var(--font-xs); white-space: nowrap;
}
.timeline-persons { font-size: var(--font-sm); color: var(--color-text, #1e293b); }
.timeline-desc { font-size: var(--font-xs); color: var(--color-text-subtle, #94a3b8); font-style: italic; }
.cite-badge {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 16px; height: 16px; border-radius: var(--radius-full);
  background: var(--accent); color: var(--accent-text);
  font-size: var(--font-xs); font-weight: 600; padding: 0 3px;
}
.timeline-gap { position: relative; padding: 4px 0 4px 80px; }
.timeline-gap::before {
  content: ''; position: absolute; left: 74px; top: 0; bottom: 0; width: 2px;
  background: repeating-linear-gradient(
    to bottom,
    var(--color-border, #e2e8f0) 0,
    var(--color-border, #e2e8f0) 3px,
    transparent 3px,
    transparent 6px
  );
}
.gap-label {
  display: inline-block; font-size: var(--font-xs); color: var(--color-text-faint, #94a3b8);
  background: var(--color-bg, #fff); padding: 0 6px; position: relative; left: 8px;
}
.timeline-undated { margin-top: 12px; padding-top: 8px; border-top: 1px dashed var(--color-border, #e2e8f0); }
.undated-label {
  font-size: var(--font-xs); font-weight: 600; color: var(--color-text-faint, #94a3b8);
  text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; padding-left: 4px;
}
.is-undated { margin-left: 0; padding-left: 4px; }
.is-undated .timeline-date { color: var(--color-text-faint, #94a3b8); }
</style>
```

- [ ] **Step 2: Run the component test, verify it passes**

```bash
npx vitest run tests/components/PlaceTimeline.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/PlaceTimeline.vue tests/components/PlaceTimeline.test.ts
git commit -m "feat(renderer): add PlaceTimeline component"
```

---

### Task 4: Wire PlaceTimeline into PlacePanel

**Files:**
- Modify: `src/renderer/components/PlacePanel.vue` (insert section, register import, extend `usePanelSections` defaults)

- [ ] **Step 1: Add import**

In the `<script setup>` block, near the other component imports (search for `import MediaTimeline from './MediaTimeline.vue';`), add:

```ts
import PlaceTimeline from './PlaceTimeline.vue';
```

- [ ] **Step 2: Register the `timeline` section in `usePanelSections`**

Replace the existing `usePanelSections` call (around line 341) with:

```ts
const { sections, toggleSection } = usePanelSections(
  'place-panel-section-',
  {
    place: true, persons: true, events: true, timeline: false, citations: false,
    media: false, mediaTimeline: false, address: false, children: false, quality: false,
  },
  {
    place: true, persons: true, events: true, timeline: true, citations: true,
    media: true, mediaTimeline: true, address: true, children: true, quality: false,
  },
);
```

The two new entries: `timeline: false` (default-collapsed) in the first arg, `timeline: true` (visible) in the second.

- [ ] **Step 3: Insert the Timeline section in the template**

In the template, after the Events section block (search for `<EventList ref="eventListRef" :place-id="placeId!"` — the section that contains it ends with `</div>` after a closing `</div>`) and before the Citations section (search for `<!-- Citations section -->`), insert:

```vue
      <!-- Timeline section -->
      <div class="panel-section">
        <SectionHeader
          :title="$t('placeTimeline.title')"
          :count="eventCount"
          :collapsed="!sections.timeline"
          :action-label="!props.readonly ? '+ ' + $t('events.event') : undefined"
          @toggle="toggleSection('timeline')"
          @action="eventListRef?.openAddForm()"
        />
        <div v-if="sections.timeline" class="panel-section-body">
          <PlaceTimeline :place-id="placeId!" />
        </div>
      </div>
```

The `@action` reuses the existing `eventListRef.openAddForm()` so there is no second authoring path.

- [ ] **Step 4: Run lint and component tests**

```bash
npm run lint
npx vitest run tests/components/
```

Expected: lint clean, all component tests still passing (`PlaceTimeline.test.ts` plus the existing suite).

- [ ] **Step 5: Smoke check in dev app**

```bash
npm start
```

In the running app:
1. Navigate to Places, pick a place with several events.
2. Confirm the Timeline section appears below Events, default-collapsed.
3. Expand it. Confirm dots, dates, gap markers, undated bucket render the way PersonPanel → Timeline does.
4. Click an entry → `EventModal` opens prefilled.
5. Edit and save → Timeline reflects the change without reopening the panel.
6. Click `+ Event` in the Timeline header → adds via the same flow as Events section.

If anything looks off, fix in `PlaceTimeline.vue` or `PlacePanel.vue` and rerun the component test.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/PlacePanel.vue
git commit -m "feat(renderer): add Timeline section to PlacePanel"
```

---

### Task 5: Update UX_INVENTORY.md

**Files:**
- Modify: `docs/UX_INVENTORY.md`

- [ ] **Step 1: Add an index row**

In the `### Places view (PlacesView + PlacePanel)` index table (around line 109–122), insert a new row right after `PlacePanel — Events section`:

```markdown
| PlacePanel — Timeline section | 2026-05-02 |
```

- [ ] **Step 2: Add the full entry**

Insert this new section between the existing `### PlacePanel → Events section` entry and the `### PlacePanel → Citations section` entry:

```markdown
### PlacePanel → Timeline section
**File:** `src/renderer/components/PlacePanel.vue`, `PlaceTimeline.vue`
**Verified:** 2026-05-02

> **Purpose:** A user would use this section to *view* the same events from the Events section laid out chronologically — to see clusters, gaps, and the rhythm of what happened at this place over time — and to *jump* to add a new event.

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| Read-only chronological list of events sorted by date, with dot-per-event-type, dashed dots for approximate dates, gap markers on >20-year jumps, and a separate undated bucket. Same data as the Events section. | `+ Event` chip → routes to the Events section's `+ Add event` flow (no second authoring path). | Not offered — authoring lives in the Events section. | Not offered — deletion lives in the Events section. | Row click → opens the same EventModal as the Events section. |

**Notes:** Default-collapsed. Cross-section coupling: derived read of the Events section. Authoring deliberately lives in one place. Mirror of `PersonPanel → Timeline section` with the person ↔ place axis swapped (person-only concepts dropped: age column, family-tier rendering, birth-first sort priority).

---
```

- [ ] **Step 3: Commit**

```bash
git add docs/UX_INVENTORY.md
git commit -m "docs(ux): document PlacePanel Timeline section"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run full unit + component test suite**

```bash
npm test
```

Expected: all tests pass (no regressions; `PlaceTimeline.test.ts` is included).

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: 0 errors.

- [ ] **Step 3: Confirm user-observable check**

Re-run the smoke check from Task 4, Step 5 — all eight bullets in the Verification section's user-observable check pass.

- [ ] **Step 4: Tick the Self-review checklist below and proceed to plan close-out**

## Self-review checklist (tick before closing the plan)

- [ ] Tests assert rendered DOM structure, not just "function exists." `PlaceTimeline.test.ts` checks: order, gap marker text + count, undated bucket isolation, per-event-type dot class, approximate styling, participant-name rendering, empty state.
- [ ] No new IPC channel was introduced — `events.forPlace` is the existing call.
- [ ] No inferred field is persisted on the `places` row to support this view (Prime Directive in `CLAUDE.md`).
- [ ] PersonTimeline is unchanged. (Mirror is a new component; if a future plan extracts a shared base it can deduplicate, not this one.)
- [ ] UX_INVENTORY entry exists with `Verified: 2026-05-02` and CTA grid.
- [ ] i18n keys exist in both `sv.ts` and `en.ts`.
- [ ] Plan file is at `docs/plans/2026-05-02-place-timeline.md`.
- [ ] Design spec at `docs/plans/2026-05-02-place-timeline-design.md` matches what shipped.

## Plan close-out (per CLAUDE.md "Finishing a plan")

When the Self-review checklist is fully ticked:

1. Move both `2026-05-02-place-timeline.md` and `2026-05-02-place-timeline-design.md` to `docs/plans/archive/` via `git mv`.
2. Bump `package.json` (this is a feature → minor bump) and add a `## Unreleased` line in `CHANGELOG.md` summarising the plan.
3. Commit `chore: archive completed place-timeline-plan` plus the bump.
4. Merge the worktree branch into `main` per `superpowers:finishing-a-development-branch` Option 1, delete the branch, remove the worktree.
