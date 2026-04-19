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
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const smartDefaults = ref(true);

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
}

async function toggle(e: Event) {
  const on = (e.target as HTMLInputElement).checked;
  smartDefaults.value = on;
  await window.api.db.setSetting('event_defaults_config', JSON.stringify({ smartDefaults: on }));
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
</style>
