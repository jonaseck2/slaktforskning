<template>
  <div>
    <div class="header">
      <h2>{{ $t('quality.title') }}</h2>
      <span v-if="qualityStore.running" class="running-hint">{{ $t('quality.running') }}</span>
    </div>

    <div v-if="!qualityStore.hasRun && qualityStore.running" class="empty">
      {{ $t('quality.running') }}
    </div>
    <div v-else-if="!qualityStore.hasRun" class="empty">
      {{ $t('quality.notRun') }}
    </div>

    <template v-else>
      <p class="count-label">
        {{ $t('quality.summary', { errors: errorCount, warnings: warningCount, notices: noticeCount }) }}
        <span v-if="ignoredCount > 0"> · {{ $t('quality.ignoredCount', { count: ignoredCount }) }}</span>
      </p>

      <div class="filter-chips">
        <button
          v-for="f in filters"
          :key="f.value"
          :class="['chip', { active: activeFilter === f.value }]"
          @click="activeFilter = f.value"
        >{{ f.label }}</button>
      </div>

      <div v-if="filteredResults.length === 0" class="empty">
        {{ $t('quality.noResults') }}
      </div>

      <table v-else class="data-table">
        <thead>
          <tr>
            <th>{{ $t('quality.colSeverity') }}</th>
            <th>{{ $t('quality.colIssue') }}</th>
            <th>{{ $t('quality.colPersons') }}</th>
            <th>{{ $t('common.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(r, i) in filteredResults"
            :key="resultKey(r) + ':' + i"
            :class="['clickable-row', { 'row-ignored': isIgnored(r) }]"
            @click="navigateTo(r)"
          >
            <td>
              <span :class="['severity-badge', 'badge-' + r.severity]">
                {{ $t('quality.severity.' + r.severity) }}
              </span>
            </td>
            <td class="message-cell">{{ checkMessage(r) }}</td>
            <td class="persons-cell">
              <template v-for="(name, i) in r.personNames" :key="r.personIds[i]">
                <a
                  class="person-link"
                  @click.stop="router.push('/persons/' + r.personIds[i])"
                >{{ name || $t('common.unknown') }}</a><span v-if="i < r.personNames.length - 1"> · </span>
              </template>
            </td>
            <td>
              <button
                :class="['btn-sm', isIgnored(r) ? 'btn-unignore' : 'btn-ignore']"
                @click.stop="toggleIgnore(r)"
              >
                {{ isIgnored(r) ? $t('quality.unignore') : $t('quality.ignore') }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onActivated } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useQualityStore, type QualityResult } from '../stores/quality';
import { useDataVersionStore } from '../stores/dataVersion';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
  onDataChanged?: (cb: () => void) => void;
};

const { t } = useI18n();
const router = useRouter();
const qualityStore = useQualityStore();
const dataVersionStore = useDataVersionStore();
let loadedVersion = -1;

const activeFilter = ref<'all' | 'error' | 'warning' | 'notice' | 'ignored'>('all');

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

// --- Helpers ---
function resultKey(r: QualityResult): string {
  return ignoreKey(r);
}

function checkMessage(r: QualityResult): string {
  const key = 'quality.checks.' + r.code;
  const translated = t(key, r.messageParams ?? {});
  return translated !== key ? translated : r.message;
}

function navigateTo(r: QualityResult) {
  if (r.personIds.length > 0) {
    router.push('/persons/' + r.personIds[0]);
  }
}

// --- Data loading ---
async function runChecks() {
  if (!window.api) return;
  qualityStore.running = true;
  try {
    const raw = (await window.api.checks.runAll()) as QualityResult[];
    qualityStore.setResults(raw);
  } catch (err) {
    console.error('[QualityView] runChecks failed:', err);
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
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.running-hint {
  font-size: 13px;
  color: #999;
}
.count-label {
  font-size: 13px;
  color: #666;
  margin: 0 0 8px;
}
.filter-chips {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.chip {
  padding: 4px 12px;
  border-radius: 12px;
  border: 1px solid #c8d0db;
  background: #f0f4f8;
  color: #4a5568;
  cursor: pointer;
  font-size: 13px;
}
.chip:hover {
  background: #e2e8f0;
}
.chip.active {
  background: #2c3e50;
  color: white;
  border-color: #2c3e50;
}
.empty {
  color: #999;
  padding: 40px;
  text-align: center;
}
.data-table {
  width: 100%;
  border-collapse: collapse;
}
.data-table th,
.data-table td {
  padding: 8px 12px;
  border-bottom: 1px solid #ddd;
  text-align: left;
}
.data-table th {
  background: #eee;
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  color: #666;
}
.clickable-row {
  cursor: pointer;
}
.clickable-row:hover {
  background: #f0f4ff;
}
.row-ignored {
  opacity: 0.5;
}
.row-ignored:hover {
  opacity: 0.7;
}
.severity-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 8px;
  text-transform: uppercase;
  white-space: nowrap;
}
.badge-error { background: #feb2b2; color: #742a2a; }
.badge-warning { background: #fef3c7; color: #78350f; }
.badge-notice { background: #bfdbfe; color: #1e3a8a; }
.message-cell {
  font-size: 13px;
}
.persons-cell {
  font-size: 13px;
  white-space: nowrap;
}
.person-link {
  color: #3182ce;
  cursor: pointer;
  text-decoration: none;
}
.person-link:hover {
  text-decoration: underline;
}
button {
  background: #2c3e50;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
}
button:hover { opacity: 0.9; }
.btn-sm {
  padding: 3px 10px;
  font-size: 12px;
}
.btn-ignore {
  background: #e2e8f0;
  color: #4a5568;
}
.btn-unignore {
  background: #c6f6d5;
  color: #276749;
}
</style>
