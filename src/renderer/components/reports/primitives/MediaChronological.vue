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
          <template v-for="tag in faceTags[item.id]" :key="tag.personId">
            <a
              v-if="isLinked(tag.personId)"
              :href="'#person-' + tag.personId"
              class="face-box"
              @click.prevent="scrollToId('person-' + tag.personId)"
              :style="{ left: (tag.x * 100) + '%', top: (tag.y * 100) + '%', width: (tag.width * 100) + '%', height: (tag.height * 100) + '%' }"
            >
              <span class="face-hover-label">{{ tagLabel(tag) }}</span>
            </a>
            <div
              v-else
              class="face-box face-box--no-link"
              :style="{ left: (tag.x * 100) + '%', top: (tag.y * 100) + '%', width: (tag.width * 100) + '%', height: (tag.height * 100) + '%' }"
            >
              <span class="face-hover-label">{{ tagLabel(tag) }}</span>
            </div>
          </template>
        </div>
      </div>
      <div v-if="showCaptions || showNotes" class="media-caption">
        <template v-if="showCaptions">
          <div v-if="item.contextLine" class="caption-context">{{ item.contextLine }}</div>
          <div v-if="faceTags[item.id]?.length" class="caption-faces">
            <span class="faces-prefix">{{ t('reports.common.fromLeft') }}</span>
            <template v-for="(tag, i) in faceTags[item.id]" :key="tag.personId">
              <a v-if="isLinked(tag.personId)" :href="'#person-' + tag.personId" class="face-link" @click.prevent="scrollToId('person-' + tag.personId)">{{ tagLabel(tag) }}</a>
              <span v-else class="face-name">{{ tagLabel(tag) }}</span>
              <span v-if="i < faceTags[item.id].length - 1">, </span>
            </template>
          </div>
          <div v-if="item.inferredDateISO" class="caption-date">{{ formatDate(item.inferredDateISO) }}</div>
        </template>
        <div v-if="showNotes && item.notes" class="caption-notes">{{ item.notes }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';

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

const { t } = useI18n();

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

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  overflow: hidden;
}
.face-box {
  position: absolute;
  border: 1.5px solid transparent;
  border-radius: 2px;
  pointer-events: auto;
  cursor: pointer;
  text-decoration: none;
  transition: border-color 0.15s;
}
.face-box:hover {
  border-color: rgba(74, 158, 255, 0.8);
}
.face-hover-label {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 10px 4px 3px;
  text-align: center;
  font-size: 10px;
  font-style: normal;
  color: white;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.65));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0;
  transition: opacity 0.15s;
}
.face-box:hover .face-hover-label { opacity: 1; }
.face-box--no-link { cursor: default; }
.face-box--no-link:hover { border-color: rgba(74, 158, 255, 0.4); }

@media print {
  .face-tag-overlay { display: none; }
}
.media-caption { margin-top: var(--space-sm); font-size: var(--font-sm); font-style: italic; }
.caption-title { font-weight: 600; }
.caption-context { color: var(--text-secondary); font-style: italic; }
.caption-date { color: var(--text-muted); }

.caption-faces {
  margin-top: 2px;
  color: var(--text-secondary);
}
.faces-prefix {
  margin-right: 3px;
  font-style: italic;
}
.face-name {
  color: inherit;
}
.face-link {
  color: inherit;
  text-decoration: none;
  border-bottom: 1px solid var(--surface-border-subtle);
  transition: color 0.15s, border-color 0.15s;
}
.face-link:hover {
  color: var(--accent);
  border-color: var(--accent);
}

@media print {
  .face-link { border-bottom: none; }
}
</style>
