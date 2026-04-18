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
  const MIN_SIZE = 10;
  if (r.width < MIN_SIZE || r.height < MIN_SIZE) {
    drawStart.value = null;
    drawCurrent.value = null;
    return;
  }

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
