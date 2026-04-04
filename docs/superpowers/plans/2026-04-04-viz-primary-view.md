# Visualisation Primary View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the hourglass/pedigree chart the primary workspace — clicking a person shows their details in a collapsible, resizable right-side panel without leaving the chart.

**Architecture:** Six self-contained tasks build up in dependency order: i18n keys first (no deps), then EventList readonly prop, then the usePanelResize composable, then PersonPanel, then VisualizationView wiring, then App sidebar. Each task is independently commitable and testable.

**Tech Stack:** Vue 3 Composition API, vue-i18n, Pinia, TypeScript, Vitest (unit tests for pure logic only — no component mount tests, consistent with existing codebase)

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/renderer/i18n/sv.ts` | Add `nav.tree`, `panel.*` keys |
| Modify | `src/renderer/i18n/en.ts` | Same keys in English |
| Modify | `src/renderer/components/EventList.vue` | Add `readonly` prop, hide action buttons |
| Create | `src/renderer/composables/usePanelResize.ts` | Drag-to-resize logic, clamp, localStorage |
| Create | `src/renderer/components/PersonPanel.vue` | Header, empty state, 3 collapsible sections |
| Modify | `src/renderer/views/VisualizationView.vue` | Flex layout, panel slot, toggle, selectedPersonId |
| Modify | `src/renderer/App.vue` | Icon + label sidebar, narrower width |

---

## Task 1: i18n keys

**Files:**
- Modify: `src/renderer/i18n/sv.ts`
- Modify: `src/renderer/i18n/en.ts`

- [ ] **Step 1: Add Swedish keys to `src/renderer/i18n/sv.ts`**

  Add the `panel` block and update `nav.visualization` to `nav.tree` (keep old key as alias to avoid breaking anything elsewhere — just add the new key). Locate the `nav:` block (line 6) and `visualization:` block (line 314) and apply:

  ```typescript
  // In the nav block, add after line 8 (nav.persons):
  tree: 'Träd',
  // Keep existing nav.visualization unchanged (still used by App.vue until Task 6)
  ```

  Add a new top-level `panel:` block before `placeTypes:` (after line 330):

  ```typescript
  panel: {
    noPersonSelected: 'Klicka på en person i trädet',
    showInTree: 'Visa i träd',
    open: 'Öppna',
    events: 'Händelser',
    relationships: 'Relationer',
    notes: 'Anteckningar',
    noNotes: 'Inga anteckningar',
  },
  ```

- [ ] **Step 2: Add English keys to `src/renderer/i18n/en.ts`**

  Apply the same structure — find the matching locations in `en.ts` and add:

  ```typescript
  // In nav block:
  tree: 'Tree',

  // New panel block (before placeTypes or at end):
  panel: {
    noPersonSelected: 'Click a person in the tree',
    showInTree: 'Show in tree',
    open: 'Open',
    events: 'Events',
    relationships: 'Relationships',
    notes: 'Notes',
    noNotes: 'No notes',
  },
  ```

- [ ] **Step 3: Run tests to confirm nothing broken**

  ```bash
  npm test
  ```

  Expected: all tests pass (i18n changes are additive).

- [ ] **Step 4: Commit**

  ```bash
  git add -A
  git commit -m "feat(i18n): add panel and tree nav keys"
  ```

---

## Task 2: EventList readonly prop

**Files:**
- Modify: `src/renderer/components/EventList.vue:95-98` (defineProps)
- Modify: `src/renderer/components/EventList.vue:5` (add button button)
- Modify: `src/renderer/components/EventList.vue:19,33,34` (row/buttons)

- [ ] **Step 1: Add `readonly` to defineProps**

  At line 95 in `EventList.vue`, the current props are:

  ```typescript
  const props = defineProps<{
    personId?: string;
    relationshipId?: string;
  }>();
  ```

  Change to:

  ```typescript
  const props = defineProps<{
    personId?: string;
    relationshipId?: string;
    readonly?: boolean;
  }>();
  ```

- [ ] **Step 2: Hide "Lägg till händelse" button when readonly**

  Line 5 currently:
  ```html
  <button type="button" class="btn-add" @click="showForm = true">{{ $t('events.addEvent') }}</button>
  ```

  Change to:
  ```html
  <button v-if="!props.readonly" type="button" class="btn-add" @click="showForm = true">{{ $t('events.addEvent') }}</button>
  ```

- [ ] **Step 3: Hide cite + delete buttons when readonly, disable row click**

  Line 19 currently:
  ```html
  <tr class="clickable-row" @click="editEvent(event)">
  ```
  Change to:
  ```html
  <tr :class="['clickable-row', { 'non-interactive': props.readonly }]" @click="!props.readonly && editEvent(event)">
  ```

  Line 33-34 (cite + delete buttons):
  ```html
  <button type="button" class="btn-sm btn-cite" @click.stop="openCiteForm(event.id)">{{ $t('events.citeSources') }}</button>
  <button type="button" class="btn-sm btn-delete" @click.stop="removeEvent(event.id)">{{ $t('common.delete') }}</button>
  ```
  Wrap both in `<template v-if="!props.readonly">`:
  ```html
  <template v-if="!props.readonly">
    <button type="button" class="btn-sm btn-cite" @click.stop="openCiteForm(event.id)">{{ $t('events.citeSources') }}</button>
    <button type="button" class="btn-sm btn-delete" @click.stop="removeEvent(event.id)">{{ $t('common.delete') }}</button>
  </template>
  ```

- [ ] **Step 4: Add `.non-interactive` CSS at the bottom of EventList's `<style scoped>`**

  ```css
  tr.non-interactive { cursor: default; }
  tr.non-interactive:hover { background: transparent; }
  ```

- [ ] **Step 5: Run tests**

  ```bash
  npm test
  ```

  Expected: all tests pass.

- [ ] **Step 6: Commit**

  ```bash
  git add -A
  git commit -m "feat(EventList): add readonly prop to hide add/edit/delete actions"
  ```

---

## Task 3: usePanelResize composable

**Files:**
- Create: `src/renderer/composables/usePanelResize.ts`
- Create: `tests/unit/usePanelResize.test.ts`

- [ ] **Step 1: Write the failing unit test**

  Create `tests/unit/usePanelResize.test.ts`:

  ```typescript
  import { describe, it, expect } from 'vitest';
  import { clampWidth } from '../../src/renderer/composables/usePanelResize';

  describe('clampWidth', () => {
    it('clamps to minimum', () => {
      expect(clampWidth(100)).toBe(200);
    });
    it('clamps to maximum', () => {
      expect(clampWidth(600)).toBe(520);
    });
    it('passes through valid width', () => {
      expect(clampWidth(300)).toBe(300);
    });
    it('clamps exact boundary values', () => {
      expect(clampWidth(200)).toBe(200);
      expect(clampWidth(520)).toBe(520);
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  npm test -- tests/unit/usePanelResize.test.ts
  ```

  Expected: FAIL — "Cannot find module '../../src/renderer/composables/usePanelResize'"

- [ ] **Step 3: Create `src/renderer/composables/usePanelResize.ts`**

  ```typescript
  import { ref, onUnmounted } from 'vue';

  const MIN_WIDTH = 200;
  const MAX_WIDTH = 520;
  const DEFAULT_WIDTH = 300;
  const STORAGE_KEY = 'viz-panel-width';

  export function clampWidth(w: number): number {
    return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w));
  }

  export function usePanelResize() {
    const stored = parseInt(localStorage.getItem(STORAGE_KEY) ?? '', 10);
    const panelWidth = ref(clampWidth(isNaN(stored) ? DEFAULT_WIDTH : stored));

    let rafId: number | null = null;

    function startResize(e: MouseEvent, containerEl: HTMLElement) {
      e.preventDefault();

      function onMove(ev: MouseEvent) {
        if (rafId !== null) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          const right = containerEl.getBoundingClientRect().right;
          panelWidth.value = clampWidth(right - ev.clientX);
        });
      }

      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
        localStorage.setItem(STORAGE_KEY, String(panelWidth.value));
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    }

    onUnmounted(() => {
      if (rafId !== null) cancelAnimationFrame(rafId);
    });

    return { panelWidth, startResize };
  }
  ```

- [ ] **Step 4: Run tests to verify they pass**

  ```bash
  npm test -- tests/unit/usePanelResize.test.ts
  ```

  Expected: 4 tests pass.

- [ ] **Step 5: Run full test suite**

  ```bash
  npm test
  ```

  Expected: all tests pass.

- [ ] **Step 6: Commit**

  ```bash
  git add -A
  git commit -m "feat: add usePanelResize composable with clamp + localStorage"
  ```

---

## Task 4: PersonPanel component

**Files:**
- Create: `src/renderer/components/PersonPanel.vue`

- [ ] **Step 1: Create `src/renderer/components/PersonPanel.vue`**

  ```vue
  <template>
    <div class="person-panel">
      <!-- Empty state -->
      <div v-if="!personId" class="panel-empty">
        {{ $t('panel.noPersonSelected') }}
      </div>

      <template v-else-if="person">
        <!-- Header -->
        <div class="panel-header">
          <div class="panel-sex-bar" :style="{ background: sexColor }"></div>
          <div class="panel-header-content">
            <div class="panel-name">
              <PersonName
                :given-name="primaryName?.given_name ?? null"
                :surname="primaryName?.surname ?? null"
                :preferred-name="primaryName?.preferred_name ?? null"
              />
            </div>
            <div class="panel-dates">{{ personDates }}</div>
            <div class="panel-actions">
              <button class="panel-btn" @click="$emit('focus', personId)">
                🌳 {{ $t('panel.showInTree') }}
              </button>
              <router-link :to="'/persons/' + personId" class="panel-link">
                {{ $t('panel.open') }} →
              </router-link>
            </div>
          </div>
        </div>

        <!-- Händelser section -->
        <div class="panel-section">
          <button class="panel-section-header" @click="toggleSection('events')">
            <span class="panel-chevron">{{ sections.events ? '▾' : '▸' }}</span>
            {{ $t('panel.events') }}
          </button>
          <div v-if="sections.events" class="panel-section-body">
            <EventList :person-id="personId" :readonly="true" />
          </div>
        </div>

        <!-- Relationer section -->
        <div class="panel-section">
          <button class="panel-section-header" @click="toggleSection('relationships')">
            <span class="panel-chevron">{{ sections.relationships ? '▾' : '▸' }}</span>
            {{ $t('panel.relationships') }}
          </button>
          <div v-if="sections.relationships" class="panel-section-body">
            <div v-if="relationships.length === 0" class="panel-empty-section">—</div>
            <div
              v-for="rel in relationships"
              :key="rel.id"
              class="panel-rel-row"
            >
              <span class="panel-rel-type">{{ relLabel(rel) }}</span>
              <button
                v-if="rel.otherId"
                class="panel-rel-person"
                @click="$emit('select', rel.otherId)"
              >{{ rel.otherName }}</button>
            </div>
          </div>
        </div>

        <!-- Anteckningar section -->
        <div class="panel-section">
          <button class="panel-section-header" @click="toggleSection('notes')">
            <span class="panel-chevron">{{ sections.notes ? '▾' : '▸' }}</span>
            {{ $t('panel.notes') }}
          </button>
          <div v-if="sections.notes" class="panel-section-body panel-notes">
            {{ person.notes || $t('panel.noNotes') }}
          </div>
        </div>
      </template>
    </div>
  </template>

  <script setup lang="ts">
  import { ref, watch, computed, reactive } from 'vue';
  import { useI18n } from 'vue-i18n';
  import EventList from './EventList.vue';
  import PersonName from './PersonName.vue';

  declare const window: Window & {
    api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
  };

  const { t } = useI18n();

  const props = defineProps<{ personId: string | null }>();
  const emit = defineEmits<{
    focus: [id: string];
    select: [id: string];
  }>();

  // ── Local state ──────────────────────────────────────────────────────────────

  interface PersonData { id: string; sex: 'M' | 'F' | 'U'; living: boolean; notes: string | null; birthYear: number | null; deathYear: number | null; }
  interface NameData { given_name: string; surname: string; preferred_name: string | null; sort_order: number; }
  interface RelRow { id: string; type: string; subtype: string | null; otherId: string | null; otherName: string; }

  const person = ref<PersonData | null>(null);
  const primaryName = ref<NameData | null>(null);
  const relationships = ref<RelRow[]>([]);

  // Section open/closed — persisted per key
  function loadSection(key: string, def: boolean): boolean {
    const v = localStorage.getItem(`viz-panel-section-${key}`);
    return v === null ? def : v === 'true';
  }
  const sections = reactive({
    events: loadSection('events', true),
    relationships: loadSection('relationships', false),
    notes: loadSection('notes', false),
  });

  function toggleSection(key: keyof typeof sections) {
    sections[key] = !sections[key];
    localStorage.setItem(`viz-panel-section-${key}`, String(sections[key]));
  }

  // ── Derived ──────────────────────────────────────────────────────────────────

  const SEX_COLORS: Record<string, string> = { M: '#7eb8f7', F: '#f7a5c0', U: '#ccc' };
  const sexColor = computed(() => SEX_COLORS[person.value?.sex ?? 'U'] ?? '#ccc');

  const personDates = computed(() => {
    const p = person.value;
    if (!p) return '';
    if (p.birthYear && p.deathYear) return `${p.birthYear}–${p.deathYear}`;
    if (p.birthYear) return p.living ? `f. ${p.birthYear}` : `${p.birthYear}–`;
    return '';
  });

  const REL_TYPE_LABELS: Record<string, string> = {
    couple: 'Partner', parent_child: 'Förälder/barn', sibling: 'Syskon',
    godparent: 'Fadder', other: 'Annan',
  };
  function relLabel(rel: RelRow): string {
    return rel.subtype ?? REL_TYPE_LABELS[rel.type] ?? rel.type;
  }

  // ── Data loading ─────────────────────────────────────────────────────────────

  async function loadPerson(id: string) {
    const raw = (await window.api.persons.get(id)) as { id: string; sex: string; living: boolean; notes: string | null } | null;
    if (!raw) { person.value = null; return; }

    const names = (await window.api.persons.getNames(id)) as NameData[];
    const sorted = [...names].sort((a, b) => a.sort_order - b.sort_order);
    primaryName.value = sorted[0] ?? null;

    // Get birth/death years from events
    const events = (await window.api.events.forPerson(id)) as Array<{ event_type: string; date_value: string | null }>;
    const birth = events.find(e => e.event_type === 'birth');
    const death = events.find(e => e.event_type === 'death');
    const parseYear = (v: string | null) => v ? parseInt(v.slice(0, 4)) || null : null;

    person.value = {
      id: raw.id,
      sex: raw.sex as 'M' | 'F' | 'U',
      living: raw.living,
      notes: raw.notes,
      birthYear: parseYear(birth?.date_value ?? null),
      deathYear: parseYear(death?.date_value ?? null),
    };

    await loadRelationships(id);
  }

  async function loadRelationships(id: string) {
    const rels = (await window.api.relationships.forPerson(id)) as Array<{
      id: string; type: string; subtype: string | null;
      person1_id: string | null; person2_id: string | null;
    }>;

    const rows: RelRow[] = await Promise.all(rels.map(async rel => {
      const otherId = rel.person1_id === id ? rel.person2_id : rel.person1_id;
      let otherName = t('common.unknown');
      if (otherId) {
        const otherNames = (await window.api.persons.getNames(otherId)) as NameData[];
        const first = [...otherNames].sort((a, b) => a.sort_order - b.sort_order)[0];
        if (first) {
          const gn = first.preferred_name ?? first.given_name ?? '';
          const sn = first.surname ?? '';
          otherName = [gn, sn].filter(Boolean).join(' ');
        }
      }
      return { id: rel.id, type: rel.type, subtype: rel.subtype, otherId, otherName };
    }));

    relationships.value = rows;
  }

  watch(() => props.personId, async (id) => {
    person.value = null;
    relationships.value = [];
    if (id) await loadPerson(id);
  }, { immediate: true });
  </script>

  <style scoped>
  .person-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow-y: auto;
    background: white;
    font-size: 13px;
  }

  .panel-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #aaa;
    font-size: 13px;
    padding: 24px;
    text-align: center;
  }

  /* Header */
  .panel-header {
    display: flex;
    border-bottom: 1px solid #eee;
    flex-shrink: 0;
  }
  .panel-sex-bar {
    width: 4px;
    flex-shrink: 0;
  }
  .panel-header-content {
    padding: 10px 14px 10px 10px;
    flex: 1;
    min-width: 0;
  }
  .panel-name {
    font-size: 14px;
    font-weight: 600;
    color: #1a2a3a;
    margin-bottom: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .panel-dates {
    font-size: 12px;
    color: #888;
    margin-bottom: 8px;
  }
  .panel-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .panel-btn {
    font-size: 12px;
    padding: 3px 8px;
    background: #f0f0f0;
    border: 1px solid #ddd;
    border-radius: 4px;
    cursor: pointer;
    color: #444;
    white-space: nowrap;
  }
  .panel-btn:hover { background: #e8e8e8; }
  .panel-link {
    font-size: 12px;
    color: #2980b9;
    text-decoration: none;
    white-space: nowrap;
  }
  .panel-link:hover { text-decoration: underline; }

  /* Sections */
  .panel-section {
    border-bottom: 1px solid #eee;
    flex-shrink: 0;
  }
  .panel-section-header {
    width: 100%;
    text-align: left;
    background: #fafafa;
    border: none;
    padding: 8px 14px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    color: #333;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .panel-section-header:hover { background: #f0f0f0; }
  .panel-chevron { font-size: 10px; color: #999; }
  .panel-section-body { padding: 4px 0 8px; }
  .panel-empty-section { padding: 4px 14px; color: #bbb; font-size: 12px; }
  .panel-notes { padding: 8px 14px; color: #555; white-space: pre-wrap; font-size: 12px; }

  /* Relationships */
  .panel-rel-row {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 4px 14px;
  }
  .panel-rel-type { font-size: 11px; color: #aaa; white-space: nowrap; }
  .panel-rel-person {
    background: none;
    border: none;
    padding: 0;
    font-size: 12px;
    color: #2980b9;
    cursor: pointer;
    text-align: left;
  }
  .panel-rel-person:hover { text-decoration: underline; }
  </style>
  ```

- [ ] **Step 2: Verify in the browser**

  Import and render `<PersonPanel person-id="<any-valid-id>" />` from a temporary spot (or proceed to Task 5 and test through VisualizationView). The component should:
  - Show person name + dates in header
  - Show `🌳 Visa i träd` button and `Öppna →` link
  - Show Händelser section open by default with events listed
  - Show Relationer and Anteckningar sections collapsed
  - Show "Klicka på en person i trädet" when `personId` is null

- [ ] **Step 3: Run tests**

  ```bash
  npm test
  ```

  Expected: all tests pass.

- [ ] **Step 4: Commit**

  ```bash
  git add -A
  git commit -m "feat: add PersonPanel component with collapsible sections"
  ```

---

## Task 5: VisualizationView — flex layout + panel + toggle

**Files:**
- Modify: `src/renderer/views/VisualizationView.vue`

- [ ] **Step 1: Replace VisualizationView.vue with updated version**

  Replace the entire file with the following. Key changes vs the current version:
  - The `viz-header` is removed (focal name moved to panel)
  - A new `viz-body` flex row holds chart area + drag handle + panel
  - `selectedPersonId` drives the panel
  - Charts emit `@navigate` which now sets `selectedPersonId` instead of routing
  - `navigateTo` is now only called from the panel's `focus` emit
  - Panel open/closed and width come from `usePanelResize` + `panelOpen` ref

  ```vue
  <template>
    <div class="visualization-view">
      <!-- Tab bar -->
      <div v-if="focalPerson" class="viz-tabs" role="tablist">
        <div class="viz-focal-label">
          <PersonName
            :given-name="focalGivenName"
            :surname="focalSurname"
            :preferred-name="focalPreferredName"
          />
        </div>
        <button
          role="tab" :aria-selected="activeTab === 'pedigree'"
          :class="['tab', { active: activeTab === 'pedigree' }]"
          data-testid="tab-pedigree" @click="setTab('pedigree')"
        >{{ $t('visualization.tab.pedigree') }}</button>
        <button
          role="tab" :aria-selected="activeTab === 'hourglass'"
          :class="['tab', { active: activeTab === 'hourglass' }]"
          data-testid="tab-hourglass" @click="setTab('hourglass')"
        >{{ $t('visualization.tab.hourglass') }}</button>
        <button
          role="tab" :aria-selected="activeTab === 'timeline'"
          :class="['tab', { active: activeTab === 'timeline' }]"
          data-testid="tab-timeline" @click="setTab('timeline')"
        >{{ $t('visualization.tab.timeline') }}</button>
      </div>

      <!-- Empty state -->
      <div v-if="noPersonsExist" class="empty-state" data-testid="viz-empty">
        {{ $t('visualization.empty') }}
      </div>

      <!-- Chart + panel body -->
      <div v-else-if="focalPerson" class="viz-body" ref="vizBodyRef" data-testid="viz-area">
        <!-- Chart area -->
        <div class="viz-chart-area">
          <PedigreeChart
            v-if="activeTab === 'pedigree'"
            :person-id="personId"
            @navigate="selectedPersonId = $event"
          />
          <HourglassChart
            v-if="activeTab === 'hourglass'"
            :person-id="personId"
            @navigate="selectedPersonId = $event"
          />
          <TimelineChart
            v-if="activeTab === 'timeline'"
            :person-id="personId"
            @navigate="selectedPersonId = $event"
          />
          <!-- Reopen panel button when panel is closed -->
          <button v-if="!panelOpen" class="panel-open-btn" @click="openPanel">▶</button>
        </div>

        <!-- Drag handle + panel -->
        <template v-if="panelOpen">
          <div
            class="panel-drag-handle"
            @mousedown="(e) => startResize(e, vizBodyRef!)"
          ></div>
          <div class="viz-panel" :style="{ width: panelWidth + 'px' }">
            <button class="panel-close-btn" @click="closePanel" title="Dölj panel">◀</button>
            <PersonPanel
              :person-id="selectedPersonId"
              @focus="navigateTo"
              @select="selectedPersonId = $event"
            />
          </div>
        </template>
      </div>
    </div>
  </template>

  <script setup lang="ts">
  import { ref, computed, watch, onMounted } from 'vue';
  import { useRoute, useRouter } from 'vue-router';
  import { useI18n } from 'vue-i18n';
  import PedigreeChart from '../components/charts/PedigreeChart.vue';
  import HourglassChart from '../components/charts/HourglassChart.vue';
  import TimelineChart from '../components/charts/TimelineChart.vue';
  import PersonName from '../components/PersonName.vue';
  import PersonPanel from '../components/PersonPanel.vue';
  import { usePanelResize } from '../composables/usePanelResize';

  declare const window: Window & {
    api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
  };

  interface Person { id: string; sex: 'M' | 'F' | 'U'; living: boolean; }
  interface PersonWithName extends Person { given_name: string; surname: string; }

  useI18n();
  const route = useRoute();
  const router = useRouter();

  const focalPerson = ref<Person | null>(null);
  const focalGivenName = ref<string | null>(null);
  const focalSurname = ref<string | null>(null);
  const focalPreferredName = ref<string | null>(null);
  const noPersonsExist = ref(false);
  const selectedPersonId = ref<string | null>(null);
  const vizBodyRef = ref<HTMLElement | null>(null);

  type TabName = 'pedigree' | 'hourglass' | 'timeline';
  const activeTab = ref<TabName>((localStorage.getItem('viz-tab') as TabName) || 'hourglass');

  // Panel open/closed
  const panelOpen = ref(localStorage.getItem('viz-panel-open') !== 'false');
  function openPanel() {
    panelOpen.value = true;
    localStorage.setItem('viz-panel-open', 'true');
  }
  function closePanel() {
    panelOpen.value = false;
    localStorage.setItem('viz-panel-open', 'false');
  }

  const { panelWidth, startResize } = usePanelResize();

  const personId = computed(() => route.params.personId as string | undefined);

  function setTab(tab: TabName) {
    activeTab.value = tab;
    localStorage.setItem('viz-tab', tab);
  }

  function navigateTo(id: string) {
    selectedPersonId.value = null;
    router.push('/visualisering/' + id);
  }

  // Clear selection when focal changes
  watch(personId, () => { selectedPersonId.value = null; });

  async function load() {
    const id = personId.value;
    if (!id) {
      const last = localStorage.getItem('viz-focal-person');
      if (last) { router.replace('/visualisering/' + last); return; }
      const persons = (await window.api.persons.list()) as PersonWithName[];
      if (persons.length > 0) { router.replace('/visualisering/' + persons[0].id); }
      else { noPersonsExist.value = true; }
      return;
    }
    localStorage.setItem('viz-focal-person', id);
    const person = (await window.api.persons.get(id)) as Person | null;
    if (!person) { focalPerson.value = null; return; }
    focalPerson.value = person;
    const names = (await window.api.persons.getNames(id)) as Array<{ given_name: string; surname: string; preferred_name: string | null; sort_order: number }>;
    const primary = names.sort((a, b) => a.sort_order - b.sort_order)[0];
    focalGivenName.value = primary?.given_name ?? null;
    focalSurname.value = primary?.surname ?? null;
    focalPreferredName.value = primary?.preferred_name ?? null;
  }

  watch(() => route.params.personId, load);
  onMounted(load);
  </script>

  <style scoped>
  .visualization-view {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  /* Tab bar */
  .viz-tabs {
    display: flex;
    align-items: center;
    gap: 4px;
    border-bottom: 2px solid #e5e7eb;
    padding: 0 12px;
    flex-shrink: 0;
    background: white;
  }
  .viz-focal-label {
    font-size: 14px;
    font-weight: 600;
    color: #2c3e50;
    margin-right: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
  }
  .tab {
    background: none;
    border: none;
    padding: 10px 16px;
    cursor: pointer;
    font-size: 13px;
    color: #666;
    border-bottom: 2px solid transparent;
    margin-bottom: -2px;
    border-radius: 4px 4px 0 0;
    white-space: nowrap;
  }
  .tab:hover { color: #2c3e50; background: #f9f9f9; }
  .tab.active { color: #2c3e50; border-bottom-color: #2c3e50; font-weight: 600; }

  /* Body: chart + panel */
  .viz-body {
    flex: 1;
    display: flex;
    flex-direction: row;
    min-height: 0;
    position: relative;
  }
  .viz-chart-area {
    flex: 1;
    min-width: 0;
    position: relative;
    overflow: hidden;
  }

  /* Panel reopen button */
  .panel-open-btn {
    position: absolute;
    top: 50%;
    right: 0;
    transform: translateY(-50%);
    background: white;
    border: 1px solid #ddd;
    border-right: none;
    border-radius: 4px 0 0 4px;
    padding: 6px 5px;
    cursor: pointer;
    color: #999;
    font-size: 11px;
    z-index: 10;
  }
  .panel-open-btn:hover { color: #555; background: #f5f5f5; }

  /* Drag handle */
  .panel-drag-handle {
    width: 6px;
    background: #e8e8e8;
    cursor: col-resize;
    flex-shrink: 0;
    position: relative;
    transition: background 0.1s;
  }
  .panel-drag-handle:hover { background: #c0c0c0; }

  /* Panel */
  .viz-panel {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    border-left: 1px solid #e0e0e0;
    position: relative;
    overflow: hidden;
    min-width: 200px;
    max-width: 520px;
  }
  .panel-close-btn {
    position: absolute;
    top: 8px;
    left: -1px;
    z-index: 10;
    background: white;
    border: 1px solid #ddd;
    border-right: none;
    border-radius: 4px 0 0 4px;
    padding: 4px 5px;
    cursor: pointer;
    color: #bbb;
    font-size: 10px;
    line-height: 1;
    transform: translateX(-100%);
  }
  .panel-close-btn:hover { color: #555; }

  .empty-state {
    color: #999;
    padding: 60px;
    text-align: center;
    font-size: 15px;
  }
  </style>
  ```

- [ ] **Step 2: Verify in the browser**

  Open the app, navigate to `/visualisering`. Verify:
  - Tabs show "Stamtavla | Timglas | Tidslinje" with focal name on left
  - Panel appears on the right, showing "Klicka på en person i trädet"
  - Clicking a person in the chart shows their details in the panel
  - "🌳 Visa i träd" re-focuses the chart
  - `◀` button collapses panel; `▶` button reopens it
  - Dragging the handle resizes the panel between 200px and 520px
  - Panel width + open state survive page reload

- [ ] **Step 3: Run tests**

  ```bash
  npm test
  ```

  Expected: all tests pass.

- [ ] **Step 4: Commit**

  ```bash
  git add -A
  git commit -m "feat(VisualizationView): add person panel, drag resize, and panel toggle"
  ```

---

## Task 6: App.vue sidebar — icon + label

**Files:**
- Modify: `src/renderer/App.vue`

- [ ] **Step 1: Update the sidebar nav template**

  Replace the nav `<router-link>` elements in the sidebar with icon+label format. Change the sidebar width from 200px to 120px and restructure links:

  In the `<template>` section, replace the existing `<router-link>` lines:
  ```html
  <router-link to="/visualisering">{{ $t('nav.visualization') }}</router-link>
  <router-link to="/">{{ $t('nav.persons') }}</router-link>
  <router-link to="/relationships">{{ $t('nav.relationships') }}</router-link>
  <router-link to="/places">{{ $t('places.title') }}</router-link>
  <router-link to="/sources">{{ $t('nav.sources') }}</router-link>
  ```

  With:
  ```html
  <router-link to="/visualisering" class="nav-item">
    <span class="nav-icon">🌳</span>
    <span class="nav-label">{{ $t('nav.tree') }}</span>
  </router-link>
  <router-link to="/" class="nav-item">
    <span class="nav-icon">👤</span>
    <span class="nav-label">{{ $t('nav.persons') }}</span>
  </router-link>
  <router-link to="/relationships" class="nav-item">
    <span class="nav-icon">🔗</span>
    <span class="nav-label">{{ $t('nav.relationships') }}</span>
  </router-link>
  <router-link to="/places" class="nav-item">
    <span class="nav-icon">📍</span>
    <span class="nav-label">{{ $t('places.title') }}</span>
  </router-link>
  <router-link to="/sources" class="nav-item">
    <span class="nav-icon">📚</span>
    <span class="nav-label">{{ $t('nav.sources') }}</span>
  </router-link>
  ```

- [ ] **Step 2: Update sidebar CSS**

  In the `<style>` block, change `.sidebar` width from `200px` to `110px` and add nav-item styles. Replace the `.sidebar` rule and `.sidebar a` rule:

  ```css
  .sidebar {
    width: 110px;
    background: #2c3e50;
    color: white;
    padding: 16px 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .sidebar h1 {
    font-size: 13px;
    margin-bottom: 12px;
    padding-bottom: 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.2);
    text-align: center;
  }

  .sidebar a,
  .nav-item {
    color: rgba(255, 255, 255, 0.65);
    text-decoration: none;
    padding: 8px 6px;
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
  }

  .sidebar a:hover,
  .sidebar a.router-link-active,
  .nav-item:hover,
  .nav-item.router-link-active {
    background: rgba(255, 255, 255, 0.12);
    color: white;
  }

  .nav-icon { font-size: 18px; line-height: 1; }
  .nav-label { font-size: 10px; text-align: center; }
  ```

  Also update `.sidebar-search-input` to fit the narrower sidebar — it's already `width: 100%` so no change needed there.

- [ ] **Step 3: Verify in browser**

  Open the app. The sidebar should show:
  - 🌳 Träd
  - 👤 Personer
  - 🔗 Relationer
  - 📍 (Places title from i18n)
  - 📚 Källor
  
  Active route should be highlighted. Sidebar should be ~110px wide, giving more space to the main content area.

- [ ] **Step 4: Run tests**

  ```bash
  npm test
  ```

  Expected: all tests pass.

- [ ] **Step 5: Commit + version bump (minor — new feature)**

  Update `package.json` version from `0.9.4` → `1.0.0` (this is a significant UX milestone).

  ```bash
  # Edit package.json: "version": "1.0.0"
  git add -A
  git commit -m "feat: visualisation as primary view with person panel and icon sidebar"
  ```

---

## Self-Review

**Spec coverage:**
- ✅ Sidebar icon+label, Swedish names → Task 6
- ✅ Visualisation primary view → Task 5 (existing route, now default tab is hourglass)
- ✅ Click person → show in panel (no navigation) → Task 5 (`@navigate` → `selectedPersonId`)
- ✅ PersonPanel header with sex bar, name, dates → Task 4
- ✅ "Visa i träd" re-focus button → Task 4 (`focus` emit → Task 5 `navigateTo`)
- ✅ "Öppna →" link → Task 4
- ✅ Collapsible sections: Händelser, Relationer, Anteckningar → Task 4
- ✅ EventList readonly mode → Task 2
- ✅ Draggable panel edge, min 200 / max 520 → Task 3 + Task 5
- ✅ Panel width persisted to localStorage → Task 3
- ✅ Panel open/closed persisted → Task 5
- ✅ Section open/closed persisted → Task 4
- ✅ Empty panel state → Task 4
- ✅ i18n keys → Task 1
- ✅ Click selected person in relationships → selects them in panel → Task 4 (`select` emit)

**Gaps found:** None.

**Type consistency check:** `selectedPersonId: ref<string | null>` flows from VisualizationView → PersonPanel prop `personId: string | null` → EventList prop `personId?: string` (undefined when null, which is safe). `focus` and `select` emits both carry `string`. ✅
