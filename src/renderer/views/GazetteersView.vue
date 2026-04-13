<template>
  <div>
    <div class="header">
      <h2>{{ $t('gazetteers.title') }}</h2>
      <button class="btn-add" @click="fileInput?.click()">+ {{ $t('gazetteers.importBtn') }}</button>
      <input
        ref="fileInput"
        type="file"
        accept=".json,.json.gz"
        style="display: none"
        @change="handleImport"
      />
    </div>

    <p class="gazetteers-description">{{ $t('gazetteers.description') }}</p>

    <!-- Installed gazetteers -->
    <div class="detail-section">
      <div class="section-header">
        <h4>{{ $t('gazetteers.installed') }}</h4>
      </div>
      <div v-if="gazetteerList.length > 0" class="gazetteer-cards">
        <div v-for="gaz in gazetteerList" :key="gaz.id" class="gazetteer-card">
          <div class="gazetteer-card-header">
            <label class="gazetteer-toggle">
              <input
                type="checkbox"
                :checked="config.enabledGazetteers.includes(gaz.id)"
                @change="toggleGazetteer(gaz.id, ($event.target as HTMLInputElement).checked)"
              />
              <span class="gazetteer-card-name">{{ gaz.name }}</span>
            </label>
            <div class="gazetteer-card-actions">
              <span :class="['type-badge', gaz.bundled ? 'type-bundled' : 'type-imported']">
                {{ gaz.bundled ? $t('gazetteers.bundled') : $t('gazetteers.imported') }}
              </span>
              <button class="btn-sm" @click="handleExport(gaz.id, gaz.name)">{{ $t('gazetteers.exportBtn') }}</button>
              <button v-if="!gaz.bundled" class="btn-delete" @click="confirmDelete(gaz)">{{ $t('gazetteers.deleteBtn') }}</button>
            </div>
          </div>
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

    <ConfirmModal
      :visible="deleteModal.visible"
      :title="$t('gazetteers.deleteConfirmTitle')"
      :message="deleteModal.message"
      @confirm="doDelete"
      @cancel="deleteModal.visible = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { getAllGazetteers } from '../../api/place-gazetteers/index';
import { resolvePlace } from '../../api/place-gazetteers/resolver';
import type { GazetteerConfig, Gazetteer, GazetteerInfo } from '../../api/place-gazetteers/types';
import { usePlaceResolver } from '../composables/usePlaceResolver';
import ConfirmModal from '../components/ConfirmModal.vue';
import { useI18n } from 'vue-i18n';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const { t } = useI18n();
const { invalidate: invalidatePlaceResolver } = usePlaceResolver();

const fileInput = ref<HTMLInputElement | null>(null);
const gazetteerList = ref<GazetteerInfo[]>([]);
const config = ref<GazetteerConfig>({ enabledGazetteers: [] });
const enabledGazetteerObjects = ref<Gazetteer[]>([]);
const testQuery = ref('');

const deleteModal = ref<{ visible: boolean; id: string; name: string; message: string }>({
  visible: false,
  id: '',
  name: '',
  message: '',
});

/** Resolve against each enabled gazetteer individually so the user sees all matches */
const results = computed(() => {
  const q = testQuery.value;
  if (!q) return [];
  return enabledGazetteerObjects.value
    .map(gaz => ({ gaz, result: resolvePlace(q, [gaz]) }))
    .filter((r): r is { gaz: Gazetteer; result: NonNullable<ReturnType<typeof resolvePlace>> } => r.result !== null);
});

function buildEnabledGazetteers(cfg: GazetteerConfig, imported: Gazetteer[]): Gazetteer[] {
  const enabled = new Set(cfg.enabledGazetteers);
  const bundled = getAllGazetteers().filter(g => enabled.has(g.id));
  const imp = imported.filter(g => enabled.has(g.id));
  return [...bundled, ...imp];
}

async function loadAll() {
  // Load list (bundled + imported)
  const list = await window.api.gazetteers.list() as GazetteerInfo[];
  gazetteerList.value = list;

  // Load config
  const raw = await window.api.db.getSetting('gazetteer_config') as string | null;
  if (raw) {
    try {
      config.value = JSON.parse(raw) as GazetteerConfig;
    } catch {
      // keep default
    }
  } else {
    // Default: enable all bundled gazetteers
    config.value = { enabledGazetteers: list.filter(g => g.bundled).map(g => g.id) };
  }

  // Load full Gazetteer objects for test lookup
  const imported = await window.api.gazetteers.getImported() as Gazetteer[];
  enabledGazetteerObjects.value = buildEnabledGazetteers(config.value, imported);
}

async function saveConfig() {
  await window.api.db.setSetting('gazetteer_config', JSON.stringify(config.value));
  // Reload enabled gazetteers for test lookup
  const imported = await window.api.gazetteers.getImported() as Gazetteer[];
  enabledGazetteerObjects.value = buildEnabledGazetteers(config.value, imported);
  invalidatePlaceResolver();
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

async function handleImport(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  let text: string;
  try {
    if (file.name.endsWith('.gz')) {
      const ds = new DecompressionStream('gzip');
      const stream = file.stream().pipeThrough(ds);
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      text = new TextDecoder().decode(chunks.reduce((a, b) => { const c = new Uint8Array(a.length + b.length); c.set(a); c.set(b, a.length); return c; }, new Uint8Array(0)));
    } else {
      text = await file.text();
    }
  } catch (e) {
    alert(t('gazetteers.importError', { error: String(e) }));
    return;
  }

  try {
    const result = await window.api.gazetteers.import(text) as { id: string; name: string; nodeCount: number };
    // Auto-enable the imported gazetteer
    if (!config.value.enabledGazetteers.includes(result.id)) {
      config.value = { ...config.value, enabledGazetteers: [...config.value.enabledGazetteers, result.id] };
      await window.api.db.setSetting('gazetteer_config', JSON.stringify(config.value));
    }
    alert(t('gazetteers.importSuccess', { name: result.name, nodeCount: result.nodeCount }));
    await loadAll();
    invalidatePlaceResolver();
  } catch (e) {
    alert(t('gazetteers.importError', { error: String(e) }));
  } finally {
    // Reset file input so same file can be re-imported
    if (fileInput.value) fileInput.value.value = '';
  }
}

async function handleExport(id: string, name: string) {
  const json = await window.api.gazetteers.export(id) as string | null;
  if (!json) return;
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/[^a-z0-9]/gi, '_')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function confirmDelete(gaz: GazetteerInfo) {
  deleteModal.value = {
    visible: true,
    id: gaz.id,
    name: gaz.name,
    message: t('gazetteers.deleteConfirmMessage', { name: gaz.name }),
  };
}

async function doDelete() {
  const id = deleteModal.value.id;
  deleteModal.value.visible = false;
  await window.api.gazetteers.delete(id);
  // Remove from enabled list if present
  config.value = { ...config.value, enabledGazetteers: config.value.enabledGazetteers.filter(g => g !== id) };
  await window.api.db.setSetting('gazetteer_config', JSON.stringify(config.value));
  invalidatePlaceResolver();
  await loadAll();
}

function openExternal(url: string) {
  window.api.shell.openExternal(url);
}

onMounted(loadAll);
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

.gazetteer-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.gazetteer-card-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.type-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: var(--font-xs);
  font-weight: 500;
}

.type-bundled {
  background: #e0e7ff;
  color: #3730a3;
}

.type-imported {
  background: #d1fae5;
  color: #065f46;
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
