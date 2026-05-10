<template>
  <BaseSubPanel
    entity-type="source"
    :title="$t('duplicates.sources.mergeTitle')"
    mode="standalone"
    :save-label="merging ? $t('duplicates.merging') : $t('duplicates.confirmMerge')"
    @cancel="$emit('close')"
    @close="$emit('close')"
    @save="onConfirmStart"
  >
    <div class="ep-fields merge-body">
      <div class="merge-header">
        <span :class="'score-badge score-' + scoreLevel(pair.score)">{{ pair.score }}%</span>
      </div>
      <div class="merge-layout">
        <div class="merge-side">
          <h5>{{ $t('duplicates.keepEntity') }}</h5>
          <div class="entity-card target">
            <strong>{{ pair.source1_title || $t('duplicates.untitled') }}</strong>
            <div class="entity-meta">ID: {{ pair.source1_id.slice(0, 8) }}</div>
          </div>
        </div>
        <div class="merge-arrow">←</div>
        <div class="merge-side">
          <h5>{{ $t('duplicates.mergeEntity') }}</h5>
          <div class="entity-card source">
            <strong>{{ pair.source2_title || $t('duplicates.untitled') }}</strong>
            <div class="entity-meta">ID: {{ pair.source2_id.slice(0, 8) }}</div>
          </div>
        </div>
      </div>

      <div v-if="loading" class="merge-loading">{{ $t('common.loading') }}</div>
      <table v-else class="compare-table data-table">
        <thead>
          <tr>
            <th>{{ $t('duplicates.field') }}</th>
            <th>{{ $t('duplicates.keepEntity') }}</th>
            <th>{{ $t('duplicates.mergeEntity') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in fieldRows" :key="row.label">
            <th scope="row">{{ row.label }}</th>
            <td :class="{ differs: row.differs }">{{ row.targetText }}</td>
            <td :class="{ differs: row.differs }">{{ row.sourceText }}</td>
          </tr>
        </tbody>
      </table>

      <div class="merge-warning">{{ $t('duplicates.mergeWarning') }}</div>
    </div>

    <ConfirmModal
      :visible="confirmVisible"
      :title="$t('duplicates.sources.confirmTitle')"
      :messages="confirmMessages"
      tone="warning"
      icon="⚠️"
      :confirm-label="$t('duplicates.confirmMerge')"
      @cancel="confirmVisible = false"
      @confirm="doMerge"
    />
  </BaseSubPanel>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseSubPanel from './modals/BaseSubPanel.vue';
import ConfirmModal from './ConfirmModal.vue';
import { useToast } from '../composables/useToast';

interface SourcePair {
  source1_id: string;
  source2_id: string;
  source1_title: string;
  source2_title: string;
  source1_author?: string;
  source2_author?: string;
  score: number;
}

interface SourceFull {
  id: string;
  title?: string | null;
  author?: string | null;
  publication_info?: string | null;
  repository?: string | null;
  url?: string | null;
  source_type?: string | null;
  call_number?: string | null;
  abstract?: string | null;
}

const { t } = useI18n();
const toast = useToast();

const props = defineProps<{ pair: SourcePair }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'merged'): void }>();

const merging = ref(false);
const loading = ref(true);
const target = ref<SourceFull | null>(null);
const source = ref<SourceFull | null>(null);
const confirmVisible = ref(false);

interface FieldRow { label: string; targetText: string; sourceText: string; differs: boolean }

const fieldRows = computed<FieldRow[]>(() => {
  const tgt = target.value;
  const src = source.value;
  if (!tgt || !src) return [];
  const def = (v: unknown) => (v === null || v === undefined || v === '') ? '—' : String(v);
  const fields: Array<[string, keyof SourceFull]> = [
    ['title', 'title'],
    ['author', 'author'],
    ['source_type', 'source_type'],
    ['publication_info', 'publication_info'],
    ['repository', 'repository'],
    ['url', 'url'],
    ['call_number', 'call_number'],
    ['abstract', 'abstract'],
  ];
  return fields.map(([key, prop]) => {
    const a = tgt[prop];
    const b = src[prop];
    return {
      label: t(`sources.${key}`, key),
      targetText: def(a),
      sourceText: def(b),
      differs: (a ?? null) !== (b ?? null),
    };
  });
});

const confirmMessages = computed(() => [
  t('duplicates.sources.confirmMerge', { title: props.pair.source2_title || t('duplicates.untitled') }),
  t('duplicates.sources.confirmCascade'),
]);

function scoreLevel(score: number): string {
  if (score >= 80) return 'high';
  if (score >= 60) return 'medium';
  return 'low';
}

async function load() {
  loading.value = true;
  try {
    const [t1, t2] = await Promise.all([
      window.api.sources.get(props.pair.source1_id) as Promise<SourceFull>,
      window.api.sources.get(props.pair.source2_id) as Promise<SourceFull>,
    ]);
    target.value = t1;
    source.value = t2;
  } catch (err) {
    console.error('[MergeSourcesModal] load failed:', err);
    toast.error(t('errors.loadFailed'));
  } finally {
    loading.value = false;
  }
}

function onConfirmStart() {
  if (merging.value) return;
  confirmVisible.value = true;
}

async function doMerge() {
  confirmVisible.value = false;
  if (merging.value) return;
  merging.value = true;
  try {
    await window.api.duplicates.mergeSources(props.pair.source1_id, props.pair.source2_id);
    toast.success(t('duplicates.mergedToast'));
    emit('merged');
  } catch (err) {
    console.error('[MergeSourcesModal] merge failed:', err);
    toast.error(t('errors.saveFailed'));
    merging.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.merge-header { display: flex; justify-content: flex-end; margin-bottom: var(--space-sm); }
.merge-layout {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  margin-bottom: var(--space-lg);
}
.merge-side { flex: 1; min-width: 0; }
.merge-side h5 {
  margin: 0 0 var(--space-sm);
  font-size: var(--font-sm);
  color: var(--text-muted);
}
.merge-arrow { font-size: 24px; color: var(--text-muted); padding-top: var(--space-lg); }
.entity-card {
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  border: 1px solid var(--surface-border);
}
.entity-card.target { background: var(--success-bg); border-color: var(--success-text); }
.entity-card.source { background: var(--error-bg); border-color: var(--error-text); }
.entity-meta { font-size: var(--font-xs); color: var(--text-muted); margin-top: var(--space-xs); }
.compare-table { width: 100%; margin-bottom: var(--space-md); }
.compare-table th[scope='row'] {
  text-align: left;
  font-weight: 500;
  color: var(--text-muted);
  font-size: var(--font-sm);
  white-space: nowrap;
  width: 1%;
}
.compare-table td.differs { background: var(--warning-bg); color: var(--warning-text); }
.merge-warning {
  background: var(--warning-bg);
  color: var(--warning-text);
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  font-size: var(--font-xs);
  margin-bottom: var(--space-lg);
}
.merge-loading { padding: var(--space-md); color: var(--text-muted); }
.score-badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: var(--font-xs);
  font-weight: 600;
}
.score-high { background: var(--error-bg); color: var(--error-text); }
.score-medium { background: var(--warning-bg); color: var(--warning-text); }
.score-low { background: var(--info-bg); color: var(--info-text); }
</style>
