<template>
  <div class="reports-view">
    <div class="view-header">
      <h2>{{ $t('reports.title') }}</h2>
      <span v-if="reportLoading" class="running-hint">{{ $t('reports.loadingReport') }}</span>
    </div>

    <div class="tab-groups">
      <div class="tab-group">
        <h3 class="tab-group-label">{{ $t('reports.groups.keepsake') }}</h3>
        <FilterChips
          :model-value="activeTab"
          :options="keepsakeTabs"
          @update:model-value="activeTab = $event as typeof activeTab"
        />
      </div>
      <div class="tab-group">
        <h3 class="tab-group-label">{{ $t('reports.groups.framablePrints') }}</h3>
        <FilterChips
          :model-value="activeTab"
          :options="framableTabs"
          @update:model-value="activeTab = $event as typeof activeTab"
        />
      </div>
    </div>

    <div class="reports-body">

      <ReportPanel
        :active-tab="activeTab"
        :couple-relationships="coupleRelationships"
        :tile-count-info="chartTileCount"
        @print="printCurrent"
        @export-pdf="exportPdf"
        @save-svg="saveChartSvg"
        @save-chart-pdf="saveChartPdf"
      />

      <div class="preview-wrapper">

      <!-- Your Ancestors Tab -->
      <div v-if="activeTab === 'yourAncestors'" class="tab-content">
        <div ref="previewContainer" class="preview-area">
          <div v-if="store.personId" class="print-preview" :style="{ zoom: effectiveZoom }">
            <YourAncestorsReport
              :person-id="store.personId"
              :generations="store.yourAncestorsGenerations"
              :color-mode="store.yourAncestorsColorMode"
              :density="store.yourAncestorsDensity"
              :show-events="store.yourAncestorsShowEvents"
              :show-life-map="store.yourAncestorsShowLifeMap"
              :show-extra-photos="store.yourAncestorsShowExtraPhotos"
              :show-sources="store.yourAncestorsShowSources"
              :redact-living="store.redactLiving"
            />
          </div>
          <div v-else class="empty-hint">{{ $t('reports.selectPersonFirst') }}</div>
        </div>
      </div>

      <!-- A Life Tab -->
      <div v-if="activeTab === 'alife'" class="tab-content">
        <div ref="previewContainer" class="preview-area">
          <div v-if="store.personId" class="print-preview" :style="{ zoom: effectiveZoom }">
            <ALifeReport
              :person-id="store.personId"
              :show-life-map="store.aLifeShowLifeMap"
              :show-photos="store.aLifeShowPhotos"
              :show-documents="store.aLifeShowDocuments"
              :show-sources="store.aLifeShowSources"
              :show-notes="store.aLifeShowNotes"
              :show-media-captions="store.aLifeShowMediaCaptions"
              :redact-living="store.redactLiving"
            />
          </div>
          <div v-else class="empty-hint">{{ $t('reports.selectPersonFirst') }}</div>
        </div>
      </div>

      <!-- Life on One Page Tab -->
      <div v-if="activeTab === 'onePage'" class="tab-content">
        <div ref="previewContainer" class="preview-area">
          <div v-if="store.personId" class="print-preview" :class="'preview-' + store.onePageOrientation" :style="{ zoom: effectiveZoom }">
            <LifeOnOnePageReport
              :person-id="store.personId"
              :orientation="store.onePageOrientation"
              :show-life-map="store.onePageShowLifeMap"
              :redact-living="store.redactLiving"
            />
          </div>
          <div v-else class="empty-hint">{{ $t('reports.selectPersonFirst') }}</div>
        </div>
      </div>

      <!-- Family in Year X Tab -->
      <div v-if="activeTab === 'familyInYear'" class="tab-content">
        <div ref="previewContainer" class="preview-area">
          <div v-if="store.familyInYearYear" class="print-preview" :style="{ zoom: effectiveZoom }">
            <FamilyInYearReport
              :year="store.familyInYearYear"
              :scope="store.familyInYearScope"
              :scope-person-id="store.personId"
              :redact-living="store.redactLiving"
            />
          </div>
          <div v-else class="empty-hint">{{ $t('reports.familyInYear.year') }}</div>
        </div>
      </div>

      <!-- Photo Album Tab -->
      <div v-if="activeTab === 'photoAlbum'" class="tab-content">
        <div ref="previewContainer" class="preview-area">
          <div v-if="store.photoAlbumCanRender" class="print-preview" :style="{ zoom: effectiveZoom }">
            <PhotoAlbumReport
              :subject-type="store.photoAlbumSubjectType"
              :subject-id="store.photoAlbumSubjectId"
              :per-page="store.photoAlbumPerPage"
              :show-captions="store.photoAlbumShowCaptions"
              :show-index="store.photoAlbumShowIndex"
              :include-documents="store.photoAlbumIncludeDocuments"
            />
          </div>
          <div v-else-if="store.photoAlbumSubjectType === 'person'" class="empty-hint">{{ $t('reports.selectPersonFirst') }}</div>
          <div v-else-if="store.photoAlbumSubjectType === 'relationship'" class="empty-hint">{{ $t('reports.selectCoupleFirst') }}</div>
          <div v-else-if="store.photoAlbumSubjectType === 'place'" class="empty-hint">{{ $t('reports.selectPlaceFirst') }}</div>
        </div>
      </div>

      <!-- Place Chronicle Tab -->
      <div v-if="activeTab === 'placeChronicle'" class="tab-content">
        <div ref="previewContainer" class="preview-area">
          <div v-if="store.placeChroniclePlaceId" class="print-preview" :style="{ zoom: effectiveZoom }">
            <PlaceChronicleReport
              :place-id="store.placeChroniclePlaceId"
              :show-boundary="store.placeChronicleShowBoundary"
              :show-child-places="store.placeChronicleShowChildPlaces"
              :show-photos="store.placeChronicleShowPhotos"
              :show-notes="store.placeChronicleShowNotes"
              :show-sources="store.placeChronicleShowSources"
              :show-media-captions="store.placeChronicleShowMediaCaptions"
            />
          </div>
          <div v-else class="empty-hint">{{ $t('reports.selectPlaceFirst') }}</div>
        </div>
      </div>

      <!-- A Marriage Tab -->
      <div v-if="activeTab === 'amarriage'" class="tab-content">
        <div ref="previewContainer" class="preview-area">
          <div v-if="store.aMarriageRelId" class="print-preview" :style="{ zoom: effectiveZoom }">
            <AMarriageReport
              :relationship-id="store.aMarriageRelId"
              :show-life-map="store.aMarriageShowLifeMap"
              :show-photos="store.aMarriageShowPhotos"
              :show-notes="store.aMarriageShowNotes"
              :show-sources="store.aMarriageShowSources"
              :show-media-captions="store.aMarriageShowMediaCaptions"
              :redact-living="store.redactLiving"
            />
          </div>
          <div v-else class="empty-hint">{{ $t('reports.selectCoupleFirst') }}</div>
        </div>
      </div>

      <!-- Pedigree Print Tab -->
      <div v-if="activeTab === 'pedigreePrint'" class="tab-content">
        <div ref="previewContainer" class="preview-area">
          <div v-if="store.personId" class="print-preview" :style="{ zoom: effectiveZoom }">
            <PedigreeChartReport :person-id="store.personId" :color-mode="store.chartColorMode" />
          </div>
          <div v-else class="empty-hint">{{ $t('reports.selectPersonFirst') }}</div>
        </div>
      </div>

      <!-- Hourglass Chart Tab -->
      <div v-if="activeTab === 'hourglassChart'" class="tab-content">
        <div ref="previewContainer" class="preview-area">
          <div v-if="store.personId" class="print-preview" :style="{ zoom: effectiveZoom }">
            <HourglassChartReport :person-id="store.personId" :color-mode="store.chartColorMode" />
          </div>
          <div v-else class="empty-hint">{{ $t('reports.selectPersonFirst') }}</div>
        </div>
      </div>

      <!-- Descendant Chart Tab -->
      <div v-if="activeTab === 'descendantChart'" class="tab-content">
        <div ref="previewContainer" class="preview-area">
          <div v-if="store.personId" class="print-preview" :style="{ zoom: effectiveZoom }">
            <DescendantChartReport :person-id="store.personId" :color-mode="store.chartColorMode" />
          </div>
          <div v-else class="empty-hint">{{ $t('reports.selectPersonFirst') }}</div>
        </div>
      </div>

      <!-- Fan Chart Tab -->
      <div v-if="activeTab === 'fanChart'" class="tab-content">
        <div ref="previewContainer" class="preview-area">
          <div v-if="store.personId" class="print-preview" :style="{ zoom: effectiveZoom }">
            <FanChartReport
              :person-id="store.personId"
              :generations="fanGenerations"
              :arc-span="store.fanArcSpan"
              :color-mode="store.fanColorMode"
            />
          </div>
          <div v-else class="empty-hint">{{ $t('reports.selectPersonFirst') }}</div>
        </div>
      </div>

      <!-- Timeline Tab -->
      <div v-if="activeTab === 'timeline'" class="tab-content">
        <div ref="previewContainer" class="preview-area">
          <div v-if="store.personId" class="print-preview" :style="{ zoom: effectiveZoom }">
            <TimelineChartReport :person-id="store.personId" />
          </div>
          <div v-else class="empty-hint">{{ $t('reports.selectPersonFirst') }}</div>
        </div>
      </div>

      <ZoomControls :zoom="effectiveZoom" :show-fit="true" :overlay="true" @zoom-in="zoomIn" @zoom-out="zoomOut" @reset="resetZoom" />

      </div><!-- .preview-wrapper -->
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import FilterChips from '../components/ui/FilterChips.vue';
import { useFocusStore } from '../stores/focus';
import { useReportConfigStore } from '../stores/reportConfig';
import ReportPanel from '../components/ReportPanel.vue';
import YourAncestorsReport from '../components/reports/YourAncestorsReport.vue';
import ALifeReport from '../components/reports/ALifeReport.vue';
import LifeOnOnePageReport from '../components/reports/LifeOnOnePageReport.vue';
import FamilyInYearReport from '../components/reports/FamilyInYearReport.vue';
import PhotoAlbumReport from '../components/reports/PhotoAlbumReport.vue';
import PlaceChronicleReport from '../components/reports/PlaceChronicleReport.vue';
import AMarriageReport from '../components/reports/AMarriageReport.vue';
import PedigreeChartReport from '../components/reports/PedigreeChartReport.vue';
import HourglassChartReport from '../components/reports/HourglassChartReport.vue';
import DescendantChartReport from '../components/reports/DescendantChartReport.vue';
import FanChartReport from '../components/reports/FanChartReport.vue';
import TimelineChartReport from '../components/reports/TimelineChartReport.vue';
import ZoomControls from '../components/ZoomControls.vue';
import {
  fanGenerations,
} from '../composables/useChartGenerations';
import {
  getPaperDimensions,
  computeTileViewBoxes,
  generateTileSvg,
  MM_TO_PX,
} from '../../api/chart-export';
import { buildExportSvgString, wrapWithTitle } from '../composables/useChartExport';

interface RelationshipOption { id: string; label: string; }

const { t } = useI18n();
const route = useRoute();

const focusStore = useFocusStore();
const store = useReportConfigStore();

const activeTab = ref<'yourAncestors' | 'alife' | 'onePage' | 'familyInYear' | 'photoAlbum' | 'placeChronicle' | 'amarriage' | 'pedigreePrint' | 'hourglassChart' | 'descendantChart' | 'fanChart' | 'timeline'>('pedigreePrint');
const reportLoading = ref(false);
const keepsakeTabs = computed(() => [
  { value: 'alife', label: t('reports.alife.title') },
  { value: 'amarriage', label: t('reports.amarriage.title') },
  { value: 'placeChronicle', label: t('reports.placeChronicle.title') },
  { value: 'yourAncestors', label: t('reports.yourAncestors.tabTitle') },
  { value: 'onePage', label: t('reports.onePage.title') },
  { value: 'familyInYear', label: t('reports.familyInYear.tabTitle') },
  { value: 'photoAlbum', label: t('reports.photoAlbum.tabTitle') },
]);
const framableTabs = computed(() => [
  { value: 'descendantChart', label: t('reports.tabDescendantChart') },
  { value: 'hourglassChart', label: t('reports.tabHourglassChart') },
  { value: 'pedigreePrint', label: t('reports.pedigreePrint.title') },
  { value: 'fanChart', label: t('reports.tabFanChart') },
  { value: 'timeline', label: t('reports.tabTimeline') },
]);

const coupleRelationships = ref<RelationshipOption[]>([]);

const chartTileCount = computed(() => {
  const dims = getPaperDimensions({ paperSize: store.chartPaperSize, orientation: store.chartOrientation });
  const W = Math.round(dims.width * MM_TO_PX);
  const H = Math.round(dims.height * MM_TO_PX);
  const tiles = computeTileViewBoxes(W, H);
  if (tiles.length <= 1) return null;
  const rows = Math.max(...tiles.map(t => t.row)) + 1;
  const cols = Math.max(...tiles.map(t => t.col)) + 1;
  return { count: tiles.length, rows, cols };
});

async function chartExportTitle(): Promise<string> {
  const tab = activeTab.value;
  let label = '';
  if (tab === 'pedigreePrint') label = t('reports.pedigreePrint.title');
  else if (tab === 'hourglassChart') label = t('reports.tabHourglassChart');
  else if (tab === 'descendantChart') label = t('reports.tabDescendantChart');
  else if (tab === 'fanChart') label = t('reports.tabFanChart');
  else label = '';
  const name = await getPersonName(focusStore.personId);
  return `${label} \u2014 ${name}`;
}

function getChartSvg(): SVGElement | null {
  return previewContainer.value?.querySelector('svg') ?? null;
}

async function saveChartSvg() {
  const svg = getChartSvg();
  if (!svg) return;
  const titled = wrapWithTitle(buildExportSvgString(svg), await chartExportTitle());
  await (window.api as unknown as { chart: { saveSvg: (s: string) => Promise<void> } }).chart.saveSvg(titled);
}

async function saveChartPdf() {
  const svg = getChartSvg();
  if (!svg) return;
  const dims = getPaperDimensions({ paperSize: store.chartPaperSize, orientation: store.chartOrientation });
  const paperW = Math.round(dims.width * MM_TO_PX);
  const paperH = Math.round(dims.height * MM_TO_PX);

  // Use the tight bounding box of rendered content for scale and filter, not the
  // SVG viewBox. Chart layouts (pedigree especially) reserve grid space for
  // placeholder slots that don't render in readonly exports, so the viewBox is
  // wider/taller than actual content — that phantom padding drags outer tiles
  // onto the page as leading/trailing blanks.
  const bbox = (svg as SVGGraphicsElement).getBBox();
  const vbParts = (svg.getAttribute('viewBox') ?? '').trim().split(/\s+/).map(Number);
  const vbFallback = vbParts.length === 4 && vbParts.every(n => Number.isFinite(n))
    ? { x: vbParts[0], y: vbParts[1], w: vbParts[2], h: vbParts[3] }
    : { x: 0, y: 0, w: Number(svg.getAttribute('width')) || paperW, h: Number(svg.getAttribute('height')) || paperH };
  const content = bbox.width > 0 && bbox.height > 0
    ? { x: bbox.x, y: bbox.y, w: bbox.width, h: bbox.height }
    : vbFallback;

  const clone = svg.cloneNode(true) as SVGElement;
  if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const scale = Math.min(paperW / content.w, paperH / content.h);
  const tx = (paperW - content.w * scale) / 2 - content.x * scale;
  const ty = (paperH - content.h * scale) / 2 - content.y * scale;
  const wrapper = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  wrapper.setAttribute('transform', `translate(${tx} ${ty}) scale(${scale})`);
  while (clone.firstChild) wrapper.appendChild(clone.firstChild);
  clone.appendChild(wrapper);
  clone.setAttribute('viewBox', `0 0 ${paperW} ${paperH}`);
  clone.setAttribute('width', String(paperW));
  clone.setAttribute('height', String(paperH));

  const titled = wrapWithTitle(new XMLSerializer().serializeToString(clone), await chartExportTitle());
  // Chart bounds in paper coordinate space (post-scale, post-center).
  const chartL = tx + content.x * scale;
  const chartR = tx + (content.x + content.w) * scale;
  const chartT = ty + content.y * scale;
  const chartB = ty + (content.y + content.h) * scale;
  // Anchor tiles to the chart content bounds rather than the full paper origin.
  // Paper-aligned tiling creates leading/trailing blank pages whenever the chart
  // is smaller than the paper because centering leaves margin rows/columns that
  // just barely pass any percentage-based overlap filter.
  const A4_W_PX = Math.round(210 * MM_TO_PX);
  const A4_H_PX = Math.round(297 * MM_TO_PX);
  const TILE_OVERLAP = 20;
  const tileStepW = A4_W_PX - TILE_OVERLAP * 2;
  const tileStepH = A4_H_PX - TILE_OVERLAP * 2;
  const tileCols = Math.max(1, Math.ceil((chartR - chartL) / tileStepW));
  const tileRows = Math.max(1, Math.ceil((chartB - chartT) / tileStepH));
  const contentTiles: Array<{ x: number; y: number; width: number; height: number; row: number; col: number }> = [];
  for (let r = 0; r < tileRows; r++) {
    for (let c = 0; c < tileCols; c++) {
      contentTiles.push({
        x: chartL + c * tileStepW - TILE_OVERLAP,
        y: chartT + r * tileStepH - TILE_OVERLAP,
        width: A4_W_PX,
        height: A4_H_PX,
        row: r, col: c,
      });
    }
  }
  const pages = contentTiles.map(tv => generateTileSvg(titled, tv));
  await (window.api as unknown as { chart: { saveTiledPdf: (p: string[]) => Promise<void> } }).chart.saveTiledPdf(pages);
}

// --- Zoom ---
// Natural preview width in px (A4 at 96dpi ≈ 794px).
// The .print-preview has width: 210mm which Chromium renders as ~794px.
const A4_NATURAL_WIDTH = 794;
const naturalWidth = computed(() => A4_NATURAL_WIDTH);
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

watch(activeTab,                           triggerLoading);
watch(() => store.personId,                triggerLoading);
watch(() => store.familyInYearYear,        triggerLoading);
watch(() => store.familyInYearScope,       triggerLoading);
watch(() => store.photoAlbumSubjectType,   triggerLoading);
watch(() => store.photoAlbumSubjectId,     triggerLoading);
watch(() => store.placeChroniclePlaceId,   triggerLoading);
watch(() => store.aMarriageRelId,          triggerLoading);

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

  const rels = await window.api.relationships.list() as Array<{
    id: string; type: string; person1_id: string | null; person2_id: string | null;
  }>;
  const couples = rels.filter(r => r.type === 'couple');
  const options: RelationshipOption[] = [];
  for (const r of couples) {
    const name1 = await getPersonName(r.person1_id);
    const name2 = await getPersonName(r.person2_id);
    options.push({ id: r.id, label: `${name1} & ${name2}` });
  }
  coupleRelationships.value = options;

  if (focusStore.personId) {
    const focusCouple = couples.find(r =>
      r.person1_id === focusStore.personId || r.person2_id === focusStore.personId
    );
    if (focusCouple) store.aMarriageRelId = focusCouple.id;

    try {
      const events = await window.api.events.forPerson(focusStore.personId) as Array<{ event_type: string; place_id: string | null }>;
      const birth = events.find(e => e.event_type === 'birth' && e.place_id);
      if (birth?.place_id) store.placeChroniclePlaceId = birth.place_id;
    } catch { /* ignore */ }
  }

  // allPlaces loading removed — PlacePicker in ReportPanel handles place search.

  // Read query params for deep linking (e.g. /reports?tab=alife)
  const tabParam = route.query.tab as string | undefined;
  const validTabs = ['yourAncestors', 'alife', 'onePage', 'familyInYear', 'photoAlbum',
    'placeChronicle', 'amarriage', 'pedigreePrint', 'hourglassChart',
    'descendantChart', 'fanChart', 'timeline'];
  if (tabParam && validTabs.includes(tabParam)) activeTab.value = tabParam as typeof activeTab.value;
  if (route.query.placeId)        store.placeChroniclePlaceId = route.query.placeId as string;
  if (route.query.relationshipId) store.aMarriageRelId        = route.query.relationshipId as string;
});

async function printCurrent() {
  await window.api.print.print();
}

function exportPdfFilename(): string {
  const names: Record<string, string> = {
    yourAncestors: 'your-ancestors',
    alife: 'a-life',
    onePage: 'life-on-one-page',
    familyInYear: 'family-in-a-year',
    photoAlbum: 'photo-album',
    placeChronicle: 'place-chronicle',
    amarriage: 'a-couple',
    pedigreePrint: 'pedigree-print',
    fanChart: 'fan-chart-print',
    descendantChart: 'descendant-print',
    hourglassChart: 'hourglass-print',
    timeline: 'timeline-print',
  };
  return (names[activeTab.value] ?? 'report') + '.pdf';
}

async function exportPdf() {
  const chartTabs = ['pedigreePrint', 'hourglassChart', 'descendantChart'];
  const landscape = chartTabs.includes(activeTab.value) ? store.chartOrientation === 'landscape' : false;
  await window.api.print.exportPdf(exportPdfFilename(), landscape);
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
.tab-groups { display: flex; flex-direction: column; gap: var(--space-md); margin-bottom: var(--space-md); }
.tab-group-label {
  font-size: var(--font-sm);
  color: var(--text-muted);
  margin: 0 0 var(--space-xs);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.reports-body {
  display: flex;
  flex: 1;
  overflow: hidden;
  min-height: 0;
  gap: var(--space-xs);
}
.preview-wrapper {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
  background: var(--surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}
.tab-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
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
.print-preview.preview-landscape {
  width: 297mm;
  min-height: 210mm;
}
@media print {
  .view-header, .filter-chips-bar, .tab-groups, .zoom-controls-bar, .report-panel { display: none !important; }
  .preview-area { background: none; padding: 0; min-height: auto; border-radius: 0; }
  .print-preview { zoom: 1 !important; box-shadow: none; min-height: auto; }
}


</style>
