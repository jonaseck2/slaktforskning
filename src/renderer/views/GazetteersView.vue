<template>
  <div>
    <div class="header">
      <h2>{{ $t('gazetteers.title') }}</h2>
    </div>

    <p class="gazetteers-description">{{ $t('gazetteers.description') }}</p>

    <!-- Installed gazetteers -->
    <div class="detail-section">
      <div class="section-header">
        <h4>{{ $t('gazetteers.installed') }}</h4>
      </div>
      <table v-if="allGazetteers.length > 0" class="data-table">
        <thead>
          <tr>
            <th>{{ $t('gazetteers.enabled') }}</th>
            <th>{{ $t('gazetteers.name') }}</th>
            <th>{{ $t('gazetteers.locale') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="gaz in allGazetteers" :key="gaz.id">
            <td>
              <input
                type="checkbox"
                :checked="config.enabledGazetteers.includes(gaz.id)"
                @change="toggleGazetteer(gaz.id, ($event.target as HTMLInputElement).checked)"
              />
            </td>
            <td>{{ gaz.name }}</td>
            <td>{{ gaz.locale }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty-hint">No gazetteers installed.</p>
    </div>

    <!-- Test lookup -->
    <div class="detail-section">
      <div class="section-header">
        <h4>{{ $t('gazetteers.testLookup') }}</h4>
      </div>
      <input
        v-model="testQuery"
        type="text"
        class="test-input"
        :placeholder="$t('gazetteers.testPlaceholder')"
      />
      <div v-if="testQuery && result" class="test-result">
        <div class="result-header">
          <span :class="['quality-badge', 'quality-' + result.matchQuality]">
            {{ $t('gazetteers.match.' + result.matchQuality) }}
          </span>
          <span class="result-path">{{ result.matchedPath.join(' > ') }}</span>
        </div>
        <div class="result-details">
          <span class="result-coords">{{ result.lat.toFixed(4) }}, {{ result.lon.toFixed(4) }}</span>
          <span v-if="result.unmatchedComponents.length > 0" class="result-unmatched">
            {{ $t('gazetteers.unmatched') }}: {{ result.unmatchedComponents.join(', ') }}
          </span>
        </div>
      </div>
      <p v-else-if="testQuery && !result" class="empty-hint">{{ $t('gazetteers.noMatch') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { getAllGazetteers, loadGazetteers } from '../../api/place-gazetteers/index';
import { resolvePlace } from '../../api/place-gazetteers/resolver';
import type { GazetteerConfig, Gazetteer } from '../../api/place-gazetteers/types';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const allGazetteers: Gazetteer[] = getAllGazetteers();
const config = ref<GazetteerConfig>({ enabledGazetteers: allGazetteers.map(g => g.id) });
const testQuery = ref('');

const enabledGazetteers = computed(() => loadGazetteers(config.value));
const result = computed(() => resolvePlace(testQuery.value, enabledGazetteers.value));

async function loadConfig() {
  const raw = await window.api.db.getSetting('gazetteer_config') as string | null;
  if (raw) {
    try {
      config.value = JSON.parse(raw) as GazetteerConfig;
    } catch {
      // keep default
    }
  }
}

async function saveConfig() {
  await window.api.db.setSetting('gazetteer_config', JSON.stringify(config.value));
}

function toggleGazetteer(id: string, checked: boolean) {
  if (checked) {
    if (!config.value.enabledGazetteers.includes(id)) {
      config.value = { ...config.value, enabledGazetteers: [...config.value.enabledGazetteers, id] };
    }
  } else {
    config.value = { ...config.value, enabledGazetteers: config.value.enabledGazetteers.filter(g => g !== id) };
  }
  saveConfig();
}

onMounted(loadConfig);
</script>

<style scoped>
.gazetteers-description {
  font-size: var(--font-sm);
  color: #666;
  margin-bottom: 16px;
  max-width: 640px;
  line-height: 1.5;
}

.test-input {
  width: 100%;
  padding: 8px;
  font-family: inherit;
  font-size: var(--font-sm);
  border: 1px solid #ddd;
  border-radius: 4px;
  box-sizing: border-box;
}

.test-result {
  margin-top: 10px;
  padding: 10px;
  background: #f8f8f8;
  border-radius: 4px;
  font-size: var(--font-sm);
}

.result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.quality-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: var(--font-xs);
  font-weight: 600;
}

.quality-exact {
  background: #d1fae5;
  color: #065f46;
}

.quality-partial {
  background: #fef3c7;
  color: #92400e;
}

.quality-ambiguous {
  background: #fee2e2;
  color: #991b1b;
}

.result-path {
  font-weight: 500;
}

.result-details {
  display: flex;
  gap: 16px;
  font-size: var(--font-xs);
  color: #666;
}

.result-unmatched {
  color: #b45309;
}

.result-coords {
  font-family: monospace;
}
</style>
