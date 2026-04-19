<template>
  <RelationshipsList :rows="rows" @delete="$emit('delete', $event)" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import RelationshipsList, { type RelationshipListRow } from './RelationshipsList.vue';
import { narrateRelationshipRow } from '../utils/screenReaderNarration';

export interface RelRow {
  id: string;
  type: string;
  person1_id: string | null;
  person2_id: string | null;
  subtype: string | null;
  notes: string;
  person1_given_name: string;
  person1_surname: string;
  person1_preferred_name: string | null;
  person1_nickname: string | null;
  person1_sex: 'M' | 'F' | 'U' | null;
  person2_given_name: string;
  person2_surname: string;
  person2_preferred_name: string | null;
  person2_nickname: string | null;
  person2_sex: 'M' | 'F' | 'U' | null;
}

const props = defineProps<{ relationships: RelRow[] }>();
defineEmits<{ delete: [id: string] }>();

const { t } = useI18n();

function roleLabel1(type: string): string {
  if (type === 'parent_child') return t('relTypes.parent');
  if (type === 'couple') return t('relTypes.partner');
  if (type === 'sibling') return t('relTypes.sibling');
  if (type === 'godparent') return t('relTypes.godparent');
  return '';
}

function roleLabel2(type: string): string {
  if (type === 'parent_child') return t('relTypes.child');
  if (type === 'couple') return t('relTypes.partner');
  if (type === 'sibling') return t('relTypes.sibling');
  if (type === 'godparent') return t('relTypes.godchild');
  return '';
}

function subtypeLabel(type: string, subtype: string): string {
  if (type === 'couple') return t('coupleSubtypes.' + subtype);
  if (type === 'parent_child') return t('parentChildSubtypes.' + subtype);
  return subtype;
}

const rows = computed<RelationshipListRow[]>(() =>
  props.relationships.map(rel => ({
    id: rel.id,
    typeLabel: t('relTypes.' + rel.type),
    subtypeLabel: rel.subtype ? subtypeLabel(rel.type, rel.subtype) : null,
    persons: [
      {
        id: rel.person1_id,
        givenName: rel.person1_given_name,
        surname: rel.person1_surname,
        preferredName: rel.person1_preferred_name,
        nickname: rel.person1_nickname,
        sex: rel.person1_sex ?? 'U',
        roleLabel: roleLabel1(rel.type),
      },
      {
        id: rel.person2_id,
        givenName: rel.person2_given_name,
        surname: rel.person2_surname,
        preferredName: rel.person2_preferred_name,
        nickname: rel.person2_nickname,
        sex: rel.person2_sex ?? 'U',
        roleLabel: roleLabel2(rel.type),
      },
    ],
    narration: narrateRelationshipRow({
      type: rel.type,
      person1_given_name: rel.person1_given_name || '',
      person1_surname: rel.person1_surname || '',
      person2_given_name: rel.person2_given_name || '',
      person2_surname: rel.person2_surname || '',
      event_summary: '',
    }, t),
    ariaLabel: t('a11y.editItem', { item: t('relTypes.' + rel.type) }),
  }))
);
</script>
