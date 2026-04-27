<template>
  <div class="relationships-view" ref="relsBodyRef">
    <div class="rels-list-sheet">
      <div class="header">
        <h2>{{ $t('relationships.title') }}</h2>
        <AppButton variant="soft" @click="showAddForm = true">+ {{ $t('relationships.addRelationship') }}</AppButton>
      </div>
      <p v-if="total > 0" class="count-label">
        {{ $t('relationships.showingOf', { shown: relationships.length, total }) }}
      </p>
      <FilterChips v-if="relationships.length > 0" :options="typeFilters" :model-value="activeTypeFilter" @update:model-value="activeTypeFilter = $event" />
      <AppEmptyState v-if="relationships.length === 0 && !loading" icon="🔗" :title="$t('empty.relationships')" :description="$t('empty.relationshipsDesc')" :action-label="$t('empty.addRelationship')" @action="showAddForm = true" />
      <AppEmptyState v-else-if="filteredRelationships.length === 0 && !loading" icon="🔗" :title="$t('empty.relationships') + ' ' + $t('empty.withFilter')" />
      <RelationshipsTable
        v-else
        :relationships="filteredRelationships"
        :selected-id="selectedRelationshipId"
        @delete="removeRelationship"
        @select="selectRelationship"
      />
      <div ref="sentinel" class="scroll-sentinel"></div>
      <button v-if="!panelOpen && selectedRelationshipId" class="panel-open-btn" @click="openPanel">◀</button>
    </div>

    <template v-if="panelOpen && selectedRelationshipId">
      <div class="panel-drag-handle" @mousedown="(e: MouseEvent) => startResize(e, relsBodyRef!)"></div>
      <div class="rels-panel" :style="{ width: panelWidth + 'px' }">
        <RelationshipPanel :relationship-id="selectedRelationshipId" @close="closePanel" />
      </div>
    </template>

    <!-- Add Relationship Modal -->
    <RelationshipModal
      v-if="showAddForm"
      mode="standalone"
      @cancel="showAddForm = false"
      @close="showAddForm = false"
      @saved="onSaved"
    />

    <ConfirmModal
      :visible="del.visible.value"
      :title="$t('relationships.removeConfirmTitle')"
      :message="$t('relationships.confirmDelete')"
      tone="danger"
      icon="⚠️"
      :confirm-label="$t('common.delete')"
      @cancel="del.cancel"
      @confirm="del.confirm"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onActivated, onUnmounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import RelationshipsTable from '../components/RelationshipsTable.vue';
import RelationshipModal from '../components/modals/RelationshipModal.vue';
import RelationshipPanel from '../components/RelationshipPanel.vue';
import ConfirmModal from '../components/ConfirmModal.vue';
import { useDeleteConfirm } from '../composables/useDeleteConfirm';
import AppButton from '../components/ui/AppButton.vue';
import AppEmptyState from '../components/ui/AppEmptyState.vue';
import FilterChips from '../components/ui/FilterChips.vue';
import type { RelRow } from '../components/RelationshipsTable.vue';
import { RELATIONSHIP_TYPE_VALUES } from '../constants/eventTypes';
import { useDataVersionStore } from '../stores/dataVersion';
import { useToast } from '../composables/useToast';
import { usePanelResize } from '../composables/usePanelResize';

defineOptions({ name: 'RelationshipsView' });
const dataVersionStore = useDataVersionStore();
let loadedVersion = -1;


const PAGE_SIZE = 100;

const { t } = useI18n();
const toast = useToast();
const route = useRoute();
const relationships = ref<RelRow[]>([]);
const total = ref(0);
const offset = ref(0);
const loading = ref(false);
const showAddForm = ref(false);
const sentinel = ref<HTMLElement | null>(null);

const activeTypeFilter = ref<string>('all');

// Panel state
const relsBodyRef = ref<HTMLElement | null>(null);
const selectedRelationshipId = ref<string | null>(localStorage.getItem('rels-selected-id'));
const panelOpen = ref(localStorage.getItem('rels-panel-open') !== 'false');
const { panelWidth, startResize } = usePanelResize({ storageKey: 'rels-panel-width', maxWidthRatio: 0.5 });

const typeCounts = computed(() => {
  const counts: Record<string, number> = {};
  for (const rel of relationships.value) {
    counts[rel.type] = (counts[rel.type] ?? 0) + 1;
  }
  return counts;
});

const typeFilters = computed(() => [
  { value: 'all', label: t('common.all'), count: relationships.value.length },
  ...RELATIONSHIP_TYPE_VALUES
    .filter(type => (typeCounts.value[type] ?? 0) > 0)
    .map(type => ({
      value: type,
      label: t('relTypes.' + type),
      count: typeCounts.value[type] ?? 0,
    })),
]);

const filteredRelationships = computed(() =>
  activeTypeFilter.value === 'all'
    ? relationships.value
    : relationships.value.filter(r => r.type === activeTypeFilter.value)
);

let observer: IntersectionObserver | null = null;

watch(sentinel, (el) => {
  if (observer) { observer.disconnect(); observer = null; }
  if (!el) return;
  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && relationships.value.length < total.value && !loading.value) {
        loadMore();
      }
    },
    { rootMargin: '2000px 0px' }
  );
  observer.observe(el);
});

onUnmounted(() => {
  if (observer) observer.disconnect();
});

async function load() {
  if (!window.api) return;
  loading.value = true;
  activeTypeFilter.value = 'all';
  try {
    const result = await window.api.relationships.listPage(PAGE_SIZE, 0) as { relationships: RelRow[]; total: number };
    relationships.value = result.relationships;
    total.value = result.total;
    offset.value = PAGE_SIZE;
  } catch (err) {
    console.error('[RelationshipsView] load failed:', err);
    toast.error(t('errors.loadFailed'));
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  if (!window.api || loading.value) return;
  loading.value = true;
  try {
    const result = await window.api.relationships.listPage(PAGE_SIZE, offset.value) as { relationships: RelRow[]; total: number };
    relationships.value = [...relationships.value, ...result.relationships];
    total.value = result.total;
    offset.value += PAGE_SIZE;
  } catch (err) {
    console.error('[RelationshipsView] loadMore failed:', err);
    toast.error(t('errors.loadFailed'));
  } finally {
    loading.value = false;
  }
}

async function onSaved() {
  showAddForm.value = false;
  await load();
}

const del = useDeleteConfirm<string>(async (id) => {
  if (!window.api) return;
  try {
    await window.api.relationships.delete(id);
    if (selectedRelationshipId.value === id) {
      selectedRelationshipId.value = null;
      localStorage.removeItem('rels-selected-id');
    }
    await load();
  } catch (err) {
    console.error('[RelationshipsView] removeRelationship failed:', err);
    toast.error(t('errors.deleteFailed'));
  }
});
function removeRelationship(id: string) { del.ask(id); }

function selectRelationship(id: string) {
  selectedRelationshipId.value = id;
  localStorage.setItem('rels-selected-id', id);
  if (!panelOpen.value) openPanel();
}
function openPanel() {
  panelOpen.value = true;
  localStorage.setItem('rels-panel-open', 'true');
}
function closePanel() {
  panelOpen.value = false;
  localStorage.setItem('rels-panel-open', 'false');
}

onMounted(async () => {
  await load();
  loadedVersion = dataVersionStore.version;
  const id = route.params.id as string | undefined;
  if (id) selectRelationship(id);
  else if (selectedRelationshipId.value) openPanel();
});

onActivated(async () => {
  if (dataVersionStore.version !== loadedVersion) {
    await load();
    loadedVersion = dataVersionStore.version;
  }
  const id = route.params.id as string | undefined;
  if (id) selectRelationship(id);
});
</script>

<style scoped>
.relationships-view {
  display: flex;
  flex-direction: row;
  height: 100%;
  gap: var(--space-xs);
}
.rels-list-sheet {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: var(--space-lg);
  position: relative;
  background: var(--surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}
.rels-panel {
  flex-shrink: 0;
  min-width: 200px;
  max-width: 1040px;
}
.panel-drag-handle {
  width: 6px;
  background: var(--surface-border-subtle);
  cursor: col-resize;
  flex-shrink: 0;
  transition: background 0.1s;
}
.panel-drag-handle:hover { background: var(--surface-border); }
.panel-open-btn {
  position: absolute;
  top: 50%;
  right: 0;
  transform: translateY(-50%);
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-right: none;
  border-radius: var(--radius-sm) 0 0 var(--radius-sm);
  padding: 6px 5px;
  cursor: pointer;
  color: var(--text-muted);
  font-size: var(--font-xs);
  z-index: 10;
  line-height: 1;
}
.panel-open-btn:hover { color: var(--text-secondary); background: var(--surface-hover); }
.selected-row { background: color-mix(in srgb, var(--accent) 10%, transparent); }
</style>
