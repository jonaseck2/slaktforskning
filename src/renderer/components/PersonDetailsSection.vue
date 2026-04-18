<template>
  <div class="details-row">
    <select
      class="details-select"
      :value="sex"
      @change="updateSex(($event.target as HTMLSelectElement).value)"
    >
      <option value="M">{{ $t('sex.M') }}</option>
      <option value="F">{{ $t('sex.F') }}</option>
      <option value="U">{{ $t('sex.U') }}</option>
    </select>
    <label class="checkbox-label">
      <input type="checkbox" :checked="!!living" @change="updateLiving(($event.target as HTMLInputElement).checked)" />
      {{ $t('personDetail.statusLiving') }}
    </label>
  </div>
  <label class="notes-label">
    {{ $t('common.notes') }}
    <PersonNotesSection :person-id="personId" />
  </label>
</template>

<script setup lang="ts">
import PersonNotesSection from './PersonNotesSection.vue';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const props = defineProps<{
  personId: string;
  sex: string;
  living: boolean | number;
}>();

const emit = defineEmits<{
  updated: [field: string, value: unknown];
}>();

async function updateSex(value: string) {
  await window.api.persons.update(props.personId, { sex: value });
  emit('updated', 'sex', value);
}

async function updateLiving(checked: boolean) {
  const value = checked ? 1 : 0;
  await window.api.persons.update(props.personId, { living: value });
  emit('updated', 'living', value);
}
</script>

<style scoped>
.details-row {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.details-select {
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-md);
  font-size: var(--font-sm);
  font-family: inherit;
  background: var(--surface);
  color: var(--text-primary);
}
.details-select:focus {
  outline: none;
  border-color: var(--accent);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: var(--font-sm);
  color: var(--text-secondary);
  cursor: pointer;
}
.checkbox-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
}

.notes-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--text-secondary);
  margin-top: var(--space-md);
}

:deep(textarea) {
  width: 100%;
  padding: var(--space-sm);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-md);
  font-family: inherit;
  font-size: var(--font-sm);
  color: var(--text-primary);
  background: var(--surface);
  resize: vertical;
}
:deep(textarea:focus) {
  outline: none;
  border-color: var(--accent);
}
</style>
