<template>
  <div
    v-if="printableItems.length > 0"
    class="media-chronological"
    :class="'per-page-' + perPage"
  >
    <div
      v-for="item in printableItems"
      :key="item.id"
      :id="'media-' + item.id"
      class="media-item"
    >
      <div class="media-image">
        <img
          v-if="imageUrls[item.id]"
          :src="imageUrls[item.id]!"
          :alt="item.title || ''"
          loading="lazy"
        />
        <div v-if="imageUrls[item.id] && faceTags[item.id]?.length" class="face-tag-overlay">
          <FaceTagBox
            v-for="tag in faceTags[item.id]"
            :key="tag.personId"
            :rect="tag"
            :identified="true"
            :label="tagLabel(tag)"
            visibility="hover"
            :themed="false"
            :href="isLinked(tag.personId) ? '#person-' + tag.personId : null"
            @click="onFaceClick($event, tag.personId)"
          />
        </div>
      </div>
      <MediaCaption
        :face-tags="faceTags[item.id] || []"
        :notes="item.notes"
        :inferred-date-i-s-o="item.inferredDateISO"
        :context-line="item.contextLine"
        :relations="relations"
        :linked-person-ids="linkedPersonIds"
        :show-captions="showCaptions"
        :show-notes="showNotes"
        :href-builder="(id: string) => '#person-' + id"
        @person-click="onCaptionPersonClick"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import MediaCaption from '../../MediaCaption.vue';
import FaceTagBox from '../../FaceTagBox.vue';

export interface MediaDisplayItem {
  id: string;
  title: string | null;
  notes: string | null;
  fileRef: string | null;
  format: string | null;
  inferredDateISO: string | null;
  contextLine?: string | null;
}

interface Region {
  id: string;
  media_id: string;
  person_id: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string | null;
}

interface RawName {
  given_name: string | null;
  surname: string | null;
  preferred_name: string | null;
  sort_order: number;
}

interface FaceTag {
  personId: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const props = withDefaults(defineProps<{
  items: MediaDisplayItem[];
  showCaptions?: boolean;
  showNotes?: boolean;
  perPage?: 1 | 2 | 4;
  includeDocuments?: boolean;
  /** personId → relation label (e.g. 'Father', 'Pappa'). Prefixes the name in captions/overlays. */
  relations?: Record<string, string> | null;
  /** Set of personIds that have anchors in the current report. Only these get <a> links. null = all linked. */
  linkedPersonIds?: string[] | null;
}>(), {
  showCaptions: true,
  showNotes: true,
  perPage: 1,
  includeDocuments: false,
  relations: null,
  linkedPersonIds: null,
});

function isLinked(personId: string): boolean {
  if (props.linkedPersonIds === null) return true;
  return props.linkedPersonIds.includes(personId);
}

function tagLabel(tag: FaceTag): string {
  const relation = props.relations?.[tag.personId];
  return relation ? `${relation} ${tag.name}` : tag.name;
}

declare const window: Window & {
  api: {
    media: { readAsDataUrl: (id: string) => Promise<string | null> };
    mediaRegions: { getForMedia: (mediaId: string) => Promise<Region[]> };
    persons: { getNames: (personId: string) => Promise<RawName[]> };
  };
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

// Face tags: regions sorted left-to-right with resolved person names.
const faceTags = reactive<Record<string, FaceTag[]>>({});

async function loadFaceTags(): Promise<void> {
  const ids = printableItems.value.map(i => i.id);
  for (const cached of Object.keys(faceTags)) {
    if (!ids.includes(cached)) delete faceTags[cached];
  }
  await Promise.all(ids.map(async (mediaId) => {
    if (faceTags[mediaId] !== undefined) return;
    try {
      const regions = await window.api.mediaRegions.getForMedia(mediaId);
      const tagged = regions.filter(r => r.person_id).sort((a, b) => a.x - b.x);
      if (!tagged.length) { faceTags[mediaId] = []; return; }

      const tags = await Promise.all(tagged.map(async r => {
        try {
          const names = await window.api.persons.getNames(r.person_id!);
          const primary = [...names].sort((a, b) => a.sort_order - b.sort_order)[0];
          const name = [primary?.preferred_name || primary?.given_name, primary?.surname]
            .filter(Boolean).join(' ') || r.label || '';
          return name ? { personId: r.person_id!, name, x: r.x, y: r.y, width: r.width, height: r.height } : null;
        } catch {
          return null;
        }
      }));

      faceTags[mediaId] = tags.filter((t): t is FaceTag => t !== null);
    } catch {
      faceTags[mediaId] = [];
    }
  }));
}

watch(printableItems, async () => {
  await Promise.all([loadUrls(), loadFaceTags()]);
}, { immediate: true });

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function onFaceClick(e: MouseEvent, personId: string) {
  if (!isLinked(personId)) return;
  e.preventDefault();
  scrollToId('person-' + personId);
}

function onCaptionPersonClick(personId: string, event: MouseEvent) {
  event.preventDefault();
  scrollToId('person-' + personId);
}
</script>

<style scoped>
.media-chronological { display: grid; gap: var(--space-lg); }
.media-chronological.per-page-1 { grid-template-columns: 1fr; }
.media-chronological.per-page-2 { grid-template-columns: repeat(2, 1fr); }
.media-chronological.per-page-4 { grid-template-columns: repeat(2, 1fr); gap: var(--space-md); }
.media-item { break-inside: avoid; }
.media-image { position: relative; width: fit-content; max-width: 100%; line-height: 0; }
.media-image img { max-width: 100%; height: auto; border-radius: var(--radius-sm); display: block; }

.face-tag-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: var(--radius-sm);
}

@media print {
  .face-tag-overlay { display: none; }
}
</style>
