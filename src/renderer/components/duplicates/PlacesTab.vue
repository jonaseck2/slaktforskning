<template>
  <div class="duplicates-tab">
    <AppLoadingState v-if="loading && duplicates.length === 0" :rows="5" />
    <AppEmptyState v-else-if="duplicates.length === 0" icon="✅" :title="$t('duplicates.empty.places')" />
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
            <tr v-for="d in duplicates" :key="d.place1_id + ':' + d.place2_id">
              <td>
                <div>
                  <router-link :to="'/places/' + d.place1_id" class="person-link">{{ d.place1_name }}</router-link>
                  <span v-if="d.place1_parent_id" class="birth-hint"> ({{ $t('duplicates.places.parented') }})</span>
                </div>
              </td>
              <td>
                <div>
                  <router-link :to="'/places/' + d.place2_id" class="person-link">{{ d.place2_name }}</router-link>
                  <span v-if="d.place2_parent_id" class="birth-hint"> ({{ $t('duplicates.places.parented') }})</span>
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

    <MergePlacesModal
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
import MergePlacesModal from '../MergePlacesModal.vue';
import { useToast } from '../../composables/useToast';
import { usePagedList } from '../../composables/usePagedList';

defineOptions({ name: 'DuplicatesPlacesTab' });

interface DuplicatePlaceCandidate {
  place1_id: string;
  place2_id: string;
  place1_name: string;
  place2_name: string;
  place1_parent_id: string | null;
  place2_parent_id: string | null;
  score: number;
  reasons: string[];
}

const { t } = useI18n();
const toast = useToast();

const mergeCandidate = ref<DuplicatePlaceCandidate | null>(null);

const {
  items: duplicates,
  total,
  loading,
  reload: load,
  attachSentinel,
} = usePagedList<DuplicatePlaceCandidate, 'score'>({
  defaultSortBy: 'score',
  defaultSortDir: 'desc',
  fetchPage: async (limit, offset) => {
    try {
      const [items, totalCount] = await Promise.all([
        window.api.duplicates.findPlaces(limit, offset) as Promise<DuplicatePlaceCandidate[]>,
        window.api.duplicates.countPlaces() as Promise<number>,
      ]);
      return { items, total: totalCount };
    } catch (err) {
      console.error('[DuplicatesPlacesTab] fetchPage failed:', err);
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

function openMerge(d: DuplicatePlaceCandidate) {
  mergeCandidate.value = d;
}

async function onMerged() {
  mergeCandidate.value = null;
  await load();
}

async function ignorePair(d: DuplicatePlaceCandidate) {
  duplicates.value = duplicates.value.filter(x => !(x.place1_id === d.place1_id && x.place2_id === d.place2_id));
  if (total.value > 0) total.value -= 1;
  try {
    await window.api.duplicates.ignorePlace(d.place1_id, d.place2_id);
    toast.success(t('duplicates.ignored'));
  } catch (err) {
    console.error('[DuplicatesPlacesTab] ignore failed:', err);
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
