<template>
  <div class="duplicates-tab">
    <AppLoadingState v-if="loading && duplicates.length === 0" :rows="5" />
    <AppEmptyState v-else-if="duplicates.length === 0" icon="✅" :title="$t('duplicates.empty.media')" />
    <template v-else>
      <p class="count-label">{{ summaryText }}</p>
      <div class="duplicates-list-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>{{ $t('duplicates.keepEntity') }}</th>
              <th>{{ $t('duplicates.mergeEntity') }}</th>
              <th>{{ $t('duplicates.score') }}</th>
              <th class="actions-cell">{{ $t('common.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in duplicates" :key="d.media1_id + ':' + d.media2_id">
              <td>
                <div>
                  <span class="person-link">{{ d.media1_title || $t('duplicates.untitled') }}</span>
                  <div v-if="d.media1_file_ref" class="birth-hint" :title="d.media1_file_ref">{{ fileRefShort(d.media1_file_ref) }}</div>
                </div>
              </td>
              <td>
                <div>
                  <span class="person-link">{{ d.media2_title || $t('duplicates.untitled') }}</span>
                  <div v-if="d.media2_file_ref" class="birth-hint" :title="d.media2_file_ref">{{ fileRefShort(d.media2_file_ref) }}</div>
                </div>
              </td>
              <td><span :class="'score-badge score-' + scoreLevel(d.score)">{{ d.score }}%</span></td>
              <td class="actions-cell">
                <AppButton size="sm" @click="openMerge(d)">{{ $t('duplicates.confirmMerge') }}</AppButton>
                <button
                  type="button"
                  class="btn-sm btn-delete btn-ignore-pair"
                  :title="$t('duplicates.ignoreTooltip')"
                  :aria-label="$t('duplicates.ignore')"
                  @click="ignorePair(d)"
                >✕</button>
              </td>
            </tr>
          </tbody>
        </table>
        <div ref="sentinel" class="scroll-sentinel"></div>
      </div>
    </template>

    <MergeMediaModal
      v-if="mergeCandidate"
      :pair="mergeCandidate"
      @close="mergeCandidate = null"
      @merged="onMerged"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onActivated } from 'vue';
import { useI18n } from 'vue-i18n';
import AppButton from '../ui/AppButton.vue';
import AppEmptyState from '../ui/AppEmptyState.vue';
import AppLoadingState from '../ui/AppLoadingState.vue';
import MergeMediaModal from '../MergeMediaModal.vue';
import { useToast } from '../../composables/useToast';
import { usePagedList } from '../../composables/usePagedList';

defineOptions({ name: 'DuplicatesMediaTab' });

const props = defineProps<{
  /** See PlacesTab for rationale. */
  preopenPair?: [string, string] | null;
}>();
const emit = defineEmits<{ 'preopen-consumed': [] }>();

interface DuplicateMediaCandidate {
  media1_id: string;
  media2_id: string;
  media1_title: string;
  media2_title: string;
  media1_file_ref: string | null;
  media2_file_ref: string | null;
  score: number;
  reasons: string[];
}

const { t } = useI18n();
const toast = useToast();

const mergeCandidate = ref<DuplicateMediaCandidate | null>(null);

const {
  items: duplicates,
  total,
  loading,
  reload: load,
  attachSentinel,
} = usePagedList<DuplicateMediaCandidate, 'score'>({
  defaultSortBy: 'score',
  defaultSortDir: 'desc',
  fetchPage: async (limit, offset) => {
    try {
      const [items, totalCount] = await Promise.all([
        window.api.duplicates.findMedia(limit, offset) as Promise<DuplicateMediaCandidate[]>,
        window.api.duplicates.countMedia() as Promise<number>,
      ]);
      return { items, total: totalCount };
    } catch (err) {
      console.error('[DuplicatesMediaTab] fetchPage failed:', err);
      toast.error(t('errors.loadFailed'));
      return { items: [], total: 0 };
    }
  },
});

const sentinel = ref<HTMLElement | null>(null);
watch(sentinel, (el) => attachSentinel(el));

const summaryText = computed(() => {
  const shown = duplicates.value.length;
  if (total.value > shown) {
    return t('duplicates.showingOf', { shown, total: total.value });
  }
  return t('duplicates.totalPairs', { count: shown }, shown);
});

function scoreLevel(score: number): string {
  if (score >= 80) return 'high';
  if (score >= 60) return 'medium';
  return 'low';
}

function fileRefShort(ref: string | null): string {
  if (!ref) return '';
  // Last path segment: work with both `/` and `\` separators (legacy imports).
  const parts = ref.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || ref;
}

function openMerge(d: DuplicateMediaCandidate) {
  mergeCandidate.value = d;
}

async function onMerged() {
  mergeCandidate.value = null;
  await load();
}

async function ignorePair(d: DuplicateMediaCandidate) {
  duplicates.value = duplicates.value.filter(x => !(x.media1_id === d.media1_id && x.media2_id === d.media2_id));
  if (total.value > 0) total.value -= 1;
  try {
    await window.api.duplicates.ignoreMedia(d.media1_id, d.media2_id);
    toast.success(t('duplicates.ignored'));
  } catch (err) {
    console.error('[DuplicatesMediaTab] ignore failed:', err);
    toast.error(t('errors.saveFailed'));
    await load();
  }
}

onMounted(load);
onActivated(load);

// --- Quality-view deep link — see PlacesTab for full rationale. ---
let preopenConsumed = false;
watch(
  () => [props.preopenPair, duplicates.value.length] as const,
  () => {
    if (preopenConsumed) return;
    const pair = props.preopenPair;
    if (!pair || duplicates.value.length === 0) return;
    const [a, b] = pair;
    const match = duplicates.value.find(
      d => (d.media1_id === a && d.media2_id === b) || (d.media1_id === b && d.media2_id === a),
    );
    preopenConsumed = true;
    if (match) {
      mergeCandidate.value = match;
    } else {
      toast.info(t('duplicates.pairNotFound'));
    }
    emit('preopen-consumed');
  },
  { immediate: true },
);
</script>

<style scoped>
.duplicates-tab {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.duplicates-list-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.birth-hint {
  color: var(--text-muted);
  font-size: var(--font-xs);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 320px;
}
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
.actions-cell { display: flex; gap: var(--space-sm); align-items: center; justify-content: flex-end; }
</style>
