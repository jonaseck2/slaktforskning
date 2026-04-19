<template>
  <QualityIssuesTable :issues="issues" />
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import QualityIssuesTable, { type QualityIssue } from './QualityIssuesTable.vue';

const props = defineProps<{ placeId: string }>();

const issues = ref<QualityIssue[]>([]);

async function load() {
  if (!window.api?.checks?.forPlace) return;
  issues.value = (await window.api.checks.forPlace(props.placeId)) as QualityIssue[];
}

defineExpose({ reload: load, count: computed(() => issues.value.length) });

watch(() => props.placeId, load, { immediate: true });
</script>
