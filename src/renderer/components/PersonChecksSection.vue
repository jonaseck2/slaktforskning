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
import { useEntityData } from '../composables/useEntityData';

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
  PERSON_NO_NAME: 'add-name',
  UNSOURCED_DEATH: 'add-death-event',
  DEATH_WITHOUT_BIRTH: 'add-birth-event',
  UNRELATED_PERSON: 'add-father',
};

const props = defineProps<{ personId: string; readonly?: boolean }>();
const emit = defineEmits<{
  fix: [action: FixAction];
}>();

function hasFixAction(r: QualityIssue): boolean {
  return r.code in FIX_ACTIONS;
}

function onRowClick(r: QualityIssue) {
  const action = FIX_ACTIONS[r.code];
  if (action) emit('fix', action);
}

const debouncedId = ref<string | null>(null);
const { data, reload } = useEntityData<QualityIssue[]>(debouncedId, async (id) => {
  if (!window.api?.checks) return [];
  return (await window.api.checks.forPerson(id)) as QualityIssue[];
});
const issues = computed(() => data.value ?? []);

defineExpose({ reload, count: computed(() => issues.value.length) });

// Custom 1500ms debounce on personId changes (selection switches), separate
// from useEntityData's 150ms debounce on onDataChanged mutations. Quality
// checks run every rule against every event for a person — expensive enough
// that we don't want to fire them while the user is arrow-keying / clicking
// through the persons list. The 1500ms wait says "only run when the user
// actually settled on a person." useEntityData does NOT debounce idRef
// changes (watch fires immediately), so this guard has to live here.
let loadTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleLoad() {
  if (loadTimer) clearTimeout(loadTimer);
  loadTimer = setTimeout(() => { debouncedId.value = props.personId; loadTimer = null; }, 1500);
}

watch(() => props.personId, scheduleLoad, { immediate: true });
onUnmounted(() => { if (loadTimer) clearTimeout(loadTimer); });
</script>
