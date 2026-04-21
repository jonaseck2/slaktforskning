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
      <FilterChips v-if="typeFilters.length > 1" :options="typeFilters" :model-value="activeTypeFilter" @update:model-value="activeTypeFilter = $event" />

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
const activeTypeFilter = ref('all');
const PAGE_SIZE = 100;
const visibleCount = ref(PAGE_SIZE);
const sentinel = ref<HTMLElement | null>(null);

const CODE_CATEGORY: Record<string, string> = {
  NO_NAME: 'quality', LIVING_WITH_DEATH_EVENT: 'quality', NOT_LIVING_WITHOUT_DEATH: 'quality',
  INVALID_DATE: 'quality', UNRELATED_PERSON: 'quality', TEXT_CONTROL_CHARS: 'quality',
  MULTIPLE_BIRTH_NAMES: 'quality', PARTIAL_NAME: 'quality', LIVING_OVER_120: 'quality',
  UNSOURCED_BIRTH: 'quality', UNSOURCED_DEATH: 'quality',
  BIRTH_AFTER_DEATH: 'chronology', EVENT_AFTER_DEATH: 'chronology', BURIAL_BEFORE_DEATH: 'chronology',
  FUTURE_BIRTH: 'chronology', FUTURE_DEATH: 'chronology', BAPTISM_LATE: 'chronology',
  DEATH_WITHOUT_BIRTH: 'chronology', NO_BIRTH_EVENT: 'chronology',
  LIFESPAN_OVER_120: 'chronology', LIFESPAN_OVER_105: 'chronology',
  PARENT_BORN_AFTER_CHILD: 'relationships', PARENT_TOO_YOUNG: 'relationships',
  PARENT_VERY_YOUNG: 'relationships', PARENT_YOUNG: 'relationships',
  MOTHER_TOO_OLD: 'relationships', FATHER_TOO_OLD: 'relationships',
  CHILD_BORN_AFTER_PARENT_DEATH: 'relationships', SIBLING_AGE_GAP_LARGE: 'relationships',
  DUPLICATE_PARENT_CHILD: 'relationships', MULTIPLE_BIRTH_PARENTS: 'relationships',
  NO_PARENTS: 'relationships', CIRCULAR_ANCESTRY: 'relationships',
  DUPLICATE_RELATIONSHIP: 'relationships', MARRIAGE_AFTER_DEATH: 'relationships',
  MARRIAGE_BEFORE_BIRTH: 'relationships', COUPLE_WITH_SELF: 'relationships',
  MARRIED_BEFORE_12: 'relationships', MARRIED_BEFORE_16: 'relationships',
  ORPHANED_SOURCE: 'source', SOURCE_MISSING_TITLE: 'source', ORPHANED_REPOSITORY: 'source',
  SIMULTANEOUS_DISTANT_LOCATIONS: 'location', PLACE_MATCH_NONE: 'location',
  PLACE_MATCH_WRONG_LEVEL: 'location', PLACE_MATCH_AMBIGUOUS: 'location',
  PLACE_MATCH_PARTIAL: 'location',
  ORPHANED_PLACE: 'place', CIRCULAR_PLACE_HIERARCHY: 'place',
  PLACE_COORDINATES_INVALID: 'place', PLACE_DATES_INVERTED: 'place',
  MEDIA_FILE_MISSING: 'media', ORPHANED_MEDIA: 'media', MEDIA_REGION_OUT_OF_BOUNDS: 'media',
  PHOTO_AFTER_SUBJECT_DEATH: 'media', PHOTO_BEFORE_SUBJECT_BIRTH: 'media',
  POSSIBLE_DUPLICATE_PERSON: 'duplicates', DUPLICATE_IDENTIFIER: 'duplicates',
  DUPLICATE_PLACE: 'duplicates', DUPLICATE_MEDIA: 'duplicates', DUPLICATE_SOURCE: 'duplicates',
};

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

const CATEGORY_ORDER = ['quality', 'chronology', 'relationships', 'source', 'location', 'place', 'media', 'duplicates'];
const CATEGORY_LABEL_KEY: Record<string, string> = {
  quality: 'quality.categoryQuality',
  chronology: 'quality.categoryChronology',
  relationships: 'quality.categoryRelationships',
  source: 'quality.categorySource',
  location: 'quality.categoryLocation',
  place: 'quality.categoryPlace',
  media: 'quality.categoryMedia',
  duplicates: 'quality.categoryDuplicates',
};

const typeFilters = computed(() => {
  const active = qualityStore.results.filter(r => !isIgnored(r));
  const counts = new Map<string, number>();
  for (const r of active) {
    const cat = CODE_CATEGORY[r.code] ?? 'quality';
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }
  const options = [{ value: 'all', label: t('quality.categoryAll') }];
  for (const cat of CATEGORY_ORDER) {
    const count = counts.get(cat);
    if (count) {
      options.push({ value: cat, label: `${t(CATEGORY_LABEL_KEY[cat])} (${count})` });
    }
  }
  return options;
});

const filteredResults = computed(() => {
  const sorted = [...qualityStore.results].sort((a, b) => {
    const order: Record<string, number> = { error: 0, warning: 1, notice: 2 };
    return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
  });
  if (activeFilter.value === 'ignored') {
    return sorted.filter(r => isIgnored(r));
  }
  let active = sorted.filter(r => !isIgnored(r));
  if (activeFilter.value !== 'all') {
    active = active.filter(r => r.severity === activeFilter.value);
  }
  if (activeTypeFilter.value !== 'all') {
    active = active.filter(r => (CODE_CATEGORY[r.code] ?? 'quality') === activeTypeFilter.value);
  }
  return active;
});

const visibleResults = computed(() => filteredResults.value.slice(0, visibleCount.value));

watch(activeFilter, () => { visibleCount.value = PAGE_SIZE; });
watch(activeTypeFilter, () => { visibleCount.value = PAGE_SIZE; });

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

function isDuplicateCode(code: string): boolean {
  return code === 'POSSIBLE_DUPLICATE_PERSON' || code.startsWith('DUPLICATE_');
}

function hasNavigation(r: QualityResult): boolean {
  if (isDuplicateCode(r.code)) return false;
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
