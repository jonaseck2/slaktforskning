<template>
  <div>
    <MediaAddRow
      v-if="showAddRow"
      :exclude-ids="excludeIds"
      @committed="onCommitted"
      @cancelled="showAddRow = false"
    />
    <SectionEmpty
      v-if="media.length === 0 && !showAddRow"
      purpose-key="onboarding.empty.personMedia.purpose"
      :action-label-key="props.readonly ? undefined : 'onboarding.empty.personMedia.cta'"
      @action="attach"
    />
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
          <td
            v-if="!props.readonly"
            :ref="(el) => { if (idx === 0) dragHandleEl = el as HTMLElement | null; }"
            class="td-shrink order-cell"
          >
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
          <td class="title-cell" :title="mediaDisplayName(m.title, m.file_ref)">{{ mediaDisplayName(m.title, m.file_ref) }}</td>
          <td class="td-shrink">{{ m.format || '—' }}</td>
          <td v-if="!props.readonly" class="actions-cell">
            <button
              class="btn-sm btn-delete"
              :aria-label="$t('a11y.unlinkItem', { item: mediaDisplayName(m.title, m.file_ref) })"
              :title="$t('common.unlinkTooltip')"
              @click.stop="unlink(m.link_id)"
            >
              <IconUnlink :size="14" />
            </button>
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

    <Coachmark
      v-if="!props.readonly && media.length >= 2"
      seen-key="coach.media.reorder"
      :anchor-el="dragHandleEl"
      tip-key="onboarding.coach.mediaReorder.tip"
      dismiss-key="onboarding.coach.mediaReorder.dismiss"
      placement="right"
      :auto-dismiss-on="() => reorderedOnce"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { mediaDisplayName, isImageMedia } from '../utils/mediaUtils';
import { useProfilePicStore } from '../stores/profilePic';
import SectionEmpty from './ui/SectionEmpty.vue';
import IconUnlink from './ui/IconUnlink.vue';
import Coachmark from './ui/Coachmark.vue';
import ConfirmModal from './ConfirmModal.vue';
import MediaAddRow from './MediaAddRow.vue';
import { useDeleteConfirm } from '../composables/useDeleteConfirm';
import { useEntityData } from '../composables/useEntityData';

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

const props = defineProps<{ personId: string; readonly?: boolean }>();
const emit = defineEmits<{ profileChanged: [] }>();

const router = useRouter();
const thumbnails = ref<Record<string, string>>({});
const showAddRow = ref(false);
const profilePicStore = useProfilePicStore();
const dragHandleEl = ref<HTMLElement | null>(null);
const reorderedOnce = ref(false);

const idRef = computed(() => props.personId ?? null);
const { data, reload } = useEntityData<MediaItem[]>(idRef, async (id) => {
  return (await window.api.media.forEntity('person', id)) as MediaItem[];
});
const media = computed(() => data.value ?? []);
const excludeIds = computed(() => media.value.map(m => m.id));

async function loadThumbnails() {
  const targets = media.value.filter((m): m is typeof m & { file_ref: string } =>
    isImageMedia(m.format, m.file_ref) && !thumbnails.value[m.id] && !!m.file_ref);
  await Promise.all(targets.map(async m => {
    const url = await window.api.media.thumbnailDataUrl(m.file_ref) as string | null;
    if (url) thumbnails.value[m.id] = url;
  }));
}

watch(media, loadThumbnails);

defineExpose({ attach, reload, count: computed(() => media.value.length) });

function openMedia(id: string) {
  router.push({ path: '/media', query: { open: id, person: props.personId } });
}

async function attach() {
  showAddRow.value = true;
}

async function onCommitted({ mediaId }: { mediaId: string }) {
  await window.api.media.addLink({
    media_id: mediaId,
    entity_type: 'person',
    entity_id: props.personId,
  });
  showAddRow.value = false;
  profilePicStore.invalidatePerson(props.personId);
  await reload();
  emit('profileChanged');
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
  reorderedOnce.value = true;
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
.th-shrink, .td-shrink { width: 1%; max-width: none; white-space: nowrap; }
.title-cell {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 0;
}
.actions-cell { width: 1px; max-width: none; text-align: right; white-space: nowrap; vertical-align: middle; }
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
