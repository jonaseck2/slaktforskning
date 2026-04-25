<template>
  <div class="persons-view-content">
    <div v-if="!embedded" class="header">
      <h2>{{ $t('nav.people') }}</h2>
      <div class="header-actions">
        <AppButton variant="soft" @click="showAddForm = true">+ {{ $t('persons.addPerson') }}</AppButton>
      </div>
    </div>

    <p v-if="total > 0 && filter !== 'duplicates'" class="count-label">
      {{ $t('persons.showingOf', { shown: persons.length, total }) }}
    </p>

    <FilterChips :options="filterOptions" :model-value="filter" @update:model-value="setFilter" />

    <!-- Duplicates view -->
    <template v-if="filter === 'duplicates'">
      <AppLoadingState v-if="duplicatesLoading" :rows="5" />
      <AppEmptyState v-else-if="duplicates.length === 0" icon="✅" :title="$t('empty.duplicates')" />
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>{{ $t('duplicates.keepPerson') }}</th>
            <th>{{ $t('duplicates.mergePerson') }}</th>
            <th>{{ $t('duplicates.score') }}</th>
            <th class="actions-cell">{{ $t('common.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in duplicates" :key="d.person1_id + ':' + d.person2_id">
            <td>
              <router-link :to="'/persons/' + d.person1_id" class="person-link" @click.stop>{{ d.person1_name }}</router-link>
              <span v-if="d.person1_birth" class="birth-hint"> ({{ d.person1_birth }})</span>
            </td>
            <td>
              <router-link :to="'/persons/' + d.person2_id" class="person-link" @click.stop>{{ d.person2_name }}</router-link>
              <span v-if="d.person2_birth" class="birth-hint"> ({{ d.person2_birth }})</span>
            </td>
            <td><span :class="'score-badge score-' + scoreLevel(d.score)">{{ d.score }}%</span></td>
            <td class="actions-cell">
              <AppButton size="sm" @click="openMerge(d)">{{ $t('duplicates.confirmMerge') }}</AppButton>
            </td>
          </tr>
        </tbody>
      </table>
    </template>

    <template v-else-if="loading && persons.length === 0">
      <AppLoadingState :rows="5" />
    </template>

    <AppEmptyState
      v-else-if="persons.length === 0 && !loading"
      icon="👤"
      :title="filter === 'unsourced' ? $t('persons.allSourced') : $t('empty.persons')"
      :description="filter === 'all' ? $t('persons.emptyHint') : ''"
      :action-label="filter === 'all' ? $t('empty.addPerson') : ''"
      @action="showAddForm = true"
    />

    <template v-else-if="filter !== 'duplicates'">
      <table class="data-table">
        <thead>
          <tr>
            <th>{{ $t('persons.givenName') }}</th>
            <th>{{ $t('persons.surname') }}</th>
            <th>{{ $t('persons.sex') }}</th>
            <th>{{ $t('persons.info') }}</th>
            <th class="actions-cell"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="person in persons"
            :key="person.id"
            v-narrate="() => narratePersonRow({
              given_name: person.given_name || '',
              surname: person.surname || '',
              sex: person.sex || 'U',
              event_count: 0,
              relationship_count: 0,
            }, t)"
            class="clickable-row"
            tabindex="0"
            role="button"
            :aria-label="$t('a11y.editItem', { item: ((person.given_name || '') + ' ' + (person.surname || '')).trim() })"
            @click="goToDetail(person)"
            @keydown.enter="goToDetail(person)"
            @keydown.space.prevent="goToDetail(person)"
            @keydown.down.prevent="focusNextRow($event)"
            @keydown.up.prevent="focusPrevRow($event)"
          >
            <td>
              <div class="name-cell">
                <AppAvatar :person-id="person.id" :given-name="person.given_name || ''" :surname="person.surname || ''" :sex="(person.sex as 'M' | 'F' | 'U') || 'U'" />
                <router-link v-if="!embedded" :to="'/visualisering/' + person.id" class="person-link" @click.stop>
                  <PersonName :given-name="person.given_name" :preferred-name="null" :nickname="null" />
                </router-link>
                <span v-else>
                  <PersonName :given-name="person.given_name" :preferred-name="null" :nickname="null" />
                </span>
              </div>
            </td>
            <td>{{ person.surname }}</td>
            <td><AppBadge :variant="'sex-' + ((person.sex || 'U') as string).toLowerCase() as any">{{ person.sex || 'U' }}</AppBadge></td>
            <td class="info-cell">{{ formatPersonInfo(person) }}</td>
            <td class="actions-cell">
              <AppButton variant="ghost" size="sm" @click.stop="removePerson(person.id)">✕</AppButton>
            </td>
          </tr>
        </tbody>
      </table>

      <div ref="sentinel" class="scroll-sentinel"></div>
    </template>

    <!-- Add Person Modal -->
    <AddPersonModal v-if="showAddForm" @close="showAddForm = false" @saved="onPersonAdded" />

    <MergePersonsModal
      v-if="mergeCandidate"
      :target="{ id: mergeCandidate.person1_id }"
      :source="{ id: mergeCandidate.person2_id }"
      :target-name="mergeCandidate.person1_name"
      :source-name="mergeCandidate.person2_name"
      :target-birth="mergeCandidate.person1_birth"
      :source-birth="mergeCandidate.person2_birth"
      :reasons="mergeCandidate.reasons"
      @close="mergeCandidate = null"
      @merged="onMerged"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onActivated, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import AddPersonModal from '../components/AddPersonModal.vue';
import { narratePersonRow } from '../utils/screenReaderNarration';
import PersonName from '../components/PersonName.vue';
import MergePersonsModal from '../components/MergePersonsModal.vue';
import AppButton from '../components/ui/AppButton.vue';
import AppBadge from '../components/ui/AppBadge.vue';
import AppAvatar from '../components/ui/AppAvatar.vue';
import AppEmptyState from '../components/ui/AppEmptyState.vue';
import AppLoadingState from '../components/ui/AppLoadingState.vue';
import FilterChips from '../components/ui/FilterChips.vue';
import { useFocusStore } from '../stores/focus';
import { fullNameParts } from '../utils/nameUtils';
import { useDataVersionStore } from '../stores/dataVersion';
import { useToast } from '../composables/useToast';
const dataVersionStore = useDataVersionStore();
let loadedVersion = -1;

interface PersonListItem {
  id: string;
  sex: string;
  given_name: string;
  surname: string;
  birth_date: string | null;
  birth_place: string | null;
  death_date: string | null;
  death_place: string | null;
}

const PAGE_SIZE = 100;

const { t } = useI18n();
const toast = useToast();
const props = defineProps<{ embedded?: boolean }>();
const emit = defineEmits<{ select: [id: string] }>();
const router = useRouter();
const focusStore = useFocusStore();

const persons = ref<PersonListItem[]>([]);
const total = ref(0);
const offset = ref(0);
const loading = ref(false);
const showAddForm = ref(false);
const sentinel = ref<HTMLElement | null>(null);
const filter = ref<'all' | 'unsourced' | 'duplicates'>('all');

const filterOptions = computed(() => [
  { value: 'all', label: t('persons.filterAll') },
  { value: 'unsourced', label: t('persons.filterUnsourced') },
  { value: 'duplicates', label: t('duplicates.filterDuplicates') },
]);

interface DuplicateCandidate {
  person1_id: string;
  person2_id: string;
  person1_name: string;
  person2_name: string;
  person1_birth: string | null;
  person2_birth: string | null;
  score: number;
  reasons: string[];
}
const duplicates = ref<DuplicateCandidate[]>([]);
const duplicatesLoading = ref(false);
const mergeCandidate = ref<DuplicateCandidate | null>(null);

let observer: IntersectionObserver | null = null;

watch(sentinel, (el) => {
  if (observer) { observer.disconnect(); observer = null; }
  if (!el) return;
  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && persons.value.length < total.value && !loading.value) {
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



function formatPersonInfo(person: PersonListItem): string {
  const parts: string[] = [];
  if (person.birth_date) parts.push('b. ' + person.birth_date);
  if (person.birth_place) parts.push(person.birth_place);
  if (person.death_date) parts.push('d. ' + person.death_date);
  if (person.death_place && !person.birth_place) parts.push(person.death_place);
  return parts.join(' \u00b7 ');
}

async function load() {
  if (!window.api) return;
  loading.value = true;
  try {
    const fn = filter.value === 'unsourced' ? window.api.persons.listUnsourcedPage : window.api.persons.listPage;
    const result = await fn(PAGE_SIZE, 0) as { persons: PersonListItem[]; total: number };
    persons.value = result.persons;
    total.value = result.total;
    offset.value = PAGE_SIZE;
  } catch (err) {
    console.error('[PersonsView] load failed:', err);
    toast.error(t('errors.loadFailed'));
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  if (!window.api || loading.value) return;
  loading.value = true;
  try {
    const fn = filter.value === 'unsourced' ? window.api.persons.listUnsourcedPage : window.api.persons.listPage;
    const result = await fn(PAGE_SIZE, offset.value) as { persons: PersonListItem[]; total: number };
    persons.value = [...persons.value, ...result.persons];
    total.value = result.total;
    offset.value += PAGE_SIZE;
  } catch (err) {
    console.error('[PersonsView] loadMore failed:', err);
    toast.error(t('errors.loadFailed'));
  } finally {
    loading.value = false;
  }
}

function setFilter(f: string) {
  const val = f as 'all' | 'unsourced' | 'duplicates';
  if (filter.value === val) return;
  filter.value = val;
  if (val === 'duplicates') {
    loadDuplicates();
  } else {
    load();
  }
}

async function loadDuplicates() {
  if (!window.api) return;
  duplicatesLoading.value = true;
  try {
    duplicates.value = (await window.api.duplicates.find(100)) as DuplicateCandidate[];
  } catch (err) {
    console.error('[PersonsView] loadDuplicates failed:', err);
    toast.error(t('errors.loadFailed'));
  } finally {
    duplicatesLoading.value = false;
  }
}

function scoreLevel(score: number): string {
  if (score >= 80) return 'high';
  if (score >= 60) return 'medium';
  return 'low';
}

function openMerge(d: DuplicateCandidate) {
  mergeCandidate.value = d;
}

async function onMerged() {
  mergeCandidate.value = null;
  await loadDuplicates();
}

async function onPersonAdded() {
  showAddForm.value = false;
  await load();
}

async function removePerson(id: string) {
  if (!window.api) return;
  if (!confirm(t('persons.confirmDelete'))) return;
  try {
    await window.api.persons.delete(id);
    await load();
  } catch (err) {
    console.error('[PersonsView] removePerson failed:', err);
    toast.error(t('errors.deleteFailed'));
  }
}

function focusNextRow(e: KeyboardEvent): void {
  const row = (e.target as HTMLElement).nextElementSibling as HTMLElement | null;
  if (row?.matches('tr[tabindex]')) row.focus();
}
function focusPrevRow(e: KeyboardEvent): void {
  const row = (e.target as HTMLElement).previousElementSibling as HTMLElement | null;
  if (row?.matches('tr[tabindex]')) row.focus();
}

function goToDetail(person: PersonListItem) {
  if (props.embedded) {
    emit('select', person.id);
    return;
  }
  const name = fullNameParts(person.given_name ?? null, person.surname ?? null, null, null).map(p => p.text).join('');
  focusStore.set(person.id, name);
  router.push(`/visualisering/${person.id}`);
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

<style scoped>
/* Unique to PersonsView */
.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.actions-cell { width: 1px; text-align: right; white-space: nowrap; }
.name-cell { display: flex; align-items: center; gap: var(--space-sm); }
.info-cell { color: var(--text-muted); font-size: var(--font-sm); }
.birth-hint { color: var(--text-muted); font-size: var(--font-xs); }
.score-badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: var(--font-xs);
  font-weight: 600;
}
.score-high { background: var(--error-bg); color: var(--error-text); }
.score-medium { background: var(--warning-bg); color: var(--warning-text); }
.score-low { background: var(--info-bg); color: var(--info-text); }
.form-row-2col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.checkbox-label {
  font-weight: 500;
  cursor: pointer;
}
.checkbox-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 0;
  font-size: var(--font-base);
  font-weight: var(--font-weight-normal);
  color: var(--text-primary);
}
.checkbox-wrap input[type='checkbox'] {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--accent);
}
</style>
