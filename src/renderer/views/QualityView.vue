<template>
  <div class="quality-view">
    <div class="view-header">
      <h2>{{ $t('quality.title') }}</h2>
    </div>

    <div v-if="!hasRun" class="empty-hint">{{ $t('quality.notRun') }}</div>

    <template v-else>
      <div class="summary-bar">
        {{ $t('quality.summary', { errors: errorCount, warnings: warningCount, notices: noticeCount }) }}
      </div>

      <div class="filter-chips">
        <button
          v-for="f in filters"
          :key="f.value"
          :class="['chip', { active: activeFilter === f.value }]"
          @click="activeFilter = f.value"
        >{{ f.label }}</button>
      </div>

      <div v-if="filteredResults.length === 0" class="empty-hint">{{ $t('quality.noResults') }}</div>

      <div v-else class="results-list">
        <div
          v-for="r in filteredResults"
          :key="r.code + r.personIds.join()"
          :class="['result-row', 'severity-' + r.severity, { clickable: r.personIds.length > 0 }]"
          @click="r.personIds.length > 0 && router.push('/persons/' + r.personIds[0])"
        >
          <span :class="['severity-badge', 'badge-' + r.severity]">
            {{ $t('quality.severity.' + r.severity) }}
          </span>
          <span class="result-message">{{ r.message }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface CheckResult {
  code: string;
  severity: 'error' | 'warning' | 'notice';
  message: string;
  personIds: string[];
  eventIds?: string[];
  relationshipIds?: string[];
}

const { t } = useI18n();
const router = useRouter();

const loading = ref(false);
const hasRun = ref(false);
const results = ref<CheckResult[]>([]);
const activeFilter = ref<'all' | 'error' | 'warning' | 'notice'>('all');

const filters = computed(() => [
  { value: 'all', label: t('quality.filterAll') },
  { value: 'error', label: t('quality.filterErrors') },
  { value: 'warning', label: t('quality.filterWarnings') },
  { value: 'notice', label: t('quality.filterNotices') },
]);

const errorCount = computed(() => results.value.filter(r => r.severity === 'error').length);
const warningCount = computed(() => results.value.filter(r => r.severity === 'warning').length);
const noticeCount = computed(() => results.value.filter(r => r.severity === 'notice').length);

const filteredResults = computed(() => {
  const sorted = [...results.value].sort((a, b) => {
    const order = { error: 0, warning: 1, notice: 2 };
    return order[a.severity] - order[b.severity];
  });
  if (activeFilter.value === 'all') return sorted;
  return sorted.filter(r => r.severity === activeFilter.value);
});

onMounted(() => { runChecks(); });

async function runChecks() {
  if (!window.api) return;
  loading.value = true;
  try {
    results.value = (await window.api.checks.runAll()) as CheckResult[];
    hasRun.value = true;
  } catch (err) {
    console.error('[QualityView] runChecks failed:', err);
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.quality-view { max-width: 900px; }
.view-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.view-header h2 { margin: 0; }
.summary-bar {
  font-size: 14px; color: #555; margin-bottom: 12px;
  padding: 8px 12px; background: #f8f8f8; border-radius: 4px;
}
.filter-chips { display: flex; gap: 8px; margin-bottom: 16px; }
.chip {
  padding: 4px 12px; border-radius: 12px; border: 1px solid #ccc;
  background: white; cursor: pointer; font-size: 13px;
}
.chip.active { background: #2c3e50; color: white; border-color: #2c3e50; }
.results-list { display: flex; flex-direction: column; gap: 8px; }
.result-row {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 12px; border-radius: 6px; border-left: 4px solid;
}
.severity-error { background: #fff5f5; border-color: #e53e3e; }
.severity-warning { background: #fffbeb; border-color: #d69e2e; }
.severity-notice { background: #f0f9ff; border-color: #3182ce; }
.severity-badge {
  font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 8px;
  text-transform: uppercase; white-space: nowrap;
}
.badge-error { background: #feb2b2; color: #742a2a; }
.badge-warning { background: #fef3c7; color: #78350f; }
.badge-notice { background: #bfdbfe; color: #1e3a8a; }
.result-message { flex: 1; font-size: 13px; }
.result-row.clickable { cursor: pointer; }
.result-row.clickable:hover { filter: brightness(0.96); }
.empty-hint { color: #999; font-size: 13px; padding: 20px 0; }
</style>
