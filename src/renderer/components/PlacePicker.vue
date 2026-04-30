<template>
  <div class="place-picker">
    <input
      ref="inputRef"
      type="text"
      v-model="query"
      :placeholder="placeholder || $t('places.searchPlaceholder')"
      role="combobox"
      :aria-expanded="showDropdown && (results.length > 0 || query.length > 1)"
      aria-autocomplete="list"
      :aria-controls="pickerId + '-listbox'"
      :aria-activedescendant="highlightIndex >= 0 ? pickerId + '-option-' + highlightIndex : undefined"
      @input="onInput"
      @focus="showDropdown = true"
      @blur="onBlur"
      @keydown="onKeydown"
      autocomplete="off"
    />
    <Teleport to="body">
    <ul
      v-if="showDropdown && (results.length > 0 || gazetteerResults.length > 0 || query.length > 1)"
      :id="pickerId + '-listbox'"
      role="listbox"
      class="dropdown"
      :style="dropdownStyle"
    >
      <li
        v-for="(place, idx) in results"
        :key="place.id"
        :id="pickerId + '-option-' + idx"
        role="option"
        :aria-selected="idx === highlightIndex"
        class="dropdown-item"
        :class="{ highlighted: idx === highlightIndex }"
        v-narrate="place.name"
        @mousedown.prevent.stop="select(place)"
        @click.stop
      >
        <div class="place-main">
          <span class="place-name">{{ place.name }}</span>
          <span v-if="place.place_type" class="place-type">{{ $te('placeTypes.' + place.place_type) ? $t('placeTypes.' + place.place_type) : place.place_type }}</span>
        </div>
        <div v-if="place.parent_name || place.postal_code || place.city" class="place-subtitle">{{ place.parent_name || [place.postal_code, place.city].filter(Boolean).join(' ') }}</div>
      </li>
      <li
        v-for="(gaz, gIdx) in gazetteerResults"
        :key="'gaz-' + gIdx"
        :id="pickerId + '-option-' + (results.length + gIdx)"
        role="option"
        :aria-selected="(results.length + gIdx) === highlightIndex"
        class="dropdown-item gazetteer-item"
        :class="{ highlighted: (results.length + gIdx) === highlightIndex }"
        v-narrate="gaz.name"
        @mousedown.prevent.stop="selectGazetteer(gaz)"
        @click.stop
      >
        <div class="place-main">
          <span class="place-name">{{ gaz.name }}</span>
          <span class="place-type">{{ gaz.pathNodes[gaz.pathNodes.length - 1]?.type }}</span>
          <span class="gazetteer-badge">{{ gaz.gazetteer }}</span>
        </div>
        <div class="place-subtitle">{{ gaz.parentChain || gaz.matchedPath.join(' › ') }}</div>
      </li>
      <li
        v-if="showCreateNew"
        :id="pickerId + '-option-' + (results.length + gazetteerResults.length)"
        role="option"
        :aria-selected="(results.length + gazetteerResults.length) === highlightIndex"
        class="dropdown-item create-new"
        :class="{ highlighted: (results.length + gazetteerResults.length) === highlightIndex }"
        @mousedown.prevent.stop="createNew"
        @click.stop
      >
        {{ $t('places.createNew', { name: query }) }}
      </li>
    </ul>
    </Teleport>
    <div v-if="showDropdown && (results.length > 0 || gazetteerResults.length > 0)" class="sr-only" aria-live="polite">
      {{ $t('a11y.searchResults', { count: results.length + gazetteerResults.length }, results.length + gazetteerResults.length) }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, inject, onMounted, onBeforeUnmount, nextTick, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { usePlaceResolver } from '../composables/usePlaceResolver';
import { searchGazetteer, resolveHierarchical, tokenizePlaceString } from '../../api/place-gazetteers/resolver';

const pickerId = 'place-picker-' + Math.random().toString(36).slice(2, 8);

interface PlaceRow { id: string; name: string; place_type: string | null; postal_code: string | null; city: string | null; parent_name?: string | null; }
interface GazetteerPathNode { name: string; type: string; lat: number; lon: number; }
interface GazetteerSuggestion {
  name: string;
  lat: number;
  lon: number;
  matchedPath: string[];
  pathNodes: GazetteerPathNode[];
  gazetteer: string;
  /** Pretty-printed parent chain for the dropdown subtitle (e.g. "Mosås › Örebro län") */
  parentChain?: string;
  /** When this suggestion comes from the hierarchical resolver, the leaf
   * tokens that were unmatched (typically the user's farm/locality name).
   * Selecting this row will create a new Place named `unmatchedLeftTokens.join(', ')`
   * with `parent_place_id` chained from the matched path. */
  unmatchedLeftTokens?: string[];
}

const props = defineProps<{
  modelValue: string | null;
  placeholder?: string;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: string | null];
  'select': [place: PlaceRow];
}>();

const { t } = useI18n();
const screenReader = inject('screenReader', null) as any;
const { ready: gazetteerReady, ensureLoaded: ensureGazetteersLoaded, getGazetteers } = usePlaceResolver();
const query = ref('');
const results = ref<PlaceRow[]>([]);
const gazetteerResults = ref<GazetteerSuggestion[]>([]);
const showDropdown = ref(false);
const highlightIndex = ref(-1);
const inputRef = ref<HTMLInputElement | null>(null);
const dropdownStyle = ref<Record<string, string>>({});
let debounceTimer: ReturnType<typeof setTimeout>;

function updateDropdownPosition() {
  const el = inputRef.value;
  if (!el) return;
  const r = el.getBoundingClientRect();
  dropdownStyle.value = {
    position: 'fixed',
    top: `${r.bottom + 2}px`,
    left: `${r.left}px`,
    width: `${r.width}px`,
  };
}
function onScroll() { if (showDropdown.value) updateDropdownPosition(); }
onMounted(() => {
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onScroll);
});
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll, true);
  window.removeEventListener('resize', onScroll);
});
watch(showDropdown, (o) => { if (o) nextTick(updateDropdownPosition); });

// Reset highlight when results change; also reposition the teleported dropdown.
watch(results, () => {
  highlightIndex.value = -1;
  if (showDropdown.value) nextTick(updateDropdownPosition);
});
watch(gazetteerResults, () => {
  if (showDropdown.value) nextTick(updateDropdownPosition);
});

// Track the path string we set after a successful select. When the user
// edits the input so it no longer matches this path, we clear modelValue
// so the parent doesn't keep a stale place_id and showCreateNew is no
// longer suppressed (BENGT #34 followup — typing a new query after picking
// must be a clean search).
const lastResolvedPath = ref<string>('');

watch(() => props.modelValue, async (id) => {
  if (!id) {
    query.value = '';
    lastResolvedPath.value = '';
    return;
  }
  const path = await window.api.places.getPath(id);
  if (path) {
    query.value = path;
    lastResolvedPath.value = path;
  }
}, { immediate: true });

async function runSearch() {
  if (query.value.length < 1) { results.value = []; gazetteerResults.value = []; return; }
  const dbResults = (await window.api.places.search(query.value)) as PlaceRow[];
  results.value = dbResults.slice(0, 5);

  // Search all enabled gazetteers for matching nodes at every level
  if (!gazetteerReady.value) await ensureGazetteersLoaded();

  const gazSuggestions: GazetteerSuggestion[] = [];

  // Tier 1 — hierarchical, parent-aware match (BENGT #27).
  // Only run when the input has at least two tokens (commas or parens),
  // because for single-word input the flat searchGazetteer is more useful.
  const tokens = tokenizePlaceString(query.value);
  if (tokens.length > 1) {
    const hier = resolveHierarchical(query.value, getGazetteers());
    if (hier.best && hier.candidates.length > 0) {
      const seen = new Set<string>();
      for (const cand of hier.candidates.slice(0, 5)) {
        const node = cand.node;
        // Build the leaf name: matched node OR the unmatched left tokens
        // joined ("Hörningsholm" / "Mosås"). The actual create-flow uses
        // `unmatchedLeftTokens` for the leaf name.
        const leafName = cand.unmatchedLeftTokens.length > 0
          ? cand.unmatchedLeftTokens.join(', ')
          : node.name;
        const key = `${leafName.toLowerCase()}|${cand.gazetteer}|${cand.path.map(n => n.name).join('>')}`;
        if (seen.has(key)) continue;
        seen.add(key);
        // Parent chain string: matched path bottom-to-top, leaf-first
        const reversed = [...cand.path].reverse();
        const parentChain = reversed.map(n => n.name).join(' › ');
        gazSuggestions.push({
          name: leafName,
          lat: node.lat,
          lon: node.lon,
          matchedPath: cand.path.map(n => n.name),
          pathNodes: cand.path.map(n => ({ name: n.name, type: n.type, lat: n.lat, lon: n.lon })),
          gazetteer: cand.gazetteer,
          parentChain,
          unmatchedLeftTokens: cand.unmatchedLeftTokens,
        });
      }
    }
  }

  // Tier 0 fallback — flat full-tree search by node name. Useful for
  // single-token input ("Solna", "Matteus") where the user hasn't yet
  // typed any geographic context.
  if (gazSuggestions.length === 0) {
    const hits = searchGazetteer(query.value, getGazetteers(), 5);
    const seen = new Set<string>();
    for (const hit of hits) {
      const key = `${hit.node.name.toLowerCase()}|${hit.node.type}|${hit.gazetteer}`;
      if (seen.has(key)) continue;
      seen.add(key);
      gazSuggestions.push({
        name: hit.node.name,
        lat: hit.node.lat,
        lon: hit.node.lon,
        matchedPath: hit.path.map(n => n.name),
        pathNodes: hit.path.map(n => ({ name: n.name, type: n.type, lat: n.lat, lon: n.lon })),
        gazetteer: hit.gazetteer,
        parentChain: hit.path.map(n => n.name).join(' › '),
      });
    }
    gazSuggestions.sort((a, b) => b.pathNodes.length - a.pathNodes.length);
  }

  gazetteerResults.value = gazSuggestions;
}

function onInput() {
  clearTimeout(debounceTimer);
  // If the user edits away from the previously resolved path, drop the
  // stored modelValue so showCreateNew kicks back in for the new query.
  if (props.modelValue && query.value !== lastResolvedPath.value) {
    emit('update:modelValue', null);
    lastResolvedPath.value = '';
  }
  if (query.value.length < 1) { results.value = []; gazetteerResults.value = []; return; }
  debounceTimer = setTimeout(runSearch, 150);
}

// Whether the "create new" option is currently shown.
// Hidden when (a) the query exactly matches an existing DB place, OR
// (b) the user just selected a place via this picker (modelValue is set
// and matches the rendered query — BENGT #34: don't keep prompting to
// create a place that already exists).
const showCreateNew = computed(() => {
  if (query.value.length <= 1) return false;
  // Suppress while modelValue is set (means picker has already resolved a
  // place for this query string).
  if (props.modelValue) return false;
  const q = query.value.toLowerCase();
  return results.value.every(r => r.name.toLowerCase() !== q);
});

function totalOptions(): number {
  return results.value.length + gazetteerResults.value.length + (showCreateNew.value ? 1 : 0);
}

function onKeydown(e: KeyboardEvent) {
  if (!showDropdown.value) return;
  const total = totalOptions();
  if (total === 0) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    highlightIndex.value = Math.min(highlightIndex.value + 1, total - 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    highlightIndex.value = Math.max(highlightIndex.value - 1, 0);
  } else if (e.key === 'Enter' && highlightIndex.value >= 0) {
    e.preventDefault();
    const dbCount = results.value.length;
    const gazCount = gazetteerResults.value.length;
    if (highlightIndex.value < dbCount) {
      select(results.value[highlightIndex.value]);
    } else if (highlightIndex.value < dbCount + gazCount) {
      selectGazetteer(gazetteerResults.value[highlightIndex.value - dbCount]);
    } else {
      createNew();
    }
  } else if (e.key === 'Escape') {
    showDropdown.value = false;
  }
}

async function select(place: PlaceRow) {
  const path = await window.api.places.getPath(place.id);
  query.value = path || place.name;
  lastResolvedPath.value = query.value;
  showDropdown.value = false;
  emit('update:modelValue', place.id);
  emit('select', place);
  if (screenReader?.isScreenReader?.value) {
    screenReader.speak(t('screenReader.selected', { name: place.name }));
  }
}

async function selectGazetteer(gaz: GazetteerSuggestion) {
  // Build only the *structural* parent chain (names + parent links). Per the
  // data-fidelity prime directive in CLAUDE.md, gazetteer-derived values
  // (coordinates, place_type, etc.) are NEVER persisted — they are computed
  // on render by the resolver. The parent chain is structure, not inference:
  // the user accepted this gazetteer suggestion by clicking it, so the names
  // and the hierarchy are authored. Coordinates and node types remain on the
  // gazetteer side and are looked up at render time.
  const hasUnmatchedLeaf = gaz.unmatchedLeftTokens && gaz.unmatchedLeftTokens.length > 0;

  if (hasUnmatchedLeaf) {
    const leafName = gaz.name;
    const chain = gaz.pathNodes.map(n => ({ name: n.name }));
    const place = (await window.api.places.findOrCreateWithChain(leafName, chain)) as PlaceRow;
    select(place);
    return;
  }

  // Exact match — only the leaf node is created. Coordinates and place_type
  // are NOT persisted; the resolver computes them from the gazetteer at
  // render time so they stay current as gazetteer data evolves.
  const leafNode = gaz.pathNodes[gaz.pathNodes.length - 1];
  if (!leafNode) return;
  const place = (await window.api.places.findOrCreate(leafNode.name)) as PlaceRow;
  select(place);
}

async function createNew() {
  const place = (await window.api.places.findOrCreate(query.value)) as PlaceRow;
  // BENGT #34: clear any cached suggestion so the next focus/search shows
  // the newly created place as an existing match rather than offering to
  // create it again.
  results.value = [];
  gazetteerResults.value = [];
  select(place);
  // Re-run the search after a tick so that if the user re-focuses the
  // dropdown the new place is visible. This also flushes any stale
  // "Skapa ny plats" item from showCreateNew (which is now suppressed
  // because modelValue is set).
  await nextTick();
  await runSearch();
}

function onBlur() {
  setTimeout(() => { showDropdown.value = false; }, 150);
}
</script>

<style scoped>
.place-picker { position: relative; width: 100%; box-sizing: border-box; }
.place-picker input { font-size: var(--font-base); width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid var(--surface-border); border-radius: 4px; font-family: inherit; background: var(--surface-bg); color: var(--text-primary); }
.place-picker input:focus { outline: 2px solid var(--accent); outline-offset: 1px; border-color: var(--accent); background: var(--surface); }
/* Teleported to <body>; position is set inline from inputRef's bounding rect.
   Scoped styles still apply because Vue keeps the data-v-* attribute. */
.dropdown {
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-radius: 4px;
  box-shadow: var(--shadow-md);
  z-index: 1000;
  max-height: 240px;
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: 0;
}
.dropdown-item {
  padding: 8px 12px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  font-size: var(--font-base);
}
.place-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.place-subtitle {
  font-size: var(--font-xs);
  color: var(--text-muted);
  margin-top: 2px;
}
.dropdown-item:hover { background: var(--color-row-hover); }
.dropdown-item.highlighted { background: var(--color-row-hover); }
.place-type {
  font-size: var(--font-xs);
  color: var(--text-muted);
}
.gazetteer-badge {
  font-size: var(--font-xs);
  color: var(--success-text);
  background: var(--success-bg);
  padding: 1px 5px;
  border-radius: 3px;
  font-weight: 500;
}
.create-new { color: var(--accent); font-style: italic; }
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
