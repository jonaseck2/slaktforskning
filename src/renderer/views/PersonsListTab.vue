<template>
  <div class="persons-view-content">
    <div v-if="!embedded" class="header">
      <h2>{{ $t('nav.people') }}</h2>
      <div class="header-actions">
        <AppButton v-if="!isStaticMode" variant="soft" @click="showAddForm = true">+ {{ $t('persons.addPerson') }}</AppButton>
      </div>
    </div>

    <template v-if="loading && persons.length === 0">
      <AppLoadingState :rows="5" />
    </template>

    <AppEmptyState
      v-else-if="persons.length === 0 && !loading"
      icon="👤"
      :title="$t('empty.persons')"
      :description="$t('persons.emptyHint')"
      :action-label="!isStaticMode ? $t('empty.addPerson') : ''"
      @action="showAddForm = true"
    />

    <template v-else>
      <div class="persons-list-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th class="sortable-th" @click="toggleSort('given_name')">
              {{ $t('persons.givenNameColumn') }}
              <span v-if="sortBy === 'given_name'" class="sort-arrow">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </th>
            <th class="sortable-th" @click="toggleSort('surname')">
              {{ $t('persons.surname') }}
              <span v-if="sortBy === 'surname'" class="sort-arrow">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </th>
            <th class="sortable-th" @click="toggleSort('birth_date')">
              {{ $t('persons.bornColumn') }}
              <span v-if="sortBy === 'birth_date'" class="sort-arrow">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </th>
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
                <router-link v-if="!embedded" :to="'/persons/' + person.id" class="person-link" @click.stop>
                  <PersonName :given-name="person.given_name" :preferred-name="person.preferred_name ?? null" :nickname="person.nickname ?? null" />
                </router-link>
                <span v-else>
                  <PersonName :given-name="person.given_name" :preferred-name="person.preferred_name ?? null" :nickname="person.nickname ?? null" />
                </span>
              </div>
            </td>
            <td>{{ person.surname }}</td>
            <td class="info-cell">{{ person.birth_date || '' }}</td>
          </tr>
        </tbody>
      </table>

      <div ref="sentinel" class="scroll-sentinel"></div>
      </div>
      <p v-if="total > 0" class="persons-list-footer count-label">
        {{ $t('persons.showingOf', { shown: persons.length, total }) }}
      </p>
    </template>

    <!-- Add Person Modal -->
    <PersonModal v-if="showAddForm" mode="standalone" @cancel="showAddForm = false" @saved="onPersonAdded" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onActivated, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import PersonModal from '../components/modals/PersonModal.vue';
import { narratePersonRow } from '../utils/screenReaderNarration';
import PersonName from '../components/PersonName.vue';
import AppButton from '../components/ui/AppButton.vue';
import AppAvatar from '../components/ui/AppAvatar.vue';
import AppEmptyState from '../components/ui/AppEmptyState.vue';
import AppLoadingState from '../components/ui/AppLoadingState.vue';
import { useFocusStore } from '../stores/focus';
import { fullNameParts } from '../utils/nameUtils';
import { useDataVersionStore } from '../stores/dataVersion';
import { useToast } from '../composables/useToast';
const isStaticMode = import.meta.env.VITE_STATIC_MODE === 'true';
const dataVersionStore = useDataVersionStore();
let loadedVersion = -1;

interface PersonListItem {
  id: string;
  sex: string;
  given_name: string;
  surname: string;
  preferred_name: string | null;
  nickname: string | null;
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

// Sort state — clicking a column header toggles direction; clicking a
// different column resets to asc. Persisted in localStorage so the choice
// survives navigation.
type SortBy = 'surname' | 'given_name' | 'birth_date';
type SortDir = 'asc' | 'desc';
const sortBy = ref<SortBy>((localStorage.getItem('persons-sort-by') as SortBy) || 'surname');
const sortDir = ref<SortDir>((localStorage.getItem('persons-sort-dir') as SortDir) || 'asc');
function toggleSort(column: SortBy) {
  if (sortBy.value === column) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortBy.value = column;
    sortDir.value = 'asc';
  }
  localStorage.setItem('persons-sort-by', sortBy.value);
  localStorage.setItem('persons-sort-dir', sortDir.value);
  load();
}
const loading = ref(false);
const showAddForm = ref(false);
const sentinel = ref<HTMLElement | null>(null);

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



async function load() {
  if (!window.api) return;
  loading.value = true;
  try {
    const result = await window.api.persons.listPage(PAGE_SIZE, 0, sortBy.value, sortDir.value) as { persons: PersonListItem[]; total: number };
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
    const result = await window.api.persons.listPage(PAGE_SIZE, offset.value, sortBy.value, sortDir.value) as { persons: PersonListItem[]; total: number };
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

async function onPersonAdded() {
  showAddForm.value = false;
  await load();
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
  router.push(`/persons/${person.id}`);
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

/* When embedded (left list column in PersonsView), the table scrolls in a
   dedicated wrapper so the count footer stays pinned and visible without
   scrolling. The table head sticks to the top of the wrapper so column
   labels remain visible while the rows scroll. */
.persons-list-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.persons-list-scroll :deep(.data-table thead th) {
  position: sticky;
  top: 0;
  background: var(--surface);
  z-index: 1;
  /* The data-table's own border-bottom on rows already gives a separator,
     but stickiness can hide the table border underneath the floating head.
     Add a bottom border on the sticky head as a fallback. */
  box-shadow: inset 0 -1px 0 var(--surface-border-subtle);
}
.sortable-th {
  cursor: pointer;
  user-select: none;
}
.sortable-th:hover {
  background: var(--surface-hover);
}
.sort-arrow {
  margin-left: 4px;
  font-size: var(--font-xs);
  color: var(--accent);
}
.persons-list-footer {
  flex-shrink: 0;
  margin: 0;
  padding: var(--space-sm) 0 0 0;
  border-top: 1px solid var(--surface-border-subtle);
  text-align: center;
}
.actions-cell { width: 1px; text-align: right; white-space: nowrap; }
.name-cell { display: flex; align-items: center; gap: var(--space-sm); }
.info-cell { color: var(--text-muted); font-size: var(--font-sm); }
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
