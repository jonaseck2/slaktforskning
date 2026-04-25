<template>
  <div class="media-layout" ref="mediaBodyRef">
  <div class="media-main">
    <MediaViewer
      v-if="viewerMode"
      ref="viewerRef"
      :media-items="viewerItems"
      :initial-index="viewerIndex"
      :thumbnails="thumbnails"
      :draw-mode="drawMode"
      :highlighted-region-id="highlightedRegionId"
      @close="closeViewer"
      @update:current-index="onViewerIndexChange"
      @region-drawn="onRegionDrawn"
      @region-updated="onRegionUpdated"
      @region-clicked="(id: string) => highlightedRegionId = id"
      @region-hovered="(id: string | null) => highlightedRegionId = id"
    />
    <template v-else>
    <div class="header">
      <div class="header-left">
        <h2>{{ $t('media.title') }}</h2>
        <div v-if="personFilterId && personName" class="person-filter-badge">
          {{ $t('media.filter.person', { name: personName }) }}
          <button class="filter-clear" @click="router.push({ path: '/media' })" :title="$t('common.clearFilter')">×</button>
        </div>
      </div>
      <div class="header-right">
        <div v-if="!loading && items.length > 0" class="view-toggle">
          <AppButton :variant="viewMode === 'gallery' ? 'soft' : 'ghost'" size="sm" @click="setViewMode('gallery')">{{ $t('media.galleryView') }}</AppButton>
          <AppButton :variant="viewMode === 'table' ? 'soft' : 'ghost'" size="sm" @click="setViewMode('table')">{{ $t('media.listView') }}</AppButton>
        </div>
        <AppButton v-if="!isStaticMode" variant="soft" @click="attachFile">+ {{ $t('media.attach') }}</AppButton>
      </div>
    </div>

    <p v-if="!loading && items.length > 0" class="count-label">
      {{ $t('media.showingOf', { shown: items.length, total }) }}<template v-if="missingCount > 0"> · {{ $t('media.missingCount', { count: missingCount }) }}</template>
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

    <AppLoadingState v-if="loading && items.length === 0" :rows="5" />
    <AppEmptyState v-else-if="!loading && items.length === 0" icon="📷" :title="$t('empty.media')" :description="$t('empty.mediaDesc')" :action-label="$t('empty.attachMedia')" @action="attachFile" />
    <AppEmptyState v-else-if="filteredItems.length === 0" icon="📷" :title="$t('empty.media') + ' ' + $t('empty.withFilter')" />

    <!-- Gallery grid -->
    <div v-else-if="viewMode === 'gallery'" class="gallery-grid">
      <div
        v-for="(item, idx) in filteredItems"
        :key="item.id"
        class="gallery-card"
        :class="{ 'missing-card': item.is_missing, 'selected-card': selectedMediaId === item.id }"
        @click="selectMedia(item.id)"
        @dblclick="openViewer(idx)"
        tabindex="0"
        @keydown.enter="openViewer(idx)"
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
          <button
            class="card-expand"
            :title="$t('media.lightbox.open')"
            @click.stop="openViewer(idx)"
          >&#x26F6;</button>
        </div>
        <div class="card-info">
          <span class="card-title">{{ mediaDisplayName(item.title, item.file_ref) }}</span>
          <span v-if="item.linkCount > 0" class="card-badge">{{ item.linkCount }} {{ $t('media.lightbox.linkedEntities').toLowerCase() }}</span>
        </div>
        <AppButton
          v-if="!isStaticMode"
          class="card-delete"
          variant="ghost"
          size="sm"
          @click.stop="deleteItem(item.id)"
          :title="$t('common.delete')"
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
              @click.stop="openViewer(idx)"
            />
            <span v-else class="table-thumb-placeholder">{{ (item.format || '?').toUpperCase() }}</span>
          </td>
          <td>
            <span v-if="isStaticMode">{{ item.title }}</span>
            <input
              v-else
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
            <span v-if="isStaticMode">{{ item.notes }}</span>
            <input
              v-else
              type="text"
              :value="item.notes"
              class="inline-edit"
              :placeholder="$t('media.notesPlaceholder')"
              @blur="e => { const v = (e.target as HTMLInputElement).value; if (v !== item.notes) { item.notes = v; saveField(item.id, 'notes', v); } }"
              @keydown.enter="($event.target as HTMLInputElement).blur()"
            />
          </td>
          <td class="links-cell">{{ item.linkCount }}</td>
          <td v-if="!isStaticMode">
            <AppButton variant="ghost" size="sm" @click="deleteItem(item.id)" :title="$t('common.delete')">&#10005;</AppButton>
          </td>
        </tr>
      </tbody>
    </table>

    <div ref="sentinel" class="scroll-sentinel"></div>
    </template>
  </div>
  <template v-if="!isStaticMode && selectedMediaId">
    <div
      class="panel-drag-handle"
      @mousedown="(e: MouseEvent) => startResize(e, mediaBodyRef!)"
    ></div>
    <div class="media-panel-container" :style="{ width: panelWidth + 'px' }">
      <MediaPanel
        ref="panelRef"
        :media-id="selectedMediaId"
        :draw-mode="drawMode"
        :highlighted-region-id="highlightedRegionId"
        @link-changed="reload"
        @close="selectedMediaId = null"
        @start-draw-mode="drawMode = true"
        @stop-draw-mode="drawMode = false"
        @highlight-region="(id: string | null) => highlightedRegionId = id"
        @region-deleted="() => viewerRef?.reloadRegions()"
      />
    </div>
  </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import MediaViewer from '../components/MediaViewer.vue';
import MediaPanel from '../components/MediaPanel.vue';
import AppButton from '../components/ui/AppButton.vue';
import AppEmptyState from '../components/ui/AppEmptyState.vue';
import AppLoadingState from '../components/ui/AppLoadingState.vue';
import { mediaDisplayName } from '../utils/mediaUtils';
import { usePanelResize } from '../composables/usePanelResize';
import { useToast } from '../composables/useToast';
import { useFocusStore } from '../stores/focus';
import { useProfilePicStore } from '../stores/profilePic';
const toast = useToast();
const focusStore = useFocusStore();
const profilePicStore = useProfilePicStore();

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const IMAGE_FORMATS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'tiff', 'tif']);
const PAGE_SIZE = 100;

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const isStaticMode = import.meta.env.VITE_STATIC_MODE === 'true';

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

const mediaBodyRef = ref<HTMLElement | null>(null);
const { panelWidth, startResize } = usePanelResize({ storageKey: 'media-panel-width', maxWidthRatio: 0.5 });

const items = ref<MediaItem[]>([]);
const total = ref(0);
const offset = ref(0);
const loading = ref(true);
const searchQuery = ref('');
const thumbnails = ref<Record<string, string>>({});
const viewerMode = ref(false);
const viewerIndex = ref(0);
const deepLinkItems = ref<MediaItem[] | null>(null);
const viewerItems = computed<MediaItem[]>(() => deepLinkItems.value ?? filteredItems.value);
const drawMode = ref(false);
const highlightedRegionId = ref<string | null>(null);
const viewerRef = ref<InstanceType<typeof MediaViewer> | null>(null);
const panelRef = ref<InstanceType<typeof MediaPanel> | null>(null);
const selectedMediaId = ref<string | null>(null);
const sentinel = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

const personFilterId = computed(() => {
  const v = route.query.person;
  return typeof v === 'string' && v ? v : null;
});
const personName = ref('');

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
    if (personFilterId.value) {
      const [rawMedia, names] = await Promise.all([
        window.api.media.forEntity('person', personFilterId.value) as Promise<Array<{ id: string; title: string; file_ref: string | null; format: string | null; notes: string; is_printable: boolean; created_at: string }>>,
        window.api.persons.getNames(personFilterId.value) as Promise<Array<{ given_name: string; surname: string }>>,
      ]);
      const n = names[0];
      personName.value = n ? [n.given_name, n.surname].filter(Boolean).join(' ') : '';
      items.value = rawMedia.map(r => ({ ...r, notes: r.notes ?? '', is_missing: 0, linkCount: 0 }));
      total.value = items.value.length;
      offset.value = items.value.length;
      loadThumbnails(items.value);
      if (!selectedMediaId.value && items.value.length > 0) {
        selectedMediaId.value = items.value[0].id;
      }
    } else {
      personName.value = '';
      const result = await window.api.media.listPage(PAGE_SIZE, 0) as { items: Array<{ id: string; title: string; file_ref: string | null; format: string | null; notes: string; is_printable: boolean; is_missing: number; created_at: string; link_count: number }>; total: number };
      items.value = mapPageItems(result.items);
      total.value = result.total;
      offset.value = PAGE_SIZE;
      loadThumbnails(items.value);
      // Auto-select: focus person's first media, or first item
      if (!selectedMediaId.value && items.value.length > 0) {
        let picked: string | null = null;
        if (focusStore.personId) {
          const personMedia = await window.api.media.forEntity('person', focusStore.personId) as Array<{ id: string }>;
          if (personMedia.length > 0) picked = personMedia[0].id;
        }
        selectedMediaId.value = picked ?? items.value[0].id;
      }
    }
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
  selectedMediaId.value = id;
}

function openViewer(idx: number) {
  deepLinkItems.value = null;
  viewerIndex.value = idx;
  const item = filteredItems.value[idx];
  if (item) selectedMediaId.value = item.id;
  viewerMode.value = true;
}

function onViewerIndexChange(idx: number) {
  viewerIndex.value = idx;
  const item = viewerItems.value[idx];
  if (item) selectedMediaId.value = item.id;
}

function closeViewer() {
  viewerMode.value = false;
  drawMode.value = false;
  deepLinkItems.value = null;
  if (route.query.open) {
    const query: Record<string, string> = {};
    if (route.query.person) query.person = route.query.person as string;
    router.replace({ path: '/media', query });
  }
}

async function openViewerById(mediaId: string) {
  const idx = items.value.findIndex(i => i.id === mediaId);
  if (idx >= 0) {
    openViewer(idx);
    return;
  }
  const media = await window.api.media.get(mediaId) as MediaItem | null;
  if (!media) return;
  const normalized: MediaItem = {
    id: media.id,
    title: media.title,
    file_ref: media.file_ref,
    format: media.format,
    notes: media.notes ?? '',
    is_printable: (media as MediaItem).is_printable ?? false,
    is_missing: (media as MediaItem).is_missing ?? 0,
    created_at: (media as MediaItem).created_at ?? '',
    linkCount: (media as MediaItem).linkCount ?? 0,
  };
  if (isImageFormat(normalized.format) && !thumbnails.value[normalized.id]) {
    const url = await window.api.media.readAsDataUrl(normalized.id) as string | null;
    if (url) thumbnails.value[normalized.id] = url;
  }
  deepLinkItems.value = [normalized];
  viewerIndex.value = 0;
  selectedMediaId.value = normalized.id;
  viewerMode.value = true;
}

async function onRegionDrawn(rect: { x: number; y: number; width: number; height: number }) {
  if (!selectedMediaId.value) return;
  drawMode.value = false; // release pointer events immediately — don't block during async ops
  // Auto-assign the first linked person (by sort_order) who doesn't already have a face tag
  let personId: string | undefined;
  try {
    const [links, existingRegions] = await Promise.all([
      window.api.media.linksForMedia(selectedMediaId.value) as Promise<Array<{ entity_type: string; entity_id: string }>>,
      window.api.mediaRegions.getForMedia(selectedMediaId.value) as Promise<Array<{ person_id: string | null }>>,
    ]);
    const tagged = new Set(existingRegions.map(r => r.person_id).filter((id): id is string => !!id));
    const firstFree = links.find(l => l.entity_type === 'person' && !tagged.has(l.entity_id));
    if (firstFree) personId = firstFree.entity_id;
  } catch { /* ignore */ }
  await window.api.mediaRegions.create({
    media_id: selectedMediaId.value,
    x: rect.x, y: rect.y,
    width: rect.width, height: rect.height,
    ...(personId ? { person_id: personId } : {}),
  });
  if (personId) profilePicStore.invalidatePerson(personId);
  viewerRef.value?.reloadRegions();
  panelRef.value?.reload();
  panelRef.value?.expandFaceTags();
}

async function onRegionUpdated(id: string, rect: { x: number; y: number; width: number; height: number }) {
  await window.api.mediaRegions.updateGeometry(id, rect);
  if (selectedMediaId.value) {
    const regs = await window.api.mediaRegions.getForMedia(selectedMediaId.value) as Array<{ id: string; person_id: string | null }>;
    const r = regs.find(rr => rr.id === id);
    if (r?.person_id) {
      profilePicStore.invalidatePerson(r.person_id);
      void profilePicStore.ensureLoaded(r.person_id);
    }
  }
  viewerRef.value?.reloadRegions();
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

onMounted(async () => {
  await load();
  const openId = route.query.open;
  if (typeof openId === 'string' && openId) {
    await openViewerById(openId);
  }
});
watch(() => route.query.open, async (openId) => {
  if (typeof openId === 'string' && openId) {
    await openViewerById(openId);
  }
});
watch(personFilterId, async () => {
  items.value = [];
  total.value = 0;
  offset.value = 0;
  selectedMediaId.value = null;
  viewerMode.value = false;
  deepLinkItems.value = null;
  await load();
});
onUnmounted(() => { if (observer) observer.disconnect(); });
</script>

<style scoped>
.media-layout {
  display: flex;
  height: 100%;
  gap: var(--space-xs);
}
.media-main {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  background: var(--surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: var(--space-lg);
}
.panel-drag-handle {
  width: 6px;
  background: var(--surface-border-subtle);
  cursor: col-resize;
  flex-shrink: 0;
  position: relative;
  transition: background 0.1s;
}
.panel-drag-handle:hover { background: var(--surface-border); }
.media-panel-container {
  flex-shrink: 0;
  min-width: 200px;
  max-width: 1040px;
}

.person-filter-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: var(--space-sm);
  padding: 4px 10px;
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  border-radius: var(--radius-full);
  font-size: var(--font-sm);
  color: var(--accent);
}
.filter-clear {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--accent);
  font-size: 16px;
  line-height: 1;
  padding: 0 2px;
  opacity: 0.7;
}
.filter-clear:hover { opacity: 1; }

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

.card-expand {
  position: absolute;
  bottom: 6px;
  right: 6px;
  opacity: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--surface) 85%, transparent);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 14px;
  cursor: pointer;
  transition: opacity 0.15s, background 0.1s;
  backdrop-filter: blur(4px);
}
.card-expand:hover {
  background: var(--surface);
}
.gallery-card:hover .card-expand {
  opacity: 1;
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

.header-left { display: flex; align-items: center; gap: var(--space-sm); }
.header-right { display: flex; align-items: center; gap: 8px; }
.view-toggle { display: flex; gap: 2px; }

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
