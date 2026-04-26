<template>
  <div class="visualization-view" ref="vizBodyRef">
    <!-- Permanent left list column -->
    <template v-if="listOpen">
      <div class="viz-list-column" :style="{ width: listWidth + 'px' }">
        <h3 class="viz-list-title">{{ $t('persons.listTitle') }}</h3>
        <PersonsListTab embedded @person-added="onPersonAdded" @select="navigateTo" />
        <button class="list-collapse-btn" :aria-label="$t('common.close')" title="Dölj listan" @click="closeList">◀</button>
      </div>
      <div class="list-drag-handle" @mousedown="(e) => startListResize(e, vizBodyRef!)"></div>
    </template>
    <button v-else class="list-open-btn" :aria-label="$t('common.open') ?? 'Open'" title="Visa listan" @click="openList">▶</button>

    <!-- Left sheet -->
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
      <div v-else-if="focalPerson" class="viz-chart-content" data-testid="viz-area">
        <PedigreeChart
          v-if="activeTab === 'pedigree'"
          ref="pedigreeChartRef"
          :key="'pedigree-' + chartKey"
          :person-id="personId"
          :selected-person-id="personId"
          :focused-person="screenReader.isScreenReader.value ? chartNavFocusedPerson : null"
          :readonly="isStaticMode"
          @navigate="navigateTo"
          @reload="reloadChart"
        />
        <HourglassChart
          v-if="activeTab === 'hourglass'"
          ref="hourglassChartRef"
          :key="'hourglass-' + chartKey"
          :person-id="personId"
          :selected-person-id="personId"
          :readonly="isStaticMode"
          @navigate="navigateTo"
          @reload="reloadChart"
        />
        <DescendantChart
          v-if="activeTab === 'descendants'"
          ref="descendantChartRef"
          :key="'descendants-' + chartKey"
          :person-id="personId"
          :selected-person-id="personId"
          :readonly="isStaticMode"
          @navigate="navigateTo"
          @reload="reloadChart"
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
      <button v-if="!panelOpen && personId" class="panel-open-btn" :aria-label="$t('panel.open') ?? 'Open'" @click="openPanel">◀</button>
    </div>

    <!-- Drag handle + panel (both tree and list modes) -->
    <template v-if="panelOpen && personId">
      <div
        class="panel-drag-handle"
        @mousedown="(e) => startResize(e, vizBodyRef!)"
      ></div>
      <div class="viz-panel" :style="{ width: panelWidth + 'px' }">
        <PersonPanel
          :person-id="personId ?? null"
          :readonly="isStaticMode"
          @relative-added="reloadChart"
          @person-changed="reloadChart"
          @close="closePanel"
        />
      </div>
    </template>

    <!-- Add Person Modal -->
    <PersonModal v-if="showAddPerson" mode="standalone" @close="showAddPerson = false" @cancel="showAddPerson = false" @saved="onPersonAdded" />
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
import PersonsListTab from './PersonsListTab.vue';
import { usePanelResize } from '../composables/usePanelResize';
import { useFocusStore } from '../stores/focus';
import { useScreenReaderMode } from '../composables/useScreenReaderMode';
import { useChartNavigation } from '../composables/useChartNavigation';
import { fetchPedigreeTree, fetchHourglassTree } from '../utils/chartData';
import type { Hotkey } from '../composables/useHotkeyRegistry';

defineOptions({ name: 'PersonsView' });

interface Person { id: string; sex: 'M' | 'F' | 'U'; living: boolean; }
interface PersonWithName extends Person { given_name: string; surname: string; }

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const focusStore = useFocusStore();
const ttsEnabled = inject<Ref<boolean>>('ttsEnabled');
const tts = inject<{ speak: (text: string, locale?: string) => void }>('tts');

const isStaticMode = import.meta.env.VITE_STATIC_MODE === 'true';
const focalPerson = ref<Person | null>(null);
const noPersonsExist = ref(false);

// Persistent left list column. Replaces the old tree/list tab toggle —
// list and tree are now always visible side-by-side, with the list
// collapsible via a ▶/◀ button.
const listOpen = ref(localStorage.getItem('persons-list-open') !== 'false');
function openList() {
  listOpen.value = true;
  localStorage.setItem('persons-list-open', 'true');
}
function closeList() {
  listOpen.value = false;
  localStorage.setItem('persons-list-open', 'false');
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

type TabName = 'pedigree' | 'hourglass' | 'descendants' | 'fan' | 'timeline';
const VALID_TABS: readonly TabName[] = ['pedigree', 'hourglass', 'descendants', 'fan', 'timeline'];
const stored = localStorage.getItem('viz-tab');
const initialTab: TabName = stored && (VALID_TABS as readonly string[]).includes(stored) ? (stored as TabName) : 'hourglass';
const activeTab = ref<TabName>(initialTab);

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
const { panelWidth: listWidth, startResize: startListResize } = usePanelResize({
  storageKey: 'persons-list-width',
  side: 'left',
  defaultWidth: 280,
  minWidth: 200,
  maxWidthRatio: 0.4,
});

const personId = computed(() => route.params.personId as string | undefined);

function setTab(tab: TabName) {
  activeTab.value = tab;
  localStorage.setItem('viz-tab', tab);
}

// Click-to-select: makes `id` the selected (and tree-focal) person.
// Selecting a person opens the panel, refocuses the chart, and updates the
// sidebar's selected-person indicator — there is only one notion of "current
// person", everywhere it appears.
async function navigateTo(id: string) {
  if (!panelOpen.value) openPanel();
  if (id !== personId.value) {
    await router.push('/persons/' + id);
  } else {
    await load();
  }
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

async function reloadChart() {
  chartKey.value++;
  await load();
}

async function load() {
  if (!route.path.startsWith('/persons')) return;
  const id = personId.value;
  if (!id) {
    if (focusStore.personId) { router.replace('/persons/' + focusStore.personId); return; }
    const defaultId = await window.api.db.getSetting('default_person_id') as string | null;
    if (defaultId) { router.replace('/persons/' + defaultId); return; }
    const persons = (await window.api.persons.list()) as PersonWithName[];
    noPersonsExist.value = persons.length === 0;
    noFocalPerson.value = persons.length > 0;
    return;
  }
  const person = (await window.api.persons.get(id)) as Person | null;
  if (!person) {
    focalPerson.value = null;
    const defaultId = await window.api.db.getSetting('default_person_id') as string | null;
    if (defaultId && defaultId !== id) { router.replace('/persons/' + defaultId); return; }
    const persons = (await window.api.persons.list()) as PersonWithName[];
    noPersonsExist.value = persons.length === 0;
    noFocalPerson.value = persons.length > 0;
    return;
  }
  focalPerson.value = person;
  if (!panelOpen.value) openPanel();
  // Keep the sidebar's selected-person indicator in sync with whichever
  // person is currently selected (= focal — they're the same thing).
  if (focusStore.personId !== id) {
    try {
      const names = (await window.api.persons.getNames(id)) as Array<{ given_name?: string; surname?: string }>;
      const n = names[0];
      const name = n ? [n.given_name, n.surname].filter(Boolean).join(' ') : '';
      focusStore.set(id, name);
    } catch { /* best-effort */ }
  }
}

// --- Screen reader chart navigation ---
const screenReader = useScreenReaderMode();

const chartNavFocusedPerson = ref<string | null>(null);

const chartNav = useChartNavigation({
  speak: (text: string) => screenReader.speak(text),
  t: t as (key: string, params?: Record<string, string | number>) => string,
  onNavigate: (pid: string) => navigateTo(pid),
  onFocusChanged: (pid: string) => {
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

// Chart inspection bridge — wires Vue state to HTTP endpoints via IPC.
// Selected and focal are now the same thing — there's only one person.
const personIdRef = computed(() => personId.value ?? null);
useChartBridge({
  boxes: chartBoxes,
  selectedPersonId: personIdRef,
  focalPersonId: personIdRef,
  chartType: activeTab,
  selectPerson: navigateTo,
  focusPerson: (id: string) => router.push('/persons/' + id),
});

// When App.vue auto-sets the focus store after this view is already mounted, navigate to that person
watch(() => focusStore.personId, (newId) => {
  if (newId && !personId.value && route.path.startsWith('/persons')) {
    router.replace('/persons/' + newId);
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

/* Drag handle (right panel) */
.panel-drag-handle {
  width: 6px;
  background: var(--surface-border-subtle);
  cursor: col-resize;
  flex-shrink: 0;
  position: relative;
  transition: background 0.1s;
}
.panel-drag-handle:hover { background: var(--surface-border); }

/* Left list column. The right edge reserves space for the collapse
   button so it doesn't overlap the table / heading content. */
.viz-list-column {
  display: flex;
  flex-direction: column;
  position: relative;
  background: var(--surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  flex-shrink: 0;
  min-height: 0;
  padding-right: 28px;
}
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
  border-left: none;
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
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
