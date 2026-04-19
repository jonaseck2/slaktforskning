<template>
  <div>
    <div class="header">
      <h2>{{ $t('nav.quality') }}</h2>
      <span v-if="qualityStore.running" class="running-hint">{{ $t('quality.running') }}</span>
    </div>

    <AppLoadingState v-if="!qualityStore.hasRun && qualityStore.running" :rows="5" />
    <AppEmptyState v-else-if="!qualityStore.hasRun" icon="⚠️" :title="$t('quality.notRun')" />

    <template v-else>
      <p class="count-label">
        {{ $t('quality.summary', { errors: errorCount, warnings: warningCount, notices: noticeCount }) }}
        <span v-if="ignoredCount > 0"> · {{ $t('quality.ignoredCount', { count: ignoredCount }) }}</span>
      </p>

      <FilterChips :options="filters" :model-value="activeFilter" @update:model-value="activeFilter = $event" />

      <AppEmptyState v-if="filteredResults.length === 0" icon="✅" :title="$t('empty.qualityIssues') + ' ' + $t('empty.withFilter')" />

      <template v-else>
        <QualityIssuesTable
          :issues="visibleResults"
          :clickable-when="hasNavigation"
          show-entity
          @row-click="navigateTo"
        />
        <div ref="sentinel" class="scroll-sentinel"></div>
        <p v-if="visibleResults.length < filteredResults.length" class="count-label">
          {{ visibleResults.length }} / {{ filteredResults.length }}
        </p>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onActivated } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useQualityStore, type QualityResult } from '../stores/quality';
import AppEmptyState from '../components/ui/AppEmptyState.vue';
import AppLoadingState from '../components/ui/AppLoadingState.vue';
import FilterChips from '../components/ui/FilterChips.vue';
import QualityIssuesTable from '../components/QualityIssuesTable.vue';
import { isIgnored } from '../utils/qualityIgnore';
import { useDataVersionStore } from '../stores/dataVersion';
import { useToast } from '../composables/useToast';

const { t } = useI18n();
const toast = useToast();
const router = useRouter();
const qualityStore = useQualityStore();
const dataVersionStore = useDataVersionStore();
let loadedVersion = -1;

const activeFilter = ref<'all' | 'error' | 'warning' | 'notice' | 'ignored'>('all');
const PAGE_SIZE = 100;
const visibleCount = ref(PAGE_SIZE);
const sentinel = ref<HTMLElement | null>(null);

// --- Counts ---
const errorCount = computed(() =>
  qualityStore.results.filter(r => r.severity === 'error' && !isIgnored(r)).length
);
const warningCount = computed(() =>
  qualityStore.results.filter(r => r.severity === 'warning' && !isIgnored(r)).length
);
const noticeCount = computed(() =>
  qualityStore.results.filter(r => r.severity === 'notice' && !isIgnored(r)).length
);
const ignoredCount = computed(() =>
  qualityStore.results.filter(r => isIgnored(r)).length
);

// --- Filters ---
const filters = computed(() => [
  { value: 'all', label: t('quality.filterAll') },
  { value: 'error', label: `${t('quality.filterErrors')} (${errorCount.value})` },
  { value: 'warning', label: `${t('quality.filterWarnings')} (${warningCount.value})` },
  { value: 'notice', label: `${t('quality.filterNotices')} (${noticeCount.value})` },
  { value: 'ignored', label: `${t('quality.filterIgnored')} (${ignoredCount.value})` },
]);

const filteredResults = computed(() => {
  const sorted = [...qualityStore.results].sort((a, b) => {
    const order: Record<string, number> = { error: 0, warning: 1, notice: 2 };
    return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
  });
  if (activeFilter.value === 'ignored') {
    return sorted.filter(r => isIgnored(r));
  }
  const active = sorted.filter(r => !isIgnored(r));
  if (activeFilter.value === 'all') return active;
  return active.filter(r => r.severity === activeFilter.value);
});

const visibleResults = computed(() => filteredResults.value.slice(0, visibleCount.value));

watch(activeFilter, () => { visibleCount.value = PAGE_SIZE; });

let observer: IntersectionObserver | null = null;
watch(sentinel, (el) => {
  if (observer) { observer.disconnect(); observer = null; }
  if (!el) return;
  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && visibleCount.value < filteredResults.value.length) {
        visibleCount.value += PAGE_SIZE;
      }
    },
    { rootMargin: '200px 0px' }
  );
  observer.observe(el);
});

// --- Row navigation ---
const FIX_ACTIONS: Record<string, string> = {
  NO_BIRTH_EVENT: 'add-birth-event',
  UNSOURCED_BIRTH: 'add-birth-event',
  NO_PARENTS: 'add-father',
  NO_NAME: 'add-name',
  NOT_LIVING_WITHOUT_DEATH: 'add-death-event',
  UNSOURCED_DEATH: 'add-death-event',
  LIVING_WITH_DEATH_EVENT: 'toggle-living',
  DEATH_WITHOUT_BIRTH: 'add-birth-event',
  UNRELATED_PERSON: 'add-father',
};

function hasNavigation(r: QualityResult): boolean {
  return (
    (r.placeIds?.length ?? 0) > 0 ||
    (r.mediaIds?.length ?? 0) > 0 ||
    (r.sourceIds?.length ?? 0) > 0 ||
    r.personIds.length > 0
  );
}

function navigateTo(r: QualityResult) {
  if (r.placeIds && r.placeIds.length > 0) {
    router.push('/places/' + r.placeIds[0]);
    return;
  }
  if (r.mediaIds && r.mediaIds.length > 0) {
    router.push({ path: '/media', query: { open: r.mediaIds[0] } });
    return;
  }
  if (r.sourceIds && r.sourceIds.length > 0) {
    router.push('/sources/' + r.sourceIds[0]);
    return;
  }
  if (r.personIds.length === 0) return;
  const action = FIX_ACTIONS[r.code];
  const query = action ? { action } : undefined;
  router.push({ path: '/persons/' + r.personIds[0], query });
}

// --- Data loading ---
let checksRunId = 0;
async function runChecks() {
  if (!window.api) return;
  const myRunId = ++checksRunId;
  qualityStore.running = true;
  try {
    const raw = (await window.api.checks.runAll()) as QualityResult[];
    if (myRunId !== checksRunId) return;
    qualityStore.setResults(raw);
    visibleCount.value = PAGE_SIZE;
  } catch (err) {
    if (myRunId !== checksRunId) return;
    console.error('[QualityView] runChecks failed:', err);
    toast.error(t('errors.loadFailed'));
    qualityStore.running = false;
  }
}

onMounted(() => {
  runChecks();
  loadedVersion = dataVersionStore.version;

  let debounce: ReturnType<typeof setTimeout> | null = null;
  (window.api as unknown as { onDataChanged: (cb: () => void) => void }).onDataChanged(() => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(runChecks, 800);
  });
});

onActivated(() => {
  if (dataVersionStore.version !== loadedVersion) {
    runChecks();
    loadedVersion = dataVersionStore.version;
  }
});
</script>
