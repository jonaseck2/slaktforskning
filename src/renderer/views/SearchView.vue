<template>
  <div>
    <div class="search-header">
      <h2>{{ $t('search.title') }}</h2>
      <form class="search-form" @submit.prevent="runSearch">
        <input
          v-model="inputQuery"
          type="text"
          :placeholder="$t('search.placeholder')"
          class="search-input"
          autofocus
        />
        <button type="submit">{{ $t('search.button') }}</button>
      </form>
    </div>

    <div v-if="!searched" class="empty">{{ $t('search.emptyState') }}</div>
    <div v-else-if="totalResults === 0" class="empty">{{ $t('search.noResults', { query: displayedQuery }) }}</div>

    <template v-else>
      <!-- Persons -->
      <section v-if="persons.length > 0" class="result-section">
        <h3>{{ $t('nav.persons') }} <span class="count">{{ persons.length }}</span></h3>
        <table class="data-table">
          <thead>
            <tr>
              <th>{{ $t('common.name') }}</th>
              <th>{{ $t('persons.sex') }}</th>
              <th>{{ $t('persons.living') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="p in persons"
              :key="p.id"
              class="clickable-row"
              tabindex="0"
              role="button"
              :aria-label="$t('a11y.editItem', { item: ((p.given_name || '') + ' ' + (p.surname || '')).trim() })"
              @click="goToPerson(p)"
              @keydown.enter="goToPerson(p)"
              @keydown.space.prevent="goToPerson(p)"
            >
              <td><PersonName :given-name="p.given_name" :surname="p.surname" :preferred-name="p.preferred_name" :nickname="p.nickname" /></td>
              <td>{{ p.sex }}</td>
              <td>{{ p.living ? $t('common.yes') : $t('common.no') }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- Relationships -->
      <section v-if="relationships.length > 0" class="result-section">
        <h3>{{ $t('nav.relationships') }} <span class="count">{{ relationships.length }}</span></h3>
        <table class="data-table">
          <thead>
            <tr>
              <th>{{ $t('common.type') }}</th>
              <th>{{ $t('relationships.person1') }}</th>
              <th>{{ $t('relationships.person2') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in relationships"
              :key="r.id"
              class="clickable-row"
              tabindex="0"
              role="button"
              :aria-label="$t('a11y.editItem', { item: $t('relTypes.' + r.type) })"
              @click="router.push(`/relationships/${r.id}`)"
              @keydown.enter="router.push(`/relationships/${r.id}`)"
              @keydown.space.prevent="router.push(`/relationships/${r.id}`)"
            >
              <td>{{ $t('relTypes.' + r.type) }}</td>
              <td><PersonName :given-name="r.person1_given_name" :surname="r.person1_surname" :preferred-name="r.person1_preferred_name ?? null" :nickname="r.person1_nickname ?? null" /></td>
              <td><PersonName :given-name="r.person2_given_name" :surname="r.person2_surname" :preferred-name="r.person2_preferred_name ?? null" :nickname="r.person2_nickname ?? null" /></td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- Sources -->
      <section v-if="sources.length > 0" class="result-section">
        <h3>{{ $t('nav.sources') }} <span class="count">{{ sources.length }}</span></h3>
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
              class="clickable-row"
              tabindex="0"
              role="button"
              :aria-label="$t('a11y.editItem', { item: s.title || '—' })"
              @click="router.push(`/sources/${s.id}`)"
              @keydown.enter="router.push(`/sources/${s.id}`)"
              @keydown.space.prevent="router.push(`/sources/${s.id}`)"
            >
              <td>{{ s.title || '—' }}</td>
              <td>{{ s.author || '—' }}</td>
              <td>{{ s.source_type ? $t('sourceTypes.' + s.source_type) : '—' }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import PersonName from '../components/PersonName.vue';
import { useFocusStore } from '../stores/focus';
import { fullNameParts } from '../utils/nameUtils';

interface PersonResult {
  id: string;
  given_name: string;
  surname: string;
  preferred_name: string | null;
  nickname: string | null;
  sex: string;
  living: boolean;
}

interface RelationshipResult {
  id: string;
  type: string;
  person1_given_name: string;
  person1_surname: string;
  person1_preferred_name?: string | null;
  person1_nickname?: string | null;
  person2_given_name: string;
  person2_surname: string;
  person2_preferred_name?: string | null;
  person2_nickname?: string | null;
}

interface SourceResult {
  id: string;
  title: string;
  author: string;
  source_type: string;
}

useI18n();
const route = useRoute();
const router = useRouter();
const focusStore = useFocusStore();

const inputQuery = ref('');
const displayedQuery = ref('');
const searched = ref(false);
const persons = ref<PersonResult[]>([]);
const relationships = ref<RelationshipResult[]>([]);
const sources = ref<SourceResult[]>([]);

const totalResults = computed(() => persons.value.length + relationships.value.length + sources.value.length);

function goToPerson(p: PersonResult) {
  const name = fullNameParts(p.given_name ?? null, p.surname ?? null, p.preferred_name ?? null, p.nickname ?? null).map(pt => pt.text).join('');
  focusStore.set(p.id, name);
  router.push(`/persons/${p.id}`);
}

async function runSearch() {
  const q = inputQuery.value.trim();
  if (!q) return;
  router.replace({ path: '/search', query: { q } });
  await search(q);
}

async function search(q: string) {
  if (!q || !window.api) return;
  displayedQuery.value = q;
  searched.value = true;
  const [p, r, s] = await Promise.all([
    window.api.persons.search(q) as Promise<PersonResult[]>,
    window.api.relationships.search(q) as Promise<RelationshipResult[]>,
    window.api.sources.search(q) as Promise<SourceResult[]>,
  ]);
  persons.value = p;
  relationships.value = r;
  sources.value = s;
}

watch(
  () => route.query.q,
  (q) => {
    if (typeof q === 'string' && q) {
      inputQuery.value = q;
      search(q);
    }
  }
);

onMounted(() => {
  const q = route.query.q;
  if (typeof q === 'string' && q) {
    inputQuery.value = q;
    search(q);
  }
});
</script>

<style scoped>
.search-header {
  margin-bottom: 24px;
}
.search-form {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.search-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: var(--font-base);
  font-family: inherit;
}
.search-input:focus {
  outline: none;
  border-color: var(--color-primary);
}
button {
  background: var(--color-primary);
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: var(--font-base);
}
button:hover {
  opacity: 0.9;
}
.result-section {
  margin-bottom: 32px;
}
.result-section h3 {
  font-size: var(--font-base);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #666;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.count {
  background: #e0e0e0;
  color: #555;
  padding: 1px 7px;
  border-radius: 10px;
  font-size: var(--font-xs);
  font-weight: 500;
}
</style>
