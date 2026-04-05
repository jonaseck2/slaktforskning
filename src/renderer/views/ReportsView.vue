<template>
  <div class="reports-view">
    <div class="view-header">
      <h2>{{ $t('reports.title') }}</h2>
      <div class="zoom-controls">
        <button class="zoom-btn" :disabled="effectiveZoom <= 0.2" @click="zoomOut" title="Zooma ut">−</button>
        <span class="zoom-label">{{ Math.round(effectiveZoom * 100) }}%</span>
        <button class="zoom-btn" @click="zoomIn" title="Zooma in">+</button>
        <button class="zoom-btn zoom-fit-btn" @click="resetZoom" title="Anpassa till bredd">{{ $t('reports.zoomFit') }}</button>
      </div>
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
            {{ $t('reports.rootPerson') }}
            <PersonPicker v-model="ancestorRootId" :placeholder="$t('reports.selectPerson')" />
          </label>
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
          <button class="btn-print" :disabled="!ancestorRootId" @click="printCurrent">{{ $t('reports.print') }}</button>
          <button class="btn-pdf" :disabled="!ancestorRootId" @click="exportPdf">{{ $t('reports.exportPdf') }}</button>
        </div>
      </div>
      <div ref="previewContainer" class="preview-area">
        <div v-if="ancestorRootId" class="print-preview" :style="{ zoom: effectiveZoom }">
          <AncestorChartReport :root-person-id="ancestorRootId" :generations="ancestorGenerations" />
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
          <button class="btn-print" :disabled="!familyRelationshipId" @click="printCurrent">{{ $t('reports.print') }}</button>
          <button class="btn-pdf" :disabled="!familyRelationshipId" @click="exportPdf">{{ $t('reports.exportPdf') }}</button>
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
          <label>
            {{ $t('reports.person') }}
            <PersonPicker v-model="individualPersonId" :placeholder="$t('reports.selectPerson')" />
          </label>
        </div>
        <div class="print-actions">
          <button class="btn-print" :disabled="!individualPersonId" @click="printCurrent">{{ $t('reports.print') }}</button>
          <button class="btn-pdf" :disabled="!individualPersonId" @click="exportPdf">{{ $t('reports.exportPdf') }}</button>
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
            {{ $t('reports.ancestorBook.pickPerson') }}
            <PersonPicker v-model="ancestorBookPersonId" :placeholder="$t('reports.selectPerson')" />
          </label>
        </div>
        <div class="print-actions">
          <button class="btn-print" :disabled="!ancestorBookPersonId" @click="printCurrent">{{ $t('reports.print') }}</button>
          <button class="btn-pdf" :disabled="!ancestorBookPersonId" @click="exportPdf">{{ $t('reports.exportPdf') }}</button>
        </div>
      </div>
      <div ref="previewContainer" class="preview-area">
        <div v-if="ancestorBookPersonId" class="print-preview" :style="{ zoom: effectiveZoom }">
          <AncestorBookReport :person-id="ancestorBookPersonId" />
        </div>
        <div v-else class="empty-hint">{{ $t('reports.ancestorBook.noPersonSelected') }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import PersonPicker from '../components/PersonPicker.vue';
import AncestorChartReport from '../components/reports/AncestorChartReport.vue';
import FamilyGroupSheet from '../components/reports/FamilyGroupSheet.vue';
import IndividualSummary from '../components/reports/IndividualSummary.vue';
import AncestorBookReport from '../components/reports/AncestorBookReport.vue';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface RelationshipOption { id: string; label: string; }

const { t } = useI18n();

const activeTab = ref<'ancestor' | 'family' | 'individual' | 'ancestorBook'>('ancestor');
const tabs = computed(() => [
  { id: 'ancestor', label: t('reports.tabAncestor') },
  { id: 'family', label: t('reports.tabFamily') },
  { id: 'individual', label: t('reports.tabIndividual') },
  { id: 'ancestorBook', label: t('reports.tabAncestorBook') },
]);

const ancestorRootId = ref<string | null>(null);
const ancestorGenerations = ref(4);
const familyRelationshipId = ref('');
const coupleRelationships = ref<RelationshipOption[]>([]);
const individualPersonId = ref<string | null>(null);
const ancestorBookPersonId = ref<string | null>(null);

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
  const rels = (await window.api.relationships.list()) as Array<{
    id: string; type: string;
    person1_id: string | null;
    person2_id: string | null;
  }>;
  const couples = rels.filter(r => r.type === 'couple');
  const options: RelationshipOption[] = [];
  for (const r of couples) {
    const name1 = await getPersonName(r.person1_id);
    const name2 = await getPersonName(r.person2_id);
    options.push({ id: r.id, label: `${name1} & ${name2}` });
  }
  coupleRelationships.value = options;
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

/* Zoom controls */
.zoom-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}
.zoom-btn {
  background: #f0f4f8;
  color: #4a5568;
  border: 1px solid #c8d0db;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}
.zoom-btn:hover:not(:disabled) { background: #e2e8f0; }
.zoom-btn:disabled { opacity: 0.4; cursor: default; }
.zoom-fit-btn { font-size: 12px; padding: 4px 10px; }
.zoom-label {
  min-width: 44px;
  text-align: center;
  font-size: 13px;
  color: #555;
}

.tab-bar { display: flex; gap: 0; margin-bottom: 16px; border-bottom: 2px solid #e0e0e0; }
.tab-btn {
  padding: 8px 20px; border: none; background: none; cursor: pointer;
  font-size: 14px; color: #666; border-bottom: 2px solid transparent; margin-bottom: -2px;
}
.tab-btn.active { color: #2c3e50; font-weight: 600; border-bottom-color: #2c3e50; }

.tab-content { display: flex; flex-direction: column; gap: 12px; }

.tab-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;
}
.controls { display: flex; gap: 16px; flex-wrap: wrap; }
.controls label {
  display: flex; flex-direction: column; gap: 4px;
  font-size: 13px; font-weight: 600; color: #555; min-width: 200px;
}
.controls select {
  padding: 6px 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; font-family: inherit;
}
.print-actions { display: flex; gap: 8px; align-items: center; }
.btn-print, .btn-pdf {
  padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;
}
.btn-print { background: #2c3e50; color: white; }
.btn-pdf { background: #e74c3c; color: white; }
.btn-print:disabled, .btn-pdf:disabled { opacity: 0.5; cursor: default; }

/* Preview area: grey background with scrollable paper preview */
.preview-area {
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
.empty-hint { color: #999; font-size: 13px; padding: 40px; text-align: center; }

@media print {
  .view-header, .tab-bar, .tab-header { display: none !important; }
  .preview-area { background: none; padding: 0; min-height: auto; border-radius: 0; }
  .print-preview { zoom: 1 !important; box-shadow: none; min-height: auto; }
}
</style>
