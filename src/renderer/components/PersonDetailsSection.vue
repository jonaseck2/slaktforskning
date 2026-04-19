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
  <div class="notes-block">
    <div class="notes-heading-row">
      <span class="notes-heading-label">{{ $t('common.notes') }}</span>
      <AppButton
        variant="soft"
        size="sm"
        :aria-pressed="monospaced"
        :title="$t('common.monospacedTooltip')"
        @click="toggle"
      >
        <span class="mono-glyph">&lt;/&gt;</span>
        <span class="toggle-label-mono">{{ $t('common.monospaced') }}</span>
      </AppButton>
    </div>
    <PersonNotesSection :person-id="personId" :monospaced="monospaced" />
  </div>
</template>

<script setup lang="ts">
import PersonNotesSection from './PersonNotesSection.vue';
import AppButton from './ui/AppButton.vue';
import { useMonospacedNotes } from '../composables/useMonospacedNotes';

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

const { monospaced, toggle } = useMonospacedNotes('person');

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

.notes-block {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  margin-top: var(--space-md);
}

.notes-heading-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}

.notes-heading-label {
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--text-secondary);
}

.mono-glyph {
  font-family: var(--font-mono);
  font-weight: 600;
  opacity: 0.85;
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
:deep(textarea.notes-mono) {
  font-family: var(--font-mono);
}
:deep(textarea:focus) {
  outline: none;
  border-color: var(--accent);
}
</style>
