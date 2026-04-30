<template>
  <div class="defaults-view">
    <h2>{{ $t('defaults.title') }}</h2>
    <section class="defaults-section">
      <h3>{{ $t('defaults.eventsSection') }}</h3>
      <label class="toggle-label">
        <input type="checkbox" :checked="smartDefaults" @change="toggle" />
        {{ $t('defaults.smartEventType') }}
      </label>
      <p class="defaults-hint">{{ $t('defaults.smartEventTypeHint') }}</p>

      <fieldset class="sort-fieldset">
        <legend>{{ $t('defaults.eventTypeSortLabel') }}</legend>
        <label class="radio-label">
          <input
            type="radio"
            name="event-type-sort"
            value="alphabetical"
            :checked="eventTypeSort === 'alphabetical'"
            @change="setSort('alphabetical')"
          />
          {{ $t('defaults.eventTypeSortAlphabetical') }}
        </label>
        <label class="radio-label">
          <input
            type="radio"
            name="event-type-sort"
            value="canonical"
            :checked="eventTypeSort === 'canonical'"
            @change="setSort('canonical')"
          />
          {{ $t('defaults.eventTypeSortCanonical') }}
        </label>
        <p class="defaults-hint">{{ $t('defaults.eventTypeSortHint') }}</p>
      </fieldset>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { isEventTypeSortMode, type EventTypeSortMode } from '../utils/eventTypeSort';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const smartDefaults = ref(true);
const eventTypeSort = ref<EventTypeSortMode>('alphabetical');

async function load() {
  const raw = (await window.api.db.getSetting('event_defaults_config')) as string | null;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { smartDefaults?: boolean };
      smartDefaults.value = parsed.smartDefaults !== false;
    } catch {
      smartDefaults.value = true;
    }
  }
  const sortRaw = (await window.api.db.getSetting('event_type_sort')) as string | null;
  eventTypeSort.value = isEventTypeSortMode(sortRaw) ? sortRaw : 'alphabetical';
}

async function toggle(e: Event) {
  const on = (e.target as HTMLInputElement).checked;
  smartDefaults.value = on;
  await window.api.db.setSetting('event_defaults_config', JSON.stringify({ smartDefaults: on }));
}

async function setSort(mode: EventTypeSortMode) {
  eventTypeSort.value = mode;
  await window.api.db.setSetting('event_type_sort', mode);
}

onMounted(load);
</script>

<style scoped>
.defaults-view { padding: var(--space-md); }
.defaults-section { margin-top: var(--space-md); }
.toggle-label {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: var(--font-base);
  color: var(--text-primary);
  cursor: pointer;
}
.toggle-label input[type='checkbox'] {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
  cursor: pointer;
}
.defaults-hint {
  margin-top: var(--space-xs);
  color: var(--text-muted);
  font-size: var(--font-sm);
}
.sort-fieldset {
  margin-top: var(--space-lg);
  padding: var(--space-sm) var(--space-md) var(--space-md);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
}
.sort-fieldset legend {
  font-size: var(--font-sm);
  font-weight: var(--font-weight-bold, 600);
  color: var(--text-primary);
  padding: 0 var(--space-xs);
}
.radio-label {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: var(--font-base);
  color: var(--text-primary);
  cursor: pointer;
  padding: var(--space-xs) 0;
}
.radio-label input[type='radio'] {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
  cursor: pointer;
}
</style>
