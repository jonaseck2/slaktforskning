<template>
  <div>
    <div class="header">
      <h2>{{ $t('relationships.title') }}</h2>
      <button class="btn-add" @click="showAddForm = true">{{ $t('relationships.addRelationship') }}</button>
    </div>
    <p v-if="total > 0" class="count-label">
      {{ $t('relationships.showingOf', { shown: relationships.length, total }) }}
    </p>
    <div v-if="relationships.length > 0" class="filter-chips">
      <button
        v-for="f in typeFilters"
        :key="f.value"
        :class="['chip', { active: activeTypeFilter === f.value }]"
        @click="activeTypeFilter = f.value"
      >{{ f.label }}</button>
    </div>
    <div v-if="relationships.length === 0 && !loading" class="empty">
      {{ $t('relationships.emptyState') }}
    </div>
    <div v-else-if="filteredRelationships.length === 0 && !loading" class="empty">
      {{ $t('relationships.noMatchingFilter') }}
    </div>
    <RelationshipsTable
      v-else
      :relationships="filteredRelationships"
      @delete="removeRelationship"
    />
    <div ref="sentinel" class="scroll-sentinel"></div>

    <!-- Add Relationship Modal -->
    <div v-if="showAddForm" class="modal-overlay" @click.self="showAddForm = false">
      <div class="modal">
        <h3>{{ $t('relationships.addRelationship') }}</h3>
        <form @submit.prevent="addRelationship">
          <label>
            {{ $t('common.type') }}
            <select v-model="form.type">
              <option v-for="rt in RELATIONSHIP_TYPE_VALUES" :key="rt" :value="rt">
                {{ $t('relTypes.' + rt) }}
              </option>
            </select>
          </label>
          <label v-if="form.type === 'couple'">
            {{ $t('relationshipDetail.subtype') }}
            <select v-model="form.subtype">
              <option v-for="st in COUPLE_SUBTYPE_VALUES" :key="st" :value="st">
                {{ $t('coupleSubtypes.' + st) }}
              </option>
            </select>
          </label>
          <label v-if="form.type === 'parent_child'">
            {{ $t('relationshipDetail.subtype') }}
            <select v-model="form.subtype">
              <option v-for="st in PARENT_CHILD_SUBTYPE_VALUES" :key="st" :value="st">
                {{ $t('parentChildSubtypes.' + st) }}
              </option>
            </select>
          </label>
          <label>
            {{ $t('relationships.person1') }}
            <PersonPicker v-model="form.person1_id" :placeholder="$t('relationships.searchPerson')" />
          </label>
          <label>
            {{ $t('relationships.person2') }}
            <PersonPicker v-model="form.person2_id" :placeholder="$t('relationships.searchPerson')" />
          </label>
          <label>
            {{ $t('common.notes') }}
            <textarea v-model="form.notes" rows="2" />
          </label>
          <div class="modal-actions">
            <button type="button" class="btn-cancel" @click="showAddForm = false">{{ $t('common.cancel') }}</button>
            <button type="submit">{{ $t('relationships.addRelationship') }}</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onActivated, onUnmounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import PersonPicker from '../components/PersonPicker.vue';
import RelationshipsTable from '../components/RelationshipsTable.vue';
import type { RelRow } from '../components/RelationshipsTable.vue';
import { RELATIONSHIP_TYPE_VALUES, COUPLE_SUBTYPE_VALUES, PARENT_CHILD_SUBTYPE_VALUES } from '../constants/eventTypes';
import { useDataVersionStore } from '../stores/dataVersion';
const dataVersionStore = useDataVersionStore();
let loadedVersion = -1;

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const PAGE_SIZE = 100;

const { t } = useI18n();
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
  { value: 'all', label: `${t('common.all')} (${relationships.value.length})` },
  ...RELATIONSHIP_TYPE_VALUES
    .filter(type => (typeCounts.value[type] ?? 0) > 0)
    .map(type => ({
      value: type,
      label: `${t('relTypes.' + type)} (${typeCounts.value[type] ?? 0})`,
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

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') showAddForm.value = false;
}
onMounted(() => window.addEventListener('keydown', handleKeydown));
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
  if (observer) observer.disconnect();
});

const form = reactive({
  type: 'couple' as string,
  subtype: 'marriage' as string,
  person1_id: null as string | null,
  person2_id: null as string | null,
  notes: '',
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
  } finally {
    loading.value = false;
  }
}

async function addRelationship() {
  if (!window.api) return;
  try {
    await window.api.relationships.create({
      type: form.type,
      person1_id: form.person1_id,
      person2_id: form.person2_id,
      subtype: form.subtype,
      notes: form.notes,
    });
    showAddForm.value = false;
    form.type = 'couple';
    form.subtype = 'marriage';
    form.person1_id = null;
    form.person2_id = null;
    form.notes = '';
    await load();
  } catch (err) {
    console.error('[RelationshipsView] addRelationship failed:', err);
  }
}

async function removeRelationship(id: string) {
  if (!window.api) return;
  if (!confirm(t('relationships.confirmDelete'))) return;
  try {
    await window.api.relationships.delete(id);
    await load();
  } catch (err) {
    console.error('[RelationshipsView] removeRelationship failed:', err);
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

