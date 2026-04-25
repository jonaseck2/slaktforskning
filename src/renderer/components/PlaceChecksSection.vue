<template>
  <QualityIssuesTable :issues="issues" />
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import QualityIssuesTable, { type QualityIssue } from './QualityIssuesTable.vue';

const props = defineProps<{ placeId: string }>();

const issues = ref<QualityIssue[]>([]);

async function load() {
  if (!window.api?.checks?.forPlace) return;
  issues.value = (await window.api.checks.forPlace(props.placeId)) as QualityIssue[];
}

defineExpose({ reload: load, count: computed(() => issues.value.length) });

let loadTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleLoad() {
  if (loadTimer) clearTimeout(loadTimer);
  loadTimer = setTimeout(() => { load(); loadTimer = null; }, 1500);
}

watch(() => props.placeId, scheduleLoad, { immediate: true });
onUnmounted(() => { if (loadTimer) clearTimeout(loadTimer); });
</script>
