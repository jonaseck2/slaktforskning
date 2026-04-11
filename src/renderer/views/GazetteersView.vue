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
      <div v-if="allGazetteers.length > 0" class="gazetteer-cards">
        <div v-for="gaz in allGazetteers" :key="gaz.id" class="gazetteer-card">
          <label class="gazetteer-toggle">
            <input
              type="checkbox"
              :checked="config.enabledGazetteers.includes(gaz.id)"
              @change="toggleGazetteer(gaz.id, ($event.target as HTMLInputElement).checked)"
            />
            <span class="gazetteer-card-name">{{ gaz.name }}</span>
          </label>
          <div v-if="gaz.description" class="gazetteer-card-desc">{{ gaz.description }}</div>
          <div v-if="gaz.source" class="gazetteer-card-source">
            {{ $t('gazetteers.source') }}:
            <a href="#" @click.prevent="openExternal(gaz.source.url)">{{ gaz.source.name }}</a>
            <span class="source-license">({{ gaz.source.license }})</span>
            <span v-if="gaz.source.created" class="source-date">{{ $t('gazetteers.created') }} {{ gaz.source.created }}</span>
            <span class="source-date">{{ $t('gazetteers.fetched') }} {{ gaz.source.fetched }}</span>
            <a v-if="gaz.source.kgmid" href="#" class="source-kg-link" @click.prevent="openExternal('https://www.google.com/search?kgmid=' + encodeURIComponent(gaz.source.kgmid))">{{ $t('gazetteers.knowledgeGraph') }}</a>
          </div>
        </div>
      </div>
      <p v-else class="empty-hint">{{ $t('gazetteers.noGazetteers') }}</p>
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
      <div v-if="testQuery && results.length > 0" class="test-results">
        <div v-for="r in results" :key="r.gaz.id" class="test-result">
          <div class="result-header">
            <span :class="['quality-badge', 'quality-' + r.result.matchQuality]">
              {{ $t('gazetteers.match.' + r.result.matchQuality) }}
            </span>
            <span class="result-gazetteer">{{ r.gaz.name }}</span>
          </div>
          <div class="result-path">{{ r.result.matchedPath.join(' > ') }}</div>
          <div class="result-details">
            <span class="result-coords">{{ r.result.lat.toFixed(4) }}, {{ r.result.lon.toFixed(4) }}</span>
            <span v-if="r.result.unmatchedComponents.length > 0" class="result-unmatched">
              {{ $t('gazetteers.unmatched') }}: {{ r.result.unmatchedComponents.join(', ') }}
            </span>
          </div>
        </div>
      </div>
      <p v-else-if="testQuery && results.length === 0" class="empty-hint">{{ $t('gazetteers.noMatch') }}</p>
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

/** Resolve against each enabled gazetteer individually so the user sees all matches */
const results = computed(() => {
  const q = testQuery.value;
  if (!q) return [];
  return enabledGazetteers.value
    .map(gaz => ({ gaz, result: resolvePlace(q, [gaz]) }))
    .filter((r): r is { gaz: Gazetteer; result: NonNullable<ReturnType<typeof resolvePlace>> } => r.result !== null);
});

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

function openExternal(url: string) {
  window.api.shell.openExternal(url);
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

.gazetteer-cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.gazetteer-card {
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #fafafa;
}

.gazetteer-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.gazetteer-card-name {
  font-weight: 600;
  font-size: var(--font-base);
}

.gazetteer-card-desc {
  font-size: var(--font-sm);
  color: #555;
  margin-top: 4px;
  margin-left: 24px;
  line-height: 1.4;
}

.gazetteer-card-source {
  font-size: var(--font-xs);
  color: #888;
  margin-top: 6px;
  margin-left: 24px;
}

.gazetteer-card-source a {
  color: var(--color-primary, #4f46e5);
  text-decoration: none;
}

.gazetteer-card-source a:hover {
  text-decoration: underline;
}

.source-license {
  margin-left: 4px;
}

.source-date {
  margin-left: 8px;
  color: #aaa;
}

.source-kg-link {
  margin-left: 8px;
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

.test-results {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}

.test-result {
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

.result-gazetteer {
  font-size: var(--font-xs);
  color: #888;
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
