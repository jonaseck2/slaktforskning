<template>
  <div class="io-groups">
  <div class="io-group">
    <h3>{{ $t('importExport.gedcomImportTitle') }}</h3>
    <p class="section-desc">{{ $t('importExport.gedcomImportDesc') }}</p>
    <button @click="handlePreviewGedcom" :disabled="busy">{{ $t('gedcom.import') }}</button>
    <p v-if="statusMessage" :class="['status', statusType]">{{ statusMessage }}</p>

    <!-- Preview modal -->
    <BaseSubPanel
      v-if="showPreview && previewData"
      entity-type="neutral"
      :title="$t('gedcom.previewTitle')"
      label=""
      mode="standalone"
      :save-label="$t('gedcom.previewProceed')"
      @cancel="cancelImport"
      @close="cancelImport"
      @save="proceedImport"
    >
      <div class="report-body">
        <p>{{ $t('gedcom.willImport') }}</p>
        <ul class="report-counts">
          <li>{{ $t('gedcom.previewPersons', { n: previewData.personCount }) }}</li>
          <li>{{ $t('gedcom.previewRelationships', { n: previewData.relationshipCount }) }}</li>
          <li>{{ $t('gedcom.previewEvents', { n: previewData.eventCount }) }}</li>
          <li>{{ $t('gedcom.previewSources', { n: previewData.sourceCount }) }}</li>
          <li>{{ $t('gedcom.previewPlaces', { n: previewData.placeCount }) }}</li>
          <li v-if="previewData.repositoryCount > 0">{{ $t('gedcom.previewRepositories', { n: previewData.repositoryCount }) }}</li>
        </ul>
        <p v-if="previewData.estimatedSize === 'large'" class="size-warning">{{ $t('gedcom.previewLargeWarning') }}</p>
        <div v-if="previewData.warnings.length > 0" class="report-section">
          <p class="report-section-label">{{ $t('gedcom.previewWarnings', { n: previewData.warnings.length }) }}</p>
          <ul>
            <li v-for="(w, i) in previewData.warnings" :key="i">{{ w }}</li>
          </ul>
        </div>
      </div>
    </BaseSubPanel>

    <!-- Import report modal -->
    <BaseSubPanel
      v-if="showImportReport && importReport"
      entity-type="neutral"
      :title="$t('importExport.importReportTitle')"
      label=""
      mode="standalone"
      hide-save
      :cancel-label="$t('common.close')"
      @cancel="showImportReport = false"
      @close="showImportReport = false"
    >
      <div class="report-body">
      <p class="report-version">{{ importReport.version && importReport.version !== 'unknown' ? 'GEDCOM ' + importReport.version : $t('importExport.importReportVersionUnknown') }}</p>
      <ul class="report-counts">
        <li>{{ $t('importExport.importReportPersons', { n: importReport.persons }) }}</li>
        <li>{{ $t('importExport.importReportFamilies', { n: importReport.families }) }}</li>
        <li>{{ $t('importExport.importReportEvents', { n: Object.values(importReport.events).reduce((a, b) => a + b, 0) }) }}</li>
        <li>{{ $t('importExport.importReportSources', { n: importReport.sources }) }}</li>
        <li>{{ $t('importExport.importReportPlaces', { n: importReport.places }) }}</li>
        <li>{{ $t('importExport.importReportCitations', { n: importReport.citations }) }}</li>
        <li v-if="importReport.repositories > 0">{{ $t('importExport.importReportRepositories', { n: importReport.repositories }) }}</li>
        <li v-if="importReport.groups > 0">{{ $t('importExport.importReportGroups', { n: importReport.groups }) }}</li>
        <li v-if="importReport.researchTasks > 0">{{ $t('importExport.importReportResearchTasks', { n: importReport.researchTasks }) }}</li>
      </ul>
      <div v-if="Object.keys(importReport.events).length > 0" class="report-section">
        <ul class="report-event-list">
          <li v-for="(count, type) in importReport.events" :key="type">{{ type }}: {{ count }}</li>
        </ul>
      </div>
      <div v-if="importReport.warnings.length > 0" class="report-section">
        <p class="report-section-label">{{ $t('importExport.importReportWarnings') }}</p>
        <ul>
          <li v-for="(w, i) in importReport.warnings" :key="i">{{ w }}</li>
        </ul>
      </div>
      <div v-if="importReport.skipped.length > 0" class="report-section">
        <p class="report-section-label">{{ $t('importExport.importReportSkipped') }}</p>
        <ul>
          <li v-for="s in importReport.skipped" :key="s.tag">{{ s.tag }}: {{ s.count }}</li>
        </ul>
      </div>
      <div v-if="importReport.rawCounts" class="report-section">
        <p class="report-section-label">{{ $t('importExport.importReportRawCounts') }}</p>
        <ul class="report-counts">
          <li>{{ $t('importExport.importReportRawIndividuals', { raw: importReport.rawCounts.individuals, imported: importReport.persons }) }}</li>
          <li>{{ $t('importExport.importReportRawFamilies', { raw: importReport.rawCounts.families, imported: importReport.families }) }}</li>
          <li>{{ $t('importExport.importReportRawSources', { raw: importReport.rawCounts.sources, imported: importReport.sources }) }}</li>
          <li v-if="importReport.rawCounts.repositories > 0">{{ $t('importExport.importReportRawRepositories', { n: importReport.rawCounts.repositories }) }}</li>
          <li v-if="importReport.rawCounts.notes > 0">{{ $t('importExport.importReportRawNotes', { n: importReport.rawCounts.notes }) }}</li>
        </ul>
      </div>
      <div v-if="importReport.unmappedData && importReport.unmappedData.length > 0" class="report-section">
        <p class="report-section-label">{{ $t('importExport.importReportNotImported') }}</p>
        <ul>
          <li v-for="item in importReport.unmappedData" :key="item.category">{{ item.category }}: {{ item.count }}</li>
        </ul>
      </div>
      <div v-if="importReport.modelLimitations && importReport.modelLimitations.length > 0" class="report-section">
        <p class="report-section-label">{{ $t('importExport.importReportModelLimitations') }}</p>
        <ul>
          <li v-for="(lim, i) in importReport.modelLimitations" :key="i">{{ lim }}</li>
        </ul>
      </div>
      <div v-if="importReport.submitterName" class="report-section">
        <p class="report-section-label">{{ $t('importExport.treeSubject') }}</p>
        <p class="subm-name">{{ $t('importExport.submitterFound', { name: importReport.submitterName }) }}</p>
        <div v-if="resolvedTreeSubjectId" class="subm-matched">
          <span>{{ $t('importExport.submitterMatched') }}</span>
          <router-link :to="'/persons/' + resolvedTreeSubjectId" class="person-link" @click="showImportReport = false">
            {{ matchedPersonName || resolvedTreeSubjectId }}
          </router-link>
        </div>
        <div v-else class="subm-unmatched">
          <p>{{ $t('importExport.submitterUnmatched') }}</p>
          <PersonPicker
            :model-value="manualTreeSubjectId"
            :placeholder="$t('importExport.submitterPickPerson')"
            @update:model-value="setTreeSubjectFromImport"
          />
        </div>
      </div>
      </div>
    </BaseSubPanel>
  </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import BaseSubPanel from '../modals/BaseSubPanel.vue';
import PersonPicker from '../PersonPicker.vue';
import { useI18n } from 'vue-i18n';
import { useToast } from '../../composables/useToast';
import { resetDefaultPersonId } from '../../composables/useDefaultPerson';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const { t } = useI18n();
const toast = useToast();
const busy = ref(false);
const statusMessage = ref('');
const statusType = ref<'success' | 'error'>('success');
const showImportReport = ref(false);
const showPreview = ref(false);
const previewFilePath = ref<string | null>(null);
const previewData = ref<{
  personCount: number; relationshipCount: number; eventCount: number;
  sourceCount: number; placeCount: number; repositoryCount: number;
  warnings: string[]; estimatedSize: 'small' | 'medium' | 'large';
} | null>(null);
const importReport = ref<{
  version?: string;
  persons: number; families: number; events: Record<string, number>;
  sources: number; places: number; citations: number;
  repositories: number; groups: number; researchTasks: number;
  skipped: { tag: string; count: number }[];
  warnings: string[];
  rawCounts?: {
    individuals: number; families: number; sources: number;
    repositories: number; notes: number; objects: number; submitters: number;
  };
  tagStats?: { tag: string; occurrences: number }[];
  unmappedData?: { category: string; count: number; example?: string }[];
  modelLimitations?: string[];
  defaultPersonId?: string;
  submitterName?: string;
} | null>(null);
const matchedPersonName = ref<string | null>(null);
const manualTreeSubjectId = ref<string | null>(null);
const resolvedTreeSubjectId = ref<string | null>(null);

// When import report opens, check if the SUBM was matched (persisted to db_settings)
watch(() => importReport.value?.submitterName, async () => {
  resolvedTreeSubjectId.value = null;
  matchedPersonName.value = null;
  manualTreeSubjectId.value = null;
  if (!importReport.value?.submitterName) return;
  const id = await window.api.db.getSetting('default_person_id') as string | null;
  if (!id) return;
  resolvedTreeSubjectId.value = id;
  try {
    const names = await window.api.persons.getNames(id) as { given_name?: string; surname?: string }[];
    const primary = names?.[0];
    if (primary) {
      matchedPersonName.value = [primary.given_name, primary.surname].filter(Boolean).join(' ');
    }
  } catch { /* ignore */ }
}, { immediate: true });

async function setTreeSubjectFromImport(personId: string | null) {
  manualTreeSubjectId.value = personId;
  if (personId) {
    await window.api.db.setSetting('default_person_id', personId);
    resetDefaultPersonId();
    resolvedTreeSubjectId.value = personId;
    try {
      const names = await window.api.persons.getNames(personId) as { given_name?: string; surname?: string }[];
      const primary = names?.[0];
      if (primary) {
        matchedPersonName.value = [primary.given_name, primary.surname].filter(Boolean).join(' ');
      }
    } catch { /* ignore */ }
  }
}

function setStatus(msg: string, type: 'success' | 'error' = 'success') {
  statusMessage.value = msg;
  statusType.value = type;
  setTimeout(() => { statusMessage.value = ''; }, 4000);
}

async function handlePreviewGedcom() {
  if (!window.api || busy.value) return;
  busy.value = true;
  try {
    const result = (await window.api.gedcom.preview()) as {
      canceled?: boolean;
      filePath?: string;
      preview?: {
        personCount: number; relationshipCount: number; eventCount: number;
        sourceCount: number; placeCount: number; repositoryCount: number;
        warnings: string[]; estimatedSize: 'small' | 'medium' | 'large';
      };
    };
    if (result.canceled) return;
    if (result.preview) {
      previewData.value = result.preview;
      previewFilePath.value = result.filePath ?? null;
      showPreview.value = true;
    }
  } catch (err) {
    setStatus(t('importExport.importError'), 'error');
    console.error('[ImportExport] GEDCOM preview failed:', err);
    toast.error(t('errors.saveFailed'));
  } finally {
    busy.value = false;
  }
}

function cancelImport() {
  showPreview.value = false;
  previewData.value = null;
  previewFilePath.value = null;
}

async function proceedImport() {
  if (!window.api || busy.value || !previewFilePath.value) return;
  showPreview.value = false;
  busy.value = true;
  try {
    const result = (await window.api.gedcom.import({ filePath: previewFilePath.value })) as {
      imported?: boolean;
      canceled?: boolean;
      filePath?: string;
      report?: {
        version?: string;
        persons: number;
        families: number;
        events: Record<string, number>;
        sources: number;
        places: number;
        citations: number;
        skipped: { tag: string; count: number }[];
        warnings: string[];
      };
    };
    if (result.imported) {
      window.dispatchEvent(new CustomEvent('data-imported'));
      if (result.report) {
        importReport.value = result.report;
        showImportReport.value = true;
      } else {
        setStatus(t('importExport.importSuccess', { file: result.filePath ?? '' }));
      }
    }
  } catch (err) {
    setStatus(t('importExport.importError'), 'error');
    console.error('[ImportExport] GEDCOM import failed:', err);
    toast.error(t('errors.saveFailed'));
  } finally {
    busy.value = false;
    previewData.value = null;
    previewFilePath.value = null;
  }
}
</script>

<style scoped>
.subm-name {
  font-size: var(--font-sm);
  color: var(--color-text-muted);
  margin-bottom: 4px;
}
.subm-matched {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-sm);
}
.subm-unmatched {
  font-size: var(--font-sm);
}
.subm-unmatched p {
  margin-bottom: 6px;
}
</style>
