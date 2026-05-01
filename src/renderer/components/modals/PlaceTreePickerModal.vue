<template>
  <BaseSubPanel
    entity-type="place"
    :title="$t('places.tree.title')"
    mode="standalone"
    hide-save
    @cancel="$emit('close')"
    @close="$emit('close')"
  >
    <div class="tree-picker">
      <input
        ref="filterInputRef"
        type="text"
        class="filter-input"
        v-model="filterText"
        :placeholder="$t('places.tree.filterPlaceholder')"
        :aria-label="$t('places.tree.filterPlaceholder')"
        @input="onFilterInput"
      />
      <div v-if="loading" class="state">{{ $t('places.tree.loading') }}</div>
      <div v-else-if="roots.length === 0" class="state">{{ $t('places.tree.empty') }}</div>
      <div v-else-if="filterActive && visibleNodes.length === 0" class="state">
        {{ $t('places.tree.noResults') }}
      </div>
      <ul v-else role="tree" class="tree-root" :aria-label="$t('places.tree.title')">
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
    </div>
  </BaseSubPanel>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseSubPanel from './BaseSubPanel.vue';
import PlaceTreeNode from '../PlaceTreeNode.vue';
import { usePlaceTree, type PlaceTreeNode as TreeNode } from '../../composables/usePlaceTree';
import { usePlaceResolver } from '../../composables/usePlaceResolver';
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
const filterText = ref('');
const loading = ref(true);
const selectedKey = ref<string | null>(null);

const { ready: gazetteerReady, ensureLoaded: ensureGazetteersLoaded, getGazetteers } = usePlaceResolver();
// Destructure so reactive properties auto-unwrap in the template.
const tree = usePlaceTree({ getGazetteers });
const { roots, visibleNodes, filterActive, loadRoots, expandNode, collapseNode, applyFilter, findPathTo, createChild } = tree;

let filterDebounce: ReturnType<typeof setTimeout> | null = null;
function onFilterInput() {
  if (filterDebounce) clearTimeout(filterDebounce);
  filterDebounce = setTimeout(() => { tree.applyFilter(filterText.value); }, 150);
}

async function onToggle(node: TreeNode) {
  if (node.expanded) tree.collapseNode(node);
  else if (node.hasChildren) await tree.expandNode(node);
}

async function onSelectNode(node: TreeNode) {
  selectedKey.value = node.key;
  try {
    if (node.dbId) {
      const place = (await window.api.places.get(node.dbId)) as PlaceRow | null;
      if (place) { emit('select', place); return; }
    }
    if (node.gazPath) {
      const ancestors = node.gazPath.slice(0, -1).map(n => ({ name: n }));
      const place = (await window.api.places.findOrCreateWithChain(node.name, ancestors)) as PlaceRow;
      node.dbId = place.id;
      emit('select', place);
      return;
    }
    toast.error(t('errors.saveFailed'));
  } catch (err) {
    console.error('[PlaceTreePickerModal] select failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}

async function onAddChild(payload: { parent: TreeNode; name: string }) {
  try {
    const created = await tree.createChild(payload.parent, payload.name);
    const place = (await window.api.places.get(created.id)) as PlaceRow;
    if (place) emit('select', place);
  } catch (err) {
    console.error('[PlaceTreePickerModal] add-child failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}

onMounted(async () => {
  // Wrap the whole bootstrap so a thrown rejection (e.g. an undefined IPC
  // channel after a stale preload bundle) can't leave the modal stuck on
  // "Loading…" forever. Any failure surfaces as a toast and the user can
  // still cancel.
  try {
    if (!gazetteerReady.value) await ensureGazetteersLoaded();
    await tree.loadRoots();
    if (props.initialPlaceId) {
      const path = await tree.findPathTo(props.initialPlaceId);
      if (path.length > 0) {
        selectedKey.value = path[path.length - 1].key;
      }
    } else if (props.initialQuery && props.initialQuery.trim().length >= 2) {
      filterText.value = props.initialQuery;
      await tree.applyFilter(props.initialQuery);
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
.tree-picker { display: flex; flex-direction: column; gap: 8px; min-width: 480px; }
/* Match the canonical .list-filter-input from PersonsListTab / SourcesView /
   PlacesView so this filter looks identical to every other entity-list filter. */
.filter-input {
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
.filter-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent);
}
.state {
  padding: 24px; text-align: center;
  color: var(--text-muted);
  font-size: var(--font-base);
}
.tree-root {
  list-style: none; padding: 0; margin: 0;
  max-height: 480px; overflow-y: auto;
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-md);
  padding: 4px;
}
</style>
