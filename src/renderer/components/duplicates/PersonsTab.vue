<template>
  <div class="duplicates-tab">
    <AppLoadingState v-if="loading && duplicates.length === 0" :rows="5" />
    <AppEmptyState v-else-if="duplicates.length === 0" icon="✅" :title="$t('duplicates.empty.persons')" />
    <template v-else>
      <p class="count-label">{{ summaryText }}</p>
      <div class="duplicates-list-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>{{ $t('duplicates.keepPerson') }}</th>
              <th>{{ $t('duplicates.mergePerson') }}</th>
              <th>{{ $t('duplicates.score') }}</th>
              <th class="actions-cell">{{ $t('common.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in duplicates" :key="d.person1_id + ':' + d.person2_id">
              <td>
                <div class="person-cell">
                  <AppAvatar :person-id="d.person1_id" :given-name="d.person1_name" />
                  <div>
                    <router-link :to="'/persons/' + d.person1_id" class="person-link">{{ d.person1_name }}</router-link>
                    <span v-if="d.person1_birth" class="birth-hint"> ({{ d.person1_birth }})</span>
                  </div>
                </div>
              </td>
              <td>
                <div class="person-cell">
                  <AppAvatar :person-id="d.person2_id" :given-name="d.person2_name" />
                  <div>
                    <router-link :to="'/persons/' + d.person2_id" class="person-link">{{ d.person2_name }}</router-link>
                    <span v-if="d.person2_birth" class="birth-hint"> ({{ d.person2_birth }})</span>
                  </div>
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

    <MergePersonsModal
      v-if="mergeCandidate"
      :target="{ id: mergeCandidate.person1_id }"
      :source="{ id: mergeCandidate.person2_id }"
      :target-name="mergeCandidate.person1_name"
      :source-name="mergeCandidate.person2_name"
      :target-birth="mergeCandidate.person1_birth"
      :source-birth="mergeCandidate.person2_birth"
      :reasons="mergeCandidate.reasons"
      @close="mergeCandidate = null"
      @merged="onMerged"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onActivated } from 'vue';
import { useI18n } from 'vue-i18n';
import AppAvatar from '../ui/AppAvatar.vue';
import AppButton from '../ui/AppButton.vue';
import AppEmptyState from '../ui/AppEmptyState.vue';
import AppLoadingState from '../ui/AppLoadingState.vue';
import MergePersonsModal from '../MergePersonsModal.vue';
import { useToast } from '../../composables/useToast';
import { usePagedList } from '../../composables/usePagedList';
import { useDuplicateCountStore } from '../../stores/duplicateCount';

defineOptions({ name: 'DuplicatesPersonsTab' });

const props = defineProps<{
  /** See PlacesTab for rationale. */
  preopenPair?: [string, string] | null;
}>();
const emit = defineEmits<{ 'preopen-consumed': [] }>();

interface DuplicateCandidate {
  person1_id: string;
  person2_id: string;
  person1_name: string;
  person2_name: string;
  person1_birth: string | null;
  person2_birth: string | null;
  score: number;
  reasons: string[];
}

const { t } = useI18n();
const toast = useToast();
const duplicateCountStore = useDuplicateCountStore();

const mergeCandidate = ref<DuplicateCandidate | null>(null);

const {
  items: duplicates,
  total,
  loading,
  reload: load,
  attachSentinel,
} = usePagedList<DuplicateCandidate, 'score'>({
  defaultSortBy: 'score',
  defaultSortDir: 'desc',
  fetchPage: async (limit, offset) => {
    try {
      return await window.api.duplicates.findPage(limit, offset) as { items: DuplicateCandidate[]; total: number };
    } catch (err) {
      console.error('[DuplicatesPersonsTab] fetchPage failed:', err);
      toast.error(t('errors.loadFailed'));
      return { items: [], total: 0 };
    }
  },
});

const sentinel = ref<HTMLElement | null>(null);
watch(sentinel, (el) => attachSentinel(el));

// Mirror the persons-duplicate-pair count into the shared store so App.vue's
// sidebar "Dubbletter" badge reflects this view's own computation — no separate
// contending duplicates.count() scan on /duplicates entry. `total` is kept
// fresh by the paged-list load, the optimistic ignore decrement, and the
// post-merge reload below.
watch(total, (n) => duplicateCountStore.setCount(n), { immediate: true });

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

function openMerge(d: DuplicateCandidate) {
  mergeCandidate.value = d;
}

async function ignorePair(d: DuplicateCandidate) {
  // Optimistic remove — same pair can't reappear because it's now persisted in
  // ignored_duplicates, so no need to round-trip the whole list.
  duplicates.value = duplicates.value.filter(x => !(x.person1_id === d.person1_id && x.person2_id === d.person2_id));
  if (total.value > 0) total.value -= 1;
  try {
    await window.api.duplicates.ignore(d.person1_id, d.person2_id);
    toast.success(t('duplicates.ignored'));
  } catch (err) {
    console.error('[DuplicatesPersonsTab] ignore failed:', err);
    toast.error(t('errors.saveFailed'));
    await load();
  }
}

async function onMerged() {
  mergeCandidate.value = null;
  await load();
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
      d => (d.person1_id === a && d.person2_id === b) || (d.person1_id === b && d.person2_id === a),
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
/* Sticky table header is defined globally in shared.css `.data-table thead th`. */
.person-cell { display: flex; align-items: center; gap: var(--space-sm); }
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
