<template>
  <div>
    <div class="header">
      <h2>{{ $t('gazetteers.title') }}</h2>
      <AppButton variant="soft" @click="fileInput?.click()">+ {{ $t('gazetteers.importBtn') }}</AppButton>
      <input
        ref="fileInput"
        type="file"
        accept=".json,.json.gz"
        style="display: none"
        @change="handleImport"
      />
    </div>

    <p class="gazetteers-description">{{ $t('gazetteers.description') }}</p>

    <!-- Test lookup -->
    <div class="detail-section">
      <div class="section-header">
        <h4>{{ $t('gazetteers.testLookup') }}</h4>
      </div>
      <div class="test-input-wrap">
        <input
          v-model="testQuery"
          type="text"
          class="list-filter-input"
          :placeholder="$t('gazetteers.testPlaceholder')"
        />
      </div>
      <div v-if="debouncedTestQuery" class="test-scope-filter">
        <FilterChips :model-value="testScope" :options="testScopeOptions" @update:model-value="setTestScope" />
      </div>
      <div v-if="debouncedTestQuery && results.length > 0" class="test-results">
        <div v-for="r in results" :key="r.gaz.id" class="test-result" :class="{ 'no-match': !r.result }">
          <div class="result-header">
            <span v-if="r.result" :class="['quality-badge', 'quality-' + r.result.matchQuality]">
              {{ $t('gazetteers.match.' + r.result.matchQuality) }}
            </span>
            <span v-else class="quality-badge quality-none">{{ $t('gazetteers.noMatch') }}</span>
            <span class="result-gazetteer">{{ r.gaz.name }}</span>
          </div>
          <template v-if="r.result">
            <div class="result-path">{{ r.result.matchedPath.join(' > ') }}</div>
            <div class="result-details">
              <span class="result-coords">{{ r.result.lat.toFixed(4) }}, {{ r.result.lon.toFixed(4) }}</span>
              <span v-if="r.result.unmatchedComponents.length > 0" class="result-unmatched">
                {{ $t('gazetteers.unmatched') }}: {{ r.result.unmatchedComponents.join(', ') }}
              </span>
            </div>
          </template>
        </div>
      </div>
      <SectionEmpty v-else-if="debouncedTestQuery && results.length === 0" :message="$t('gazetteers.noMatch')" />
    </div>

    <!-- Installed gazetteers -->
    <div class="detail-section">
      <div class="section-header">
        <h4>{{ $t('gazetteers.installed') }}</h4>
      </div>
      <div v-if="gazetteerList.length > 0" class="filter-bars">
        <FilterChips :model-value="filterCountry" :options="countryOptions" @update:model-value="toggleCountry" />
        <FilterChips :model-value="filterKind" :options="kindOptions" @update:model-value="toggleKind" />
      </div>
      <div v-if="filteredGazetteers.length > 0" class="gazetteer-cards">
        <div v-for="gaz in filteredGazetteers" :key="gaz.id" class="gazetteer-card">
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
              <span :class="['kind-badge', 'kind-' + (gaz.kind || 'point')]">
                {{ $t('gazetteers.kind' + (gaz.kind === 'boundary' ? 'Boundary' : gaz.kind === 'language' ? 'Language' : 'Point')) }}
              </span>
              <span :class="['type-badge', gaz.bundled ? 'type-bundled' : 'type-imported']">
                {{ gaz.bundled ? $t('gazetteers.bundled') : $t('gazetteers.imported') }}
              </span>
              <button class="btn-sm" @click="handleExport(gaz.id, gaz.name)">{{ $t('gazetteers.exportBtn') }}</button>
              <button v-if="!gaz.bundled" class="btn-delete" @click="confirmDelete(gaz)">{{ $t('common.delete') }}</button>
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
      <SectionEmpty v-else :message="$t('empty.gazetteers')" />
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
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import AppButton from '../components/ui/AppButton.vue';
import SectionEmpty from '../components/ui/SectionEmpty.vue';
import FilterChips from '../components/ui/FilterChips.vue';
import { loadGazetteers } from '../../api/place-gazetteers/merge';
import { resolvePlace } from '../../api/place-gazetteers/resolver';
import type { GazetteerConfig, Gazetteer, GazetteerInfo } from '../../api/place-gazetteers/types';
import { usePlaceResolver } from '../composables/usePlaceResolver';
import ConfirmModal from '../components/ConfirmModal.vue';
import { useI18n } from 'vue-i18n';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const { t } = useI18n();
const { invalidate: invalidatePlaceResolver, ensureLoaded: ensurePlaceResolverLoaded } = usePlaceResolver();

const fileInput = ref<HTMLInputElement | null>(null);
const gazetteerList = ref<GazetteerInfo[]>([]);
const config = ref<GazetteerConfig>({ enabledGazetteers: [] });
// Full Gazetteer objects retained so the test-resolution loop can iterate
// each source individually (the merge engine collapses everything into one
// `__merged__` entry, which would hide which gazetteer actually matched).
const allBundled = ref<Gazetteer[]>([]);
const allImported = ref<Gazetteer[]>([]);
const testQuery = ref('');
// Debounced mirror of testQuery — the resolver loop reads this so that fast
// typing doesn't trigger one resolve per keystroke. 200 ms matches the
// `usePagedList` convention used by every other filterable list view.
const debouncedTestQuery = ref('');
let queryDebounceTimer: ReturnType<typeof setTimeout> | null = null;
watch(testQuery, (q) => {
  if (queryDebounceTimer) clearTimeout(queryDebounceTimer);
  queryDebounceTimer = setTimeout(() => {
    debouncedTestQuery.value = q;
    queryDebounceTimer = null;
  }, 200);
});
onBeforeUnmount(() => {
  if (queryDebounceTimer) clearTimeout(queryDebounceTimer);
});
const filterCountry = ref('');
const filterKind = ref('');
// Test-results scope: 'matched' shows only gazetteers that produced a hit;
// 'all' shows every enabled gazetteer with an empty-state row when no hit.
const testScope = ref<'matched' | 'all'>('matched');

const countryOptions = computed(() => {
  const counts = new Map<string, number>();
  for (const g of gazetteerList.value) {
    if (g.rootName) counts.set(g.rootName, (counts.get(g.rootName) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([country, count]) => ({ value: country, label: country, count }));
});

const kindOptions = computed(() => {
  const counts = new Map<string, number>();
  const base = filterCountry.value
    ? gazetteerList.value.filter(g => g.rootName === filterCountry.value)
    : gazetteerList.value;
  for (const g of base) {
    const kind = g.kind || 'point';
    counts.set(kind, (counts.get(kind) || 0) + 1);
  }
  const options: { value: string; label: string; count: number }[] = [];
  for (const kind of ['point', 'boundary', 'language']) {
    const count = counts.get(kind);
    if (count) {
      options.push({ value: kind, label: t('gazetteers.kind' + (kind === 'boundary' ? 'Boundary' : kind === 'language' ? 'Language' : 'Point')), count });
    }
  }
  return options;
});

function toggleCountry(value: string) {
  filterCountry.value = filterCountry.value === value ? '' : value;
  filterKind.value = '';
}

function toggleKind(value: string) {
  filterKind.value = filterKind.value === value ? '' : value;
}

const filteredGazetteers = computed(() => {
  return gazetteerList.value.filter(g => {
    if (filterCountry.value && g.rootName !== filterCountry.value) return false;
    if (filterKind.value && (g.kind || 'point') !== filterKind.value) return false;
    return true;
  });
});

const deleteModal = ref<{ visible: boolean; id: string; name: string; message: string }>({
  visible: false,
  id: '',
  name: '',
  message: '',
});

/**
 * Pre-merge each enabled non-language source with the enabled language
 * gazetteers once per config change. `loadGazetteers` deep-clones the
 * source tree on every merge; doing it inside the per-keystroke `results`
 * computed turned typing into a ~25× tree-clone storm on the renderer
 * thread. This computed only invalidates when the loaded gazetteers or
 * enabled set change, so typing only pays the resolver cost.
 */
const mergedPerSource = computed(() => {
  const enabled = new Set(config.value.enabledGazetteers);
  const known = [...allBundled.value, ...allImported.value];
  const isLanguage = (g: Gazetteer): boolean => g.shape === 'language' || g.kind === 'language';
  const langIds = known.filter(g => enabled.has(g.id) && isLanguage(g)).map(g => g.id);
  const sources = known.filter(g => enabled.has(g.id) && !isLanguage(g));
  return sources.map(gaz => ({
    gaz,
    merged: loadGazetteers(
      { enabledGazetteers: [gaz.id, ...langIds] },
      allBundled.value,
      allImported.value,
    ),
  }));
});

/**
 * Resolve against each pre-merged source so the user can see which source
 * contributed each match. Sources with no hit are dropped unless
 * `testScope === 'all'`.
 */
const results = computed(() => {
  const q = debouncedTestQuery.value;
  if (!q) return [];
  const out: { gaz: Gazetteer; result: ReturnType<typeof resolvePlace> | null }[] = [];
  for (const { gaz, merged } of mergedPerSource.value) {
    const result = resolvePlace(q, merged);
    if (result || testScope.value === 'all') out.push({ gaz, result });
  }
  return out;
});

const testScopeOptions = computed(() => {
  const matched = results.value.filter(r => r.result).length;
  return [
    { value: 'matched', label: t('gazetteers.scope.matched'), count: matched },
    { value: 'all', label: t('gazetteers.scope.all'), count: mergedPerSource.value.length },
  ];
});

function setTestScope(value: string) {
  testScope.value = value === 'all' ? 'all' : 'matched';
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

  // Load full Gazetteer objects for the test-resolution loop, which iterates
  // each source individually rather than the merged tree.
  const [bundled, imported] = await Promise.all([
    window.api.gazetteers.getBundled() as Promise<Gazetteer[]>,
    window.api.gazetteers.getImported() as Promise<Gazetteer[]>,
  ]);
  allBundled.value = bundled;
  allImported.value = imported;
}

async function saveConfig() {
  await window.api.db.setSetting('gazetteer_config', JSON.stringify(config.value));
  // Drop every cached resolution and reload the resolver against the new
  // enabled set. ensureLoaded() flips the shared `ready` ref false → true,
  // which is what every consumer's `computed` watches to know it should
  // re-run against the new tree (PlacePanel resolved-via line, MapView
  // popups, the tree picker's gazetteer suggestions, …).
  invalidatePlaceResolver();
  await ensurePlaceResolverLoaded();
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
    await ensurePlaceResolverLoaded();
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
  await ensurePlaceResolverLoaded();
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
  color: var(--text-secondary);
  margin-bottom: 16px;
  max-width: 640px;
  line-height: 1.5;
}

.filter-bars {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.gazetteer-cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.gazetteer-card {
  padding: 12px;
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  background: var(--surface);
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

.kind-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: var(--font-xs);
  font-weight: 500;
}

.kind-point {
  background: var(--info-bg);
  color: var(--info-text);
}

.kind-boundary {
  background: var(--sex-f-bg);
  color: var(--sex-f-text);
}

.kind-language {
  background: var(--sex-u-bg);
  color: var(--sex-u-text);
}

.type-bundled {
  background: var(--sex-m-bg);
  color: var(--sex-m-text);
}

.type-imported {
  background: var(--success-bg);
  color: var(--success-text);
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
  color: var(--text-secondary);
  margin-top: 4px;
  margin-left: 24px;
  line-height: 1.4;
}

.gazetteer-card-source {
  font-size: var(--font-xs);
  color: var(--text-muted);
  margin-top: 6px;
  margin-left: 24px;
}

.gazetteer-card-source a {
  color: var(--color-link);
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
  color: var(--text-muted);
}

.source-kg-link {
  margin-left: 8px;
}

.test-input-wrap {
  padding: 0 0 var(--space-sm);
}
/* Mirror the canonical .list-filter-input style used across list views and
 * the place tree picker, so the test input matches everywhere we ask the
 * user to type a search query. Style lives here scoped because the same
 * class is replicated in SourcesView, PlacesView, PersonsListTab, etc. —
 * extracting to shared.css is a separate consistency pass. */
.list-filter-input {
  width: 100%;
  padding: 6px 10px;
  font-size: var(--font-sm);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-md);
  outline: none;
  background: var(--surface);
  color: var(--text-primary);
  font-family: inherit;
  box-sizing: border-box;
}
.list-filter-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent);
}
.test-scope-filter {
  margin: 0 0 var(--space-sm);
}
.test-result.no-match {
  opacity: 0.65;
}
.quality-badge.quality-none {
  background: var(--surface-hover);
  color: var(--text-muted);
}

.test-results {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}

.test-result {
  padding: 10px;
  background: var(--surface-bg);
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
  color: var(--text-muted);
}

.quality-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: var(--font-xs);
  font-weight: 600;
}

.quality-exact {
  background: var(--success-bg);
  color: var(--success-text);
}

.quality-partial {
  background: var(--warning-bg);
  color: var(--warning-text);
}

.quality-ambiguous {
  background: var(--error-bg);
  color: var(--error-text);
}

.result-path {
  font-weight: 500;
}

.result-details {
  display: flex;
  gap: 16px;
  font-size: var(--font-xs);
  color: var(--text-secondary);
}

.result-unmatched {
  color: var(--warning-text);
}

.result-coords {
  font-family: monospace;
}
</style>
