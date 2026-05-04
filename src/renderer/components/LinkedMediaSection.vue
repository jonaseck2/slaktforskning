<template>
  <div>
    <MediaAddRow
      v-if="showPicker"
      :exclude-ids="excludeIds"
      @committed="onCommitted"
      @cancelled="emit('cancelPicker')"
    />
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
          <td class="title-cell" :title="mediaDisplayName(r.title, r.file_ref)">{{ mediaDisplayName(r.title, r.file_ref) }}</td>
          <td class="td-shrink">{{ r.format || '—' }}</td>
          <td class="actions-cell">
            <AppButton
              variant="ghost"
              size="sm"
              :aria-label="$t('a11y.unlinkItem', { item: mediaDisplayName(r.title, r.file_ref) })"
              :title="$t('common.unlinkTooltip')"
              @click.stop="emit('remove', r.linkId)"
            >
              <IconUnlink :size="14" />
            </AppButton>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useRouter } from 'vue-router';
import MediaAddRow from './MediaAddRow.vue';
import AppButton from './ui/AppButton.vue';
import IconUnlink from './ui/IconUnlink.vue';
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

const excludeIds = computed(() => rows.value.map(r => r.mediaId));

function openMedia(id: string) {
  router.push({ path: '/media', query: { open: id } });
}

function onCommitted({ mediaId }: { mediaId: string }) {
  emit('add', mediaId);
}
</script>

<style scoped>
.th-shrink { width: 1%; max-width: none; white-space: nowrap; }
.td-shrink { width: 1%; max-width: none; white-space: nowrap; color: var(--text-muted); }
.title-cell {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 0;
}
.actions-cell { width: 1px; max-width: none; text-align: right; white-space: nowrap; }
</style>
