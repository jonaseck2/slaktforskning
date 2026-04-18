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

      <AppEmptyState v-if="filteredResults.length === 0" icon="✅" :title="$t('quality.noResults')" />

      <table v-else class="data-table quality-table">
        <colgroup>
          <col style="width: 120px">
          <col style="width: 28%">
          <col>
          <col style="width: 220px">
        </colgroup>
        <thead>
          <tr>
            <th>{{ $t('quality.colSeverity') }}</th>
            <th>{{ $t('quality.colPersons') }}</th>
            <th>{{ $t('quality.colIssue') }}</th>
            <th class="actions-th">{{ $t('common.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(r, i) in visibleResults"
            :key="resultKey(r) + ':' + i"
            v-narrate="() => narrateQualityRow({
              severity: r.severity,
              message: checkMessage(r),
            }, t)"
            :class="['clickable-row', { 'row-ignored': isIgnored(r) }]"
            tabindex="0"
            role="button"
            :aria-label="$t('a11y.editItem', { item: r.personNames?.[0] || $t('common.unknown') })"
            @click="navigateTo(r)"
            @keydown.enter="navigateTo(r)"
            @keydown.space.prevent="navigateTo(r)"
            @keydown.down.prevent="focusNextRow($event)"
            @keydown.up.prevent="focusPrevRow($event)"
          >
            <td>
              <AppBadge :variant="severityVariant(r.severity)">
                {{ $t('quality.severity.' + r.severity) }}
              </AppBadge>
            </td>
            <td class="persons-cell">
              <template v-for="(name, i) in r.personNames" :key="r.personIds[i]">
                <a
                  class="person-link"
                  @click.stop="router.push('/persons/' + r.personIds[i])"
                >{{ name || $t('common.unknown') }}</a><span v-if="i < r.personNames.length - 1"> · </span>
              </template>
            </td>
            <td class="message-cell">{{ checkMessage(r) }}</td>
            <td class="actions-td">
              <template v-if="isPlaceMatch(r) && !isIgnored(r)">
                <AppButton
                  v-if="r.resolvedLat != null"
                  variant="ghost"
                  size="sm"
                  class="btn-confirm"
                  @click.stop="confirmMatch(r)"
                  :title="$t('quality.confirmMatch')"
                >{{ $t('quality.confirm') }}</AppButton>
                <AppButton
                  variant="ghost"
                  size="sm"
                  class="btn-reject"
                  @click.stop="rejectMatch(r)"
                  :title="$t('quality.rejectMatch')"
                >{{ $t('quality.reject') }}</AppButton>
                <router-link
                  v-if="r.placeIds?.[0]"
                  :to="'/places/' + r.placeIds[0]"
                  class="btn-sm btn-view"
                  @click.stop
                >{{ $t('quality.viewPlace') }}</router-link>
              </template>
              <AppButton
                :variant="isIgnored(r) ? 'secondary' : 'ghost'"
                size="sm"
                @click.stop="toggleIgnore(r)"
              >
                {{ isIgnored(r) ? $t('quality.unignore') : $t('quality.ignore') }}
              </AppButton>
            </td>
          </tr>
        </tbody>
      </table>
      <div ref="sentinel" class="scroll-sentinel"></div>
      <p v-if="visibleResults.length < filteredResults.length" class="count-label">
        {{ visibleResults.length }} / {{ filteredResults.length }}
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onActivated } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useQualityStore, type QualityResult } from '../stores/quality';
import { narrateQualityRow } from '../utils/screenReaderNarration';
import AppButton from '../components/ui/AppButton.vue';
import AppBadge from '../components/ui/AppBadge.vue';
import AppEmptyState from '../components/ui/AppEmptyState.vue';
import AppLoadingState from '../components/ui/AppLoadingState.vue';
import FilterChips from '../components/ui/FilterChips.vue';
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

// --- Ignored checks (persisted in localStorage) ---
const STORAGE_KEY = 'quality:ignored';

function ignoreKey(r: QualityResult): string {
  return `${r.code}:${[...r.personIds].sort().join(',')}`;
}

const ignoredKeys = ref<Set<string>>(
  new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as string[])
);

function isIgnored(r: QualityResult): boolean {
  return ignoredKeys.value.has(ignoreKey(r));
}

function toggleIgnore(r: QualityResult) {
  const key = ignoreKey(r);
  if (ignoredKeys.value.has(key)) {
    ignoredKeys.value.delete(key);
  } else {
    ignoredKeys.value.add(key);
  }
  // Re-assign to trigger reactivity on the Set
  ignoredKeys.value = new Set(ignoredKeys.value);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ignoredKeys.value]));
}

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

// Reset visible count when filter changes
watch(activeFilter, () => { visibleCount.value = PAGE_SIZE; });

// Infinite scroll
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

// --- Helpers ---
function severityVariant(severity: string): 'severity-high' | 'severity-medium' | 'severity-low' {
  if (severity === 'error') return 'severity-high';
  if (severity === 'warning') return 'severity-medium';
  return 'severity-low';
}

function resultKey(r: QualityResult): string {
  return ignoreKey(r);
}

function checkMessage(r: QualityResult): string {
  const key = 'quality.checks.' + r.code;
  const params = { ...r.messageParams };
  if (params.eventType) {
    const etKey = 'eventTypes.' + params.eventType;
    const etTranslated = t(etKey);
    params.eventType = etTranslated !== etKey ? etTranslated : params.eventType as string;
  }
  const translated = t(key, params);
  return translated !== key ? translated : r.message;
}

function focusNextRow(e: KeyboardEvent): void {
  const row = (e.target as HTMLElement).nextElementSibling as HTMLElement | null;
  if (row?.matches('tr[tabindex]')) row.focus();
}
function focusPrevRow(e: KeyboardEvent): void {
  const row = (e.target as HTMLElement).previousElementSibling as HTMLElement | null;
  if (row?.matches('tr[tabindex]')) row.focus();
}

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

function navigateTo(r: QualityResult) {
  if (r.personIds.length > 0) {
    const action = FIX_ACTIONS[r.code];
    const query = action ? { action } : undefined;
    router.push({ path: '/persons/' + r.personIds[0], query });
  }
}

// --- Place match helpers ---
const PLACE_MATCH_CODES = new Set([
  'PLACE_MATCH_AMBIGUOUS', 'PLACE_MATCH_PARTIAL',
  'PLACE_MATCH_NONE', 'PLACE_MATCH_WRONG_LEVEL',
]);

function isPlaceMatch(r: QualityResult): boolean {
  return PLACE_MATCH_CODES.has(r.code);
}

async function confirmMatch(r: QualityResult) {
  if (!r.placeIds?.[0] || r.resolvedLat == null || r.resolvedLon == null) return;
  try {
    await window.api.places.update(r.placeIds[0], {
      latitude: r.resolvedLat,
      longitude: r.resolvedLon,
    });
    toast.success(t('quality.matchConfirmed'));
    await runChecks();
  } catch (err) {
    console.error('[QualityView] confirmMatch failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}

async function rejectMatch(r: QualityResult) {
  if (!r.placeIds?.[0]) return;
  try {
    const raw = await window.api.db.getSetting('gazetteer_rejections') as string | null;
    const rejections: string[] = raw ? JSON.parse(raw) : [];
    if (!rejections.includes(r.placeIds[0])) {
      rejections.push(r.placeIds[0]);
    }
    await window.api.db.setSetting('gazetteer_rejections', JSON.stringify(rejections));
    toast.success(t('quality.matchRejected'));
    await runChecks();
  } catch (err) {
    console.error('[QualityView] rejectMatch failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}

// --- Data loading ---
let checksRunId = 0;
async function runChecks() {
  if (!window.api) return;
  const myRunId = ++checksRunId;
  qualityStore.running = true;
  try {
    const raw = (await window.api.checks.runAll()) as QualityResult[];
    // Ignore stale results from a cancelled/superseded run
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
  // Show cached results immediately; always re-run on first mount
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

<style scoped>
/* Unique to QualityView */
.quality-table { table-layout: fixed; width: 100%; }

.row-ignored { opacity: 0.5; }
.row-ignored:hover { opacity: 0.7; }
.message-cell { font-size: var(--font-sm); }
.persons-cell { font-size: var(--font-sm); }
.actions-th, .actions-td { text-align: right; }

.btn-confirm {
  color: var(--success-text);
}
.btn-reject {
  color: var(--error-text);
}
.btn-view {
  color: var(--accent);
  border-color: var(--accent);
  text-decoration: none;
  display: inline-block;
  padding: 2px 8px;
  border: 1px solid;
  border-radius: var(--radius-sm);
  font-size: var(--font-xs);
}
.btn-view:hover {
  background: var(--surface-hover);
}
.actions-td {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
</style>
