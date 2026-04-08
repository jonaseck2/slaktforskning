<template>
  <div>
    <div v-if="media.length === 0" class="empty-hint">{{ $t('media.noMedia') }}</div>
    <table v-else class="data-table">
      <thead>
        <tr>
          <th class="th-shrink"></th>
          <th>{{ $t('media.title_label') }}</th>
          <th class="th-shrink">{{ $t('media.format') }}</th>
          <th class="actions-cell">{{ $t('common.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(m, idx) in media" :key="m.link_id">
          <td class="td-shrink order-cell">
            <span v-if="idx === 0" class="profile-badge">{{ $t('media.profile') }}</span>
            <button class="btn-order" :disabled="idx === 0" @click="moveUp(idx)" :title="$t('media.moveUp')">&#9650;</button>
            <button class="btn-order" :disabled="idx === media.length - 1" @click="moveDown(idx)" :title="$t('media.moveDown')">&#9660;</button>
          </td>
          <td>{{ m.title || '—' }}</td>
          <td class="td-shrink">{{ m.format || '—' }}</td>
          <td class="actions-cell">
            <button v-if="m.file_ref" class="btn-sm" @click="openFile(m.id)">{{ $t('media.open') }}</button>
            <button class="btn-sm btn-delete" @click="unlink(m.link_id)">&#10005;</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

export interface MediaItem {
  id: string;
  title: string;
  file_ref: string | null;
  format: string | null;
  link_id: string;
  link_type: number | null;
  sort_order: number;
}

const props = defineProps<{ personId: string }>();
const emit = defineEmits<{ profileChanged: [] }>();

const media = ref<MediaItem[]>([]);

defineExpose({ attach, reload: load });

async function load() {
  media.value = (await window.api.media.forEntity('person', props.personId)) as MediaItem[];
}

async function attach() {
  const result = await window.api.media.attach({ entityType: 'person', entityId: props.personId });
  if (!result.canceled) {
    await load();
    emit('profileChanged');
  }
}

async function openFile(id: string) {
  await window.api.media.openFile(id);
}

async function unlink(linkId: string) {
  await window.api.media.removeLink(linkId);
  await load();
  emit('profileChanged');
}

async function reorder(newOrder: MediaItem[]) {
  media.value = newOrder;
  await window.api.media.reorder(newOrder.map(m => m.link_id));
  emit('profileChanged');
}

function moveUp(idx: number) {
  if (idx === 0) return;
  const items = [...media.value];
  [items[idx - 1], items[idx]] = [items[idx], items[idx - 1]];
  reorder(items);
}

function moveDown(idx: number) {
  if (idx === media.value.length - 1) return;
  const items = [...media.value];
  [items[idx], items[idx + 1]] = [items[idx + 1], items[idx]];
  reorder(items);
}

watch(() => props.personId, load, { immediate: true });
</script>

<style scoped>
.th-shrink, .td-shrink { width: 1%; white-space: nowrap; }
.actions-cell { width: 1px; text-align: right; white-space: nowrap; vertical-align: middle; }
.order-cell { text-align: center; vertical-align: middle; }
.btn-order {
  background: none;
  border: 1px solid transparent;
  cursor: pointer;
  padding: 0 3px;
  font-size: 10px;
  color: #888;
  line-height: 1;
}
.btn-order:hover:not(:disabled) { color: #333; border-color: #ccc; }
.btn-order:disabled { opacity: 0.3; cursor: default; }
.profile-badge {
  display: inline-block;
  font-size: var(--font-xs, 11px);
  background: #e8f0fe;
  color: #1a73e8;
  padding: 1px 6px;
  border-radius: 3px;
  margin-bottom: 2px;
}
</style>
