<template>
  <BaseModal @close="$emit('close')" title-id="wall-chart-title">
    <div class="wall-chart-modal">
      <h3 id="wall-chart-title">{{ $t('wallChart.title') }}</h3>

      <div class="modal-body">
        <!-- Options panel -->
        <div class="options-panel">
          <!-- Chart Type -->
          <label>
            {{ $t('wallChart.chartType') }}
            <select v-model="options.chartType">
              <option value="pedigree">{{ $t('wallChart.pedigree') }}</option>
              <option value="descendant">{{ $t('wallChart.descendant') }}</option>
            </select>
          </label>

          <!-- Paper Size -->
          <label>
            {{ $t('wallChart.paperSize') }}
            <select v-model="options.paperSize">
              <option v-for="size in paperSizeOptions" :key="size.value" :value="size.value">{{ size.label }}</option>
            </select>
          </label>

          <!-- Custom dimensions (shown when paperSize === 'custom') -->
          <div v-if="options.paperSize === 'custom'" class="custom-dims">
            <label>
              {{ $t('wallChart.widthMm') }}
              <input type="number" v-model.number="options.customWidth" min="100" max="2000" />
            </label>
            <label>
              {{ $t('wallChart.heightMm') }}
              <input type="number" v-model.number="options.customHeight" min="100" max="2000" />
            </label>
          </div>

          <!-- Orientation -->
          <label>
            {{ $t('wallChart.orientation') }}
            <select v-model="options.orientation">
              <option value="portrait">{{ $t('wallChart.portrait') }}</option>
              <option value="landscape">{{ $t('wallChart.landscape') }}</option>
            </select>
          </label>

          <!-- Generations -->
          <label>
            {{ $t('reports.generations') }}: {{ options.generations }}
            <input type="range" v-model.number="options.generations" :min="genMin" :max="genMax" />
          </label>

          <!-- Content options -->
          <fieldset>
            <legend>{{ $t('wallChart.content') }}</legend>
            <label class="checkbox-label">
              <input type="checkbox" v-model="options.showDates" />
              {{ $t('wallChart.showDates') }}
            </label>
            <label class="checkbox-label">
              <input type="checkbox" v-model="options.showPlaces" />
              {{ $t('wallChart.showPlaces') }}
            </label>
            <label class="checkbox-label">
              <input type="checkbox" v-model="options.showPhotos" />
              {{ $t('wallChart.showPhotos') }}
            </label>
          </fieldset>

          <!-- Font Size -->
          <label>
            {{ $t('wallChart.fontSize') }}
            <select v-model="options.fontSize">
              <option value="small">{{ $t('wallChart.fontSmall') }}</option>
              <option value="medium">{{ $t('wallChart.fontMedium') }}</option>
              <option value="large">{{ $t('wallChart.fontLarge') }}</option>
            </select>
          </label>

          <!-- Color Mode -->
          <label>
            {{ $t('wallChart.colorMode') }}
            <select v-model="options.colorMode">
              <option value="themed">{{ $t('wallChart.themed') }}</option>
              <option value="bw">{{ $t('wallChart.blackWhite') }}</option>
              <option value="sex-colored">{{ $t('wallChart.sexColored') }}</option>
            </select>
          </label>

          <!-- Title -->
          <label>
            {{ $t('wallChart.chartTitle') }}
            <input type="text" v-model="options.title" />
          </label>
        </div>

        <!-- Preview panel -->
        <div class="preview-panel">
          <div v-if="generating" class="preview-loading">{{ $t('common.loading') }}</div>
          <div v-else-if="svgContent" class="preview-svg" v-html="svgContent"></div>
          <div v-else class="preview-empty">{{ $t('wallChart.noPreview') }}</div>
          <div v-if="tileInfo" class="tile-info">
            {{ $t('wallChart.tilesNeeded', { count: tileInfo.count, cols: tileInfo.cols, rows: tileInfo.rows }) }}
          </div>
        </div>
      </div>

      <div class="modal-actions">
        <button type="button" class="btn-cancel" @click="$emit('close')">{{ $t('common.cancel') }}</button>
        <AppButton variant="secondary" size="sm" :disabled="!svgContent" @click="exportSvg">
          {{ $t('wallChart.exportSvg') }}
        </AppButton>
        <AppButton variant="primary" size="sm" :disabled="!svgContent" @click="exportTiledPdf">
          {{ $t('wallChart.exportTiledPdf') }}
        </AppButton>
      </div>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseModal from '../BaseModal.vue';
import AppButton from '../ui/AppButton.vue';
import {
  generatePedigreeWallChart,
  generateDescendantWallChart,
  computeTileViewBoxes,
  generateTileSvg,
  getPaperDimensions,
  type WallChartOptions,
  type ChartType,
  type FontSizePreset,
  type ColorMode,
} from '../../../api/wall-charts';
import {
  fetchWallChartAncestorTree,
  fetchWallChartDescendantTree,
} from '../../utils/wallChartData';

declare const window: Window & {
  api: {
    wallChart: {
      saveSvg: (svgContent: string) => Promise<unknown>;
      saveTiledPdf: (pages: string[]) => Promise<unknown>;
    };
  };
};

const props = defineProps<{
  personId: string;
  personName: string;
  initialChartType?: ChartType;
}>();

const emit = defineEmits<{
  close: [];
}>();

const { t } = useI18n();

const options = reactive<WallChartOptions>({
  chartType: props.initialChartType ?? 'pedigree',
  paperSize: 'A2',
  customWidth: 420,
  customHeight: 594,
  orientation: 'landscape',
  generations: 4,
  showDates: true,
  showPlaces: true,
  showPhotos: false,
  fontSize: 'medium' as FontSizePreset,
  colorMode: 'sex-colored' as ColorMode,
  title: t('reports.pedigreeTitle', { name: props.personName }),
});

const svgContent = ref<string | null>(null);
const generating = ref(false);

const genMin = computed(() => options.chartType === 'pedigree' ? 3 : 2);
const genMax = computed(() => options.chartType === 'pedigree' ? 12 : 8);

const paperSizeOptions = [
  { value: 'A4', label: 'A4 (210 \u00d7 297 mm)' },
  { value: 'A3', label: 'A3 (297 \u00d7 420 mm)' },
  { value: 'A2', label: 'A2 (420 \u00d7 594 mm)' },
  { value: 'A1', label: 'A1 (594 \u00d7 841 mm)' },
  { value: 'A0', label: 'A0 (841 \u00d7 1189 mm)' },
  { value: 'custom', label: t('wallChart.custom') },
];

const tileInfo = computed(() => {
  if (!svgContent.value) return null;
  const paper = getPaperDimensions(options);
  const MM_TO_PX = 3.7795275591;
  const W = Math.round(paper.width * MM_TO_PX);
  const H = Math.round(paper.height * MM_TO_PX);
  const tiles = computeTileViewBoxes(W, H);
  if (tiles.length <= 1) return null;
  const maxRow = Math.max(...tiles.map(t => t.row)) + 1;
  const maxCol = Math.max(...tiles.map(t => t.col)) + 1;
  return { count: tiles.length, rows: maxRow, cols: maxCol };
});

async function generateChart() {
  generating.value = true;
  svgContent.value = null;
  try {
    if (options.chartType === 'pedigree') {
      const tree = await fetchWallChartAncestorTree(props.personId, options.generations);
      svgContent.value = generatePedigreeWallChart(tree, options);
    } else {
      const tree = await fetchWallChartDescendantTree(props.personId, options.generations);
      svgContent.value = generateDescendantWallChart(tree, options);
    }
  } catch (err) {
    console.error('Wall chart generation failed:', err);
  } finally {
    generating.value = false;
  }
}

// Debounced regeneration on options change
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
watch(
  () => ({ ...options }),
  () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(generateChart, 400);
  },
  { deep: true },
);

onMounted(generateChart);

async function exportSvg() {
  if (!svgContent.value) return;
  await window.api.wallChart.saveSvg(svgContent.value);
}

async function exportTiledPdf() {
  if (!svgContent.value) return;
  const paper = getPaperDimensions(options);
  const MM_TO_PX = 3.7795275591;
  const W = Math.round(paper.width * MM_TO_PX);
  const H = Math.round(paper.height * MM_TO_PX);
  const tiles = computeTileViewBoxes(W, H);

  if (tiles.length === 1) {
    // Single page — just save the full SVG as PDF
    await window.api.wallChart.saveTiledPdf([svgContent.value]);
  } else {
    const pages = tiles.map(tile => generateTileSvg(svgContent.value!, tile));
    await window.api.wallChart.saveTiledPdf(pages);
  }
}
</script>

<style scoped>
.wall-chart-modal {
  width: 900px;
  max-width: 95vw;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
}

.modal-body {
  display: flex;
  gap: var(--space-xl);
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.options-panel {
  width: 280px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  overflow-y: auto;
  padding-right: var(--space-sm);
}

.options-panel label {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  font-size: var(--font-sm);
  font-weight: var(--font-weight-bold);
  color: var(--text-secondary);
}

.options-panel select,
.options-panel input[type="text"],
.options-panel input[type="number"] {
  padding: 6px 8px;
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  font-size: var(--font-base);
  font-family: inherit;
}

.options-panel fieldset {
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  padding: var(--space-sm);
}

.options-panel legend {
  font-size: var(--font-sm);
  font-weight: var(--font-weight-bold);
  color: var(--text-secondary);
}

.checkbox-label {
  flex-direction: row !important;
  align-items: center;
  gap: var(--space-sm) !important;
  font-weight: normal !important;
}

.custom-dims {
  display: flex;
  gap: var(--space-sm);
}

.custom-dims label { flex: 1; }

.preview-panel {
  flex: 1;
  min-width: 0;
  background: var(--surface-bg);
  border-radius: var(--radius-sm);
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: auto;
}

.preview-svg {
  max-width: 100%;
  max-height: 100%;
}

.preview-svg :deep(svg) {
  max-width: 100%;
  max-height: 450px;
  height: auto;
  box-shadow: var(--shadow-md);
}

.preview-loading,
.preview-empty {
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.tile-info {
  margin-top: var(--space-sm);
  font-size: var(--font-xs);
  color: var(--text-muted);
}
</style>
