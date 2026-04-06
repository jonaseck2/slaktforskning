<template>
  <div>
    <div v-if="media.length === 0" class="empty-hint">{{ $t('media.noMedia') }}</div>
    <table v-else class="data-table">
      <thead>
        <tr>
          <th>{{ $t('media.title_label') }}</th>
          <th class="th-shrink">{{ $t('media.format') }}</th>
          <th class="actions-cell">{{ $t('common.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="m in media" :key="m.link_id">
          <td>{{ m.title || '—' }}</td>
          <td class="td-shrink">{{ m.format || '—' }}</td>
          <td class="actions-cell">
            <button v-if="m.file_ref" class="btn-sm" @click="openFile(m.id)">{{ $t('media.open') }}</button>
            <button class="btn-sm btn-delete" @click="unlink(m.link_id)">✕</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

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
}

const props = defineProps<{ personId: string }>();

const media = ref<MediaItem[]>([]);

defineExpose({ attach });

async function load() {
  media.value = (await window.api.media.forEntity('person', props.personId)) as MediaItem[];
}

async function attach() {
  const result = await window.api.media.attach({ entityType: 'person', entityId: props.personId }) as { canceled: boolean };
  if (!result.canceled) await load();
}

async function openFile(id: string) {
  await window.api.media.openFile(id);
}

async function unlink(linkId: string) {
  await window.api.media.removeLink(linkId);
  await load();
}

watch(() => props.personId, load, { immediate: true });
</script>

<style scoped>
.th-shrink, .td-shrink { width: 1%; white-space: nowrap; }
.actions-cell { width: 1px; text-align: right; white-space: nowrap; vertical-align: middle; }
</style>
