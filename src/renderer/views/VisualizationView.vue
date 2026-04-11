<template>
  <div class="visualization-view">
    <div class="header">
      <h2>{{ $t('nav.visualization') }}</h2>
    </div>
    <!-- Tab bar -->
    <div v-if="focalPerson" class="tab-bar" role="tablist">
      <button class="btn-back" @click="router.back()">←</button>
      <button
        role="tab" :aria-selected="activeTab === 'pedigree'"
        :class="['tab-btn', { active: activeTab === 'pedigree' }]"
        data-testid="tab-pedigree" @click="setTab('pedigree')"
      >{{ $t('visualization.tab.pedigree') }}</button>
      <button
        role="tab" :aria-selected="activeTab === 'circle'"
        :class="['tab-btn', { active: activeTab === 'circle' }]"
        data-testid="tab-circle" @click="setTab('circle')"
      >{{ $t('visualization.tab.circle') }}</button>
      <button
        role="tab" :aria-selected="activeTab === 'hourglass'"
        :class="['tab-btn', { active: activeTab === 'hourglass' }]"
        data-testid="tab-hourglass" @click="setTab('hourglass')"
      >{{ $t('visualization.tab.hourglass') }}</button>
      <button
        role="tab" :aria-selected="activeTab === 'descendants'"
        :class="['tab-btn', { active: activeTab === 'descendants' }]"
        data-testid="tab-descendants" @click="setTab('descendants')"
      >{{ $t('visualization.tab.descendants') }}</button>
      <button
        role="tab" :aria-selected="activeTab === 'timeline'"
        :class="['tab-btn', { active: activeTab === 'timeline' }]"
        data-testid="tab-timeline" @click="setTab('timeline')"
      >{{ $t('visualization.tab.timeline') }}</button>
      <button
        v-if="activeTab === 'pedigree'"
        class="btn-sm tab-toggle-btn"
        :aria-label="pedigreeListMode ? $t('a11y.chartView') : $t('a11y.listView')"
        @click="pedigreeListMode = !pedigreeListMode"
      >{{ pedigreeListMode ? $t('a11y.chartView') : $t('a11y.listView') }}</button>
    </div>

    <!-- Empty state -->
    <div v-if="noPersonsExist" class="empty-state" data-testid="viz-empty">
      {{ $t('visualization.empty') }}
    </div>

    <!-- No focal person selected -->
    <div v-else-if="noFocalPerson" class="empty-state" data-testid="viz-no-focal">
      {{ $t('visualization.noFocalPerson') }}
    </div>

    <!-- Chart + panel body -->
    <div v-else-if="focalPerson" class="viz-body" ref="vizBodyRef" data-testid="viz-area">
      <!-- Chart area -->
      <div class="viz-chart-area">
        <PedigreeListView
          v-if="activeTab === 'pedigree' && pedigreeListMode"
          :person-id="personId"
        />
        <PedigreeChart
          v-else-if="activeTab === 'pedigree'"
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
        <HourglassChart
          v-if="activeTab === 'hourglass'"
          :key="'hourglass-' + chartKey"
          :person-id="personId"
          @navigate="navigateTo"
          @reload="reloadChart"
        />
        <DescendantChart
          v-if="activeTab === 'descendants'"
          :person-id="personId"
          @navigate="navigateTo"
          @reload="reloadChart"
        />
        <TimelineChart
          v-if="activeTab === 'timeline'"
          :person-id="personId"
          @navigate="navigateTo"
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
            :person-id="selectedPersonId ?? personId ?? null"
            :show-tree-btn="true"
            @relative-added="reloadChart"
            @show-in-tree="showInTree((selectedPersonId ?? personId)!)"
          />
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, watch, onMounted, onActivated, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { Ref } from 'vue';
import { narratePerson, narrationLabelsFromI18n } from '../utils/narration';
import PedigreeChart from '../components/charts/PedigreeChart.vue';
import PedigreeListView from '../components/charts/PedigreeListView.vue';
import CircleChart from '../components/charts/CircleChart.vue';
import HourglassChart from '../components/charts/HourglassChart.vue';
import DescendantChart from '../components/charts/DescendantChart.vue';
import TimelineChart from '../components/charts/TimelineChart.vue';
import PersonPanel from '../components/PersonPanel.vue';
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
const noFocalPerson = ref(false);
const vizBodyRef = ref<HTMLElement | null>(null);
const chartKey = ref(0);

// Selected node in the chart (may differ from chart focal person)
const selectedPersonId = ref<string | null>(null);

type TabName = 'pedigree' | 'circle' | 'hourglass' | 'descendants' | 'timeline';
const activeTab = ref<TabName>((localStorage.getItem('viz-tab') as TabName) || 'hourglass');

// Pedigree list/chart toggle
const pedigreeListMode = ref(false);

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

function showInTree(id: string) {
  // Explicitly change the chart focal person (re-centers the chart)
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
  // Show focal person in panel unless user has already selected a different node
  if (!selectedPersonId.value) selectedPersonId.value = id;
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
  flex-direction: column;
  height: 100%;
}

/* Back and detail navigation buttons (view-specific) */
.btn-back {
  background: none;
  border: none;
  color: var(--color-primary);
  cursor: pointer;
  padding: 4px 8px;
  font-size: var(--font-lg);
  margin-right: 4px;
}
.btn-back:hover { opacity: 0.7; }

/* List/chart toggle button in pedigree tab */
.tab-toggle-btn {
  margin-left: auto;
  margin-right: 4px;
}

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
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-right: none;
  border-radius: 4px 0 0 4px;
  padding: 6px 5px;
  cursor: pointer;
  color: var(--color-text-faint);
  font-size: var(--font-xs);
  z-index: 10;
}
.panel-open-btn:hover { color: var(--color-text-muted); background: var(--color-bg-subtle); }

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
  max-width: 1040px;
}
.panel-close-btn {
  position: absolute;
  top: 8px;
  left: -1px;
  z-index: 10;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-right: none;
  border-radius: 4px 0 0 4px;
  padding: 4px 5px;
  cursor: pointer;
  color: var(--color-text-faint);
  font-size: var(--font-xs);
  line-height: 1;
  transform: translateX(-100%);
}
.panel-close-btn:hover { color: var(--color-text-muted); }


.empty-state {
  color: #999;
  padding: 60px;
  text-align: center;
  font-size: var(--font-md);
}
</style>
