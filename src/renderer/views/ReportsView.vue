<template>
  <div class="reports-view" ref="reportsViewRef">

    <div class="reports-main">
    <div class="view-header">
      <h2>{{ mode === 'framable' ? $t('reports.groups.framablePrints') : $t('reports.title') }}</h2>
      <span v-if="reportLoading" class="running-hint">{{ $t('reports.loadingReport') }}</span>
    </div>

    <div class="tab-groups">
      <div v-if="mode === 'keepsake'" class="tab-group">
        <FilterChips
          :model-value="activeTab"
          :options="keepsakeTabs"
          @update:model-value="activeTab = $event as typeof activeTab"
        />
      </div>
      <div v-if="mode === 'framable'" class="tab-group">
        <FilterChips
          :model-value="activeTab"
          :options="framableTabs"
          @update:model-value="activeTab = $event as typeof activeTab"
        />
      </div>
    </div>

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
              :fan-generations="store.yourAncestorsFanGenerations"
              :fan-arc-span="store.yourAncestorsFanArcSpan"
              :show-events="store.yourAncestorsShowEvents"
              :show-life-map="store.yourAncestorsShowLifeMap"
              :show-map-caption="store.yourAncestorsShowMapCaption"
              :show-extra-photos="store.yourAncestorsShowExtraPhotos"
              :show-media-captions="store.yourAncestorsShowMediaCaptions"
              :show-media-notes="store.yourAncestorsShowMediaNotes"
              :show-sources="store.yourAncestorsShowSources"
              :redact-living="store.redactLiving"
            />
          </div>
          <AppEmptyState v-else icon="🖨️" :title="$t('reports.selectPersonFirst')" />
        </div>
      </div>

      <!-- A Life Tab -->
      <div v-if="activeTab === 'alife'" class="tab-content">
        <div ref="previewContainer" class="preview-area">
          <div v-if="store.personId" class="print-preview" :style="{ zoom: effectiveZoom }">
            <ALifeReport
              :person-id="store.personId"
              :show-life-map="store.aLifeShowLifeMap"
              :show-map-caption="store.aLifeShowMapCaption"
              :show-photos="store.aLifeShowPhotos"
              :show-documents="store.aLifeShowDocuments"
              :show-sources="store.aLifeShowSources"
              :show-notes="store.aLifeShowNotes"
              :show-media-captions="store.aLifeShowMediaCaptions"
              :show-media-notes="store.aLifeShowMediaNotes"
              :redact-living="store.redactLiving"
            />
          </div>
          <AppEmptyState v-else icon="🖨️" :title="$t('reports.selectPersonFirst')" />
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
              :show-map-caption="store.onePageShowMapCaption"
              :redact-living="store.redactLiving"
            />
          </div>
          <AppEmptyState v-else icon="🖨️" :title="$t('reports.selectPersonFirst')" />
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
          <AppEmptyState v-else icon="🖨️" :title="$t('reports.selectPersonFirst')" />
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
              :show-notes="store.photoAlbumShowNotes"
              :show-index="store.photoAlbumShowIndex"
              :include-documents="store.photoAlbumIncludeDocuments"
            />
          </div>
          <AppEmptyState v-else-if="store.photoAlbumSubjectType === 'person'" icon="🖨️" :title="$t('reports.selectPersonFirst')" />
          <AppEmptyState v-else-if="store.photoAlbumSubjectType === 'relationship'" icon="🖨️" :title="$t('reports.selectCoupleFirst')" />
          <AppEmptyState v-else-if="store.photoAlbumSubjectType === 'place'" icon="🖨️" :title="$t('reports.selectPlaceFirst')" />
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
              :show-media-notes="store.placeChronicleShowMediaNotes"
            />
          </div>
          <AppEmptyState v-else icon="🖨️" :title="$t('reports.selectPlaceFirst')" />
        </div>
      </div>

      <!-- A Marriage Tab -->
      <div v-if="activeTab === 'amarriage'" class="tab-content">
        <div ref="previewContainer" class="preview-area">
          <div v-if="store.aMarriageRelId" class="print-preview" :style="{ zoom: effectiveZoom }">
            <AMarriageReport
              :relationship-id="store.aMarriageRelId"
              :show-life-map="store.aMarriageShowLifeMap"
              :show-map-caption="store.aMarriageShowMapCaption"
              :show-photos="store.aMarriageShowPhotos"
              :show-notes="store.aMarriageShowNotes"
              :show-sources="store.aMarriageShowSources"
              :show-media-captions="store.aMarriageShowMediaCaptions"
              :show-media-notes="store.aMarriageShowMediaNotes"
              :redact-living="store.redactLiving"
            />
          </div>
          <AppEmptyState v-else icon="🖨️" :title="$t('reports.selectCoupleFirst')" />
        </div>
      </div>

      <!-- Pedigree Print Tab -->
      <div v-if="activeTab === 'pedigreePrint'" class="tab-content">
        <div ref="previewContainer" class="preview-area">
          <div v-if="store.personId" class="print-preview chart-print" :style="{ zoom: effectiveZoom }">
            <PedigreeChartReport :person-id="store.personId" :color-mode="store.chartColorMode" />
          </div>
          <AppEmptyState v-else icon="🖨️" :title="$t('reports.selectPersonFirst')" />
        </div>
      </div>

      <!-- Hourglass Chart Tab -->
      <div v-if="activeTab === 'hourglassChart'" class="tab-content">
        <div ref="previewContainer" class="preview-area">
          <div v-if="store.personId" class="print-preview preview-landscape chart-print" :style="{ zoom: effectiveZoom }">
            <HourglassChartReport :person-id="store.personId" :color-mode="store.chartColorMode" />
          </div>
          <AppEmptyState v-else icon="🖨️" :title="$t('reports.selectPersonFirst')" />
        </div>
      </div>

      <!-- Descendant Chart Tab -->
      <div v-if="activeTab === 'descendantChart'" class="tab-content">
        <div ref="previewContainer" class="preview-area">
          <div v-if="store.personId" class="print-preview preview-landscape chart-print" :style="{ zoom: effectiveZoom }">
            <DescendantChartReport :person-id="store.personId" :color-mode="store.chartColorMode" />
          </div>
          <AppEmptyState v-else icon="🖨️" :title="$t('reports.selectPersonFirst')" />
        </div>
      </div>

      <!-- Fan Chart Tab -->
      <div v-if="activeTab === 'fanChart'" class="tab-content">
        <div ref="previewContainer" class="preview-area">
          <div v-if="store.personId" class="print-preview chart-print" :style="{ zoom: effectiveZoom }">
            <FanChartReport
              :person-id="store.personId"
              :generations="fanGenerations"
              :arc-span="store.fanArcSpan"
              :color-mode="store.fanColorMode"
            />
          </div>
          <AppEmptyState v-else icon="🖨️" :title="$t('reports.selectPersonFirst')" />
        </div>
      </div>

      <!-- Timeline Tab -->
      <div v-if="activeTab === 'timeline'" class="tab-content">
        <div ref="previewContainer" class="preview-area">
          <div v-if="store.personId" class="print-preview chart-print" :style="{ zoom: effectiveZoom }">
            <TimelineChartReport :person-id="store.personId" />
          </div>
          <AppEmptyState v-else icon="🖨️" :title="$t('reports.selectPersonFirst')" />
        </div>
      </div>

      <ZoomControls :zoom="effectiveZoom" :show-fit="true" :overlay="true" @zoom-in="zoomIn" @zoom-out="zoomOut" @reset="resetZoom" />

      </div><!-- .preview-wrapper -->
    </div><!-- .reports-main -->

    <!-- Reopen panel button when panel is closed -->
    <button v-if="!panelOpen" class="panel-open-btn" :aria-label="$t('panel.open') ?? 'Open'" @click="openPanel">◀</button>

    <template v-if="panelOpen">
      <div class="panel-drag-handle" @mousedown="(e: MouseEvent) => startResize(e, reportsViewRef!)"></div>
      <div class="reports-panel" :style="{ width: panelWidth + 'px' }">
        <ReportPanel
          :active-tab="activeTab"
          :couple-relationships="coupleRelationships"
          @print="printCurrent"
          @export-pdf="exportPdf"
          @save-svg="saveChartSvg"
          @save-chart-pdf="saveChartPdf"
          @close="closePanel"
        />
      </div>
    </template>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import FilterChips from '../components/ui/FilterChips.vue';
import AppEmptyState from '../components/ui/AppEmptyState.vue';
import { useSelectedPersonStore } from '../stores/selectedPerson';
import { useReportConfigStore } from '../stores/reportConfig';
import { usePanelResize } from '../composables/usePanelResize';
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
import { buildExportSvgString } from '../composables/useChartExport';

interface RelationshipOption { id: string; label: string; }

const props = defineProps<{ mode?: 'keepsake' | 'framable' }>();
const mode = computed(() => props.mode ?? 'keepsake');

const { t } = useI18n();
const route = useRoute();

const selectedStore = useSelectedPersonStore();
const store = useReportConfigStore();

const activeTab = ref<'yourAncestors' | 'alife' | 'onePage' | 'familyInYear' | 'photoAlbum' | 'placeChronicle' | 'amarriage' | 'pedigreePrint' | 'hourglassChart' | 'descendantChart' | 'fanChart' | 'timeline'>(mode.value === 'framable' ? 'pedigreePrint' : 'alife');
const reportsViewRef = ref<HTMLElement | null>(null);
const { panelWidth, startResize } = usePanelResize({ storageKey: 'reports-panel-width', defaultWidth: 240, minWidth: 180 });
const panelOpen = ref(localStorage.getItem('reports-panel-open') !== 'false');
function openPanel() {
  panelOpen.value = true;
  localStorage.setItem('reports-panel-open', 'true');
}
function closePanel() {
  panelOpen.value = false;
  localStorage.setItem('reports-panel-open', 'false');
}

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
  { value: 'pedigreePrint', label: t('visualization.tab.pedigree') },
  { value: 'hourglassChart', label: t('visualization.tab.hourglass') },
  { value: 'descendantChart', label: t('visualization.tab.descendants') },
  { value: 'fanChart', label: t('visualization.tab.fan') },
  { value: 'timeline', label: t('visualization.tab.timeline') },
]);

const coupleRelationships = ref<RelationshipOption[]>([]);

function chartExportName(): string {
  const names: Record<string, string> = {
    pedigreePrint:   'pedigree-chart',
    hourglassChart:  'hourglass-chart',
    descendantChart: 'descendant-chart',
    fanChart:        'fan-chart',
    timeline:        'timeline',
  };
  return names[activeTab.value] ?? 'chart';
}


function getChartSvg(): SVGElement | null {
  return previewContainer.value?.querySelector('svg') ?? null;
}

async function saveChartSvg() {
  const svg = getChartSvg();
  if (!svg) return;
  await (window.api as unknown as { chart: { saveSvg: (s: string, hint: string) => Promise<void> } })
    .chart.saveSvg(buildExportSvgString(svg), chartExportName() + '.svg');
}

async function saveChartPdf() {
  const tab = activeTab.value;
  const landscape = tab === 'descendantChart' || tab === 'hourglassChart';
  await window.api.print.exportPdf(chartExportName() + '.pdf', landscape);
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

  // Seed report subject: prefer selected person, fall back to default_person_id
  let subjectId: string | null = selectedStore.personId;
  if (!subjectId) {
    try {
      subjectId = await window.api.db.getSetting('default_person_id') as string | null;
    } catch { /* ignore */ }
  }
  if (subjectId) {
    if (!store.personId) store.personId = subjectId;
    const focusCouple = couples.find(r =>
      r.person1_id === subjectId || r.person2_id === subjectId
    );
    if (focusCouple) store.aMarriageRelId = focusCouple.id;

    try {
      const events = await window.api.events.forPerson(subjectId) as Array<{ event_type: string; place_id: string | null }>;
      const birth = events.find(e => e.event_type === 'birth' && e.place_id);
      if (birth?.place_id) store.placeChroniclePlaceId = birth.place_id;
    } catch { /* ignore */ }
  }

  // allPlaces loading removed — PlacePicker in ReportPanel handles place search.

  // Read query params for deep linking (e.g. /reports?tab=alife)
  const tabParam = route.query.tab as string | undefined;
  const keepsakeValid = ['yourAncestors', 'alife', 'onePage', 'familyInYear', 'photoAlbum', 'placeChronicle', 'amarriage'];
  const framableValid = ['pedigreePrint', 'hourglassChart', 'descendantChart', 'fanChart', 'timeline'];
  const validTabs = mode.value === 'framable' ? framableValid : keepsakeValid;
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
  await window.api.print.exportPdf(exportPdfFilename(), false);
}

</script>

<style scoped>
.reports-view {
  display: flex;
  flex-direction: row;
  height: 100%;
  gap: var(--space-xs);
  position: relative;
}
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
.panel-drag-handle {
  width: 6px;
  background: var(--surface-border-subtle);
  cursor: col-resize;
  flex-shrink: 0;
  position: relative;
  transition: background 0.1s;
}
.panel-drag-handle:hover { background: var(--surface-border); }
.reports-panel {
  flex-shrink: 0;
  height: 100%;
}
.reports-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--surface);
  border-radius: var(--radius-lg);
}
.view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-lg) var(--space-lg) 0;
  margin-bottom: var(--space-lg);
}
.view-header h2 { margin: 0; }
.tab-groups { display: flex; flex-direction: column; gap: var(--space-md); margin-bottom: var(--space-md); padding: 0 var(--space-lg); }
.tab-group-label {
  font-size: var(--font-sm);
  color: var(--text-muted);
  margin: 0 0 var(--space-xs);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.preview-wrapper {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
}
.tab-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
/* Preview area: scrollable paper preview on the sheet surface */
.preview-area {
  position: relative;
  padding: var(--space-xl);
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
  transform-origin: top center;
  flex-shrink: 0;
}
.print-preview.preview-landscape {
  width: 297mm;
  min-height: 210mm;
}
@media print {
  /* Collapse the side panel and drag handle so reports-main fills the full page width */
  .reports-view { display: block; }
  .reports-panel, .panel-drag-handle { display: none !important; }
  .view-header, .filter-chips-bar, .tab-groups, .zoom-controls-bar, .report-panel { display: none !important; }
  .reports-main { display: block; overflow: visible; background: none; box-shadow: none; border-radius: 0; padding: 0; width: 100%; }
  .preview-wrapper, .tab-content { display: block; overflow: visible; height: auto; }
  .preview-area { background: none; padding: 0; min-height: auto; border-radius: 0; display: block; }
  /* Explicit 170mm width (A4 210mm minus 2×20mm margins) + auto centering
     avoids relying on padding for margins. The element is exactly the content
     area, and margin:auto places it 20mm from each edge on an A4 page. */
  .print-preview { zoom: 1 !important; box-shadow: none; min-height: auto; width: 170mm !important; margin: 20mm auto !important; padding: 0 !important; }
  .chart-print { width: 100% !important; height: 100vh !important; margin: 0 !important; padding: 0 !important; display: flex !important; align-items: center !important; justify-content: center !important; overflow: hidden !important; }
  .chart-print :deep(svg) { max-width: 100% !important; max-height: 100vh !important; width: auto !important; height: auto !important; }
}


</style>
