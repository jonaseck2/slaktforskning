<template>
  <div v-if="rels.length === 0" class="empty-hint">{{ $t('personDetail.noRelationships') }}</div>
  <table v-else class="data-table">
    <thead>
      <tr>
        <th>{{ $t('common.type') }}</th>
        <th>{{ $t('common.name') }}</th>
        <th>{{ $t('relationshipDetail.subtype') }}</th>
        <th class="actions-cell">{{ $t('common.actions') }}</th>
      </tr>
    </thead>
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
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { formatFullName, resolvePersonDisplayName } from '../utils/nameUtils';
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

  const enriched: PersonRelRow[] = [];
  for (const r of rawRels) {
    const otherId = r.person1_id === props.personId ? r.person2_id : r.person1_id;
    let otherName = t('common.unknown');
    let otherGivenName = '';
    let otherSurname = '';
    let otherSex: 'M' | 'F' | 'U' = 'U';
    if (otherId) {
      otherName = await resolvePersonDisplayName(otherId, t('common.unknown'));
      try {
        const otherPerson = await window.api.persons.get(otherId) as { sex?: string; given_name?: string; surname?: string } | null;
        if (otherPerson) {
          otherSex = (otherPerson.sex as 'M' | 'F' | 'U') || 'U';
          otherGivenName = otherPerson.given_name || '';
          otherSurname = otherPerson.surname || '';
        }
      } catch { /* ignore */ }
    }

    let typeLabel = t('relTypes.' + r.type);
    if (r.type === 'parent_child') {
      typeLabel = r.person1_id === props.personId ? t('relTypes.child') : t('relTypes.parent');
    }

    enriched.push({
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
    });
  }
  rels.value = enriched;
}

async function remove(id: string) {
  await window.api.relationships.delete(id);
  await load();
  emit('deleted');
}

defineExpose({ reload: load });

watch(() => props.personId, load, { immediate: true });
</script>

<style scoped>
.type-badge {
  background: var(--color-bg-subtle);
  color: var(--color-text-muted);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: var(--font-xs);
}
.person-cell { display: flex; align-items: center; gap: var(--space-xs); }
.actions-cell { width: 1px; text-align: right; white-space: nowrap; }
</style>
