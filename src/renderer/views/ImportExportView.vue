<template>
  <div class="import-export-view">
    <div class="tab-bar">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="tab-btn"
        :class="{ active: activeTab === tab.id }"
        @click="activeTab = tab.id"
      >{{ tab.label }}</button>
    </div>

    <template v-if="activeTab === 'gedcom'">
      <GedcomImportSection />
      <GedcomExportSection />
    </template>
    <GenneyImportSection v-if="activeTab === 'genney'" />
    <HolgerImportSection v-if="activeTab === 'holger'" />
    <ArchiveSection v-if="activeTab === 'archive'" />
    <CsvExportSection v-if="activeTab === 'csv'" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import GedcomImportSection from '../components/import/GedcomImportSection.vue';
import GedcomExportSection from '../components/import/GedcomExportSection.vue';
import GenneyImportSection from '../components/import/GenneyImportSection.vue';
import HolgerImportSection from '../components/import/HolgerImportSection.vue';
import ArchiveSection from '../components/import/ArchiveSection.vue';
import CsvExportSection from '../components/import/CsvExportSection.vue';

const { t } = useI18n();

const activeTab = ref('gedcom');

const tabs = computed(() => [
  { id: 'gedcom', label: t('importExport.gedcomTitle') },
  { id: 'genney', label: t('importExport.genneyTitle') },
  { id: 'holger', label: t('importExport.holgerTitle') },
  { id: 'archive', label: t('importExport.archiveTitle') },
  { id: 'csv', label: t('csv.title') },
]);
</script>

<style scoped>
.import-export-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>
