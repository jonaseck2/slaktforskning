<template>
  <div class="visualization-view">
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
        role="tab" :aria-selected="activeTab === 'timeline'"
        :class="['tab-btn', { active: activeTab === 'timeline' }]"
        data-testid="tab-timeline" @click="setTab('timeline')"
      >{{ $t('visualization.tab.timeline') }}</button>
      <button class="btn-detail" @click="router.push('/persons/' + personId)">{{ $t('visualization.viewDetail') }}</button>
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
        <PedigreeChart
          v-if="activeTab === 'pedigree'"
          :person-id="personId"
          @navigate="navigateTo"
        />
        <CircleChart
          v-if="activeTab === 'circle'"
          :person-id="personId"
          @navigate="navigateTo"
        />
        <HourglassChart
          v-if="activeTab === 'hourglass'"
          :person-id="personId"
          @navigate="navigateTo"
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
          <div v-if="selectedPersonId && selectedPersonId !== personId" class="panel-show-in-tree">
            <button class="btn-show-in-tree" @click="showInTree(selectedPersonId!)">{{ $t('panel.showInTree') }} →</button>
          </div>
          <PersonPanel
            :person-id="selectedPersonId ?? personId ?? null"
          />
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onActivated } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import PedigreeChart from '../components/charts/PedigreeChart.vue';
import CircleChart from '../components/charts/CircleChart.vue';
import HourglassChart from '../components/charts/HourglassChart.vue';
import TimelineChart from '../components/charts/TimelineChart.vue';
import PersonPanel from '../components/PersonPanel.vue';
import { usePanelResize } from '../composables/usePanelResize';
import { useFocusStore } from '../stores/focus';
import { fullNameParts } from '../utils/nameUtils';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface Person { id: string; sex: 'M' | 'F' | 'U'; living: boolean; }
interface PersonWithName extends Person { given_name: string; surname: string; }

useI18n();
const route = useRoute();
const router = useRouter();
const focusStore = useFocusStore();

const focalPerson = ref<Person | null>(null);
const noPersonsExist = ref(false);
const noFocalPerson = ref(false);
const vizBodyRef = ref<HTMLElement | null>(null);

// Selected node in the chart (may differ from chart focal person)
const selectedPersonId = ref<string | null>(null);

type TabName = 'pedigree' | 'circle' | 'hourglass' | 'timeline';
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

async function selectNode(id: string) {
  selectedPersonId.value = id;
  if (!panelOpen.value) openPanel();
  // Set app-wide focus without re-centering the chart
  try {
    const names = (await window.api.persons.getNames(id)) as Array<{ given_name: string; surname: string; preferred_name: string | null; nickname: string | null; sort_order: number }>;
    const primary = names.sort((a, b) => a.sort_order - b.sort_order)[0];
    const name = fullNameParts(primary?.given_name ?? null, primary?.surname ?? null, primary?.preferred_name ?? null, primary?.nickname ?? null).map(p => p.text).join('');
    focusStore.set(id, name);
  } catch { /* ignore */ }
}

function navigateTo(id: string) {
  // Single-click on chart node: set focus without re-centering
  selectNode(id);
}

function showInTree(id: string) {
  // Explicitly change the chart focal person (re-centers the chart)
  router.push('/visualisering/' + id);
}

async function load() {
  const id = personId.value;
  if (!id) {
    const last = localStorage.getItem('viz-focal-person');
    if (last) { router.replace('/visualisering/' + last); return; }
    if (focusStore.personId) { router.replace('/visualisering/' + focusStore.personId); return; }
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
  color: #2c3e50;
  cursor: pointer;
  padding: 4px 8px;
  font-size: var(--font-lg);
  margin-right: 4px;
}
.btn-back:hover { opacity: 0.7; }
.btn-detail {
  margin-left: auto;
  background: none;
  border: 1px solid #c8d0db;
  color: #2c3e50;
  cursor: pointer;
  padding: 4px 10px;
  font-size: var(--font-sm);
  border-radius: 4px;
}
.btn-detail:hover { background: #f0f4f8; }

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

/* Show in tree button */
.panel-show-in-tree {
  padding: 8px 12px 0;
  flex-shrink: 0;
}
.btn-show-in-tree {
  width: 100%;
  background: #2c3e50;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  text-align: center;
}
.btn-show-in-tree:hover { opacity: 0.9; }

.empty-state {
  color: #999;
  padding: 60px;
  text-align: center;
  font-size: 15px;
}
</style>
