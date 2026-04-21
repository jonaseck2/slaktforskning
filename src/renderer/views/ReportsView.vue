<template>
  <div class="reports-view export-scope">
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

    <!-- Your Ancestors Tab -->
    <div v-if="activeTab === 'yourAncestors'" class="tab-content">
      <div class="tab-header">
        <div class="controls">
          <label>
            {{ $t('reports.generations') }}
            <input
              type="range"
              min="4"
              max="10"
              step="1"
              v-model.number="yourAncestorsGenerations"
            />
            <span class="range-value">{{ yourAncestorsGenerations }}</span>
          </label>
          <label>
            {{ $t('chart.export.colorMode') }}
            <select v-model="yourAncestorsColorMode">
              <option value="themed">{{ $t('reports.yourAncestors.colorThemed') }}</option>
              <option value="branch">{{ $t('visualization.fanColorBranch') }}</option>
              <option value="sex">{{ $t('visualization.fanColorSex') }}</option>
              <option value="bw">{{ $t('chart.export.blackWhite') }}</option>
            </select>
          </label>
          <label>
            {{ $t('reports.yourAncestors.density') }}
            <select v-model="yourAncestorsDensity">
              <option value="one">{{ $t('reports.yourAncestors.densityOne') }}</option>
              <option value="two">{{ $t('reports.yourAncestors.densityTwo') }}</option>
            </select>
          </label>
          <label class="toggle-label"><input type="checkbox" v-model="yourAncestorsShowEvents" /> {{ $t('reports.alife.events') }}</label>
          <label class="toggle-label"><input type="checkbox" v-model="yourAncestorsShowExtraPhotos" /> {{ $t('reports.common.photos') }}</label>
          <label class="toggle-label"><input type="checkbox" v-model="yourAncestorsShowSources" /> {{ $t('reports.common.sources') }}</label>
          <label class="toggle-label"><input type="checkbox" v-model="redactLiving" /> {{ $t('reports.common.redactLiving') }}</label>
        </div>
        <div class="print-actions">
          <AppButton variant="primary" size="sm" :disabled="!yourAncestorsPersonId" @click="printCurrent">{{ $t('reports.print') }}</AppButton>
          <AppButton variant="secondary" size="sm" :disabled="!yourAncestorsPersonId" @click="exportPdf">{{ $t('reports.exportPdf') }}</AppButton>
        </div>
      </div>
      <div ref="previewContainer" class="preview-area">
        <div v-if="yourAncestorsPersonId" class="print-preview" :style="{ zoom: effectiveZoom }">
          <YourAncestorsReport
            :person-id="yourAncestorsPersonId"
            :generations="yourAncestorsGenerations"
            :color-mode="yourAncestorsColorMode"
            :density="yourAncestorsDensity"
            :show-events="yourAncestorsShowEvents"
            :show-extra-photos="yourAncestorsShowExtraPhotos"
            :show-sources="yourAncestorsShowSources"
            :redact-living="redactLiving"
          />
        </div>
        <div v-else class="empty-hint">{{ $t('reports.selectPersonFirst') }}</div>
      </div>
    </div>

    <!-- A Life Tab -->
    <div v-if="activeTab === 'alife'" class="tab-content">
      <div class="tab-header">
        <div class="controls">
          <label class="toggle-label"><input type="checkbox" v-model="aLifeShowLifeMap" /> {{ $t('reports.common.lifeMap') }}</label>
          <label class="toggle-label"><input type="checkbox" v-model="aLifeShowPhotos" /> {{ $t('reports.common.photos') }}</label>
          <label class="toggle-label"><input type="checkbox" v-model="aLifeShowDocuments" /> {{ $t('reports.common.documents') }}</label>
          <label class="toggle-label"><input type="checkbox" v-model="aLifeShowSources" /> {{ $t('reports.common.sources') }}</label>
          <label class="toggle-label"><input type="checkbox" v-model="aLifeShowNotes" /> {{ $t('reports.alife.biography') }}</label>
          <label class="toggle-label"><input type="checkbox" v-model="redactLiving" /> {{ $t('reports.common.redactLiving') }}</label>
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
            :show-life-map="aLifeShowLifeMap"
            :show-photos="aLifeShowPhotos"
            :show-documents="aLifeShowDocuments"
            :show-sources="aLifeShowSources"
            :show-notes="aLifeShowNotes"
            :redact-living="redactLiving"
          />
        </div>
        <div v-else class="empty-hint">{{ $t('reports.selectPersonFirst') }}</div>
      </div>
    </div>

    <!-- Life on One Page Tab -->
    <div v-if="activeTab === 'onePage'" class="tab-content">
      <div class="tab-header">
        <div class="controls">
          <label>
            {{ $t('reports.onePage.orientation') }}
            <select v-model="onePageOrientation">
              <option value="portrait">{{ $t('reports.onePage.portrait') }}</option>
              <option value="landscape">{{ $t('reports.onePage.landscape') }}</option>
            </select>
          </label>
          <label class="toggle-label"><input type="checkbox" v-model="onePageShowLifeMap" /> {{ $t('reports.common.lifeMap') }}</label>
          <label class="toggle-label"><input type="checkbox" v-model="redactLiving" /> {{ $t('reports.common.redactLiving') }}</label>
        </div>
        <div class="print-actions">
          <AppButton variant="primary" size="sm" :disabled="!onePagePersonId" @click="printCurrent">{{ $t('reports.print') }}</AppButton>
          <AppButton variant="secondary" size="sm" :disabled="!onePagePersonId" @click="exportPdf">{{ $t('reports.exportPdf') }}</AppButton>
        </div>
      </div>
      <div ref="previewContainer" class="preview-area">
        <div v-if="onePagePersonId" class="print-preview" :class="'preview-' + onePageOrientation" :style="{ zoom: effectiveZoom }">
          <LifeOnOnePageReport
            :person-id="onePagePersonId"
            :orientation="onePageOrientation"
            :show-life-map="onePageShowLifeMap"
            :redact-living="redactLiving"
          />
        </div>
        <div v-else class="empty-hint">{{ $t('reports.selectPersonFirst') }}</div>
      </div>
    </div>

    <!-- Family in Year X Tab -->
    <div v-if="activeTab === 'familyInYear'" class="tab-content">
      <div class="tab-header">
        <div class="controls">
          <label>
            {{ $t('reports.familyInYear.year') }}
            <input
              type="number"
              v-model.number="familyInYearYear"
              :min="1"
              :max="9999"
              step="1"
              required
            />
          </label>
          <label>
            {{ $t('reports.familyInYear.scope') }}
            <select v-model="familyInYearScope">
              <option value="all">{{ $t('reports.familyInYear.scopeAll') }}</option>
              <option value="ancestors" disabled>{{ $t('reports.familyInYear.scopeAncestors') }}</option>
              <option value="descendants" disabled>{{ $t('reports.familyInYear.scopeDescendants') }}</option>
            </select>
          </label>
          <label class="toggle-label"><input type="checkbox" v-model="redactLiving" /> {{ $t('reports.common.redactLiving') }}</label>
        </div>
        <div class="print-actions">
          <AppButton variant="primary" size="sm" :disabled="!familyInYearYear" @click="printCurrent">{{ $t('reports.print') }}</AppButton>
          <AppButton variant="secondary" size="sm" :disabled="!familyInYearYear" @click="exportPdf">{{ $t('reports.exportPdf') }}</AppButton>
        </div>
      </div>
      <div ref="previewContainer" class="preview-area">
        <div v-if="familyInYearYear" class="print-preview" :style="{ zoom: effectiveZoom }">
          <FamilyInYearReport
            :year="familyInYearYear"
            :scope="familyInYearScope"
            :scope-person-id="familyInYearPersonId"
            :redact-living="redactLiving"
          />
        </div>
        <div v-else class="empty-hint">{{ $t('reports.familyInYear.year') }}</div>
      </div>
    </div>

    <!-- Photo Album Tab -->
    <div v-if="activeTab === 'photoAlbum'" class="tab-content">
      <div class="tab-header">
        <div class="controls">
          <label>
            {{ $t('reports.photoAlbum.subject') }}
            <select v-model="photoAlbumSubjectType">
              <option value="person">{{ $t('reports.photoAlbum.subjectPerson') }}</option>
              <option value="relationship">{{ $t('reports.photoAlbum.subjectRelationship') }}</option>
              <option value="place">{{ $t('reports.photoAlbum.subjectPlace') }}</option>
              <option value="all">{{ $t('reports.photoAlbum.subjectAll') }}</option>
            </select>
          </label>
          <label v-if="photoAlbumSubjectType === 'relationship'">
            {{ $t('reports.couple') }}
            <select v-model="photoAlbumRelId">
              <option value="" disabled>{{ $t('reports.selectCouple') }}</option>
              <option v-for="rel in coupleRelationships" :key="rel.id" :value="rel.id">
                {{ rel.label }}
              </option>
            </select>
          </label>
          <label v-if="photoAlbumSubjectType === 'place'">
            {{ $t('reports.place') }}
            <select v-model="photoAlbumPlaceId">
              <option value="" disabled>{{ $t('reports.selectPlace') }}</option>
              <option v-for="p in allPlaces" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </label>
          <label>
            {{ $t('reports.photoAlbum.perPage') }}
            <select v-model.number="photoAlbumPerPage">
              <option :value="1">1</option>
              <option :value="2">2</option>
              <option :value="4">4</option>
            </select>
          </label>
          <label class="toggle-label"><input type="checkbox" v-model="photoAlbumShowCaptions" /> {{ $t('reports.photoAlbum.showCaptions') }}</label>
          <label class="toggle-label"><input type="checkbox" v-model="photoAlbumShowIndex" /> {{ $t('reports.photoAlbum.showIndex') }}</label>
          <label class="toggle-label"><input type="checkbox" v-model="photoAlbumIncludeDocuments" /> {{ $t('reports.photoAlbum.includeDocuments') }}</label>
        </div>
        <div class="print-actions">
          <AppButton variant="primary" size="sm" :disabled="!photoAlbumCanRender" @click="printCurrent">{{ $t('reports.print') }}</AppButton>
          <AppButton variant="secondary" size="sm" :disabled="!photoAlbumCanRender" @click="exportPdf">{{ $t('reports.exportPdf') }}</AppButton>
        </div>
      </div>
      <div ref="previewContainer" class="preview-area">
        <div v-if="photoAlbumCanRender" class="print-preview" :style="{ zoom: effectiveZoom }">
          <PhotoAlbumReport
            :subject-type="photoAlbumSubjectType"
            :subject-id="photoAlbumSubjectId"
            :per-page="photoAlbumPerPage"
            :show-captions="photoAlbumShowCaptions"
            :show-index="photoAlbumShowIndex"
            :include-documents="photoAlbumIncludeDocuments"
          />
        </div>
        <div v-else-if="photoAlbumSubjectType === 'person'" class="empty-hint">{{ $t('reports.selectPersonFirst') }}</div>
        <div v-else-if="photoAlbumSubjectType === 'relationship'" class="empty-hint">{{ $t('reports.selectCoupleFirst') }}</div>
        <div v-else-if="photoAlbumSubjectType === 'place'" class="empty-hint">{{ $t('reports.selectPlaceFirst') }}</div>
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
          <label class="toggle-label"><input type="checkbox" v-model="aMarriageShowLifeMap" /> {{ $t('reports.common.lifeMap') }}</label>
          <label class="toggle-label"><input type="checkbox" v-model="aMarriageShowPhotos" /> {{ $t('reports.common.photos') }}</label>
          <label class="toggle-label"><input type="checkbox" v-model="aMarriageShowNotes" /> {{ $t('reports.amarriage.narrative') }}</label>
          <label class="toggle-label"><input type="checkbox" v-model="aMarriageShowSources" /> {{ $t('reports.common.sources') }}</label>
          <label class="toggle-label"><input type="checkbox" v-model="redactLiving" /> {{ $t('reports.common.redactLiving') }}</label>
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
            :show-life-map="aMarriageShowLifeMap"
            :show-photos="aMarriageShowPhotos"
            :show-notes="aMarriageShowNotes"
            :show-sources="aMarriageShowSources"
            :redact-living="redactLiving"
          />
        </div>
        <div v-else class="empty-hint">{{ $t('reports.selectCoupleFirst') }}</div>
      </div>
    </div>

    <!-- Pedigree Print Tab -->
    <div v-if="activeTab === 'pedigreePrint'" class="tab-content">
      <div class="tab-header">
        <div class="controls">
          <ChartExportControls
            :paper-size="chartPaperSize"
            :orientation="chartOrientation"
            :color-mode="chartColorMode"
            :tile-count="chartTileCount"
            @update:paper-size="chartPaperSize = $event"
            @update:orientation="chartOrientation = $event"
            @update:color-mode="chartColorMode = $event"
            @save-svg="saveChartSvg"
            @save-pdf="saveChartPdf"
          />
          <label>
            {{ $t('reports.generations') }}
            <input type="range" min="2" max="10" step="1" v-model.number="pedigreeGenerations" />
            <span class="range-value">{{ pedigreeGenerations }}</span>
          </label>
        </div>
        <div class="print-actions">
          <AppButton variant="primary" size="sm" :disabled="!chartPersonId" @click="printCurrent">{{ $t('reports.print') }}</AppButton>
          <AppButton variant="secondary" size="sm" :disabled="!chartPersonId" @click="exportPdf">{{ $t('reports.exportPdf') }}</AppButton>
        </div>
      </div>
      <div ref="previewContainer" class="preview-area">
        <div v-if="chartPersonId" class="print-preview" :style="{ zoom: effectiveZoom }">
          <PedigreeChartReport :person-id="chartPersonId" :color-mode="chartColorMode" />
        </div>
        <div v-else class="empty-hint">{{ $t('reports.selectPersonFirst') }}</div>
      </div>
    </div>

    <!-- Hourglass Chart Tab -->
    <div v-if="activeTab === 'hourglassChart'" class="tab-content">
      <div class="tab-header">
        <div class="controls">
          <ChartExportControls
            :paper-size="chartPaperSize"
            :orientation="chartOrientation"
            :color-mode="chartColorMode"
            :tile-count="chartTileCount"
            @update:paper-size="chartPaperSize = $event"
            @update:orientation="chartOrientation = $event"
            @update:color-mode="chartColorMode = $event"
            @save-svg="saveChartSvg"
            @save-pdf="saveChartPdf"
          />
          <label>
            {{ $t('reports.generations') }}
            <input type="range" min="2" max="8" step="1" v-model.number="hourglassGenerations" />
            <span class="range-value">{{ hourglassGenerations }}</span>
          </label>
        </div>
        <div class="print-actions">
          <AppButton variant="primary" size="sm" :disabled="!chartPersonId" @click="printCurrent">{{ $t('reports.print') }}</AppButton>
          <AppButton variant="secondary" size="sm" :disabled="!chartPersonId" @click="exportPdf">{{ $t('reports.exportPdf') }}</AppButton>
        </div>
      </div>
      <div ref="previewContainer" class="preview-area">
        <div v-if="chartPersonId" class="print-preview" :style="{ zoom: effectiveZoom }">
          <HourglassChartReport :person-id="chartPersonId" :color-mode="chartColorMode" />
        </div>
        <div v-else class="empty-hint">{{ $t('reports.selectPersonFirst') }}</div>
      </div>
    </div>

    <!-- Descendant Chart Tab -->
    <div v-if="activeTab === 'descendantChart'" class="tab-content">
      <div class="tab-header">
        <div class="controls">
          <ChartExportControls
            :paper-size="chartPaperSize"
            :orientation="chartOrientation"
            :color-mode="chartColorMode"
            :tile-count="chartTileCount"
            @update:paper-size="chartPaperSize = $event"
            @update:orientation="chartOrientation = $event"
            @update:color-mode="chartColorMode = $event"
            @save-svg="saveChartSvg"
            @save-pdf="saveChartPdf"
          />
          <label>
            {{ $t('reports.generations') }}
            <input type="range" min="2" max="8" step="1" v-model.number="descendantGenerations" />
            <span class="range-value">{{ descendantGenerations }}</span>
          </label>
        </div>
        <div class="print-actions">
          <AppButton variant="primary" size="sm" :disabled="!chartPersonId" @click="printCurrent">{{ $t('reports.print') }}</AppButton>
          <AppButton variant="secondary" size="sm" :disabled="!chartPersonId" @click="exportPdf">{{ $t('reports.exportPdf') }}</AppButton>
        </div>
      </div>
      <div ref="previewContainer" class="preview-area">
        <div v-if="chartPersonId" class="print-preview" :style="{ zoom: effectiveZoom }">
          <DescendantChartReport :person-id="chartPersonId" :color-mode="chartColorMode" />
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
              <option value="branch">{{ $t('visualization.fanColorBranch') }}</option>
              <option value="sex">{{ $t('visualization.fanColorSex') }}</option>
              <option value="bw">{{ $t('chart.export.blackWhite') }}</option>
            </select>
          </label>
          <label>
            {{ $t('visualization.fan.arc') }}
            <div class="arc-buttons">
              <button
                v-for="span in fanArcOptions"
                :key="span"
                class="chip"
                :class="{ active: fanArcSpan === span }"
                @click="fanArcSpan = span"
              >{{ span }}°</button>
            </div>
          </label>
          <label>
            {{ $t('reports.generations') }}
            <input type="range" min="3" max="8" step="1" v-model.number="fanGenerations" />
            <span class="range-value">{{ fanGenerations }}</span>
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
        <div class="controls">
          <label>
            {{ $t('reports.generations') }}
            <input type="range" min="1" max="10" step="1" v-model.number="timelineGenerations" />
            <span class="range-value">{{ timelineGenerations }}</span>
          </label>
        </div>
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

    <ZoomControls :zoom="effectiveZoom" :show-fit="true" @zoom-in="zoomIn" @zoom-out="zoomOut" @reset="resetZoom" />

  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import AppButton from '../components/ui/AppButton.vue';
import FilterChips from '../components/ui/FilterChips.vue';
import { useFocusStore } from '../stores/focus';
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
import type { ArcSpan } from '../utils/fanLayout';
import TimelineChartReport from '../components/reports/TimelineChartReport.vue';
import ZoomControls from '../components/ZoomControls.vue';
import ChartExportControls from '../components/ChartExportControls.vue';
import {
  pedigreeGenerations,
  hourglassGenerations,
  descendantGenerations,
  timelineGenerations,
  fanGenerations,
} from '../composables/useChartGenerations';
import {
  getPaperDimensions,
  computeTileViewBoxes,
  generateTileSvg,
  MM_TO_PX,
  type PaperSize,
  type Orientation,
  type ColorMode,
} from '../../api/chart-export';
import { buildExportSvgString, wrapWithTitle } from '../composables/useChartExport';

interface RelationshipOption { id: string; label: string; }

const { t } = useI18n();
const route = useRoute();

const focusStore = useFocusStore();

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
const yourAncestorsPersonId = computed(() => focusStore.personId);
const yourAncestorsGenerations = ref(4);
const yourAncestorsColorMode = ref<'bw' | 'branch' | 'sex' | 'themed'>('themed');
const yourAncestorsDensity = ref<'one' | 'two'>('one');
const yourAncestorsShowEvents = ref(true);
const yourAncestorsShowExtraPhotos = ref(false);
const yourAncestorsShowSources = ref(false);
const aLifePersonId = computed(() => focusStore.personId);
const aLifeShowLifeMap = ref(true);
const aLifeShowPhotos = ref(true);
const aLifeShowDocuments = ref(false);
const aLifeShowSources = ref(false);
const aLifeShowNotes = ref(true);
const onePagePersonId = computed(() => focusStore.personId);
const onePageOrientation = ref<'portrait' | 'landscape'>('portrait');
const onePageShowLifeMap = ref(true);
const familyInYearYear = ref<number>(new Date().getFullYear() - 100);
const familyInYearScope = ref<'all' | 'ancestors' | 'descendants'>('all');
const familyInYearPersonId = computed(() => focusStore.personId);
const photoAlbumSubjectType = ref<'person' | 'relationship' | 'place' | 'all'>('person');
const photoAlbumPersonId = computed(() => focusStore.personId);
const photoAlbumRelId = ref('');
const photoAlbumPlaceId = ref('');
const photoAlbumPerPage = ref<1 | 2 | 4>(1);
const photoAlbumShowCaptions = ref(true);
const photoAlbumShowIndex = ref(false);
const photoAlbumIncludeDocuments = ref(false);
const photoAlbumSubjectId = computed<string | null>(() => {
  if (photoAlbumSubjectType.value === 'person') return photoAlbumPersonId.value;
  if (photoAlbumSubjectType.value === 'relationship') return photoAlbumRelId.value || null;
  if (photoAlbumSubjectType.value === 'place') return photoAlbumPlaceId.value || null;
  return null;
});
const photoAlbumCanRender = computed(() => {
  if (photoAlbumSubjectType.value === 'all') return true;
  return !!photoAlbumSubjectId.value;
});
const placeChroniclePlaceId = ref('');
const placeChronicleShowBoundary = ref(true);
const placeChronicleShowChildPlaces = ref(false);
const placeChronicleShowPhotos = ref(true);
const placeChronicleShowNotes = ref(true);
const placeChronicleShowSources = ref(false);
const aMarriageRelId = ref('');
const aMarriageShowLifeMap = ref(true);
const aMarriageShowPhotos = ref(true);
const aMarriageShowNotes = ref(true);
const aMarriageShowSources = ref(false);
// Shared privacy toggle for the 5 keepsake reports (alife, amarriage,
// yourAncestors, onePage, familyInYear).
const redactLiving = ref(false);
const fanArcSpan = ref<ArcSpan>(360);
const fanArcOptions: ArcSpan[] = [180, 210, 240, 270, 360];
const fanColorMode = ref<'branch' | 'sex' | 'bw'>('bw');
const allPlaces = ref<Array<{ id: string; name: string }>>([]);

// --- Chart export controls (shared across the 4 chart tabs) ---
const chartPaperSize = ref<PaperSize>('A2');
const chartOrientation = ref<Orientation>('landscape');
const chartColorMode = ref<ColorMode>('themed');

const chartTileCount = computed(() => {
  const dims = getPaperDimensions({ paperSize: chartPaperSize.value, orientation: chartOrientation.value });
  const W = Math.round(dims.width * MM_TO_PX);
  const H = Math.round(dims.height * MM_TO_PX);
  const tiles = computeTileViewBoxes(W, H);
  if (tiles.length <= 1) return null;
  const rows = Math.max(...tiles.map(t => t.row)) + 1;
  const cols = Math.max(...tiles.map(t => t.col)) + 1;
  return { count: tiles.length, rows, cols };
});

// Fan rendering takes 'branch' | 'sex' | 'bw'; map from the shared ColorMode.
const fanRenderColorMode = computed<'branch' | 'sex' | 'bw'>(() => {
  if (chartColorMode.value === 'sex-colored') return 'sex';
  if (chartColorMode.value === 'bw') return 'bw';
  return 'branch';
});

async function chartExportTitle(): Promise<string> {
  const tab = activeTab.value;
  let label = '';
  if (tab === 'pedigreeChart') label = t('reports.tabPedigreeChart');
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
  const dims = getPaperDimensions({ paperSize: chartPaperSize.value, orientation: chartOrientation.value });
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
const chartPersonId = computed(() => focusStore.personId);

watch(activeTab, triggerLoading);
watch(yourAncestorsPersonId, triggerLoading);
watch(aLifePersonId, triggerLoading);
watch(onePagePersonId, triggerLoading);
watch(familyInYearYear, triggerLoading);
watch(familyInYearScope, triggerLoading);
watch(photoAlbumSubjectType, triggerLoading);
watch(photoAlbumSubjectId, triggerLoading);
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
  const validTabs = ['yourAncestors', 'alife', 'onePage', 'familyInYear', 'photoAlbum', 'placeChronicle', 'amarriage', 'pedigreePrint', 'hourglassChart', 'descendantChart', 'fanChart', 'timeline'];
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
  const landscape = ['hourglassChart', 'descendantChart'].includes(activeTab.value);
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
  padding: 6px 8px;
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  font-size: var(--font-base);
  font-family: inherit;
  background: var(--surface-bg);
  color: var(--text-primary);
}
.controls select:focus {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.controls input[type='number'] {
  padding: 6px 8px;
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  font-size: var(--font-base);
  font-family: inherit;
  background: var(--surface-bg);
  color: var(--text-primary);
  width: 100px;
}
.controls input[type='number']:focus {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.print-actions { display: flex; gap: var(--space-sm); align-items: center; }
.range-value { font-size: var(--font-sm); color: var(--text-muted); min-width: 20px; }
.arc-buttons { display: flex; gap: var(--space-xs); flex-wrap: wrap; }
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
.print-preview.preview-landscape {
  width: 297mm;
  min-height: 210mm;
}
@media print {
  .view-header, .filter-chips-bar, .tab-groups, .tab-header, .zoom-controls-bar { display: none !important; }
  .preview-area { background: none; padding: 0; min-height: auto; border-radius: 0; }
  .print-preview { zoom: 1 !important; box-shadow: none; min-height: auto; }
}


</style>
