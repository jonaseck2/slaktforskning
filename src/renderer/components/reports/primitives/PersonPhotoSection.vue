<template>
  <MediaChronological
    v-if="photoItems.length > 0"
    :items="photoItems"
    :show-captions="showCaptions"
    :show-notes="showNotes"
    :linkify-notes="linkifyNotes"
    :per-page="2"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useMediaChronological, type MediaEntityRef } from '../../../composables/useMediaChronological';
import MediaChronological, { type MediaDisplayItem } from './MediaChronological.vue';

const props = withDefaults(defineProps<{
  personId: string;
  showCaptions?: boolean;
  showNotes?: boolean;
  linkifyNotes?: boolean;
}>(), {
  showCaptions: true,
  showNotes: true,
  linkifyNotes: false,
});

const entityRef = computed<MediaEntityRef>(() => ({
  entityType: 'person',
  entityId: props.personId,
}));

const { items: mediaItems } = useMediaChronological(entityRef);

function isImageItem(fileRef: string | null, format: string | null): boolean {
  if (!fileRef) return false;
  const fmt = (format || '').toLowerCase();
  return /\.(jpe?g|png|webp|gif|svg)$/i.test(fileRef) || /image/.test(fmt);
}

const photoItems = computed<MediaDisplayItem[]>(() =>
  mediaItems.value
    .filter(m => isImageItem(m.fileRef, m.format))
    .map(m => ({
      id: m.id,
      title: m.title,
      notes: m.notes,
      fileRef: m.fileRef,
      format: m.format,
      inferredDateISO: m.inferredDateISO,
      contextLine: null,
    })),
);
</script>
