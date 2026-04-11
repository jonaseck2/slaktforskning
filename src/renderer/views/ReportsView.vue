<template>
  <div class="reports-view">
    <div class="view-header">
      <h2>{{ $t('reports.title') }}</h2>
      <span v-if="reportLoading" class="running-hint">Laddar rapport…</span>
    </div>

    <div class="tab-bar">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :class="['tab-btn', { active: activeTab === tab.id }]"
        @click="activeTab = tab.id"
      >{{ tab.label }}</button>
    </div>

    <!-- Ancestor Chart Tab -->
    <div v-if="activeTab === 'ancestor'" class="tab-content">
      <div class="tab-header">
        <div class="controls">
          <label>
            {{ $t('reports.generations') }}
            <select v-model="ancestorGenerations">
              <option :value="3">3</option>
              <option :value="4">4</option>
              <option :value="5">5</option>
            </select>
          </label>
        </div>
        <div class="print-actions">
          <button class="btn-add btn-report-action" :disabled="!ancestorRootId" @click="printCurrent">{{ $t('reports.print') }}</button>
          <button class="btn-add btn-report-action" :disabled="!ancestorRootId" @click="exportPdf">{{ $t('reports.exportPdf') }}</button>
        </div>
      </div>
      <div ref="previewContainer" class="preview-area">
        <div v-if="ancestorRootId" class="print-preview" :style="{ zoom: effectiveZoom }">
          <AncestorChartReport :root-person-id="ancestorRootId" :generations="ancestorGenerations" />
        </div>
        <div v-else class="empty-hint">{{ $t('reports.selectPersonFirst') }}</div>
        <div class="zoom-floating">
          <button class="zoom-btn" :disabled="effectiveZoom <= 0.2" @click="zoomOut" title="Zooma ut">−</button>
          <span class="zoom-label">{{ Math.round(effectiveZoom * 100) }}%</span>
          <button class="zoom-btn" @click="zoomIn" title="Zooma in">+</button>
          <button class="zoom-btn zoom-fit-btn" @click="resetZoom" title="Anpassa till bredd">{{ $t('reports.zoomFit') }}</button>
        </div>
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
          <button class="btn-add btn-report-action" :disabled="!familyRelationshipId" @click="printCurrent">{{ $t('reports.print') }}</button>
          <button class="btn-add btn-report-action" :disabled="!familyRelationshipId" @click="exportPdf">{{ $t('reports.exportPdf') }}</button>
        </div>
      </div>
      <div ref="previewContainer" class="preview-area">
        <div v-if="familyRelationshipId" class="print-preview" :style="{ zoom: effectiveZoom }">
          <FamilyGroupSheet :relationship-id="familyRelationshipId" />
        </div>
        <div v-else class="empty-hint">{{ $t('reports.selectCoupleFirst') }}</div>
        <div class="zoom-floating">
          <button class="zoom-btn" :disabled="effectiveZoom <= 0.2" @click="zoomOut" title="Zooma ut">−</button>
          <span class="zoom-label">{{ Math.round(effectiveZoom * 100) }}%</span>
          <button class="zoom-btn" @click="zoomIn" title="Zooma in">+</button>
          <button class="zoom-btn zoom-fit-btn" @click="resetZoom" title="Anpassa till bredd">{{ $t('reports.zoomFit') }}</button>
        </div>
      </div>
    </div>

    <!-- Individual Summary Tab -->
    <div v-if="activeTab === 'individual'" class="tab-content">
      <div class="tab-header">
        <div class="controls">
        </div>
        <div class="print-actions">
          <button class="btn-add btn-report-action" :disabled="!individualPersonId" @click="printCurrent">{{ $t('reports.print') }}</button>
          <button class="btn-add btn-report-action" :disabled="!individualPersonId" @click="exportPdf">{{ $t('reports.exportPdf') }}</button>
        </div>
      </div>
      <div ref="previewContainer" class="preview-area">
        <div v-if="individualPersonId" class="print-preview" :style="{ zoom: effectiveZoom }">
          <IndividualSummary :person-id="individualPersonId" />
        </div>
        <div v-else class="empty-hint">{{ $t('reports.selectPersonFirst') }}</div>
        <div class="zoom-floating">
          <button class="zoom-btn" :disabled="effectiveZoom <= 0.2" @click="zoomOut" title="Zooma ut">−</button>
          <span class="zoom-label">{{ Math.round(effectiveZoom * 100) }}%</span>
          <button class="zoom-btn" @click="zoomIn" title="Zooma in">+</button>
          <button class="zoom-btn zoom-fit-btn" @click="resetZoom" title="Anpassa till bredd">{{ $t('reports.zoomFit') }}</button>
        </div>
      </div>
    </div>

    <!-- Ancestor Book Tab -->
    <div v-if="activeTab === 'ancestorBook'" class="tab-content">
      <div class="tab-header">
        <div class="controls">
        </div>
        <div class="print-actions">
          <button class="btn-add btn-report-action" :disabled="!ancestorBookPersonId" @click="printCurrent">{{ $t('reports.print') }}</button>
          <button class="btn-add btn-report-action" :disabled="!ancestorBookPersonId" @click="exportPdf">{{ $t('reports.exportPdf') }}</button>
        </div>
      </div>
      <div ref="previewContainer" class="preview-area">
        <div v-if="ancestorBookPersonId" class="print-preview" :style="{ zoom: effectiveZoom }">
          <AncestorBookReport :person-id="ancestorBookPersonId" />
        </div>
        <div v-else class="empty-hint">{{ $t('reports.ancestorBook.noPersonSelected') }}</div>
        <div class="zoom-floating">
          <button class="zoom-btn" :disabled="effectiveZoom <= 0.2" @click="zoomOut" title="Zooma ut">−</button>
          <span class="zoom-label">{{ Math.round(effectiveZoom * 100) }}%</span>
          <button class="zoom-btn" @click="zoomIn" title="Zooma in">+</button>
          <button class="zoom-btn zoom-fit-btn" @click="resetZoom" title="Anpassa till bredd">{{ $t('reports.zoomFit') }}</button>
        </div>
      </div>
    </div>

    <!-- Person Biography Tab -->
    <div v-if="activeTab === 'biography'" class="tab-content">
      <div class="tab-header">
        <div class="controls"></div>
        <div class="print-actions">
          <button class="btn-add btn-report-action" :disabled="!biographyPersonId" @click="printCurrent">{{ $t('reports.print') }}</button>
          <button class="btn-add btn-report-action" :disabled="!biographyPersonId" @click="exportPdf">{{ $t('reports.exportPdf') }}</button>
        </div>
      </div>
      <div ref="previewContainer" class="preview-area">
        <div v-if="biographyPersonId" class="print-preview" :style="{ zoom: effectiveZoom }">
          <PersonBiography :person-id="biographyPersonId" />
        </div>
        <div v-else class="empty-hint">{{ $t('reports.selectPersonFirst') }}</div>
        <div class="zoom-floating">
          <button class="zoom-btn" :disabled="effectiveZoom <= 0.2" @click="zoomOut" title="Zooma ut">−</button>
          <span class="zoom-label">{{ Math.round(effectiveZoom * 100) }}%</span>
          <button class="zoom-btn" @click="zoomIn" title="Zooma in">+</button>
          <button class="zoom-btn zoom-fit-btn" @click="resetZoom" title="Anpassa till bredd">{{ $t('reports.zoomFit') }}</button>
        </div>
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
          <button class="btn-add btn-report-action" :disabled="!placeHistoryPlaceId" @click="printCurrent">{{ $t('reports.print') }}</button>
          <button class="btn-add btn-report-action" :disabled="!placeHistoryPlaceId" @click="exportPdf">{{ $t('reports.exportPdf') }}</button>
        </div>
      </div>
      <div ref="previewContainer" class="preview-area">
        <div v-if="placeHistoryPlaceId" class="print-preview" :style="{ zoom: effectiveZoom }">
          <PlaceHistory :place-id="placeHistoryPlaceId" />
        </div>
        <div v-else class="empty-hint">{{ $t('reports.selectPlaceFirst') }}</div>
        <div class="zoom-floating">
          <button class="zoom-btn" :disabled="effectiveZoom <= 0.2" @click="zoomOut" title="Zooma ut">−</button>
          <span class="zoom-label">{{ Math.round(effectiveZoom * 100) }}%</span>
          <button class="zoom-btn" @click="zoomIn" title="Zooma in">+</button>
          <button class="zoom-btn zoom-fit-btn" @click="resetZoom" title="Anpassa till bredd">{{ $t('reports.zoomFit') }}</button>
        </div>
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
          <button class="btn-add btn-report-action" :disabled="!familyNarrativeRelId" @click="printCurrent">{{ $t('reports.print') }}</button>
          <button class="btn-add btn-report-action" :disabled="!familyNarrativeRelId" @click="exportPdf">{{ $t('reports.exportPdf') }}</button>
        </div>
      </div>
      <div ref="previewContainer" class="preview-area">
        <div v-if="familyNarrativeRelId" class="print-preview" :style="{ zoom: effectiveZoom }">
          <FamilyNarrative :relationship-id="familyNarrativeRelId" />
        </div>
        <div v-else class="empty-hint">{{ $t('reports.selectCoupleFirst') }}</div>
        <div class="zoom-floating">
          <button class="zoom-btn" :disabled="effectiveZoom <= 0.2" @click="zoomOut" title="Zooma ut">−</button>
          <span class="zoom-label">{{ Math.round(effectiveZoom * 100) }}%</span>
          <button class="zoom-btn" @click="zoomIn" title="Zooma in">+</button>
          <button class="zoom-btn zoom-fit-btn" @click="resetZoom" title="Anpassa till bredd">{{ $t('reports.zoomFit') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import AncestorChartReport from '../components/reports/AncestorChartReport.vue';
import { useFocusStore } from '../stores/focus';
import FamilyGroupSheet from '../components/reports/FamilyGroupSheet.vue';
import IndividualSummary from '../components/reports/IndividualSummary.vue';
import AncestorBookReport from '../components/reports/AncestorBookReport.vue';
import PersonBiography from '../components/reports/PersonBiography.vue';
import PlaceHistory from '../components/reports/PlaceHistory.vue';
import FamilyNarrative from '../components/reports/FamilyNarrative.vue';

interface RelationshipOption { id: string; label: string; }

const { t } = useI18n();
const route = useRoute();

const focusStore = useFocusStore();

const activeTab = ref<'ancestor' | 'family' | 'individual' | 'ancestorBook' | 'biography' | 'placeHistory' | 'familyNarrative'>('ancestor');
const reportLoading = ref(false);
const tabs = computed(() => [
  { id: 'ancestor', label: t('reports.tabAncestor') },
  { id: 'family', label: t('reports.tabFamily') },
  { id: 'individual', label: t('reports.tabIndividual') },
  { id: 'ancestorBook', label: t('reports.tabAncestorBook') },
  { id: 'biography', label: t('reports.tabBiography') },
  { id: 'placeHistory', label: t('reports.tabPlaceHistory') },
  { id: 'familyNarrative', label: t('reports.tabFamilyNarrative') },
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
const allPlaces = ref<Array<{ id: string; name: string }>>([]);

// --- Zoom ---
// Natural preview width in px (A4 at 96dpi ≈ 794px).
// The .print-preview has width: 210mm which Chromium renders as ~794px.
const NATURAL_WIDTH = 794;
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
    if (w > 0) fitZoom.value = w / NATURAL_WIDTH;
  };
  ro = new ResizeObserver(update);
  ro.observe(el);
  update();
});

// Reset user delta when switching tabs so new tab auto-fits
watch(activeTab, () => { userZoomDelta.value = 0; });

// Show loading hint when report inputs change
function triggerLoading() {
  reportLoading.value = true;
  nextTick(() => setTimeout(() => { reportLoading.value = false; }, 800));
}
watch(activeTab, triggerLoading);
watch(ancestorRootId, triggerLoading);
watch(individualPersonId, triggerLoading);
watch(ancestorBookPersonId, triggerLoading);
watch(biographyPersonId, triggerLoading);
watch(placeHistoryPlaceId, triggerLoading);
watch(familyNarrativeRelId, triggerLoading);

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

  // Read query params for deep linking (e.g. /reports?tab=biography)
  const tabParam = route.query.tab as string | undefined;
  const validTabs = ['ancestor', 'family', 'individual', 'ancestorBook', 'biography', 'placeHistory', 'familyNarrative'];
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
  margin-bottom: 16px;
}
.view-header h2 { margin: 0; }
/* Zoom controls (floating bottom-right of preview area) */
.zoom-floating {
  position: absolute;
  bottom: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 4px 8px;
  z-index: 10;
}
.zoom-btn {
  background: #f0f4f8;
  color: #4a5568;
  border: 1px solid #c8d0db;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: var(--font-base);
  line-height: 1;
}
.zoom-btn:hover:not(:disabled) { background: #e2e8f0; }
.zoom-btn:disabled { opacity: 0.4; cursor: default; }
.zoom-fit-btn { font-size: var(--font-xs); padding: 4px 10px; }
.zoom-label {
  min-width: 44px;
  text-align: center;
  font-size: var(--font-sm);
  color: #555;
}

.tab-content { display: flex; flex-direction: column; gap: 12px; }

.tab-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;
}
.controls { display: flex; gap: 16px; flex-wrap: wrap; align-items: center; }
.controls label {
  display: flex; flex-direction: column; gap: 4px;
  font-size: var(--font-sm); font-weight: 600; color: #555; min-width: 200px;
}
.controls select {
  padding: 6px 8px; border: 1px solid #ccc; border-radius: 4px; font-size: var(--font-base); font-family: inherit;
}
.print-actions { display: flex; gap: 8px; align-items: center; }
.btn-report-action:disabled { opacity: 0.5; cursor: default; }

/* Preview area: grey background with scrollable paper preview */
.preview-area {
  position: relative;
  background: #d0d0d0;
  padding: 24px;
  border-radius: 4px;
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
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  transform-origin: top center;
  flex-shrink: 0;
}
@media print {
  .view-header, .tab-bar, .tab-header, .zoom-floating { display: none !important; }
  .preview-area { background: none; padding: 0; min-height: auto; border-radius: 0; }
  .print-preview { zoom: 1 !important; box-shadow: none; min-height: auto; }
}
</style>
