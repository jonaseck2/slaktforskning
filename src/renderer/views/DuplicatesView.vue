<template>
  <div class="duplicates-view">
    <div class="header">
      <h2>{{ $t('duplicates.title') }}</h2>
      <p class="duplicates-hint">{{ $t('duplicates.hint') }}</p>
    </div>

    <AppLoadingState v-if="loading" :rows="5" />
    <AppEmptyState v-else-if="duplicates.length === 0" icon="✅" :title="$t('empty.duplicates')" />
    <table v-else class="data-table">
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
            <router-link :to="'/persons/' + d.person1_id" class="person-link">{{ d.person1_name }}</router-link>
            <span v-if="d.person1_birth" class="birth-hint"> ({{ d.person1_birth }})</span>
          </td>
          <td>
            <router-link :to="'/persons/' + d.person2_id" class="person-link">{{ d.person2_name }}</router-link>
            <span v-if="d.person2_birth" class="birth-hint"> ({{ d.person2_birth }})</span>
          </td>
          <td><span :class="'score-badge score-' + scoreLevel(d.score)">{{ d.score }}%</span></td>
          <td class="actions-cell">
            <AppButton size="sm" @click="openMerge(d)">{{ $t('duplicates.confirmMerge') }}</AppButton>
          </td>
        </tr>
      </tbody>
    </table>

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
import { ref, onMounted, onActivated } from 'vue';
import { useI18n } from 'vue-i18n';
import AppButton from '../components/ui/AppButton.vue';
import AppEmptyState from '../components/ui/AppEmptyState.vue';
import AppLoadingState from '../components/ui/AppLoadingState.vue';
import MergePersonsModal from '../components/MergePersonsModal.vue';
import { useToast } from '../composables/useToast';

defineOptions({ name: 'DuplicatesView' });

declare const window: Window & {
  api: {
    duplicates: { find: (limit?: number) => Promise<DuplicateCandidate[]> };
  };
};

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

const duplicates = ref<DuplicateCandidate[]>([]);
const loading = ref(false);
const mergeCandidate = ref<DuplicateCandidate | null>(null);

async function load() {
  if (!window.api) return;
  loading.value = true;
  try {
    duplicates.value = (await window.api.duplicates.find(100)) as DuplicateCandidate[];
  } catch (err) {
    console.error('[DuplicatesView] load failed:', err);
    toast.error(t('errors.loadFailed'));
  } finally {
    loading.value = false;
  }
}

function scoreLevel(score: number): string {
  if (score >= 80) return 'high';
  if (score >= 60) return 'medium';
  return 'low';
}

function openMerge(d: DuplicateCandidate) {
  mergeCandidate.value = d;
}

async function onMerged() {
  mergeCandidate.value = null;
  await load();
}

onMounted(load);
onActivated(load);
</script>

<style scoped>
.duplicates-view {
  padding: var(--space-lg);
}
.duplicates-hint {
  color: var(--text-muted);
  font-size: var(--font-sm);
  margin-top: var(--space-xs);
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
</style>
