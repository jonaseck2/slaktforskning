<template>
  <div
    ref="rootEl"
    class="media-viewer"
    tabindex="-1"
    @keydown="onKeydown"
  >
    <!-- Toolbar -->
    <div class="viewer-toolbar">
      <span class="viewer-filename" :title="displayName">{{ displayName }}</span>
      <span class="viewer-counter">{{ currentIndex + 1 }} / {{ mediaItems.length }}</span>
      <span class="toolbar-sep" />
      <div class="zoom-controls">
        <button class="zoom-btn" :title="$t('media.viewer.zoomOut')" @click="zoomState.zoomOut()">−</button>
        <span class="zoom-pct">{{ zoomState.zoomPercent.value }}</span>
        <button class="zoom-btn" :title="$t('media.viewer.zoomIn')" @click="zoomState.zoomIn()">+</button>
        <button class="zoom-btn" :title="$t('media.viewer.fit')" @click="zoomState.fitToContainer()">{{ $t('media.viewer.fit') }}</button>
      </div>
      <span class="toolbar-sep" />
      <button class="viewer-close" :title="$t('common.close')" @click="emit('close')">✕</button>
    </div>

    <!-- Canvas -->
    <div
      ref="canvasEl"
      class="viewer-canvas"
      @wheel.prevent="onCanvasWheel"
      @mousedown="onCanvasDragStart"
      @mousemove="onCanvasDragMove"
      @mouseup="onCanvasDragEnd"
      @mouseleave="onCanvasDragEnd"
    >
      <!-- Prev arrow -->
      <button
        v-if="mediaItems.length > 1"
        class="nav-arrow nav-prev"
        :disabled="currentIndex === 0"
        @click="goTo(currentIndex - 1)"
      >‹</button>

      <!-- Image wrapper -->
      <div
        v-if="imageUrl"
        class="image-wrapper"
        :style="imageWrapperStyle"
      >
        <img
          ref="imgEl"
          :src="imageUrl"
          draggable="false"
          @load="onImageLoad"
        />
        <FaceTagOverlay
          v-if="imgNaturalWidth > 0 && imgNaturalHeight > 0"
          :regions="enrichedRegions"
          :image-width="imgNaturalWidth"
          :image-height="imgNaturalHeight"
          :draw-mode="drawMode"
          :highlighted-id="highlightedRegionId"
          @region-drawn="rect => emit('regionDrawn', rect)"
          @region-updated="(id, rect) => emit('regionUpdated', id, rect)"
          @region-clicked="id => emit('regionClicked', id)"
          @region-hovered="id => emit('regionHovered', id)"
        />
      </div>

      <!-- Loading state -->
      <div v-else-if="loading" class="viewer-loading">
        {{ $t('common.loading') }}
      </div>

      <!-- Non-image fallback -->
      <div v-else class="viewer-fallback">
        <span class="fallback-icon">📄</span>
        <span>{{ displayName }}</span>
      </div>

      <!-- Next arrow -->
      <button
        v-if="mediaItems.length > 1"
        class="nav-arrow nav-next"
        :disabled="currentIndex === mediaItems.length - 1"
        @click="goTo(currentIndex + 1)"
      >›</button>
    </div>

    <!-- Filmstrip -->
    <div v-if="mediaItems.length > 1" class="viewer-filmstrip">
      <div
        v-for="(item, idx) in mediaItems"
        :key="item.id"
        :ref="el => { if (idx === currentIndex) activeThumbEl = el as HTMLElement | null; }"
        class="filmstrip-thumb"
        :class="{ active: idx === currentIndex }"
        @click="goTo(idx)"
      >
        <img v-if="thumbnails[item.id]" :src="thumbnails[item.id]" draggable="false" />
        <span v-else class="thumb-placeholder">📄</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useImageZoom } from '../composables/useImageZoom';
import { mediaDisplayName } from '../utils/mediaUtils';
import FaceTagOverlay from './FaceTagOverlay.vue';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const IMAGE_FORMATS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'tiff', 'tif']);

interface MediaItem {
  id: string;
  title: string;
  file_ref: string | null;
  format: string | null;
  notes: string;
}

interface EnrichedRegion {
  id: string;
  person_id: string | null;
  label: string | null;
  personName: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const props = defineProps<{
  mediaItems: MediaItem[];
  initialIndex: number;
  thumbnails: Record<string, string>;
  drawMode: boolean;
  highlightedRegionId: string | null;
}>();

const emit = defineEmits<{
  close: [];
  'update:currentIndex': [index: number];
  regionDrawn: [rect: { x: number; y: number; width: number; height: number }];
  regionUpdated: [id: string, rect: { x: number; y: number; width: number; height: number }];
  regionClicked: [id: string];
  regionHovered: [id: string | null];
}>();

const { t: $t } = useI18n();

const rootEl = ref<HTMLElement | null>(null);
const canvasEl = ref<HTMLElement | null>(null);
const imgEl = ref<HTMLImageElement | null>(null);
const activeThumbEl = ref<HTMLElement | null>(null);

const currentIndex = ref(props.initialIndex);
const imageUrl = ref<string | null>(null);
const loading = ref(false);
const imgNaturalWidth = ref(0);
const imgNaturalHeight = ref(0);
const enrichedRegions = ref<EnrichedRegion[]>([]);

const zoomState = useImageZoom();

// Drag-to-pan state
const dragging = ref(false);
const dragStartX = ref(0);
const dragStartY = ref(0);
const panStartX = ref(0);
const panStartY = ref(0);

const currentItem = computed(() => props.mediaItems[currentIndex.value] ?? null);

const displayName = computed(() => {
  const item = currentItem.value;
  if (!item) return '';
  return mediaDisplayName(item.title, item.file_ref);
});

const isImage = computed(() => {
  const item = currentItem.value;
  if (!item) return false;
  if (item.format && IMAGE_FORMATS.has(item.format.toLowerCase())) return true;
  if (item.file_ref) {
    const ext = item.file_ref.split('.').pop()?.toLowerCase() ?? '';
    return IMAGE_FORMATS.has(ext);
  }
  return false;
});

const imageWrapperStyle = computed(() => ({
  transform: `translate(${zoomState.panX.value}px, ${zoomState.panY.value}px) scale(${zoomState.zoom.value})`,
  transformOrigin: '0 0',
}));

function goTo(idx: number) {
  if (idx < 0 || idx >= props.mediaItems.length) return;
  currentIndex.value = idx;
  emit('update:currentIndex', idx);
}

async function loadMedia() {
  const item = currentItem.value;
  if (!item) return;

  imageUrl.value = null;
  enrichedRegions.value = [];
  imgNaturalWidth.value = 0;
  imgNaturalHeight.value = 0;
  zoomState.fitToContainer();

  if (!isImage.value) return;

  loading.value = true;
  try {
    const url = await window.api.media.readAsDataUrl(item.id) as string | null;
    imageUrl.value = url;
  } finally {
    loading.value = false;
  }

  await loadRegions();
}

async function loadRegions() {
  const item = currentItem.value;
  if (!item) return;

  const raw = await window.api.mediaRegions.getForMedia(item.id) as Array<{
    id: string; person_id: string | null; label: string | null;
    x: number; y: number; width: number; height: number;
  }>;

  const enriched: EnrichedRegion[] = [];
  for (const r of raw) {
    let personName = '';
    if (r.person_id) {
      const names = await window.api.persons.getNames(r.person_id) as Array<{
        given_name?: string; surname?: string;
      }>;
      if (names.length > 0) {
        const n = names[0];
        personName = [n.given_name, n.surname].filter(Boolean).join(' ');
      }
    }
    enriched.push({ ...r, personName });
  }
  enrichedRegions.value = enriched;
}

function onImageLoad() {
  const img = imgEl.value;
  if (!img) return;
  imgNaturalWidth.value = img.naturalWidth;
  imgNaturalHeight.value = img.naturalHeight;
}

function onCanvasWheel(e: WheelEvent) {
  if (!canvasEl.value) return;
  zoomState.onWheel(e, canvasEl.value.getBoundingClientRect());
}

function onCanvasDragStart(e: MouseEvent) {
  // Only allow pan when zoomed past fit and not in draw mode
  if (props.drawMode) return;
  if (zoomState.isFitMode.value) return;
  dragging.value = true;
  dragStartX.value = e.clientX;
  dragStartY.value = e.clientY;
  panStartX.value = zoomState.panX.value;
  panStartY.value = zoomState.panY.value;
}

function onCanvasDragMove(e: MouseEvent) {
  if (!dragging.value) return;
  const dx = e.clientX - dragStartX.value;
  const dy = e.clientY - dragStartY.value;
  zoomState.setPan(panStartX.value + dx, panStartY.value + dy);
}

function onCanvasDragEnd() {
  dragging.value = false;
}

function onKeydown(e: KeyboardEvent) {
  switch (e.key) {
    case 'Escape':
      emit('close');
      break;
    case 'ArrowLeft':
      e.preventDefault();
      goTo(currentIndex.value - 1);
      break;
    case 'ArrowRight':
      e.preventDefault();
      goTo(currentIndex.value + 1);
      break;
    case '+':
    case '=':
      zoomState.zoomIn();
      break;
    case '-':
      zoomState.zoomOut();
      break;
    case '0':
      zoomState.fitToContainer();
      break;
  }
}

function scrollActiveThumbIntoView() {
  nextTick(() => {
    activeThumbEl.value?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
}

// Exposed for parent to trigger region refresh
async function reloadRegions() {
  await loadRegions();
}

defineExpose({ reloadRegions });

watch(currentIndex, () => {
  loadMedia();
  scrollActiveThumbIntoView();
});

// React to initialIndex prop changes from parent
watch(() => props.initialIndex, (val) => {
  if (val !== currentIndex.value) {
    currentIndex.value = val;
    emit('update:currentIndex', val);
  }
});

onMounted(() => {
  rootEl.value?.focus();
  loadMedia();
});
</script>

<style scoped>
.media-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface-bg);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  outline: none;
  overflow: hidden;
}

/* Toolbar */
.viewer-toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  height: 36px;
  padding: 0 var(--space-sm);
  border-bottom: 1px solid var(--surface-border-subtle);
  flex-shrink: 0;
  font-size: var(--font-sm);
  color: var(--text-secondary);
  user-select: none;
}

.viewer-filename {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary);
  font-weight: 500;
}

.viewer-counter {
  white-space: nowrap;
  color: var(--text-muted);
}

.toolbar-sep {
  width: 1px;
  height: 16px;
  background: var(--surface-border-subtle);
  flex-shrink: 0;
}

.zoom-controls {
  display: flex;
  align-items: center;
  gap: 2px;
}

.zoom-btn {
  background: none;
  border: none;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: var(--font-sm);
  color: var(--text-secondary);
  line-height: 1;
}

.zoom-btn:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.zoom-pct {
  min-width: 40px;
  text-align: center;
  font-size: var(--font-xs);
  color: var(--text-muted);
}

.viewer-close {
  background: none;
  border: none;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: var(--font-sm);
  color: var(--text-secondary);
  line-height: 1;
}

.viewer-close:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}

/* Canvas — always dark so images render against a neutral background regardless of theme */
.viewer-canvas {
  flex: 1;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: default;
  background: #000;
}

.image-wrapper {
  position: relative;
  display: inline-block;
}

.image-wrapper img {
  display: block;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  user-select: none;
}

/* Nav arrows */
.nav-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 2;
  background: var(--surface-bg);
  border: 1px solid var(--surface-border-subtle);
  border-radius: var(--radius-md);
  width: 32px;
  height: 48px;
  font-size: 20px;
  color: var(--text-secondary);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.viewer-canvas:hover .nav-arrow {
  opacity: 1;
}

.nav-arrow:disabled {
  opacity: 0 !important;
  cursor: default;
}

.nav-arrow:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.nav-prev {
  left: var(--space-sm);
}

.nav-next {
  right: var(--space-sm);
}

/* Loading / fallback */
.viewer-loading,
.viewer-fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.fallback-icon {
  font-size: 48px;
}

/* Filmstrip */
.viewer-filmstrip {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 64px;
  padding: var(--space-sm);
  border-top: 1px solid var(--surface-border-subtle);
  overflow-x: auto;
  flex-shrink: 0;
}

.filmstrip-thumb {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  overflow: hidden;
  cursor: pointer;
  border: 2px solid transparent;
  opacity: 0.6;
  transition: opacity 0.15s, border-color 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-hover);
}

.filmstrip-thumb.active {
  border-color: var(--accent);
  opacity: 1;
}

.filmstrip-thumb:hover:not(.active) {
  opacity: 0.85;
}

.filmstrip-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  user-select: none;
}

.thumb-placeholder {
  font-size: 18px;
}
</style>
