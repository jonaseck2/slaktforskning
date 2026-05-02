<template>
  <div>
    <MediaAddRow
      v-if="showAddRow"
      :exclude-ids="excludeIds"
      @committed="onCommitted"
      @cancelled="showAddRow = false"
    />
    <SectionEmpty v-if="media.length === 0 && !showAddRow" :message="$t('empty.media')" />
    <table v-else-if="media.length > 0" class="data-table">
      <thead>
        <tr>
          <th class="th-shrink"></th>
          <th v-if="!props.readonly" class="th-shrink"></th>
          <th>{{ $t('media.title_label') }}</th>
          <th class="th-shrink">{{ $t('media.format') }}</th>
          <th v-if="!props.readonly" class="actions-cell">{{ $t('common.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(m, idx) in media" :key="m.link_id" class="clickable-row" @click="openMedia(m.id)">
          <td class="td-shrink thumb-cell">
            <img v-if="thumbnails[m.id]" :src="thumbnails[m.id]" class="row-thumb" :alt="mediaDisplayName(m.title, m.file_ref, '')" />
            <span v-else-if="isImageMedia(m.format, m.file_ref)" class="row-thumb-placeholder"></span>
            <span v-else class="row-thumb-icon">{{ (m.format || '?').toUpperCase() }}</span>
          </td>
          <td v-if="!props.readonly" class="td-shrink order-cell">
            <span v-if="idx === 0" class="profile-badge">{{ $t('media.profile') }}</span>
            <button class="btn-order" :disabled="idx === 0" @click.stop="moveUp(idx)" :title="$t('media.moveUp')">&#9650;</button>
            <button class="btn-order" :disabled="idx === media.length - 1" @click.stop="moveDown(idx)" :title="$t('media.moveDown')">&#9660;</button>
          </td>
          <td>{{ mediaDisplayName(m.title, m.file_ref) }}</td>
          <td class="td-shrink">{{ m.format || '—' }}</td>
          <td v-if="!props.readonly" class="actions-cell">
            <button v-if="m.file_ref" class="btn-sm" @click.stop="openFile(m.id)">{{ $t('media.open') }}</button>
            <button
              class="btn-sm btn-delete"
              :aria-label="$t('a11y.deleteItem', { item: mediaDisplayName(m.title, m.file_ref) })"
              @click.stop="unlink(m.link_id)"
            >&#10005;</button>
          </td>
        </tr>
      </tbody>
    </table>

    <ConfirmModal
      :visible="del.visible.value"
      :title="$t('media.unlinkConfirmTitle')"
      :message="$t('media.confirmUnlink')"
      tone="danger"
      icon="⚠️"
      :confirm-label="$t('common.remove')"
      @cancel="del.cancel"
      @confirm="del.confirm"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useRouter } from 'vue-router';
import { mediaDisplayName, isImageMedia } from '../utils/mediaUtils';
import SectionEmpty from './ui/SectionEmpty.vue';
import ConfirmModal from './ConfirmModal.vue';
import MediaAddRow from './MediaAddRow.vue';
import { useDeleteConfirm } from '../composables/useDeleteConfirm';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

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
  readonly?: boolean;
}>();

const router = useRouter();
const media = ref<MediaItem[]>([]);
const showAddRow = ref(false);
const thumbnails = ref<Record<string, string>>({});

const excludeIds = computed(() => media.value.map(m => m.id));

defineExpose({ attach, reload: load });

async function load() {
  media.value = (await window.api.media.forEntity(props.entityType, props.entityId)) as MediaItem[];
  loadThumbnails();
}

async function loadThumbnails() {
  for (const m of media.value) {
    if (isImageMedia(m.format, m.file_ref) && !thumbnails.value[m.id]) {
      const url = await window.api.media.readAsDataUrl(m.id) as string | null;
      if (url) {
        thumbnails.value[m.id] = url;
      }
    }
  }
}

function openMedia(id: string) {
  router.push({ path: '/media', query: { open: id } });
}

async function attach() {
  showAddRow.value = true;
}

async function onCommitted({ mediaId }: { mediaId: string }) {
  await window.api.media.addLink({ media_id: mediaId, entity_type: props.entityType, entity_id: props.entityId });
  showAddRow.value = false;
  await load();
}

async function openFile(id: string) {
  await window.api.media.openFile(id);
}

const del = useDeleteConfirm<string>(async (linkId) => {
  await window.api.media.removeLink(linkId);
  await load();
});
function unlink(linkId: string) { del.ask(linkId); }

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
  font-size: var(--font-xs);
  color: var(--text-muted);
  line-height: 1;
}
.btn-order:hover:not(:disabled) { color: var(--text-primary); border-color: var(--surface-border); }
.btn-order:disabled { opacity: 0.3; cursor: default; }
.profile-badge {
  display: inline-block;
  font-size: var(--font-xs);
  background: var(--info-bg);
  color: var(--info-text);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
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
  border-radius: var(--radius-sm);
  display: block;
}
.row-thumb-placeholder {
  display: block;
  width: 36px;
  height: 36px;
  background: var(--surface-bg);
  border-radius: var(--radius-sm);
}
.row-thumb-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: var(--surface-bg);
  border-radius: var(--radius-sm);
  font-size: var(--font-xs);
  font-weight: 700;
  color: var(--text-muted);
}
</style>
