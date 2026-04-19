<template>
  <div class="chart-export-controls">
    <label class="field">
      <span class="field-label">{{ $t('chart.export.paperSize') }}</span>
      <select :value="paperSize" @change="onPaperChange">
        <option value="A4">A4</option>
        <option value="A3">A3</option>
        <option value="A2">A2</option>
        <option value="A1">A1</option>
        <option value="A0">A0</option>
      </select>
    </label>

    <label class="field">
      <span class="field-label">{{ $t('chart.export.orientation') }}</span>
      <select :value="orientation" @change="onOrientationChange">
        <option value="portrait">{{ $t('chart.export.portrait') }}</option>
        <option value="landscape">{{ $t('chart.export.landscape') }}</option>
      </select>
    </label>

    <label class="field">
      <span class="field-label">{{ $t('chart.export.colorMode') }}</span>
      <select :value="colorMode" @change="onColorChange">
        <option value="themed">{{ $t('chart.export.themed') }}</option>
        <option value="sex-colored">{{ $t('chart.export.sexColored') }}</option>
        <option value="bw">{{ $t('chart.export.blackWhite') }}</option>
      </select>
    </label>

    <div class="actions">
      <AppButton variant="secondary" size="sm" @click="$emit('saveSvg')">
        {{ $t('chart.export.saveSvg') }}
      </AppButton>
      <AppButton variant="secondary" size="sm" @click="$emit('savePdf')">
        {{ $t('chart.export.saveTiledPdf') }}
      </AppButton>
      <span v-if="tileCount" class="tile-hint">
        {{ $t('chart.export.tilesNeeded', { count: tileCount.count, cols: tileCount.cols, rows: tileCount.rows }) }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PaperSize, Orientation, ColorMode } from '../../api/chart-export';
import AppButton from './ui/AppButton.vue';

defineProps<{
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

function onPaperChange(e: Event) {
  emit('update:paperSize', (e.target as HTMLSelectElement).value as PaperSize);
}
function onOrientationChange(e: Event) {
  emit('update:orientation', (e.target as HTMLSelectElement).value as Orientation);
}
function onColorChange(e: Event) {
  emit('update:colorMode', (e.target as HTMLSelectElement).value as ColorMode);
}
</script>

<style scoped>
.chart-export-controls {
  display: flex;
  gap: var(--space-lg);
  align-items: flex-end;
  flex-wrap: wrap;
}
.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  font-size: var(--font-sm);
  font-weight: var(--font-weight-bold);
  color: var(--text-secondary);
  min-width: 120px;
}
.field select {
  padding: 6px 8px;
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  font-size: var(--font-base);
  font-family: inherit;
}
.actions {
  display: flex;
  gap: var(--space-sm);
  align-items: center;
}
.tile-hint {
  font-size: var(--font-xs);
  color: var(--text-muted);
  font-style: italic;
}
</style>
