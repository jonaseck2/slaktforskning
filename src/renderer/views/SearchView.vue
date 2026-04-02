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
              @click="router.push(`/persons/${p.id}`)"
            >
              <td>{{ [p.given_name, p.surname].filter(Boolean).join(' ') || '—' }}</td>
              <td>{{ p.sex }}</td>
              <td>{{ p.living ? $t('common.yes') : $t('common.no') }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- Families -->
      <section v-if="families.length > 0" class="result-section">
        <h3>{{ $t('nav.families') }} <span class="count">{{ families.length }}</span></h3>
        <table class="data-table">
          <thead>
            <tr>
              <th>{{ $t('families.partnerA') }}</th>
              <th>{{ $t('families.partnerB') }}</th>
              <th>{{ $t('families.unionType') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="f in families"
              :key="f.id"
              class="clickable-row"
              @click="router.push(`/families/${f.id}`)"
            >
              <td>{{ [f.partner_a_given_name, f.partner_a_surname].filter(Boolean).join(' ') || '—' }}</td>
              <td>{{ [f.partner_b_given_name, f.partner_b_surname].filter(Boolean).join(' ') || '—' }}</td>
              <td>{{ $t('unionTypes.' + f.union_type) }}</td>
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
              @click="router.push(`/sources/${s.id}`)"
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

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface PersonResult {
  id: string;
  given_name: string;
  surname: string;
  sex: string;
  living: boolean;
}

interface FamilyResult {
  id: string;
  union_type: string;
  partner_a_given_name: string;
  partner_a_surname: string;
  partner_b_given_name: string;
  partner_b_surname: string;
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

const inputQuery = ref('');
const displayedQuery = ref('');
const searched = ref(false);
const persons = ref<PersonResult[]>([]);
const families = ref<FamilyResult[]>([]);
const sources = ref<SourceResult[]>([]);

const totalResults = computed(() => persons.value.length + families.value.length + sources.value.length);

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
  const [p, f, s] = await Promise.all([
    window.api.persons.search(q) as Promise<PersonResult[]>,
    window.api.families.search(q) as Promise<FamilyResult[]>,
    window.api.sources.search(q) as Promise<SourceResult[]>,
  ]);
  persons.value = p;
  families.value = f;
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
  font-size: 14px;
  font-family: inherit;
}
.search-input:focus {
  outline: none;
  border-color: #2c3e50;
}
button {
  background: #2c3e50;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}
button:hover {
  opacity: 0.9;
}
.empty {
  color: #999;
  padding: 40px;
  text-align: center;
}
.result-section {
  margin-bottom: 32px;
}
.result-section h3 {
  font-size: 14px;
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
  font-size: 12px;
  font-weight: 500;
}
.data-table {
  width: 100%;
  border-collapse: collapse;
}
.data-table th,
.data-table td {
  padding: 8px 12px;
  border-bottom: 1px solid #ddd;
  text-align: left;
}
.data-table th {
  background: #eee;
  font-weight: 600;
  font-size: 13px;
}
.clickable-row {
  cursor: pointer;
}
.clickable-row:hover {
  background: #f0f4ff;
}
</style>
