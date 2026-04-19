<template>
  <span class="zoom-extra-sep">|</span>

  <span class="zoom-extra-label">{{ $t('chart.export.paperSize') }}</span>
  <select
    class="zoom-extra-select"
    :value="paperSize"
    :aria-label="$t('chart.export.paperSize')"
    @change="onPaperChange"
  >
    <option value="A4">A4</option>
    <option value="A3">A3</option>
    <option value="A2">A2</option>
    <option value="A1">A1</option>
    <option value="A0">A0</option>
  </select>

  <button
    class="zoom-extra-btn"
    :aria-label="`${$t('chart.export.orientation')}: ${orientation === 'portrait' ? $t('chart.export.portrait') : $t('chart.export.landscape')}`"
    @click="toggleOrientation"
  >
    {{ orientation === 'portrait' ? $t('chart.export.portrait') : $t('chart.export.landscape') }}
  </button>

  <button
    class="zoom-extra-btn"
    :aria-label="`${$t('chart.export.colorMode')}: ${colorModeLabel}`"
    @click="cycleColorMode"
  >
    {{ colorModeLabel }}
  </button>

  <span class="zoom-extra-sep">|</span>

  <button class="zoom-extra-btn" :aria-label="$t('chart.export.saveSvg')" @click="$emit('saveSvg')">
    {{ $t('chart.export.saveSvg') }}
  </button>
  <button class="zoom-extra-btn" :aria-label="$t('chart.export.saveTiledPdf')" @click="$emit('savePdf')">
    {{ $t('chart.export.saveTiledPdf') }}
  </button>

  <span v-if="tileCount" class="zoom-extra-label tile-hint">
    {{ $t('chart.export.tilesNeeded', { count: tileCount.count, cols: tileCount.cols, rows: tileCount.rows }) }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { PaperSize, Orientation, ColorMode } from '../../api/chart-export';

const props = defineProps<{
  paperSize: PaperSize;
  orientation: Orientation;
  colorMode: ColorMode;
  tileCount: { count: number; rows: number; cols: number } | null;
}>();

const emit = defineEmits<{
  'update:paperSize': [value: PaperSize];
  'update:orientation': [value: Orientation];
  'update:colorMode': [value: ColorMode];
  saveSvg: [];
  savePdf: [];
}>();

const { t } = useI18n();

function onPaperChange(e: Event) {
  emit('update:paperSize', (e.target as HTMLSelectElement).value as PaperSize);
}
function toggleOrientation() {
  emit('update:orientation', props.orientation === 'portrait' ? 'landscape' : 'portrait');
}
function cycleColorMode() {
  const order: ColorMode[] = ['themed', 'sex-colored', 'bw'];
  const idx = order.indexOf(props.colorMode);
  emit('update:colorMode', order[(idx + 1) % order.length]);
}
const colorModeLabel = computed(() => {
  if (props.colorMode === 'themed') return t('chart.export.themed');
  if (props.colorMode === 'sex-colored') return t('chart.export.sexColored');
  return t('chart.export.blackWhite');
});
</script>

<style scoped>
.zoom-extra-select {
  background: transparent;
  color: inherit;
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  padding: 2px 4px;
  font-size: var(--font-xs);
}
.tile-hint {
  opacity: 0.7;
  font-style: italic;
}
</style>
