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

const activeTab = ref('gedcom');

const tabs = computed(() => [
  { id: 'gedcom', label: t('importExport.gedcomTitle') },
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
