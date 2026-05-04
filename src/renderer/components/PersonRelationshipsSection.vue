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
import { formatFullName, pickDisplayedName, pickBirthSurnameForDisplay } from '../utils/nameUtils';
import { useEntityData } from '../composables/useEntityData';
import { getParentChildRoleLabel } from '../utils/relationshipLabels';

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
  /** Display only — see plan birth-name-display-and-quality-check. */
  otherBirthSurname: string | null;
  otherSex: 'M' | 'F' | 'U';
  /**
   * Single user-visible label for the row. For parent_child this is a
   * direction-aware role label (Fosterförälder / Fosterbarn / etc.).
   * For couple rows this is "type (subtype)" or "type" — couple rows
   * keep the legacy composition since they are out of scope for
   * role-coalescing in the foster-terminology plan.
   */
  roleLabel: string;
}

const props = defineProps<{ personId: string }>();
const emit = defineEmits<{ deleted: [] }>();

const { t } = useI18n();

function getCoupleSubtypeLabel(subtype: string | null): string {
  if (!subtype) return '';
  return t('coupleSubtypes.' + subtype);
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
    let otherBirthSurname: string | null = null;
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
          // Display only — see plan birth-name-display-and-quality-check.
          otherBirthSurname = pickBirthSurnameForDisplay(primary, names);
        }
      } catch { /* ignore */ }
    }

    // Compute the single user-visible row label.
    //
    // parent_child: direction-aware role label — "Fosterförälder" /
    // "Fosterbarn" / "Adoptivbarn" / etc. The DB convention is
    // person1_id = parent, person2_id = child. So when viewing person X:
    //   X is person1_id (X is the parent) → "other" is the child →
    //     this row describes X's role-toward-other = "child" direction
    //     reversed → other's role is 'child' → no, the other way:
    //     the row reads as "X's relationship to other"; if X is the
    //     parent, the row labels the OTHER as the child. The legacy
    //     code's `r.person1_id === personId ? t('relTypes.child') : t('relTypes.parent')`
    //     was assigning the role label to the OTHER person — so when
    //     the current person is person1 (parent), the row badge said
    //     "Barn" (child) describing the other. Preserve that semantics:
    //     person1_id === personId → other is the child → child direction.
    let roleLabel: string;
    if (r.type === 'parent_child') {
      const direction: 'parent' | 'child' = r.person1_id === personId ? 'child' : 'parent';
      roleLabel = getParentChildRoleLabel(t, direction, r.subtype);
    } else {
      const typeLabel = t('relTypes.' + r.type);
      const subLabel = r.type === 'couple' ? getCoupleSubtypeLabel(r.subtype) : '';
      roleLabel = subLabel ? `${typeLabel} (${subLabel})` : typeLabel;
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
      otherBirthSurname,
      otherSex,
      roleLabel,
    } as PersonRelRow;
  }));
});
const rels = computed(() => relsData.value ?? []);

const rows = computed<RelationshipListRow[]>(() =>
  rels.value.map(r => ({
    id: r.id,
    roleLabel: r.roleLabel,
    persons: [
      {
        id: r.otherId,
        givenName: r.otherGivenName,
        surname: r.otherSurname,
        preferredName: r.otherPreferredName,
        nickname: r.otherNickname,
        // Display only — see plan birth-name-display-and-quality-check.
        birthSurname: r.otherBirthSurname,
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
  parts.push(t('relationships.removeConfirmLine', {
    type: r.roleLabel,
    name: r.otherName,
  }));
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
