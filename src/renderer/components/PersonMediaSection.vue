<template>
  <div>
    <SectionEmpty v-if="media.length === 0" :message="$t('empty.media')" />
    <table v-else class="data-table">
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
            <span v-else-if="isImage(m.format)" class="row-thumb-placeholder"></span>
            <span v-else class="row-thumb-icon">{{ (m.format || '?').toUpperCase() }}</span>
          </td>
          <td v-if="!props.readonly" class="td-shrink order-cell">
            <button
              class="star-btn"
              :class="{ 'is-profile': idx === 0 }"
              :title="idx === 0 ? $t('media.currentProfile') : $t('media.setAsProfile')"
              :aria-label="idx === 0 ? $t('media.currentProfile') : $t('media.setAsProfile')"
              :disabled="idx === 0"
              @click.stop="setAsProfile(idx)"
            >{{ idx === 0 ? '★' : '☆' }}</button>
            <button class="btn-order" :disabled="idx === 0" @click.stop="moveUp(idx)" :title="$t('media.moveUp')">&#9650;</button>
            <button class="btn-order" :disabled="idx === media.length - 1" @click.stop="moveDown(idx)" :title="$t('media.moveDown')">&#9660;</button>
          </td>
          <td>{{ mediaDisplayName(m.title, m.file_ref) }}</td>
          <td class="td-shrink">{{ m.format || '—' }}</td>
          <td v-if="!props.readonly" class="actions-cell">
            <button
              class="btn-sm btn-delete"
              :aria-label="$t('a11y.deleteItem', { item: mediaDisplayName(m.title, m.file_ref) })"
              @click.stop="unlink(m.link_id)"
            >✕</button>
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
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { mediaDisplayName } from '../utils/mediaUtils';
import { useProfilePicStore } from '../stores/profilePic';
import SectionEmpty from './ui/SectionEmpty.vue';
import ConfirmModal from './ConfirmModal.vue';
import { useDeleteConfirm } from '../composables/useDeleteConfirm';
import { useEntityData } from '../composables/useEntityData';

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

const props = defineProps<{ personId: string; readonly?: boolean }>();
const emit = defineEmits<{ profileChanged: [] }>();

const router = useRouter();
const thumbnails = ref<Record<string, string>>({});
const profilePicStore = useProfilePicStore();

function isImage(format: string | null): boolean {
  return format ? IMAGE_FORMATS.has(format.toLowerCase()) : false;
}

const idRef = computed(() => props.personId ?? null);
const { data, reload } = useEntityData<MediaItem[]>(idRef, async (id) => {
  return (await window.api.media.forEntity('person', id)) as MediaItem[];
});
const media = computed(() => data.value ?? []);

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

watch(media, loadThumbnails);

defineExpose({ attach, reload, count: computed(() => media.value.length) });

function openMedia(id: string) {
  router.push({ path: '/media', query: { open: id, person: props.personId } });
}

async function attach() {
  const result = await window.api.media.attach({ entityType: 'person', entityId: props.personId });
  if (!(result as { canceled: boolean }).canceled) {
    profilePicStore.invalidatePerson(props.personId);
    await reload();
    emit('profileChanged');
  }
}



const del = useDeleteConfirm<string>(async (linkId) => {
  await window.api.media.removeLink(linkId);
  profilePicStore.invalidatePerson(props.personId);
  await reload();
  emit('profileChanged');
});
function unlink(linkId: string) { del.ask(linkId); }

async function reorder(newOrder: MediaItem[]) {
  await window.api.media.reorder(newOrder.map(m => m.link_id));
  profilePicStore.invalidatePerson(props.personId);
  await reload();
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

function setAsProfile(idx: number) {
  if (idx === 0) return;
  const items = [...media.value];
  const [picked] = items.splice(idx, 1);
  items.unshift(picked);
  reorder(items);
}

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
.star-btn {
  background: none;
  border: 1px solid transparent;
  cursor: pointer;
  padding: 0 3px;
  font-size: var(--font-base);
  color: var(--text-muted);
  line-height: 1;
  vertical-align: middle;
}
.star-btn:hover:not(:disabled) {
  color: var(--accent);
  border-color: var(--surface-border);
}
.star-btn.is-profile {
  color: var(--accent);
  cursor: default;
}
.star-btn:disabled {
  cursor: default;
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
  background: var(--surface-bg);
  border-radius: 4px;
}
.row-thumb-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: var(--surface-bg);
  border-radius: 4px;
  font-size: var(--font-xs);
  font-weight: 700;
  color: var(--text-muted);
}
</style>
