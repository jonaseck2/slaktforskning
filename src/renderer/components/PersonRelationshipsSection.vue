<template>
  <SectionEmpty v-if="rows.length === 0" :message="$t('empty.relationships')" />
  <RelationshipsList v-else :rows="rows" @delete="askRemove" @select="openEdit" />

  <ConfirmModal
    :visible="!!pendingDelete"
    :title="$t('relationships.removeConfirmTitle')"
    :messages="confirmMessages"
    tone="danger"
    icon="⚠️"
    :confirm-label="$t('relationships.removeConfirmContinue')"
    @cancel="pendingDelete = null"
    @confirm="confirmRemove"
  />

  <RelationshipModal
    v-if="editingRelationship"
    :editing-relationship="editingRelationship"
    mode="standalone"
    @cancel="closeEdit"
    @close="closeEdit"
    @saved="onSaved"
  />
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import RelationshipsList, { type RelationshipListRow } from './RelationshipsList.vue';
import SectionEmpty from './ui/SectionEmpty.vue';
import ConfirmModal from './ConfirmModal.vue';
import RelationshipModal from './modals/RelationshipModal.vue';
import { formatFullName, pickDisplayedName } from '../utils/nameUtils';
import { useEntityData } from '../composables/useEntityData';

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
  otherPreferredName: string | null;
  otherNickname: string | null;
  otherSex: 'M' | 'F' | 'U';
  typeLabel: string;
  subtypeLabel: string;
}

const props = defineProps<{ personId: string }>();
const emit = defineEmits<{ deleted: [] }>();

const { t } = useI18n();

function getSubtypeLabel(type: string, subtype: string | null): string {
  if (!subtype) return '';
  if (type === 'couple') return t('coupleSubtypes.' + subtype);
  if (type === 'parent_child') return t('parentChildSubtypes.' + subtype);
  return subtype;
}

const idRef = computed(() => props.personId ?? null);
const { data: relsData, reload } = useEntityData<PersonRelRow[]>(idRef, async (personId) => {
  const rawRels = (await window.api.relationships.getForPerson(personId)) as Array<{
    id: string;
    type: string;
    person1_id: string | null;
    person2_id: string | null;
    subtype: string | null;
  }>;

  return Promise.all(rawRels.map(async (r) => {
    const otherId = r.person1_id === personId ? r.person2_id : r.person1_id;
    let otherName = t('common.unknown');
    let otherGivenName = '';
    let otherSurname = '';
    let otherPreferredName: string | null = null;
    let otherNickname: string | null = null;
    let otherSex: 'M' | 'F' | 'U' = 'U';
    if (otherId) {
      try {
        const [person, names, events] = await Promise.all([
          window.api.persons.get(otherId) as Promise<{ sex?: string } | null>,
          window.api.persons.getNames(otherId) as Promise<Array<{ id: string; given_name: string | null; surname: string | null; preferred_name: string | null; nickname: string | null; name_prefix: string | null; name_suffix: string | null; sort_order: number; name_type: string; date_from: string | null }>>,
          window.api.events.forPerson(otherId) as Promise<Array<{ event_type: string; date_value: string | null }>>,
        ]);
        if (person) {
          otherSex = (person.sex as 'M' | 'F' | 'U') || 'U';
        }
        if (names.length > 0) {
          const primary = pickDisplayedName(names, events) ?? names[0];
          otherGivenName = primary.given_name || '';
          otherSurname = primary.surname || '';
          otherPreferredName = primary.preferred_name;
          otherNickname = primary.nickname;
          otherName = formatFullName(primary) || t('common.unknown');
        }
      } catch { /* ignore */ }
    }

    let typeLabel = t('relTypes.' + r.type);
    if (r.type === 'parent_child') {
      typeLabel = r.person1_id === personId ? t('relTypes.child') : t('relTypes.parent');
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
      otherPreferredName,
      otherNickname,
      otherSex,
      typeLabel,
      subtypeLabel: getSubtypeLabel(r.type, r.subtype),
    } as PersonRelRow;
  }));
});
const rels = computed(() => relsData.value ?? []);

const rows = computed<RelationshipListRow[]>(() =>
  rels.value.map(r => ({
    id: r.id,
    typeLabel: r.typeLabel,
    subtypeLabel: r.subtypeLabel || null,
    persons: [
      {
        id: r.otherId,
        givenName: r.otherGivenName,
        surname: r.otherSurname,
        preferredName: r.otherPreferredName,
        nickname: r.otherNickname,
        sex: r.otherSex,
      },
    ],
    ariaLabel: t('a11y.editItem', { item: r.otherName }),
  }))
);

// ── Delete confirmation ────────────────────────────────────────────────────

const pendingDelete = ref<PersonRelRow | null>(null);

function askRemove(id: string) {
  const row = rels.value.find(r => r.id === id);
  pendingDelete.value = row ?? null;
}

const confirmMessages = computed<string[]>(() => {
  const r = pendingDelete.value;
  if (!r) return [];
  const parts: string[] = [];
  if (r.subtypeLabel) {
    parts.push(t('relationships.removeConfirmLine', {
      type: `${r.typeLabel} (${r.subtypeLabel})`,
      name: r.otherName,
    }));
  } else {
    parts.push(t('relationships.removeConfirmLine', {
      type: r.typeLabel,
      name: r.otherName,
    }));
  }
  parts.push(t('relationships.removeConfirmPersonsKept'));
  if (r.type === 'couple') {
    parts.push(t('relationships.removeConfirmEventsNote'));
  }
  parts.push(t('relationships.removeConfirmIrreversible'));
  return parts;
});

async function confirmRemove() {
  const r = pendingDelete.value;
  if (!r) return;
  pendingDelete.value = null;
  await window.api.relationships.delete(r.id);
  await reload();
  emit('deleted');
}

// ── Edit relationship modal ────────────────────────────────────────────────

interface EditingRelationship {
  id: string;
  type: string;
  person1_id: string | null;
  person2_id: string | null;
  subtype: string | null;
  notes: string | null;
}

const editingRelationship = ref<EditingRelationship | null>(null);

async function openEdit(id: string) {
  try {
    const rel = (await window.api.relationships.get(id)) as EditingRelationship | null;
    if (rel) editingRelationship.value = rel;
  } catch (err) {
    console.error('[PersonRelationshipsSection] load relationship failed:', err);
  }
}

function closeEdit() {
  editingRelationship.value = null;
}

async function onSaved() {
  closeEdit();
  await reload();
}

defineExpose({ reload, count: computed(() => rels.value.length) });
</script>
