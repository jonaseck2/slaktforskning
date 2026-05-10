<template>
  <div class="duplicates-tab">
    <AppLoadingState v-if="loading && duplicates.length === 0" :rows="5" />
    <AppEmptyState v-else-if="duplicates.length === 0" icon="✅" :title="$t('duplicates.empty.sources')" />
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
            <tr v-for="d in duplicates" :key="d.source1_id + ':' + d.source2_id">
              <td>
                <div>
                  <router-link :to="'/sources/' + d.source1_id" class="person-link">{{ d.source1_title || $t('duplicates.untitled') }}</router-link>
                  <span v-if="d.source1_author" class="birth-hint"> — {{ d.source1_author }}</span>
                </div>
              </td>
              <td>
                <div>
                  <router-link :to="'/sources/' + d.source2_id" class="person-link">{{ d.source2_title || $t('duplicates.untitled') }}</router-link>
                  <span v-if="d.source2_author" class="birth-hint"> — {{ d.source2_author }}</span>
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

    <MergeSourcesModal
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
import MergeSourcesModal from '../MergeSourcesModal.vue';
import { useToast } from '../../composables/useToast';
import { usePagedList } from '../../composables/usePagedList';

defineOptions({ name: 'DuplicatesSourcesTab' });

interface DuplicateSourceCandidate {
  source1_id: string;
  source2_id: string;
  source1_title: string;
  source2_title: string;
  source1_author: string;
  source2_author: string;
  score: number;
  reasons: string[];
}

const { t } = useI18n();
const toast = useToast();

const mergeCandidate = ref<DuplicateSourceCandidate | null>(null);

const {
  items: duplicates,
  total,
  loading,
  reload: load,
  attachSentinel,
} = usePagedList<DuplicateSourceCandidate, 'score'>({
  defaultSortBy: 'score',
  defaultSortDir: 'desc',
  fetchPage: async (limit, offset) => {
    try {
      const [items, totalCount] = await Promise.all([
        window.api.duplicates.findSources(limit, offset) as Promise<DuplicateSourceCandidate[]>,
        window.api.duplicates.countSources() as Promise<number>,
      ]);
      return { items, total: totalCount };
    } catch (err) {
      console.error('[DuplicatesSourcesTab] fetchPage failed:', err);
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

function openMerge(d: DuplicateSourceCandidate) {
  mergeCandidate.value = d;
}

async function onMerged() {
  mergeCandidate.value = null;
  await load();
}

async function ignorePair(d: DuplicateSourceCandidate) {
  duplicates.value = duplicates.value.filter(x => !(x.source1_id === d.source1_id && x.source2_id === d.source2_id));
  if (total.value > 0) total.value -= 1;
  try {
    await window.api.duplicates.ignoreSource(d.source1_id, d.source2_id);
    toast.success(t('duplicates.ignored'));
  } catch (err) {
    console.error('[DuplicatesSourcesTab] ignore failed:', err);
    toast.error(t('errors.saveFailed'));
    await load();
  }
}

onMounted(load);
onActivated(load);
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
.birth-hint { color: var(--text-muted); font-size: var(--font-xs); }
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
