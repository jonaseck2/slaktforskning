<template>
  <div class="date-input">
    <div class="date-row">
      <select
        :value="dateType"
        :aria-label="$t('a11y.dateTypeLabel')"
        v-narrate="() => narrateFieldFocus($t('a11y.dateTypeLabel'), 'dropdown', $t('dateTypes.' + dateType), t)"
        @change="updateDateType($event)"
      >
        <option v-for="dt in dateTypeOptions" :key="dt" :value="dt">{{ $t('dateTypes.' + dt) }}</option>
      </select>
      <template v-if="dateType !== 'unknown'">
        <div class="date-field">
          <input
            type="text"
            inputmode="numeric"
            :value="dateValue"
            :placeholder="$t('dateInput.placeholder')"
            :aria-label="$t('dateInput.placeholder')"
            class="date-text"
            @input="onStartTextInput($event)"
          />
          <button
            type="button"
            class="date-picker-btn"
            :aria-label="$t('dateInput.pickDate')"
            :title="$t('dateInput.pickDate')"
            @click="openPicker(nativeStartRef)"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path fill="none" stroke="currentColor" stroke-width="1.2" d="M2.5 3.5h11v10h-11zM2.5 6.5h11M5 2v3M11 2v3" stroke-linecap="round"/>
            </svg>
          </button>
          <input
            ref="nativeStartRef"
            type="date"
            class="date-picker-native"
            :value="fullIso(dateValue)"
            tabindex="-1"
            aria-hidden="true"
            @change="onNativePick($event, false)"
          />
        </div>
      </template>
      <template v-if="dateType === 'between'">
        <span class="date-sep">{{ $t('dateInput.to') }}</span>
        <div class="date-field">
          <input
            type="text"
            inputmode="numeric"
            :value="dateValueEnd"
            :placeholder="$t('dateInput.placeholder')"
            :aria-label="$t('dateInput.placeholder')"
            class="date-text"
            @input="onEndTextInput($event)"
          />
          <button
            type="button"
            class="date-picker-btn"
            :aria-label="$t('dateInput.pickDate')"
            :title="$t('dateInput.pickDate')"
            @click="openPicker(nativeEndRef)"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path fill="none" stroke="currentColor" stroke-width="1.2" d="M2.5 3.5h11v10h-11zM2.5 6.5h11M5 2v3M11 2v3" stroke-linecap="round"/>
            </svg>
          </button>
          <input
            ref="nativeEndRef"
            type="date"
            class="date-picker-native"
            :value="fullIso(dateValueEnd)"
            tabindex="-1"
            aria-hidden="true"
            @change="onNativePick($event, true)"
          />
        </div>
      </template>
    </div>
    <div v-if="!simple" class="date-original-row">
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
  // simple: hides the "original date" text row and the "between" range option.
  // Used for secondary dates (e.g. span-event end dates) where there's no
  // separate authored-text version and no inner range to capture.
  simple?: boolean;
}>();

const dateTypeOptions = computed(() =>
  props.simple ? DATE_TYPE_VALUES.filter(dt => dt !== 'between') : DATE_TYPE_VALUES,
);

const emit = defineEmits<{
  'update:dateType': [value: string];
  'update:dateValue': [value: string];
  'update:dateValueEnd': [value: string];
  'update:dateOriginal': [value: string];
}>();

const { t } = useI18n();

const nativeStartRef = ref<HTMLInputElement | null>(null);
const nativeEndRef = ref<HTMLInputElement | null>(null);

function fullIso(s: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

function sanitize(raw: string): string {
  const cleaned = raw.replace(/[^\d-]/g, '').slice(0, 10);
  return cleaned.replace(/^-+/, '').replace(/-{2,}/g, '-');
}

function onStartTextInput(e: Event) {
  const el = e.target as HTMLInputElement;
  const val = sanitize(el.value);
  if (el.value !== val) el.value = val;
  emit('update:dateValue', val);
}

function onEndTextInput(e: Event) {
  const el = e.target as HTMLInputElement;
  const val = sanitize(el.value);
  if (el.value !== val) el.value = val;
  emit('update:dateValueEnd', val);
}

function openPicker(el: HTMLInputElement | null) {
  if (!el) return;
  if (typeof (el as HTMLInputElement & { showPicker?: () => void }).showPicker === 'function') {
    (el as HTMLInputElement & { showPicker: () => void }).showPicker();
  } else {
    el.focus();
    el.click();
  }
}

function onNativePick(e: Event, isEnd: boolean) {
  const val = (e.target as HTMLInputElement).value;
  if (!val) return;
  if (isEnd) {
    emit('update:dateValueEnd', val);
  } else {
    emit('update:dateValue', val);
    if (props.dateType === 'unknown') emit('update:dateType', 'exact');
  }
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
  padding: 6px 9px;
  border: 1.5px solid var(--surface-border);
  border-radius: 6px;
  font-size: 12px;
  min-width: 120px;
  background: var(--surface-bg);
  color: var(--text-secondary);
  font-family: inherit;
  outline: none;
}
.date-row select:focus {
  border-color: var(--accent);
  background: var(--surface);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent);
}
.date-field {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex: 1;
  min-width: 160px;
}
.date-text {
  width: 100%;
  padding: 6px 32px 6px 9px;
  border: 1.5px solid var(--surface-border);
  border-radius: 6px;
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
  background: var(--surface-bg);
  color: var(--text-secondary);
  outline: none;
}
.date-text:focus {
  border-color: var(--accent);
  background: var(--surface);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent);
}
.date-picker-btn {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
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
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  width: 24px;
  height: 24px;
  opacity: 0;
  pointer-events: none;
}
.date-sep {
  color: var(--text-muted);
  font-size: var(--font-sm);
}
.date-original-row input {
  width: 100%;
  padding: 6px 9px;
  border: 1.5px solid var(--surface-border);
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--surface-bg);
  font-family: inherit;
  outline: none;
}
.date-original-row input:focus {
  border-color: var(--accent);
  background: var(--surface);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent);
}
</style>
