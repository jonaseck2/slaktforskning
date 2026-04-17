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
      <template v-if="dateType !== 'unknown'">
        <div class="ymd-group">
          <input
            ref="yearRef"
            type="text"
            inputmode="numeric"
            maxlength="4"
            :value="year"
            :placeholder="$t('dateInput.year')"
            :aria-label="$t('dateInput.year')"
            class="ymd-year"
            @input="onYearInput($event)"
          />
          <span class="ymd-sep">-</span>
          <input
            ref="monthRef"
            type="text"
            inputmode="numeric"
            maxlength="2"
            :value="month"
            :placeholder="$t('dateInput.month')"
            :aria-label="$t('dateInput.month')"
            class="ymd-month"
            @input="onMonthInput($event)"
          />
          <span class="ymd-sep">-</span>
          <input
            ref="dayRef"
            type="text"
            inputmode="numeric"
            maxlength="2"
            :value="day"
            :placeholder="$t('dateInput.day')"
            :aria-label="$t('dateInput.day')"
            class="ymd-day"
            @input="onDayInput($event)"
          />
        </div>
      </template>
      <template v-if="dateType === 'between'">
        <span class="date-sep">{{ $t('dateInput.to') }}</span>
        <div class="ymd-group">
          <input
            ref="yearEndRef"
            type="text"
            inputmode="numeric"
            maxlength="4"
            :value="yearEnd"
            :placeholder="$t('dateInput.year')"
            :aria-label="$t('dateInput.year')"
            class="ymd-year"
            @input="onYearEndInput($event)"
          />
          <span class="ymd-sep">-</span>
          <input
            ref="monthEndRef"
            type="text"
            inputmode="numeric"
            maxlength="2"
            :value="monthEnd"
            :placeholder="$t('dateInput.month')"
            :aria-label="$t('dateInput.month')"
            class="ymd-month"
            @input="onMonthEndInput($event)"
          />
          <span class="ymd-sep">-</span>
          <input
            ref="dayEndRef"
            type="text"
            inputmode="numeric"
            maxlength="2"
            :value="dayEnd"
            :placeholder="$t('dateInput.day')"
            :aria-label="$t('dateInput.day')"
            class="ymd-day"
            @input="onDayEndInput($event)"
          />
        </div>
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
import { ref, computed } from 'vue';
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

// Refs for auto-advance
const yearRef = ref<HTMLInputElement | null>(null);
const monthRef = ref<HTMLInputElement | null>(null);
const dayRef = ref<HTMLInputElement | null>(null);
const yearEndRef = ref<HTMLInputElement | null>(null);
const monthEndRef = ref<HTMLInputElement | null>(null);
const dayEndRef = ref<HTMLInputElement | null>(null);

// Parse dateValue (YYYY-MM-DD or partial) into parts
function parseParts(dateStr: string): { y: string; m: string; d: string } {
  if (!dateStr) return { y: '', m: '', d: '' };
  const parts = dateStr.split('-');
  return { y: parts[0] || '', m: parts[1] || '', d: parts[2] || '' };
}

function buildDate(y: string, m: string, d: string): string {
  if (!y) return '';
  if (!m) return y;
  if (!d) return `${y}-${m}`;
  return `${y}-${m}-${d}`;
}

const startParts = computed(() => parseParts(props.dateValue));
const endParts = computed(() => parseParts(props.dateValueEnd));

const year = computed(() => startParts.value.y);
const month = computed(() => startParts.value.m);
const day = computed(() => startParts.value.d);
const yearEnd = computed(() => endParts.value.y);
const monthEnd = computed(() => endParts.value.m);
const dayEnd = computed(() => endParts.value.d);

function filterDigits(val: string): string {
  return val.replace(/\D/g, '');
}

function onYearInput(e: Event) {
  const val = filterDigits((e.target as HTMLInputElement).value);
  (e.target as HTMLInputElement).value = val;
  emit('update:dateValue', buildDate(val, month.value, day.value));
  if (val.length === 4) monthRef.value?.focus();
}

function onMonthInput(e: Event) {
  let val = filterDigits((e.target as HTMLInputElement).value);
  if (val.length === 1 && parseInt(val) > 1) val = '0' + val;
  if (val.length >= 2) val = val.slice(0, 2);
  (e.target as HTMLInputElement).value = val;
  emit('update:dateValue', buildDate(year.value, val, day.value));
  if (val.length === 2) dayRef.value?.focus();
}

function onDayInput(e: Event) {
  let val = filterDigits((e.target as HTMLInputElement).value);
  if (val.length === 1 && parseInt(val) > 3) val = '0' + val;
  if (val.length >= 2) val = val.slice(0, 2);
  (e.target as HTMLInputElement).value = val;
  emit('update:dateValue', buildDate(year.value, month.value, val));
}

function onYearEndInput(e: Event) {
  const val = filterDigits((e.target as HTMLInputElement).value);
  (e.target as HTMLInputElement).value = val;
  emit('update:dateValueEnd', buildDate(val, monthEnd.value, dayEnd.value));
  if (val.length === 4) monthEndRef.value?.focus();
}

function onMonthEndInput(e: Event) {
  let val = filterDigits((e.target as HTMLInputElement).value);
  if (val.length === 1 && parseInt(val) > 1) val = '0' + val;
  if (val.length >= 2) val = val.slice(0, 2);
  (e.target as HTMLInputElement).value = val;
  emit('update:dateValueEnd', buildDate(yearEnd.value, val, dayEnd.value));
  if (val.length === 2) dayEndRef.value?.focus();
}

function onDayEndInput(e: Event) {
  let val = filterDigits((e.target as HTMLInputElement).value);
  if (val.length === 1 && parseInt(val) > 3) val = '0' + val;
  if (val.length >= 2) val = val.slice(0, 2);
  (e.target as HTMLInputElement).value = val;
  emit('update:dateValueEnd', buildDate(yearEnd.value, monthEnd.value, val));
}

function updateDateType(e: Event) {
  emit('update:dateType', (e.target as HTMLSelectElement).value);
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
  flex-wrap: wrap;
}
.date-row select {
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: var(--font-base);
  min-width: 120px;
}
.ymd-group {
  display: flex;
  align-items: center;
  gap: 2px;
}
.ymd-year {
  width: 56px;
  padding: 5px 6px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: var(--font-base);
  text-align: center;
  font-family: inherit;
}
.ymd-month,
.ymd-day {
  width: 36px;
  padding: 5px 6px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: var(--font-base);
  text-align: center;
  font-family: inherit;
}
.ymd-sep {
  color: #999;
  font-size: var(--font-sm);
  user-select: none;
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
