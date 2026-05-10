<template>
  <BaseSubPanel
    entity-type="media"
    :title="$t('duplicates.media.mergeTitle')"
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
            <strong>{{ pair.media1_title || $t('duplicates.untitled') }}</strong>
            <div v-if="pair.media1_file_ref" class="entity-meta" :title="pair.media1_file_ref">{{ fileRefShort(pair.media1_file_ref) }}</div>
            <div v-else class="entity-meta">{{ $t('duplicates.media.noFile') }}</div>
            <div class="entity-meta">ID: {{ pair.media1_id.slice(0, 8) }}</div>
          </div>
        </div>
        <div class="merge-arrow">←</div>
        <div class="merge-side">
          <h5>{{ $t('duplicates.mergeEntity') }}</h5>
          <div class="entity-card source">
            <strong>{{ pair.media2_title || $t('duplicates.untitled') }}</strong>
            <div v-if="pair.media2_file_ref" class="entity-meta" :title="pair.media2_file_ref">{{ fileRefShort(pair.media2_file_ref) }}</div>
            <div v-else class="entity-meta">{{ $t('duplicates.media.noFile') }}</div>
            <div class="entity-meta">ID: {{ pair.media2_id.slice(0, 8) }}</div>
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

      <fieldset class="keep-file-group">
        <legend>{{ $t('duplicates.media.keepFileLegend') }}</legend>
        <p class="keep-file-hint">{{ keepFileHint }}</p>
        <label class="keep-file-option">
          <input
            type="radio"
            name="keep-file"
            value="target"
            v-model="keepFile"
            :disabled="!pair.media1_file_ref"
          />
          <span>{{ $t('duplicates.media.keepTargetFile') }}</span>
          <span v-if="pair.media1_file_ref" class="keep-file-ref">{{ fileRefShort(pair.media1_file_ref) }}</span>
        </label>
        <label class="keep-file-option">
          <input
            type="radio"
            name="keep-file"
            value="source"
            v-model="keepFile"
            :disabled="!pair.media2_file_ref"
          />
          <span>{{ $t('duplicates.media.keepSourceFile') }}</span>
          <span v-if="pair.media2_file_ref" class="keep-file-ref">{{ fileRefShort(pair.media2_file_ref) }}</span>
        </label>
      </fieldset>

      <div class="merge-warning">{{ $t('duplicates.mergeWarning') }}</div>
    </div>

    <ConfirmModal
      :visible="confirmVisible"
      :title="$t('duplicates.media.confirmTitle')"
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

interface MediaPair {
  media1_id: string;
  media2_id: string;
  media1_title: string;
  media2_title: string;
  media1_file_ref: string | null;
  media2_file_ref: string | null;
  score: number;
}

interface MediaFull {
  id: string;
  title?: string | null;
  file_ref?: string | null;
  format?: string | null;
  notes?: string | null;
  is_printable?: boolean | number | null;
}

const { t } = useI18n();
const toast = useToast();

const props = defineProps<{ pair: MediaPair }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'merged'): void }>();

const merging = ref(false);
const loading = ref(true);
const target = ref<MediaFull | null>(null);
const source = ref<MediaFull | null>(null);
const confirmVisible = ref(false);

// Default: keep the target's file. If the target has no file but source does, default to source.
const keepFile = ref<'target' | 'source'>(
  !props.pair.media1_file_ref && props.pair.media2_file_ref ? 'source' : 'target',
);

interface FieldRow { label: string; targetText: string; sourceText: string; differs: boolean }

const fieldRows = computed<FieldRow[]>(() => {
  const tgt = target.value;
  const src = source.value;
  if (!tgt || !src) return [];
  const def = (v: unknown) => (v === null || v === undefined || v === '') ? '—' : String(v);
  const fields: Array<[string, keyof MediaFull]> = [
    ['title', 'title'],
    ['file_ref', 'file_ref'],
    ['format', 'format'],
    ['is_printable', 'is_printable'],
    ['notes', 'notes'],
  ];
  return fields.map(([key, prop]) => {
    const a = tgt[prop];
    const b = src[prop];
    return {
      label: t(`media.${key}`, key),
      targetText: key === 'file_ref' ? fileRefShort(a as string | null) || '—' : def(a),
      sourceText: key === 'file_ref' ? fileRefShort(b as string | null) || '—' : def(b),
      differs: (a ?? null) !== (b ?? null),
    };
  });
});

const keepFileHint = computed(() => {
  if (!props.pair.media1_file_ref && !props.pair.media2_file_ref) {
    return t('duplicates.media.bothNoFile');
  }
  if (!props.pair.media1_file_ref) return t('duplicates.media.targetNoFile');
  if (!props.pair.media2_file_ref) return t('duplicates.media.sourceNoFile');
  return t('duplicates.media.keepFileHint');
});

const confirmMessages = computed(() => {
  const lines: string[] = [];
  lines.push(t('duplicates.media.confirmMerge', { title: props.pair.media2_title || t('duplicates.untitled') }));
  // Which file (if any) gets deleted from disk?
  const dropped = keepFile.value === 'target' ? props.pair.media2_file_ref : props.pair.media1_file_ref;
  if (dropped) {
    lines.push(t('duplicates.media.confirmDelete', { file: fileRefShort(dropped) }));
  }
  lines.push(t('duplicates.media.confirmCascade'));
  return lines;
});

function fileRefShort(ref: string | null | undefined): string {
  if (!ref) return '';
  const parts = ref.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || ref;
}

function scoreLevel(score: number): string {
  if (score >= 80) return 'high';
  if (score >= 60) return 'medium';
  return 'low';
}

async function load() {
  loading.value = true;
  try {
    const [t1, t2] = await Promise.all([
      window.api.media.get(props.pair.media1_id) as Promise<MediaFull>,
      window.api.media.get(props.pair.media2_id) as Promise<MediaFull>,
    ]);
    target.value = t1;
    source.value = t2;
  } catch (err) {
    console.error('[MergeMediaModal] load failed:', err);
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
    await window.api.duplicates.mergeMedia(
      props.pair.media1_id,
      props.pair.media2_id,
      keepFile.value,
    );
    toast.success(t('duplicates.mergedToast'));
    emit('merged');
  } catch (err) {
    console.error('[MergeMediaModal] merge failed:', err);
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
.entity-meta { font-size: var(--font-xs); color: var(--text-muted); margin-top: var(--space-xs); word-break: break-all; }
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
.keep-file-group {
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-md);
  padding: var(--space-sm) var(--space-md);
  margin-bottom: var(--space-md);
}
.keep-file-group legend {
  font-size: var(--font-sm);
  color: var(--text-muted);
  padding: 0 var(--space-xs);
}
.keep-file-hint { margin: 0 0 var(--space-sm); font-size: var(--font-xs); color: var(--text-muted); }
.keep-file-option {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-xs) 0;
  font-size: var(--font-sm);
}
.keep-file-ref { color: var(--text-muted); font-size: var(--font-xs); margin-left: auto; }
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
