<template>
  <div class="appearance-settings">
    <h3 class="appearance-section-title">{{ $t('settings.menuLayout') }}</h3>
    <p class="appearance-section-hint">{{ $t('settings.menuLayoutHint') }}</p>
    <div class="appearance-options" role="radiogroup" :aria-label="$t('settings.menuLayout')">
      <button
        type="button"
        class="appearance-card"
        :class="{ 'appearance-card--on': store.navOrientation.value === 'vertical' }"
        role="radio"
        :aria-checked="String(store.navOrientation.value === 'vertical')"
        @click="store.setNavOrientation('vertical')"
      >
        <svg viewBox="0 0 80 50" class="appearance-card-svg" aria-hidden="true">
          <rect x="2"  y="2"  width="22" height="46" rx="3" fill="var(--sidebar-bg)" />
          <rect x="6"  y="8"  width="14" height="3" rx="1" fill="var(--sidebar-text-muted)" />
          <rect x="6"  y="14" width="14" height="3" rx="1" fill="var(--sidebar-text-muted)" />
          <rect x="6"  y="20" width="14" height="3" rx="1" fill="var(--sidebar-text-muted)" />
          <rect x="6"  y="26" width="14" height="3" rx="1" fill="var(--sidebar-text-muted)" />
          <rect x="26" y="2"  width="52" height="46" rx="3" fill="var(--surface)" />
        </svg>
        <span class="appearance-card-label">{{ $t('settings.menuVertical') }}</span>
      </button>
      <button
        type="button"
        class="appearance-card"
        :class="{ 'appearance-card--on': store.navOrientation.value === 'horizontal' }"
        role="radio"
        :aria-checked="String(store.navOrientation.value === 'horizontal')"
        @click="store.setNavOrientation('horizontal')"
      >
        <svg viewBox="0 0 80 50" class="appearance-card-svg" aria-hidden="true">
          <rect x="2"  y="2"  width="76" height="14" rx="3" fill="var(--sidebar-bg)" />
          <rect x="6"  y="6"  width="10" height="3" rx="1" fill="var(--sidebar-text-muted)" />
          <rect x="20" y="6"  width="10" height="3" rx="1" fill="var(--sidebar-text-muted)" />
          <rect x="34" y="6"  width="10" height="3" rx="1" fill="var(--sidebar-text-muted)" />
          <rect x="48" y="6"  width="10" height="3" rx="1" fill="var(--sidebar-text-muted)" />
          <rect x="2"  y="18" width="76" height="30" rx="3" fill="var(--surface)" />
        </svg>
        <span class="appearance-card-label">{{ $t('settings.menuHorizontal') }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject, type Ref } from 'vue';

interface AppearanceStore {
  navOrientation: Ref<'vertical' | 'horizontal'>;
  setNavOrientation: (value: 'vertical' | 'horizontal') => void;
}

const store = inject<AppearanceStore>('appearance-store')!;
</script>

<style scoped>
.appearance-settings {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  max-width: 640px;
}
.appearance-section-title {
  font-size: var(--font-md);
  font-weight: 600;
  margin: 0;
}
.appearance-section-hint {
  font-size: var(--font-sm);
  color: var(--text-muted);
  margin: 0;
}
.appearance-options {
  display: flex;
  gap: var(--space-md);
  flex-wrap: wrap;
}
.appearance-card {
  background: var(--surface-bg);
  border: 2px solid var(--surface-border);
  border-radius: var(--radius-md);
  padding: var(--space-sm);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xs);
  font-family: inherit;
  color: var(--text-primary);
  transition: border-color 0.15s, background 0.15s;
  min-width: 140px;
}
.appearance-card:hover {
  background: var(--surface-hover);
}
.appearance-card--on {
  border-color: var(--accent);
  background: var(--surface);
}
.appearance-card-svg {
  width: 100%;
  max-width: 160px;
  height: auto;
  border: 1px solid var(--surface-border-subtle);
  border-radius: var(--radius-sm);
}
.appearance-card-label {
  font-size: var(--font-sm);
  font-weight: 600;
}
</style>
