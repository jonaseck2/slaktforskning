<template>
  <div class="import-export-view">
    <div class="header">
      <h2>{{ $t('nav.importExport') }}</h2>
    </div>
    <FilterChips :options="filterOptions" :model-value="activeTab" @update:model-value="activeTab = $event" />

    <template v-if="activeTab === 'gedcom'">
      <GedcomImportSection />
      <GedcomExportSection />
    </template>
    <GenneyImportSection v-if="activeTab === 'genney'" />
    <HolgerImportSection v-if="activeTab === 'holger'" />
    <RootsMagicImportSection v-if="activeTab === 'rootsmagic'" />
    <GrampsImportSection v-if="activeTab === 'gramps'" />
    <ArchiveSection v-if="activeTab === 'archive'" />
    <CsvExportSection v-if="activeTab === 'csv'" />
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
