<template>
  <RelationshipsList :rows="rows" :selected-id="selectedId" @delete="$emit('delete', $event)" @select="$emit('select', $event)" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import RelationshipsList, { type RelationshipListRow } from './RelationshipsList.vue';
import { narrateRelationshipRow } from '../utils/screenReaderNarration';
import { getParentChildRoleLabel } from '../utils/relationshipLabels';

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
  /** Display only — see plan birth-name-display-and-quality-check. */
  person1_birth_surname: string | null;
  person1_sex: 'M' | 'F' | 'U' | null;
  person2_given_name: string;
  person2_surname: string;
  person2_preferred_name: string | null;
  person2_nickname: string | null;
  /** Display only — see plan birth-name-display-and-quality-check. */
  person2_birth_surname: string | null;
  person2_sex: 'M' | 'F' | 'U' | null;
}

const props = defineProps<{ relationships: RelRow[]; selectedId?: string | null }>();
defineEmits<{ delete: [id: string]; select: [id: string] }>();

const { t } = useI18n();

function roleLabel1(type: string, subtype: string | null): string {
  if (type === 'parent_child') return getParentChildRoleLabel(t, 'parent', subtype);
  if (type === 'couple') return t('relTypes.partner');
  if (type === 'sibling') return t('relTypes.sibling');
  if (type === 'godparent') return t('relTypes.godparent');
  return '';
}

function roleLabel2(type: string, subtype: string | null): string {
  if (type === 'parent_child') return getParentChildRoleLabel(t, 'child', subtype);
  if (type === 'couple') return t('relTypes.partner');
  if (type === 'sibling') return t('relTypes.sibling');
  if (type === 'godparent') return t('relTypes.godchild');
  return '';
}

// Header badge label for the row.
//   parent_child → direction-aware role (parent side, since person1 is the parent)
//                  e.g. "Fosterförälder" — never composed type+subtype.
//   couple       → "Par (Gift)" / "Couple (Marriage)" composition; couple
//                  subtypes are noun phrases that compose cleanly.
//   other        → bare type label.
function rowRoleLabel(type: string, subtype: string | null): string {
  if (type === 'parent_child') {
    return getParentChildRoleLabel(t, 'parent', subtype);
  }
  const typeLabel = t('relTypes.' + type);
  if (type === 'couple' && subtype) {
    return `${typeLabel} (${t('coupleSubtypes.' + subtype)})`;
  }
  return typeLabel;
}

const rows = computed<RelationshipListRow[]>(() =>
  props.relationships.map(rel => ({
    id: rel.id,
    roleLabel: rowRoleLabel(rel.type, rel.subtype),
    persons: [
      {
        id: rel.person1_id,
        givenName: rel.person1_given_name,
        surname: rel.person1_surname,
        preferredName: rel.person1_preferred_name,
        nickname: rel.person1_nickname,
        // Display only — see plan birth-name-display-and-quality-check.
        birthSurname: rel.person1_birth_surname,
        sex: rel.person1_sex ?? 'U',
        roleLabel: roleLabel1(rel.type, rel.subtype),
      },
      {
        id: rel.person2_id,
        givenName: rel.person2_given_name,
        surname: rel.person2_surname,
        preferredName: rel.person2_preferred_name,
        nickname: rel.person2_nickname,
        // Display only — see plan birth-name-display-and-quality-check.
        birthSurname: rel.person2_birth_surname,
        sex: rel.person2_sex ?? 'U',
        roleLabel: roleLabel2(rel.type, rel.subtype),
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
