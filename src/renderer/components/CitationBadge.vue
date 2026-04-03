<template>
  <span v-if="count > 0" class="source-count-badge">{{ count }} {{ $t('events.sources', count) }}</span>
  <span v-else class="unsourced-badge">{{ $t('events.unsourced') }}</span>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';

defineProps<{ count: number }>();

useI18n();
</script>

<style scoped>
.source-count-badge {
  background: #dcfce7;
  color: #166534;
  padding: 2px 7px;
  border-radius: 10px;
  font-size: 11px;
}
.unsourced-badge {
  background: #fef9c3;
  color: #854d0e;
  padding: 2px 7px;
  border-radius: 10px;
  font-size: 11px;
}
</style>
