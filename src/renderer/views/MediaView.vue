<template>
  <div class="media-layout" ref="mediaBodyRef">
  <!-- Permanent left list column -->
  <template v-if="listOpen && !viewerMode">
    <div class="media-list-column list-column" :style="{ width: listWidth + 'px' }">
      <h3 class="media-list-title">{{ $t('media.listView') }}</h3>
      <div class="media-list-body">
        <div v-if="!loading && items.length > 0" class="list-filter">
          <input
            v-model="searchQuery"
            type="text"
            :placeholder="$t('media.filter.search')"
            class="list-filter-input"
          />
        </div>
        <AppLoadingState v-if="loading && items.length === 0" :rows="5" />
        <AppEmptyState v-else-if="!loading && items.length === 0" icon="📷" :title="$t('empty.media')" />
        <AppEmptyState v-else-if="items.length === 0" icon="📷" :title="$t('empty.media') + ' ' + $t('empty.withFilter')" />
        <div v-else class="media-list-scroll" ref="listScrollRef">
          <table class="data-table media-list-table">
            <thead>
              <tr>
                <th class="thumb-col" aria-hidden="true"></th>
                <th class="sortable-th" @click="toggleSort('title')">
                  {{ $t('persons.name') }}
                  <span v-if="sortBy === 'title'" class="sort-arrow">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
                </th>
                <th class="sortable-th format-col" @click="toggleSort('format')">
                  {{ $t('media.format') }}
                  <span v-if="sortBy === 'format'" class="sort-arrow">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in items"
                :key="item.id"
                :data-media-id="item.id"
                class="clickable-row"
                :class="{ 'selected-row': selectedMediaId === item.id }"
                @click="selectMedia(item.id)"
              >
                <td class="media-list-thumb-cell thumb-col">
                  <img v-if="thumbnails[item.id]" :src="thumbnails[item.id]" class="media-list-thumb" />
                  <span v-else class="media-list-thumb-placeholder">{{ (item.format || '?').toUpperCase() }}</span>
                </td>
                <td class="media-list-title-cell">{{ mediaDisplayName(item.title, item.file_ref) }}</td>
                <td class="format-col info-cell">{{ (item.format || '').toUpperCase() }}</td>
              </tr>
            </tbody>
          </table>
          <div ref="listSentinel" class="scroll-sentinel"></div>
        </div>
        <p v-if="items.length > 0" class="media-list-footer count-label">
          <template v-if="isMediaPreviewTruncated">
            {{ $t('htmlSite.preview.mediaLimited', { limit: previewMediaLimit, total: previewMediaTotalLinked }) }}
          </template>
          <template v-else>
            {{ $t('media.showingOf', { shown: items.length, total }) }}
          </template>
        </p>
      </div>
      <button class="list-collapse-btn" :aria-label="$t('common.close')" :title="$t('common.close')" @click="closeList">◀</button>
    </div>
    <div class="list-drag-handle" @mousedown="(e: MouseEvent) => startListResize(e, mediaBodyRef!)"></div>
  </template>
  <button v-else-if="!viewerMode" class="list-open-btn" :aria-label="$t('common.open')" :title="$t('common.open')" @click="openList">▶</button>

  <div class="media-main" :class="{ 'viewer-active': viewerMode }">
    <div class="header">
      <div class="header-left">
        <h2>
          {{ $t('media.title') }}<template v-if="personFilterId && personName"><span class="filter-suffix"> — {{ $t('media.filter.person', { name: personName }) }}</span> <button class="filter-clear" @click="router.push({ path: '/media' })" :title="$t('common.clearFilter')">×</button></template>
        </h2>
      </div>
      <div class="header-right">
        <button v-if="viewerMode" class="viewer-close-btn" :title="$t('common.close')" :aria-label="$t('common.close')" @click="closeViewer">✕</button>
        <AppButton v-else-if="!isStaticMode" variant="soft" @click="attachFile">+ {{ $t('media.attach') }}</AppButton>
      </div>
    </div>

    <div v-if="viewerMode" class="viewer-content">
      <MediaViewer
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
    </div>
    <template v-else>

    <div class="media-list-content">
    <p v-if="!loading && items.length > 0" class="count-label">
      <template v-if="isMediaPreviewTruncated">
        {{ $t('htmlSite.preview.mediaLimited', { limit: previewMediaLimit, total: previewMediaTotalLinked }) }}
      </template>
      <template v-else>
        {{ $t('media.showingOf', { shown: items.length, total }) }}<template v-if="missingCount > 0"> · {{ $t('media.missingCount', { count: missingCount }) }}</template>
      </template>
    </p>

    <AppLoadingState v-if="loading && items.length === 0" :rows="5" />
    <AppEmptyState v-else-if="!loading && items.length === 0" icon="📷" :title="$t('empty.media')" :description="$t('empty.mediaDesc')" :action-label="$t('empty.attachMedia')" @action="attachFile" />
    <AppEmptyState v-else-if="items.length === 0" icon="📷" :title="$t('empty.media') + ' ' + $t('empty.withFilter')" />

    <!-- Gallery grid -->
    <div v-else class="gallery-grid">
      <div
        v-for="(item, idx) in items"
        :key="item.id"
        :data-media-id="item.id"
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
          <div v-else-if="isImageMedia(item.format, item.file_ref)" class="card-image-loading"></div>
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
          :aria-label="$t('a11y.deleteItem', { item: mediaDisplayName(item.title, item.file_ref) })"
        >&#10005;</AppButton>
      </div>
    </div>

    <div ref="sentinel" class="scroll-sentinel"></div>
    </div>
    </template>

    <!-- Reopen panel button when panel is closed -->
    <button v-if="!viewerMode && !panelOpen && selectedMediaId" class="panel-open-btn" :aria-label="$t('panel.open') ?? 'Open'" @click="openPanel">◀</button>
  </div>
  <template v-if="selectedMediaId && panelOpen">
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
        :readonly="isStaticMode"
        @link-changed="reload"
        @close="closePanel"
        @start-draw-mode="onStartDrawMode"
        @stop-draw-mode="drawMode = false"
        @highlight-region="(id: string | null) => highlightedRegionId = id"
        @region-deleted="() => viewerRef?.reloadRegions()"
        @media-updated="onMediaUpdated"
        @open-viewer="onOpenViewerFromPanel"
      />
    </div>
  </template>

  <ConfirmModal
    :visible="del.visible.value"
    :title="$t('media.removeConfirmTitle')"
    :message="$t('media.confirmDelete')"
    tone="danger"
    icon="⚠️"
    :confirm-label="$t('common.delete')"
    @cancel="del.cancel"
    @confirm="del.confirm"
  />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import MediaViewer from '../components/MediaViewer.vue';
import MediaPanel from '../components/MediaPanel.vue';
import AppButton from '../components/ui/AppButton.vue';
import AppEmptyState from '../components/ui/AppEmptyState.vue';
import AppLoadingState from '../components/ui/AppLoadingState.vue';
import ConfirmModal from '../components/ConfirmModal.vue';
import { mediaDisplayName, isImageMedia } from '../utils/mediaUtils';
import { usePanelResize } from '../composables/usePanelResize';
import { useDeleteConfirm } from '../composables/useDeleteConfirm';
import { useSelectedPersonStore } from '../stores/selectedPerson';
import { useProfilePicStore } from '../stores/profilePic';
import { usePagedList } from '../composables/usePagedList';
const selectedStore = useSelectedPersonStore();
const profilePicStore = useProfilePicStore();

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const isStaticMode = import.meta.env.VITE_STATIC_MODE === 'true';

const listOpen = ref(localStorage.getItem('media-list-open') !== 'false');
function openList() {
  listOpen.value = true;
  localStorage.setItem('media-list-open', 'true');
}
function closeList() {
  listOpen.value = false;
  localStorage.setItem('media-list-open', 'false');
}
const panelOpen = ref(localStorage.getItem('media-panel-open') !== 'false');
function openPanel() {
  panelOpen.value = true;
  localStorage.setItem('media-panel-open', 'true');
}
function closePanel() {
  panelOpen.value = false;
  localStorage.setItem('media-panel-open', 'false');
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
const { panelWidth: listWidth, startResize: startListResize } = usePanelResize({
  storageKey: 'media-list-width',
  side: 'left',
  defaultWidth: 280,
  minWidth: 200,
  maxWidthRatio: 0.4,
});

const thumbnails = ref<Record<string, string>>({});
const viewerMode = ref(false);
const viewerIndex = ref(0);
const deepLinkItems = ref<MediaItem[] | null>(null);
const viewerItems = computed<MediaItem[]>(() => deepLinkItems.value ?? items.value);
const drawMode = ref(false);
const highlightedRegionId = ref<string | null>(null);
const viewerRef = ref<InstanceType<typeof MediaViewer> | null>(null);
const panelRef = ref<InstanceType<typeof MediaPanel> | null>(null);
const selectedMediaId = ref<string | null>(null);
const sentinel = ref<HTMLElement | null>(null);
const listSentinel = ref<HTMLElement | null>(null);
const listScrollRef = ref<HTMLElement | null>(null);
let pendingAutoSelect = true;

const personFilterId = computed(() => {
  const v = route.query.person;
  return typeof v === 'string' && v ? v : null;
});
const personName = ref('');

const missingCount = computed(() => items.value.filter(i => i.is_missing).length);

function mapPageItems(raw: Array<{ id: string; title: string; file_ref: string | null; format: string | null; notes: string; is_printable: boolean; is_missing: number; created_at: string; link_count: number }>): MediaItem[] {
  return raw.map(r => ({ ...r, linkCount: r.link_count }));
}

type MediaSortBy = 'title' | 'format';
const {
  items,
  total,
  loading,
  searchQuery,
  sortBy,
  sortDir,
  reload,
  toggleSort,
  attachSentinel,
} = usePagedList<MediaItem, MediaSortBy>({
  defaultSortBy: 'title',
  storageKey: 'media',
  fetchPage: async (limit, offset, sortBy, sortDir, query) => {
    // Person-scoped view: show only the media linked to the URL-specified
    // person. We bypass the paged channel and return everything in one
    // page; the filter+sort are applied client-side over that small set.
    if (personFilterId.value) {
      if (offset > 0) return { items: [], total: 0 };
      const raw = await window.api.media.forEntity('person', personFilterId.value) as Array<{ id: string; title: string; file_ref: string | null; format: string | null; notes: string; is_printable: boolean; created_at: string }>;
      let rows: MediaItem[] = raw.map(r => ({ ...r, notes: r.notes ?? '', is_missing: 0, linkCount: 0 }));
      const q = (query ?? '').trim().toLowerCase();
      if (q) {
        rows = rows.filter(i =>
          mediaDisplayName(i.title, i.file_ref, '').toLowerCase().includes(q) ||
          (i.format || '').toLowerCase().includes(q));
      }
      const dir = sortDir === 'asc' ? 1 : -1;
      rows.sort((a, b) => {
        const av = sortBy === 'title'
          ? mediaDisplayName(a.title, a.file_ref, '').toLowerCase()
          : (a.format ?? '').toLowerCase();
        const bv = sortBy === 'title'
          ? mediaDisplayName(b.title, b.file_ref, '').toLowerCase()
          : (b.format ?? '').toLowerCase();
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
        return 0;
      });
      return { items: rows, total: rows.length };
    }
    const result = await window.api.media.listPage(limit, offset, sortBy, sortDir, query) as { items: Array<{ id: string; title: string; file_ref: string | null; format: string | null; notes: string; is_printable: boolean; is_missing: number; created_at: string; link_count: number }>; total: number };
    return { items: mapPageItems(result.items), total: result.total };
  },
  onLoaded: (loaded) => {
    void loadThumbnails(loaded);
    void maybeAutoSelect(loaded);
  },
  onAppended: (appended) => {
    void loadThumbnails(appended);
  },
});
watch(sentinel, (el) => attachSentinel(el));
watch([listSentinel, listScrollRef], ([el, root]) => attachSentinel(el, root));

async function maybeAutoSelect(loaded: MediaItem[]) {
  if (!pendingAutoSelect) return;
  if (loaded.length === 0) return;
  pendingAutoSelect = false;
  if (selectedMediaId.value) return;
  if (personFilterId.value) {
    selectedMediaId.value = loaded[0].id;
    return;
  }
  let picked: string | null = null;
  const anchorId = selectedStore.personId
    ?? (await window.api.db.getSetting('default_person_id') as string | null);
  if (anchorId) {
    const personMedia = await window.api.media.forEntity('person', anchorId) as Array<{ id: string }>;
    if (personMedia.length > 0) picked = personMedia[0].id;
  }
  selectedMediaId.value = picked ?? loaded[0].id;
}

async function loadThumbnails(mediaItems: MediaItem[]) {
  for (const item of mediaItems) {
    if (isImageMedia(item.format, item.file_ref) && !item.is_missing && !thumbnails.value[item.id]) {
      const url = await window.api.media.readAsDataUrl(item.id) as string | null;
      if (url) {
        thumbnails.value[item.id] = url;
      }
    }
  }
}

function selectMedia(id: string) {
  selectedMediaId.value = id;
  if (!panelOpen.value) openPanel();
}

function openViewer(idx: number) {
  deepLinkItems.value = null;
  viewerIndex.value = idx;
  const item = items.value[idx];
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
  if (isImageMedia(normalized.format, normalized.file_ref) && !thumbnails.value[normalized.id]) {
    const url = await window.api.media.readAsDataUrl(normalized.id) as string | null;
    if (url) thumbnails.value[normalized.id] = url;
  }
  deepLinkItems.value = [normalized];
  viewerIndex.value = 0;
  selectedMediaId.value = normalized.id;
  viewerMode.value = true;
}

async function onStartDrawMode() {
  drawMode.value = true;
  if (!viewerMode.value && selectedMediaId.value) {
    await openViewerById(selectedMediaId.value);
  }
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

function onOpenViewerFromPanel() {
  if (selectedMediaId.value) void openViewerById(selectedMediaId.value);
}

function onMediaUpdated(mediaId: string, fields: { title?: string; notes?: string }) {
  const patch = (item: MediaItem) => {
    if (fields.title !== undefined) item.title = fields.title;
    if (fields.notes !== undefined) item.notes = fields.notes;
  };
  const found = items.value.find(i => i.id === mediaId);
  if (found) patch(found);
  const deep = deepLinkItems.value?.find(i => i.id === mediaId);
  if (deep) patch(deep);
}

async function attachFile() {
  const result = await window.api.media.attach();
  if (!(result as { canceled: boolean }).canceled) {
    await reload();
  }
}

const del = useDeleteConfirm<string>(async (id) => {
  await window.api.media.delete(id);
  delete thumbnails.value[id];
  if (selectedMediaId.value === id) selectedMediaId.value = null;
  await reload();
});
function deleteItem(id: string) { del.ask(id); }

// In the website-export preview the main process inlines at most N
// thumbnails (PREVIEW_THUMB_COUNT in src/main/ipc/website-export.ts) and
// surfaces the cap via two settings. When set we replace the count line
// with a notice explaining that the gallery is truncated.
const previewMediaLimit = ref<number | null>(null);
const previewMediaTotalLinked = ref<number | null>(null);
const isMediaPreviewTruncated = computed(() =>
  previewMediaLimit.value !== null
  && previewMediaTotalLinked.value !== null
  && previewMediaTotalLinked.value > previewMediaLimit.value);

onMounted(async () => {
  if (personFilterId.value) {
    const names = await window.api.persons.getNames(personFilterId.value) as Array<{ given_name: string; surname: string }>;
    const n = names[0];
    personName.value = n ? [n.given_name, n.surname].filter(Boolean).join(' ') : '';
  }
  await reload();
  if (isStaticMode) {
    try {
      const [limitRaw, totalRaw] = await Promise.all([
        window.api.db.getSetting('preview_media_limit') as Promise<string | null>,
        window.api.db.getSetting('preview_media_total_linked') as Promise<string | null>,
      ]);
      const limit = limitRaw ? Number(limitRaw) : NaN;
      const totalLinked = totalRaw ? Number(totalRaw) : NaN;
      if (Number.isFinite(limit)) previewMediaLimit.value = limit;
      if (Number.isFinite(totalLinked)) previewMediaTotalLinked.value = totalLinked;
    } catch {
      // Settings missing in non-preview mode — leave the notice off
    }
  }
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
watch(personFilterId, async (id) => {
  selectedMediaId.value = null;
  viewerMode.value = false;
  deepLinkItems.value = null;
  pendingAutoSelect = true;
  if (id) {
    const names = await window.api.persons.getNames(id) as Array<{ given_name: string; surname: string }>;
    const n = names[0];
    personName.value = n ? [n.given_name, n.surname].filter(Boolean).join(' ') : '';
  } else {
    personName.value = '';
  }
  await reload();
});
// Scroll both the gallery and the left list to the selected media so it
// stays visible when the selection changes (e.g. the user clicks a row in
// the list and we want the corresponding gallery card to come into view).
watch(selectedMediaId, async (id) => {
  if (!id || viewerMode.value) return;
  await nextTick();
  if (!mediaBodyRef.value) return;
  const targets = mediaBodyRef.value.querySelectorAll<HTMLElement>('[data-media-id="' + CSS.escape(id) + '"]');
  for (const el of targets) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
});

</script>

<style scoped>
.media-layout {
  display: flex;
  height: 100%;
  gap: var(--space-xs);
  position: relative;
}

/* Layout, surface, and `padding-right: 28px` for the collapse tab come
   from `.list-column` in shared.css. */
.media-list-title {
  margin: 0;
  padding: var(--space-md) var(--space-md) var(--space-sm);
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--text-primary);
  border-bottom: 1px solid var(--surface-border-subtle);
  flex-shrink: 0;
}
.media-list-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: var(--space-md);
}
.media-list-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  position: relative;
}
.media-list-scroll .data-table thead th {
  position: sticky;
  top: 0;
  background: var(--surface);
  z-index: 1;
  box-shadow: inset 0 -1px 0 var(--surface-border-subtle);
}
.sortable-th {
  cursor: pointer;
  user-select: none;
}
.sortable-th:hover {
  background: var(--surface-hover);
}
.sort-arrow {
  margin-left: 4px;
  font-size: var(--font-xs);
  color: var(--accent);
}
.media-list-footer {
  flex-shrink: 0;
  margin: 0;
  padding: var(--space-sm) 0 0 0;
  border-top: 1px solid var(--surface-border-subtle);
  text-align: center;
}
.thumb-col { width: 36px; }
.format-col {
  width: 4em;
  white-space: nowrap;
  text-align: right;
}
.info-cell {
  color: var(--text-muted);
  font-size: var(--font-sm);
}
.media-list-table {
  width: 100%;
}
.media-list-thumb-cell {
  width: 32px;
  padding: 4px;
}
.media-list-thumb {
  width: 28px;
  height: 28px;
  object-fit: cover;
  border-radius: var(--radius-sm);
  display: block;
}
.media-list-thumb-placeholder {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: var(--surface-border-subtle);
  color: var(--text-muted);
  font-size: 9px;
  font-weight: 600;
  border-radius: var(--radius-sm);
}
.media-list-title-cell {
  font-size: var(--font-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.list-collapse-btn {
  position: absolute;
  top: 50%;
  right: 0;
  transform: translateY(-50%);
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-right: none;
  border-radius: var(--radius-sm) 0 0 var(--radius-sm);
  padding: 6px 5px;
  cursor: pointer;
  color: var(--text-muted);
  font-size: var(--font-xs);
  z-index: 10;
}
.list-collapse-btn:hover { color: var(--text-secondary); background: var(--surface-hover); }
.list-open-btn {
  position: absolute;
  top: 50%;
  left: 0;
  transform: translateY(-50%);
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-left: none;
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  padding: 6px 5px;
  cursor: pointer;
  color: var(--text-muted);
  font-size: var(--font-xs);
  z-index: 10;
}
.list-open-btn:hover { color: var(--text-secondary); background: var(--surface-hover); }
.list-drag-handle {
  width: 6px;
  background: var(--surface-border-subtle);
  cursor: col-resize;
  flex-shrink: 0;
  transition: background 0.1s;
}
.list-drag-handle:hover { background: var(--surface-border); }
.panel-open-btn {
  position: absolute;
  top: 50%;
  right: 0;
  transform: translateY(-50%);
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-right: none;
  border-radius: var(--radius-sm) 0 0 var(--radius-sm);
  padding: 6px 5px;
  cursor: pointer;
  color: var(--text-muted);
  font-size: var(--font-xs);
  z-index: 10;
}
.panel-open-btn:hover { color: var(--text-secondary); background: var(--surface-hover); }
.media-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: var(--space-lg);
  position: relative;
}
.media-list-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.media-main.viewer-active {
  padding-bottom: 0;
}
.viewer-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
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

.filter-suffix {
  font-weight: 400;
  color: var(--text-muted);
  font-size: 0.85em;
}
.filter-clear {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  font-size: var(--font-sm);
  line-height: 1;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  vertical-align: middle;
}
.filter-clear:hover {
  color: var(--text-primary);
  background: var(--surface-hover);
}

.list-filter {
  flex-shrink: 0;
  padding: 0 0 var(--space-sm);
}
.list-filter-input {
  width: 100%;
  padding: 6px 10px;
  font-size: var(--font-sm);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-md);
  outline: none;
  background: var(--surface);
  color: var(--text-primary);
  font-family: inherit;
}
.list-filter-input:focus {
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
  aspect-ratio: 1 / 1.35;
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
  object-position: 50% 25%;
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
  font-size: var(--font-base);
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
.viewer-close-btn {
  background: none;
  border: none;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: var(--font-base);
  color: var(--text-muted);
  line-height: 1;
}
.viewer-close-btn:hover { background: var(--surface-hover); color: var(--text-primary); }

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
