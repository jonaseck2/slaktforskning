<template>
  <div>
    <div v-if="media.length === 0" class="empty-hint">{{ $t('media.noMedia') }}</div>
    <table v-else class="data-table">
      <thead>
        <tr>
          <th class="th-shrink"></th>
          <th class="th-shrink"></th>
          <th>{{ $t('media.title_label') }}</th>
          <th class="th-shrink">{{ $t('media.format') }}</th>
          <th class="actions-cell">{{ $t('common.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(m, idx) in media" :key="m.link_id" class="clickable-row" @click="openLightbox(idx)">
          <td class="td-shrink thumb-cell">
            <img v-if="thumbnails[m.id]" :src="thumbnails[m.id]" class="row-thumb" :alt="mediaDisplayName(m.title, m.file_ref, '')" />
            <span v-else-if="isImage(m.format)" class="row-thumb-placeholder"></span>
            <span v-else class="row-thumb-icon">{{ (m.format || '?').toUpperCase() }}</span>
          </td>
          <td class="td-shrink order-cell">
            <span v-if="idx === 0" class="profile-badge">{{ $t('media.profile') }}</span>
            <button class="btn-order" :disabled="idx === 0" @click.stop="moveUp(idx)" :title="$t('media.moveUp')">&#9650;</button>
            <button class="btn-order" :disabled="idx === media.length - 1" @click.stop="moveDown(idx)" :title="$t('media.moveDown')">&#9660;</button>
          </td>
          <td>{{ mediaDisplayName(m.title, m.file_ref) }}</td>
          <td class="td-shrink">{{ m.format || '—' }}</td>
          <td class="actions-cell">
            <button v-if="m.file_ref" class="btn-sm" @click.stop="openFile(m.id)">{{ $t('media.open') }}</button>
            <button class="btn-sm btn-delete" @click.stop="unlink(m.link_id)">&#10005;</button>
          </td>
        </tr>
      </tbody>
    </table>

    <MediaLightbox
      :media-items="media"
      :current-index="lightboxIndex"
      :visible="lightboxVisible"
      @close="lightboxVisible = false"
      @update:current-index="lightboxIndex = $event"
      @link-changed="load"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import MediaLightbox from './MediaLightbox.vue';
import { mediaDisplayName } from '../utils/mediaUtils';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const IMAGE_FORMATS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'tiff', 'tif']);

export interface MediaItem {
  id: string;
  title: string;
  file_ref: string | null;
  format: string | null;
  link_id: string;
  link_type: number | null;
  sort_order: number;
  notes: string;
}

const props = defineProps<{
  entityType: 'person' | 'place' | 'event' | 'relationship' | 'source';
  entityId: string;
}>();

const media = ref<MediaItem[]>([]);
const thumbnails = ref<Record<string, string>>({});
const lightboxVisible = ref(false);
const lightboxIndex = ref(0);

defineExpose({ attach, reload: load });

function isImage(format: string | null): boolean {
  return format ? IMAGE_FORMATS.has(format.toLowerCase()) : false;
}

async function load() {
  media.value = (await window.api.media.forEntity(props.entityType, props.entityId)) as MediaItem[];
  loadThumbnails();
}

async function loadThumbnails() {
  for (const m of media.value) {
    if (isImage(m.format) && !thumbnails.value[m.id]) {
      const url = await window.api.media.readAsDataUrl(m.id) as string | null;
      if (url) {
        thumbnails.value[m.id] = url;
      }
    }
  }
}

function openLightbox(idx: number) {
  lightboxIndex.value = idx;
  lightboxVisible.value = true;
}

async function attach() {
  const result = await window.api.media.attach({ entityType: props.entityType, entityId: props.entityId });
  if (!(result as { canceled: boolean }).canceled) {
    await load();
  }
}

async function openFile(id: string) {
  await window.api.media.openFile(id);
}

async function unlink(linkId: string) {
  await window.api.media.removeLink(linkId);
  await load();
}

async function reorder(newOrder: MediaItem[]) {
  media.value = newOrder;
  await window.api.media.reorder(newOrder.map(m => m.link_id));
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

watch(() => `${props.entityType}:${props.entityId}`, () => load(), { immediate: true });
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
.thumb-cell {
  width: 40px;
  padding: 4px !important;
}
.row-thumb {
  width: 36px;
  height: 36px;
  object-fit: cover;
  border-radius: 4px;
  display: block;
}
.row-thumb-placeholder {
  display: block;
  width: 36px;
  height: 36px;
  background: #f0f0f0;
  border-radius: 4px;
}
.row-thumb-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: #f0f0f0;
  border-radius: 4px;
  font-size: 9px;
  font-weight: 700;
  color: #999;
}
</style>
