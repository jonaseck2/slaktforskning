<template>
  <div class="visualization-view" ref="vizBodyRef">
    <!-- Left sheet -->
    <div class="viz-chart-area" :class="{ 'viz-list-mode': viewMode === 'list' }">
      <div class="header">
        <h2>{{ $t('nav.people') }}</h2>
        <div class="header-right">
          <div class="view-toggle">
            <AppButton :variant="viewMode === 'tree' ? 'soft' : 'ghost'" size="sm" @click="setViewMode('tree')">{{ $t('visualization.tab.tree') }}</AppButton>
            <AppButton :variant="viewMode === 'list' ? 'soft' : 'ghost'" size="sm" @click="setViewMode('list')">{{ $t('visualization.listView') }}</AppButton>
          </div>
          <AppButton variant="soft" @click="showAddPerson = true">+ {{ $t('persons.addPerson') }}</AppButton>
        </div>
      </div>

      <!-- List mode: person list -->
      <PersonsView v-if="viewMode === 'list'" embedded @person-added="onPersonAdded" />

      <!-- Tree mode: tab bar + chart -->
      <template v-if="viewMode === 'tree'">
      <!-- Tab bar -->
      <div v-if="focalPerson" class="viz-tab-bar">
        <AppButton variant="ghost" size="sm" @click="router.back()">←</AppButton>
        <FilterChips
          :model-value="activeTab"
          :options="[
            { value: 'pedigree',    label: $t('visualization.tab.pedigree') },
            { value: 'circle',      label: $t('visualization.tab.circle') },
            { value: 'fan',         label: $t('visualization.tab.fan') },
            { value: 'hourglass',   label: $t('visualization.tab.hourglass') },
            { value: 'descendants', label: $t('visualization.tab.descendants') },
            { value: 'timeline',    label: $t('visualization.tab.timeline') },
          ]"
          @update:model-value="setTab($event as TabName)"
        />
      </div>

      <!-- Empty state -->
      <div v-if="noPersonsExist" class="empty-state" data-testid="viz-empty">
        {{ $t('visualization.empty') }}
      </div>

      <!-- No focal person selected -->
      <div v-else-if="noFocalPerson" class="empty-state" data-testid="viz-no-focal">
        {{ $t('visualization.noFocalPerson') }}
      </div>

      <!-- Chart content -->
      <div v-else-if="focalPerson" class="viz-chart-content" data-testid="viz-area">
        <PedigreeChart
          v-if="activeTab === 'pedigree'"
          ref="pedigreeChartRef"
          :key="'pedigree-' + chartKey"
          :person-id="personId"
          :selected-person-id="selectedPersonId"
          :focused-person="screenReader.isScreenReader.value ? chartNavFocusedPerson : null"
          @navigate="navigateTo"
          @reload="reloadChart"
        />
        <CircleChart
          v-if="activeTab === 'circle'"
          :person-id="personId"
          @navigate="navigateTo"
        />
        <FanChart
          v-if="activeTab === 'fan'"
          :person-id="personId"
          @navigate="navigateTo"
        />
        <HourglassChart
          v-if="activeTab === 'hourglass'"
          ref="hourglassChartRef"
          :key="'hourglass-' + chartKey"
          :person-id="personId"
          :selected-person-id="selectedPersonId"
          @navigate="navigateTo"
          @reload="reloadChart"
        />
        <DescendantChart
          v-if="activeTab === 'descendants'"
          ref="descendantChartRef"
          :key="'descendants-' + chartKey"
          :person-id="personId"
          :selected-person-id="selectedPersonId"
          @navigate="navigateTo"
          @reload="reloadChart"
        />
        <TimelineChart
          v-if="activeTab === 'timeline'"
          :person-id="personId"
          @navigate="navigateTo"
        />
      </div>
      <!-- Reopen panel button when panel is closed -->
      <button v-if="!panelOpen" class="panel-open-btn" @click="openPanel">▶</button>
      </template>
    </div>

    <!-- Drag handle + panel (right sheet, tree mode only) -->
    <template v-if="panelOpen && viewMode === 'tree'">
      <div
        class="panel-drag-handle"
        @mousedown="(e) => startResize(e, vizBodyRef!)"
      ></div>
      <div class="viz-panel" :style="{ width: panelWidth + 'px' }">
        <PersonPanel
          :person-id="selectedPersonId ?? personId ?? null"
          :show-tree-btn="true"
          @relative-added="reloadChart"
          @person-changed="reloadChart"
          @show-in-tree="showInTree((selectedPersonId ?? personId)!)"
          @close="closePanel"
        />
      </div>
    </template>

    <!-- Add Person Modal -->
    <AddPersonModal v-if="showAddPerson" @close="showAddPerson = false" @saved="onPersonAdded" />
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
import FilterChips from '../components/ui/FilterChips.vue';
import PedigreeChart from '../components/charts/PedigreeChart.vue';
import CircleChart from '../components/charts/CircleChart.vue';
import FanChart from '../components/charts/FanChart.vue';
import HourglassChart from '../components/charts/HourglassChart.vue';
import DescendantChart from '../components/charts/DescendantChart.vue';
import TimelineChart from '../components/charts/TimelineChart.vue';
import PersonPanel from '../components/PersonPanel.vue';
import AddPersonModal from '../components/AddPersonModal.vue';
import PersonsView from './PersonsView.vue';
import { usePanelResize } from '../composables/usePanelResize';
import { useFocusStore } from '../stores/focus';
import { useScreenReaderMode } from '../composables/useScreenReaderMode';
import { useChartNavigation } from '../composables/useChartNavigation';
import { fetchPedigreeTree, fetchHourglassTree } from '../utils/chartData';
import type { Hotkey } from '../composables/useHotkeyRegistry';

interface Person { id: string; sex: 'M' | 'F' | 'U'; living: boolean; }
interface PersonWithName extends Person { given_name: string; surname: string; }

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const focusStore = useFocusStore();
const ttsEnabled = inject<Ref<boolean>>('ttsEnabled');
const tts = inject<{ speak: (text: string, locale?: string) => void }>('tts');

const focalPerson = ref<Person | null>(null);
const noPersonsExist = ref(false);

// View mode: tree or list
type ViewMode = 'tree' | 'list';
const viewMode = ref<ViewMode>(
  (localStorage.getItem('persons-view-mode') as ViewMode) || 'tree'
);
function setViewMode(mode: ViewMode) {
  viewMode.value = mode;
  localStorage.setItem('persons-view-mode', mode);
}

// Add person modal
const showAddPerson = ref(false);

function onPersonAdded(person: { id: string }) {
  showAddPerson.value = false;
  router.push('/visualisering/' + person.id);
}
const noFocalPerson = ref(false);
const vizBodyRef = ref<HTMLElement | null>(null);
const chartKey = ref(0);

// Selected node in the chart (may differ from chart focal person)
const selectedPersonId = ref<string | null>(null);

// Template refs for chart components — used by useChartBridge to read layout boxes
const pedigreeChartRef = ref<{ boxes: BoxLayout[] } | null>(null);
const hourglassChartRef = ref<{ boxes: BoxLayout[] } | null>(null);
const descendantChartRef = ref<{ boxes: BoxLayout[] } | null>(null);

// Boxes from whichever chart is currently active
const chartBoxes = computed<BoxLayout[]>(() => {
  if (activeTab.value === 'pedigree') return pedigreeChartRef.value?.boxes ?? [];
  if (activeTab.value === 'hourglass') return hourglassChartRef.value?.boxes ?? [];
  if (activeTab.value === 'descendants') return descendantChartRef.value?.boxes ?? [];
  return [];
});

type TabName = 'pedigree' | 'circle' | 'fan' | 'hourglass' | 'descendants' | 'timeline';
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

function selectNode(id: string) {
  selectedPersonId.value = id;
  if (!panelOpen.value) openPanel();
}

async function navigateTo(id: string) {
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

async function showInTree(id: string) {
  // Update sidebar focus indicator
  try {
    const names = (await window.api.persons.getNames(id)) as { given_name: string; surname: string }[];
    const n = names[0];
    const name = n ? [n.given_name, n.surname].filter(Boolean).join(' ') : '';
    focusStore.set(id, name);
  } catch { /* best-effort */ }
  // Change the chart focal person (re-centers the chart)
  router.push('/visualisering/' + id);
}

async function reloadChart() {
  chartKey.value++;
  await load();
}

async function load() {
  const id = personId.value;
  if (!id) {
    if (focusStore.personId) { router.replace('/visualisering/' + focusStore.personId); return; }
    const last = localStorage.getItem('viz-focal-person');
    if (last) { router.replace('/visualisering/' + last); return; }
    const persons = (await window.api.persons.list()) as PersonWithName[];
    noPersonsExist.value = persons.length === 0;
    noFocalPerson.value = persons.length > 0;
    return;
  }
  localStorage.setItem('viz-focal-person', id);
  const person = (await window.api.persons.get(id)) as Person | null;
  if (!person) { focalPerson.value = null; return; }
  focalPerson.value = person;
  // Panel falls back to personId when selectedPersonId is null — no need to set it here.
  // Placeholders only appear when the user actively clicks a person in the chart.
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
  focusPerson: (id: string) => router.push('/visualisering/' + id),
});

// When App.vue auto-sets the focus store after this view is already mounted, navigate to that person
watch(() => focusStore.personId, (newId) => {
  if (newId && !personId.value) {
    router.replace('/visualisering/' + newId);
  }
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
}

/* Left sheet: header + tabs + chart */
.header-right { display: flex; align-items: center; gap: 8px; }
.view-toggle { display: flex; gap: 2px; }
.viz-chart-area > .header {
  padding: var(--space-lg) var(--space-lg) 0;
  margin-bottom: var(--space-sm);
}
.viz-list-mode {
  padding: var(--space-lg);
  overflow-y: auto;
}
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
}
.viz-chart-content {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
  padding: var(--space-sm) var(--space-lg) var(--space-lg);
}

/* Tab bar row: back button + FilterChips + optional toggle */
.viz-tab-bar {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-lg);
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

/* Panel */
.viz-panel {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  position: relative;
  min-width: 200px;
  max-width: 1040px;
}


.empty-state {
  color: var(--text-muted);
  padding: 60px;
  text-align: center;
  font-size: var(--font-md);
}
</style>
