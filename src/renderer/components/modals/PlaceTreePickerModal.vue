<template>
  <BaseSubPanel
    entity-type="place"
    :title="$t('places.tree.title')"
    mode="standalone"
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
        <div v-if="searchPaged.length === 0 && !searchLoading" class="state">{{ $t('places.tree.noResults') }}</div>
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
          </ul>
          <div ref="sentinel" class="scroll-sentinel"></div>
        </div>
        <p v-if="searchTotal > 0" class="count-label tree-count">
          {{ $t('places.showingOf', { shown: searchPaged.length, total: searchTotal }) }}
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
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseSubPanel from './BaseSubPanel.vue';
import PlaceTreeNode from '../PlaceTreeNode.vue';
import { usePlaceTree, type PlaceTreeNode as TreeNode } from '../../composables/usePlaceTree';
import { usePlaceResolver } from '../../composables/usePlaceResolver';
import { usePagedList } from '../../composables/usePagedList';
import { useToast } from '../../composables/useToast';

interface PlaceRow { id: string; name: string; place_type: string | null; postal_code: string | null; city: string | null; parent_name?: string | null; }

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
    if (query.trim().length < 2) return { items: [], total: 0 };
    const result = await window.api.places.listPage(limit, offset, sortBy, sortDir, query) as { items: PlaceRow[]; total: number };
    return result;
  },
});

const searchActive = computed(() => searchQuery.value.trim().length >= 2);

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
    } else if (props.initialQuery && props.initialQuery.trim().length >= 2) {
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
.tree-picker {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-width: 480px;
  flex: 1;
  min-height: 0;
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
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-md);
  padding: 4px;
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
