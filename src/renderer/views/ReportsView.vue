<template>
  <div class="reports-view export-scope">
    <div class="view-header">
      <h2>{{ $t('reports.title') }}</h2>
      <span v-if="reportLoading" class="running-hint">{{ $t('reports.loadingReport') }}</span>
    </div>

    <FilterChips
      :model-value="activeTab"
      :options="tabs.map(t => ({ value: t.id, label: t.label }))"
      @update:model-value="activeTab = $event as typeof activeTab"
    />

    <!-- Ancestor Sheet Tab -->
    <div v-if="activeTab === 'ancestor'" class="tab-content">
      <div class="tab-header">
        <div class="controls"></div>
        <div class="print-actions">
          <AppButton variant="primary" size="sm" :disabled="!ancestorRootId" @click="printCurrent">{{ $t('reports.print') }}</AppButton>
          <AppButton variant="secondary" size="sm" :disabled="!ancestorRootId" @click="exportPdf">{{ $t('reports.exportPdf') }}</AppButton>
        </div>
      </div>
      <div ref="previewContainer" class="preview-area">
        <div v-if="ancestorRootId" class="print-preview" :style="{ zoom: effectiveZoom }">
          <AncestorSheetReport :root-person-id="ancestorRootId" :generations="ancestorGenerations" />
        </div>
        <div v-else class="empty-hint">{{ $t('reports.selectPersonFirst') }}</div>
      </div>
    </div>

    <!-- Family Group Sheet Tab -->
    <div v-if="activeTab === 'family'" class="tab-content">
      <div class="tab-header">
        <div class="controls">
          <label>
            {{ $t('reports.couple') }}
            <select v-model="familyRelationshipId">
              <option value="" disabled>{{ $t('reports.selectCouple') }}</option>
              <option v-for="rel in coupleRelationships" :key="rel.id" :value="rel.id">
                {{ rel.label }}
              </option>
            </select>
          </label>
        </div>
        <div class="print-actions">
          <AppButton variant="primary" size="sm" :disabled="!familyRelationshipId" @click="printCurrent">{{ $t('reports.print') }}</AppButton>
          <AppButton variant="secondary" size="sm" :disabled="!familyRelationshipId" @click="exportPdf">{{ $t('reports.exportPdf') }}</AppButton>
        </div>
      </div>
      <div ref="previewContainer" class="preview-area">
        <div v-if="familyRelationshipId" class="print-preview" :style="{ zoom: effectiveZoom }">
          <FamilyGroupSheet :relationship-id="familyRelationshipId" />
        </div>
        <div v-else class="empty-hint">{{ $t('reports.selectCoupleFirst') }}</div>
      </div>
    </div>

    <!-- Individual Summary Tab -->
    <div v-if="activeTab === 'individual'" class="tab-content">
      <div class="tab-header">
        <div class="controls">
        </div>
        <div class="print-actions">
          <AppButton variant="primary" size="sm" :disabled="!individualPersonId" @click="printCurrent">{{ $t('reports.print') }}</AppButton>
          <AppButton variant="secondary" size="sm" :disabled="!individualPersonId" @click="exportPdf">{{ $t('reports.exportPdf') }}</AppButton>
        </div>
      </div>
      <div ref="previewContainer" class="preview-area">
        <div v-if="individualPersonId" class="print-preview" :style="{ zoom: effectiveZoom }">
          <IndividualSummary :person-id="individualPersonId" />
        </div>
        <div v-else class="empty-hint">{{ $t('reports.selectPersonFirst') }}</div>
      </div>
    </div>

    <!-- Ancestor Book Tab -->
    <div v-if="activeTab === 'ancestorBook'" class="tab-content">
      <div class="tab-header">
        <div class="controls">
          <label>
            {{ $t('wallChart.colorMode') }}
            <select v-model="fanColorMode">
              <option value="bw">{{ $t('wallChart.blackWhite') }}</option>
              <option value="branch">{{ $t('visualization.fanColorBranch') }}</option>
              <option value="sex">{{ $t('visualization.fanColorSex') }}</option>
            </select>
          </label>
        </div>
        <div class="print-actions">
          <AppButton variant="primary" size="sm" :disabled="!ancestorBookPersonId" @click="printCurrent">{{ $t('reports.print') }}</AppButton>
          <AppButton variant="secondary" size="sm" :disabled="!ancestorBookPersonId" @click="exportPdf">{{ $t('reports.exportPdf') }}</AppButton>
        </div>
      </div>
      <div ref="previewContainer" class="preview-area">
        <div v-if="ancestorBookPersonId" class="print-preview" :style="{ zoom: effectiveZoom }">
          <AncestorBookReport
            :person-id="ancestorBookPersonId"
            :fan-generations="fanGenerations"
            :fan-arc-span="fanArcSpan"
            :color-mode="fanColorMode"
          />
        </div>
        <div v-else class="empty-hint">{{ $t('reports.ancestorBook.noPersonSelected') }}</div>
      </div>
    </div>

    <!-- Person Biography Tab -->
    <div v-if="activeTab === 'biography'" class="tab-content">
      <div class="tab-header">
        <div class="controls"></div>
        <div class="print-actions">
          <AppButton variant="primary" size="sm" :disabled="!biographyPersonId" @click="printCurrent">{{ $t('reports.print') }}</AppButton>
          <AppButton variant="secondary" size="sm" :disabled="!biographyPersonId" @click="exportPdf">{{ $t('reports.exportPdf') }}</AppButton>
        </div>
      </div>
      <div ref="previewContainer" class="preview-area">
        <div v-if="biographyPersonId" class="print-preview" :style="{ zoom: effectiveZoom }">
          <PersonBiography :person-id="biographyPersonId" />
        </div>
        <div v-else class="empty-hint">{{ $t('reports.selectPersonFirst') }}</div>
      </div>
    </div>

    <!-- Place History Tab -->
    <div v-if="activeTab === 'placeHistory'" class="tab-content">
      <div class="tab-header">
        <div class="controls">
          <label>
            {{ $t('reports.place') }}
            <select v-model="placeHistoryPlaceId">
              <option value="" disabled>{{ $t('reports.selectPlace') }}</option>
              <option v-for="p in allPlaces" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </label>
        </div>
        <div class="print-actions">
          <AppButton variant="primary" size="sm" :disabled="!placeHistoryPlaceId" @click="printCurrent">{{ $t('reports.print') }}</AppButton>
          <AppButton variant="secondary" size="sm" :disabled="!placeHistoryPlaceId" @click="exportPdf">{{ $t('reports.exportPdf') }}</AppButton>
        </div>
      </div>
      <div ref="previewContainer" class="preview-area">
        <div v-if="placeHistoryPlaceId" class="print-preview" :style="{ zoom: effectiveZoom }">
          <PlaceHistory :place-id="placeHistoryPlaceId" />
        </div>
        <div v-else class="empty-hint">{{ $t('reports.selectPlaceFirst') }}</div>
      </div>
    </div>

    <!-- Family Narrative Tab -->
    <div v-if="activeTab === 'familyNarrative'" class="tab-content">
      <div class="tab-header">
        <div class="controls">
          <label>
            {{ $t('reports.couple') }}
            <select v-model="familyNarrativeRelId">
              <option value="" disabled>{{ $t('reports.selectCouple') }}</option>
              <option v-for="rel in coupleRelationships" :key="rel.id" :value="rel.id">{{ rel.label }}</option>
            </select>
          </label>
        </div>
        <div class="print-actions">
          <AppButton variant="primary" size="sm" :disabled="!familyNarrativeRelId" @click="printCurrent">{{ $t('reports.print') }}</AppButton>
          <AppButton variant="secondary" size="sm" :disabled="!familyNarrativeRelId" @click="exportPdf">{{ $t('reports.exportPdf') }}</AppButton>
        </div>
      </div>
      <div ref="previewContainer" class="preview-area">
        <div v-if="familyNarrativeRelId" class="print-preview" :style="{ zoom: effectiveZoom }">
          <FamilyNarrative :relationship-id="familyNarrativeRelId" />
        </div>
        <div v-else class="empty-hint">{{ $t('reports.selectCoupleFirst') }}</div>
      </div>
    </div>

    <!-- Pedigree Chart Tab -->
    <div v-if="activeTab === 'pedigreeChart'" class="tab-content">
      <div class="tab-header">
        <div class="controls"></div>
        <div class="print-actions">
          <AppButton variant="primary" size="sm" :disabled="!chartPersonId" @click="printCurrent">{{ $t('reports.print') }}</AppButton>
          <AppButton variant="secondary" size="sm" :disabled="!chartPersonId" @click="exportPdf">{{ $t('reports.exportPdf') }}</AppButton>
        </div>
      </div>
      <div ref="previewContainer" class="preview-area">
        <div v-if="chartPersonId" class="print-preview" :style="{ zoom: effectiveZoom }">
          <PedigreeChartReport :person-id="chartPersonId" />
        </div>
        <div v-else class="empty-hint">{{ $t('reports.selectPersonFirst') }}</div>
      </div>
    </div>

    <!-- Hourglass Chart Tab -->
    <div v-if="activeTab === 'hourglassChart'" class="tab-content">
      <div class="tab-header">
        <div class="controls"></div>
        <div class="print-actions">
          <AppButton variant="primary" size="sm" :disabled="!chartPersonId" @click="printCurrent">{{ $t('reports.print') }}</AppButton>
          <AppButton variant="secondary" size="sm" :disabled="!chartPersonId" @click="exportPdf">{{ $t('reports.exportPdf') }}</AppButton>
        </div>
      </div>
      <div ref="previewContainer" class="preview-area">
        <div v-if="chartPersonId" class="print-preview" :style="{ zoom: effectiveZoom }">
          <HourglassChartReport :person-id="chartPersonId" />
        </div>
        <div v-else class="empty-hint">{{ $t('reports.selectPersonFirst') }}</div>
      </div>
    </div>

    <!-- Descendant Chart Tab -->
    <div v-if="activeTab === 'descendantChart'" class="tab-content">
      <div class="tab-header">
        <div class="controls"></div>
        <div class="print-actions">
          <AppButton variant="primary" size="sm" :disabled="!chartPersonId" @click="printCurrent">{{ $t('reports.print') }}</AppButton>
          <AppButton variant="secondary" size="sm" :disabled="!chartPersonId" @click="exportPdf">{{ $t('reports.exportPdf') }}</AppButton>
        </div>
      </div>
      <div ref="previewContainer" class="preview-area">
        <div v-if="chartPersonId" class="print-preview" :style="{ zoom: effectiveZoom }">
          <DescendantChartReport :person-id="chartPersonId" />
        </div>
        <div v-else class="empty-hint">{{ $t('reports.selectPersonFirst') }}</div>
      </div>
    </div>

    <!-- Fan Chart Tab -->
    <div v-if="activeTab === 'fanChart'" class="tab-content">
      <div class="tab-header">
        <div class="controls">
          <label>
            {{ $t('wallChart.colorMode') }}
            <select v-model="fanColorMode">
              <option value="bw">{{ $t('wallChart.blackWhite') }}</option>
              <option value="branch">{{ $t('visualization.fanColorBranch') }}</option>
              <option value="sex">{{ $t('visualization.fanColorSex') }}</option>
            </select>
          </label>
        </div>
        <div class="print-actions">
          <AppButton variant="primary" size="sm" :disabled="!chartPersonId" @click="printCurrent">{{ $t('reports.print') }}</AppButton>
          <AppButton variant="secondary" size="sm" :disabled="!chartPersonId" @click="exportPdf">{{ $t('reports.exportPdf') }}</AppButton>
        </div>
      </div>
      <div ref="previewContainer" class="preview-area">
        <div v-if="chartPersonId" class="print-preview" :style="{ zoom: effectiveZoom }">
          <FanChartReport
            :person-id="chartPersonId"
            :generations="fanGenerations"
            :arc-span="fanArcSpan"
            :color-mode="fanColorMode"
          />
        </div>
        <div v-else class="empty-hint">{{ $t('reports.selectPersonFirst') }}</div>
      </div>
    </div>

    <!-- Timeline Tab -->
    <div v-if="activeTab === 'timeline'" class="tab-content">
      <div class="tab-header">
        <div class="controls"></div>
        <div class="print-actions">
          <AppButton variant="primary" size="sm" :disabled="!chartPersonId" @click="printCurrent">{{ $t('reports.print') }}</AppButton>
          <AppButton variant="secondary" size="sm" :disabled="!chartPersonId" @click="exportPdf">{{ $t('reports.exportPdf') }}</AppButton>
        </div>
      </div>
      <div ref="previewContainer" class="preview-area">
        <div v-if="chartPersonId" class="print-preview" :style="{ zoom: effectiveZoom }">
          <TimelineChartReport :person-id="chartPersonId" />
        </div>
        <div v-else class="empty-hint">{{ $t('reports.selectPersonFirst') }}</div>
      </div>
    </div>

    <!-- Wall Chart Tab -->
    <div v-if="activeTab === 'wallChart'" class="tab-content">
      <div class="tab-header">
        <div class="controls wall-chart-controls">
          <label class="control-narrow">
            {{ $t('wallChart.chartType') }}
            <select v-model="wallOptions.chartType">
              <option value="pedigree">{{ $t('wallChart.pedigree') }}</option>
              <option value="descendant">{{ $t('wallChart.descendant') }}</option>
            </select>
          </label>
          <label class="control-narrow">
            {{ $t('wallChart.paperSize') }}
            <select v-model="wallOptions.paperSize">
              <option v-for="size in paperSizeOptions" :key="size.value" :value="size.value">{{ size.label }}</option>
            </select>
          </label>
          <label v-if="wallOptions.paperSize === 'custom'" class="control-narrow">
            {{ $t('wallChart.widthMm') }}
            <input type="number" v-model.number="wallOptions.customWidth" min="100" max="2000" />
          </label>
          <label v-if="wallOptions.paperSize === 'custom'" class="control-narrow">
            {{ $t('wallChart.heightMm') }}
            <input type="number" v-model.number="wallOptions.customHeight" min="100" max="2000" />
          </label>
          <label class="control-narrow">
            {{ $t('wallChart.orientation') }}
            <select v-model="wallOptions.orientation">
              <option value="portrait">{{ $t('wallChart.portrait') }}</option>
              <option value="landscape">{{ $t('wallChart.landscape') }}</option>
            </select>
          </label>
          <label class="control-narrow">
            {{ $t('reports.generations') }}: {{ wallOptions.generations }}
            <input type="range" v-model.number="wallOptions.generations" :min="genMin" :max="genMax" />
          </label>
          <label class="control-narrow">
            {{ $t('wallChart.fontSize') }}
            <select v-model="wallOptions.fontSize">
              <option value="small">{{ $t('wallChart.fontSmall') }}</option>
              <option value="medium">{{ $t('wallChart.fontMedium') }}</option>
              <option value="large">{{ $t('wallChart.fontLarge') }}</option>
            </select>
          </label>
          <label class="control-narrow">
            {{ $t('wallChart.colorMode') }}
            <select v-model="wallOptions.colorMode">
              <option value="themed">{{ $t('wallChart.themed') }}</option>
              <option value="bw">{{ $t('wallChart.blackWhite') }}</option>
              <option value="sex-colored">{{ $t('wallChart.sexColored') }}</option>
            </select>
          </label>
          <fieldset class="content-fieldset">
            <legend>{{ $t('wallChart.content') }}</legend>
            <label class="checkbox-label"><input type="checkbox" v-model="wallOptions.showDates" /> {{ $t('wallChart.showDates') }}</label>
            <label class="checkbox-label"><input type="checkbox" v-model="wallOptions.showPlaces" /> {{ $t('wallChart.showPlaces') }}</label>
            <label class="checkbox-label"><input type="checkbox" v-model="wallOptions.showPhotos" /> {{ $t('wallChart.showPhotos') }}</label>
          </fieldset>
          <label class="control-wide">
            {{ $t('wallChart.chartTitle') }}
            <input type="text" :value="wallOptions.title" @input="onTitleInput" />
          </label>
        </div>
        <div class="print-actions">
          <AppButton variant="secondary" size="sm" :disabled="!chartPersonId || !currentSvg" @click="exportWallSvg">{{ $t('wallChart.exportSvg') }}</AppButton>
          <AppButton variant="primary" size="sm" :disabled="!chartPersonId || !currentSvg" @click="exportWallPdf">{{ $t('wallChart.exportTiledPdf') }}</AppButton>
        </div>
      </div>
      <div ref="previewContainer" class="preview-area">
        <div v-if="chartPersonId" class="print-preview wall-chart-preview" :style="{ zoom: effectiveZoom, width: paperWidthMm, height: paperHeightMm }">
          <WallChartReport
            :person-id="chartPersonId"
            :options="wallOptions"
            @svg-generated="onWallSvgGenerated"
            @tiles-changed="onWallTilesChanged"
          />
        </div>
        <div v-else class="empty-hint">{{ $t('reports.selectPersonFirst') }}</div>
      </div>
      <div v-if="wallTileInfo" class="tile-info-hint">
        {{ $t('wallChart.tilesNeeded', { count: wallTileInfo.count, cols: wallTileInfo.cols, rows: wallTileInfo.rows }) }}
      </div>
    </div>

    <ZoomControls :zoom="effectiveZoom" :show-fit="true" @zoom-in="zoomIn" @zoom-out="zoomOut" @reset="resetZoom">
      <template v-if="activeTab === 'ancestor'">
        <span class="zoom-extra-label">{{ $t('reports.generations') }}</span>
        <button class="zoom-extra-btn" :disabled="ancestorGenerations <= 3" @click="ancestorGenerations--">−</button>
        <span class="zoom-extra-value">{{ ancestorGenerations }}</span>
        <button class="zoom-extra-btn" :disabled="ancestorGenerations >= 5" @click="ancestorGenerations++">+</button>
      </template>
      <template v-if="activeTab === 'ancestorBook' || activeTab === 'fanChart'">
        <span class="zoom-extra-label">{{ $t('visualization.fan.arc') }}</span>
        <button
          v-for="span in fanArcOptions"
          :key="span"
          class="zoom-extra-btn"
          :class="{ active: fanArcSpan === span }"
          @click="fanArcSpan = span"
        >{{ span }}°</button>
        <span class="zoom-extra-sep">|</span>
        <span class="zoom-extra-label">{{ $t('reports.generations') }}</span>
        <button class="zoom-extra-btn" :disabled="fanGenerations <= 1" @click="fanGenerations--">−</button>
        <span class="zoom-extra-value">{{ fanGenerations }}</span>
        <button class="zoom-extra-btn" :disabled="fanGenerations >= 8" @click="fanGenerations++">+</button>
      </template>
      <template v-if="activeTab === 'pedigreeChart'">
        <span class="zoom-extra-label">{{ $t('reports.generations') }}</span>
        <button class="zoom-extra-btn" :disabled="pedigreeGenerations <= 1" @click="pedigreeGenerations--">−</button>
        <span class="zoom-extra-value">{{ pedigreeGenerations }}</span>
        <button class="zoom-extra-btn" @click="pedigreeGenerations++">+</button>
      </template>
      <template v-if="activeTab === 'hourglassChart'">
        <span class="zoom-extra-label">{{ $t('reports.generations') }}</span>
        <button class="zoom-extra-btn" :disabled="hourglassGenerations <= 1" @click="hourglassGenerations--">−</button>
        <span class="zoom-extra-value">{{ hourglassGenerations }}</span>
        <button class="zoom-extra-btn" @click="hourglassGenerations++">+</button>
      </template>
      <template v-if="activeTab === 'descendantChart'">
        <span class="zoom-extra-label">{{ $t('reports.generations') }}</span>
        <button class="zoom-extra-btn" :disabled="descendantGenerations <= 1" @click="descendantGenerations--">−</button>
        <span class="zoom-extra-value">{{ descendantGenerations }}</span>
        <button class="zoom-extra-btn" @click="descendantGenerations++">+</button>
      </template>
      <template v-if="activeTab === 'timeline'">
        <span class="zoom-extra-label">{{ $t('reports.generations') }}</span>
        <button class="zoom-extra-btn" :disabled="timelineGenerations <= 1" @click="timelineGenerations--">−</button>
        <span class="zoom-extra-value">{{ timelineGenerations }}</span>
        <button class="zoom-extra-btn" @click="timelineGenerations++">+</button>
      </template>
    </ZoomControls>

  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import AppButton from '../components/ui/AppButton.vue';
import FilterChips from '../components/ui/FilterChips.vue';
import AncestorSheetReport from '../components/reports/AncestorSheetReport.vue';
import { useFocusStore } from '../stores/focus';
import FamilyGroupSheet from '../components/reports/FamilyGroupSheet.vue';
import IndividualSummary from '../components/reports/IndividualSummary.vue';
import AncestorBookReport from '../components/reports/AncestorBookReport.vue';
import PersonBiography from '../components/reports/PersonBiography.vue';
import PlaceHistory from '../components/reports/PlaceHistory.vue';
import FamilyNarrative from '../components/reports/FamilyNarrative.vue';
import PedigreeChartReport from '../components/reports/PedigreeChartReport.vue';
import HourglassChartReport from '../components/reports/HourglassChartReport.vue';
import DescendantChartReport from '../components/reports/DescendantChartReport.vue';
import FanChartReport from '../components/reports/FanChartReport.vue';
import type { ArcSpan } from '../utils/fanLayout';
import TimelineChartReport from '../components/reports/TimelineChartReport.vue';
import WallChartReport from '../components/reports/WallChartReport.vue';
import {
  computeTileViewBoxes,
  generateTileSvg,
  getPaperDimensions,
  type WallChartOptions,
  type FontSizePreset,
  type ColorMode,
} from '../../api/wall-charts';
import ZoomControls from '../components/ZoomControls.vue';
import {
  pedigreeGenerations,
  hourglassGenerations,
  descendantGenerations,
  timelineGenerations,
  fanGenerations,
} from '../composables/useChartGenerations';

interface RelationshipOption { id: string; label: string; }

const { t } = useI18n();
const route = useRoute();

const focusStore = useFocusStore();

const activeTab = ref<'ancestor' | 'family' | 'individual' | 'ancestorBook' | 'biography' | 'placeHistory' | 'familyNarrative' | 'pedigreeChart' | 'hourglassChart' | 'descendantChart' | 'fanChart' | 'timeline' | 'wallChart'>('ancestor');
const reportLoading = ref(false);
const tabs = computed(() => [
  { id: 'ancestor', label: t('reports.tabAncestor') },
  { id: 'family', label: t('reports.tabFamily') },
  { id: 'individual', label: t('reports.tabIndividual') },
  { id: 'ancestorBook', label: t('reports.tabAncestorBook') },
  { id: 'biography', label: t('reports.tabBiography') },
  { id: 'placeHistory', label: t('reports.tabPlaceHistory') },
  { id: 'familyNarrative', label: t('reports.tabFamilyNarrative') },
  { id: 'pedigreeChart', label: t('reports.tabPedigreeChart') },
  { id: 'hourglassChart', label: t('reports.tabHourglassChart') },
  { id: 'descendantChart', label: t('reports.tabDescendantChart') },
  { id: 'fanChart', label: t('reports.tabFanChart') },
  { id: 'timeline', label: t('reports.tabTimeline') },
  { id: 'wallChart', label: t('wallChart.tabWallChart') },
]);

const ancestorRootId = computed(() => focusStore.personId);
const ancestorGenerations = ref(4);
const familyRelationshipId = ref('');
const coupleRelationships = ref<RelationshipOption[]>([]);
const individualPersonId = computed(() => focusStore.personId);
const ancestorBookPersonId = computed(() => focusStore.personId);
const biographyPersonId = computed(() => focusStore.personId);
const placeHistoryPlaceId = ref('');
const familyNarrativeRelId = ref('');
const fanArcSpan = ref<ArcSpan>(360);
const fanArcOptions: ArcSpan[] = [180, 210, 240, 270, 360];
const fanColorMode = ref<'branch' | 'sex' | 'bw'>('bw');
const allPlaces = ref<Array<{ id: string; name: string }>>([]);

// --- Wall chart state ---
const wallOptions = reactive<WallChartOptions>({
  chartType: 'pedigree',
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
  title: '',
});
const currentSvg = ref<string | null>(null);
const wallTileInfo = ref<{ count: number; rows: number; cols: number } | null>(null);
const titleIsAutoGenerated = ref(true);

const paperSizeOptions = computed(() => [
  { value: 'A4', label: 'A4 (210 \u00d7 297 mm)' },
  { value: 'A3', label: 'A3 (297 \u00d7 420 mm)' },
  { value: 'A2', label: 'A2 (420 \u00d7 594 mm)' },
  { value: 'A1', label: 'A1 (594 \u00d7 841 mm)' },
  { value: 'A0', label: 'A0 (841 \u00d7 1189 mm)' },
  { value: 'custom', label: t('wallChart.custom') },
]);

const genMin = computed(() => wallOptions.chartType === 'pedigree' ? 3 : 2);
const genMax = computed(() => wallOptions.chartType === 'pedigree' ? 12 : 8);

const wallPaperDims = computed(() => getPaperDimensions(wallOptions));
const paperWidthMm  = computed(() => `${wallPaperDims.value.width}mm`);
const paperHeightMm = computed(() => `${wallPaperDims.value.height}mm`);

function onWallSvgGenerated(svg: string) {
  currentSvg.value = svg;
}
function onWallTilesChanged(tiles: { count: number; rows: number; cols: number } | null) {
  wallTileInfo.value = tiles;
}
function onTitleInput(event: Event) {
  const target = event.target as HTMLInputElement;
  wallOptions.title = target.value;
  titleIsAutoGenerated.value = false;
}

async function exportWallSvg() {
  if (!currentSvg.value) return;
  await (window.api as any).wallChart.saveSvg(currentSvg.value);
}

async function exportWallPdf() {
  if (!currentSvg.value) return;
  const paper = wallPaperDims.value;
  const MM_TO_PX = 3.7795275591;
  const W = Math.round(paper.width * MM_TO_PX);
  const H = Math.round(paper.height * MM_TO_PX);
  const tiles = computeTileViewBoxes(W, H);
  if (tiles.length === 1) {
    await (window.api as any).wallChart.saveTiledPdf([currentSvg.value]);
  } else {
    const pages = tiles.map(tile => generateTileSvg(currentSvg.value!, tile));
    await (window.api as any).wallChart.saveTiledPdf(pages);
  }
}

// --- Zoom ---
// Natural preview width in px (A4 at 96dpi ≈ 794px).
// The .print-preview has width: 210mm which Chromium renders as ~794px.
const A4_NATURAL_WIDTH = 794;
const naturalWidth = computed(() => {
  if (activeTab.value === 'wallChart') {
    return Math.round(wallPaperDims.value.width * 3.7795275591);
  }
  return A4_NATURAL_WIDTH;
});
const previewContainer = ref<HTMLElement | null>(null);
const fitZoom = ref(1.0);
const userZoomDelta = ref(0.0); // offset from fit zoom in 0.1 steps

const effectiveZoom = computed(() => Math.max(0.2, fitZoom.value + userZoomDelta.value));

function zoomIn()   { userZoomDelta.value = Math.round((userZoomDelta.value + 0.1) * 10) / 10; }
function zoomOut()  { userZoomDelta.value = Math.round((userZoomDelta.value - 0.1) * 10) / 10; }
function resetZoom(){ userZoomDelta.value = 0; }

let ro: ResizeObserver | null = null;

watch(previewContainer, (el) => {
  if (ro) { ro.disconnect(); ro = null; }
  if (!el) return;
  const update = () => {
    const w = el.clientWidth - 48; // subtract preview-area padding
    if (w > 0) fitZoom.value = w / naturalWidth.value;
  };
  ro = new ResizeObserver(update);
  ro.observe(el);
  update();
});

// Reset user delta when switching tabs so new tab auto-fits
watch(activeTab, () => { userZoomDelta.value = 0; });

// Recompute fit when paper size or orientation changes
watch(naturalWidth, () => {
  userZoomDelta.value = 0;
  const el = previewContainer.value;
  if (!el) return;
  const w = el.clientWidth - 48;
  if (w > 0) fitZoom.value = w / naturalWidth.value;
});

// Show loading hint when report inputs change
function triggerLoading() {
  reportLoading.value = true;
  nextTick(() => setTimeout(() => { reportLoading.value = false; }, 800));
}
const chartPersonId = computed(() => focusStore.personId);

watch(activeTab, triggerLoading);
watch(ancestorRootId, triggerLoading);
watch(individualPersonId, triggerLoading);
watch(ancestorBookPersonId, triggerLoading);
watch(biographyPersonId, triggerLoading);
watch(placeHistoryPlaceId, triggerLoading);
watch(familyNarrativeRelId, triggerLoading);
watch(chartPersonId, triggerLoading);
watch(() => focusStore.personName, (name) => {
  if (name && titleIsAutoGenerated.value) {
    wallOptions.title = t('reports.pedigreeTitle', { name });
  }
});

onUnmounted(() => { if (ro) ro.disconnect(); });

// --- Data ---
async function getPersonName(id: string | null): Promise<string> {
  if (!id || !window.api) return '?';
  try {
    const names = (await window.api.persons.getNames(id)) as Array<{ given_name: string | null; surname: string | null; preferred_name: string | null }>;
    if (names.length > 0) {
      const n = names[0];
      const first = n.preferred_name ?? n.given_name?.split(' ')[0] ?? '';
      return [first, n.surname].filter(Boolean).join(' ') || '?';
    }
  } catch { /* ignore */ }
  return '?';
}

onMounted(async () => {
  if (!window.api) return;
  const [rels, places] = await Promise.all([
    window.api.relationships.list() as Promise<Array<{
      id: string; type: string;
      person1_id: string | null;
      person2_id: string | null;
    }>>,
    window.api.places.list() as Promise<Array<{ id: string; name: string }>>,
  ]);
  allPlaces.value = places.sort((a, b) => a.name.localeCompare(b.name));

  const couples = rels.filter(r => r.type === 'couple');
  const options: RelationshipOption[] = [];
  for (const r of couples) {
    const name1 = await getPersonName(r.person1_id);
    const name2 = await getPersonName(r.person2_id);
    options.push({ id: r.id, label: `${name1} & ${name2}` });
  }
  coupleRelationships.value = options;

  // Default wall chart title from focal person
  if (focusStore.personId && focusStore.personName) {
    wallOptions.title = t('reports.pedigreeTitle', { name: focusStore.personName });
  }

  // Default to first couple relationship involving the focus person
  if (focusStore.personId) {
    const focusCouple = couples.find(r => r.person1_id === focusStore.personId || r.person2_id === focusStore.personId);
    if (focusCouple) {
      familyRelationshipId.value = focusCouple.id;
      familyNarrativeRelId.value = focusCouple.id;
    }

    // Default place to birth place of focus person
    try {
      const events = await window.api.events.forPerson(focusStore.personId) as Array<{ event_type: string; place_id: string | null }>;
      const birth = events.find(e => e.event_type === 'birth' && e.place_id);
      if (birth?.place_id && places.some(p => p.id === birth.place_id)) {
        placeHistoryPlaceId.value = birth.place_id;
      }
    } catch { /* ignore */ }
  }

  // Read query params for deep linking (e.g. /reports?tab=biography)
  const tabParam = route.query.tab as string | undefined;
  const validTabs = ['ancestor', 'family', 'individual', 'ancestorBook', 'biography', 'placeHistory', 'familyNarrative', 'pedigreeChart', 'hourglassChart', 'descendantChart', 'fanChart', 'timeline', 'wallChart'];
  if (tabParam && validTabs.includes(tabParam)) {
    activeTab.value = tabParam as typeof activeTab.value;
  }
  if (route.query.placeId) {
    placeHistoryPlaceId.value = route.query.placeId as string;
  }
  if (route.query.relationshipId) {
    familyNarrativeRelId.value = route.query.relationshipId as string;
  }
});

async function printCurrent() {
  await window.api.print.print();
}

async function exportPdf() {
  await window.api.print.exportPdf();
}

</script>

<style scoped>
.reports-view {
  display: flex;
  flex-direction: column;
  /* No max-width — uses full available width */
}
.view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-lg);
}
.view-header h2 { margin: 0; }
.tab-content { display: flex; flex-direction: column; gap: var(--space-md); }

.tab-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: var(--space-lg);
  flex-wrap: wrap;
}
.controls { display: flex; gap: var(--space-lg); flex-wrap: wrap; align-items: center; }
.controls label {
  display: flex; flex-direction: column; gap: var(--space-xs);
  font-size: var(--font-sm); font-weight: var(--font-weight-bold); color: var(--text-secondary); min-width: 200px;
}
.controls select {
  padding: 6px 8px; border: 1px solid var(--surface-border); border-radius: var(--radius-sm); font-size: var(--font-base); font-family: inherit;
}
.print-actions { display: flex; gap: var(--space-sm); align-items: center; }

/* Preview area: grey background with scrollable paper preview */
.preview-area {
  position: relative;
  background: var(--surface-bg);
  padding: var(--space-xl);
  border-radius: var(--radius-sm);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  overflow: auto;
  min-height: 300px;
}
.print-preview {
  background: white;
  width: 210mm;
  min-height: 297mm;
  padding: 20mm;
  box-shadow: var(--shadow-lg);
  transform-origin: top center;
  flex-shrink: 0;
}
@media print {
  .view-header, .tab-bar, .tab-header, .zoom-controls-bar { display: none !important; }
  .preview-area { background: none; padding: 0; min-height: auto; border-radius: 0; }
  .print-preview { zoom: 1 !important; box-shadow: none; min-height: auto; }
}

/* Wall chart-specific controls — denser layout than other report tabs */
.wall-chart-controls .control-narrow { min-width: 140px; }
.wall-chart-controls .control-wide   { min-width: 240px; flex: 1 1 240px; }
.wall-chart-controls .content-fieldset {
  display: flex;
  flex-direction: column;
  gap: 4px;
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  padding: 6px 10px;
  margin: 0;
}
.wall-chart-controls .content-fieldset legend {
  font-size: var(--font-xs);
  font-weight: var(--font-weight-bold);
  color: var(--text-secondary);
  padding: 0 4px;
}
.wall-chart-controls .checkbox-label {
  flex-direction: row !important;
  align-items: center;
  gap: var(--space-sm) !important;
  font-weight: normal !important;
  min-width: 0 !important;
}
.wall-chart-preview {
  /* Override the fixed A4 width from .print-preview — width is set inline */
  padding: 0 !important;
  min-height: 0 !important;
}
.tile-info-hint {
  text-align: center;
  margin-top: var(--space-xs);
  font-size: var(--font-xs);
  color: var(--text-muted);
}
</style>
