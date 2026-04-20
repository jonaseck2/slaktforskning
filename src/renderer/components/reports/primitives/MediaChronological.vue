<template>
  <div
    v-if="printableItems.length > 0"
    class="media-chronological"
    :class="'per-page-' + perPage"
  >
    <div
      v-for="item in printableItems"
      :key="item.id"
      class="media-item"
    >
      <div class="media-image">
        <img
          v-if="imageUrls[item.id]"
          :src="imageUrls[item.id]!"
          :alt="item.title || ''"
          loading="lazy"
        />
      </div>
      <div v-if="showCaptions" class="media-caption">
        <div v-if="item.title" class="caption-title">{{ item.title }}</div>
        <div v-if="item.contextLine" class="caption-context">{{ item.contextLine }}</div>
        <div v-if="item.notes" class="caption-notes">{{ item.notes }}</div>
        <div v-if="item.inferredDateISO" class="caption-date">{{ formatDate(item.inferredDateISO) }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue';

export interface MediaDisplayItem {
  id: string;
  title: string | null;
  notes: string | null;
  fileRef: string | null;
  format: string | null;
  inferredDateISO: string | null;
  contextLine?: string | null;
}

const props = withDefaults(defineProps<{
  items: MediaDisplayItem[];
  showCaptions?: boolean;
  perPage?: 1 | 2 | 4;
  includeDocuments?: boolean;
}>(), {
  showCaptions: true,
  perPage: 1,
  includeDocuments: false,
});

declare const window: Window & {
  api: { media: { readAsDataUrl: (id: string) => Promise<string | null> } };
};

const printableItems = computed(() => {
  return props.items.filter(i => {
    if (!i.fileRef) return false;
    const fmt = (i.format || '').toLowerCase();
    const isImage = /\.(jpe?g|png|webp|gif|svg)$/i.test(i.fileRef) || /image/.test(fmt);
    if (isImage) return true;
    return props.includeDocuments;
  });
});

// Load images as data URLs via IPC. The renderer's file:// protocol is blocked from
// the http://localhost dev origin, so we go through window.api.media.readAsDataUrl —
// matching MediaPanel.vue and EntityMediaSection.vue.
const imageUrls = reactive<Record<string, string | null>>({});

async function loadUrls(): Promise<void> {
  const ids = printableItems.value.map(i => i.id);
  // Drop cached entries for items no longer visible
  for (const cached of Object.keys(imageUrls)) {
    if (!ids.includes(cached)) delete imageUrls[cached];
  }
  await Promise.all(
    ids.map(async id => {
      if (imageUrls[id] !== undefined) return;
      try {
        imageUrls[id] = (await window.api?.media?.readAsDataUrl(id)) ?? null;
      } catch {
        imageUrls[id] = null;
      }
    }),
  );
}

watch(printableItems, loadUrls, { immediate: true });

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}
</script>

<style scoped>
.media-chronological { display: grid; gap: var(--space-lg); }
.media-chronological.per-page-1 { grid-template-columns: 1fr; }
.media-chronological.per-page-2 { grid-template-columns: repeat(2, 1fr); }
.media-chronological.per-page-4 { grid-template-columns: repeat(2, 1fr); gap: var(--space-md); }
.media-item { break-inside: avoid; }
.media-image img { max-width: 100%; height: auto; border-radius: var(--radius-sm); }
.media-caption { margin-top: var(--space-sm); font-size: var(--font-sm); }
.caption-title { font-weight: 600; }
.caption-context { color: var(--text-secondary); font-style: italic; }
.caption-date { color: var(--text-muted); }
</style>
