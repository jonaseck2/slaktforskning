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

    <GedcomImportSection v-if="activeTab === 'gedcom-import'" />
    <GedcomExportSection v-if="activeTab === 'gedcom-export'" />
    <GenneyImportSection v-if="activeTab === 'genney'" />
    <HolgerImportSection v-if="activeTab === 'holger'" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import GedcomImportSection from '../components/import/GedcomImportSection.vue';
import GedcomExportSection from '../components/import/GedcomExportSection.vue';
import GenneyImportSection from '../components/import/GenneyImportSection.vue';
import HolgerImportSection from '../components/import/HolgerImportSection.vue';

const { t } = useI18n();

const activeTab = ref('gedcom-import');

const tabs = computed(() => [
  { id: 'gedcom-import', label: t('importExport.gedcomImportTitle') },
  { id: 'gedcom-export', label: t('importExport.gedcomExportTitle') },
  { id: 'genney', label: t('importExport.genneyTitle') },
  { id: 'holger', label: t('importExport.holgerTitle') },
]);
</script>

<style scoped>
.import-export-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>
