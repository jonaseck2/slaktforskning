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
            {{ $t('chart.export.colorMode') }}
            <select v-model="fanColorMode">
              <option value="bw">{{ $t('chart.export.blackWhite') }}</option>
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

    <!-- A Life Tab -->
    <div v-if="activeTab === 'alife'" class="tab-content">
      <div class="tab-header">
        <div class="controls">
          <label class="toggle-label"><input type="checkbox" v-model="aLifeShowPhotos" /> {{ $t('reports.common.photos') }}</label>
          <label class="toggle-label"><input type="checkbox" v-model="aLifeShowDocuments" /> {{ $t('reports.common.documents') }}</label>
          <label class="toggle-label"><input type="checkbox" v-model="aLifeShowSources" /> {{ $t('reports.common.sources') }}</label>
          <label class="toggle-label"><input type="checkbox" v-model="aLifeShowNotes" /> {{ $t('reports.alife.biography') }}</label>
        </div>
        <div class="print-actions">
          <AppButton variant="primary" size="sm" :disabled="!aLifePersonId" @click="printCurrent">{{ $t('reports.print') }}</AppButton>
          <AppButton variant="secondary" size="sm" :disabled="!aLifePersonId" @click="exportPdf">{{ $t('reports.exportPdf') }}</AppButton>
        </div>
      </div>
      <div ref="previewContainer" class="preview-area">
        <div v-if="aLifePersonId" class="print-preview" :style="{ zoom: effectiveZoom }">
          <ALifeReport
            :person-id="aLifePersonId"
            :show-photos="aLifeShowPhotos"
            :show-documents="aLifeShowDocuments"
            :show-sources="aLifeShowSources"
            :show-notes="aLifeShowNotes"
          />
        </div>
        <div v-else class="empty-hint">{{ $t('reports.selectPersonFirst') }}</div>
      </div>
    </div>

    <!-- Place Chronicle Tab -->
    <div v-if="activeTab === 'placeChronicle'" class="tab-content">
      <div class="tab-header">
        <div class="controls">
          <label>
            {{ $t('reports.place') }}
            <select v-model="placeChroniclePlaceId">
              <option value="" disabled>{{ $t('reports.selectPlace') }}</option>
              <option v-for="p in allPlaces" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </label>
          <label class="toggle-label"><input type="checkbox" v-model="placeChronicleShowBoundary" /> {{ $t('reports.placeChronicle.map') }}</label>
          <label class="toggle-label"><input type="checkbox" v-model="placeChronicleShowChildPlaces" /> {{ $t('reports.placeChronicle.childPlaces') }}</label>
          <label class="toggle-label"><input type="checkbox" v-model="placeChronicleShowPhotos" /> {{ $t('reports.common.photos') }}</label>
          <label class="toggle-label"><input type="checkbox" v-model="placeChronicleShowNotes" /> {{ $t('reports.placeChronicle.description') }}</label>
          <label class="toggle-label"><input type="checkbox" v-model="placeChronicleShowSources" /> {{ $t('reports.common.sources') }}</label>
        </div>
        <div class="print-actions">
          <AppButton variant="primary" size="sm" :disabled="!placeChroniclePlaceId" @click="printCurrent">{{ $t('reports.print') }}</AppButton>
          <AppButton variant="secondary" size="sm" :disabled="!placeChroniclePlaceId" @click="exportPdf">{{ $t('reports.exportPdf') }}</AppButton>
        </div>
      </div>
      <div ref="previewContainer" class="preview-area">
        <div v-if="placeChroniclePlaceId" class="print-preview" :style="{ zoom: effectiveZoom }">
          <PlaceChronicleReport
            :place-id="placeChroniclePlaceId"
            :show-boundary="placeChronicleShowBoundary"
            :show-child-places="placeChronicleShowChildPlaces"
            :show-photos="placeChronicleShowPhotos"
            :show-notes="placeChronicleShowNotes"
            :show-sources="placeChronicleShowSources"
          />
        </div>
        <div v-else class="empty-hint">{{ $t('reports.selectPlaceFirst') }}</div>
      </div>
    </div>

    <!-- A Marriage Tab -->
    <div v-if="activeTab === 'amarriage'" class="tab-content">
      <div class="tab-header">
        <div class="controls">
          <label>
            {{ $t('reports.couple') }}
            <select v-model="aMarriageRelId">
              <option value="" disabled>{{ $t('reports.selectCouple') }}</option>
              <option v-for="rel in coupleRelationships" :key="rel.id" :value="rel.id">{{ rel.label }}</option>
            </select>
          </label>
          <label class="toggle-label"><input type="checkbox" v-model="aMarriageShowPhotos" /> {{ $t('reports.common.photos') }}</label>
          <label class="toggle-label"><input type="checkbox" v-model="aMarriageShowNotes" /> {{ $t('reports.amarriage.narrative') }}</label>
          <label class="toggle-label"><input type="checkbox" v-model="aMarriageShowSources" /> {{ $t('reports.common.sources') }}</label>
        </div>
        <div class="print-actions">
          <AppButton variant="primary" size="sm" :disabled="!aMarriageRelId" @click="printCurrent">{{ $t('reports.print') }}</AppButton>
          <AppButton variant="secondary" size="sm" :disabled="!aMarriageRelId" @click="exportPdf">{{ $t('reports.exportPdf') }}</AppButton>
        </div>
      </div>
      <div ref="previewContainer" class="preview-area">
        <div v-if="aMarriageRelId" class="print-preview" :style="{ zoom: effectiveZoom }">
          <AMarriageReport
            :relationship-id="aMarriageRelId"
            :show-photos="aMarriageShowPhotos"
            :show-notes="aMarriageShowNotes"
            :show-sources="aMarriageShowSources"
          />
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
            {{ $t('chart.export.colorMode') }}
            <select v-model="fanColorMode">
              <option value="bw">{{ $t('chart.export.blackWhite') }}</option>
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
import ALifeReport from '../components/reports/ALifeReport.vue';
import PlaceChronicleReport from '../components/reports/PlaceChronicleReport.vue';
import AMarriageReport from '../components/reports/AMarriageReport.vue';
import PedigreeChartReport from '../components/reports/PedigreeChartReport.vue';
import HourglassChartReport from '../components/reports/HourglassChartReport.vue';
import DescendantChartReport from '../components/reports/DescendantChartReport.vue';
import FanChartReport from '../components/reports/FanChartReport.vue';
import type { ArcSpan } from '../utils/fanLayout';
import TimelineChartReport from '../components/reports/TimelineChartReport.vue';
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

const activeTab = ref<'ancestor' | 'family' | 'individual' | 'ancestorBook' | 'alife' | 'placeChronicle' | 'amarriage' | 'pedigreeChart' | 'hourglassChart' | 'descendantChart' | 'fanChart' | 'timeline'>('ancestor');
const reportLoading = ref(false);
const tabs = computed(() => [
  { id: 'ancestor', label: t('reports.tabAncestor') },
  { id: 'family', label: t('reports.tabFamily') },
  { id: 'individual', label: t('reports.tabIndividual') },
  { id: 'ancestorBook', label: t('reports.tabAncestorBook') },
  { id: 'alife', label: t('reports.alife.title') },
  { id: 'placeChronicle', label: t('reports.placeChronicle.title') },
  { id: 'amarriage', label: t('reports.amarriage.title') },
  { id: 'pedigreeChart', label: t('reports.tabPedigreeChart') },
  { id: 'hourglassChart', label: t('reports.tabHourglassChart') },
  { id: 'descendantChart', label: t('reports.tabDescendantChart') },
  { id: 'fanChart', label: t('reports.tabFanChart') },
  { id: 'timeline', label: t('reports.tabTimeline') },
]);

const ancestorRootId = computed(() => focusStore.personId);
const ancestorGenerations = ref(4);
const familyRelationshipId = ref('');
const coupleRelationships = ref<RelationshipOption[]>([]);
const individualPersonId = computed(() => focusStore.personId);
const ancestorBookPersonId = computed(() => focusStore.personId);
const aLifePersonId = computed(() => focusStore.personId);
const aLifeShowPhotos = ref(true);
const aLifeShowDocuments = ref(false);
const aLifeShowSources = ref(false);
const aLifeShowNotes = ref(true);
const placeChroniclePlaceId = ref('');
const placeChronicleShowBoundary = ref(true);
const placeChronicleShowChildPlaces = ref(false);
const placeChronicleShowPhotos = ref(true);
const placeChronicleShowNotes = ref(true);
const placeChronicleShowSources = ref(false);
const aMarriageRelId = ref('');
const aMarriageShowPhotos = ref(true);
const aMarriageShowNotes = ref(true);
const aMarriageShowSources = ref(false);
const fanArcSpan = ref<ArcSpan>(360);
const fanArcOptions: ArcSpan[] = [180, 210, 240, 270, 360];
const fanColorMode = ref<'branch' | 'sex' | 'bw'>('bw');
const allPlaces = ref<Array<{ id: string; name: string }>>([]);

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
const chartPersonId = computed(() => focusStore.personId);

watch(activeTab, triggerLoading);
watch(ancestorRootId, triggerLoading);
watch(individualPersonId, triggerLoading);
watch(ancestorBookPersonId, triggerLoading);
watch(aLifePersonId, triggerLoading);
watch(placeChroniclePlaceId, triggerLoading);
watch(aMarriageRelId, triggerLoading);
watch(chartPersonId, triggerLoading);

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

  // Default to first couple relationship involving the focus person
  if (focusStore.personId) {
    const focusCouple = couples.find(r => r.person1_id === focusStore.personId || r.person2_id === focusStore.personId);
    if (focusCouple) {
      familyRelationshipId.value = focusCouple.id;
      aMarriageRelId.value = focusCouple.id;
    }

    // Default place to birth place of focus person
    try {
      const events = await window.api.events.forPerson(focusStore.personId) as Array<{ event_type: string; place_id: string | null }>;
      const birth = events.find(e => e.event_type === 'birth' && e.place_id);
      if (birth?.place_id && places.some(p => p.id === birth.place_id)) {
        placeChroniclePlaceId.value = birth.place_id;
      }
    } catch { /* ignore */ }
  }

  // Read query params for deep linking (e.g. /reports?tab=alife)
  const tabParam = route.query.tab as string | undefined;
  const validTabs = ['ancestor', 'family', 'individual', 'ancestorBook', 'alife', 'placeChronicle', 'amarriage', 'pedigreeChart', 'hourglassChart', 'descendantChart', 'fanChart', 'timeline'];
  if (tabParam && validTabs.includes(tabParam)) {
    activeTab.value = tabParam as typeof activeTab.value;
  }
  if (route.query.placeId) {
    placeChroniclePlaceId.value = route.query.placeId as string;
  }
  if (route.query.relationshipId) {
    aMarriageRelId.value = route.query.relationshipId as string;
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
.controls .toggle-label {
  flex-direction: row;
  align-items: center;
  gap: var(--space-xs);
  min-width: 0;
  font-weight: normal;
  color: var(--text-primary);
  cursor: pointer;
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
@media print {
  .view-header, .tab-bar, .tab-header, .zoom-controls-bar { display: none !important; }
  .preview-area { background: none; padding: 0; min-height: auto; border-radius: 0; }
  .print-preview { zoom: 1 !important; box-shadow: none; min-height: auto; }
}


</style>
