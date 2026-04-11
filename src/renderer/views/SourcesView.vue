<template>
  <div>
    <div class="header">
      <h2>{{ $t('sources.title') }}</h2>
      <button class="btn-add" @click="showAddForm = true"><span aria-hidden="true">+ </span>{{ $t('sources.addSource') }}</button>
    </div>
    <p v-if="sourceList.length > 0" class="count-label">{{ sourceList.length }} {{ $t('sources.title').toLowerCase() }}</p>
    <div v-if="sourceList.length === 0" class="empty" tabindex="0" :data-narrate="$t('screenReader.tableEmpty', { type: $t('sources.title') })">
      {{ $t('sources.emptyState') }}
    </div>
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
          <td><span v-if="source.source_type" class="type-badge">{{ $t('sourceTypes.' + source.source_type) }}</span></td>
          <td class="actions-cell">
            <button class="btn-sm btn-delete" @click.stop="removeSource(source.id)">✕</button>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Add Source Modal -->
    <BaseModal v-if="showAddForm" @close="showAddForm = false" title-id="modal-title-add-source">
        <h3 id="modal-title-add-source">{{ $t('sources.addSource') }}</h3>
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
    </BaseModal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onActivated } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import BaseModal from '../components/BaseModal.vue';
import LinkedText from '../components/LinkedText.vue';
import { SOURCE_TYPE_VALUES } from '../constants/eventTypes';
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
    toast.error(t('errors.loadFailed'));
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
    toast.error(t('errors.saveFailed'));
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
.type-badge {
  background: #ede9fe;
  color: #5b21b6;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: var(--font-xs);
}
</style>
