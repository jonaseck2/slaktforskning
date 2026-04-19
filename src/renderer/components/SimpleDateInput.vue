<template>
  <div class="simple-date-input">
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
    <span class="date-picker-wrap">
      <button
        type="button"
        class="date-picker-btn"
        :aria-label="$t('dateInput.pickDate')"
        :title="$t('dateInput.pickDate')"
        @click="openPicker"
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path fill="none" stroke="currentColor" stroke-width="1.2" d="M2.5 3.5h11v10h-11zM2.5 6.5h11M5 2v3M11 2v3" stroke-linecap="round"/>
        </svg>
      </button>
      <input
        ref="nativeRef"
        type="date"
        class="date-picker-native"
        :value="isoDate(year, month, day)"
        tabindex="-1"
        aria-hidden="true"
        @change="onNativePick($event)"
      />
    </span>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const yearRef = ref<HTMLInputElement | null>(null);
const monthRef = ref<HTMLInputElement | null>(null);
const dayRef = ref<HTMLInputElement | null>(null);
const nativeRef = ref<HTMLInputElement | null>(null);

function parseParts(s: string): { y: string; m: string; d: string } {
  if (!s) return { y: '', m: '', d: '' };
  const p = s.split('-');
  return { y: p[0] || '', m: p[1] || '', d: p[2] || '' };
}

const parts = computed(() => parseParts(props.modelValue));
const year = computed(() => parts.value.y);
const month = computed(() => parts.value.m);
const day = computed(() => parts.value.d);

function buildDate(y: string, m: string, d: string): string {
  if (!y) return '';
  if (!m) return y;
  if (!d) return `${y}-${m}`;
  return `${y}-${m}-${d}`;
}

function isoDate(y: string, m: string, d: string): string {
  if (y.length === 4 && m.length === 2 && d.length === 2) return `${y}-${m}-${d}`;
  return '';
}

function filterDigits(v: string): string { return v.replace(/\D/g, ''); }

function onYearInput(e: Event) {
  const val = filterDigits((e.target as HTMLInputElement).value);
  (e.target as HTMLInputElement).value = val;
  emit('update:modelValue', buildDate(val, month.value, day.value));
  if (val.length === 4) monthRef.value?.focus();
}

function onMonthInput(e: Event) {
  let val = filterDigits((e.target as HTMLInputElement).value);
  if (val.length === 1 && parseInt(val) > 1) val = '0' + val;
  if (val.length >= 2) val = val.slice(0, 2);
  (e.target as HTMLInputElement).value = val;
  emit('update:modelValue', buildDate(year.value, val, day.value));
  if (val.length === 2) dayRef.value?.focus();
}

function onDayInput(e: Event) {
  let val = filterDigits((e.target as HTMLInputElement).value);
  if (val.length === 1 && parseInt(val) > 3) val = '0' + val;
  if (val.length >= 2) val = val.slice(0, 2);
  (e.target as HTMLInputElement).value = val;
  emit('update:modelValue', buildDate(year.value, month.value, val));
}

function openPicker() {
  const el = nativeRef.value;
  if (!el) return;
  if (typeof (el as HTMLInputElement & { showPicker?: () => void }).showPicker === 'function') {
    (el as HTMLInputElement & { showPicker: () => void }).showPicker();
  } else {
    el.focus();
    el.click();
  }
}

function onNativePick(e: Event) {
  const val = (e.target as HTMLInputElement).value;
  if (!val) return;
  const p = val.split('-');
  if (p.length !== 3) return;
  emit('update:modelValue', buildDate(p[0], p[1], p[2]));
}
</script>

<style scoped>
.simple-date-input {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.simple-date-input .ymd-year {
  width: 4.5em;
  padding: 5px 6px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: var(--font-base);
  text-align: center;
  font-family: inherit;
}
.simple-date-input .ymd-month,
.simple-date-input .ymd-day {
  width: 3em;
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
.date-picker-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  margin-left: 4px;
}
.date-picker-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-secondary);
  cursor: pointer;
  font-family: inherit;
}
.date-picker-btn:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}
.date-picker-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.date-picker-native {
  position: absolute;
  inset: 0;
  opacity: 0;
  pointer-events: none;
  width: 100%;
  height: 100%;
}
</style>
