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
      <div v-if="persons.length > 0" class="list-filter">
        <input
          v-model="searchQuery"
          type="text"
          :placeholder="$t('persons.filterSearch')"
          class="list-filter-input"
        />
      </div>
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
            <th class="sortable-th born-col" @click="toggleSort('birth_date')">
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
                <AppAvatar :person-id="person.id" :given-name="person.given_name || ''" :surname="person.surname || ''" :preferred-name="person.preferred_name ?? null" :sex="(person.sex as 'M' | 'F' | 'U') || 'U'" />
                <router-link v-if="!embedded" :to="'/persons/' + person.id" class="person-link" @click.stop>
                  <PersonName :given-name="person.given_name" :preferred-name="person.preferred_name ?? null" :nickname="person.nickname ?? null" />
                </router-link>
                <span v-else>
                  <PersonName :given-name="person.given_name" :preferred-name="person.preferred_name ?? null" :nickname="person.nickname ?? null" />
                </span>
              </div>
            </td>
            <td>{{ person.surname }}</td>
            <td class="info-cell born-col">{{ person.birth_date || '' }}</td>
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
import { ref, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import PersonModal from '../components/modals/PersonModal.vue';
import { narratePersonRow } from '../utils/screenReaderNarration';
import PersonName from '../components/PersonName.vue';
import AppButton from '../components/ui/AppButton.vue';
import AppAvatar from '../components/ui/AppAvatar.vue';
import AppEmptyState from '../components/ui/AppEmptyState.vue';
import AppLoadingState from '../components/ui/AppLoadingState.vue';
import { useSelectedPersonStore } from '../stores/selectedPerson';
import { useToast } from '../composables/useToast';
import { usePagedList } from '../composables/usePagedList';
const isStaticMode = import.meta.env.VITE_STATIC_MODE === 'true';

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

const { t } = useI18n();
const toast = useToast();
const props = defineProps<{ embedded?: boolean }>();
const emit = defineEmits<{ select: [id: string] }>();
const router = useRouter();
const selectedPersonStore = useSelectedPersonStore();

type SortBy = 'surname' | 'given_name' | 'birth_date';

const {
  items: persons,
  total,
  loading,
  searchQuery,
  sortBy,
  sortDir,
  reload,
  toggleSort,
  attachSentinel,
} = usePagedList<PersonListItem, SortBy>({
  defaultSortBy: 'surname',
  storageKey: 'persons',
  fetchPage: async (limit, offset, sortBy, sortDir, query) => {
    try {
      const result = await window.api.persons.listPage(limit, offset, sortBy, sortDir, query) as { persons: PersonListItem[]; total: number };
      return { items: result.persons, total: result.total };
    } catch (err) {
      console.error('[PersonsView] fetchPage failed:', err);
      toast.error(t('errors.loadFailed'));
      return { items: [], total: 0 };
    }
  },
});

const showAddForm = ref(false);
const sentinel = ref<HTMLElement | null>(null);
watch(sentinel, (el) => attachSentinel(el));

async function onPersonAdded() {
  showAddForm.value = false;
  await reload();
}

// usePagedList auto-subscribes to onDataChanged so the list reloads on
// every mutation — the old loadedVersion/onActivated dance is redundant.
onMounted(reload);

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
  selectedPersonStore.set(person.id);
  router.push(`/persons/${person.id}`);
}

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
/* Lock the Born column to a width that fits a full ISO date (YYYY-MM-DD)
   on one line, so dates never wrap when the column is narrow. */
.born-col {
  width: 11ch;
  white-space: nowrap;
}
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
