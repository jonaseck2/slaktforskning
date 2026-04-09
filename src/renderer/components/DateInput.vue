<template>
  <div class="date-input">
    <div class="date-row">
      <select
        :value="dateType"
        :aria-label="$t('a11y.dateTypeLabel')"
        v-narrate="() => narrateFieldFocus($t('a11y.dateTypeLabel'), 'dropdown', $t('dateTypes.' + dateType), t)"
        @change="updateDateType($event)"
      >
        <option v-for="dt in DATE_TYPE_VALUES" :key="dt" :value="dt">{{ $t('dateTypes.' + dt) }}</option>
      </select>
      <input
        v-if="dateType !== 'unknown'"
        type="date"
        :value="dateValue"
        :aria-label="$t('a11y.dateStartLabel')"
        v-narrate="() => narrateFieldFocus($t('a11y.dateStartLabel'), 'text', dateValue, t)"
        @input="updateDateValue($event)"
      />
      <template v-if="dateType === 'between'">
        <span class="date-sep">{{ $t('dateInput.to') }}</span>
        <input
          type="date"
          :value="dateValueEnd"
          :aria-label="$t('a11y.dateEndLabel')"
          v-narrate="() => narrateFieldFocus($t('a11y.dateEndLabel'), 'text', dateValueEnd, t)"
          @input="updateDateValueEnd($event)"
        />
      </template>
    </div>
    <div class="date-original-row">
      <input
        type="text"
        :value="dateOriginal"
        :placeholder="$t('dateInput.originalPlaceholder')"
        :aria-label="$t('a11y.dateOriginalLabel')"
        v-narrate="() => narrateFieldFocus($t('a11y.dateOriginalLabel'), 'text', dateOriginal, t)"
        @input="updateDateOriginal($event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { DATE_TYPE_VALUES } from '../constants/eventTypes';
import { narrateFieldFocus } from '../utils/screenReaderNarration';

const props = defineProps<{
  dateType: string;
  dateValue: string;
  dateValueEnd: string;
  dateOriginal: string;
}>();

const emit = defineEmits<{
  'update:dateType': [value: string];
  'update:dateValue': [value: string];
  'update:dateValueEnd': [value: string];
  'update:dateOriginal': [value: string];
}>();

const { t } = useI18n();

function updateDateType(e: Event) {
  emit('update:dateType', (e.target as HTMLSelectElement).value);
}
function updateDateValue(e: Event) {
  emit('update:dateValue', (e.target as HTMLInputElement).value);
}
function updateDateValueEnd(e: Event) {
  emit('update:dateValueEnd', (e.target as HTMLInputElement).value);
}
function updateDateOriginal(e: Event) {
  emit('update:dateOriginal', (e.target as HTMLInputElement).value);
}
</script>

<style scoped>
.date-input {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.date-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.date-row select {
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: var(--font-base);
  min-width: 120px;
}
.date-row input[type='date'] {
  padding: 5px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: var(--font-base);
}
.date-sep {
  color: #666;
  font-size: var(--font-sm);
}
.date-original-row input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: var(--font-sm);
  color: #555;
}
</style>
