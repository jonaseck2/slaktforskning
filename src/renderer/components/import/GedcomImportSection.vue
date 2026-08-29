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
        <div v-if="previewFilePaths.length > 1" class="report-section">
          <p class="report-section-label">{{ $t('importExport.queueFilesLabel', { count: previewFilePaths.length }) }}</p>
          <ul>
            <li v-for="f in previewFilePaths" :key="f">{{ baseName(f) }}</li>
          </ul>
        </div>
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
      <div v-if="queueOutcomes.length > 1" class="report-section">
        <p class="report-section-label">{{ $t('importExport.queueFilesLabel', { count: queueOutcomes.length }) }}</p>
        <ul>
          <li v-for="o in queueOutcomes" :key="o.file">
            <template v-if="o.error">{{ $t('importExport.queueFileFailed', { file: baseName(o.file), error: o.error }) }}</template>
            <template v-else>{{ baseName(o.file) }}</template>
          </li>
        </ul>
      </div>
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
      <div v-if="importReport.unaccountedFor && importReport.unaccountedFor.length > 0" class="report-section">
        <p class="report-section-label">{{ $t('importExport.importReportUnaccounted') }}</p>
        <p class="report-hint">{{ $t('importExport.importReportUnaccountedHint') }}</p>
        <ul>
          <li v-for="u in importReport.unaccountedFor" :key="u.path">{{ u.path }}: {{ u.count }}</li>
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
import { runImportQueue } from './import-queue';

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
// Every path the researcher picked, in pick order. One file leaves the
// existing single-file flow byte-identical; the queue is what more than one
// file adds.
const previewFilePaths = ref<string[]>([]);
// Per-file outcome of the last queue run — rendered under the combined report
// so a failure names the file it belongs to rather than vanishing.
const queueOutcomes = ref<{ file: string; error: string | null }[]>([]);
const baseName = (p: string): string => p.split(/[\\/]/).pop() ?? p;
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
  unaccountedFor?: { path: string; count: number }[];
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

type GedcomPreview = {
  personCount: number; relationshipCount: number; eventCount: number;
  sourceCount: number; placeCount: number; repositoryCount: number;
  warnings: string[]; estimatedSize: 'small' | 'medium' | 'large';
};

/**
 * Sum the per-file previews into the one set of counts the researcher
 * confirms. Four exports are one decision, not four modals — the largest
 * estimatedSize wins because it is what drives the slow-import warning.
 */
function sumPreviews(previews: GedcomPreview[]): GedcomPreview {
  const rank = { small: 0, medium: 1, large: 2 } as const;
  return previews.reduce((acc, p) => ({
    personCount: acc.personCount + p.personCount,
    relationshipCount: acc.relationshipCount + p.relationshipCount,
    eventCount: acc.eventCount + p.eventCount,
    sourceCount: acc.sourceCount + p.sourceCount,
    placeCount: acc.placeCount + p.placeCount,
    repositoryCount: acc.repositoryCount + p.repositoryCount,
    warnings: [...acc.warnings, ...p.warnings],
    estimatedSize: rank[p.estimatedSize] > rank[acc.estimatedSize] ? p.estimatedSize : acc.estimatedSize,
  }));
}

async function handlePreviewGedcom() {
  if (!window.api || busy.value) return;
  busy.value = true;
  try {
    // The inline-dialog fallback inside gedcom:preview was removed when the
    // handler moved to the worker thread (so the main thread stays responsive
    // for big imports). Pair with gedcom:selectFiles here — the documented flow.
    const paths = (await window.api.gedcom.selectFiles()) as string[];
    if (!paths || paths.length === 0) return;

    // Preview every picked file BEFORE asking the user to proceed. Previewing
    // is what makes the confirmation informed; skipping it for the multi-file
    // case would make "import four" the less safe path than "import one".
    const previews: GedcomPreview[] = [];
    const accepted: string[] = [];
    for (const filePath of paths) {
      const result = (await window.api.gedcom.preview({ filePath })) as {
        canceled?: boolean;
        filePath?: string;
        error?: string;
        preview?: GedcomPreview;
      };
      if (result.canceled) continue;
      if (result.preview) {
        previews.push(result.preview);
        accepted.push(result.filePath ?? filePath);
      } else {
        // Anything that is neither a user cancel nor a preview is a failure the
        // user must see. Falling through silently here is what made a binding
        // envelope mismatch look like a dead button: no modal, no status line,
        // nothing in the console.
        setStatus(t('importExport.importError'), 'error');
        console.error('[ImportExport] GEDCOM preview returned no preview:', result.error ?? result);
        toast.error(t('errors.saveFailed'));
        return;
      }
    }
    if (accepted.length === 0) return;

    previewData.value = sumPreviews(previews);
    previewFilePaths.value = accepted;
    previewFilePath.value = accepted[0];
    showPreview.value = true;
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
  previewFilePaths.value = [];
}

type GedcomReport = NonNullable<typeof importReport.value>;

/**
 * One report out of N. The researcher asked one question — "what came in?" —
 * so they get one answer, with per-file detail underneath rather than N
 * modals to dismiss.
 */
function sumReports(reports: GedcomReport[]): GedcomReport {
  return reports.reduce((acc, r) => {
    const events: Record<string, number> = { ...acc.events };
    for (const [type, n] of Object.entries(r.events)) events[type] = (events[type] ?? 0) + n;
    return {
      ...acc,
      version: acc.version && acc.version !== 'unknown' ? acc.version : r.version,
      persons: acc.persons + r.persons,
      families: acc.families + r.families,
      events,
      sources: acc.sources + r.sources,
      places: acc.places + r.places,
      citations: acc.citations + r.citations,
      repositories: acc.repositories + r.repositories,
      groups: acc.groups + r.groups,
      researchTasks: acc.researchTasks + r.researchTasks,
      skipped: [...acc.skipped, ...r.skipped],
      unaccountedFor: [...(acc.unaccountedFor ?? []), ...(r.unaccountedFor ?? [])],
      warnings: [...acc.warnings, ...r.warnings],
      submitterName: acc.submitterName ?? r.submitterName,
    };
  });
}

async function proceedImport() {
  if (!window.api || busy.value || previewFilePaths.value.length === 0) return;
  const files = [...previewFilePaths.value];
  showPreview.value = false;
  busy.value = true;
  queueOutcomes.value = [];
  try {
    // Sequential by construction — see import-queue.ts. One bad file must not
    // cost the researcher the other three.
    const queue = await runImportQueue<GedcomReport | null>(files, async (filePath) => {
      const result = (await window.api.gedcom.import({ filePath })) as {
        success?: boolean;
        error?: string;
        report?: GedcomReport;
      };
      // A rejected file that does not throw still has to reach the report.
      if (!result.success) throw new Error(result.error ?? t('importExport.importError'));
      return result.report ?? null;
    });

    queueOutcomes.value = queue.results.map(r => ({ file: r.file, error: r.error }));

    if (queue.succeeded > 0) window.dispatchEvent(new CustomEvent('data-imported'));

    const reports = queue.results
      .map(r => r.report)
      .filter((r): r is GedcomReport => r !== null && r !== undefined);

    if (reports.length > 0) {
      importReport.value = sumReports(reports);
      showImportReport.value = true;
      if (queue.failed > 0) {
        setStatus(t('importExport.queueSummary', { succeeded: queue.succeeded, total: files.length }), 'error');
      }
    } else if (queue.failed === 0) {
      window.dispatchEvent(new CustomEvent('data-imported'));
      setStatus(t('importExport.importSuccess', { file: files.join(', ') }));
    } else {
      setStatus(t('importExport.importError'), 'error');
      console.error('[ImportExport] GEDCOM import failed:', queue.results.map(r => r.error).filter(Boolean));
      toast.error(t('errors.saveFailed'));
    }
  } catch (err) {
    setStatus(t('importExport.importError'), 'error');
    console.error('[ImportExport] GEDCOM import failed:', err);
    toast.error(t('errors.saveFailed'));
  } finally {
    busy.value = false;
    previewData.value = null;
    previewFilePath.value = null;
    previewFilePaths.value = [];
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
