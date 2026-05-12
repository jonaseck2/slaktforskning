<template>
  <div class="import-export-view">
    <div class="header">
      <h2>{{ $t('nav.importExport') }}</h2>
    </div>
    <FilterChips
      role="tablist"
      tabpanel-id-prefix="import-export"
      :aria-label="$t('nav.importExport')"
      :options="filterOptions"
      :model-value="activeTab"
      @update:model-value="activeTab = $event"
    />

    <div
      v-if="activeTab === 'gedcom'"
      id="import-export-gedcom"
      role="tabpanel"
      aria-labelledby="import-export-tab-gedcom"
    >
      <GedcomImportSection />
      <GedcomExportSection />
    </div>
    <div
      v-else-if="activeTab === 'genney'"
      id="import-export-genney"
      role="tabpanel"
      aria-labelledby="import-export-tab-genney"
    ><GenneyImportSection /></div>
    <div
      v-else-if="activeTab === 'holger'"
      id="import-export-holger"
      role="tabpanel"
      aria-labelledby="import-export-tab-holger"
    ><HolgerImportSection /></div>
    <div
      v-else-if="activeTab === 'rootsmagic'"
      id="import-export-rootsmagic"
      role="tabpanel"
      aria-labelledby="import-export-tab-rootsmagic"
    ><RootsMagicImportSection /></div>
    <div
      v-else-if="activeTab === 'gramps'"
      id="import-export-gramps"
      role="tabpanel"
      aria-labelledby="import-export-tab-gramps"
    ><GrampsImportSection /></div>
    <div
      v-else-if="activeTab === 'archive'"
      id="import-export-archive"
      role="tabpanel"
      aria-labelledby="import-export-tab-archive"
    ><ArchiveSection /></div>
    <div
      v-else-if="activeTab === 'csv'"
      id="import-export-csv"
      role="tabpanel"
      aria-labelledby="import-export-tab-csv"
    ><CsvExportSection /></div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import FilterChips from '../components/ui/FilterChips.vue';
import GedcomImportSection from '../components/import/GedcomImportSection.vue';
import GedcomExportSection from '../components/import/GedcomExportSection.vue';
import GenneyImportSection from '../components/import/GenneyImportSection.vue';
import HolgerImportSection from '../components/import/HolgerImportSection.vue';
import RootsMagicImportSection from '../components/import/RootsMagicImportSection.vue';
import GrampsImportSection from '../components/import/GrampsImportSection.vue';
import ArchiveSection from '../components/import/ArchiveSection.vue';
import CsvExportSection from '../components/import/CsvExportSection.vue';

const { t } = useI18n();

const activeTab = ref('gedcom');

const filterOptions = computed(() => [
  { value: 'gedcom', label: t('importExport.gedcomTitle') },
  { value: 'genney', label: t('importExport.genneyTitle') },
  { value: 'holger', label: t('importExport.holgerTitle') },
  { value: 'rootsmagic', label: t('importExport.rootsmagicTitle') },
  { value: 'gramps', label: t('importExport.grampsTitle') },
  { value: 'archive', label: t('importExport.archiveTitle') },
  { value: 'csv', label: t('csv.title') },
]);
</script>

<style scoped>
.import-export-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>
