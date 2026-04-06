<template>
  <div class="media-view">
    <div class="view-header">
      <h2>{{ $t('media.title') }}</h2>
      <button class="btn-add" @click="attachFile">{{ $t('media.attach') }}</button>
    </div>

    <div v-if="loading" class="loading">{{ $t('common.loading') }}</div>
    <div v-else-if="items.length === 0" class="empty-state">{{ $t('media.noMedia') }}</div>
    <table v-else class="data-table">
      <thead>
        <tr>
          <th>{{ $t('media.title_label') }}</th>
          <th>{{ $t('media.format') }}</th>
          <th>{{ $t('media.fileRef') }}</th>
          <th>{{ $t('common.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in items" :key="item.id" :class="{ 'missing-file': item.is_missing }">
          <td>
            {{ item.title || '—' }}
            <span v-if="item.is_missing" class="missing-badge">{{ $t('media.isMissing') }}</span>
          </td>
          <td>{{ item.format || '—' }}</td>
          <td class="file-ref-cell">{{ item.file_ref || '—' }}</td>
          <td class="actions-cell">
            <button
              v-if="item.file_ref && !item.is_missing"
              class="btn-sm"
              @click="openFile(item.id)"
            >{{ $t('media.open') }}</button>
            <button class="btn-sm btn-delete" @click="deleteItem(item.id)">{{ $t('media.delete') }}</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

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

async function load() {
  loading.value = true;
  items.value = (await window.api.media.list()) as MediaItem[];
  loading.value = false;
}

async function attachFile() {
  const result = await window.api.media.attach() as { canceled: boolean; media?: MediaItem };
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
.media-view {
  max-width: 900px;
}

.view-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.view-header h2 {
  font-size: 22px;
  font-weight: 600;
}

.empty-state {
  color: #666;
  font-style: italic;
  padding: 24px 0;
}

.loading {
  color: #666;
  padding: 24px 0;
}

.file-ref-cell {
  font-family: monospace;
  font-size: 12px;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.missing-file td {
  opacity: 0.6;
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

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th,
.data-table td {
  text-align: left;
  padding: 8px 12px;
  border-bottom: 1px solid #e5e7eb;
  font-size: 14px;
}

.data-table th {
  font-weight: 600;
  color: #555;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: #f9fafb;
}

.actions-cell {
  white-space: nowrap;
  display: flex;
  gap: 6px;
  align-items: center;
}

.btn-add {
  padding: 7px 14px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
}

.btn-add:hover {
  background: #2563eb;
}

.btn-sm {
  padding: 3px 10px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
}

.btn-sm:hover {
  background: #f3f4f6;
}

.btn-delete {
  border-color: #fca5a5;
  color: #dc2626;
}

.btn-delete:hover {
  background: #fef2f2;
}
</style>
