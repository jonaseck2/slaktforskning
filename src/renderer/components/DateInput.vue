<template>
  <div class="date-input">
    <div class="date-row">
      <select :value="dateType" @change="updateDateType($event)">
        <option v-for="dt in DATE_TYPES" :key="dt.value" :value="dt.value">{{ dt.label }}</option>
      </select>
      <input
        v-if="dateType !== 'unknown'"
        type="date"
        :value="dateValue"
        @input="updateDateValue($event)"
      />
      <template v-if="dateType === 'between'">
        <span class="date-sep">to</span>
        <input
          type="date"
          :value="dateValueEnd"
          @input="updateDateValueEnd($event)"
        />
      </template>
    </div>
    <div class="date-original-row">
      <input
        type="text"
        :value="dateOriginal"
        placeholder="Original text (e.g. 'abt. 1845')"
        @input="updateDateOriginal($event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { DATE_TYPES } from '../constants/eventTypes';

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
  font-size: 14px;
  min-width: 120px;
}
.date-row input[type='date'] {
  padding: 5px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
}
.date-sep {
  color: #666;
  font-size: 13px;
}
.date-original-row input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 13px;
  color: #555;
}
</style>
