<template>
  <QualityIssuesTable :issues="issues" />
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import QualityIssuesTable, { type QualityIssue } from './QualityIssuesTable.vue';

const props = defineProps<{ mediaId: string }>();

const issues = ref<QualityIssue[]>([]);

async function load() {
  if (!window.api?.checks?.forMedia) return;
  issues.value = (await window.api.checks.forMedia(props.mediaId)) as QualityIssue[];
}

defineExpose({ reload: load, count: computed(() => issues.value.length) });

let loadTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleLoad() {
  if (loadTimer) clearTimeout(loadTimer);
  loadTimer = setTimeout(() => { load(); loadTimer = null; }, 1500);
}

watch(() => props.mediaId, scheduleLoad, { immediate: true });
onUnmounted(() => { if (loadTimer) clearTimeout(loadTimer); });
</script>
