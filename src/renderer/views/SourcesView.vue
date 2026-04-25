<template>
  <div>
    <div class="header">
      <h2>{{ $t('sources.title') }}</h2>
      <AppButton variant="soft" @click="showAddForm = true">+ {{ $t('sources.addSource') }}</AppButton>
    </div>
    <p v-if="sourceList.length > 0" class="count-label">{{ sourceList.length }} {{ $t('sources.title').toLowerCase() }}</p>
    <AppEmptyState v-if="sourceList.length === 0" icon="📚" :title="$t('empty.sources')" :description="$t('empty.sourcesDesc')" :action-label="$t('empty.addSource')" @action="showAddForm = true" />
    <table v-else class="data-table">
      <thead>
        <tr>
          <th>{{ $t('sources.sourceTitle') }}</th>
          <th>{{ $t('sources.author') }}</th>
          <th>{{ $t('common.type') }}</th>
          <th class="actions-cell">{{ $t('common.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="source in sourceList"
          :key="source.id"
          v-narrate="() => narrateSourceRow({
            title: source.title || '',
            source_type: source.source_type || '',
            citation_count: 0,
          }, t)"
          class="clickable-row"
          tabindex="0"
          role="button"
          :aria-label="$t('a11y.editItem', { item: source.title || '—' })"
          @click="goToDetail(source.id)"
          @keydown.enter="goToDetail(source.id)"
          @keydown.space.prevent="goToDetail(source.id)"
          @keydown.down.prevent="focusNextRow($event)"
          @keydown.up.prevent="focusPrevRow($event)"
        >
          <td><LinkedText :text="source.title" /></td>
          <td>{{ source.author || '—' }}</td>
          <td><AppBadge v-if="source.source_type" variant="event">{{ $t('sourceTypes.' + source.source_type) }}</AppBadge></td>
          <td class="actions-cell">
            <AppButton variant="ghost" size="sm" @click.stop="removeSource(source.id)">✕</AppButton>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Add Source Modal -->
    <SourceModal
      v-if="showAddForm"
      mode="standalone"
      @cancel="showAddForm = false"
      @close="showAddForm = false"
      @saved="onSourceSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onActivated } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import LinkedText from '../components/LinkedText.vue';
import AppButton from '../components/ui/AppButton.vue';
import AppBadge from '../components/ui/AppBadge.vue';
import AppEmptyState from '../components/ui/AppEmptyState.vue';
import SourceModal from '../components/modals/SourceModal.vue';
import { narrateSourceRow } from '../utils/screenReaderNarration';
import { useDataVersionStore } from '../stores/dataVersion';
import { useToast } from '../composables/useToast';
const dataVersionStore = useDataVersionStore();
let loadedVersion = -1;

interface SourceRow {
  id: string;
  title: string;
  author: string;
  source_type: string;
}

const { t } = useI18n();
const toast = useToast();
const router = useRouter();
const sourceList = ref<SourceRow[]>([]);
const showAddForm = ref(false);

async function load() {
  if (!window.api) return;
  try {
    sourceList.value = (await window.api.sources.list()) as SourceRow[];
  } catch (err) {
    console.error('[SourcesView] load failed:', err);
    toast.error(t('errors.loadFailed'));
  }
}

function onSourceSaved() {
  showAddForm.value = false;
  load();
}

async function removeSource(id: string) {
  if (!window.api) return;
  if (!confirm(t('sources.confirmDelete'))) return;
  try {
    await window.api.sources.delete(id);
    await load();
  } catch (err) {
    console.error('[SourcesView] removeSource failed:', err);
    toast.error(t('errors.deleteFailed'));
  }
}

function focusNextRow(e: KeyboardEvent): void {
  const row = (e.target as HTMLElement).nextElementSibling as HTMLElement | null;
  if (row?.matches('tr[tabindex]')) row.focus();
}
function focusPrevRow(e: KeyboardEvent): void {
  const row = (e.target as HTMLElement).previousElementSibling as HTMLElement | null;
  if (row?.matches('tr[tabindex]')) row.focus();
}

function goToDetail(id: string) {
  router.push(`/sources/${id}`);
}

onMounted(async () => {
  await load();
  loadedVersion = dataVersionStore.version;
});

onActivated(async () => {
  if (dataVersionStore.version !== loadedVersion) {
    await load();
    loadedVersion = dataVersionStore.version;
  }
});
</script>

<style scoped>
/* Unique to SourcesView */
.actions-cell { width: 1px; text-align: right; white-space: nowrap; }
</style>
