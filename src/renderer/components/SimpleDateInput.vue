<template>
  <div class="simple-date-input">
    <input
      type="text"
      inputmode="numeric"
      :value="modelValue"
      :placeholder="$t('dateInput.placeholder')"
      :aria-label="$t('dateInput.placeholder')"
      class="date-text"
      @input="onTextInput($event)"
    />
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
      :value="fullIso(modelValue)"
      tabindex="-1"
      aria-hidden="true"
      @change="onNativePick($event)"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const nativeRef = ref<HTMLInputElement | null>(null);

function fullIso(s: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

function sanitize(raw: string): string {
  // Keep digits and dashes, collapse to YYYY[-MM[-DD]] shape, max 10 chars
  const cleaned = raw.replace(/[^\d-]/g, '').slice(0, 10);
  // Avoid leading dashes / consecutive dashes
  return cleaned.replace(/^-+/, '').replace(/-{2,}/g, '-');
}

function onTextInput(e: Event) {
  const el = e.target as HTMLInputElement;
  const val = sanitize(el.value);
  if (el.value !== val) el.value = val;
  emit('update:modelValue', val);
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
  emit('update:modelValue', val);
}
</script>

<style scoped>
.simple-date-input {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 100%;
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
</style>
