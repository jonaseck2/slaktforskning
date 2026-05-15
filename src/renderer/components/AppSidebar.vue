<template>
  <nav class="sidebar" aria-label="Main navigation">
    <a href="#main-content" class="skip-link">{{ $t('a11y.skipToMain') }}</a>
    <div class="sidebar-header">
      <span class="sidebar-title">🌿 {{ $t('app.title') }}</span>
    </div>

    <template v-for="sec in sections" :key="sec.key">
      <h2 v-if="sec.labelKey" class="nav-section-label">{{ $t(sec.labelKey) }}</h2>
      <router-link
        v-for="item in sec.items"
        :key="item.to"
        :to="item.to"
        class="nav-item"
        :aria-label="item.ariaLabel ?? $t(item.labelKey)"
      >
        <span class="nav-icon" aria-hidden="true">{{ item.icon }}</span>
        <span class="nav-label">{{ $t(item.labelKey) }}</span>
        <span v-if="badgeValue(item) > 0" class="error-badge">{{ badgeValue(item) }}</span>
      </router-link>
    </template>

    <div class="sidebar-spacer"></div>

    <slot name="bottom" />

    <AppSettingsPanel :variant="variant" />
  </nav>
</template>

<script setup lang="ts">
import AppSettingsPanel from './AppSettingsPanel.vue';
import type { NavItemDef, NavSectionDef } from './AppSidebarTypes';

defineProps<{
  sections: NavSectionDef[];
  variant: 'renderer' | 'static';
}>();

function badgeValue(item: NavItemDef): number {
  if (!item.badge) return 0;
  return typeof item.badge === 'object' && 'value' in item.badge ? item.badge.value : 0;
}
</script>

<style scoped>
/* Sidebar chrome — self-contained so the component renders correctly without
 * relying on the consuming App.vue's global <style> block. Rules ported
 * verbatim from src/renderer/App.vue (the canonical source). The .skip-link
 * rule lives in src/renderer/styles/shared.css globally, so it does not need
 * to be duplicated here. */

.sidebar {
  width: 220px;
  background: var(--sidebar-bg);
  color: var(--sidebar-text);
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-shrink: 0;
  overflow-y: auto;
  border-radius: var(--radius-lg);
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px 10px;
  border-bottom: 1px solid var(--sidebar-border);
  margin-bottom: 8px;
  flex-shrink: 0;
}

.sidebar-title {
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--sidebar-active-text);
}

.nav-section-label {
  font-size: var(--font-xs);
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--sidebar-text-muted);
  padding: 2px 10px 6px;
  flex-shrink: 0;
}

.sidebar a,
.nav-item {
  color: var(--sidebar-text);
  text-decoration: none;
  padding: 7px 10px;
  border-radius: 6px;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.sidebar a:hover,
.sidebar a.router-link-active,
.nav-item:hover,
.nav-item.router-link-active {
  background: var(--sidebar-active-bg);
  color: var(--sidebar-active-text);
}

.nav-icon { font-size: var(--font-base); line-height: 1; flex-shrink: 0; }
.nav-label { font-size: var(--font-sm); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.sidebar-spacer {
  flex: 1;
}

.error-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--error-bg);
  color: var(--error-text);
  border-radius: 8px;
  padding: 1px 5px;
  font-size: var(--font-xs);
  font-weight: 700;
  min-width: 1.4em;
  height: 1.4em;
  line-height: 1.4em;
  flex-shrink: 0;
}

@media print {
  .sidebar { display: none !important; }
}
</style>
