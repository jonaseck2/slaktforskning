<template>
  <table class="data-table">
    <thead>
      <tr>
        <th>{{ $t('relationships.person1') }}</th>
        <th>{{ $t('relationships.person2') }}</th>
        <th>{{ $t('common.type') }}</th>
        <th>{{ $t('relationshipDetail.subtype') }}</th>
        <th class="actions-cell">{{ $t('common.actions') }}</th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="rel in relationships"
        :key="rel.id"
        v-narrate="() => narrateRelationshipRow({
          type: rel.type,
          person1_given_name: rel.person1_given_name || '',
          person1_surname: rel.person1_surname || '',
          person2_given_name: rel.person2_given_name || '',
          person2_surname: rel.person2_surname || '',
          event_summary: '',
        }, t)"
        class="clickable-row"
        tabindex="0"
        role="button"
        :aria-label="$t('a11y.editItem', { item: $t('relTypes.' + rel.type) })"
        @click="router.push('/relationships/' + rel.id)"
        @keydown.enter="router.push('/relationships/' + rel.id)"
        @keydown.space.prevent="router.push('/relationships/' + rel.id)"
        @keydown.down.prevent="focusNextRow($event)"
        @keydown.up.prevent="focusPrevRow($event)"
      >
        <td>
          <span v-if="roleLabel1(rel.type)" class="role-label">{{ roleLabel1(rel.type) }}</span>
          <router-link v-if="rel.person1_id" :to="'/persons/' + rel.person1_id" class="person-link" @click.stop>
            <PersonName
              v-if="rel.person1_given_name || rel.person1_surname"
              :given-name="rel.person1_given_name"
              :surname="rel.person1_surname"
              :preferred-name="rel.person1_preferred_name"
              :nickname="rel.person1_nickname"
            />
          </router-link>
          <span v-else-if="rel.person1_given_name || rel.person1_surname">
            <PersonName
              :given-name="rel.person1_given_name"
              :surname="rel.person1_surname"
              :preferred-name="rel.person1_preferred_name"
              :nickname="rel.person1_nickname"
            />
          </span>
          <span v-else>—</span>
        </td>
        <td>
          <span v-if="roleLabel2(rel.type)" class="role-label">{{ roleLabel2(rel.type) }}</span>
          <router-link v-if="rel.person2_id" :to="'/persons/' + rel.person2_id" class="person-link" @click.stop>
            <PersonName
              v-if="rel.person2_given_name || rel.person2_surname"
              :given-name="rel.person2_given_name"
              :surname="rel.person2_surname"
              :preferred-name="rel.person2_preferred_name"
              :nickname="rel.person2_nickname"
            />
          </router-link>
          <span v-else-if="rel.person2_given_name || rel.person2_surname">
            <PersonName
              :given-name="rel.person2_given_name"
              :surname="rel.person2_surname"
              :preferred-name="rel.person2_preferred_name"
              :nickname="rel.person2_nickname"
            />
          </span>
          <span v-else>—</span>
        </td>
        <td><span class="type-badge">{{ $t('relTypes.' + rel.type) }}</span></td>
        <td>{{ rel.subtype ? subtypeLabel(rel.type, rel.subtype) : '—' }}</td>
        <td class="actions-cell">
          <button class="btn-sm btn-delete" @click.stop="$emit('delete', rel.id)">✕</button>
        </td>
      </tr>
    </tbody>
  </table>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import PersonName from './PersonName.vue';
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
  person2_given_name: string;
  person2_surname: string;
  person2_preferred_name: string | null;
  person2_nickname: string | null;
}

defineProps<{ relationships: RelRow[] }>();
defineEmits<{ delete: [id: string] }>();

const { t } = useI18n();
const router = useRouter();

function focusNextRow(e: KeyboardEvent): void {
  const row = (e.target as HTMLElement).nextElementSibling as HTMLElement | null;
  if (row?.matches('tr[tabindex]')) row.focus();
}
function focusPrevRow(e: KeyboardEvent): void {
  const row = (e.target as HTMLElement).previousElementSibling as HTMLElement | null;
  if (row?.matches('tr[tabindex]')) row.focus();
}

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
</script>

<style scoped>
.type-badge {
  background: var(--color-bg-subtle);
  color: var(--color-text-muted);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: var(--font-xs);
}
.role-label {
  display: inline;
  font-size: var(--font-xs);
  color: #888;
  margin-right: 5px;
}
.actions-cell { width: 1px; text-align: right; white-space: nowrap; }
</style>
