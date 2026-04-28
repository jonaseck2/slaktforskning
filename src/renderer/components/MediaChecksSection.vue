<template>
  <QualityIssuesTable :issues="issues" />
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import QualityIssuesTable, { type QualityIssue } from './QualityIssuesTable.vue';
import { useEntityData } from '../composables/useEntityData';

const props = defineProps<{ mediaId: string }>();

const debouncedId = ref<string | null>(null);
const { data, reload } = useEntityData<QualityIssue[]>(debouncedId, async (id) => {
  if (!window.api?.checks?.forMedia) return [];
  return (await window.api.checks.forMedia(id)) as QualityIssue[];
});
const issues = computed(() => data.value ?? []);

defineExpose({ reload, count: computed(() => issues.value.length) });

let loadTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleLoad() {
  if (loadTimer) clearTimeout(loadTimer);
  loadTimer = setTimeout(() => { debouncedId.value = props.mediaId; loadTimer = null; }, 1500);
}

watch(() => props.mediaId, scheduleLoad, { immediate: true });
onUnmounted(() => { if (loadTimer) clearTimeout(loadTimer); });
</script>
