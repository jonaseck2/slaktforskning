<template>
  <div>
    <div class="header">
      <h2>{{ $t('nav.people') }}</h2>
      <div class="header-actions">
        <AppButton variant="primary" @click="showAddForm = true"><span aria-hidden="true">+ </span>{{ $t('persons.addPerson') }}</AppButton>
      </div>
    </div>

    <p v-if="total > 0 && filter !== 'duplicates'" class="count-label">
      {{ $t('persons.showingOf', { shown: persons.length, total }) }}
    </p>

    <FilterChips :options="filterOptions" :model-value="filter" @update:model-value="setFilter" />

    <!-- Duplicates view -->
    <template v-if="filter === 'duplicates'">
      <AppLoadingState v-if="duplicatesLoading" :rows="5" />
      <div v-else-if="duplicates.length === 0" class="empty">{{ $t('duplicates.noDuplicates') }}</div>
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
      icon="🌳"
      :title="filter === 'unsourced' ? $t('persons.allSourced') : $t('persons.emptyState')"
      :description="filter === 'all' ? $t('persons.emptyHint') : ''"
      :action-label="filter === 'all' ? $t('persons.addPerson') : ''"
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
                <AppAvatar :given-name="person.given_name || ''" :surname="person.surname || ''" :sex="(person.sex as 'M' | 'F' | 'U') || 'U'" />
                <router-link :to="'/persons/' + person.id" class="person-link" @click.stop>
                  <PersonName :given-name="person.given_name" :preferred-name="null" :nickname="null" />
                </router-link>
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
    <BaseModal v-if="showAddForm" @close="showAddForm = false" title-id="modal-title-add-person">
        <h3 id="modal-title-add-person">{{ $t('persons.addPerson') }}</h3>
        <form @submit.prevent="addPerson">
          <label>{{ $t('persons.givenName') }}
            <input v-model="form.given_name" type="text" required autofocus />
          </label>
          <label>{{ $t('persons.surname') }}
            <input v-model="form.surname" type="text" />
          </label>
          <label>{{ $t('persons.sex') }}
            <select v-model="form.sex">
              <option value="U">{{ $t('persons.sexUnknown') }}</option>
              <option value="M">{{ $t('persons.male') }}</option>
              <option value="F">{{ $t('persons.female') }}</option>
            </select>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" v-model="form.living" />{{ $t('persons.living') }}
          </label>

          <!-- Birth / event section -->
          <details class="birth-section" open>
            <summary>{{ $t('eventTypes.birth') }}</summary>
            <label>{{ $t('addRelated.birthDate') }}</label>
            <DateInput
              v-model:dateType="birthForm.date_type"
              v-model:dateValue="birthForm.date_value"
              v-model:dateValueEnd="birthForm.date_value_end"
              v-model:dateOriginal="birthForm.date_original"
            />
            <label>{{ $t('addRelated.birthPlace') }}
              <PlacePicker v-model="birthForm.place_id" />
            </label>
            <label>{{ $t('citations.source') }}
              <SourcePicker v-model="birthSourceForm.source_id" />
            </label>
            <label>{{ $t('addRelated.page') }}
              <input v-model="birthSourceForm.page" type="text" :placeholder="$t('addRelated.page')" />
            </label>
          </details>
          <div class="modal-actions">
            <AppButton variant="secondary" @click="showAddForm = false">{{ $t('common.cancel') }}</AppButton>
            <AppButton variant="primary" type="submit">{{ $t('common.create') }}</AppButton>
          </div>
        </form>
    </BaseModal>

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
import { ref, reactive, computed, onMounted, onActivated, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import BaseModal from '../components/BaseModal.vue';
import DateInput from '../components/DateInput.vue';
import { narratePersonRow } from '../utils/screenReaderNarration';
import PersonName from '../components/PersonName.vue';
import MergePersonsModal from '../components/MergePersonsModal.vue';
import PlacePicker from '../components/PlacePicker.vue';
import SourcePicker from '../components/SourcePicker.vue';
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
import { useBirthEventCreation } from '../composables/useBirthEventCreation';
import { useSourceSession } from '../stores/sourceSession';
const dataVersionStore = useDataVersionStore();
const { createBirthEvent } = useBirthEventCreation();
const sourceSession = useSourceSession();
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

const form = reactive({
  given_name: '',
  surname: '',
  sex: 'U',
  living: true,
});

const birthForm = reactive({
  date_type: 'exact',
  date_value: '',
  date_value_end: '',
  date_original: '',
  place_id: null as string | null,
});
const birthSourceForm = reactive({ source_id: null as string | null, page: '' });

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

async function addPerson() {
  if (!window.api) return;
  try {
    const person = await window.api.persons.create({
      given_name: form.given_name,
      surname: form.surname,
      sex: form.sex,
      living: form.living,
    });
    const newPerson = person as { id: string };
    await createBirthEvent(newPerson.id, {
      date_type: birthForm.date_type !== 'exact' ? birthForm.date_type : undefined,
      date_value: birthForm.date_value || undefined,
      date_value_end: birthForm.date_value_end || undefined,
      date_original: birthForm.date_original || undefined,
      place_id: birthForm.place_id,
      source_id: birthSourceForm.source_id || undefined,
      page: birthSourceForm.page || undefined,
    });
    if (birthSourceForm.source_id) {
      sourceSession.setLastUsed(birthSourceForm.source_id, birthSourceForm.page);
    }
    showAddForm.value = false;
    form.given_name = '';
    form.surname = '';
    form.sex = 'U';
    form.living = true;
    birthForm.date_type = 'exact';
    birthForm.date_value = '';
    birthForm.date_value_end = '';
    birthForm.date_original = '';
    birthForm.place_id = null;
    birthSourceForm.source_id = null;
    birthSourceForm.page = '';
    await load();
  } catch (err) {
    console.error('[PersonsView] addPerson failed:', err);
    toast.error(t('errors.saveFailed'));
  }
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
  const name = fullNameParts(person.given_name ?? null, person.surname ?? null, null, null).map(p => p.text).join('');
  focusStore.set(person.id, name);
  router.push(`/persons/${person.id}`);
}

onMounted(async () => {
  await load();
  loadedVersion = dataVersionStore.version;
  if (sourceSession.lastSourceId) {
    birthSourceForm.source_id = sourceSession.lastSourceId;
  }
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
.checkbox-label {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  cursor: pointer;
}
.checkbox-label input[type='checkbox'] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}
.birth-section {
  border: 1px solid var(--surface-border, #e2e8f0);
  border-radius: 6px;
  padding: 8px 12px;
  margin: 4px 0;
}
.birth-section summary {
  cursor: pointer;
  font-weight: 500;
  font-size: var(--font-sm);
  color: var(--text-muted);
}
</style>
