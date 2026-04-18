<template>
  <div
    ref="layerEl"
    class="face-tag-layer"
    :class="{ 'draw-mode': drawMode }"
    @mousedown="onLayerMouseDown"
    @mousemove="onLayerMouseMove"
    @mouseup="onLayerMouseUp"
    @mouseleave="onLayerMouseUp"
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
        'editing': editingId === region.id,
      }"
      :style="[regionStyle(region), editingId && editingId !== region.id ? { pointerEvents: 'none' } : {}]"
      @mousedown.stop="onRegionMouseDown($event, region)"
      @mousemove.stop="onRegionMouseMove($event, region)"
      @click.stop="onRegionClick(region.id)"
      @mouseenter="!editingId && emit('regionHovered', region.id)"
      @mouseleave="onRegionMouseLeave(region.id)"
    >
      <span class="region-label">{{ region.personName || region.label || '?' }}</span>
      <!-- Resize handles (visible on hover/editing) -->
      <div class="resize-handle handle-n" @mousedown.stop="startResize($event, region, 'n')"></div>
      <div class="resize-handle handle-s" @mousedown.stop="startResize($event, region, 's')"></div>
      <div class="resize-handle handle-e" @mousedown.stop="startResize($event, region, 'e')"></div>
      <div class="resize-handle handle-w" @mousedown.stop="startResize($event, region, 'w')"></div>
      <div class="resize-handle handle-ne" @mousedown.stop="startResize($event, region, 'ne')"></div>
      <div class="resize-handle handle-nw" @mousedown.stop="startResize($event, region, 'nw')"></div>
      <div class="resize-handle handle-se" @mousedown.stop="startResize($event, region, 'se')"></div>
      <div class="resize-handle handle-sw" @mousedown.stop="startResize($event, region, 'sw')"></div>
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
import { ref, computed, onBeforeUnmount } from 'vue';

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

type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const props = defineProps<{
  regions: Region[];
  imageWidth: number;
  imageHeight: number;
  drawMode: boolean;
  highlightedId: string | null;
}>();

const emit = defineEmits<{
  regionDrawn: [rect: { x: number; y: number; width: number; height: number }];
  regionUpdated: [id: string, rect: { x: number; y: number; width: number; height: number }];
  regionClicked: [id: string];
  regionHovered: [id: string | null];
}>();

const layerEl = ref<HTMLElement | null>(null);

// Draw mode state
const drawStart = ref<{ x: number; y: number } | null>(null);
const drawCurrent = ref<{ x: number; y: number } | null>(null);

// Move/resize state
const editingId = ref<string | null>(null);
const dragMode = ref<'move' | 'resize' | null>(null);
const resizeEdge = ref<Edge | null>(null);
const dragOrigin = ref<{ x: number; y: number }>({ x: 0, y: 0 });
const dragOriginalRect = ref<{ x: number; y: number; width: number; height: number }>({ x: 0, y: 0, width: 0, height: 0 });
// Live position during drag (pixels) — avoids mutating props
const dragLiveRect = ref<{ x: number; y: number; width: number; height: number } | null>(null);

const MIN_SIZE_PX = 10;
let didDrag = false;

// Central cleanup for all window listeners — prevents leaks
let activeCleanup: (() => void) | null = null;

function clearWindowListeners() {
  if (activeCleanup) {
    activeCleanup();
    activeCleanup = null;
  }
}

function attachWindowListeners(onMove: (e: MouseEvent) => void, onUp: (e: MouseEvent) => void) {
  clearWindowListeners(); // remove any previous leaked listeners
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  activeCleanup = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };
}

onBeforeUnmount(clearWindowListeners);

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
  // drawRect is in pixel coords (imageWidth space) — convert to percentages
  return {
    left: (drawRect.value.x / props.imageWidth * 100) + '%',
    top: (drawRect.value.y / props.imageHeight * 100) + '%',
    width: (drawRect.value.width / props.imageWidth * 100) + '%',
    height: (drawRect.value.height / props.imageHeight * 100) + '%',
  };
});

function regionStyle(region: Region) {
  // Use live drag rect for the region being moved/resized
  if (dragLiveRect.value && editingId.value === region.id) {
    // dragLiveRect is in pixel coords (imageWidth space) — convert to percentages
    return {
      left: (dragLiveRect.value.x / props.imageWidth * 100) + '%',
      top: (dragLiveRect.value.y / props.imageHeight * 100) + '%',
      width: (dragLiveRect.value.width / props.imageWidth * 100) + '%',
      height: (dragLiveRect.value.height / props.imageHeight * 100) + '%',
    };
  }
  // Regions store fractional coords (0-1) — render as percentages
  return {
    left: (region.x * 100) + '%',
    top: (region.y * 100) + '%',
    width: (region.width * 100) + '%',
    height: (region.height * 100) + '%',
  };
}

function getLocalCoords(e: MouseEvent): { x: number; y: number } {
  // Convert screen coords to element-local (pre-transform) coords.
  // The layer is inside a CSS-transformed container (scale + translate).
  // getBoundingClientRect() returns post-transform screen-space rect.
  // We need pre-transform pixel coords matching imageWidth/imageHeight.
  const el = layerEl.value;
  if (!el) return { x: 0, y: 0 };
  const rect = el.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) / rect.width * props.imageWidth,
    y: (e.clientY - rect.top) / rect.height * props.imageHeight,
  };
}

// --- Draw mode handlers (on the layer) ---

function onLayerMouseDown(e: MouseEvent) {
  if (!props.drawMode) return;
  e.preventDefault();
  drawStart.value = getLocalCoords(e);
  drawCurrent.value = drawStart.value;
}

function onLayerMouseMove(e: MouseEvent) {
  // Handle draw drag only — move/resize uses window listeners
  if (drawStart.value) {
    drawCurrent.value = getLocalCoords(e);
  }
}

function onLayerMouseUp() {
  // Finish draw only — move/resize uses window listeners
  if (drawStart.value && drawCurrent.value && drawRect.value) {
    const r = drawRect.value;
    if (r.width >= MIN_SIZE_PX && r.height >= MIN_SIZE_PX) {
      emit('regionDrawn', {
        x: r.x / props.imageWidth,
        y: r.y / props.imageHeight,
        width: r.width / props.imageWidth,
        height: r.height / props.imageHeight,
      });
    }
  }
  drawStart.value = null;
  drawCurrent.value = null;
}

// --- Move: mousedown on a region ---

function onRegionMouseDown(e: MouseEvent, region: Region) {
  if (props.drawMode) return;
  e.preventDefault();
  // Wait for mouse movement to distinguish click from drag
  const startPos = { x: e.clientX, y: e.clientY };
  const startEvent = e; // capture for startDrag
  const DRAG_THRESHOLD = 3;
  attachWindowListeners(
    (ev: MouseEvent) => {
      const dx = ev.clientX - startPos.x;
      const dy = ev.clientY - startPos.y;
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
        clearWindowListeners();
        startDrag(startEvent, region, 'move', null);
      }
    },
    () => {
      clearWindowListeners(); // no drag — just a click
    },
  );
}

function onRegionMouseMove(e: MouseEvent, region: Region) {
  if (dragMode.value || editingId.value) return; // dragging — don't interfere
  const edge = detectEdge(e, region);
  const el = e.currentTarget as HTMLElement;
  el.style.cursor = edge ? edgeCursor(edge) : 'move';
}

function onRegionMouseLeave(id: string) {
  if (!editingId.value) {
    emit('regionHovered', null);
  }
}

function onRegionClick(id: string) {
  if (didDrag) {
    didDrag = false;
    return;
  }
  emit('regionClicked', id);
}

// --- Resize: mousedown on a handle ---

function startResize(e: MouseEvent, region: Region, edge: Edge) {
  if (props.drawMode) return;
  e.preventDefault();
  startDrag(e, region, 'resize', edge);
}

function startDrag(e: MouseEvent, region: Region, mode: 'move' | 'resize', edge: Edge | null) {
  didDrag = false;
  editingId.value = region.id;
  dragMode.value = mode;
  resizeEdge.value = edge;
  dragOrigin.value = getLocalCoords(e);
  dragOriginalRect.value = {
    x: region.x * props.imageWidth,
    y: region.y * props.imageHeight,
    width: region.width * props.imageWidth,
    height: region.height * props.imageHeight,
  };

  attachWindowListeners(
    (ev: MouseEvent) => { handleDrag(ev); },
    () => { finishDrag(); clearWindowListeners(); },
  );
}

// --- Shared drag logic ---

function handleDrag(e: MouseEvent) {
  didDrag = true;
  const pos = getLocalCoords(e);
  const dx = pos.x - dragOrigin.value.x;
  const dy = pos.y - dragOrigin.value.y;
  const orig = dragOriginalRect.value;

  let x = orig.x, y = orig.y, width = orig.width, height = orig.height;

  if (dragMode.value === 'move') {
    x = clamp(orig.x + dx, 0, props.imageWidth - orig.width);
    y = clamp(orig.y + dy, 0, props.imageHeight - orig.height);
  } else if (dragMode.value === 'resize' && resizeEdge.value) {
    const edge = resizeEdge.value;

    if (edge.includes('e')) { width = Math.max(MIN_SIZE_PX, orig.width + dx); }
    if (edge.includes('w')) { x = orig.x + dx; width = Math.max(MIN_SIZE_PX, orig.width - dx); if (width === MIN_SIZE_PX) x = orig.x + orig.width - MIN_SIZE_PX; }
    if (edge.includes('s')) { height = Math.max(MIN_SIZE_PX, orig.height + dy); }
    if (edge.includes('n')) { y = orig.y + dy; height = Math.max(MIN_SIZE_PX, orig.height - dy); if (height === MIN_SIZE_PX) y = orig.y + orig.height - MIN_SIZE_PX; }

    x = clamp(x, 0, props.imageWidth - MIN_SIZE_PX);
    y = clamp(y, 0, props.imageHeight - MIN_SIZE_PX);
    width = Math.min(width, props.imageWidth - x);
    height = Math.min(height, props.imageHeight - y);
  }

  dragLiveRect.value = { x, y, width, height };
}

function finishDrag() {
  if (didDrag && dragLiveRect.value && editingId.value) {
    const r = dragLiveRect.value;
    emit('regionUpdated', editingId.value, {
      x: r.x / props.imageWidth,
      y: r.y / props.imageHeight,
      width: r.width / props.imageWidth,
      height: r.height / props.imageHeight,
    });
  }
  dragLiveRect.value = null;
  dragMode.value = null;
  resizeEdge.value = null;
  editingId.value = null;
}

// --- Helpers ---

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

const EDGE_THRESHOLD = 8; // px from edge to trigger resize

function detectEdge(e: MouseEvent, region: Region): Edge | null {
  const el = e.currentTarget as HTMLElement;
  const rect = el.getBoundingClientRect();
  // Use display dimensions (offsetWidth/Height) for hit testing
  const lx = (e.clientX - rect.left) / (rect.width / el.offsetWidth);
  const ly = (e.clientY - rect.top) / (rect.height / el.offsetHeight);
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const t = EDGE_THRESHOLD;

  const nearN = ly < t;
  const nearS = ly > h - t;
  const nearW = lx < t;
  const nearE = lx > w - t;

  if (nearN && nearW) return 'nw';
  if (nearN && nearE) return 'ne';
  if (nearS && nearW) return 'sw';
  if (nearS && nearE) return 'se';
  if (nearN) return 'n';
  if (nearS) return 's';
  if (nearW) return 'w';
  if (nearE) return 'e';
  return null;
}

function edgeCursor(edge: Edge): string {
  const cursors: Record<Edge, string> = {
    n: 'ns-resize', s: 'ns-resize',
    e: 'ew-resize', w: 'ew-resize',
    ne: 'nesw-resize', sw: 'nesw-resize',
    nw: 'nwse-resize', se: 'nwse-resize',
  };
  return cursors[edge];
}
</script>

<style scoped>
.face-tag-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  user-select: none;
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
  cursor: move;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.face-tag-region.unidentified {
  border-color: rgba(255, 180, 74, 0.6);
}

.face-tag-region.highlighted,
.face-tag-region.editing {
  box-shadow: 0 0 0 2px rgba(74, 158, 255, 0.4);
}

.face-tag-region.unidentified.highlighted,
.face-tag-region.unidentified.editing {
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

/* Resize handles — invisible hit targets on edges/corners */
.resize-handle {
  position: absolute;
  pointer-events: auto;
  opacity: 0;
}

.face-tag-region:hover .resize-handle,
.face-tag-region.editing .resize-handle {
  opacity: 1;
}

.handle-n { top: -6px; left: 12px; right: 12px; height: 12px; cursor: ns-resize; }
.handle-s { bottom: -6px; left: 12px; right: 12px; height: 12px; cursor: ns-resize; }
.handle-e { right: -6px; top: 12px; bottom: 12px; width: 12px; cursor: ew-resize; }
.handle-w { left: -6px; top: 12px; bottom: 12px; width: 12px; cursor: ew-resize; }
.handle-ne { top: -6px; right: -6px; width: 14px; height: 14px; cursor: nesw-resize; }
.handle-nw { top: -6px; left: -6px; width: 14px; height: 14px; cursor: nwse-resize; }
.handle-se { bottom: -6px; right: -6px; width: 14px; height: 14px; cursor: nwse-resize; }
.handle-sw { bottom: -6px; left: -6px; width: 14px; height: 14px; cursor: nesw-resize; }
</style>
