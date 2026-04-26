<template>
  <div class="persons-view-content">
    <div v-if="!embedded" class="header">
      <h2>{{ $t('nav.people') }}</h2>
      <div class="header-actions">
        <AppButton v-if="!isStaticMode" variant="soft" @click="showAddForm = true">+ {{ $t('persons.addPerson') }}</AppButton>
      </div>
    </div>

    <p v-if="total > 0 && filter !== 'duplicates'" class="count-label">
      {{ $t('persons.showingOf', { shown: persons.length, total }) }}
    </p>

    <FilterChips :options="filterOptions" :model-value="filter" @update:model-value="setFilter" />

    <template v-if="loading && persons.length === 0">
      <AppLoadingState :rows="5" />
    </template>

    <AppEmptyState
      v-else-if="persons.length === 0 && !loading"
      icon="👤"
      :title="filter === 'unsourced' ? $t('persons.allSourced') : $t('empty.persons')"
      :description="filter === 'all' ? $t('persons.emptyHint') : ''"
      :action-label="!isStaticMode && filter === 'all' ? $t('empty.addPerson') : ''"
      @action="showAddForm = true"
    />

    <template v-else>
      <table class="data-table">
        <thead>
          <tr>
            <th>{{ $t('persons.givenName') }}</th>
            <th>{{ $t('persons.surname') }}</th>
            <th>{{ $t('persons.sex') }}</th>
            <th>{{ $t('persons.info') }}</th>
            <th v-if="!isStaticMode" class="actions-cell"></th>
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
            <td v-if="!isStaticMode" class="actions-cell">
              <AppButton
                variant="ghost"
                size="sm"
                :aria-label="$t('a11y.deleteItem', { item: ((person.given_name || '') + ' ' + (person.surname || '')).trim() })"
                @click.stop="removePerson(person.id)"
              >✕</AppButton>
            </td>
          </tr>
        </tbody>
      </table>

      <div ref="sentinel" class="scroll-sentinel"></div>
    </template>

    <!-- Add Person Modal -->
    <PersonModal v-if="showAddForm" mode="standalone" @cancel="showAddForm = false" @saved="onPersonAdded" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onActivated, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import PersonModal from '../components/modals/PersonModal.vue';
import { narratePersonRow } from '../utils/screenReaderNarration';
import PersonName from '../components/PersonName.vue';
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
const isStaticMode = import.meta.env.VITE_STATIC_MODE === 'true';
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
const filter = ref<'all' | 'unsourced'>('all');

const filterOptions = computed(() => [
  { value: 'all', label: t('persons.filterAll') },
  { value: 'unsourced', label: t('persons.filterUnsourced') },
]);

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
  const val = f as 'all' | 'unsourced';
  if (filter.value === val) return;
  filter.value = val;
  load();
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
