<template>
  <div>
    <div class="header">
      <h2>{{ $t('persons.title') }}</h2>
      <div class="header-actions">
        <button class="btn-add" @click="showAddForm = true"><span aria-hidden="true">+ </span>{{ $t('persons.addPerson') }}</button>
      </div>
    </div>

    <p v-if="total > 0 && filter !== 'duplicates'" class="count-label">
      {{ $t('persons.showingOf', { shown: persons.length, total }) }}
    </p>

    <div class="filter-chips">
      <button :class="['chip', { active: filter === 'all' }]" @click="setFilter('all')">{{ $t('persons.filterAll') }}</button>
      <button :class="['chip', { active: filter === 'unsourced' }]" @click="setFilter('unsourced')">{{ $t('persons.filterUnsourced') }}</button>
      <button :class="['chip', { active: filter === 'duplicates' }]" @click="setFilter('duplicates')">{{ $t('duplicates.filterDuplicates') }}</button>
    </div>

    <!-- Duplicates view -->
    <template v-if="filter === 'duplicates'">
      <div v-if="duplicatesLoading" class="empty">{{ $t('common.loading') }}</div>
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
              <button class="btn-sm btn-merge-action" @click="openMerge(d)">{{ $t('duplicates.confirmMerge') }}</button>
            </td>
          </tr>
        </tbody>
      </table>
    </template>

    <div v-else-if="persons.length === 0 && !loading" class="empty" tabindex="0" :data-narrate="$t('screenReader.tableEmpty', { type: $t('persons.title') })">
      {{ filter === 'unsourced' ? $t('persons.allSourced') : $t('persons.emptyState') }}
    </div>

    <template v-else-if="filter !== 'duplicates'">
      <table class="data-table">
        <thead>
          <tr>
            <th>{{ $t('persons.givenName') }}</th>
            <th>{{ $t('persons.surname') }}</th>
            <th>{{ $t('persons.sex') }}</th>
            <th>{{ $t('persons.birthDate') }}</th>
            <th>{{ $t('persons.birthPlace') }}</th>
            <th>{{ $t('persons.deathDate') }}</th>
            <th>{{ $t('persons.deathPlace') }}</th>
            <th class="actions-cell">{{ $t('common.actions') }}</th>
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
              <router-link :to="'/persons/' + person.id" class="person-link" @click.stop>
                <PersonName :given-name="person.given_name" :preferred-name="null" :nickname="null" />
              </router-link>
            </td>
            <td>{{ person.surname }}</td>
            <td><span :class="'sex-badge sex-' + person.sex">{{ person.sex }}</span></td>
            <td class="date-cell">{{ person.birth_date ?? '' }}</td>
            <td>{{ person.birth_place ?? '' }}</td>
            <td class="date-cell">{{ person.death_date ?? '' }}</td>
            <td>{{ person.death_place ?? '' }}</td>
            <td class="actions-cell">
              <button class="btn-sm btn-delete" @click.stop="removePerson(person.id)">✕</button>
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
          <label>
            {{ $t('persons.givenName') }}
            <input v-model="form.given_name" type="text" required autofocus />
          </label>
          <label>
            {{ $t('persons.surname') }}
            <input v-model="form.surname" type="text" />
          </label>
          <label>
            {{ $t('persons.sex') }}
            <div class="radio-group">
              <label class="radio-label">
                <input v-model="form.sex" type="radio" value="M" /> {{ $t('persons.male') }}
              </label>
              <label class="radio-label">
                <input v-model="form.sex" type="radio" value="F" /> {{ $t('persons.female') }}
              </label>
              <label class="radio-label">
                <input v-model="form.sex" type="radio" value="U" /> {{ $t('persons.sexUnknown') }}
              </label>
            </div>
          </label>
          <label>
            {{ $t('common.notes') }}
            <textarea v-model="form.notes" rows="2" />
          </label>
          <details class="birth-section" open>
            <summary>{{ $t('eventTypes.birth') }}</summary>
            <label>{{ $t('addRelated.birthDate') }}
              <input v-model="birthForm.date_value" type="date" />
            </label>
            <label>{{ $t('addRelated.originalDate') }}
              <input v-model="birthForm.date_original" type="text" :placeholder="$t('addRelated.originalDate')" />
            </label>
            <label>{{ $t('addRelated.birthPlace') }}
              <PlacePicker v-model="birthForm.place_id" />
            </label>
            <label class="checkbox-label">
              <input type="checkbox" v-model="addBirthSource" />{{ $t('addRelated.addSource') }}
            </label>
            <template v-if="addBirthSource">
              <label>{{ $t('addRelated.addSource') }}
                <select v-model="birthSourceForm.source_id">
                  <option value="">{{ $t('addRelated.sourcePlaceholder') }}</option>
                  <option v-for="s in birthSources" :key="s.id" :value="s.id">{{ s.title }}</option>
                </select>
              </label>
              <label>{{ $t('addRelated.page') }}
                <input v-model="birthSourceForm.page" type="text" :placeholder="$t('addRelated.page')" />
              </label>
            </template>
          </details>
          <div class="modal-actions">
            <button type="button" class="btn-cancel" @click="showAddForm = false">{{ $t('common.cancel') }}</button>
            <button type="submit">{{ $t('persons.addPerson') }}</button>
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
import { ref, reactive, onMounted, onActivated, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import BaseModal from '../components/BaseModal.vue';
import { narratePersonRow } from '../utils/screenReaderNarration';
import PersonName from '../components/PersonName.vue';
import MergePersonsModal from '../components/MergePersonsModal.vue';
import PlacePicker from '../components/PlacePicker.vue';
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
    // Trigger ~50 rows (~40px each) before the sentinel enters the viewport
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
  notes: '',
});

// Birth form state
const birthForm = reactive({
  date_value: '',
  date_original: '',
  place_id: null as string | null,
});
const addBirthSource = ref(false);
const birthSourceForm = reactive({ source_id: '', page: '' });
const birthSources = ref<{ id: string; title: string }[]>([]);

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

function setFilter(f: 'all' | 'unsourced' | 'duplicates') {
  if (filter.value === f) return;
  filter.value = f;
  if (f === 'duplicates') {
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
      notes: form.notes,
    });
    const newPerson = person as { id: string };
    const usedSourceId = addBirthSource.value ? birthSourceForm.source_id || undefined : undefined;
    await createBirthEvent(newPerson.id, {
      date_value: birthForm.date_value || undefined,
      date_original: birthForm.date_original || undefined,
      place_id: birthForm.place_id,
      source_id: usedSourceId,
      page: addBirthSource.value ? birthSourceForm.page : undefined,
    });
    if (usedSourceId) {
      sourceSession.setLastUsed(usedSourceId, birthSourceForm.page);
    }
    showAddForm.value = false;
    form.given_name = '';
    form.surname = '';
    form.sex = 'U';
    form.notes = '';
    birthForm.date_value = '';
    birthForm.date_original = '';
    birthForm.place_id = null;
    addBirthSource.value = false;
    birthSourceForm.source_id = '';
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
  if (window.api?.sources) {
    birthSources.value = (await window.api.sources.list()) as { id: string; title: string }[];
    if (sourceSession.lastSourceId) {
      birthSourceForm.source_id = sourceSession.lastSourceId;
    }
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
.radio-group { display: flex; gap: 16px; margin-top: 4px; }
.radio-label { display: flex; flex-direction: row; align-items: center; gap: 6px; font-weight: normal; }
.actions-cell { width: 1px; text-align: right; white-space: nowrap; }
.date-cell { white-space: nowrap; }
.birth-hint { color: var(--color-text-subtle); font-size: var(--font-xs); }
.score-badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: var(--font-xs);
  font-weight: 600;
}
.score-high { background: #fee2e2; color: #991b1b; }
.score-medium { background: #fef3c7; color: #92400e; }
.score-low { background: #e0f2fe; color: #075985; }
.btn-merge-action {
  background: var(--color-warning-bg, #fef3c7);
  color: var(--color-warning-badge, #92400e);
}
.birth-section {
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 6px;
  padding: 8px 12px;
  margin: 4px 0;
}
.birth-section summary {
  cursor: pointer;
  font-weight: 500;
  font-size: var(--font-sm);
  color: var(--color-text-muted, #64748b);
}
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
</style>
