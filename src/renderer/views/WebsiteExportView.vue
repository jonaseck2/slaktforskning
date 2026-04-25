<template>
  <div class="website-export-view">
    <div class="header">
      <h2>{{ $t('htmlSite.title') }}</h2>
    </div>
    <HtmlSiteExportSection />
  </div>
</template>

<script setup lang="ts">
import HtmlSiteExportSection from '../components/import/HtmlSiteExportSection.vue';
</script>

<style scoped>
.website-export-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>
