<template>
  <div>
    <div class="header">
      <h2>{{ $t('persons.title') }}</h2>
      <div class="header-actions">
        <button class="btn-add" @click="showAddForm = true">{{ $t('persons.addPerson') }}</button>
      </div>
    </div>

    <div v-if="persons.length === 0 && !loading" class="empty">
      {{ $t('persons.emptyState') }}
    </div>

    <template v-else>
      <p class="count-label">
        {{ $t('persons.showingOf', { shown: persons.length, total }) }}
      </p>
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
            class="clickable-row"
            @click="goToDetail(person)"
          >
            <td>
              <router-link :to="'/persons/' + person.id" class="person-link" @click.stop>
                <PersonName :given-name="person.given_name" :preferred-name="null" :nickname="null" />
              </router-link>
            </td>
            <td>{{ person.surname }}</td>
            <td><span :class="'sex-badge sex-' + person.sex">{{ person.sex }}</span></td>
            <td>{{ person.birth_date ?? '' }}</td>
            <td>{{ person.birth_place ?? '' }}</td>
            <td>{{ person.death_date ?? '' }}</td>
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
    <div v-if="showAddForm" class="modal-overlay" @click.self="showAddForm = false">
      <div class="modal">
        <h3>{{ $t('persons.addPerson') }}</h3>
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
          <div class="modal-actions">
            <button type="button" class="btn-cancel" @click="showAddForm = false">{{ $t('common.cancel') }}</button>
            <button type="submit">{{ $t('persons.addPerson') }}</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onActivated, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import PersonName from '../components/PersonName.vue';
import { useFocusStore } from '../stores/focus';
import { fullNameParts } from '../utils/nameUtils';
import { useDataVersionStore } from '../stores/dataVersion';
const dataVersionStore = useDataVersionStore();
let loadedVersion = -1;

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

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
const router = useRouter();
const focusStore = useFocusStore();

const persons = ref<PersonListItem[]>([]);
const total = ref(0);
const offset = ref(0);
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
    // Trigger ~50 rows (~40px each) before the sentinel enters the viewport
    { rootMargin: '2000px 0px' }
  );
  observer.observe(el);
});

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') showAddForm.value = false;
}
onMounted(() => window.addEventListener('keydown', handleKeydown));
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
  if (observer) observer.disconnect();
});

const form = reactive({
  given_name: '',
  surname: '',
  sex: 'U',
  notes: '',
});

async function load() {
  if (!window.api) return;
  loading.value = true;
  try {
    const result = await window.api.persons.listPage(PAGE_SIZE, 0) as { persons: PersonListItem[]; total: number };
    persons.value = result.persons;
    total.value = result.total;
    offset.value = PAGE_SIZE;
  } catch (err) {
    console.error('[PersonsView] load failed:', err);
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  if (!window.api || loading.value) return;
  loading.value = true;
  try {
    const result = await window.api.persons.listPage(PAGE_SIZE, offset.value) as { persons: PersonListItem[]; total: number };
    persons.value = [...persons.value, ...result.persons];
    total.value = result.total;
    offset.value += PAGE_SIZE;
  } catch (err) {
    console.error('[PersonsView] loadMore failed:', err);
  } finally {
    loading.value = false;
  }
}

async function addPerson() {
  if (!window.api) return;
  try {
    await window.api.persons.create({
      given_name: form.given_name,
      surname: form.surname,
      sex: form.sex,
      notes: form.notes,
    });
    showAddForm.value = false;
    form.given_name = '';
    form.surname = '';
    form.sex = 'U';
    form.notes = '';
    await load();
  } catch (err) {
    console.error('[PersonsView] addPerson failed:', err);
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
  }
}

function goToDetail(person: PersonListItem) {
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
.sex-badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
}
.sex-M { background: #dbeafe; color: #1e40af; }
.sex-F { background: #fce7f3; color: #9d174d; }
.sex-U { background: #f3f4f6; color: #6b7280; }
.radio-group { display: flex; gap: 16px; margin-top: 4px; }
.radio-label { display: flex; flex-direction: row; align-items: center; gap: 6px; font-weight: normal; }
.actions-cell { width: 1px; text-align: right; white-space: nowrap; }
</style>
