<template>
  <div class="visualization-view">
    <div class="viz-header">
      <button class="btn-back" @click="$router.back()">{{ $t('personDetail.back') }}</button>
      <template v-if="focalPerson">
        <div class="focal-info">
          <h2 data-testid="visualization-focal-name">
            <PersonName :given-name="focalGivenName" :surname="focalSurname" :preferred-name="focalPreferredName" />
          </h2>
          <router-link :to="'/persons/' + personId" class="btn-detail">{{ $t('visualization.viewDetail') }} →</router-link>
        </div>
      </template>
    </div>

    <template v-if="focalPerson">
      <div class="viz-tabs" role="tablist">
        <button
          role="tab"
          :aria-selected="activeTab === 'pedigree'"
          :class="['tab', { active: activeTab === 'pedigree' }]"
          data-testid="tab-pedigree"
          @click="setTab('pedigree')"
        >{{ $t('visualization.tab.pedigree') }}</button>
        <button
          role="tab"
          :aria-selected="activeTab === 'hourglass'"
          :class="['tab', { active: activeTab === 'hourglass' }]"
          data-testid="tab-hourglass"
          @click="setTab('hourglass')"
        >{{ $t('visualization.tab.hourglass') }}</button>
        <button
          role="tab"
          :aria-selected="activeTab === 'timeline'"
          :class="['tab', { active: activeTab === 'timeline' }]"
          data-testid="tab-timeline"
          @click="setTab('timeline')"
        >{{ $t('visualization.tab.timeline') }}</button>
      </div>
      <div class="viz-area" data-testid="viz-area">
        <PedigreeChart
          v-if="activeTab === 'pedigree'"
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
      </div>
    </template>

    <div v-else-if="noPersonsExist" class="empty-state" data-testid="viz-empty">
      {{ $t('visualization.empty') }}
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

type TabName = 'pedigree' | 'hourglass' | 'timeline';
const activeTab = ref<TabName>((localStorage.getItem('viz-tab') as TabName) || 'pedigree');

const personId = computed(() => route.params.personId as string | undefined);

function setTab(tab: TabName) {
  activeTab.value = tab;
  localStorage.setItem('viz-tab', tab);
}

function navigateTo(id: string) {
  router.push('/visualisering/' + id);
}

async function load() {
  const id = personId.value;
  if (!id) {
    // No personId in route — check localStorage for last viewed
    const last = localStorage.getItem('viz-focal-person');
    if (last) {
      router.replace('/visualisering/' + last);
      return;
    }
    // Auto-select first person or show empty state
    const persons = (await window.api.persons.list()) as PersonWithName[];
    if (persons.length > 0) {
      router.replace('/visualisering/' + persons[0].id);
    } else {
      noPersonsExist.value = true;
    }
    return;
  }

  localStorage.setItem('viz-focal-person', id);

  const person = (await window.api.persons.get(id)) as Person | null;
  if (!person) {
    focalPerson.value = null;
    return;
  }
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
  max-width: 1100px;
}

.viz-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.focal-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.focal-info h2 {
  margin: 0;
  font-size: 20px;
}

.btn-back {
  background: none;
  border: 1px solid #ccc;
  padding: 5px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  color: #555;
  white-space: nowrap;
}

.btn-back:hover { background: #f5f5f5; }

.btn-detail {
  background: #f0fdf4;
  color: #166534;
  border: 1px solid #bbf7d0;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  text-decoration: none;
  white-space: nowrap;
}

.btn-detail:hover { background: #dcfce7; }

.viz-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  border-bottom: 2px solid #e5e7eb;
  padding-bottom: 0;
}

.tab {
  background: none;
  border: none;
  padding: 8px 18px;
  cursor: pointer;
  font-size: 14px;
  color: #666;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  border-radius: 4px 4px 0 0;
}

.tab:hover { color: #2c3e50; background: #f9f9f9; }
.tab.active { color: #2c3e50; border-bottom-color: #2c3e50; font-weight: 600; }

.viz-area {
  flex: 1;
  overflow: auto;
}

.empty-state {
  color: #999;
  padding: 60px;
  text-align: center;
  font-size: 15px;
}
</style>
