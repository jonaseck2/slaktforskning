<template>
  <Teleport :to="teleportTarget || 'body'" :disabled="!teleportTarget">
  <BaseSubPanel
    entity-type="place"
    :title="$t('places.tree.title')"
    :mode="teleportTarget ? 'subpanel' : 'standalone'"
    :save-label="$t('common.ok')"
    @save="onConfirm"
    @cancel="$emit('close')"
    @close="$emit('close')"
  >
    <div class="tree-picker">
      <div class="list-filter">
        <input
          ref="filterInputRef"
          v-model="searchQuery"
          type="text"
          class="list-filter-input"
          :placeholder="$t('places.tree.filterPlaceholder')"
          :aria-label="$t('places.tree.filterPlaceholder')"
        />
      </div>

      <div v-if="loading" class="state">{{ $t('places.tree.loading') }}</div>

      <!-- Search mode: flat results, server-paged via usePagedList -->
      <template v-else-if="searchActive">
        <div v-if="searchPaged.length === 0 && gazetteerHits.length === 0 && !searchLoading" class="state">{{ $t('places.tree.noResults') }}</div>
        <div v-else class="tree-scroll" ref="searchScrollRef">
          <ul role="listbox" class="search-results" :aria-label="$t('places.tree.title')">
            <li
              v-for="place in searchPaged"
              :key="place.id"
              role="option"
              :aria-selected="selectedKey === ('db:' + place.id)"
              class="result-row"
              :class="{ selected: selectedKey === ('db:' + place.id) }"
              v-narrate="place.name + (place.parent_name ? ', ' + place.parent_name : '')"
              @click="onSelectFlat(place)"
            >
              <div class="result-main">
                <span class="result-name">{{ place.name }}</span>
                <span v-if="place.place_type" class="result-type">{{ $te('placeTypes.' + place.place_type) ? $t('placeTypes.' + place.place_type) : place.place_type }}</span>
              </div>
              <div v-if="place.parent_name" class="result-subtitle">{{ place.parent_name }}</div>
            </li>
            <li
              v-for="hit in gazetteerHits"
              :key="hit.key"
              role="option"
              :aria-selected="selectedKey === hit.key"
              class="result-row"
              :class="{ selected: selectedKey === hit.key }"
              v-narrate="hit.name + (hit.pathNames.length > 1 ? ', ' + hit.pathNames.slice(0, -1).join(', ') : '')"
              @click="onSelectGaz(hit)"
            >
              <div class="result-main">
                <span class="result-name">{{ hit.name }}</span>
                <span v-if="hit.type" class="result-type">{{ $te('placeTypes.' + hit.type) ? $t('placeTypes.' + hit.type) : hit.type }}</span>
                <span class="gaz-badge">{{ $t('places.tree.fromGazetteerBadge') }}</span>
              </div>
              <div v-if="hit.pathNames.length > 1" class="result-subtitle">
                {{ hit.pathNames.slice(0, -1).join(' › ') }}
              </div>
            </li>
          </ul>
          <div ref="sentinel" class="scroll-sentinel"></div>
        </div>
        <p v-if="searchTotal > 0 || gazetteerHits.length > 0" class="count-label tree-count">
          {{ $t('places.showingOf', { shown: searchPaged.length + gazetteerHits.length, total: searchTotal + gazetteerHits.length }) }}
        </p>
      </template>

      <!-- Browse mode: hierarchical tree with lazy expand + Add child -->
      <template v-else>
        <div v-if="roots.length === 0" class="state">{{ $t('places.tree.empty') }}</div>
        <ul v-else role="tree" class="tree-root tree-scroll" :aria-label="$t('places.tree.title')">
          <PlaceTreeNode
            v-for="root in roots"
            :key="root.key"
            :node="root"
            :level="1"
            :selected-key="selectedKey"
            @select="onSelectNode"
            @toggle="onToggle"
            @add-child="onAddChild"
          />
        </ul>
      </template>
    </div>
  </BaseSubPanel>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch, inject } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseSubPanel from './BaseSubPanel.vue';
import PlaceTreeNode from '../PlaceTreeNode.vue';
import { usePlaceTree, type PlaceTreeNode as TreeNode } from '../../composables/usePlaceTree';
import { usePlaceResolver } from '../../composables/usePlaceResolver';
import { usePagedList } from '../../composables/usePagedList';
import { useToast } from '../../composables/useToast';

interface PlaceRow { id: string; name: string; place_type: string | null; postal_code: string | null; city: string | null; parent_name?: string | null; }
interface GazetteerHit {
  key: string;
  name: string;
  type: string | null;
  /** Full path from gazetteer root down to and including the matched node. */
  pathNames: string[];
  gazId: string;
}
interface GazNodeLike {
  name: string;
  type?: string | null;
  aliases?: string[];
  children?: GazNodeLike[];
}
interface GazLike {
  id: string;
  kind?: string;
  root: GazNodeLike;
}

const props = defineProps<{
  initialPlaceId: string | null;
  initialQuery: string;
}>();
const emit = defineEmits<{
  select: [place: PlaceRow];
  close: [];
}>();

const { t } = useI18n();
const toast = useToast();

// When opened from inside a parent BaseSubPanel (e.g. PlacePicker inside an
// EventModal field), teleport this picker into the parent's panel-wrap so it
// renders as a side-attached sibling instead of stacking an overlay on top.
// When opened from a non-modal context (PlacePanel, MediaPanel, etc.) the
// inject returns null and we keep the standalone overlay behaviour.
const subpanelTargetId = inject<string | null>('subpanelTeleportTarget', null);
const teleportTarget = computed(() => (subpanelTargetId ? '#' + subpanelTargetId : null));
const filterInputRef = ref<HTMLInputElement | null>(null);
const sentinel = ref<HTMLElement | null>(null);
const searchScrollRef = ref<HTMLElement | null>(null);
const loading = ref(true);
const selectedKey = ref<string | null>(null);
// Selection is staged here when the user clicks a row. Committed only when
// the OK button (BaseSubPanel's @save) fires. Cancel/close discards.
const stagedPlace = ref<PlaceRow | null>(null);

const { ready: gazetteerReady, ensureLoaded: ensureGazetteersLoaded, getGazetteers } = usePlaceResolver();
// Destructure so reactive properties auto-unwrap in the template.
const tree = usePlaceTree({ getGazetteers });
const { roots, loadRoots, findPathTo } = tree;

// Server-paged search backing the filter mode. Mirrors PlacesView's pattern:
// places.listPage(limit, offset, sortBy, sortDir, query) returns {items,total}
// already filtered server-side; usePagedList handles debounced query, sentinel
// observation, and stale-response guarding.
type PlaceSortBy = 'name';
const {
  items: searchPaged,
  total: searchTotal,
  loading: searchLoading,
  searchQuery,
  attachSentinel,
} = usePagedList<PlaceRow, PlaceSortBy>({
  defaultSortBy: 'name',
  fetchPage: async (limit, offset, sortBy, sortDir, query) => {
    // Below threshold: empty result, skip the IPC entirely. The template
    // shows tree-mode in that case, so this never renders.
    if (query.trim().length < 1) return { items: [], total: 0 };
    const result = await window.api.places.listPage(limit, offset, sortBy, sortDir, query) as { items: PlaceRow[]; total: number };
    return result;
  },
});

// Any non-empty query switches the modal into search mode — the search runs
// server-side via places.listPage and is paged with a sentinel, so it covers
// every row in the DB (not just the loaded tree roots).
const searchActive = computed(() => searchQuery.value.trim().length >= 1);

// Lower-case + accent-strip; mirrors the SQL `normalized_name` column so DB
// substring matches and gazetteer substring matches use the same form.
function normalizeQuery(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

const GAZ_HIT_LIMIT = 50;

// Walk every loaded gazetteer's tree and collect nodes whose normalized name
// (or any alias) contains the query. Capped at GAZ_HIT_LIMIT to keep the
// list manageable on broad inputs ("a", "san"). Skips `language` gazetteers
// — those carry no path of interest for the picker.
function searchGazetteersSubstring(query: string, gazetteers: GazLike[], limit = GAZ_HIT_LIMIT): GazetteerHit[] {
  const q = normalizeQuery(query);
  if (!q) return [];
  const hits: GazetteerHit[] = [];
  const seen = new Set<string>();
  for (const gaz of gazetteers) {
    if (gaz.kind === 'language') continue;
    const walk = (node: GazNodeLike, ancestorNames: string[]): boolean => {
      const path = [...ancestorNames, node.name];
      let matched = normalizeQuery(node.name).includes(q);
      if (!matched && node.aliases) {
        for (const a of node.aliases) {
          if (normalizeQuery(a).includes(q)) { matched = true; break; }
        }
      }
      if (matched) {
        const key = 'gaz:' + gaz.id + ':' + path.map(s => s.toLowerCase()).join('>');
        if (!seen.has(key)) {
          seen.add(key);
          hits.push({ key, name: node.name, type: node.type ?? null, pathNames: path, gazId: gaz.id });
        }
      }
      if (hits.length >= limit) return true;
      if (node.children) {
        for (const c of node.children) {
          if (walk(c, path)) return true;
        }
      }
      return false;
    };
    // Walk every root the gazetteer exposes (root + allRoots — the merged
    // tree's sibling super-roots like World + World (Historical)).
    const allRoots = (gaz as GazLike & { allRoots?: GazNodeLike[] }).allRoots;
    const roots = (allRoots && allRoots.length > 0) ? allRoots : (gaz.root ? [gaz.root] : []);
    let exhausted = false;
    for (const r of roots) {
      if (walk(r, [])) { exhausted = true; break; }
    }
    if (exhausted) break;
  }
  return hits;
}

// Gazetteer hits for the current query, dedup'd against the currently-loaded
// DB rows by (name, parent name). DB rows are authoritative — once a place
// exists in the database, prefer the DB row so selection doesn't try to
// re-create it via findOrCreateWithChain.
const gazetteerHits = computed<GazetteerHit[]>(() => {
  if (!searchActive.value) return [];
  if (!gazetteerReady.value) return [];
  const gazetteers = getGazetteers() as unknown as GazLike[];
  if (gazetteers.length === 0) return [];
  const all = searchGazetteersSubstring(searchQuery.value, gazetteers);
  const dbKeys = new Set<string>();
  for (const row of searchPaged.value) {
    dbKeys.add(normalizeQuery(row.name) + '|' + normalizeQuery(row.parent_name ?? ''));
  }
  return all.filter(h => {
    const parentName = h.pathNames.length >= 2 ? h.pathNames[h.pathNames.length - 2] : '';
    return !dbKeys.has(normalizeQuery(h.name) + '|' + normalizeQuery(parentName));
  });
});

// Re-attach the sentinel each time the search-mode list mounts (the v-if
// destroys the scroll container when switching back to browse mode).
watch(sentinel, (el) => attachSentinel(el, searchScrollRef.value));

async function onToggle(node: TreeNode) {
  if (node.expanded) tree.collapseNode(node);
  else if (node.hasChildren) await tree.expandNode(node);
}

async function onSelectNode(node: TreeNode) {
  // Stage the click. Resolve the underlying Place row eagerly (cheap for
  // existing DB nodes; gazetteer-only nodes still need findOrCreateWithChain
  // before we have a valid id), but defer the emit until OK is pressed.
  selectedKey.value = node.key;
  try {
    if (node.dbId) {
      const place = (await window.api.places.get(node.dbId)) as PlaceRow | null;
      if (place) stagedPlace.value = place;
      return;
    }
    if (node.gazPath) {
      const ancestors = node.gazPath.slice(0, -1).map(n => ({ name: n }));
      const place = (await window.api.places.findOrCreateWithChain(node.name, ancestors)) as PlaceRow;
      node.dbId = place.id;
      stagedPlace.value = place;
      return;
    }
    stagedPlace.value = null;
  } catch (err) {
    console.error('[PlaceTreePickerModal] select failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}

function onSelectFlat(place: PlaceRow) {
  selectedKey.value = 'db:' + place.id;
  stagedPlace.value = place;
}

async function onSelectGaz(hit: GazetteerHit) {
  // Materialise the gazetteer chain on click — same path the tree-mode
  // gazetteer-only nodes use. The picker stays open; OK commits the staged
  // place. Cancel/× closes without committing, but the chain creation is
  // already persisted (consistent with existing tree-mode behaviour).
  selectedKey.value = hit.key;
  try {
    const ancestors = hit.pathNames.slice(0, -1).map(n => ({ name: n }));
    const place = (await window.api.places.findOrCreateWithChain(hit.name, ancestors)) as PlaceRow;
    stagedPlace.value = place;
  } catch (err) {
    console.error('[PlaceTreePickerModal] gazetteer-hit select failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}

async function onAddChild(payload: { parent: TreeNode; name: string }) {
  // Inline-create + stage. The user typed a name and clicked Save in the
  // inline form, so we materialise immediately, but the modal stays open and
  // the new place becomes the staged selection — they still need to click OK
  // (or correct their pick) to commit.
  try {
    const created = await tree.createChild(payload.parent, payload.name);
    const place = (await window.api.places.get(created.id)) as PlaceRow;
    if (place) {
      stagedPlace.value = place;
      selectedKey.value = 'db:' + place.id;
    }
  } catch (err) {
    console.error('[PlaceTreePickerModal] add-child failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}

function onConfirm() {
  // Pressing OK without a selection is a no-op; the picker keeps the modal
  // open so the user can pick. Cancel/× is the way to close without a
  // selection.
  if (stagedPlace.value) emit('select', stagedPlace.value);
}

onMounted(async () => {
  // Wrap the bootstrap so a thrown rejection (e.g. a stale preload bundle
  // missing places:listChildren) can't leave the modal stuck on "Loading…".
  try {
    if (!gazetteerReady.value) await ensureGazetteersLoaded();
    await loadRoots();
    if (props.initialPlaceId) {
      const path = await findPathTo(props.initialPlaceId);
      if (path.length > 0) {
        selectedKey.value = path[path.length - 1].key;
      }
    } else if (props.initialQuery && props.initialQuery.trim().length >= 1) {
      // Seed the filter — usePagedList's internal debounce will fire the
      // first fetch automatically, no manual applyFilter call needed.
      searchQuery.value = props.initialQuery;
    }
  } catch (err) {
    console.error('[PlaceTreePickerModal] init failed:', err);
    toast.error(t('errors.loadFailed'));
  } finally {
    loading.value = false;
  }
  await nextTick();
  filterInputRef.value?.focus();
});
</script>

<style scoped>
/* BaseSubPanel's `.ep-body` is `flex: 1; overflow-y: auto`. We want the
   filter input pinned at the top and the count-label at the bottom while
   only the middle (tree / search results) scrolls — so kill the body-level
   scroll and let `.tree-scroll` own the single scroll axis. */
:deep(.ep-body) {
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
/* The default `.entity-panel` sizes itself to `min-content`, which collapses
   when our content is `flex: 1; min-height: 0`. Force a real height so the
   inner `.tree-scroll` actually has space to scroll within. */
:deep(.entity-panel) {
  height: clamp(420px, 70vh, 800px);
}
.tree-picker {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-width: 480px;
  flex: 1;
  min-height: 0;
  padding: var(--space-md);
}
/* Mirror the canonical .list-filter / .list-filter-input wrapper used across
   PersonsListTab, SourcesView, PlacesView, MediaView. The wrapper provides
   bottom padding (var(--space-sm)) so the filter doesn't crowd the list. */
.list-filter {
  flex-shrink: 0;
  padding: 0 0 var(--space-sm);
}
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
}
.list-filter-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent);
}
.state {
  padding: 24px;
  text-align: center;
  color: var(--text-muted);
  font-size: var(--font-base);
}
.tree-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.tree-root {
  list-style: none;
  margin: 0;
}
.search-results {
  list-style: none;
  padding: 0;
  margin: 0;
}
.result-row {
  display: flex;
  flex-direction: column;
  padding: 6px 8px;
  cursor: pointer;
  border-radius: var(--radius-sm);
}
.result-row:hover { background: var(--surface-hover); }
.result-row.selected { background: var(--accent); color: var(--accent-text); }
.result-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-sm);
}
.result-name { flex: 1 1 auto; }
.result-type {
  font-size: var(--font-xs);
  color: var(--text-muted);
}
.gaz-badge {
  font-size: var(--font-xs);
  color: var(--success-text);
  background: var(--success-bg);
  padding: 1px 5px;
  border-radius: 3px;
}
.result-row.selected .gaz-badge {
  color: var(--accent-text);
  background: color-mix(in srgb, var(--accent-text) 18%, transparent);
}
.result-subtitle {
  font-size: var(--font-xs);
  color: var(--text-muted);
  margin-top: 2px;
}
.tree-count {
  flex-shrink: 0;
  margin: var(--space-sm) 0 0;
}
</style>
