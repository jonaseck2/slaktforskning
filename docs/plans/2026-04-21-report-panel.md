# ReportPanel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Move all report print-configuration controls into a ReportPanel side panel that matches the PersonPanel/PlacePanel visual pattern, so controls and preview are always visible at the same time without scrolling.

**Architecture:** Extract all report configuration state into a new Pinia store (useReportConfigStore). Create ReportPanel.vue that reads/writes the store directly. Refactor ReportsView.vue to use a side-by-side flex layout with all .tab-header blocks removed. Zoom controls stay in the preview pane unchanged.

**Tech Stack:** Vue 3 Composition API, Pinia, script setup lang ts, existing design tokens (tokens.css), vue-i18n.

**Design reference:** src/renderer/components/PersonPanel.vue and PlacePanel.vue for CSS token conventions.

---

### Task 1: Create useReportConfigStore

**Files:**
- Create: src/renderer/stores/reportConfig.ts

- [ ] **Step 1: Create the store file**

Create src/renderer/stores/reportConfig.ts with this content:

```typescript
import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import { useFocusStore } from './focus';
import type { PaperSize, Orientation, ColorMode } from '../../api/chart-export';
import type { ArcSpan } from '../utils/fanLayout';

export interface RelationshipOption { id: string; label: string; }

export const useReportConfigStore = defineStore('reportConfig', () => {
  const focusStore = useFocusStore();

  // Shared person subject: all person-based reports + chart prints.
  // Initialised once from focusStore; the panel picker controls it after that.
  const personId = ref<string | null>(focusStore.personId);

  // A Life
  const aLifeShowLifeMap        = ref(true);
  const aLifeShowPhotos         = ref(true);
  const aLifeShowDocuments      = ref(false);
  const aLifeShowSources        = ref(false);
  const aLifeShowNotes          = ref(true);
  const aLifeShowMediaCaptions  = ref(true);

  // Life on One Page
  const onePageOrientation = ref<'portrait' | 'landscape'>('portrait');
  const onePageShowLifeMap = ref(true);

  // Your Ancestors
  const yourAncestorsGenerations     = ref(4);
  const yourAncestorsColorMode       = ref<'bw' | 'branch' | 'sex' | 'themed'>('themed');
  const yourAncestorsDensity         = ref<'one' | 'two'>('one');
  const yourAncestorsShowEvents      = ref(true);
  const yourAncestorsShowExtraPhotos = ref(false);
  const yourAncestorsShowSources     = ref(false);

  // Family in Year X
  const familyInYearYear  = ref<number>(new Date().getFullYear() - 100);
  const familyInYearScope = ref<'all' | 'ancestors' | 'descendants'>('all');

  // Photo Album
  const photoAlbumSubjectType      = ref<'person' | 'relationship' | 'place' | 'all'>('person');
  const photoAlbumRelId            = ref('');
  const photoAlbumPlaceId          = ref('');
  const photoAlbumPerPage          = ref<1 | 2 | 4>(1);
  const photoAlbumShowCaptions     = ref(true);
  const photoAlbumShowIndex        = ref(false);
  const photoAlbumIncludeDocuments = ref(false);

  const photoAlbumSubjectId = computed<string | null>(() => {
    if (photoAlbumSubjectType.value === 'person')       return personId.value;
    if (photoAlbumSubjectType.value === 'relationship') return photoAlbumRelId.value   || null;
    if (photoAlbumSubjectType.value === 'place')        return photoAlbumPlaceId.value || null;
    return null;
  });
  const photoAlbumCanRender = computed(() =>
    photoAlbumSubjectType.value === 'all' || !!photoAlbumSubjectId.value
  );

  // Place Chronicle
  const placeChroniclePlaceId           = ref('');
  const placeChronicleShowBoundary      = ref(true);
  const placeChronicleShowChildPlaces   = ref(false);
  const placeChronicleShowPhotos        = ref(true);
  const placeChronicleShowNotes         = ref(true);
  const placeChronicleShowSources       = ref(false);
  const placeChronicleShowMediaCaptions = ref(true);

  // A Marriage
  const aMarriageRelId             = ref('');
  const aMarriageShowLifeMap       = ref(true);
  const aMarriageShowPhotos        = ref(true);
  const aMarriageShowNotes         = ref(true);
  const aMarriageShowSources       = ref(false);
  const aMarriageShowMediaCaptions = ref(true);

  // Shared privacy toggle (keepsake reports)
  const redactLiving = ref(false);

  // Fan chart
  const fanArcSpan   = ref<ArcSpan>(360);
  const fanColorMode = ref<'branch' | 'sex' | 'bw'>('bw');

  // Chart export: shared across chart-print tabs
  const chartPaperSize   = ref<PaperSize>('A2');
  const chartOrientation = ref<Orientation>('landscape');
  const chartColorMode   = ref<ColorMode>('themed');

  // Couple relationships: populated by ReportsView.onMounted
  const coupleRelationships = ref<RelationshipOption[]>([]);

  return {
    personId,
    aLifeShowLifeMap, aLifeShowPhotos, aLifeShowDocuments, aLifeShowSources,
    aLifeShowNotes, aLifeShowMediaCaptions,
    onePageOrientation, onePageShowLifeMap,
    yourAncestorsGenerations, yourAncestorsColorMode, yourAncestorsDensity,
    yourAncestorsShowEvents, yourAncestorsShowExtraPhotos, yourAncestorsShowSources,
    familyInYearYear, familyInYearScope,
    photoAlbumSubjectType, photoAlbumRelId, photoAlbumPlaceId, photoAlbumPerPage,
    photoAlbumShowCaptions, photoAlbumShowIndex, photoAlbumIncludeDocuments,
    photoAlbumSubjectId, photoAlbumCanRender,
    placeChroniclePlaceId, placeChronicleShowBoundary, placeChronicleShowChildPlaces,
    placeChronicleShowPhotos, placeChronicleShowNotes, placeChronicleShowSources,
    placeChronicleShowMediaCaptions,
    aMarriageRelId, aMarriageShowLifeMap, aMarriageShowPhotos, aMarriageShowNotes,
    aMarriageShowSources, aMarriageShowMediaCaptions,
    redactLiving,
    fanArcSpan, fanColorMode,
    chartPaperSize, chartOrientation, chartColorMode,
    coupleRelationships,
  };
});
```

- [ ] **Step 2: Lint**

Run: npm run lint
Expected: 0 errors

- [ ] **Step 3: Commit**

Run: git add src/renderer/stores/reportConfig.ts && git commit -m "feat(stores): report config store"

---

### Task 2: Add i18n keys

**Files:**
- Modify: src/renderer/i18n/en.ts
- Modify: src/renderer/i18n/sv.ts

chart.export.paperSize, chart.export.orientation, chart.export.saveTiledPdf, chart.export.tilesNeeded already exist. Only two new keys are needed.

- [ ] **Step 1: Add to en.ts**

Run: grep -n "reports:" src/renderer/i18n/en.ts | head -3

Inside the reports: { block, add a panel sub-object before the first existing nested key:

```
panel: {
  options: 'Options',
  appearance: 'Appearance',
},
```

- [ ] **Step 2: Add to sv.ts**

Run: grep -n "reports:" src/renderer/i18n/sv.ts | head -3

Add in the same structural location inside reports: {:

```
panel: {
  options: 'Alternativ',
  appearance: 'Utseende',
},
```

- [ ] **Step 3: Lint and commit**

Run: npm run lint

Run: git add src/renderer/i18n/en.ts src/renderer/i18n/sv.ts && git commit -m "feat(i18n): report panel section title keys"

---

### Task 3: Create ReportPanel.vue

**Files:**
- Create: src/renderer/components/ReportPanel.vue

Read src/renderer/components/PlacePanel.vue first to confirm the .panel-section, .panel-header, and .panel-section-body CSS conventions used in this codebase before writing this component.

- [ ] **Step 1: Create the component**

Create src/renderer/components/ReportPanel.vue with this template (script + style below):

TEMPLATE — shows Subject, Options, Appearance sections and sticky actions:

```vue
<template>
  <div class="report-panel">

    <div class="panel-header">
      <div class="panel-title">{{ reportTitle }}</div>
    </div>

    <!-- Subject -->
    <div class="panel-section">
      <SectionHeader :title="subjectSectionTitle" :collapsed="!open.subject" @toggle="open.subject = !open.subject" />
      <div v-if="open.subject" class="panel-section-body">

        <PersonPicker
          v-if="isPersonReport"
          :model-value="store.personId"
          :placeholder="$t('reports.selectPersonFirst')"
          @update:model-value="store.personId = $event"
        />

        <template v-else-if="activeTab === 'amarriage'">
          <select v-model="store.aMarriageRelId" class="panel-select">
            <option value="" disabled>{{ $t('reports.selectCouple') }}</option>
            <option v-for="rel in coupleRelationships" :key="rel.id" :value="rel.id">{{ rel.label }}</option>
          </select>
        </template>

        <PlacePicker
          v-else-if="activeTab === 'placeChronicle'"
          :model-value="store.placeChroniclePlaceId || null"
          :placeholder="$t('reports.selectPlaceFirst')"
          @update:model-value="store.placeChroniclePlaceId = $event ?? ''"
        />

        <template v-else-if="activeTab === 'photoAlbum'">
          <select v-model="store.photoAlbumSubjectType" class="panel-select">
            <option value="person">{{ $t('reports.photoAlbum.subjectPerson') }}</option>
            <option value="relationship">{{ $t('reports.photoAlbum.subjectRelationship') }}</option>
            <option value="place">{{ $t('reports.photoAlbum.subjectPlace') }}</option>
            <option value="all">{{ $t('reports.photoAlbum.subjectAll') }}</option>
          </select>
          <PersonPicker v-if="store.photoAlbumSubjectType === 'person'" :model-value="store.personId" :placeholder="$t('reports.selectPersonFirst')" @update:model-value="store.personId = $event" />
          <select v-else-if="store.photoAlbumSubjectType === 'relationship'" v-model="store.photoAlbumRelId" class="panel-select">
            <option value="" disabled>{{ $t('reports.selectCouple') }}</option>
            <option v-for="rel in coupleRelationships" :key="rel.id" :value="rel.id">{{ rel.label }}</option>
          </select>
          <PlacePicker v-else-if="store.photoAlbumSubjectType === 'place'" :model-value="store.photoAlbumPlaceId || null" :placeholder="$t('reports.selectPlaceFirst')" @update:model-value="store.photoAlbumPlaceId = $event ?? ''" />
        </template>

        <template v-else-if="activeTab === 'familyInYear'">
          <div class="panel-control">
            <label class="panel-label">{{ $t('reports.familyInYear.year') }}</label>
            <input type="number" v-model.number="store.familyInYearYear" class="panel-input" min="1" max="9999" />
          </div>
          <div class="panel-control">
            <label class="panel-label">{{ $t('reports.familyInYear.scope') }}</label>
            <select v-model="store.familyInYearScope" class="panel-select">
              <option value="all">{{ $t('reports.familyInYear.scopeAll') }}</option>
              <option value="ancestors" disabled>{{ $t('reports.familyInYear.scopeAncestors') }}</option>
              <option value="descendants" disabled>{{ $t('reports.familyInYear.scopeDescendants') }}</option>
            </select>
          </div>
        </template>

      </div>
    </div>

    <!-- Options (keepsake reports only) -->
    <div v-if="!isChartPrint" class="panel-section">
      <SectionHeader :title="$t('reports.panel.options')" :collapsed="!open.options" @toggle="open.options = !open.options" />
      <div v-if="open.options" class="panel-section-body">

        <template v-if="activeTab === 'alife'">
          <label class="panel-checkbox"><input type="checkbox" v-model="store.aLifeShowLifeMap">      {{ $t('reports.common.lifeMap') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.aLifeShowPhotos">        {{ $t('reports.common.photos') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.aLifeShowDocuments">     {{ $t('reports.common.documents') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.aLifeShowSources">       {{ $t('reports.common.sources') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.aLifeShowNotes">         {{ $t('reports.alife.biography') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.aLifeShowMediaCaptions"> {{ $t('reports.common.captions') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.redactLiving">           {{ $t('reports.common.redactLiving') }}</label>
        </template>

        <template v-else-if="activeTab === 'amarriage'">
          <label class="panel-checkbox"><input type="checkbox" v-model="store.aMarriageShowLifeMap">       {{ $t('reports.common.lifeMap') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.aMarriageShowPhotos">         {{ $t('reports.common.photos') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.aMarriageShowNotes">          {{ $t('reports.amarriage.narrative') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.aMarriageShowSources">        {{ $t('reports.common.sources') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.aMarriageShowMediaCaptions">  {{ $t('reports.common.captions') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.redactLiving">                {{ $t('reports.common.redactLiving') }}</label>
        </template>

        <template v-else-if="activeTab === 'placeChronicle'">
          <label class="panel-checkbox"><input type="checkbox" v-model="store.placeChronicleShowBoundary">      {{ $t('reports.placeChronicle.map') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.placeChronicleShowChildPlaces">   {{ $t('reports.placeChronicle.childPlaces') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.placeChronicleShowPhotos">        {{ $t('reports.common.photos') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.placeChronicleShowNotes">         {{ $t('reports.placeChronicle.description') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.placeChronicleShowSources">       {{ $t('reports.common.sources') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.placeChronicleShowMediaCaptions"> {{ $t('reports.common.captions') }}</label>
        </template>

        <template v-else-if="activeTab === 'yourAncestors'">
          <label class="panel-checkbox"><input type="checkbox" v-model="store.yourAncestorsShowEvents">       {{ $t('reports.alife.events') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.yourAncestorsShowExtraPhotos">  {{ $t('reports.common.photos') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.yourAncestorsShowSources">      {{ $t('reports.common.sources') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.redactLiving">                  {{ $t('reports.common.redactLiving') }}</label>
        </template>

        <template v-else-if="activeTab === 'onePage'">
          <label class="panel-checkbox"><input type="checkbox" v-model="store.onePageShowLifeMap"> {{ $t('reports.common.lifeMap') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.redactLiving">       {{ $t('reports.common.redactLiving') }}</label>
        </template>

        <template v-else-if="activeTab === 'familyInYear'">
          <label class="panel-checkbox"><input type="checkbox" v-model="store.redactLiving"> {{ $t('reports.common.redactLiving') }}</label>
        </template>

        <template v-else-if="activeTab === 'photoAlbum'">
          <label class="panel-checkbox"><input type="checkbox" v-model="store.photoAlbumShowCaptions">      {{ $t('reports.photoAlbum.showCaptions') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.photoAlbumShowIndex">          {{ $t('reports.photoAlbum.showIndex') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.photoAlbumIncludeDocuments">   {{ $t('reports.photoAlbum.includeDocuments') }}</label>
        </template>

      </div>
    </div>

    <!-- Appearance -->
    <div v-if="hasAppearance" class="panel-section">
      <SectionHeader :title="$t('reports.panel.appearance')" :collapsed="!open.appearance" @toggle="open.appearance = !open.appearance" />
      <div v-if="open.appearance" class="panel-section-body">

        <template v-if="activeTab === 'onePage'">
          <div class="panel-control">
            <span class="panel-label">{{ $t('reports.onePage.orientation') }}</span>
            <div class="panel-toggle-btns">
              <button :class="{ active: store.onePageOrientation === 'portrait' }"  @click="store.onePageOrientation = 'portrait'">{{ $t('reports.onePage.portrait') }}</button>
              <button :class="{ active: store.onePageOrientation === 'landscape' }" @click="store.onePageOrientation = 'landscape'">{{ $t('reports.onePage.landscape') }}</button>
            </div>
          </div>
        </template>

        <template v-else-if="activeTab === 'yourAncestors'">
          <div class="panel-control">
            <label class="panel-label">{{ $t('chart.export.colorMode') }}</label>
            <select v-model="store.yourAncestorsColorMode" class="panel-select">
              <option value="themed">{{ $t('reports.yourAncestors.colorThemed') }}</option>
              <option value="branch">{{ $t('visualization.fanColorBranch') }}</option>
              <option value="sex">{{ $t('visualization.fanColorSex') }}</option>
              <option value="bw">{{ $t('chart.export.blackWhite') }}</option>
            </select>
          </div>
          <div class="panel-control">
            <label class="panel-label">{{ $t('reports.yourAncestors.density') }}</label>
            <select v-model="store.yourAncestorsDensity" class="panel-select">
              <option value="one">{{ $t('reports.yourAncestors.densityOne') }}</option>
              <option value="two">{{ $t('reports.yourAncestors.densityTwo') }}</option>
            </select>
          </div>
          <div class="panel-control">
            <div class="panel-range-row">
              <span class="panel-label">{{ $t('reports.generations') }}</span>
              <span class="panel-range-value">{{ store.yourAncestorsGenerations }}</span>
            </div>
            <input type="range" min="4" max="10" step="1" v-model.number="store.yourAncestorsGenerations" class="panel-range" />
          </div>
        </template>

        <template v-else-if="activeTab === 'photoAlbum'">
          <div class="panel-control">
            <label class="panel-label">{{ $t('reports.photoAlbum.perPage') }}</label>
            <select v-model.number="store.photoAlbumPerPage" class="panel-select">
              <option :value="1">1</option>
              <option :value="2">2</option>
              <option :value="4">4</option>
            </select>
          </div>
        </template>

        <template v-else-if="isChartPrint">
          <div class="panel-control">
            <label class="panel-label">{{ $t('chart.export.paperSize') }}</label>
            <select v-model="store.chartPaperSize" class="panel-select">
              <option value="A4">A4</option><option value="A3">A3</option>
              <option value="A2">A2</option><option value="A1">A1</option>
              <option value="Letter">Letter</option><option value="Tabloid">Tabloid</option>
            </select>
          </div>
          <div class="panel-control">
            <span class="panel-label">{{ $t('chart.export.orientation') }}</span>
            <div class="panel-toggle-btns">
              <button :class="{ active: store.chartOrientation === 'portrait' }"  @click="store.chartOrientation = 'portrait'">{{ $t('chart.export.portrait') }}</button>
              <button :class="{ active: store.chartOrientation === 'landscape' }" @click="store.chartOrientation = 'landscape'">{{ $t('chart.export.landscape') }}</button>
            </div>
          </div>
          <div class="panel-control">
            <label class="panel-label">{{ $t('chart.export.colorMode') }}</label>
            <select v-model="store.chartColorMode" class="panel-select">
              <option value="themed">{{ $t('reports.yourAncestors.colorThemed') }}</option>
              <option value="sex-colored">{{ $t('chart.export.sexColored') }}</option>
              <option value="bw">{{ $t('chart.export.blackWhite') }}</option>
            </select>
          </div>
          <template v-if="activeTab === 'fanChart'">
            <div class="panel-control">
              <label class="panel-label">{{ $t('chart.export.colorMode') }}</label>
              <select v-model="store.fanColorMode" class="panel-select">
                <option value="branch">{{ $t('visualization.fanColorBranch') }}</option>
                <option value="sex">{{ $t('visualization.fanColorSex') }}</option>
                <option value="bw">{{ $t('chart.export.blackWhite') }}</option>
              </select>
            </div>
            <div class="panel-control">
              <span class="panel-label">{{ $t('visualization.fan.arc') }}</span>
              <div class="panel-toggle-btns" style="flex-wrap: wrap; gap: 4px;">
                <button v-for="span in fanArcOptions" :key="span" :class="{ active: store.fanArcSpan === span }" @click="store.fanArcSpan = (span as ArcSpan)">{{ span }}deg</button>
              </div>
            </div>
            <div class="panel-control">
              <div class="panel-range-row"><span class="panel-label">{{ $t('reports.generations') }}</span><span class="panel-range-value">{{ fanGenerations }}</span></div>
              <input type="range" min="3" max="8" step="1" v-model.number="fanGenerations" class="panel-range" />
            </div>
          </template>
          <template v-if="activeTab === 'pedigreePrint'">
            <div class="panel-control">
              <div class="panel-range-row"><span class="panel-label">{{ $t('reports.generations') }}</span><span class="panel-range-value">{{ pedigreeGenerations }}</span></div>
              <input type="range" min="2" max="10" step="1" v-model.number="pedigreeGenerations" class="panel-range" />
            </div>
          </template>
          <template v-else-if="activeTab === 'hourglassChart'">
            <div class="panel-control">
              <div class="panel-range-row"><span class="panel-label">{{ $t('reports.generations') }}</span><span class="panel-range-value">{{ hourglassGenerations }}</span></div>
              <input type="range" min="2" max="8" step="1" v-model.number="hourglassGenerations" class="panel-range" />
            </div>
          </template>
          <template v-else-if="activeTab === 'descendantChart'">
            <div class="panel-control">
              <div class="panel-range-row"><span class="panel-label">{{ $t('reports.generations') }}</span><span class="panel-range-value">{{ descendantGenerations }}</span></div>
              <input type="range" min="2" max="8" step="1" v-model.number="descendantGenerations" class="panel-range" />
            </div>
          </template>
          <template v-else-if="activeTab === 'timeline'">
            <div class="panel-control">
              <div class="panel-range-row"><span class="panel-label">{{ $t('reports.generations') }}</span><span class="panel-range-value">{{ timelineGenerations }}</span></div>
              <input type="range" min="1" max="10" step="1" v-model.number="timelineGenerations" class="panel-range" />
            </div>
          </template>
          <p v-if="tileCountInfo" class="panel-tile-info">
            {{ $t('chart.export.tilesNeeded', { count: tileCountInfo.count, cols: tileCountInfo.cols, rows: tileCountInfo.rows }) }}
          </p>
        </template>

      </div>
    </div>

    <!-- Sticky print/export actions -->
    <div class="panel-actions">
      <AppButton variant="primary"   :disabled="!canPrint" @click="emit('print')"          class="panel-action-btn">{{ $t('reports.print') }}</AppButton>
      <AppButton variant="secondary" :disabled="!canPrint" @click="emit('export-pdf')"      class="panel-action-btn">{{ $t('reports.exportPdf') }}</AppButton>
      <template v-if="isChartPrint">
        <AppButton variant="secondary" :disabled="!canPrint" @click="emit('save-svg')"       class="panel-action-btn">{{ $t('chart.export.saveSvg') }}</AppButton>
        <AppButton variant="secondary" :disabled="!canPrint" @click="emit('save-chart-pdf')" class="panel-action-btn">{{ $t('chart.export.saveTiledPdf') }}</AppButton>
      </template>
    </div>

  </div>
</template>
```

SCRIPT section:

```vue
<script setup lang="ts">
import { computed, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import SectionHeader from './ui/SectionHeader.vue';
import AppButton from './ui/AppButton.vue';
import PersonPicker from './PersonPicker.vue';
import PlacePicker from './PlacePicker.vue';
import { useReportConfigStore } from '../stores/reportConfig';
import {
  pedigreeGenerations,
  hourglassGenerations,
  descendantGenerations,
  timelineGenerations,
  fanGenerations,
} from '../composables/useChartGenerations';
import type { ArcSpan } from '../utils/fanLayout';

interface TileCount { count: number; rows: number; cols: number; }
interface RelationshipOption { id: string; label: string; }

const props = defineProps<{
  activeTab: string;
  coupleRelationships: RelationshipOption[];
  tileCountInfo: TileCount | null;
}>();

const emit = defineEmits<{
  print: [];
  'export-pdf': [];
  'save-svg': [];
  'save-chart-pdf': [];
}>();

const { t } = useI18n();
const store = useReportConfigStore();

const fanArcOptions: ArcSpan[] = [180, 210, 240, 270, 360];

// Subject and Options open by default; Appearance collapsed.
const open = reactive({ subject: true, options: true, appearance: false });

const isPersonReport = computed(() =>
  ['alife', 'yourAncestors', 'onePage',
   'pedigreePrint', 'hourglassChart', 'descendantChart', 'fanChart', 'timeline'].includes(props.activeTab)
);

const isChartPrint = computed(() =>
  ['pedigreePrint', 'hourglassChart', 'descendantChart', 'fanChart', 'timeline'].includes(props.activeTab)
);

const hasAppearance = computed(() =>
  ['onePage', 'yourAncestors', 'photoAlbum',
   'pedigreePrint', 'hourglassChart', 'descendantChart', 'fanChart', 'timeline'].includes(props.activeTab)
);

const canPrint = computed(() => {
  switch (props.activeTab) {
    case 'amarriage':      return !!store.aMarriageRelId;
    case 'placeChronicle': return !!store.placeChroniclePlaceId;
    case 'familyInYear':   return !!store.familyInYearYear;
    case 'photoAlbum':     return store.photoAlbumCanRender;
    default:               return !!store.personId;
  }
});

const reportTitle = computed(() => {
  const map: Record<string, string> = {
    alife:           t('reports.alife.title'),
    amarriage:       t('reports.amarriage.title'),
    placeChronicle:  t('reports.placeChronicle.title'),
    yourAncestors:   t('reports.yourAncestors.tabTitle'),
    onePage:         t('reports.onePage.title'),
    familyInYear:    t('reports.familyInYear.tabTitle'),
    photoAlbum:      t('reports.photoAlbum.tabTitle'),
    pedigreePrint:   t('reports.pedigreePrint.title'),
    hourglassChart:  t('reports.tabHourglassChart'),
    descendantChart: t('reports.tabDescendantChart'),
    fanChart:        t('reports.tabFanChart'),
    timeline:        t('reports.tabTimeline'),
  };
  return map[props.activeTab] ?? '';
});

const subjectSectionTitle = computed(() => {
  if (props.activeTab === 'amarriage')      return t('reports.couple');
  if (props.activeTab === 'placeChronicle') return t('reports.place');
  if (props.activeTab === 'familyInYear')   return t('reports.familyInYear.year');
  return t('common.person');
});
</script>
```

STYLE section:

```vue
<style scoped>
.report-panel {
  width: 240px;
  flex-shrink: 0;
  background: var(--surface);
  border-left: 1px solid var(--surface-border);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}
.panel-header {
  padding: var(--space-md) var(--space-md) var(--space-sm);
  border-bottom: 1px solid var(--surface-border);
}
.panel-title { font-size: var(--font-md); font-weight: 600; color: var(--text-primary); }
.panel-section { border-bottom: 1px solid var(--surface-border-subtle); }
.panel-section-body {
  padding: var(--space-xs) var(--space-md) var(--space-sm);
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}
.panel-checkbox { display: flex; align-items: center; gap: var(--space-sm); font-size: var(--font-sm); color: var(--text-primary); cursor: pointer; }
.panel-checkbox input[type="checkbox"] { accent-color: var(--accent); width: 13px; height: 13px; flex-shrink: 0; }
.panel-select,
.panel-input {
  width: 100%;
  font-size: var(--font-sm);
  padding: 3px var(--space-xs);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  background: var(--surface-bg);
  color: var(--text-primary);
}
.panel-label { font-size: var(--font-xs); color: var(--text-muted); margin-bottom: 2px; display: block; }
.panel-control { display: flex; flex-direction: column; gap: 2px; }
.panel-toggle-btns { display: flex; gap: var(--space-xs); }
.panel-toggle-btns button {
  flex: 1;
  padding: var(--space-xs) 0;
  font-size: var(--font-xs);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  background: var(--surface-bg);
  color: var(--text-secondary);
  cursor: pointer;
}
.panel-toggle-btns button.active {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--accent);
}
.panel-range { width: 100%; accent-color: var(--accent); }
.panel-range-row { display: flex; justify-content: space-between; align-items: center; }
.panel-range-value { font-size: var(--font-xs); color: var(--accent); font-weight: 600; }
.panel-tile-info { font-size: var(--font-xs); color: var(--text-muted); font-style: italic; margin: 0; }
.panel-actions {
  margin-top: auto;
  padding: var(--space-sm) var(--space-md);
  border-top: 1px solid var(--surface-border);
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  background: var(--surface);
}
.panel-action-btn { width: 100%; }
</style>
```

- [ ] **Step 2: Lint**

Run: npm run lint
Expected: 0 errors

- [ ] **Step 3: Commit**

Run: git add src/renderer/components/ReportPanel.vue && git commit -m "feat(components): ReportPanel side panel"

---

### Task 4: Refactor ReportsView.vue

**Files:**
- Modify: src/renderer/views/ReportsView.vue

Read the full file before starting. This task has four step groups.

#### A — Script

- [ ] **Step A1: Add imports and remove migrated state**

At the top of script setup, add:

```typescript
import { useReportConfigStore } from '../stores/reportConfig';
import ReportPanel from '../components/ReportPanel.vue';
const store = useReportConfigStore();
```

Delete these ref/computed declarations (now in the store):
yourAncestorsPersonId, yourAncestorsGenerations, yourAncestorsColorMode, yourAncestorsDensity,
yourAncestorsShowEvents, yourAncestorsShowLifeMap, yourAncestorsShowExtraPhotos, yourAncestorsShowSources,
aLifePersonId, aLifeShowLifeMap, aLifeShowPhotos, aLifeShowDocuments, aLifeShowSources, aLifeShowNotes, aLifeShowMediaCaptions,
onePagePersonId, onePageOrientation, onePageShowLifeMap,
familyInYearYear, familyInYearScope, familyInYearPersonId,
photoAlbumSubjectType, photoAlbumPersonId, photoAlbumRelId, photoAlbumPlaceId, photoAlbumPerPage,
photoAlbumShowCaptions, photoAlbumShowIndex, photoAlbumIncludeDocuments, photoAlbumSubjectId, photoAlbumCanRender,
placeChroniclePlaceId, placeChronicleShowBoundary, placeChronicleShowChildPlaces,
placeChronicleShowPhotos, placeChronicleShowNotes, placeChronicleShowSources, placeChronicleShowMediaCaptions,
aMarriageRelId, aMarriageShowLifeMap, aMarriageShowPhotos, aMarriageShowNotes, aMarriageShowSources, aMarriageShowMediaCaptions,
redactLiving, fanArcSpan, fanColorMode, chartPaperSize, chartOrientation, chartColorMode,
allPlaces (also remove its loading in onMounted),
chartPersonId (was computed(() => focusStore.personId)).

Keep coupleRelationships as a local ref — it is passed to ReportPanel as a prop.

- [ ] **Step A2: Update chartTileCount, exportPdf, saveChartPdf**

Replace in chartTileCount: chartPaperSize.value -> store.chartPaperSize, chartOrientation.value -> store.chartOrientation.

Updated chartTileCount:
```typescript
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
```

Updated exportPdf:
```typescript
async function exportPdf() {
  const chartTabs = ['pedigreePrint', 'hourglassChart', 'descendantChart'];
  const landscape = chartTabs.includes(activeTab.value) ? store.chartOrientation === 'landscape' : false;
  await window.api.print.exportPdf(exportPdfFilename(), landscape);
}
```

In saveChartPdf, replace chartPaperSize.value -> store.chartPaperSize and chartOrientation.value -> store.chartOrientation throughout.

If fanRenderColorMode is defined and not used anywhere else, delete it.

- [ ] **Step A3: Simplify triggerLoading watches**

```typescript
watch(activeTab,                           triggerLoading);
watch(() => store.personId,                triggerLoading);
watch(() => store.familyInYearYear,        triggerLoading);
watch(() => store.familyInYearScope,       triggerLoading);
watch(() => store.photoAlbumSubjectType,   triggerLoading);
watch(() => store.photoAlbumSubjectId,     triggerLoading);
watch(() => store.placeChroniclePlaceId,   triggerLoading);
watch(() => store.aMarriageRelId,          triggerLoading);
```

- [ ] **Step A4: Update onMounted to write defaults to store**

```typescript
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
  store.coupleRelationships = options;

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

  const tabParam = route.query.tab as string | undefined;
  const validTabs = ['yourAncestors', 'alife', 'onePage', 'familyInYear', 'photoAlbum',
    'placeChronicle', 'amarriage', 'pedigreePrint', 'hourglassChart',
    'descendantChart', 'fanChart', 'timeline'];
  if (tabParam && validTabs.includes(tabParam)) activeTab.value = tabParam as typeof activeTab.value;
  if (route.query.placeId)        store.placeChroniclePlaceId = route.query.placeId as string;
  if (route.query.relationshipId) store.aMarriageRelId        = route.query.relationshipId as string;
});
```

#### B — Template

- [ ] **Step B1: Add .reports-body wrapper and ReportPanel**

Wrap all tab-content divs and ZoomControls in a .reports-body div, and place ReportPanel inside it:

```html
<div class="reports-body">
  <!-- tab-content divs go here, with tab-header blocks removed -->
  <ZoomControls :zoom="effectiveZoom" :show-fit="true" @zoom-in="zoomIn" @zoom-out="zoomOut" @reset="resetZoom" />
  <ReportPanel
    :active-tab="activeTab"
    :couple-relationships="store.coupleRelationships"
    :tile-count-info="chartTileCount"
    @print="printCurrent"
    @export-pdf="exportPdf"
    @save-svg="saveChartSvg"
    @save-chart-pdf="saveChartPdf"
  />
</div>
```

- [ ] **Step B2: Remove all .tab-header blocks (12 tabs)**

For each tab div (yourAncestors, alife, onePage, familyInYear, photoAlbum, placeChronicle, amarriage, pedigreePrint, hourglassChart, descendantChart, fanChart, timeline): delete the entire <div class="tab-header">...</div> child element. Keep <div ref="previewContainer" class="preview-area"> and its contents unchanged.

- [ ] **Step B3: Update report component props to use store**

Replace old ref bindings with store.* in every report component inside .preview-area. Key substitutions:

- :person-id="aLifePersonId" -> :person-id="store.personId"
- :person-id="yourAncestorsPersonId" -> :person-id="store.personId"
- :person-id="onePagePersonId" -> :person-id="store.personId"
- :person-id="chartPersonId" -> :person-id="store.personId"
- v-if="aLifePersonId" -> v-if="store.personId"
- v-if="chartPersonId" -> v-if="store.personId"
- v-if="photoAlbumCanRender" -> v-if="store.photoAlbumCanRender"
- :subject-id="photoAlbumSubjectId" -> :subject-id="store.photoAlbumSubjectId"
- :show-life-map="aLifeShowLifeMap" -> :show-life-map="store.aLifeShowLifeMap"
- :redact-living="redactLiving" -> :redact-living="store.redactLiving"
- :color-mode="chartColorMode" -> :color-mode="store.chartColorMode"
- :arc-span="fanArcSpan" -> :arc-span="store.fanArcSpan"
- :color-mode="fanColorMode" -> :color-mode="store.fanColorMode"

Apply the store.* pattern to all remaining props (all options, appearance settings, and IDs).

#### C — Styles

- [ ] **Step C1: Add .reports-body layout CSS**

Add to style scoped:

```css
.reports-body {
  display: flex;
  flex: 1;
  overflow: hidden;
  min-height: 0;
}
.tab-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
```

Remove unused rules: .tab-header, .controls-row, .toggles-row, .print-actions, .arc-buttons, .range-value.

#### D — Verify

- [ ] **Step D1: Lint and start the app**

Run: npm run lint
Expected: 0 errors

Run: npm start

Open the Reports view and verify all 12 tabs:
1. Tab bar (FilterChips) shows at top, unchanged.
2. ReportPanel appears on the right side for every tab.
3. Subject section shows the correct picker: PersonPicker for person-based reports, couple select for A Marriage, PlacePicker for Place Chronicle, mode selector for Photo Album, year input for Family in Year.
4. Selecting a subject renders the report preview.
5. Toggling Options checkboxes updates the preview live.
6. Appearance section is visible for: Life on One Page, Your Ancestors, Photo Album, and all chart print tabs.
7. Print and Export PDF buttons are disabled until a subject is selected; they trigger correctly.
8. Chart print tabs show Save SVG and Save PDF buttons as well.
9. Zoom controls in the preview pane still work.
10. Deep-link query params (?tab=, ?placeId=, ?relationshipId=) still work.

- [ ] **Step E: Commit**

Run: git add src/renderer/views/ReportsView.vue && git commit -m "feat(reports): ReportPanel side panel, remove inline tab-header controls"

---

### Task 5: Update docs

**Files:**
- Modify: CLAUDE.md
- Modify: .claude/skills/frontend-design/SKILL.md

- [ ] **Step 1: Add ReportPanel to CLAUDE.md Domain Components table**

After the ChartExportControls row, add:

| ReportPanel | activeTab: string, coupleRelationships: RelationshipOption[], tileCountInfo: {count,rows,cols}|null | print, export-pdf, save-svg, save-chart-pdf | Right-side print-configuration panel following the PersonPanel/PlacePanel pattern. Sections: Subject (person/couple/place picker), Options (checkboxes), Appearance (selects, ranges, orientation toggle). Print/Export buttons sticky at bottom. All config state lives in useReportConfigStore. Used in ReportsView alongside the report preview. |

- [ ] **Step 2: Add useReportConfigStore to Pinia Stores table**

| reportConfig | All print-configuration state for reports: subject IDs (person/couple/place), per-report toggle flags, appearance settings, couple relationships list. Shared between ReportsView and ReportPanel. |

- [ ] **Step 3: Update .claude/skills/frontend-design/SKILL.md**

Add a note in the panels section that ReportPanel follows the same PersonPanel/PlacePanel structure but sources config from useReportConfigStore rather than window.api, and that changes in the panel are immediately reflected in the adjacent report preview without scrolling.

- [ ] **Step 4: Commit**

Run: git add CLAUDE.md .claude/skills/frontend-design/SKILL.md && git commit -m "docs: document ReportPanel and useReportConfigStore"
