<template>
  <EntityPanel
    entity-type="report"
    :entity="{ id: 'report' }"
    :label="$t('panel.manageReport')"
    @close="emit('close')"
  >
    <template #empty>{{ $t('panel.selectToView') }}</template>
    <template #header>
      <div class="panel-name-row">
        <div class="panel-name">{{ reportTitle }}</div>
      </div>
    </template>

    <!-- Subject -->
    <div class="panel-section">
      <SectionHeader :title="subjectSectionTitle" :collapsed="!open.subject" @toggle="toggleSection('subject')" />
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

    <!-- Header/footer (keepsake reports only) -->
    <div v-if="!isChartPrint" class="panel-section">
      <SectionHeader :title="$t('reports.panel.headerFooter')" :collapsed="!open.headerFooter" @toggle="toggleSection('headerFooter')" />
      <div v-if="open.headerFooter" class="panel-section-body">
        <label class="panel-checkbox">
          <input type="checkbox" v-model="store.showHeaderFooter">
          {{ $t('reports.panel.showHeaderFooter') }}
        </label>
        <p class="panel-hint">{{ $t('reports.panel.headerFooterHint') }}</p>
        <label class="panel-checkbox">
          <input type="checkbox" v-model="store.linkifyNotes">
          {{ $t('reports.panel.linkifyNotes') }}
        </label>
        <p class="panel-hint">{{ $t('reports.panel.linkifyNotesHint') }}</p>
      </div>
    </div>

    <!-- Options (keepsake reports only) -->
    <div v-if="!isChartPrint" class="panel-section">
      <SectionHeader :title="$t('reports.panel.options')" :collapsed="!open.options" @toggle="toggleSection('options')" />
      <div v-if="open.options" class="panel-section-body">

        <template v-if="activeTab === 'alife'">
          <label class="panel-checkbox"><input type="checkbox" v-model="store.aLifeShowLifeMap">      {{ $t('reports.common.lifeMap') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.aLifeShowMapCaption" :disabled="!store.aLifeShowLifeMap"> {{ $t('reports.common.mapCaption') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.aLifeShowPhotos">        {{ $t('reports.common.photos') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.aLifeShowDocuments">     {{ $t('reports.common.documents') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.aLifeShowSources">       {{ $t('reports.common.sources') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.aLifeShowNotes">         {{ $t('reports.alife.biography') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.aLifeShowMediaCaptions"> {{ $t('reports.common.captions') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.aLifeShowMediaNotes">    {{ $t('reports.common.photoNotes') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.aLifeIncludeChildrenMarriages"> {{ $t('reports.alife.includeChildrenMarriages') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.aLifeIncludeSiblingDeaths">     {{ $t('reports.alife.includeSiblingDeaths') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.aLifeShowBirthNameParenthetical"> {{ $t('reports.options.showBirthNameParenthetical') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.redactLiving">           {{ $t('reports.common.redactLiving') }}</label>
        </template>

        <template v-else-if="activeTab === 'amarriage'">
          <label class="panel-checkbox"><input type="checkbox" v-model="store.aMarriageShowLifeMap">       {{ $t('reports.common.lifeMap') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.aMarriageShowMapCaption" :disabled="!store.aMarriageShowLifeMap"> {{ $t('reports.common.mapCaption') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.aMarriageShowPhotos">         {{ $t('reports.common.photos') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.aMarriageShowNotes">          {{ $t('reports.amarriage.narrative') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.aMarriageShowSources">        {{ $t('reports.common.sources') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.aMarriageShowMediaCaptions">  {{ $t('reports.common.captions') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.aMarriageShowMediaNotes">     {{ $t('reports.common.photoNotes') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.aMarriageShowBirthNameParenthetical"> {{ $t('reports.options.showBirthNameParenthetical') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.redactLiving">                {{ $t('reports.common.redactLiving') }}</label>
        </template>

        <template v-else-if="activeTab === 'placeChronicle'">
          <label class="panel-checkbox"><input type="checkbox" v-model="store.placeChronicleShowBoundary">      {{ $t('reports.placeChronicle.map') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.placeChronicleShowChildPlaces">   {{ $t('reports.placeChronicle.childPlaces') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.placeChronicleShowPhotos">        {{ $t('reports.common.photos') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.placeChronicleShowNotes">         {{ $t('reports.placeChronicle.description') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.placeChronicleShowSources">       {{ $t('reports.common.sources') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.placeChronicleShowMediaCaptions"> {{ $t('reports.common.captions') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.placeChronicleShowMediaNotes">    {{ $t('reports.common.photoNotes') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.placeChronicleShowBirthNameParenthetical"> {{ $t('reports.options.showBirthNameParenthetical') }}</label>
        </template>

        <template v-else-if="activeTab === 'yourAncestors'">
          <label class="panel-checkbox"><input type="checkbox" v-model="store.yourAncestorsShowEvents">         {{ $t('reports.alife.events') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.yourAncestorsShowLifeMap">        {{ $t('reports.common.lifeMap') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.yourAncestorsShowMapCaption" :disabled="!store.yourAncestorsShowLifeMap"> {{ $t('reports.common.mapCaption') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.yourAncestorsShowExtraPhotos">    {{ $t('reports.common.photos') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.yourAncestorsShowMediaCaptions"> {{ $t('reports.common.captions') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.yourAncestorsShowMediaNotes">    {{ $t('reports.common.photoNotes') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.yourAncestorsShowSources">        {{ $t('reports.common.sources') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.yourAncestorsShowBirthNameParenthetical"> {{ $t('reports.options.showBirthNameParenthetical') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.redactLiving">                    {{ $t('reports.common.redactLiving') }}</label>
        </template>

        <template v-else-if="activeTab === 'onePage'">
          <label class="panel-checkbox"><input type="checkbox" v-model="store.onePageShowLifeMap">    {{ $t('reports.common.lifeMap') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.onePageShowMapCaption" :disabled="!store.onePageShowLifeMap"> {{ $t('reports.common.mapCaption') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.lifeOnOnePageShowBirthNameParenthetical"> {{ $t('reports.options.showBirthNameParenthetical') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.redactLiving">          {{ $t('reports.common.redactLiving') }}</label>
        </template>

        <template v-else-if="activeTab === 'familyInYear'">
          <label class="panel-checkbox"><input type="checkbox" v-model="store.familyInYearShowBirthNameParenthetical"> {{ $t('reports.options.showBirthNameParenthetical') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.redactLiving"> {{ $t('reports.common.redactLiving') }}</label>
        </template>

        <template v-else-if="activeTab === 'photoAlbum'">
          <label class="panel-checkbox"><input type="checkbox" v-model="store.photoAlbumShowCaptions">      {{ $t('reports.photoAlbum.showCaptions') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.photoAlbumShowNotes">          {{ $t('reports.photoAlbum.showNotes') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.photoAlbumShowIndex">          {{ $t('reports.photoAlbum.showIndex') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.photoAlbumIncludeDocuments">   {{ $t('reports.photoAlbum.includeDocuments') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="store.photoAlbumShowBirthNameParenthetical"> {{ $t('reports.options.showBirthNameParenthetical') }}</label>
        </template>

      </div>
    </div>

    <!-- Report / Chart appearance -->
    <div v-if="hasAppearance" class="panel-section">
      <SectionHeader :title="appearanceSectionTitle" :collapsed="!open.appearance" @toggle="toggleSection('appearance')" />
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
            <label class="panel-label">{{ $t('chart.export.colorMode') }}</label>
            <select v-if="activeTab !== 'fanChart'" v-model="store.chartColorMode" class="panel-select">
              <option value="themed">{{ $t('chart.export.themed') }}</option>
              <option value="sex-colored">{{ $t('chart.export.sexColored') }}</option>
              <option value="bw">{{ $t('chart.export.blackWhite') }}</option>
            </select>
            <select v-else v-model="store.fanColorMode" class="panel-select">
              <option value="branch">{{ $t('visualization.fanColorBranch') }}</option>
              <option value="sex">{{ $t('visualization.fanColorSex') }}</option>
              <option value="bw">{{ $t('chart.export.blackWhite') }}</option>
            </select>
          </div>
          <template v-if="activeTab === 'fanChart'">
            <div class="panel-control">
              <span class="panel-label">{{ $t('visualization.fan.arc') }}</span>
              <div class="panel-toggle-btns panel-toggle-btns--wrap">
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
              <input type="range" min="2" max="20" step="1" v-model.number="hourglassGenerations" class="panel-range" />
            </div>
          </template>
          <template v-else-if="activeTab === 'descendantChart'">
            <div class="panel-control">
              <div class="panel-range-row"><span class="panel-label">{{ $t('reports.generations') }}</span><span class="panel-range-value">{{ descendantGenerations }}</span></div>
              <input type="range" min="2" max="20" step="1" v-model.number="descendantGenerations" class="panel-range" />
            </div>
          </template>
          <template v-else-if="activeTab === 'timeline'">
            <div class="panel-control">
              <div class="panel-range-row"><span class="panel-label">{{ $t('reports.generations') }}</span><span class="panel-range-value">{{ timelineGenerations }}</span></div>
              <input type="range" min="1" max="10" step="1" v-model.number="timelineGenerations" class="panel-range" />
            </div>
          </template>
        </template>

      </div>
    </div>

    <!-- Fan Chart (Your Ancestors only) -->
    <div v-if="hasFanChartSection" class="panel-section">
      <SectionHeader :title="$t('reports.panel.fanChart')" :collapsed="!open.fanChart" @toggle="toggleSection('fanChart')" />
      <div v-if="open.fanChart" class="panel-section-body">
        <div class="panel-control">
          <label class="panel-label">{{ $t('chart.export.colorMode') }}</label>
          <select v-model="store.yourAncestorsColorMode" class="panel-select">
            <option value="branch">{{ $t('visualization.fanColorBranch') }}</option>
            <option value="sex">{{ $t('visualization.fanColorSex') }}</option>
            <option value="bw">{{ $t('chart.export.blackWhite') }}</option>
          </select>
        </div>
        <div class="panel-control">
          <span class="panel-label">{{ $t('visualization.fan.arc') }}</span>
          <div class="panel-toggle-btns panel-toggle-btns--wrap">
            <button v-for="span in fanArcOptions" :key="span" :class="{ active: store.yourAncestorsFanArcSpan === span }" @click="store.yourAncestorsFanArcSpan = (span as ArcSpan)">{{ span }}deg</button>
          </div>
        </div>
        <div class="panel-control">
          <div class="panel-range-row">
            <span class="panel-label">{{ $t('reports.generations') }}</span>
            <span class="panel-range-value">{{ store.yourAncestorsFanGenerations }}</span>
          </div>
          <input type="range" min="3" max="8" step="1" v-model.number="store.yourAncestorsFanGenerations" class="panel-range" />
        </div>
      </div>
    </div>

    <!-- Sticky print/export actions -->
    <div class="panel-actions">
      <AppButton variant="primary"    :disabled="!canPrint" @click="emit('print')"          class="panel-action-btn">{{ $t('reports.print') }}</AppButton>
      <template v-if="isChartPrint">
        <AppButton variant="secondary" :disabled="!canPrint" @click="emit('save-svg')"       class="panel-action-btn">{{ $t('chart.export.saveSvg') }}</AppButton>
        <AppButton variant="secondary" :disabled="!canPrint" @click="emit('save-chart-pdf')" class="panel-action-btn">{{ $t('chart.export.savePdf') }}</AppButton>
      </template>
      <AppButton v-else variant="secondary" :disabled="!canPrint" @click="emit('export-pdf')" class="panel-action-btn">{{ $t('reports.exportPdf') }}</AppButton>
    </div>

  </EntityPanel>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import SectionHeader from './ui/SectionHeader.vue';
import AppButton from './ui/AppButton.vue';
import EntityPanel from './EntityPanel.vue';
import PersonPicker from './PersonPicker.vue';
import PlacePicker from './PlacePicker.vue';
import { useReportConfigStore } from '../stores/reportConfig';
import { usePanelSections } from '../composables/usePanelSections';
import {
  pedigreeGenerations,
  hourglassGenerations,
  descendantGenerations,
  timelineGenerations,
  fanGenerations,
} from '../composables/useChartGenerations';
import type { ArcSpan } from '../utils/fanLayout';

interface RelationshipOption { id: string; label: string; }

const props = defineProps<{
  activeTab: string;
  coupleRelationships: RelationshipOption[];
}>();

const emit = defineEmits<{
  print: [];
  'export-pdf': [];
  'save-svg': [];
  'save-chart-pdf': [];
  close: [];
}>();

const { t } = useI18n();
const store = useReportConfigStore();

const fanArcOptions: ArcSpan[] = [180, 210, 240, 270, 360];

// Subject and Options open by default; Report/Chart/Fan Chart collapsed.
const { sections: open, toggleSection } = usePanelSections(
  'report-panel-section-',
  { subject: true, options: true, headerFooter: false, appearance: false, fanChart: false },
);

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

const hasFanChartSection = computed(() => props.activeTab === 'yourAncestors');

const appearanceSectionTitle = computed(() =>
  isChartPrint.value ? t('reports.panel.chart') : t('reports.panel.report')
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
  return t('reports.person');
});
</script>

<style scoped>
/* Layout, surface, collapse tab, role label, and panel header come from
   EntityPanel + shared.css. This block only owns ReportPanel-specific
   chrome (header text, sections, controls, sticky actions). */

/* Header slot content — rendered in EntityPanel's `<slot name="header">`. */
.panel-name-row {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}
.panel-name {
  font-size: var(--font-base);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.panel-section { border-bottom: 1px solid var(--surface-border-subtle); padding: 0 var(--space-lg); }
.panel-section-body {
  padding: var(--space-xs) 0 var(--space-sm);
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
.panel-toggle-btns--wrap {
  flex-wrap: wrap;
  gap: var(--space-xs);
}
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
.panel-hint { font-size: var(--font-xs); color: var(--text-muted); margin: 4px 0 0; line-height: 1.35; }
.panel-actions {
  margin-top: auto;
  padding: var(--space-sm) var(--space-lg);
  border-top: 1px solid var(--surface-border);
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  background: var(--surface);
}
.panel-action-btn { width: 100%; }
</style>
