<template>
  <QualityIssuesTable
    :issues="issues"
    :clickable-when="hasFixAction"
    :readonly="props.readonly"
    @row-click="onRowClick"
  />
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import QualityIssuesTable, { type QualityIssue } from './QualityIssuesTable.vue';

export type { QualityIssue as CheckResult } from './QualityIssuesTable.vue';

export type FixAction =
  | 'add-birth-event'
  | 'add-death-event'
  | 'add-name'
  | 'add-father'
  | 'add-mother'
  | 'add-event';

const FIX_ACTIONS: Record<string, FixAction> = {
  NO_BIRTH_EVENT: 'add-birth-event',
  UNSOURCED_BIRTH: 'add-birth-event',
  NO_PARENTS: 'add-father',
  NO_NAME: 'add-name',
  UNSOURCED_DEATH: 'add-death-event',
  DEATH_WITHOUT_BIRTH: 'add-birth-event',
  UNRELATED_PERSON: 'add-father',
};

const props = defineProps<{ personId: string; readonly?: boolean }>();
const emit = defineEmits<{
  fix: [action: FixAction];
}>();

const issues = ref<QualityIssue[]>([]);

function hasFixAction(r: QualityIssue): boolean {
  return r.code in FIX_ACTIONS;
}

function onRowClick(r: QualityIssue) {
  const action = FIX_ACTIONS[r.code];
  if (action) emit('fix', action);
}

async function load() {
  if (!window.api?.checks) return;
  issues.value = (await window.api.checks.forPerson(props.personId)) as QualityIssue[];
}

defineExpose({ reload: load, count: computed(() => issues.value.length) });

let loadTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleLoad() {
  if (loadTimer) clearTimeout(loadTimer);
  loadTimer = setTimeout(() => { load(); loadTimer = null; }, 1500);
}

watch(() => props.personId, scheduleLoad, { immediate: true });
onUnmounted(() => { if (loadTimer) clearTimeout(loadTimer); });
</script>
