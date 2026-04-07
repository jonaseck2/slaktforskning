<template>
  <div>
    <div class="header">
      <h2>{{ $t('media.title') }}</h2>
      <button class="btn-add" @click="attachFile">{{ $t('media.attach') }}</button>
    </div>

    <p v-if="!loading && items.length > 0" class="count-label">
      {{ items.length }} {{ $t('media.title').toLowerCase() }}<template v-if="missingCount > 0"> · {{ $t('media.missingCount', { count: missingCount }) }}</template>
    </p>
    <div v-if="loading" class="loading">{{ $t('common.loading') }}</div>
    <div v-else-if="items.length === 0" class="empty-state">{{ $t('media.noMedia') }}</div>
    <table v-else class="data-table">
      <thead>
        <tr>
          <th>{{ $t('media.title_label') }}</th>
          <th>{{ $t('media.format') }}</th>
          <th>{{ $t('media.fileRef') }}</th>
          <th class="actions-cell">{{ $t('common.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in items" :key="item.id" :class="{ 'missing-file': item.is_missing }">
          <td>
            {{ item.title || '—' }}
            <span v-if="item.is_missing" class="missing-badge">{{ $t('media.isMissing') }}</span>
            <div v-if="item.notes" class="item-notes">{{ item.notes }}</div>
          </td>
          <td>{{ item.format || '—' }}</td>
          <td class="file-ref-cell">{{ item.file_ref || '—' }}</td>
          <td class="actions-cell">
            <button
              v-if="item.file_ref && !item.is_missing"
              class="btn-sm"
              @click="openFile(item.id)"
            >{{ $t('media.open') }}</button>
            <button class="btn-sm btn-delete" @click="deleteItem(item.id)">✕</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

interface MediaItem {
  id: string;
  title: string;
  file_ref: string | null;
  format: string | null;
  notes: string;
  is_printable: boolean;
  is_missing: number;
  created_at: string;
}

const items = ref<MediaItem[]>([]);
const loading = ref(true);
const missingCount = computed(() => items.value.filter(i => i.is_missing).length);

async function load() {
  loading.value = true;
  items.value = (await window.api.media.list()) as MediaItem[];
  loading.value = false;
}

async function attachFile() {
  const result = await window.api.media.attach();
  if (!result.canceled) {
    await load();
  }
}

async function openFile(id: string) {
  await window.api.media.openFile(id);
}

async function deleteItem(id: string) {
  if (!confirm(t('media.confirmDelete'))) return;
  await window.api.media.delete(id);
  await load();
}

onMounted(load);
</script>

<style scoped>
/* Unique to MediaView */

.file-ref-cell {
  font-family: monospace;
  font-size: 12px;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.missing-file td { opacity: 0.6; }
.item-notes {
  font-size: var(--font-xs);
  color: #777;
  margin-top: 2px;
  white-space: pre-line;
}
.missing-badge {
  display: inline-block;
  background: #e53e3e;
  color: white;
  font-size: 10px;
  font-weight: 600;
  border-radius: 4px;
  padding: 1px 5px;
  margin-left: 6px;
  vertical-align: middle;
}
.actions-cell {
  width: 1px;
  white-space: nowrap;
  text-align: right;
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: flex-end;
}
</style>
