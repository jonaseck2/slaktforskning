<template>
  <SectionEmpty v-if="totalCount === 0" :message="$t('empty.relationships')" />

  <div v-else class="rels-groups">
    <!-- Parents — bio → adopted → foster → step → unknown, father then mother within each -->
    <template v-for="(g, i) in parentGroups" :key="'parent-' + i">
      <div class="rel-group">
        <h4 class="rel-group-heading">{{ parentHeading(g.subtype, g.sex) }}</h4>
        <RelationshipsList :rows="[groupToRow(g.row)]" @delete="askRemove" @select="openEdit" />
      </div>
    </template>

    <!-- Partners (each followed inline by the children produced with that partner) -->
    <template v-for="(g, i) in partnerGroups" :key="'partner-' + i">
      <div class="rel-group">
        <h4 class="rel-group-heading">{{ partnerHeading() }}</h4>
        <RelationshipsList :rows="[groupToRow(g.row)]" @delete="askRemove" @select="openEdit" />
        <div v-if="g.children.length > 0" class="rel-children-block">
          <h5 class="rel-subgroup-heading">{{ $t('personPanel.children') }}</h5>
          <RelationshipsList :rows="g.children.map(groupToRow)" @delete="askRemove" @select="openEdit" />
        </div>
      </div>
    </template>

    <!-- Children whose other parent is null/unknown — last partner-like entry -->
    <div v-if="orphanChildrenGroup" class="rel-group">
      <h4 class="rel-group-heading">{{ $t('relationships.unknownOrOtherParent') }}</h4>
      <RelationshipsList
        :rows="orphanChildrenGroup.children.map(groupToRow)"
        @delete="askRemove"
        @select="openEdit"
      />
    </div>

    <!-- Other relations — godparents/family-flavoured first, then social -->
    <div v-if="otherGroups.length > 0" class="rel-group">
      <h4 class="rel-group-heading">{{ $t('relationships.otherRelations') }}</h4>
      <RelationshipsList
        :rows="otherGroups.map(g => groupToRow(g.row))"
        @delete="askRemove"
        @select="openEdit"
      />
    </div>
  </div>

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
import {
  sortPersonRelations,
  type RelationRow,
  type RelationsSortGroup,
  type ParentSubtype,
} from '../../api/sortPersonRelations';

interface PersonRelHydratedRow extends RelationRow {
  // Renderer-only display fields layered on top of the sort row.
  display: {
    otherGivenName: string;
    otherSurname: string;
    otherPreferredName: string | null;
    otherNickname: string | null;
    /** Display only — see plan birth-name-display-and-quality-check. */
    otherBirthSurname: string | null;
    /**
     * Single user-visible label for the relationship row. For parent_child
     * this is a direction-aware role label (Fosterförälder / Fosterbarn /
     * Adoptivbarn / etc.) — never composed at render time. For couple rows
     * it is "type (subtype)" or "type". For other rows it is the type label.
     */
    roleLabel: string;
  };
}

const props = defineProps<{ personId: string }>();
const emit = defineEmits<{ deleted: [] }>();

const { t, locale } = useI18n();

function getCoupleSubtypeLabel(subtype: string | null): string {
  if (!subtype) return '';
  return t('coupleSubtypes.' + subtype);
}

// ── Data loading: one round-trip via reports.personSummary ────────────────
//
// `reports.personSummary` already pre-joins everything the sort needs:
// the other person's names + sex + birth_date, the partnership start_date,
// and the other_parent_id resolution. The renderer only layers display-name
// choice (locale/UI concern) on top — see `pickDisplayedName` /
// `pickBirthSurnameForDisplay` below.
//
// Past bug: this section used to fire ~5 IPCs per relation row
// (persons.get + persons.getNames + events.forPerson + events.forRelationship
// + relationships.getForPerson) — for N=20 that's 80–100 round-trips per
// open. Replaced with a single `reports.personSummary` call.

interface SummaryName {
  id: string;
  given_name: string | null;
  surname: string | null;
  preferred_name: string | null;
  nickname: string | null;
  name_prefix: string | null;
  name_suffix: string | null;
  sort_order: number;
  name_type: string;
  date_from: string | null;
}

interface SummaryRelationship {
  id: string;
  type: string;
  subtype: string | null;
  person1_id: string | null;
  person2_id: string | null;
  other_person_id: string | null;
  other_person_names: SummaryName[];
  other_person_sex: string | null;
  other_person_birth_date: string | null;
  partnership_start_date: string | null;
  other_parent_id: string | null;
}

interface PersonSummaryShape {
  relationships: SummaryRelationship[];
}

const idRef = computed(() => props.personId ?? null);
const { data: relsData, reload } = useEntityData<PersonRelHydratedRow[]>(idRef, async (personId) => {
  const summary = (await window.api.reports.personSummary(personId)) as PersonSummaryShape | null;
  if (!summary) return [];

  return summary.relationships.map((r): PersonRelHydratedRow => {
    const otherId = r.other_person_id;
    const direction: 'incoming' | 'outgoing' = r.person1_id === personId ? 'outgoing' : 'incoming';

    let otherDisplayName = t('common.unknown');
    let otherGivenName = '';
    let otherSurname = '';
    let otherPreferredName: string | null = null;
    let otherNickname: string | null = null;
    let otherBirthSurname: string | null = null;
    const otherSex: 'M' | 'F' | 'U' = (r.other_person_sex as 'M' | 'F' | 'U' | null) ?? 'U';
    const otherBirthDate = r.other_person_birth_date;

    const names = r.other_person_names;
    if (names.length > 0) {
      // pickDisplayedName needs the other person's events only to extract a
      // birth date — synthesize the minimal event list from the pre-joined
      // birth date so we don't need a separate per-row events.forPerson IPC.
      const syntheticEvents = otherBirthDate
        ? [{ event_type: 'birth', date_value: otherBirthDate }]
        : [];
      const primary = pickDisplayedName(names, syntheticEvents) ?? names[0];
      otherGivenName = primary.given_name || '';
      otherSurname = primary.surname || '';
      otherPreferredName = primary.preferred_name;
      otherNickname = primary.nickname;
      otherDisplayName = formatFullName(primary) || t('common.unknown');
      // Display only — see plan birth-name-display-and-quality-check.
      otherBirthSurname = pickBirthSurnameForDisplay(primary, names);
    }

    // Compute the single user-visible row label.
    //
    // parent_child: direction-aware role label via getParentChildRoleLabel
    // — "Fosterförälder" / "Fosterbarn" / "Adoptivbarn" / etc. The DB
    // convention is person1_id = parent, person2_id = child. The row labels
    // describe the OTHER person's role relative to the focal: when focal is
    // person1 (parent), the row badge labels the other as the child →
    // direction = 'child'. When focal is person2 (child), the row badge
    // labels the other as the parent → direction = 'parent'.
    let roleLabel: string;
    if (r.type === 'parent_child') {
      const roleDirection: 'parent' | 'child' = r.person1_id === personId ? 'child' : 'parent';
      roleLabel = getParentChildRoleLabel(t, roleDirection, r.subtype);
    } else {
      const typeLabel = t('relTypes.' + r.type);
      const subLabel = r.type === 'couple' ? getCoupleSubtypeLabel(r.subtype) : '';
      roleLabel = subLabel ? `${typeLabel} (${subLabel})` : typeLabel;
    }

    return {
      id: r.id,
      type: r.type,
      subtype: r.subtype,
      person1_id: r.person1_id,
      person2_id: r.person2_id,
      direction,
      other: {
        id: otherId,
        display_name: otherDisplayName,
        sex: otherSex,
        birth_date: otherBirthDate,
      },
      start_date: r.partnership_start_date,
      other_parent_id: r.other_parent_id,
      display: {
        otherGivenName,
        otherSurname,
        otherPreferredName,
        otherNickname,
        otherBirthSurname,
        roleLabel,
      },
    };
  });
});

const rels = computed<PersonRelHydratedRow[]>(() => relsData.value ?? []);
const totalCount = computed(() => rels.value.length);

// ── Sort + group ──────────────────────────────────────────────────────────

const sortedGroups = computed<RelationsSortGroup[]>(() =>
  sortPersonRelations({
    rows: rels.value,
    locale: locale.value,
  })
);

const parentGroups = computed(
  () => sortedGroups.value.filter((g): g is Extract<RelationsSortGroup, { kind: 'parent' }> => g.kind === 'parent')
);
const partnerGroups = computed(
  () => sortedGroups.value.filter((g): g is Extract<RelationsSortGroup, { kind: 'partner' }> => g.kind === 'partner')
);
const orphanChildrenGroup = computed(
  () => sortedGroups.value.find((g): g is Extract<RelationsSortGroup, { kind: 'children-no-partner' }> => g.kind === 'children-no-partner')
);
const otherGroups = computed(
  () => sortedGroups.value.filter((g): g is Extract<RelationsSortGroup, { kind: 'other' }> => g.kind === 'other')
);

// ── Header label helpers ──────────────────────────────────────────────────

/**
 * Parent group heading.
 *
 * Bio (or unknown) parents: sex-typed label — "Pappa" / "Mamma" / "Förälder".
 * Non-bio parents (adopted / foster / step): single role token from
 * getParentChildRoleLabel — "Adoptivförälder" / "Fosterförälder" /
 * "Styvförälder". This deliberately drops sex from non-bio headings, because
 * "Foster mamma" / "Adopterad pappa" reads as composition (and the Swedish
 * "Foster" alone is ambiguous with "fetus"). The avatar + name on the row
 * carries the sex signal. See foster-terminology plan + relationshipLabels.ts.
 */
function parentHeading(subtype: ParentSubtype, sex: 'M' | 'F' | 'U' | null): string {
  if (subtype === 'biological' || subtype === 'unknown') {
    return sex === 'M'
      ? t('reports.relations.father')
      : sex === 'F'
        ? t('reports.relations.mother')
        : t('reports.relations.parent');
  }
  return getParentChildRoleLabel(t, 'parent', subtype);
}

function partnerHeading(): string {
  return t('personPanel.partner');
}

// ── Adapter to RelationshipsList row ──────────────────────────────────────

function groupToRow(r: RelationRow): RelationshipListRow {
  const hydrated = r as PersonRelHydratedRow;
  return {
    id: hydrated.id,
    roleLabel: hydrated.display.roleLabel,
    persons: [
      {
        id: hydrated.other.id,
        givenName: hydrated.display.otherGivenName,
        surname: hydrated.display.otherSurname,
        preferredName: hydrated.display.otherPreferredName,
        nickname: hydrated.display.otherNickname,
        // Display only — see plan birth-name-display-and-quality-check.
        birthSurname: hydrated.display.otherBirthSurname,
        sex: hydrated.other.sex ?? 'U',
      },
    ],
    ariaLabel: t('a11y.editItem', { item: hydrated.other.display_name }),
  };
}

// ── Delete confirmation ───────────────────────────────────────────────────

const pendingDelete = ref<PersonRelHydratedRow | null>(null);

function askRemove(id: string) {
  const row = rels.value.find(r => r.id === id);
  pendingDelete.value = row ?? null;
}

const confirmMessages = computed<string[]>(() => {
  const r = pendingDelete.value;
  if (!r) return [];
  const parts: string[] = [];
  parts.push(t('relationships.removeConfirmLine', {
    type: r.display.roleLabel,
    name: r.other.display_name,
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

// ── Edit relationship modal ───────────────────────────────────────────────

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

defineExpose({ reload, count: totalCount });
</script>

<style scoped>
.rels-groups {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}
.rel-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}
.rel-group-heading {
  font-size: var(--font-sm);
  color: var(--text-secondary);
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
}
.rel-children-block {
  margin-left: var(--space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  margin-top: var(--space-xs);
}
.rel-subgroup-heading {
  font-size: var(--font-xs);
  color: var(--text-muted);
  margin: 0;
  font-weight: 500;
}
</style>
