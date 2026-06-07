<template>
  <div class="visualization-view" ref="vizBodyRef">
    <!-- Permanent left list column -->
    <template v-if="listOpen">
      <div class="viz-list-column list-column" :style="{ width: listWidth + 'px' }">
        <h3 class="viz-list-title">{{ $t('persons.listTitle') }}</h3>
        <PersonsListTab embedded @person-added="onPersonAdded" @select="selectNode" />
        <button class="list-collapse-btn" :aria-label="$t('common.close')" :title="$t('common.close')" @click="closeList">◀</button>
      </div>
      <div class="list-drag-handle" @mousedown="(e) => startListResize(e, vizBodyRef!)"></div>
    </template>
    <button v-else class="list-open-btn" :aria-label="$t('common.open')" :title="$t('common.open')" @click="openList">▶</button>

    <!-- Tree column -->
    <div class="viz-chart-area">
      <div class="header">
        <h2>{{ $t('persons.familyTree') }}</h2>
        <div class="header-right">
          <AppButton v-if="!isStaticMode" variant="soft" @click="showAddPerson = true">+ {{ $t('persons.addPerson') }}</AppButton>
        </div>
      </div>

      <!-- Tree: tab bar + chart -->
      <FilterChips
        v-if="focalPerson"
        class="viz-tabs"
        role="tablist"
        tabpanel-id-prefix="viz"
        :aria-label="$t('persons.familyTree')"
        :model-value="activeTab"
        :options="[
          { value: 'pedigree',    label: $t('visualization.tab.pedigree') },
          { value: 'hourglass',   label: $t('visualization.tab.hourglass') },
          { value: 'descendants', label: $t('visualization.tab.descendants') },
          { value: 'fan',         label: $t('visualization.tab.fan') },
          { value: 'timeline',    label: $t('visualization.tab.timeline') },
        ]"
        @update:model-value="setTab($event as TabName)"
      />

      <!-- Empty state -->
      <AppEmptyState v-if="noPersonsExist" icon="🌳" :title="$t('empty.persons')" :description="$t('empty.treeDesc')" :action-label="isStaticMode ? undefined : $t('empty.addPerson')" data-testid="viz-empty" @action="showAddPerson = true" />

      <!-- No focal person selected -->
      <AppEmptyState v-else-if="noFocalPerson" icon="🌳" :title="$t('visualization.noFocalPerson')" :description="$t('empty.noFocalPerson')" data-testid="viz-no-focal" />

      <!-- Chart content -->
      <div
        v-else-if="focalPerson"
        class="viz-chart-content"
        data-testid="viz-area"
        role="tabpanel"
        :id="`viz-${activeTab}`"
        :aria-labelledby="`viz-tab-${activeTab}`"
      >
        <PedigreeChart
          v-if="activeTab === 'pedigree'"
          ref="pedigreeChartRef"
          :key="'pedigree-' + chartKey"
          :person-id="personId"
          :selected-person-id="selectedPersonId"
          :focused-person="screenReader.isScreenReader.value ? chartNavFocusedPerson : null"
          :readonly="isStaticMode"
          @navigate="navigateTo"
          @reload="reloadChart"
          @person-context-menu="openContextMenu"
          @focus-person="setTreeSubject"
        />
        <!-- Single-focus invariant (Bengt R50). HourglassChart intentionally does NOT receive
             :focused-person — its highlight is driven solely by :selected-person-id. If you
             ever wire :focused-person to HourglassChart, you MUST de-duplicate against
             selectedPersonId, otherwise two boxes can render the focal fill simultaneously. -->
        <HourglassChart
          v-if="activeTab === 'hourglass'"
          ref="hourglassChartRef"
          :key="'hourglass-' + chartKey"
          :person-id="personId"
          :selected-person-id="selectedPersonId"
          :readonly="isStaticMode"
          @navigate="navigateTo"
          @reload="reloadChart"
          @person-context-menu="openContextMenu"
          @focus-person="setTreeSubject"
        />
        <DescendantChart
          v-if="activeTab === 'descendants'"
          ref="descendantChartRef"
          :key="'descendants-' + chartKey"
          :person-id="personId"
          :selected-person-id="selectedPersonId"
          :focused-person="screenReader.isScreenReader.value ? chartNavFocusedPerson : null"
          :readonly="isStaticMode"
          @navigate="navigateTo"
          @reload="reloadChart"
          @person-context-menu="openContextMenu"
          @focus-person="setTreeSubject"
        />
        <FanChart
          v-if="activeTab === 'fan'"
          :person-id="personId"
          :readonly="isStaticMode"
          @navigate="navigateTo"
        />
        <TimelineChart
          v-if="activeTab === 'timeline'"
          :person-id="personId"
          :readonly="isStaticMode"
          @navigate="navigateTo"
        />
      </div>
      <!-- Reopen panel button when panel is closed -->
      <button v-if="!panelOpen && (selectedPersonId || personId)" class="panel-open-btn" :aria-label="$t('panel.open') ?? 'Open'" @click="openPanel">◀</button>
    </div>

    <!-- Drag handle + panel (both tree and list modes) -->
    <template v-if="panelOpen && (selectedPersonId || personId)">
      <div
        class="panel-drag-handle"
        @mousedown="(e) => startResize(e, vizBodyRef!)"
      ></div>
      <div class="viz-panel" :style="{ width: panelWidth + 'px' }">
        <PersonPanel
          :person-id="selectedPersonId ?? personId ?? null"
          :show-tree-btn="true"
          :tree-subject-id="personId ?? null"
          :readonly="isStaticMode"
          @set-tree-subject="setTreeSubject((selectedPersonId ?? personId)!)"
          @close="closePanel"
        />
      </div>
    </template>

    <!-- Add Person Modal -->
    <PersonModal v-if="showAddPerson" mode="standalone" @close="showAddPerson = false" @cancel="showAddPerson = false" @saved="onPersonAdded" />

    <!-- Add-relative modal triggered from the chart context menu -->
    <PersonModal
      v-if="ctxAddRelative"
      mode="standalone"
      :add-related-to="ctxAddRelative"
      @close="ctxAddRelative = null"
      @cancel="ctxAddRelative = null"
      @saved="onCtxRelativeSaved"
    />

    <!-- Chart person right-click context menu -->
    <PersonContextMenu
      v-if="ctxMenu"
      :visible="!!ctxMenu"
      :person-id="ctxMenu.personId"
      :x="ctxMenu.x"
      :y="ctxMenu.y"
      :is-tree-subject="ctxMenu.personId === personId"
      :readonly="isStaticMode"
      :add-only="ctxMenu.addOnly"
      @close="ctxMenu = null"
      @set-tree-subject="onCtxSetTreeSubject"
      @select-person="onCtxSelectPerson"
      @add-relative="onCtxAddRelative"
      @delete-person="onCtxDeletePerson"
    />

    <!-- Delete confirm triggered from the chart context menu -->
    <ConfirmModal
      :visible="!!ctxDeleteId"
      :title="$t('persons.deleteConfirmTitle')"
      :message="$t('persons.confirmDelete')"
      tone="danger"
      icon="⚠️"
      :confirm-label="$t('persons.deleteConfirmContinue')"
      @cancel="ctxDeleteId = null"
      @confirm="onCtxConfirmDelete"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, watch, onMounted, onActivated, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { Ref } from 'vue';
import type { BoxLayout } from '../utils/chart-layout/types';
import { useChartBridge } from '../composables/useChartBridge';
import { narratePerson, narrationLabelsFromI18n } from '../utils/narration';
import AppButton from '../components/ui/AppButton.vue';
import AppEmptyState from '../components/ui/AppEmptyState.vue';
import FilterChips from '../components/ui/FilterChips.vue';
import PedigreeChart from '../components/charts/PedigreeChart.vue';
import FanChart from '../components/charts/FanChart.vue';
import HourglassChart from '../components/charts/HourglassChart.vue';
import DescendantChart from '../components/charts/DescendantChart.vue';
import TimelineChart from '../components/charts/TimelineChart.vue';
import PersonPanel from '../components/PersonPanel.vue';
import PersonModal from '../components/modals/PersonModal.vue';
import PersonContextMenu from '../components/charts/PersonContextMenu.vue';
import ConfirmModal from '../components/ConfirmModal.vue';
import { useToast } from '../composables/useToast';
import PersonsListTab from './PersonsListTab.vue';
import { usePanelResize } from '../composables/usePanelResize';
import { useSelectedPersonStore } from '../stores/selectedPerson';
import { useScreenReaderMode } from '../composables/useScreenReaderMode';
import { useChartNavigation } from '../composables/useChartNavigation';
import { fetchPedigreeTree, fetchHourglassTree } from '../utils/chartData';
import { STORAGE_KEYS } from '../utils/storage-keys';
import type { Hotkey } from '../composables/useHotkeyRegistry';

defineOptions({ name: 'PersonsView' });

interface Person { id: string; sex: 'M' | 'F' | 'U'; living: boolean; }
interface PersonWithName extends Person { given_name: string; surname: string; }

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const ttsEnabled = inject<Ref<boolean>>('ttsEnabled');
const tts = inject<{ speak: (text: string, locale?: string) => void }>('tts');

const isStaticMode = import.meta.env.VITE_STATIC_MODE === 'true';
const focalPerson = ref<Person | null>(null);
const noPersonsExist = ref(false);

// Persistent left list column. The list and tree are always visible
// side-by-side, with the list collapsible via a ▶/◀ button.
const listOpen = ref(localStorage.getItem(STORAGE_KEYS.personsListOpen) !== 'false');
function openList() {
  listOpen.value = true;
  localStorage.setItem(STORAGE_KEYS.personsListOpen, 'true');
}
function closeList() {
  listOpen.value = false;
  localStorage.setItem(STORAGE_KEYS.personsListOpen, 'false');
}

// Add person modal
const showAddPerson = ref(false);

function onPersonAdded(person: { id: string }) {
  showAddPerson.value = false;
  router.push('/persons/' + person.id);
}
const noFocalPerson = ref(false);
const vizBodyRef = ref<HTMLElement | null>(null);
const chartKey = ref(0);

// Selected node in the chart (may differ from chart focal person).
// Lives in a store so the sidebar PersonPicker can write to it without
// touching the URL / tree focal.
const selectedStore = useSelectedPersonStore();
const selectedPersonId = computed(() => selectedStore.personId);

// Template refs for chart components — used by useChartBridge to read layout
// boxes. Charts auto-subscribe to onDataChanged via useEntityData and handle
// in-place refresh themselves, so this view no longer needs a refetch hook.
type ChartHandle = { boxes: BoxLayout[]; refetch: () => Promise<void> };
const pedigreeChartRef = ref<ChartHandle | null>(null);
const hourglassChartRef = ref<ChartHandle | null>(null);
const descendantChartRef = ref<ChartHandle | null>(null);

// Boxes from whichever chart is currently active
const chartBoxes = computed<BoxLayout[]>(() => {
  if (activeTab.value === 'pedigree') return pedigreeChartRef.value?.boxes ?? [];
  if (activeTab.value === 'hourglass') return hourglassChartRef.value?.boxes ?? [];
  if (activeTab.value === 'descendants') return descendantChartRef.value?.boxes ?? [];
  return [];
});

type TabName = 'pedigree' | 'hourglass' | 'descendants' | 'fan' | 'timeline';
const VALID_TABS: readonly TabName[] = ['pedigree', 'hourglass', 'descendants', 'fan', 'timeline'];
const stored = localStorage.getItem(STORAGE_KEYS.vizTab);
const initialTab: TabName = stored && (VALID_TABS as readonly string[]).includes(stored) ? (stored as TabName) : 'hourglass';
const activeTab = ref<TabName>(initialTab);

// Panel open/closed
const panelOpen = ref(localStorage.getItem(STORAGE_KEYS.vizPanelOpen) !== 'false');
function openPanel() {
  panelOpen.value = true;
  localStorage.setItem(STORAGE_KEYS.vizPanelOpen, 'true');
}
function closePanel() {
  panelOpen.value = false;
  localStorage.setItem(STORAGE_KEYS.vizPanelOpen, 'false');
}

const { panelWidth, startResize } = usePanelResize();
const { panelWidth: listWidth, startResize: startListResize } = usePanelResize({
  storageKey: STORAGE_KEYS.personsListWidth,
  side: 'left',
  defaultWidth: 280,
  minWidth: 200,
  maxWidthRatio: 0.4,
});

const personId = computed(() => route.params.personId as string | undefined);

function setTab(tab: TabName) {
  activeTab.value = tab;
  localStorage.setItem(STORAGE_KEYS.vizTab, tab);
}

function selectNode(id: string) {
  selectedStore.set(id);
  if (!panelOpen.value) openPanel();
}

async function navigateTo(id: string) {
  // Click-to-select: open panel and highlight, but do NOT re-root the tree.
  // The tree subject only changes via the "Set as tree subject" button.
  selectNode(id);
  if (!ttsEnabled?.value || !tts) return;
  try {
    const person = await window.api.persons.get(id) as { id: string; sex: string } | null;
    if (!person) return;
    const names = await window.api.persons.getNames(id) as Array<{ given_name?: string; surname?: string }>;
    const n = names[0];
    const name = n ? [n.given_name, n.surname].filter(Boolean).join(' ') : '';
    if (!name) return;

    let birthDate: string | undefined;
    let deathDate: string | undefined;
    try {
      const events = await window.api.events.forPerson(id) as Array<{ event_type: string; date_value: string | null }>;
      birthDate = events.find(e => e.event_type === 'birth')?.date_value ?? undefined;
      deathDate = events.find(e => e.event_type === 'death')?.date_value ?? undefined;
    } catch { /* ignore */ }

    const text = narratePerson({ name, birthDate, deathDate }, narrationLabelsFromI18n(t));
    tts.speak(text, locale.value);
  } catch { /* ignore */ }
}

async function setTreeSubject(id: string) {
  // Persist as the database's default person (used for export SUBM and startup nav)
  try {
    await window.api.db.setSetting('default_person_id', id);
  } catch { /* best-effort */ }
  // Re-root the tree on the new subject
  router.push('/persons/' + id);
}

// ── Right-click context menu on chart person boxes ──────────────────────────

const toast = useToast();

interface CtxMenuState { personId: string; x: number; y: number; addOnly?: boolean }
const ctxMenu = ref<CtxMenuState | null>(null);

type AddRelativeMode = 'father' | 'mother' | 'spouse' | 'son' | 'daughter';
interface AddRelativeTarget { personId: string; mode: AddRelativeMode; personSex?: 'M' | 'F' | 'U'; personSurname?: string }
const ctxAddRelative = ref<AddRelativeTarget | null>(null);

const ctxDeleteId = ref<string | null>(null);

function openContextMenu(payload: { personId: string; x: number; y: number }) {
  // The + button on each person box only opens the add-family-member
  // shortcuts — no navigation, no delete. There is no longer a right-click
  // pathway, so every chart-emitted menu request is add-only.
  ctxMenu.value = { ...payload, addOnly: true };
}
function onCtxSetTreeSubject(id: string) {
  ctxMenu.value = null;
  setTreeSubject(id);
}
function onCtxSelectPerson(id: string) {
  ctxMenu.value = null;
  navigateTo(id);
}
async function onCtxAddRelative(payload: { personId: string; mode: AddRelativeMode }) {
  // Look up sex + surname so PersonModal can pre-fill the new relative
  // exactly like the panel's add-relative buttons do.
  let personSex: 'M' | 'F' | 'U' | undefined;
  let personSurname: string | undefined;
  try {
    const p = await window.api.persons.get(payload.personId) as { sex?: string } | null;
    personSex = (p?.sex as 'M' | 'F' | 'U') || 'U';
    const names = await window.api.persons.getNames(payload.personId) as Array<{ surname?: string; sort_order?: number }>;
    personSurname = names.length > 0 ? [...names].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0]?.surname ?? undefined : undefined;
  } catch { /* ignore */ }
  ctxMenu.value = null;
  ctxAddRelative.value = { ...payload, personSex, personSurname };
}
function onCtxRelativeSaved() {
  ctxAddRelative.value = null;
  reloadChart();
}
function onCtxDeletePerson(id: string) {
  ctxMenu.value = null;
  ctxDeleteId.value = id;
}
async function onCtxConfirmDelete() {
  const id = ctxDeleteId.value;
  ctxDeleteId.value = null;
  if (!id) return;
  try {
    await window.api.persons.delete(id);
    toast.success(t('persons.deletedToast', { name: t('common.unknown') }));
    if (id === personId.value) {
      // Tree subject was deleted → bounce to /persons so the next default loads
      router.push('/persons');
    } else {
      reloadChart();
    }
  } catch (err) {
    console.error('[PersonsView] context-menu delete failed:', err);
    toast.error(t('errors.deleteFailed'));
  }
}

async function reloadChart() {
  chartKey.value++;
  await load();
}

async function load() {
  if (!route.path.startsWith('/persons')) return;
  const id = personId.value;
  if (!id) {
    const defaultId = await window.api.db.getSetting('default_person_id') as string | null;
    if (defaultId) { router.replace('/persons/' + defaultId); return; }
    // Just check whether any persons exist — fetch one row, not the whole table.
    // The previous `persons.list()` call returned all 22k rows + their joined
    // names just to compare length to zero, hammering the worker on PersonsView mount.
    const probe = await window.api.persons.listPage(1, 0, 'surname', 'asc') as { persons: Array<{ id: string }>; total: number };
    noPersonsExist.value = probe.total === 0;
    // Render-time fallback: when persons exist but the user hasn't set a
    // tree subject yet, focus the first person (alphabetical by surname) so
    // the tree never opens to a blank screen on a fresh import. Don't
    // persist this — the user remains free to set their own subject. Per
    // .claude/rules/plans.md "User goal first": surfaced by the 2026-05-09
    // Bernadotte test session where opening the app on a fresh DB showed
    // a blank Timglas chart and the user thought the tree was broken.
    if (probe.total > 0 && probe.persons[0]?.id) {
      router.replace('/persons/' + probe.persons[0].id);
      return;
    }
    noFocalPerson.value = probe.total > 0;
    return;
  }
  const person = (await window.api.persons.get(id)) as Person | null;
  if (!person) {
    focalPerson.value = null;
    const defaultId = await window.api.db.getSetting('default_person_id') as string | null;
    if (defaultId && defaultId !== id) { router.replace('/persons/' + defaultId); return; }
    // Just check whether any persons exist — fetch one row, not the whole table.
    // The previous `persons.list()` call returned all 22k rows + their joined
    // names just to compare length to zero, hammering the worker on PersonsView mount.
    const probe = await window.api.persons.listPage(1, 0, 'surname', 'asc') as { persons: Array<{ id: string }>; total: number };
    noPersonsExist.value = probe.total === 0;
    if (probe.total > 0 && probe.persons[0]?.id && probe.persons[0].id !== id) {
      router.replace('/persons/' + probe.persons[0].id);
      return;
    }
    noFocalPerson.value = probe.total > 0;
    return;
  }
  focalPerson.value = person;
  // Sync the panel's selected person to the tree subject whenever the route
  // changes. selectNode() runs afterwards for chart clicks and overrides
  // with the clicked person.
  selectedStore.set(id);
  if (!panelOpen.value) openPanel();
}

// --- Screen reader chart navigation ---
const screenReader = useScreenReaderMode();

const chartNavFocusedPerson = ref<string | null>(null);

const chartNav = useChartNavigation({
  speak: (text: string) => screenReader.speak(text),
  t: t as (key: string, params?: Record<string, string | number>) => string,
  onNavigate: (pid: string) => navigateTo(pid),
  onFocusChanged: (pid: string) => {
    selectNode(pid);
    chartNavFocusedPerson.value = pid;
  },
});

// Register arrow-key hotkeys when in screen reader mode
let unregisterChartHotkeys: (() => void) | null = null;

function registerChartHotkeys() {
  if (unregisterChartHotkeys) return; // already registered
  const hotkeys: Hotkey[] = [
    { key: 'ArrowUp', action: () => chartNav.moveUp(), description: t('screenReader.chartFather', { name: '', summary: '' }).split(':')[0] },
    { key: 'ArrowDown', action: () => chartNav.moveDown(), description: t('screenReader.chartChild', { name: '', summary: '' }).split(':')[0] },
    { key: 'ArrowLeft', action: () => chartNav.moveLeft(), description: t('screenReader.chartMother', { name: '', summary: '' }).split(':')[0] },
    { key: 'ArrowRight', action: () => chartNav.moveRight(), description: t('screenReader.chartSpouse', { name: '', summary: '' }).split(':')[0] },
    {
      key: 'Enter',
      action: () => {
        const pid = chartNav.currentPersonId();
        if (pid) navigateTo(pid);
      },
      description: t('screenReader.chartOpening', { name: '' }),
    },
  ];
  unregisterChartHotkeys = screenReader.registerHotkeys(hotkeys);
}

function unregisterChartNav() {
  if (unregisterChartHotkeys) {
    unregisterChartHotkeys();
    unregisterChartHotkeys = null;
  }
}

// Initialize chart navigation when tree data would be available
async function initChartNav() {
  if (!screenReader.isScreenReader.value || !personId.value) return;
  try {
    if (activeTab.value === 'pedigree') {
      const tree = await fetchPedigreeTree(personId.value);
      chartNav.initPedigree(tree);
      registerChartHotkeys();
    } else if (activeTab.value === 'hourglass') {
      const tree = await fetchHourglassTree(personId.value);
      chartNav.initHourglass(tree);
      registerChartHotkeys();
    }
  } catch {
    // ignore — chart may not have loaded yet
  }
}

// Re-init navigation when tab or person changes in screen reader mode
watch([() => activeTab.value, () => personId.value, () => screenReader.isScreenReader.value], () => {
  unregisterChartNav();
  if (screenReader.isScreenReader.value && (activeTab.value === 'pedigree' || activeTab.value === 'hourglass')) {
    initChartNav();
  }
});

onUnmounted(() => {
  unregisterChartNav();
});

// Chart inspection bridge — wires Vue state to HTTP endpoints via IPC
useChartBridge({
  boxes: chartBoxes,
  selectedPersonId,
  focalPersonId: computed(() => personId.value ?? null),
  chartType: activeTab,
  selectPerson: selectNode,
  focusPerson: (id: string) => setTreeSubject(id),
});

watch(() => route.params.personId, load);
onMounted(load);
onActivated(load);
</script>

<style scoped>
.visualization-view {
  display: flex;
  flex-direction: row;
  height: 100%;
  gap: var(--space-xs);
  position: relative;
}

/* Left sheet: header + tabs + chart */
.header-right { display: flex; align-items: center; gap: 8px; }
.view-toggle { display: flex; gap: 2px; }
.viz-chart-area {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  background: var(--surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: var(--space-lg);
}
.viz-list-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.viz-chart-content {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
}
.viz-tabs {
  margin-bottom: var(--space-sm);
}

/* Panel reopen button */
.panel-open-btn {
  position: absolute;
  top: 50%;
  right: 0;
  transform: translateY(-50%);
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-right: none;
  border-radius: var(--radius-sm) 0 0 var(--radius-sm);
  padding: 6px 5px;
  cursor: pointer;
  color: var(--text-muted);
  font-size: var(--font-xs);
  z-index: 10;
}
.panel-open-btn:hover { color: var(--text-secondary); background: var(--surface-hover); }

/* Drag handle */
.panel-drag-handle {
  width: 6px;
  background: var(--surface-border-subtle);
  cursor: col-resize;
  flex-shrink: 0;
  position: relative;
  transition: background 0.1s;
}
.panel-drag-handle:hover { background: var(--surface-border); }

/* Layout, surface, and `padding-right: 28px` for the collapse tab come
   from `.list-column` in shared.css. */
.viz-list-title {
  margin: 0;
  padding: var(--space-md) var(--space-md) var(--space-sm);
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--text-primary);
  border-bottom: 1px solid var(--surface-border-subtle);
  flex-shrink: 0;
}
.viz-list-column :deep(.persons-view-content) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: var(--space-md);
}
.list-collapse-btn {
  position: absolute;
  top: 50%;
  right: 0;
  transform: translateY(-50%);
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-right: none;
  border-radius: var(--radius-sm) 0 0 var(--radius-sm);
  padding: 6px 5px;
  cursor: pointer;
  color: var(--text-muted);
  font-size: var(--font-xs);
  z-index: 10;
}
.list-collapse-btn:hover { color: var(--text-secondary); background: var(--surface-hover); }
.list-open-btn {
  position: absolute;
  top: 50%;
  left: 0;
  transform: translateY(-50%);
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-left: none;
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  padding: 6px 5px;
  cursor: pointer;
  color: var(--text-muted);
  font-size: var(--font-xs);
  z-index: 10;
}
.list-open-btn:hover { color: var(--text-secondary); background: var(--surface-hover); }
.list-drag-handle {
  width: 6px;
  background: var(--surface-border-subtle);
  cursor: col-resize;
  flex-shrink: 0;
  transition: background 0.1s;
}
.list-drag-handle:hover { background: var(--surface-border); }

/* Panel */
.viz-panel {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  position: relative;
  min-width: 200px;
  max-width: 1040px;
}

</style>
