<template>
  <div>
    <div class="header">
      <h2>{{ $t('media.title') }}</h2>
      <button class="btn-add" @click="attachFile"><span aria-hidden="true">+ </span>{{ $t('media.attach') }}</button>
    </div>

    <p v-if="!loading && items.length > 0" class="count-label">
      {{ items.length }} {{ $t('media.title').toLowerCase() }}<template v-if="missingCount > 0"> · {{ $t('media.missingCount', { count: missingCount }) }}</template>
    </p>

    <!-- Search filter -->
    <div v-if="!loading && items.length > 0" class="gallery-filter">
      <input
        v-model="searchQuery"
        type="text"
        :placeholder="$t('media.filter.search')"
        class="gallery-search"
      />
    </div>

    <div v-if="loading" class="loading">{{ $t('common.loading') }}</div>
    <div v-else-if="items.length === 0" class="empty-state">{{ $t('media.noMedia') }}</div>
    <div v-else-if="filteredItems.length === 0" class="empty-state">{{ $t('media.noMedia') }}</div>

    <!-- Gallery grid -->
    <div v-else class="gallery-grid">
      <div
        v-for="(item, idx) in filteredItems"
        :key="item.id"
        class="gallery-card"
        :class="{ 'missing-card': item.is_missing }"
        @click="openLightbox(idx)"
        tabindex="0"
        @keydown.enter="openLightbox(idx)"
      >
        <div class="card-thumbnail">
          <img
            v-if="thumbnails[item.id]"
            :src="thumbnails[item.id]"
            :alt="item.title || ''"
            class="card-image"
          />
          <div v-else-if="isImageFormat(item.format)" class="card-image-loading"></div>
          <div v-else class="card-file-icon">
            <span class="card-file-ext">{{ (item.format || '?').toUpperCase() }}</span>
          </div>
          <span v-if="item.is_missing" class="missing-badge">{{ $t('media.isMissing') }}</span>
        </div>
        <div class="card-info">
          <span class="card-title">{{ item.title || '—' }}</span>
          <span v-if="item.linkCount > 0" class="card-badge">{{ item.linkCount }} {{ $t('media.lightbox.linkedEntities').toLowerCase() }}</span>
        </div>
        <button
          class="card-delete btn-sm btn-delete"
          @click.stop="deleteItem(item.id)"
          :title="$t('media.delete')"
        >&#10005;</button>
      </div>
    </div>

    <MediaLightbox
      :media-items="filteredItems"
      :current-index="lightboxIndex"
      :visible="lightboxVisible"
      @close="lightboxVisible = false"
      @update:current-index="lightboxIndex = $event"
      @link-changed="load"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import MediaLightbox from '../components/MediaLightbox.vue';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const IMAGE_FORMATS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'tiff', 'tif']);

const { t } = useI18n();

interface MediaItem {
  id: string;
  title: string;
  file_ref: string | null;
  format: string | null;
  notes: string;
  is_printable: boolean;
  is_missing: number;
  created_at: string;
  linkCount: number;
}

const items = ref<MediaItem[]>([]);
const loading = ref(true);
const searchQuery = ref('');
const thumbnails = ref<Record<string, string>>({});
const lightboxVisible = ref(false);
const lightboxIndex = ref(0);

const missingCount = computed(() => items.value.filter(i => i.is_missing).length);

const filteredItems = computed(() => {
  if (!searchQuery.value.trim()) return items.value;
  const q = searchQuery.value.toLowerCase();
  return items.value.filter(i =>
    (i.title || '').toLowerCase().includes(q) ||
    (i.format || '').toLowerCase().includes(q)
  );
});

function isImageFormat(format: string | null): boolean {
  return format ? IMAGE_FORMATS.has(format.toLowerCase()) : false;
}

async function load() {
  loading.value = true;
  const rawItems = (await window.api.media.list()) as Omit<MediaItem, 'linkCount'>[];

  // Load link counts for each item
  const withCounts: MediaItem[] = [];
  for (const item of rawItems) {
    const links = (await window.api.media.linksForMedia(item.id)) as unknown[];
    withCounts.push({ ...item, linkCount: links.length });
  }
  items.value = withCounts;
  loading.value = false;

  // Load thumbnails for image items
  loadThumbnails();
}

async function loadThumbnails() {
  for (const item of items.value) {
    if (isImageFormat(item.format) && !item.is_missing && !thumbnails.value[item.id]) {
      const url = await window.api.media.readAsDataUrl(item.id) as string | null;
      if (url) {
        thumbnails.value[item.id] = url;
      }
    }
  }
}

function openLightbox(idx: number) {
  lightboxIndex.value = idx;
  lightboxVisible.value = true;
}

async function attachFile() {
  const result = await window.api.media.attach();
  if (!(result as { canceled: boolean }).canceled) {
    await load();
  }
}

async function deleteItem(id: string) {
  if (!confirm(t('media.confirmDelete'))) return;
  await window.api.media.delete(id);
  delete thumbnails.value[id];
  await load();
}

onMounted(load);
</script>

<style scoped>
.gallery-filter {
  margin-bottom: 12px;
}
.gallery-search {
  width: 100%;
  max-width: 300px;
  padding: 6px 10px;
  font-size: var(--font-sm);
  border: 1px solid #ddd;
  border-radius: 6px;
  outline: none;
}
.gallery-search:focus {
  border-color: #4a9eff;
  box-shadow: 0 0 0 2px rgba(74, 158, 255, 0.15);
}

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}

.gallery-card {
  position: relative;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: box-shadow 0.15s, border-color 0.15s;
}
.gallery-card:hover, .gallery-card:focus {
  border-color: #4a9eff;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  outline: none;
}
.gallery-card.missing-card {
  opacity: 0.6;
}

.card-thumbnail {
  position: relative;
  width: 100%;
  height: 140px;
  background: #f5f5f5;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.card-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.card-image-loading {
  width: 32px;
  height: 32px;
  border: 2px solid #ddd;
  border-top-color: #888;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.card-file-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 80px;
  background: #e8e8e8;
  border-radius: 6px;
  border: 1px solid #d0d0d0;
}
.card-file-ext {
  font-size: var(--font-sm);
  font-weight: 700;
  color: #888;
}

.card-info {
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.card-title {
  font-size: var(--font-sm);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.card-badge {
  font-size: var(--font-xs);
  color: #888;
}

.card-delete {
  position: absolute;
  top: 6px;
  right: 6px;
  opacity: 0;
  transition: opacity 0.15s;
  background: rgba(255,255,255,0.9);
  border-radius: 4px;
  padding: 2px 6px;
}
.gallery-card:hover .card-delete {
  opacity: 1;
}

.missing-badge {
  position: absolute;
  bottom: 6px;
  left: 6px;
  background: #e53e3e;
  color: white;
  font-size: var(--font-xs);
  font-weight: 600;
  border-radius: 4px;
  padding: 1px 5px;
}

/* Dark mode support */
:root[data-theme="dark"] .gallery-card,
:root[data-theme="high-contrast"] .gallery-card {
  background: #2a2a2a;
  border-color: #444;
}
:root[data-theme="dark"] .card-thumbnail,
:root[data-theme="high-contrast"] .card-thumbnail {
  background: #1e1e1e;
}
:root[data-theme="dark"] .card-file-icon,
:root[data-theme="high-contrast"] .card-file-icon {
  background: #333;
  border-color: #555;
}
:root[data-theme="dark"] .gallery-search,
:root[data-theme="high-contrast"] .gallery-search {
  background: #2a2a2a;
  border-color: #444;
  color: #e0e0e0;
}
:root[data-theme="dark"] .card-delete,
:root[data-theme="high-contrast"] .card-delete {
  background: rgba(40,40,40,0.9);
}
</style>
