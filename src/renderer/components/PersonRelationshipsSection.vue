<template>
  <div v-if="rels.length === 0" class="empty-hint">{{ $t('personDetail.noRelationships') }}</div>
  <table v-else class="data-table">
    <tbody>
      <tr
        v-for="rel in rels"
        :key="rel.id"
        class="clickable-row"
        tabindex="0"
        role="button"
        :aria-label="$t('a11y.editItem', { item: rel.otherName })"
        @click="router.push('/relationships/' + rel.id)"
        @keydown.enter="router.push('/relationships/' + rel.id)"
        @keydown.space.prevent="router.push('/relationships/' + rel.id)"
      >
        <td><span class="type-badge">{{ rel.typeLabel }}</span></td>
        <td class="person-cell">
          <AppAvatar v-if="rel.otherId" :given-name="rel.otherGivenName" :surname="rel.otherSurname" :sex="rel.otherSex" size="sm" />
          <router-link v-if="rel.otherId" :to="'/persons/' + rel.otherId" class="person-link" @click.stop>
            {{ rel.otherName }}
          </router-link>
          <span v-else>{{ rel.otherName }}</span>
        </td>
        <td>{{ rel.subtypeLabel || '—' }}</td>
        <td class="actions-cell">
          <button class="btn-sm btn-delete" @click.stop="remove(rel.id)">✕</button>
        </td>
      </tr>
    </tbody>
  </table>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { formatFullName } from '../utils/nameUtils';
import AppAvatar from './ui/AppAvatar.vue';

interface PersonRelRow {
  id: string;
  type: string;
  person1_id: string | null;
  person2_id: string | null;
  subtype: string | null;
  otherId: string | null;
  otherName: string;
  otherGivenName: string;
  otherSurname: string;
  otherSex: 'M' | 'F' | 'U';
  typeLabel: string;
  subtypeLabel: string;
}

const props = defineProps<{ personId: string }>();
const emit = defineEmits<{ deleted: [] }>();

const { t } = useI18n();
const router = useRouter();
const rels = ref<PersonRelRow[]>([]);

function getSubtypeLabel(type: string, subtype: string | null): string {
  if (!subtype) return '';
  if (type === 'couple') return t('coupleSubtypes.' + subtype);
  if (type === 'parent_child') return t('parentChildSubtypes.' + subtype);
  return subtype;
}

async function load() {
  const rawRels = (await window.api.relationships.getForPerson(props.personId)) as Array<{
    id: string;
    type: string;
    person1_id: string | null;
    person2_id: string | null;
    subtype: string | null;
  }>;

  const enriched = await Promise.all(rawRels.map(async (r) => {
    const otherId = r.person1_id === props.personId ? r.person2_id : r.person1_id;
    let otherName = t('common.unknown');
    let otherGivenName = '';
    let otherSurname = '';
    let otherSex: 'M' | 'F' | 'U' = 'U';
    if (otherId) {
      try {
        const [person, names] = await Promise.all([
          window.api.persons.get(otherId) as Promise<{ sex?: string } | null>,
          window.api.persons.getNames(otherId) as Promise<Array<{ given_name: string | null; surname: string | null; preferred_name: string | null; nickname: string | null; name_prefix: string | null; name_suffix: string | null; sort_order: number }>>,
        ]);
        if (person) {
          otherSex = (person.sex as 'M' | 'F' | 'U') || 'U';
        }
        if (names.length > 0) {
          const primary = [...names].sort((a, b) => a.sort_order - b.sort_order)[0];
          otherGivenName = primary.given_name || '';
          otherSurname = primary.surname || '';
          otherName = formatFullName(primary) || t('common.unknown');
        }
      } catch { /* ignore */ }
    }

    let typeLabel = t('relTypes.' + r.type);
    if (r.type === 'parent_child') {
      typeLabel = r.person1_id === props.personId ? t('relTypes.child') : t('relTypes.parent');
    }

    return {
      id: r.id,
      type: r.type,
      person1_id: r.person1_id,
      person2_id: r.person2_id,
      subtype: r.subtype,
      otherId,
      otherName,
      otherGivenName,
      otherSurname,
      otherSex,
      typeLabel,
      subtypeLabel: getSubtypeLabel(r.type, r.subtype),
    } as PersonRelRow;
  }));
  rels.value = enriched;
}

async function remove(id: string) {
  await window.api.relationships.delete(id);
  await load();
  emit('deleted');
}

defineExpose({ reload: load, count: computed(() => rels.value.length) });

watch(() => props.personId, load, { immediate: true });
</script>

<style scoped>
.type-badge {
  color: var(--text-muted);
  font-size: var(--font-xs);
}
.person-cell { display: flex; align-items: center; gap: var(--space-xs); }
.actions-cell { width: 1px; text-align: right; white-space: nowrap; }
</style>
