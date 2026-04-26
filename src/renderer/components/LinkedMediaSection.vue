<template>
  <div>
    <div v-if="showPicker" class="add-row">
      <MediaPicker v-model="pickedId" :placeholder="$t('media.title_label')" />
      <AppButton variant="primary" size="sm" :disabled="!pickedId" @click="onAdd">{{ $t('common.add') }}</AppButton>
      <AppButton variant="ghost" size="sm" @click="cancelAdd">{{ $t('common.cancel') }}</AppButton>
    </div>
    <SectionEmpty v-if="rows.length === 0 && !showPicker" :message="$t('empty.media')" />
    <table v-else-if="rows.length > 0" class="data-table">
      <thead>
        <tr>
          <th>{{ $t('media.title_label') }}</th>
          <th class="th-shrink">{{ $t('media.format') }}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.linkId" class="clickable-row" @click="openMedia(r.mediaId)">
          <td>{{ mediaDisplayName(r.title, r.file_ref) }}</td>
          <td class="td-shrink">{{ r.format || '—' }}</td>
          <td class="actions-cell">
            <AppButton
              variant="ghost"
              size="sm"
              :aria-label="$t('a11y.deleteItem', { item: mediaDisplayName(r.title, r.file_ref) })"
              @click.stop="emit('remove', r.linkId)"
            >✕</AppButton>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import MediaPicker from './MediaPicker.vue';
import AppButton from './ui/AppButton.vue';
import SectionEmpty from './ui/SectionEmpty.vue';
import { mediaDisplayName } from '../utils/mediaUtils';

interface LinkInput { id: string; entity_id: string }
interface Row {
  linkId: string;
  mediaId: string;
  title: string;
  file_ref: string | null;
  format: string | null;
}

const props = defineProps<{
  links: LinkInput[];
  showPicker: boolean;
}>();

const emit = defineEmits<{
  add: [mediaId: string];
  remove: [linkId: string];
  cancelPicker: [];
}>();

const router = useRouter();
const rows = ref<Row[]>([]);
const pickedId = ref<string | null>(null);

watch(() => props.links, async (links) => {
  const out: Row[] = [];
  for (const l of links) {
    const m = await window.api.media.get(l.entity_id) as Row | null;
    if (m) out.push({
      linkId: l.id, mediaId: l.entity_id,
      title: m.title, file_ref: m.file_ref, format: m.format,
    });
  }
  rows.value = out;
}, { immediate: true, deep: true });

watch(() => props.showPicker, (v) => { if (!v) pickedId.value = null; });

function openMedia(id: string) {
  router.push({ path: '/media', query: { open: id } });
}

function onAdd() {
  if (!pickedId.value) return;
  const id = pickedId.value;
  pickedId.value = null;
  emit('add', id);
}

function cancelAdd() {
  pickedId.value = null;
  emit('cancelPicker');
}
</script>

<style scoped>
.add-row {
  display: flex;
  gap: var(--space-xs);
  align-items: center;
  padding: var(--space-xs) 0;
}
.add-row > :first-child { flex: 1; }
.th-shrink { width: 1%; white-space: nowrap; }
.td-shrink { width: 1%; white-space: nowrap; color: var(--text-muted); }
.actions-cell { width: 1px; text-align: right; white-space: nowrap; }
</style>
