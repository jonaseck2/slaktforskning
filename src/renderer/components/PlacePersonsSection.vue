<template>
  <div>
    <SectionEmpty
      v-if="persons.length === 0"
      purpose-key="onboarding.empty.placePersons.purpose"
      secondary-hint-key="onboarding.empty.placePersons.hint"
    />
    <table v-else class="data-table">
      <thead>
        <tr>
          <th>{{ $t('persons.givenName') }}</th>
          <th>{{ $t('persons.sex') }}</th>
          <th>{{ $t('places.yearsHeader') }}</th>
          <th>{{ $t('places.eventCount') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in persons" :key="p.id" class="clickable-row" @click="$router.push('/persons/' + p.id)">
          <td class="person-cell" :title="[p.given_name, p.surname].filter(Boolean).join(' ') || ''">
            <AppAvatar :person-id="p.id" :given-name="p.given_name" :surname="p.surname" :sex="p.sex" size="sm" />
            <span class="person-link person-name-text">{{ [p.given_name, p.surname].filter(Boolean).join(' ') || '—' }}</span>
          </td>
          <td class="sex-cell"><span :class="['sex-badge', 'sex-' + p.sex]">{{ p.sex }}</span></td>
          <td class="years-cell">{{ formatYears(p.first_year, p.last_year) }}</td>
          <td class="count-cell">{{ p.event_count }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import AppAvatar from './ui/AppAvatar.vue';
import SectionEmpty from './ui/SectionEmpty.vue';
import { useEntityData } from '../composables/useEntityData';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface PersonAtPlace {
  id: string;
  sex: string;
  given_name: string;
  surname: string;
  event_count: number;
  first_year: string | null;
  last_year: string | null;
}

const props = defineProps<{ placeId: string }>();

const idRef = computed(() => props.placeId ?? null);
const { data, reload } = useEntityData<PersonAtPlace[]>(idRef, async (id) => {
  return (await window.api.places.getPersons(id)) as PersonAtPlace[];
});
const persons = computed(() => data.value ?? []);

function formatYears(first: string | null, last: string | null): string {
  if (!first && !last) return '';
  if (first === last) return first ?? '';
  return `${first ?? '?'}–${last ?? '?'}`;
}

defineExpose({ reload });
</script>

<style scoped>
.person-cell {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.person-name-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.sex-cell { width: 1px; max-width: none; white-space: nowrap; }
.years-cell { font-variant-numeric: tabular-nums; white-space: nowrap; width: 1px; max-width: none; }
.count-cell { width: 1px; max-width: none; white-space: nowrap; text-align: right; }
</style>
