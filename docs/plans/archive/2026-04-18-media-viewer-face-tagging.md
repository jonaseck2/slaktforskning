# Media Viewer & Face Tagging — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the modal lightbox with an inline image viewer in the left sheet of MediaView, with zoom/pan, bottom filmstrip navigation, and face tag drawing.

**Architecture:** MediaView gains a `viewerMode` toggle. When active, a new `MediaViewer` component replaces the gallery grid in the left sheet, containing a toolbar, zoomable image canvas with `FaceTagOverlay`, and a bottom filmstrip. The right MediaPanel stays open. Face tagging uses the existing `media_regions` API — the only new code is Vue components and a zoom/pan composable.

**Tech Stack:** Vue 3 (Composition API), CSS transforms for zoom/pan, existing SQLite media_regions CRUD via IPC.

**Spec:** `docs/plans/2026-04-18-media-viewer-face-tagging-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/renderer/components/MediaViewer.vue` | Inline viewer: toolbar, image canvas, filmstrip, keyboard shortcuts |
| `src/renderer/components/FaceTagOverlay.vue` | Face tag region rendering + draw mode rectangle drawing |
| `src/renderer/composables/useImageZoom.ts` | Zoom/pan state, scroll-to-zoom, drag-to-pan, fit-to-container |

### Modified Files
| File | Changes |
|------|---------|
| `src/renderer/views/MediaView.vue` | Add viewerMode state, render MediaViewer instead of gallery, remove MediaLightbox, coordinate draw mode between panel and viewer |
| `src/renderer/components/MediaPanel.vue` | Face Tags section: +Draw button, delete region, reassign person, highlight region interaction |
| `src/renderer/i18n/en.ts` | New keys for viewer toolbar, draw mode, zoom controls |
| `src/renderer/i18n/sv.ts` | Swedish translations for same keys |

### Removed
| File | Reason |
|------|--------|
| `src/renderer/components/MediaLightbox.vue` | Fully replaced by inline MediaViewer |

---

## Task 1: useImageZoom composable

**Files:**
- Create: `src/renderer/composables/useImageZoom.ts`
- Test: `tests/unit/useImageZoom.test.ts`

- [ ] **Step 1: Write failing tests for zoom composable**

```typescript
// tests/unit/useImageZoom.test.ts
import { describe, it, expect } from 'vitest';
import { useImageZoom } from '../../src/renderer/composables/useImageZoom';

describe('useImageZoom', () => {
  it('initializes in fit mode with zoom 1', () => {
    const { zoom, panX, panY, isFitMode } = useImageZoom();
    expect(zoom.value).toBe(1);
    expect(panX.value).toBe(0);
    expect(panY.value).toBe(0);
    expect(isFitMode.value).toBe(true);
  });

  it('zoomIn increases zoom by step', () => {
    const { zoom, zoomIn } = useImageZoom();
    zoomIn();
    expect(zoom.value).toBeCloseTo(1.25);
  });

  it('zoomOut decreases zoom but not below minZoom', () => {
    const { zoom, zoomOut, setMinZoom } = useImageZoom();
    setMinZoom(0.5);
    zoomOut();
    expect(zoom.value).toBeCloseTo(0.8);
    // Keep zooming out
    for (let i = 0; i < 10; i++) zoomOut();
    expect(zoom.value).toBeGreaterThanOrEqual(0.5);
  });

  it('zoomOut does not go below minZoom of 1 when no setMinZoom called', () => {
    const { zoom, zoomOut } = useImageZoom();
    zoomOut();
    expect(zoom.value).toBe(1); // default minZoom is 1 (fit)
  });

  it('fitToContainer resets zoom and pan', () => {
    const { zoom, panX, panY, zoomIn, fitToContainer } = useImageZoom();
    zoomIn();
    zoomIn();
    fitToContainer();
    expect(zoom.value).toBe(1);
    expect(panX.value).toBe(0);
    expect(panY.value).toBe(0);
  });

  it('caps zoom at MAX_ZOOM (5)', () => {
    const { zoom, zoomIn } = useImageZoom();
    for (let i = 0; i < 50; i++) zoomIn();
    expect(zoom.value).toBeLessThanOrEqual(5);
  });

  it('setPan updates panX and panY', () => {
    const { panX, panY, setPan } = useImageZoom();
    setPan(100, 200);
    expect(panX.value).toBe(100);
    expect(panY.value).toBe(200);
  });

  it('isFitMode is false after zooming', () => {
    const { isFitMode, zoomIn } = useImageZoom();
    expect(isFitMode.value).toBe(true);
    zoomIn();
    expect(isFitMode.value).toBe(false);
  });

  it('zoomPercent returns formatted string', () => {
    const { zoomPercent, zoomIn } = useImageZoom();
    expect(zoomPercent.value).toBe('100%');
    zoomIn();
    expect(zoomPercent.value).toBe('125%');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/useImageZoom.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement useImageZoom**

```typescript
// src/renderer/composables/useImageZoom.ts
import { ref, computed } from 'vue';

const ZOOM_STEP = 1.25;
const MAX_ZOOM = 5;

export function useImageZoom() {
  const zoom = ref(1);
  const panX = ref(0);
  const panY = ref(0);
  const minZoom = ref(1);

  const isFitMode = computed(() => zoom.value === 1 && panX.value === 0 && panY.value === 0);
  const zoomPercent = computed(() => Math.round(zoom.value * 100) + '%');

  function setMinZoom(val: number) {
    minZoom.value = val;
  }

  function zoomIn() {
    zoom.value = Math.min(zoom.value * ZOOM_STEP, MAX_ZOOM);
  }

  function zoomOut() {
    zoom.value = Math.max(zoom.value / ZOOM_STEP, minZoom.value);
  }

  function fitToContainer() {
    zoom.value = 1;
    panX.value = 0;
    panY.value = 0;
  }

  function setPan(x: number, y: number) {
    panX.value = x;
    panY.value = y;
  }

  /** Call from wheel event on the image container. */
  function onWheel(e: WheelEvent, containerRect: DOMRect) {
    e.preventDefault();
    const oldZoom = zoom.value;
    const newZoom = e.deltaY < 0
      ? Math.min(oldZoom * ZOOM_STEP, MAX_ZOOM)
      : Math.max(oldZoom / ZOOM_STEP, minZoom.value);

    if (newZoom === oldZoom) return;

    // Keep the point under cursor stable
    const cx = e.clientX - containerRect.left;
    const cy = e.clientY - containerRect.top;
    const scale = newZoom / oldZoom;
    panX.value = cx - scale * (cx - panX.value);
    panY.value = cy - scale * (cy - panY.value);
    zoom.value = newZoom;
  }

  return {
    zoom, panX, panY, minZoom,
    isFitMode, zoomPercent,
    setMinZoom, zoomIn, zoomOut, fitToContainer, setPan, onWheel,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/useImageZoom.test.ts`
Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

Message: `feat: add useImageZoom composable for media viewer zoom/pan`

---

## Task 2: FaceTagOverlay component

**Files:**
- Create: `src/renderer/components/FaceTagOverlay.vue`

This component renders face tag regions as positioned divs over the image, and handles draw mode for creating new regions.

- [ ] **Step 1: Create FaceTagOverlay.vue**

```vue
<template>
  <div
    class="face-tag-layer"
    :class="{ 'draw-mode': drawMode }"
    @mousedown="onMouseDown"
    @mousemove="onMouseMove"
    @mouseup="onMouseUp"
  >
    <!-- Existing regions -->
    <div
      v-for="region in regions"
      :key="region.id"
      class="face-tag-region"
      :class="{
        'identified': !!region.person_id,
        'unidentified': !region.person_id,
        'highlighted': highlightedId === region.id,
      }"
      :style="regionStyle(region)"
      @click.stop="emit('regionClicked', region.id)"
      @mouseenter="emit('regionHovered', region.id)"
      @mouseleave="emit('regionHovered', null)"
    >
      <span class="region-label">{{ region.personName || region.label || '?' }}</span>
    </div>

    <!-- Drawing rectangle -->
    <div
      v-if="drawRect"
      class="draw-preview"
      :style="drawRectStyle"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

interface Region {
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
  regions: Region[];
  imageWidth: number;
  imageHeight: number;
  drawMode: boolean;
  highlightedId: string | null;
}>();

const emit = defineEmits<{
  regionDrawn: [rect: { x: number; y: number; width: number; height: number }];
  regionClicked: [id: string];
  regionHovered: [id: string | null];
}>();

const drawStart = ref<{ x: number; y: number } | null>(null);
const drawCurrent = ref<{ x: number; y: number } | null>(null);

const drawRect = computed(() => {
  if (!drawStart.value || !drawCurrent.value) return null;
  const x = Math.min(drawStart.value.x, drawCurrent.value.x);
  const y = Math.min(drawStart.value.y, drawCurrent.value.y);
  const w = Math.abs(drawCurrent.value.x - drawStart.value.x);
  const h = Math.abs(drawCurrent.value.y - drawStart.value.y);
  return { x, y, width: w, height: h };
});

const drawRectStyle = computed(() => {
  if (!drawRect.value) return {};
  return {
    left: drawRect.value.x + 'px',
    top: drawRect.value.y + 'px',
    width: drawRect.value.width + 'px',
    height: drawRect.value.height + 'px',
  };
});

function regionStyle(region: Region) {
  return {
    left: (region.x * props.imageWidth) + 'px',
    top: (region.y * props.imageHeight) + 'px',
    width: (region.width * props.imageWidth) + 'px',
    height: (region.height * props.imageHeight) + 'px',
  };
}

function getLocalCoords(e: MouseEvent): { x: number; y: number } {
  const el = e.currentTarget as HTMLElement;
  const rect = el.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function onMouseDown(e: MouseEvent) {
  if (!props.drawMode) return;
  e.preventDefault();
  drawStart.value = getLocalCoords(e);
  drawCurrent.value = drawStart.value;
}

function onMouseMove(e: MouseEvent) {
  if (!drawStart.value) return;
  drawCurrent.value = getLocalCoords(e);
}

function onMouseUp() {
  if (!drawStart.value || !drawCurrent.value || !drawRect.value) {
    drawStart.value = null;
    drawCurrent.value = null;
    return;
  }

  const r = drawRect.value;
  const MIN_SIZE = 10; // px minimum to avoid accidental clicks
  if (r.width < MIN_SIZE || r.height < MIN_SIZE) {
    drawStart.value = null;
    drawCurrent.value = null;
    return;
  }

  // Convert px to fractions (0-1)
  emit('regionDrawn', {
    x: r.x / props.imageWidth,
    y: r.y / props.imageHeight,
    width: r.width / props.imageWidth,
    height: r.height / props.imageHeight,
  });

  drawStart.value = null;
  drawCurrent.value = null;
}
</script>

<style scoped>
.face-tag-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.face-tag-layer.draw-mode {
  pointer-events: auto;
  cursor: crosshair;
}

.face-tag-region {
  position: absolute;
  border: 2px dashed rgba(74, 158, 255, 0.6);
  border-radius: var(--radius-sm);
  pointer-events: auto;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.face-tag-region.unidentified {
  border-color: rgba(255, 180, 74, 0.6);
}

.face-tag-region.highlighted {
  box-shadow: 0 0 0 2px rgba(74, 158, 255, 0.4);
}

.face-tag-region.unidentified.highlighted {
  box-shadow: 0 0 0 2px rgba(255, 180, 74, 0.4);
}

.region-label {
  position: absolute;
  bottom: -18px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  color: rgba(74, 158, 255, 0.8);
  white-space: nowrap;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  pointer-events: none;
}

.unidentified .region-label {
  color: rgba(255, 180, 74, 0.8);
}

.draw-preview {
  position: absolute;
  border: 2px dashed rgba(74, 158, 255, 0.8);
  background: rgba(74, 158, 255, 0.1);
  border-radius: var(--radius-sm);
  pointer-events: none;
}
</style>
```

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: 0 errors

- [ ] **Step 3: Commit**

Message: `feat: add FaceTagOverlay component for region rendering and drawing`

---

## Task 3: MediaViewer component (image canvas + toolbar + filmstrip)

**Files:**
- Create: `src/renderer/components/MediaViewer.vue`

This is the main inline viewer that replaces the lightbox. Contains the toolbar, zoomable image with face tag overlay, and bottom filmstrip.

- [ ] **Step 1: Create MediaViewer.vue**

```vue
<template>
  <div class="media-viewer" @keydown="onKeydown" tabindex="-1" ref="viewerEl">
    <!-- Toolbar -->
    <div class="viewer-toolbar">
      <span class="viewer-filename">{{ currentItem ? mediaDisplayName(currentItem.title, currentItem.file_ref) : '' }}</span>
      <span class="viewer-counter">{{ currentIndex + 1 }} / {{ mediaItems.length }}</span>
      <div class="viewer-separator"></div>
      <div class="zoom-controls">
        <button class="zoom-btn" @click="zoomState.zoomOut()" :title="('media.viewer.zoomOut')">−</button>
        <span class="zoom-percent">{{ zoomState.zoomPercent.value }}</span>
        <button class="zoom-btn" @click="zoomState.zoomIn()" :title="('media.viewer.zoomIn')">+</button>
        <button class="zoom-btn" @click="zoomState.fitToContainer()" :title="('media.viewer.fit')">{{ ('media.viewer.fit') }}</button>
      </div>
      <div class="viewer-separator"></div>
      <button class="viewer-close" @click="emit('close')" :title="('common.close')">&#10005;</button>
    </div>

    <!-- Image canvas area -->
    <div
      class="viewer-canvas"
      ref="canvasEl"
      @wheel.prevent="handleWheel"
      @mousedown="startPan"
    >
      <!-- Left/right nav arrows -->
      <button
        v-if="mediaItems.length > 1 && currentIndex > 0"
        class="nav-arrow nav-prev"
        @click="goTo(currentIndex - 1)"
      >&#9664;</button>
      <button
        v-if="mediaItems.length > 1 && currentIndex < mediaItems.length - 1"
        class="nav-arrow nav-next"
        @click="goTo(currentIndex + 1)"
      >&#9654;</button>

      <!-- Image wrapper (zoom/pan via transform) -->
      <div
        v-if="dataUrl"
        class="image-wrapper"
        :style="imageTransformStyle"
      >
        <img
          ref="imgEl"
          :src="dataUrl"
          :alt="currentItem ? mediaDisplayName(currentItem.title, currentItem.file_ref, '') : ''"
          class="viewer-image"
          @load="onImageLoad"
          draggable="false"
        />
        <FaceTagOverlay
          v-if="imgNaturalWidth > 0"
          :regions="regions"
          :image-width="imgNaturalWidth"
          :image-height="imgNaturalHeight"
          :draw-mode="drawMode"
          :highlighted-id="highlightedRegionId"
          @region-drawn="onRegionDrawn"
          @region-clicked="onRegionClicked"
          @region-hovered="onRegionHovered"
        />
      </div>
      <div v-else-if="loadingImage" class="viewer-loading">{{ ('common.loading') }}</div>
      <div v-else class="viewer-file-icon">
        <div class="file-icon-box">
          <span class="file-ext">{{ currentItem?.format?.toUpperCase() || '?' }}</span>
        </div>
      </div>
    </div>

    <!-- Bottom filmstrip -->
    <div class="viewer-filmstrip" ref="filmstripEl">
      <div
        v-for="(item, idx) in mediaItems"
        :key="item.id"
        class="filmstrip-thumb"
        :class="{ active: idx === currentIndex }"
        @click="goTo(idx)"
        :ref="el => { if (idx === currentIndex) activeThumbEl = el as HTMLElement; }"
      >
        <img v-if="thumbnails[item.id]" :src="thumbnails[item.id]" class="filmstrip-img" />
        <span v-else class="filmstrip-placeholder">{{ (item.format || '?').toUpperCase() }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import FaceTagOverlay from './FaceTagOverlay.vue';
import { useImageZoom } from '../composables/useImageZoom';
import { mediaDisplayName } from '../utils/mediaUtils';

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

interface RegionWithPerson {
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
  regionClicked: [id: string];
  regionHovered: [id: string | null];
}>();

const { t } = useI18n();
const zoomState = useImageZoom();

const viewerEl = ref<HTMLElement | null>(null);
const canvasEl = ref<HTMLElement | null>(null);
const imgEl = ref<HTMLImageElement | null>(null);
const filmstripEl = ref<HTMLElement | null>(null);
const activeThumbEl = ref<HTMLElement | null>(null);

const currentIndex = ref(props.initialIndex);
const dataUrl = ref<string | null>(null);
const loadingImage = ref(false);
const regions = ref<RegionWithPerson[]>([]);
const imgNaturalWidth = ref(0);
const imgNaturalHeight = ref(0);

// Pan drag state
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let panStartPanX = 0;
let panStartPanY = 0;

const currentItem = computed(() => props.mediaItems[currentIndex.value] ?? null);

const isImage = computed(() => {
  const fmt = currentItem.value?.format?.toLowerCase();
  return fmt ? IMAGE_FORMATS.has(fmt) : false;
});

const imageTransformStyle = computed(() => ({
  transform: \,
  transformOrigin: '0 0',
}));

function goTo(idx: number) {
  if (idx < 0 || idx >= props.mediaItems.length) return;
  currentIndex.value = idx;
  emit('update:currentIndex', idx);
}

async function loadImage() {
  dataUrl.value = null;
  imgNaturalWidth.value = 0;
  imgNaturalHeight.value = 0;
  if (!currentItem.value || !isImage.value) return;
  loadingImage.value = true;
  try {
    const url = await window.api.media.readAsDataUrl(currentItem.value.id) as string | null;
    dataUrl.value = url;
  } finally {
    loadingImage.value = false;
  }
}

async function loadRegions() {
  if (!currentItem.value) { regions.value = []; return; }
  const regs = await window.api.mediaRegions.getForMedia(currentItem.value.id) as Array<{
    id: string; person_id: string | null; label: string | null;
    x: number; y: number; width: number; height: number;
  }>;
  const enriched: RegionWithPerson[] = [];
  for (const r of regs) {
    let personName = '';
    if (r.person_id) {
      try {
        const names = await window.api.persons.getNames(r.person_id) as Array<{ given_name?: string; surname?: string }>;
        if (names.length > 0) personName = [names[0].given_name, names[0].surname].filter(Boolean).join(' ');
      } catch { /* deleted person */ }
    }
    enriched.push({ ...r, personName });
  }
  regions.value = enriched;
}

function onImageLoad() {
  if (imgEl.value) {
    imgNaturalWidth.value = imgEl.value.naturalWidth;
    imgNaturalHeight.value = imgEl.value.naturalHeight;
  }
  zoomState.fitToContainer();
}

function handleWheel(e: WheelEvent) {
  if (!canvasEl.value) return;
  zoomState.onWheel(e, canvasEl.value.getBoundingClientRect());
}

function startPan(e: MouseEvent) {
  if (props.drawMode) return; // draw mode handled by FaceTagOverlay
  if (zoomState.isFitMode.value) return; // no pan at fit level
  isPanning = true;
  panStartX = e.clientX;
  panStartY = e.clientY;
  panStartPanX = zoomState.panX.value;
  panStartPanY = zoomState.panY.value;

  const onMove = (ev: MouseEvent) => {
    if (!isPanning) return;
    const dx = ev.clientX - panStartX;
    const dy = ev.clientY - panStartY;
    zoomState.setPan(
      panStartPanX + dx / zoomState.zoom.value,
      panStartPanY + dy / zoomState.zoom.value,
    );
  };

  const onUp = () => {
    isPanning = false;
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close');
  } else if (e.key === 'ArrowLeft') {
    goTo(currentIndex.value - 1);
  } else if (e.key === 'ArrowRight') {
    goTo(currentIndex.value + 1);
  } else if (e.key === '+' || e.key === '=') {
    zoomState.zoomIn();
  } else if (e.key === '-') {
    zoomState.zoomOut();
  } else if (e.key === '0') {
    zoomState.fitToContainer();
  }
}

function onRegionDrawn(rect: { x: number; y: number; width: number; height: number }) {
  emit('regionDrawn', rect);
}

function onRegionClicked(id: string) {
  emit('regionClicked', id);
}

function onRegionHovered(id: string | null) {
  emit('regionHovered', id);
}

function scrollFilmstripToActive() {
  nextTick(() => {
    if (activeThumbEl.value && filmstripEl.value) {
      activeThumbEl.value.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  });
}

// Expose for parent to trigger region reload
async function reloadRegions() {
  await loadRegions();
}
defineExpose({ reloadRegions });

watch(currentIndex, async () => {
  zoomState.fitToContainer();
  await Promise.all([loadImage(), loadRegions()]);
  scrollFilmstripToActive();
}, { immediate: true });

onMounted(() => {
  nextTick(() => viewerEl.value?.focus());
});
</script>

<style scoped>
.media-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface);
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
  padding: var(--space-sm) var(--space-md);
  border-bottom: 1px solid var(--surface-border-subtle);
  flex-shrink: 0;
  min-height: 36px;
}
.viewer-filename {
  font-size: var(--font-sm);
  font-weight: 500;
  color: var(--text-primary);
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.viewer-counter {
  font-size: var(--font-xs);
  color: var(--text-muted);
  white-space: nowrap;
}
.viewer-separator {
  width: 1px;
  height: 16px;
  background: var(--surface-border);
  flex-shrink: 0;
}
.zoom-controls {
  display: flex;
  align-items: center;
  gap: 2px;
}
.zoom-btn {
  padding: 2px 8px;
  background: var(--surface-hover);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  font-size: var(--font-xs);
  color: var(--text-secondary);
  cursor: pointer;
  line-height: 1.4;
}
.zoom-btn:hover { background: var(--surface-border-subtle); color: var(--text-primary); }
.zoom-percent {
  font-size: var(--font-xs);
  color: var(--text-muted);
  min-width: 36px;
  text-align: center;
}
.viewer-close {
  padding: 2px 8px;
  background: var(--surface-hover);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  font-size: var(--font-sm);
  color: var(--text-muted);
  cursor: pointer;
  line-height: 1;
}
.viewer-close:hover { color: var(--text-primary); }

/* Canvas */
.viewer-canvas {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: var(--surface-bg);
  display: flex;
  align-items: center;
  justify-content: center;
}
.image-wrapper {
  position: relative;
  display: inline-block;
}
.viewer-image {
  display: block;
  max-width: 100%;
  max-height: 100%;
  user-select: none;
}
.viewer-loading {
  color: var(--text-muted);
  font-size: var(--font-sm);
}
.viewer-file-icon {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-lg);
}
.file-icon-box {
  width: 100px;
  height: 120px;
  background: var(--surface-hover);
  border: 2px solid var(--surface-border);
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
}
.file-ext {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-muted);
}

/* Nav arrows */
.nav-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 5;
  width: 32px;
  height: 48px;
  background: color-mix(in srgb, var(--surface) 70%, transparent);
  border: 1px solid var(--surface-border-subtle);
  border-radius: var(--radius-md);
  color: var(--text-muted);
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s;
  backdrop-filter: blur(4px);
}
.viewer-canvas:hover .nav-arrow { opacity: 1; }
.nav-arrow:hover { color: var(--text-primary); background: color-mix(in srgb, var(--surface) 90%, transparent); }
.nav-prev { left: var(--space-sm); }
.nav-next { right: var(--space-sm); }

/* Filmstrip */
.viewer-filmstrip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: var(--space-sm) var(--space-md);
  height: 64px;
  overflow-x: auto;
  border-top: 1px solid var(--surface-border-subtle);
  flex-shrink: 0;
  background: var(--surface);
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
  background: var(--surface-bg);
  display: flex;
  align-items: center;
  justify-content: center;
}
.filmstrip-thumb:hover { opacity: 0.9; }
.filmstrip-thumb.active {
  opacity: 1;
  border-color: var(--accent);
}
.filmstrip-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.filmstrip-placeholder {
  font-size: var(--font-xs);
  font-weight: 600;
  color: var(--text-muted);
}
</style>
```

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: 0 errors

- [ ] **Step 3: Commit**

Message: `feat: add MediaViewer component with zoom/pan, filmstrip, face tag overlay`

---

## Task 4: Wire MediaViewer into MediaView (replace lightbox)

**Files:**
- Modify: `src/renderer/views/MediaView.vue`

Replace the lightbox with the inline viewer. Add viewerMode state. Coordinate draw mode and region events between MediaViewer and MediaPanel.

- [ ] **Step 1: Update MediaView.vue**

Changes to make:

1. Replace `import MediaLightbox` with `import MediaViewer` from `'../components/MediaViewer.vue'`.

2. Replace state:
   - Remove: `lightboxVisible`, `lightboxIndex`
   - Add: `const viewerMode = ref(false)`, `const viewerIndex = ref(0)`, `const drawMode = ref(false)`, `const highlightedRegionId = ref<string | null>(null)`, `const viewerRef = ref<InstanceType<typeof MediaViewer> | null>(null)`

3. Replace `openLightbox(idx)`:
   ```typescript
   function openViewer(idx: number) {
     viewerIndex.value = idx;
     // Ensure the media at this index is selected for the panel
     const item = filteredItems.value[idx];
     if (item) selectedMediaId.value = item.id;
     viewerMode.value = true;
   }
   ```

4. Add viewer event handlers:
   ```typescript
   function onViewerIndexChange(idx: number) {
     viewerIndex.value = idx;
     const item = filteredItems.value[idx];
     if (item) selectedMediaId.value = item.id;
   }

   function closeViewer() {
     viewerMode.value = false;
     drawMode.value = false;
   }

   async function onRegionDrawn(rect: { x: number; y: number; width: number; height: number }) {
     if (!selectedMediaId.value) return;
     await window.api.mediaRegions.create({
       media_id: selectedMediaId.value,
       x: rect.x, y: rect.y,
       width: rect.width, height: rect.height,
     });
     // Refresh both viewer overlay and panel
     viewerRef.value?.reloadRegions();
   }

   function onStartDrawMode() {
     drawMode.value = true;
   }

   function onStopDrawMode() {
     drawMode.value = false;
   }
   ```

5. In template, replace the `<MediaLightbox ... />` block with:
   ```vue
   <!-- Inline viewer (replaces gallery grid when active) -->
   <MediaViewer
     v-if="viewerMode"
     ref="viewerRef"
     :media-items="filteredItems"
     :initial-index="viewerIndex"
     :thumbnails="thumbnails"
     :draw-mode="drawMode"
     :highlighted-region-id="highlightedRegionId"
     @close="closeViewer"
     @update:current-index="onViewerIndexChange"
     @region-drawn="onRegionDrawn"
     @region-clicked="id => highlightedRegionId = id"
     @region-hovered="id => highlightedRegionId = id"
   />
   ```

6. Wrap the gallery grid and table in `v-if="!viewerMode"` — add this condition to the `<div v-else-if="viewMode === 'gallery'" ...` and `<table v-else-if="viewMode === 'table'" ...` blocks (change them to check `!viewerMode && viewMode === 'gallery'` etc.).

7. Replace all `openLightbox(idx)` calls with `openViewer(idx)`.

8. On MediaPanel, add event listeners for draw mode:
   ```vue
   <MediaPanel
     :media-id="selectedMediaId"
     :draw-mode="drawMode"
     :highlighted-region-id="highlightedRegionId"
     @link-changed="reload"
     @close="selectedMediaId = null"
     @start-draw-mode="onStartDrawMode"
     @stop-draw-mode="onStopDrawMode"
     @highlight-region="id => highlightedRegionId = id"
     @region-deleted="() => viewerRef?.reloadRegions()"
   />
   ```

9. Remove the `MediaLightbox` import and component usage entirely.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: 0 errors

- [ ] **Step 3: Verify in app**

Run: `npm start`
- Navigate to Media view
- Click expand button (⛶) on a gallery card → should enter inline viewer
- Double-click a card → should also enter viewer
- Filmstrip shows at bottom, clicking switches images
- Right panel stays visible and updates with selected image
- Zoom controls work (scroll, +/-, Fit)
- Arrow keys navigate between images
- Escape closes viewer → returns to gallery
- Close (✕) button works

- [ ] **Step 4: Commit**

Message: `feat: wire MediaViewer into MediaView, replace modal lightbox`

---

## Task 5: MediaPanel face tag interactions (draw, delete, reassign, highlight)

**Files:**
- Modify: `src/renderer/components/MediaPanel.vue`

Add interactive face tag management: +Draw button, delete regions, reassign person, highlight coordination.

- [ ] **Step 1: Update MediaPanel props and emits**

Add to props:
```typescript
const props = defineProps<{
  mediaId: string | null;
  drawMode?: boolean;
  highlightedRegionId?: string | null;
}>();
```

Add to emits:
```typescript
const emit = defineEmits<{
  'link-changed': [];
  'close': [];
  'start-draw-mode': [];
  'stop-draw-mode': [];
  'highlight-region': [id: string | null];
  'region-deleted': [];
}>();
```

- [ ] **Step 2: Update Face Tags section template**

Replace the Face Tags section (lines 94-109) with:
```vue
<!-- Face Tags -->
<div class="panel-section">
  <SectionHeader
    :title="('media.faceTags')"
    :count="regions.length"
    :collapsed="!sections.faceTags"
    :action-label="drawMode ? ('media.viewer.drawDone') : ('media.viewer.drawTag')"
    @toggle="toggleSection('faceTags')"
    @action="drawMode ? emit('stop-draw-mode') : emit('start-draw-mode')"
  />
  <div v-if="sections.faceTags" class="panel-section-body">
    <div v-if="regions.length === 0 && !drawMode" class="panel-empty-section">{{ ('media.noFaceTags') }}</div>
    <div
      v-for="r in regions"
      :key="r.id"
      class="linked-row face-tag-row"
      :class="{ 'face-tag-highlighted': highlightedRegionId === r.id }"
      @mouseenter="emit('highlight-region', r.id)"
      @mouseleave="emit('highlight-region', null)"
    >
      <AppAvatar v-if="r.person_id" :given-name="r.personGivenName || ''" :surname="r.personSurname || ''" :sex="r.personSex || 'U'" size="sm" />
      <div v-else class="face-tag-unknown">?</div>
      <span v-if="r.person_id" class="face-tag-name">{{ r.personName || ('media.untitled') }}</span>
      <div v-else class="face-tag-assign">
        <PersonPicker :model-value="null" :placeholder="('media.viewer.assignPerson')" @select="person => assignPersonToRegion(r.id, person.id)" />
      </div>
      <AppButton variant="ghost" size="sm" class="unlink-btn" @click="deleteRegion(r.id)">&#10005;</AppButton>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Add region management functions**

Add to script:
```typescript
async function deleteRegion(regionId: string) {
  await window.api.mediaRegions.delete(regionId);
  emit('region-deleted');
  if (props.mediaId) await load();
}

async function assignPersonToRegion(regionId: string, personId: string) {
  await window.api.mediaRegions.update(regionId, { person_id: personId });
  emit('region-deleted'); // triggers viewer reload too
  if (props.mediaId) await load();
}
```

- [ ] **Step 4: Add scoped styles for face tag rows**

```css
.face-tag-row {
  transition: background 0.15s;
  padding: var(--space-xs) var(--space-xs);
  border-radius: var(--radius-sm);
  margin: 0 calc(-1 * var(--space-xs));
}
.face-tag-highlighted {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}
.face-tag-unknown {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--warning-bg);
  color: var(--warning-text);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-xs);
  font-weight: 600;
  flex-shrink: 0;
}
.face-tag-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.face-tag-assign {
  flex: 1;
  min-width: 0;
}
```

- [ ] **Step 5: Run lint**

Run: `npm run lint`
Expected: 0 errors

- [ ] **Step 6: Commit**

Message: `feat: add face tag interactions to MediaPanel (draw, delete, assign)`

---

## Task 6: i18n keys

**Files:**
- Modify: `src/renderer/i18n/en.ts`
- Modify: `src/renderer/i18n/sv.ts`

- [ ] **Step 1: Add English keys**

Add inside the `media` object, in a new `viewer` sub-object:
```typescript
viewer: {
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  fit: 'Fit',
  drawTag: '+ Draw',
  drawDone: 'Done',
  assignPerson: 'Assign person...',
},
```

- [ ] **Step 2: Add Swedish keys**

```typescript
viewer: {
  zoomIn: 'Zooma in',
  zoomOut: 'Zooma ut',
  fit: 'Anpassa',
  drawTag: '+ Rita',
  drawDone: 'Klar',
  assignPerson: 'Tilldela person...',
},
```

- [ ] **Step 3: Commit**

Message: `feat: add i18n keys for media viewer and face tagging`

---

## Task 7: Delete MediaLightbox and clean up references

**Files:**
- Delete: `src/renderer/components/MediaLightbox.vue`
- Modify: `src/renderer/components/PersonMediaSection.vue` (if it uses MediaLightbox)

- [ ] **Step 1: Check if MediaLightbox is used elsewhere**

Run: `grep -r "MediaLightbox" src/`

If PersonMediaSection or other components import MediaLightbox, update them to either:
- Remove the lightbox (if the component doesn't need it)
- Or keep a simplified version (PersonMediaSection may have its own inline lightbox)

- [ ] **Step 2: Delete MediaLightbox.vue**

Run: `rm src/renderer/components/MediaLightbox.vue`

- [ ] **Step 3: Run lint and tests**

Run: `npm run lint && npm test`
Expected: 0 errors, all tests pass

- [ ] **Step 4: Commit**

Message: `refactor: remove MediaLightbox, replaced by inline MediaViewer`

---

## Task 8: Integration testing and polish

**Files:**
- Modify: any files needing fixes from testing

- [ ] **Step 1: Full integration test in the app**

Run: `npm start`

Test checklist:
- [ ] Gallery view: expand button enters viewer mode
- [ ] Gallery view: double-click enters viewer mode
- [ ] Viewer: toolbar shows filename, counter, zoom controls
- [ ] Viewer: scroll-to-zoom works, zoom percentage updates
- [ ] Viewer: Fit button resets zoom
- [ ] Viewer: drag-to-pan when zoomed in
- [ ] Viewer: arrow keys navigate images
- [ ] Viewer: filmstrip auto-scrolls to active item
- [ ] Viewer: clicking filmstrip thumb switches image
- [ ] Viewer: Escape closes, ✕ button closes
- [ ] Viewer: right panel stays open and syncs with current image
- [ ] Face tags: existing regions display as overlays on image
- [ ] Face tags: +Draw button enters draw mode (crosshair cursor)
- [ ] Face tags: click-drag draws rectangle
- [ ] Face tags: drawn region appears in panel with PersonPicker
- [ ] Face tags: assigning person updates overlay label and color
- [ ] Face tags: delete (✕) removes region from overlay and panel
- [ ] Face tags: hover region on image highlights panel row
- [ ] Face tags: hover panel row highlights region on image
- [ ] Face tags: Done/Escape exits draw mode
- [ ] Table view: thumbnail click enters viewer mode
- [ ] PersonMediaSection: still works (verify lightbox removal didn't break it)

- [ ] **Step 2: Fix any issues found**

- [ ] **Step 3: Run full test suite**

Run: `npm run lint && npm test`
Expected: 0 errors, all tests pass

- [ ] **Step 4: Version bump and commit**

Bump `package.json` version (minor bump — new feature).
Update `docs/PLAN.md` Implementation Status with the new version.
Move spec to archive if fully complete.

Message: `feat(vX.Y.0): inline media viewer with zoom/pan and face tagging`
