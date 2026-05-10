<template>
  <BaseSubPanel
    entity-type="place"
    :title="$t('duplicates.places.mergeTitle')"
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
            <strong>{{ pair.place1_name }}</strong>
            <div class="entity-meta">ID: {{ pair.place1_id.slice(0, 8) }}</div>
          </div>
        </div>
        <div class="merge-arrow">←</div>
        <div class="merge-side">
          <h5>{{ $t('duplicates.mergeEntity') }}</h5>
          <div class="entity-card source">
            <strong>{{ pair.place2_name }}</strong>
            <div class="entity-meta">ID: {{ pair.place2_id.slice(0, 8) }}</div>
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
      :title="$t('duplicates.places.confirmTitle')"
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

interface PlacePair {
  place1_id: string;
  place2_id: string;
  place1_name: string;
  place2_name: string;
  score: number;
}

interface PlaceFull {
  id: string;
  name: string;
  normalized_name?: string | null;
  place_type?: string | null;
  parent_place_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  date_from?: string | null;
  date_to?: string | null;
  notes?: string | null;
  street?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
}

const { t } = useI18n();
const toast = useToast();

const props = defineProps<{ pair: PlacePair }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'merged'): void }>();

const merging = ref(false);
const loading = ref(true);
const target = ref<PlaceFull | null>(null);
const source = ref<PlaceFull | null>(null);
const targetParentName = ref<string | null>(null);
const sourceParentName = ref<string | null>(null);
const confirmVisible = ref(false);

interface FieldRow { label: string; targetText: string; sourceText: string; differs: boolean }

const fieldRows = computed<FieldRow[]>(() => {
  const tgt = target.value;
  const src = source.value;
  if (!tgt || !src) return [];
  const def = (v: unknown) => (v === null || v === undefined || v === '') ? '—' : String(v);
  const fields: Array<[string, keyof PlaceFull]> = [
    ['name', 'name'],
    ['place_type', 'place_type'],
    ['latitude', 'latitude'],
    ['longitude', 'longitude'],
    ['date_from', 'date_from'],
    ['date_to', 'date_to'],
    ['street', 'street'],
    ['postal_code', 'postal_code'],
    ['city', 'city'],
    ['country', 'country'],
    ['notes', 'notes'],
    ['normalized_name', 'normalized_name'],
  ];
  const rows: FieldRow[] = fields.map(([key, prop]) => {
    const a = tgt[prop];
    const b = src[prop];
    return {
      label: t(`places.${key}`, key),
      targetText: def(a),
      sourceText: def(b),
      differs: (a ?? null) !== (b ?? null),
    };
  });
  // Parent place — resolved via separate fetches.
  rows.splice(1, 0, {
    label: t('places.parent_place_id', 'parent place'),
    targetText: targetParentName.value ?? (tgt.parent_place_id ? tgt.parent_place_id.slice(0, 8) : '—'),
    sourceText: sourceParentName.value ?? (src.parent_place_id ? src.parent_place_id.slice(0, 8) : '—'),
    differs: (tgt.parent_place_id ?? null) !== (src.parent_place_id ?? null),
  });
  return rows;
});

const confirmMessages = computed(() => [
  t('duplicates.places.confirmMerge', { name: props.pair.place2_name }),
  t('duplicates.places.confirmCascade'),
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
      window.api.places.get(props.pair.place1_id) as Promise<PlaceFull>,
      window.api.places.get(props.pair.place2_id) as Promise<PlaceFull>,
    ]);
    target.value = t1;
    source.value = t2;
    // Best-effort parent resolution — non-fatal.
    if (t1.parent_place_id) {
      try {
        const p = await window.api.places.get(t1.parent_place_id) as PlaceFull;
        targetParentName.value = p?.name ?? null;
      } catch { /* ignore */ }
    }
    if (t2.parent_place_id) {
      try {
        const p = await window.api.places.get(t2.parent_place_id) as PlaceFull;
        sourceParentName.value = p?.name ?? null;
      } catch { /* ignore */ }
    }
  } catch (err) {
    console.error('[MergePlacesModal] load failed:', err);
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
    await window.api.duplicates.mergePlaces(props.pair.place1_id, props.pair.place2_id);
    toast.success(t('duplicates.mergedToast'));
    emit('merged');
  } catch (err) {
    console.error('[MergePlacesModal] merge failed:', err);
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
