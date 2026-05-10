<template>
  <div class="persons-view-content">
    <div v-if="!embedded" class="header">
      <h2>{{ $t('nav.people') }}</h2>
      <div class="header-actions">
        <AppButton
          variant="ghost"
          size="sm"
          :aria-label="$t('persons.columnPicker.title')"
          @click="showColumnPicker = true"
        >⋮ {{ $t('persons.columnPicker.openLabel') }}</AppButton>
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
      <p v-if="hasSecondarySort" class="sort-status-pill">
        {{ $t('persons.columnPicker.sortStatus', {
          primary: columnLabel(sortBy as PersonsColumnKey),
          primaryDir: sortDir === 'asc' ? '↑' : '↓',
          secondary: sortBy2 ? columnLabel(sortBy2 as PersonsColumnKey) : '',
          secondaryDir: sortDir2 === 'asc' ? '↑' : '↓',
        }) }}
        <button
          class="sort-status-clear"
          :aria-label="$t('persons.columnPicker.clearSecondary')"
          @click="clearSecondarySort"
        >✕</button>
      </p>
      <div class="persons-list-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th
              v-if="isVisible('display_id')"
              class="sortable-th display-id-col"
              @click="(e) => onHeaderClick(e, 'display_id')"
            >
              {{ $t('persons.idColumn') }}
              <SortIndicator :primary="sortBy === 'display_id'" :secondary="sortBy2 === 'display_id'" :primary-dir="sortDir" :secondary-dir="sortDir2" />
            </th>
            <th
              v-if="isVisible('name')"
              class="sortable-th"
              @click="(e) => onHeaderClick(e, 'surname')"
            >
              {{ $t('persons.surname') }}
              <SortIndicator :primary="sortBy === 'surname'" :secondary="sortBy2 === 'surname'" :primary-dir="sortDir" :secondary-dir="sortDir2" />
            </th>
            <th
              v-if="isVisible('birth_date')"
              class="sortable-th born-col"
              @click="(e) => onHeaderClick(e, 'birth_date')"
            >
              {{ $t('persons.bornColumn') }}
              <SortIndicator :primary="sortBy === 'birth_date'" :secondary="sortBy2 === 'birth_date'" :primary-dir="sortDir" :secondary-dir="sortDir2" />
            </th>
            <th
              v-if="isVisible('death_date')"
              class="sortable-th born-col"
            >
              {{ $t('persons.columns.deathDate') }}
            </th>
            <th
              v-if="isVisible('sex')"
              class="sortable-th sex-col"
              @click="(e) => onHeaderClick(e, 'sex')"
            >
              {{ $t('persons.columns.sex') }}
              <SortIndicator :primary="sortBy === 'sex'" :secondary="sortBy2 === 'sex'" :primary-dir="sortDir" :secondary-dir="sortDir2" />
            </th>
            <th
              v-if="isVisible('name_count')"
              class="sortable-th count-col"
              @click="(e) => onHeaderClick(e, 'name_count')"
            >
              {{ $t('persons.columns.nameCount') }}
              <SortIndicator :primary="sortBy === 'name_count'" :secondary="sortBy2 === 'name_count'" :primary-dir="sortDir" :secondary-dir="sortDir2" />
            </th>
            <th
              v-if="isVisible('event_count')"
              class="sortable-th count-col"
              @click="(e) => onHeaderClick(e, 'event_count')"
            >
              {{ $t('persons.columns.eventCount') }}
              <SortIndicator :primary="sortBy === 'event_count'" :secondary="sortBy2 === 'event_count'" :primary-dir="sortDir" :secondary-dir="sortDir2" />
            </th>
            <th
              v-if="isVisible('relationship_count')"
              class="sortable-th count-col"
              @click="(e) => onHeaderClick(e, 'relationship_count')"
            >
              {{ $t('persons.columns.relationshipCount') }}
              <SortIndicator :primary="sortBy === 'relationship_count'" :secondary="sortBy2 === 'relationship_count'" :primary-dir="sortDir" :secondary-dir="sortDir2" />
            </th>
            <th
              v-if="isVisible('media_count')"
              class="sortable-th count-col"
              @click="(e) => onHeaderClick(e, 'media_count')"
            >
              {{ $t('persons.columns.mediaCount') }}
              <SortIndicator :primary="sortBy === 'media_count'" :secondary="sortBy2 === 'media_count'" :primary-dir="sortDir" :secondary-dir="sortDir2" />
            </th>
            <th
              v-if="isVisible('group_count')"
              class="sortable-th count-col"
              @click="(e) => onHeaderClick(e, 'group_count')"
            >
              {{ $t('persons.columns.groupCount') }}
              <SortIndicator :primary="sortBy === 'group_count'" :secondary="sortBy2 === 'group_count'" :primary-dir="sortDir" :secondary-dir="sortDir2" />
            </th>
            <th
              v-if="isVisible('task_count')"
              class="sortable-th count-col"
              @click="(e) => onHeaderClick(e, 'task_count')"
            >
              {{ $t('persons.columns.taskCount') }}
              <SortIndicator :primary="sortBy === 'task_count'" :secondary="sortBy2 === 'task_count'" :primary-dir="sortDir" :secondary-dir="sortDir2" />
            </th>
            <th
              v-if="isVisible('quality_count')"
              class="sortable-th count-col"
              @click="(e) => onHeaderClick(e, 'quality_count')"
            >
              {{ $t('persons.columns.qualityCount') }}
              <SortIndicator :primary="sortBy === 'quality_count'" :secondary="sortBy2 === 'quality_count'" :primary-dir="sortDir" :secondary-dir="sortDir2" />
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
              event_count: person.event_count,
              relationship_count: person.relationship_count,
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
            <td v-if="isVisible('display_id')" class="display-id-cell">{{ person.display_id ?? '' }}</td>
            <td v-if="isVisible('name')">
              <div class="name-cell">
                <AppAvatar :person-id="person.id" :given-name="person.given_name || ''" :surname="person.surname || ''" :preferred-name="person.preferred_name ?? null" :sex="(person.sex as 'M' | 'F' | 'U') || 'U'" />
                <router-link v-if="!embedded" :to="'/persons/' + person.id" class="person-link" @click.stop>
                  <PersonName :given-name="person.given_name" :preferred-name="person.preferred_name ?? null" :nickname="person.nickname ?? null" />
                  <span class="surname-after-name">
                    {{ ' ' + person.surname }}<span
                      v-if="showBirthSuffix(person)"
                      class="birth-suffix"
                    > ({{ bornAbbrev }} {{ person.birth_surname }})</span>
                  </span>
                </router-link>
                <span v-else>
                  <PersonName :given-name="person.given_name" :preferred-name="person.preferred_name ?? null" :nickname="person.nickname ?? null" />
                  <span class="surname-after-name">
                    {{ ' ' + person.surname }}<span
                      v-if="showBirthSuffix(person)"
                      class="birth-suffix"
                    > ({{ bornAbbrev }} {{ person.birth_surname }})</span>
                  </span>
                </span>
              </div>
            </td>
            <td v-if="isVisible('birth_date')" class="info-cell born-col">{{ person.birth_date || '' }}</td>
            <td v-if="isVisible('death_date')" class="info-cell born-col">{{ person.death_date || '' }}</td>
            <td v-if="isVisible('sex')" class="sex-cell">
              <span class="sex-badge" :class="'sex-' + (person.sex || 'U')">{{ sexLabel(person.sex) }}</span>
            </td>
            <td v-if="isVisible('name_count')" class="count-cell" :class="{ 'count-zero': person.name_count === 0 }">{{ person.name_count }}</td>
            <td v-if="isVisible('event_count')" class="count-cell" :class="{ 'count-zero': person.event_count === 0 }">{{ person.event_count }}</td>
            <td v-if="isVisible('relationship_count')" class="count-cell" :class="{ 'count-zero': person.relationship_count === 0 }">{{ person.relationship_count }}</td>
            <td v-if="isVisible('media_count')" class="count-cell" :class="{ 'count-zero': person.media_count === 0 }">{{ person.media_count }}</td>
            <td v-if="isVisible('group_count')" class="count-cell" :class="{ 'count-zero': person.group_count === 0 }">{{ person.group_count }}</td>
            <td v-if="isVisible('task_count')" class="count-cell" :class="{ 'count-zero': person.task_count === 0 }">{{ person.task_count }}</td>
            <td v-if="isVisible('quality_count')" class="count-cell" :class="{ 'count-zero': person.quality_count === 0, 'count-warn': person.quality_count > 0 }">{{ person.quality_count }}</td>
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

    <!-- Column Picker Modal -->
    <PersonsColumnPickerModal
      v-if="showColumnPicker"
      :visible="visibleColumns"
      :columns="ALL_COLUMNS"
      @toggle="onToggleColumn"
      @close="showColumnPicker = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed, h } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import PersonModal from '../components/modals/PersonModal.vue';
import PersonsColumnPickerModal from '../components/modals/PersonsColumnPickerModal.vue';
import { narratePersonRow } from '../utils/screenReaderNarration';
import PersonName from '../components/PersonName.vue';
import AppButton from '../components/ui/AppButton.vue';
import AppAvatar from '../components/ui/AppAvatar.vue';
import AppEmptyState from '../components/ui/AppEmptyState.vue';
import AppLoadingState from '../components/ui/AppLoadingState.vue';
import { useSelectedPersonStore } from '../stores/selectedPerson';
import { useToast } from '../composables/useToast';
import { usePagedList } from '../composables/usePagedList';
import { usePersonNameOptions } from '../stores/personNameOptions';
import {
  STORAGE_KEYS,
  getJSON,
  setJSON,
  PERSONS_DEFAULT_VISIBLE_COLUMNS,
  PERSONS_LOCKED_COLUMNS,
  type PersonsColumnKey,
} from '../utils/storage-keys';
const isStaticMode = import.meta.env.VITE_STATIC_MODE === 'true';

interface PersonListItem {
  id: string;
  sex: string;
  display_id: number | null;
  given_name: string;
  surname: string;
  preferred_name: string | null;
  nickname: string | null;
  birth_surname: string | null;
  birth_date: string | null;
  birth_place: string | null;
  death_date: string | null;
  death_place: string | null;
  name_count: number;
  event_count: number;
  relationship_count: number;
  media_count: number;
  group_count: number;
  task_count: number;
  quality_count: number;
}

const { t } = useI18n();
const toast = useToast();
const props = defineProps<{ embedded?: boolean }>();
const emit = defineEmits<{ select: [id: string] }>();
const router = useRouter();
const selectedPersonStore = useSelectedPersonStore();

type SortBy =
  | 'surname'
  | 'given_name'
  | 'birth_date'
  | 'display_id'
  | 'sex'
  | 'name_count'
  | 'event_count'
  | 'relationship_count'
  | 'media_count'
  | 'group_count'
  | 'task_count'
  | 'quality_count';

const ALL_COLUMNS: ReadonlyArray<{ key: PersonsColumnKey; labelKey: string; locked?: boolean }> = [
  { key: 'display_id',          labelKey: 'persons.idColumn' },
  { key: 'name',                labelKey: 'persons.columns.name', locked: true },
  { key: 'birth_date',          labelKey: 'persons.columns.birthDate' },
  { key: 'death_date',          labelKey: 'persons.columns.deathDate' },
  { key: 'sex',                 labelKey: 'persons.columns.sex' },
  { key: 'name_count',          labelKey: 'persons.columns.nameCount' },
  { key: 'event_count',         labelKey: 'persons.columns.eventCount' },
  { key: 'relationship_count',  labelKey: 'persons.columns.relationshipCount' },
  { key: 'media_count',         labelKey: 'persons.columns.mediaCount' },
  { key: 'group_count',         labelKey: 'persons.columns.groupCount' },
  { key: 'task_count',          labelKey: 'persons.columns.taskCount' },
  { key: 'quality_count',       labelKey: 'persons.columns.qualityCount' },
];

// Visible-columns state, persisted to localStorage. Locked columns are
// always force-included even if a stored value missed them (e.g. an
// older client that pre-dates the lock).
const visibleColumns = ref<PersonsColumnKey[]>(loadVisibleColumns());
function loadVisibleColumns(): PersonsColumnKey[] {
  const raw = getJSON<PersonsColumnKey[]>(STORAGE_KEYS.personsVisibleColumns, PERSONS_DEFAULT_VISIBLE_COLUMNS);
  const set = new Set(raw);
  for (const k of PERSONS_LOCKED_COLUMNS) set.add(k);
  // Preserve declared column order
  return ALL_COLUMNS.map(c => c.key).filter(k => set.has(k));
}
function persistVisibleColumns() {
  setJSON(STORAGE_KEYS.personsVisibleColumns, visibleColumns.value);
}
function isVisible(key: PersonsColumnKey): boolean {
  return visibleColumns.value.includes(key);
}
function onToggleColumn(key: PersonsColumnKey) {
  if (PERSONS_LOCKED_COLUMNS.includes(key)) return;
  if (isVisible(key)) {
    visibleColumns.value = visibleColumns.value.filter(k => k !== key);
  } else {
    // Re-derive in declared order so toggling on doesn't push the column
    // to the end.
    const target = new Set([...visibleColumns.value, key]);
    visibleColumns.value = ALL_COLUMNS.map(c => c.key).filter(k => target.has(k));
  }
  persistVisibleColumns();
}

const showColumnPicker = ref(false);

const {
  items: persons,
  total,
  loading,
  searchQuery,
  sortBy,
  sortDir,
  sortBy2,
  sortDir2,
  reload,
  toggleSort,
  clearSecondarySort,
  attachSentinel,
} = usePagedList<PersonListItem, SortBy>({
  defaultSortBy: 'surname',
  storageKey: 'persons',
  fetchPage: async (limit, offset, sortBy, sortDir, query, sortBy2, sortDir2) => {
    try {
      const result = await window.api.persons.listPage(
        limit,
        offset,
        sortBy,
        sortDir,
        query,
        sortBy2,
        sortDir2,
      ) as { persons: PersonListItem[]; total: number };
      return { items: result.persons, total: result.total };
    } catch (err) {
      console.error('[PersonsView] fetchPage failed:', err);
      toast.error(t('errors.loadFailed'));
      return { items: [], total: 0 };
    }
  },
});

const hasSecondarySort = computed(() => sortBy2.value !== null);

const showAddForm = ref(false);
const sentinel = ref<HTMLElement | null>(null);
watch(sentinel, (el) => attachSentinel(el));

// Display only — see plan birth-name-display-and-quality-check.
const personNameOptions = usePersonNameOptions();
const bornAbbrev = computed(() => t('common.bornAbbrev'));
function showBirthSuffix(p: PersonListItem): boolean {
  if (!personNameOptions.showBirthNameParenthetical) return false;
  const b = (p.birth_surname ?? '').trim();
  if (!b) return false;
  return b !== (p.surname ?? '').trim();
}

function onHeaderClick(e: MouseEvent, column: SortBy) {
  toggleSort(column, { shift: e.shiftKey });
}

function columnLabel(key: PersonsColumnKey | SortBy): string {
  // Map sortable column key to its display label.
  const map: Record<string, string> = {
    surname: t('persons.surname'),
    given_name: t('persons.givenNameColumn'),
    birth_date: t('persons.bornColumn'),
    death_date: t('persons.columns.deathDate'),
    display_id: t('persons.idColumn'),
    sex: t('persons.columns.sex'),
    name: t('persons.columns.name'),
    name_count: t('persons.columns.nameCount'),
    event_count: t('persons.columns.eventCount'),
    relationship_count: t('persons.columns.relationshipCount'),
    media_count: t('persons.columns.mediaCount'),
    group_count: t('persons.columns.groupCount'),
    task_count: t('persons.columns.taskCount'),
    quality_count: t('persons.columns.qualityCount'),
  };
  return map[key] ?? key;
}

function sexLabel(sex: string): string {
  if (sex === 'M') return t('persons.male');
  if (sex === 'F') return t('persons.female');
  return t('persons.sexUnknown');
}

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

// Local sort indicator. Renders a tiny "1" or "2" badge alongside the
// arrow so the user can see primary vs. secondary at a glance.
const SortIndicator = (props: { primary: boolean; secondary: boolean; primaryDir: 'asc' | 'desc'; secondaryDir: 'asc' | 'desc' }) => {
  if (props.primary) {
    return h('span', { class: 'sort-arrow' }, [
      props.primaryDir === 'asc' ? '▲' : '▼',
    ]);
  }
  if (props.secondary) {
    return h('span', { class: 'sort-arrow sort-arrow-secondary' }, [
      props.secondaryDir === 'asc' ? '▲' : '▼',
      h('sub', { class: 'sort-rank' }, '2'),
    ]);
  }
  return null;
};
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
/* Sticky table header is defined globally in shared.css `.data-table thead th`. */
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
.sort-arrow-secondary {
  opacity: 0.7;
}
.sort-rank {
  font-size: 0.7em;
  margin-left: 1px;
  vertical-align: super;
  line-height: 1;
}
.sort-status-pill {
  flex-shrink: 0;
  margin: 0 0 var(--space-sm) 0;
  padding: 4px 10px;
  background: var(--surface-hover);
  border-radius: var(--radius-full);
  font-size: var(--font-sm);
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  align-self: flex-start;
}
.sort-status-clear {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: var(--font-sm);
  padding: 0 var(--space-xs);
}
.sort-status-clear:hover {
  color: var(--text-primary);
}
.persons-list-footer {
  flex-shrink: 0;
  margin: 0;
  padding: var(--space-sm) 0 0 0;
  border-top: 1px solid var(--surface-border-subtle);
  text-align: center;
}
.actions-cell { width: 1px; text-align: right; white-space: nowrap; }
.display-id-col {
  width: 64px;
  text-align: right;
  white-space: nowrap;
}
.display-id-cell {
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
  font-size: var(--font-sm);
}
.name-cell { display: flex; align-items: center; gap: var(--space-sm); }
.surname-after-name { color: var(--text-primary); }
.info-cell { color: var(--text-muted); font-size: var(--font-sm); }
/* Lock the Born column to a width that fits a full ISO date (YYYY-MM-DD)
   on one line, so dates never wrap when the column is narrow. */
.born-col {
  width: 11ch;
  white-space: nowrap;
}
.sex-col {
  width: 4em;
}
.sex-cell { text-align: center; }
.count-col {
  width: 6em;
  text-align: right;
}
.count-cell {
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}
.count-cell.count-zero {
  color: var(--text-muted);
  opacity: 0.6;
}
.count-cell.count-warn {
  color: var(--warning-text, #b45309);
  font-weight: 600;
}
.birth-suffix {
  color: var(--text-muted);
  font-size: var(--font-sm);
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
