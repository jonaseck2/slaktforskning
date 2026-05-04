<template>
  <table class="data-table">
    <tbody>
      <tr
        v-for="row in rows"
        :key="row.id"
        v-narrate="row.narration ? () => row.narration! : undefined"
        class="clickable-row"
        :class="{ 'selected-row': selectedId === row.id }"
        tabindex="0"
        role="button"
        :aria-label="row.ariaLabel"
        @click="$emit('select', row.id)"
        @keydown.enter="$emit('select', row.id)"
        @keydown.space.prevent="$emit('select', row.id)"
        @keydown.down.prevent="focusNextRow($event)"
        @keydown.up.prevent="focusPrevRow($event)"
      >
        <td class="type-cell">
          <span class="type-badge">{{ row.roleLabel }}</span>
        </td>
        <td>
          <div class="persons-cell">
            <div v-for="(p, i) in row.persons" :key="i" class="person-chip">
              <AppAvatar
                v-if="p.id || p.givenName || p.surname"
                :person-id="p.id"
                :given-name="p.givenName"
                :surname="p.surname"
                :preferred-name="p.preferredName ?? null"
                :sex="p.sex ?? 'U'"
              />
              <span v-if="p.roleLabel" class="role-label">{{ p.roleLabel }}</span>
              <router-link
                v-if="p.id && (p.givenName || p.surname)"
                :to="'/persons/' + p.id"
                class="person-link"
                @click.stop
              >
                <!-- Display only — see plan birth-name-display-and-quality-check. -->
                <PersonName
                  :given-name="p.givenName"
                  :surname="p.surname"
                  :preferred-name="p.preferredName ?? null"
                  :nickname="p.nickname ?? null"
                  :birth-surname="p.birthSurname ?? null"
                  :show-birth-name-parenthetical="personNameOptions.showBirthNameParenthetical"
                />
              </router-link>
              <span v-else-if="p.givenName || p.surname">
                <!-- Display only — see plan birth-name-display-and-quality-check. -->
                <PersonName
                  :given-name="p.givenName"
                  :surname="p.surname"
                  :preferred-name="p.preferredName ?? null"
                  :nickname="p.nickname ?? null"
                  :birth-surname="p.birthSurname ?? null"
                  :show-birth-name-parenthetical="personNameOptions.showBirthNameParenthetical"
                />
              </span>
              <span v-else>—</span>
            </div>
          </div>
        </td>
        <td class="actions-cell">
          <button
            class="btn-sm btn-delete"
            :aria-label="$t('a11y.unlinkItem', { item: row.ariaLabel || row.roleLabel })"
            :title="$t('common.unlinkTooltip')"
            @click.stop="$emit('delete', row.id)"
          >
            <IconUnlink :size="14" />
          </button>
        </td>
      </tr>
    </tbody>
  </table>
</template>

<script setup lang="ts">
import AppAvatar from './ui/AppAvatar.vue';
import PersonName from './PersonName.vue';
import IconUnlink from './ui/IconUnlink.vue';
import { usePersonNameOptions } from '../stores/personNameOptions';

// Display only — see plan birth-name-display-and-quality-check.
const personNameOptions = usePersonNameOptions();

export interface RelationshipListPerson {
  id: string | null;
  givenName: string;
  surname: string;
  preferredName?: string | null;
  nickname?: string | null;
  /** Display only — see plan birth-name-display-and-quality-check. */
  birthSurname?: string | null;
  sex?: 'M' | 'F' | 'U';
  roleLabel?: string;
}

export interface RelationshipListRow {
  id: string;
  /**
   * Single user-visible label for the relationship row.
   *
   * For parent_child rows this is a role label like "Fosterförälder" /
   * "Adoptivbarn" (computed from direction + subtype via
   * getParentChildRoleLabel — NEVER composed at render time from
   * type + subtype, that produced "Förälder Foster").
   *
   * For couple / sibling / other rows this is the type label (or
   * type + subtype if a callsite chooses to combine, but composition
   * is the callsite's responsibility, not this component's).
   */
  roleLabel: string;
  persons: RelationshipListPerson[];
  narration?: string;
  ariaLabel?: string;
}

defineProps<{ rows: RelationshipListRow[]; selectedId?: string | null }>();
defineEmits<{ delete: [id: string]; select: [id: string] }>();

function focusNextRow(e: KeyboardEvent): void {
  const row = (e.target as HTMLElement).nextElementSibling as HTMLElement | null;
  if (row?.matches('tr[tabindex]')) row.focus();
}
function focusPrevRow(e: KeyboardEvent): void {
  const row = (e.target as HTMLElement).previousElementSibling as HTMLElement | null;
  if (row?.matches('tr[tabindex]')) row.focus();
}
</script>

<style scoped>
.type-cell { white-space: nowrap; width: 1px; }
.type-badge {
  color: var(--text-muted);
  font-size: var(--font-xs);
  margin-right: var(--space-xs);
}
.persons-cell {
  display: flex;
  gap: var(--space-lg);
  align-items: center;
  flex-wrap: wrap;
}
.person-chip {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}
.role-label {
  font-size: var(--font-xs);
  color: var(--text-muted);
}
.actions-cell { width: 1px; text-align: right; white-space: nowrap; }
.selected-row { background: color-mix(in srgb, var(--accent) 10%, transparent); }
</style>
