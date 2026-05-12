<template>
  <div class="search-view">
    <div class="search-header">
      <h2>{{ $t('search.title') }}</h2>
      <form class="search-form" @submit.prevent>
        <input
          v-model="inputQuery"
          type="text"
          :placeholder="$t('search.placeholder')"
          class="search-input"
          autofocus
        />
      </form>
    </div>

    <AppEmptyState v-if="!hasQuery" icon="🔍" :title="$t('search.emptyState')" />
    <AppEmptyState
      v-else-if="!loading && totalResults === 0"
      icon="🔍"
      :title="$t('search.noResults', { query: displayedQuery })"
    />

    <template v-else>
      <!-- Persons -->
      <section v-if="personsTotal > 0" class="result-section">
        <h3>{{ $t('nav.people') }} <span class="count">{{ personsTotal }}</span></h3>
        <table class="data-table">
          <thead>
            <tr>
              <th>{{ $t('common.name') }}</th>
              <th>{{ $t('persons.sex') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="p in persons"
              :key="p.id"
              v-narrate="() => narratePersonRow({
                given_name: p.given_name || '',
                surname: p.surname || '',
                sex: p.sex || 'U',
                event_count: 0,
                relationship_count: 0,
              }, t)"
              class="clickable-row"
              tabindex="0"
              role="button"
              :aria-label="$t('a11y.editItem', { item: ((p.given_name || '') + ' ' + (p.surname || '')).trim() })"
              @click="goToPerson(p)"
              @keydown.enter="goToPerson(p)"
              @keydown.space.prevent="goToPerson(p)"
              @keydown.down.prevent="focusNextRow($event)"
              @keydown.up.prevent="focusPrevRow($event)"
            >
              <!-- Display only — see plan birth-name-display-and-quality-check. -->
              <td><PersonName :given-name="p.given_name" :surname="p.surname" :preferred-name="p.preferred_name" :nickname="p.nickname" :birth-surname="p.birth_surname" :show-birth-name-parenthetical="personNameOptions.showBirthNameParenthetical" /></td>
              <td>{{ p.sex }}</td>
            </tr>
          </tbody>
        </table>
        <div ref="personsSentinel" class="scroll-sentinel"></div>
        <p class="count-label">
          {{ $t('search.showingPersons', { shown: persons.length, total: personsTotal }) }}
        </p>
      </section>

      <!-- Sources -->
      <section v-if="sourcesTotal > 0" class="result-section">
        <h3>{{ $t('nav.sources') }} <span class="count">{{ sourcesTotal }}</span></h3>
        <table class="data-table">
          <thead>
            <tr>
              <th>{{ $t('sources.sourceTitle') }}</th>
              <th>{{ $t('sources.author') }}</th>
              <th>{{ $t('common.type') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="s in sources"
              :key="s.id"
              v-narrate="() => narrateSourceRow({
                title: s.title || '',
                source_type: s.source_type || '',
                citation_count: 0,
              }, t)"
              class="clickable-row"
              tabindex="0"
              role="button"
              :aria-label="$t('a11y.editItem', { item: s.title || '—' })"
              @click="router.push(`/sources/${s.id}`)"
              @keydown.enter="router.push(`/sources/${s.id}`)"
              @keydown.space.prevent="router.push(`/sources/${s.id}`)"
              @keydown.down.prevent="focusNextRow($event)"
              @keydown.up.prevent="focusPrevRow($event)"
            >
              <td>{{ s.title || '—' }}</td>
              <td>{{ s.author || '—' }}</td>
              <td>{{ s.source_type ? $t('sourceTypes.' + s.source_type) : '—' }}</td>
            </tr>
          </tbody>
        </table>
        <div ref="sourcesSentinel" class="scroll-sentinel"></div>
        <p class="count-label">
          {{ $t('search.showingSources', { shown: sources.length, total: sourcesTotal }) }}
        </p>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import PersonName from '../components/PersonName.vue';
import AppEmptyState from '../components/ui/AppEmptyState.vue';
import { useSelectedPersonStore } from '../stores/selectedPerson';
import { narratePersonRow, narrateSourceRow } from '../utils/screenReaderNarration';
import { usePersonNameOptions } from '../stores/personNameOptions';
import { usePagedList } from '../composables/usePagedList';

const personNameOptions = usePersonNameOptions();

interface PersonRow {
  id: string;
  given_name: string;
  surname: string;
  preferred_name: string | null;
  nickname: string | null;
  birth_surname: string | null;
  sex: string;
}

interface SourceRow {
  id: string;
  title: string;
  author: string;
  source_type: string;
}

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const selectedStore = useSelectedPersonStore();

const inputQuery = ref('');
const displayedQuery = computed(() => inputQuery.value.trim());
const hasQuery = computed(() => displayedQuery.value.length > 0);

type PersonsSortBy = 'surname';
const {
  items: persons,
  total: personsTotal,
  searchQuery: personsQuery,
  loading: personsLoading,
  attachSentinel: attachPersonsSentinel,
} = usePagedList<PersonRow, PersonsSortBy>({
  defaultSortBy: 'surname',
  fetchPage: async (limit, offset, sortBy, sortDir, query) => {
    if (!query) return { items: [], total: 0 };
    if (!window.api) return { items: [], total: 0 };
    const result = await window.api.persons.listPage(limit, offset, sortBy, sortDir, query) as { persons: PersonRow[]; total: number };
    return { items: result.persons, total: result.total };
  },
});

type SourcesSortBy = 'title';
const {
  items: sources,
  total: sourcesTotal,
  searchQuery: sourcesQuery,
  loading: sourcesLoading,
  attachSentinel: attachSourcesSentinel,
} = usePagedList<SourceRow, SourcesSortBy>({
  defaultSortBy: 'title',
  fetchPage: async (limit, offset, sortBy, sortDir, query) => {
    if (!query) return { items: [], total: 0 };
    if (!window.api) return { items: [], total: 0 };
    const result = await window.api.sources.listPage(limit, offset, sortBy, sortDir, query) as { items: SourceRow[]; total: number };
    return { items: result.items, total: result.total };
  },
});

const personsSentinel = ref<HTMLElement | null>(null);
const sourcesSentinel = ref<HTMLElement | null>(null);
watch(personsSentinel, (el) => attachPersonsSentinel(el));
watch(sourcesSentinel, (el) => attachSourcesSentinel(el));

const totalResults = computed(() => personsTotal.value + sourcesTotal.value);
const loading = computed(() => personsLoading.value || sourcesLoading.value);

watch(inputQuery, (q) => {
  const trimmed = q.trim();
  personsQuery.value = trimmed;
  sourcesQuery.value = trimmed;
  router.replace({ path: '/search', query: trimmed ? { q: trimmed } : {} });
});

watch(
  () => route.query.q,
  (q) => {
    if (typeof q === 'string' && q !== inputQuery.value) {
      inputQuery.value = q;
    }
  },
);

function focusNextRow(e: KeyboardEvent): void {
  const row = (e.target as HTMLElement).nextElementSibling as HTMLElement | null;
  if (row?.matches('tr[tabindex]')) row.focus();
}
function focusPrevRow(e: KeyboardEvent): void {
  const row = (e.target as HTMLElement).previousElementSibling as HTMLElement | null;
  if (row?.matches('tr[tabindex]')) row.focus();
}

function goToPerson(p: PersonRow) {
  selectedStore.set(p.id);
  router.push(`/persons/${p.id}`);
}

onMounted(() => {
  const q = route.query.q;
  if (typeof q === 'string' && q) {
    inputQuery.value = q;
  }
});
</script>

<style scoped>
.search-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.search-header {
  margin-bottom: var(--space-lg);
}
.search-form {
  display: flex;
  gap: var(--space-sm);
  margin-top: var(--space-md);
}
.search-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-md);
  font-size: var(--font-base);
  font-family: inherit;
  background: var(--surface);
  color: var(--text-primary);
}
.search-input:focus {
  outline: none;
  border-color: var(--accent);
}
.result-section {
  margin-bottom: var(--space-2xl);
}
.result-section h3 {
  font-size: var(--font-base);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-bottom: var(--space-sm);
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}
.count {
  background: var(--surface-hover);
  color: var(--text-secondary);
  padding: 1px 7px;
  border-radius: var(--radius-full);
  font-size: var(--font-xs);
  font-weight: 500;
}
.count-label {
  margin: var(--space-sm) 0 0 0;
  padding: var(--space-sm) 0 0 0;
  border-top: 1px solid var(--surface-border-subtle);
  text-align: center;
}
</style>
