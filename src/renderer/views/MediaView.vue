<template>
  <div class="media-layout">
  <div class="media-main">
    <div class="header">
      <h2>{{ $t('media.title') }}</h2>
      <AppButton variant="primary" @click="attachFile"><span aria-hidden="true">+ </span>{{ $t('media.attach') }}</AppButton>
    </div>

    <p v-if="!loading && items.length > 0" class="count-label">
      {{ items.length }} / {{ total }} {{ $t('media.title').toLowerCase() }}<template v-if="missingCount > 0"> · {{ $t('media.missingCount', { count: missingCount }) }}</template>
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

    <div v-if="!loading && items.length > 0" class="view-toggle">
      <AppButton
        :variant="viewMode === 'gallery' ? 'primary' : 'secondary'"
        size="sm"
        @click="setViewMode('gallery')"
      >{{ $t('media.galleryView') }}</AppButton>
      <AppButton
        :variant="viewMode === 'table' ? 'primary' : 'secondary'"
        size="sm"
        @click="setViewMode('table')"
      >{{ $t('media.tableView') }}</AppButton>
    </div>

    <AppLoadingState v-if="loading && items.length === 0" :rows="5" />
    <AppEmptyState v-else-if="!loading && items.length === 0" icon="📷" :title="$t('media.noMedia')" />
    <AppEmptyState v-else-if="filteredItems.length === 0" icon="📷" :title="$t('media.noMedia')" />

    <!-- Gallery grid -->
    <div v-else-if="viewMode === 'gallery'" class="gallery-grid">
      <div
        v-for="(item, idx) in filteredItems"
        :key="item.id"
        class="gallery-card"
        :class="{ 'missing-card': item.is_missing, 'selected-card': selectedMediaId === item.id }"
        @click="selectMedia(item.id)"
        @dblclick="openLightbox(idx)"
        tabindex="0"
        @keydown.enter="openLightbox(idx)"
      >
        <div class="card-thumbnail">
          <img
            v-if="thumbnails[item.id]"
            :src="thumbnails[item.id]"
            :alt="mediaDisplayName(item.title, item.file_ref, '')"
            class="card-image"
          />
          <div v-else-if="isImageFormat(item.format)" class="card-image-loading"></div>
          <div v-else class="card-file-icon">
            <span class="card-file-ext">{{ (item.format || '?').toUpperCase() }}</span>
          </div>
          <span v-if="item.is_missing" class="missing-badge">{{ $t('media.isMissing') }}</span>
        </div>
        <div class="card-info">
          <span class="card-title">{{ mediaDisplayName(item.title, item.file_ref) }}</span>
          <span v-if="item.linkCount > 0" class="card-badge">{{ item.linkCount }} {{ $t('media.lightbox.linkedEntities').toLowerCase() }}</span>
        </div>
        <AppButton
          class="card-delete"
          variant="ghost"
          size="sm"
          @click.stop="deleteItem(item.id)"
          :title="$t('media.delete')"
        >&#10005;</AppButton>
      </div>
    </div>

    <!-- Table view -->
    <table v-else-if="viewMode === 'table' && filteredItems.length > 0" class="data-table media-table">
      <colgroup>
        <col style="width: 48px">
        <col>
        <col style="width: 60px">
        <col>
        <col style="width: 60px">
        <col style="width: 40px">
      </colgroup>
      <thead>
        <tr>
          <th></th>
          <th>{{ $t('media.colTitle') }}</th>
          <th>{{ $t('media.colFormat') }}</th>
          <th>{{ $t('media.colNotes') }}</th>
          <th>{{ $t('media.colLinks') }}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(item, idx) in filteredItems" :key="item.id" :class="{ 'selected-row': selectedMediaId === item.id }" @click="selectMedia(item.id)">
          <td class="thumb-cell">
            <img
              v-if="thumbnails[item.id]"
              :src="thumbnails[item.id]"
              class="table-thumb"
              @click="openLightbox(idx)"
            />
            <span v-else class="table-thumb-placeholder">{{ (item.format || '?').toUpperCase() }}</span>
          </td>
          <td>
            <input
              type="text"
              :value="item.title"
              class="inline-edit"
              @blur="e => { const v = (e.target as HTMLInputElement).value; if (v !== item.title) { item.title = v; saveField(item.id, 'title', v); } }"
              @keydown.enter="($event.target as HTMLInputElement).blur()"
            />
          </td>
          <td class="format-cell">
            <span v-if="item.format" class="format-badge">{{ item.format }}</span>
          </td>
          <td>
            <input
              type="text"
              :value="item.notes"
              class="inline-edit"
              :placeholder="$t('media.notesPlaceholder')"
              @blur="e => { const v = (e.target as HTMLInputElement).value; if (v !== item.notes) { item.notes = v; saveField(item.id, 'notes', v); } }"
              @keydown.enter="($event.target as HTMLInputElement).blur()"
            />
          </td>
          <td class="links-cell">{{ item.linkCount }}</td>
          <td>
            <AppButton variant="ghost" size="sm" @click="deleteItem(item.id)" :title="$t('media.delete')">&#10005;</AppButton>
          </td>
        </tr>
      </tbody>
    </table>

    <div ref="sentinel" class="scroll-sentinel"></div>

    <MediaLightbox
      :media-items="filteredItems"
      :current-index="lightboxIndex"
      :visible="lightboxVisible"
      @close="lightboxVisible = false"
      @update:current-index="lightboxIndex = $event"
      @link-changed="reload"
    />
  </div>
  <MediaPanel
    v-if="selectedMediaId"
    :media-id="selectedMediaId"
    class="media-panel-container"
    @link-changed="reload"
  />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import MediaLightbox from '../components/MediaLightbox.vue';
import MediaPanel from '../components/MediaPanel.vue';
import AppButton from '../components/ui/AppButton.vue';
import AppEmptyState from '../components/ui/AppEmptyState.vue';
import AppLoadingState from '../components/ui/AppLoadingState.vue';
import { mediaDisplayName } from '../utils/mediaUtils';
import { useToast } from '../composables/useToast';
const toast = useToast();

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const IMAGE_FORMATS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'tiff', 'tif']);
const PAGE_SIZE = 100;

const { t } = useI18n();

type ViewMode = 'gallery' | 'table';
const viewMode = ref<ViewMode>(
  (localStorage.getItem('media-view-mode') as ViewMode) || 'gallery'
);

function setViewMode(mode: ViewMode) {
  viewMode.value = mode;
  localStorage.setItem('media-view-mode', mode);
}

async function saveField(itemId: string, field: 'title' | 'notes', value: string) {
  try {
    await window.api.media.update(itemId, { [field]: value });
  } catch (err) {
    console.error('[MediaView] saveField failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}

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
const total = ref(0);
const offset = ref(0);
const loading = ref(true);
const searchQuery = ref('');
const thumbnails = ref<Record<string, string>>({});
const lightboxVisible = ref(false);
const lightboxIndex = ref(0);
const selectedMediaId = ref<string | null>(null);
const sentinel = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

const missingCount = computed(() => items.value.filter(i => i.is_missing).length);

const filteredItems = computed(() => {
  if (!searchQuery.value.trim()) return items.value;
  const q = searchQuery.value.toLowerCase();
  return items.value.filter(i =>
    mediaDisplayName(i.title, i.file_ref, '').toLowerCase().includes(q) ||
    (i.format || '').toLowerCase().includes(q)
  );
});

function isImageFormat(format: string | null): boolean {
  return format ? IMAGE_FORMATS.has(format.toLowerCase()) : false;
}

function mapPageItems(raw: Array<{ id: string; title: string; file_ref: string | null; format: string | null; notes: string; is_printable: boolean; is_missing: number; created_at: string; link_count: number }>): MediaItem[] {
  return raw.map(r => ({ ...r, linkCount: r.link_count }));
}

async function load() {
  loading.value = true;
  try {
    const result = await window.api.media.listPage(PAGE_SIZE, 0) as { items: Array<{ id: string; title: string; file_ref: string | null; format: string | null; notes: string; is_printable: boolean; is_missing: number; created_at: string; link_count: number }>; total: number };
    items.value = mapPageItems(result.items);
    total.value = result.total;
    offset.value = PAGE_SIZE;
    loadThumbnails(items.value);
  } catch (err) {
    console.error('[MediaView] load failed:', err);
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  if (loading.value) return;
  loading.value = true;
  try {
    const result = await window.api.media.listPage(PAGE_SIZE, offset.value) as { items: Array<{ id: string; title: string; file_ref: string | null; format: string | null; notes: string; is_printable: boolean; is_missing: number; created_at: string; link_count: number }>; total: number };
    const newItems = mapPageItems(result.items);
    items.value = [...items.value, ...newItems];
    total.value = result.total;
    offset.value += PAGE_SIZE;
    loadThumbnails(newItems);
  } catch (err) {
    console.error('[MediaView] loadMore failed:', err);
  } finally {
    loading.value = false;
  }
}

async function reload() {
  // Full reload preserving scroll — used after link changes
  loading.value = true;
  try {
    const result = await window.api.media.listPage(PAGE_SIZE, 0) as { items: Array<{ id: string; title: string; file_ref: string | null; format: string | null; notes: string; is_printable: boolean; is_missing: number; created_at: string; link_count: number }>; total: number };
    items.value = mapPageItems(result.items);
    total.value = result.total;
    offset.value = PAGE_SIZE;
    loadThumbnails(items.value);
  } catch (err) {
    console.error('[MediaView] reload failed:', err);
  } finally {
    loading.value = false;
  }
}

async function loadThumbnails(mediaItems: MediaItem[]) {
  for (const item of mediaItems) {
    if (isImageFormat(item.format) && !item.is_missing && !thumbnails.value[item.id]) {
      const url = await window.api.media.readAsDataUrl(item.id) as string | null;
      if (url) {
        thumbnails.value[item.id] = url;
      }
    }
  }
}

function selectMedia(id: string) {
  selectedMediaId.value = selectedMediaId.value === id ? null : id;
}

function openLightbox(idx: number) {
  lightboxIndex.value = idx;
  lightboxVisible.value = true;
}

async function attachFile() {
  const result = await window.api.media.attach();
  if (!(result as { canceled: boolean }).canceled) {
    await reload();
  }
}

async function deleteItem(id: string) {
  if (!confirm(t('media.confirmDelete'))) return;
  await window.api.media.delete(id);
  delete thumbnails.value[id];
  items.value = items.value.filter(i => i.id !== id);
  total.value = Math.max(0, total.value - 1);
}

watch(sentinel, (el) => {
  if (observer) { observer.disconnect(); observer = null; }
  if (!el) return;
  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && items.value.length < total.value && !loading.value) {
        loadMore();
      }
    },
    { rootMargin: '2000px 0px' }
  );
  observer.observe(el);
});

onMounted(load);
onUnmounted(() => { if (observer) observer.disconnect(); });
</script>

<style scoped>
.media-layout {
  display: flex;
  gap: var(--space-lg);
  height: 100%;
}
.media-main {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
}
.media-panel-container {
  width: 300px;
  flex-shrink: 0;
  border-left: 2px solid var(--accent);
  overflow-y: auto;
}

.gallery-filter {
  margin-bottom: 12px;
}
.gallery-search {
  width: 100%;
  max-width: 300px;
  padding: 6px 10px;
  font-size: var(--font-sm);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-md);
  outline: none;
  background: var(--surface);
  color: var(--text-primary);
}
.gallery-search:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent);
}

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}

.gallery-card {
  position: relative;
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  cursor: pointer;
  transition: box-shadow 0.15s, border-color 0.15s;
}
.gallery-card:hover, .gallery-card:focus {
  border-color: var(--accent);
  box-shadow: var(--shadow-md);
  outline: none;
}
.gallery-card.selected-card {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 30%, transparent);
}
.selected-row {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}
.gallery-card.missing-card {
  opacity: 0.6;
}

.card-thumbnail {
  position: relative;
  width: 100%;
  height: 140px;
  background: var(--surface-bg);
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
  border: 2px solid var(--surface-border);
  border-top-color: var(--text-muted);
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
  background: var(--surface-bg);
  border-radius: var(--radius-md);
  border: 1px solid var(--surface-border);
}
.card-file-ext {
  font-size: var(--font-sm);
  font-weight: 700;
  color: var(--text-muted);
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
  color: var(--text-primary);
}
.card-badge {
  font-size: var(--font-xs);
  color: var(--text-muted);
}

.card-delete {
  position: absolute;
  top: 6px;
  right: 6px;
  opacity: 0;
  transition: opacity 0.15s;
}
.gallery-card:hover .card-delete {
  opacity: 1;
}

.missing-badge {
  position: absolute;
  bottom: 6px;
  left: 6px;
  background: var(--error-bg);
  color: var(--error-text);
  font-size: var(--font-xs);
  font-weight: 600;
  border-radius: var(--radius-sm);
  padding: 1px 5px;
}

.view-toggle {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
}

.media-table .thumb-cell {
  padding: 4px;
}
.table-thumb {
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.table-thumb-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: var(--surface-bg);
  border-radius: var(--radius-sm);
  font-size: var(--font-xs);
  font-weight: 600;
  color: var(--text-muted);
}
.inline-edit {
  width: 100%;
  border: 1px solid transparent;
  background: transparent;
  padding: 4px 6px;
  font-size: var(--font-sm);
  border-radius: var(--radius-sm);
  outline: none;
  color: var(--text-primary);
}
.inline-edit:focus {
  border-color: var(--accent);
  background: var(--surface);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent);
}
.format-badge {
  font-size: var(--font-xs);
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
}
.format-cell, .links-cell {
  text-align: center;
}
</style>
