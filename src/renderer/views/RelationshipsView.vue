<template>
  <div>
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
      @delete="removeRelationship"
    />
    <div ref="sentinel" class="scroll-sentinel"></div>

    <!-- Add Relationship Modal -->
    <RelationshipModal
      v-if="showAddForm"
      mode="standalone"
      @cancel="showAddForm = false"
      @close="showAddForm = false"
      @saved="onSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onActivated, onUnmounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import RelationshipsTable from '../components/RelationshipsTable.vue';
import RelationshipModal from '../components/modals/RelationshipModal.vue';
import AppButton from '../components/ui/AppButton.vue';
import AppEmptyState from '../components/ui/AppEmptyState.vue';
import FilterChips from '../components/ui/FilterChips.vue';
import type { RelRow } from '../components/RelationshipsTable.vue';
import { RELATIONSHIP_TYPE_VALUES } from '../constants/eventTypes';
import { useDataVersionStore } from '../stores/dataVersion';
import { useToast } from '../composables/useToast';
const dataVersionStore = useDataVersionStore();
let loadedVersion = -1;


const PAGE_SIZE = 100;

const { t } = useI18n();
const toast = useToast();
const relationships = ref<RelRow[]>([]);
const total = ref(0);
const offset = ref(0);
const loading = ref(false);
const showAddForm = ref(false);
const sentinel = ref<HTMLElement | null>(null);

const activeTypeFilter = ref<string>('all');

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

async function removeRelationship(id: string) {
  if (!window.api) return;
  if (!confirm(t('relationships.confirmDelete'))) return;
  try {
    await window.api.relationships.delete(id);
    await load();
  } catch (err) {
    console.error('[RelationshipsView] removeRelationship failed:', err);
    toast.error(t('errors.deleteFailed'));
  }
}

onMounted(async () => {
  await load();
  loadedVersion = dataVersionStore.version;
});

onActivated(async () => {
  if (dataVersionStore.version !== loadedVersion) {
    await load();
    loadedVersion = dataVersionStore.version;
  }
});
</script>

