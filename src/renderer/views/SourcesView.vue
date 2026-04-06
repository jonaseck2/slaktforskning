<template>
  <div>
    <div class="header">
      <h2>{{ $t('sources.title') }}</h2>
      <button class="btn-add" @click="showAddForm = true">{{ $t('sources.addSource') }}</button>
    </div>
    <p class="count-label">{{ sourceList.length }} {{ $t('sources.title').toLowerCase() }}</p>
    <div v-if="sourceList.length === 0" class="empty">
      {{ $t('sources.emptyState') }}
    </div>
    <table v-else class="data-table">
      <thead>
        <tr>
          <th>{{ $t('sources.sourceTitle') }}</th>
          <th>{{ $t('sources.author') }}</th>
          <th>{{ $t('common.type') }}</th>
          <th>{{ $t('common.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="source in sourceList"
          :key="source.id"
          class="clickable-row"
          @click="goToDetail(source.id)"
        >
          <td>{{ source.title }}</td>
          <td>{{ source.author || '—' }}</td>
          <td><span v-if="source.source_type" class="type-badge">{{ $t('sourceTypes.' + source.source_type) }}</span></td>
          <td>
            <button class="btn-sm btn-delete" @click.stop="removeSource(source.id)">{{ $t('common.delete') }}</button>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Add Source Modal -->
    <div v-if="showAddForm" class="modal-overlay" @click.self="showAddForm = false">
      <div class="modal">
        <h3>{{ $t('sources.addSource') }}</h3>
        <form @submit.prevent="addSource">
          <label>
            {{ $t('sources.sourceTitle') }}
            <input v-model="form.title" type="text" required autofocus />
          </label>
          <label>
            {{ $t('sources.author') }}
            <input v-model="form.author" type="text" />
          </label>
          <label>
            {{ $t('sources.sourceType') }}
            <select v-model="form.source_type">
              <option value="">{{ $t('sources.selectType') }}</option>
              <option v-for="st in SOURCE_TYPE_VALUES" :key="st" :value="st">
                {{ $t('sourceTypes.' + st) }}
              </option>
            </select>
          </label>
          <label>
            {{ $t('sources.publicationInfo') }}
            <input v-model="form.publication_info" type="text" :placeholder="$t('sources.publicationPlaceholder')" />
          </label>
          <label>
            {{ $t('sources.repository') }}
            <input v-model="form.repository" type="text" :placeholder="$t('sources.repositoryPlaceholder')" />
          </label>
          <label>
            {{ $t('sources.url') }}
            <input v-model="form.url" type="url" :placeholder="$t('sources.urlPlaceholder')" />
          </label>
          <div class="modal-actions">
            <button type="button" class="btn-cancel" @click="showAddForm = false">{{ $t('common.cancel') }}</button>
            <button type="submit">{{ $t('sources.addSource') }}</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onActivated, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { SOURCE_TYPE_VALUES } from '../constants/eventTypes';
import { useDataVersionStore } from '../stores/dataVersion';
const dataVersionStore = useDataVersionStore();
let loadedVersion = -1;

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface SourceRow {
  id: string;
  title: string;
  author: string;
  source_type: string;
}

const { t } = useI18n();
const router = useRouter();
const sourceList = ref<SourceRow[]>([]);
const showAddForm = ref(false);

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') showAddForm.value = false;
}
onMounted(() => window.addEventListener('keydown', handleKeydown));
onUnmounted(() => window.removeEventListener('keydown', handleKeydown));

const form = reactive({
  title: '',
  author: '',
  source_type: '',
  publication_info: '',
  repository: '',
  url: '',
});

async function load() {
  if (!window.api) return;
  try {
    sourceList.value = (await window.api.sources.list()) as SourceRow[];
  } catch (err) {
    console.error('[SourcesView] load failed:', err);
  }
}

async function addSource() {
  if (!window.api) return;
  try {
    await window.api.sources.create({
      title: form.title,
      author: form.author,
      source_type: form.source_type,
      publication_info: form.publication_info,
      repository: form.repository,
      url: form.url,
    });
    showAddForm.value = false;
    form.title = '';
    form.author = '';
    form.source_type = '';
    form.publication_info = '';
    form.repository = '';
    form.url = '';
    await load();
  } catch (err) {
    console.error('[SourcesView] addSource failed:', err);
  }
}

async function removeSource(id: string) {
  if (!window.api) return;
  if (!confirm(t('sources.confirmDelete'))) return;
  try {
    await window.api.sources.delete(id);
    await load();
  } catch (err) {
    console.error('[SourcesView] removeSource failed:', err);
  }
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
.type-badge {
  background: #ede9fe;
  color: #5b21b6;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
}
</style>
