<template>
  <div>
    <SectionEmpty v-if="persons.length === 0" :message="$t('empty.persons')" />
    <table v-else class="data-table">
      <thead>
        <tr>
          <th>{{ $t('persons.givenName') }}</th>
          <th>{{ $t('persons.sex') }}</th>
          <th>{{ $t('places.eventCount') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in persons" :key="p.id" class="clickable-row" @click="$router.push('/visualisering/' + p.id)">
          <td class="person-cell">
            <AppAvatar :person-id="p.id" :given-name="p.given_name" :surname="p.surname" :sex="p.sex" size="sm" />
            <router-link :to="'/visualisering/' + p.id" class="person-link" @click.stop>
              {{ [p.given_name, p.surname].filter(Boolean).join(' ') || '—' }}
            </router-link>
          </td>
          <td><span :class="['sex-badge', 'sex-' + p.sex]">{{ p.sex }}</span></td>
          <td>{{ p.event_count }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import AppAvatar from './ui/AppAvatar.vue';
import SectionEmpty from './ui/SectionEmpty.vue';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface PersonAtPlace {
  id: string;
  sex: string;
  given_name: string;
  surname: string;
  event_count: number;
}

const props = defineProps<{ placeId: string }>();
const persons = ref<PersonAtPlace[]>([]);

async function load() {
  persons.value = (await window.api.places.getPersons(props.placeId)) as PersonAtPlace[];
}

watch(() => props.placeId, () => load(), { immediate: true });

defineExpose({ reload: load });
</script>

<style scoped>
.person-cell { display: flex; align-items: center; gap: var(--space-xs); }
</style>
