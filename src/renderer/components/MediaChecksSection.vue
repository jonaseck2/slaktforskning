<template>
  <QualityIssuesTable :issues="issues" />
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import QualityIssuesTable, { type QualityIssue } from './QualityIssuesTable.vue';

const props = defineProps<{ mediaId: string }>();

const issues = ref<QualityIssue[]>([]);

async function load() {
  if (!window.api?.checks?.forMedia) return;
  issues.value = (await window.api.checks.forMedia(props.mediaId)) as QualityIssue[];
}

defineExpose({ reload: load, count: computed(() => issues.value.length) });

watch(() => props.mediaId, load, { immediate: true });
</script>
