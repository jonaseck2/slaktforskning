<!--
  Self-loading panel section for `person_identifiers` rows. Surfaces the
  external IDs an agent or researcher attached to a person (FamilySearch,
  Ancestry, Riksarkivet, personnummer, GEDCOM REFN/RIN, other). Exposes
  `count` so the parent's section header can show (N) without expanding
  the body.

  Rationale: pre-2026-05-09 the `person_identifiers` table had MCP CRUD
  but no UI surface — every identifier added via the agent or via GEDCOM
  REFN import was invisible in the running app. Surfaced as gap #14 in
  docs/plans/2026-05-09-bernadotte-test-findings.md.
-->
<template>
  <div>
    <SectionEmpty v-if="identifiers.length === 0" :message="$t('empty.identifiers')" />
    <table v-else class="data-table identifiers-table">
      <thead>
        <tr>
          <th class="th-type">{{ $t('personDetail.identifierType') }}</th>
          <th class="th-value">{{ $t('personDetail.identifierValue') }}</th>
          <th class="actions-cell"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in identifiers" :key="row.id">
          <td class="td-type">
            <span class="identifier-type-badge">{{ typeLabel(row.identifier_type) }}</span>
          </td>
          <td class="td-value monospace">{{ row.identifier_value }}</td>
          <td class="actions-cell">
            <button
              v-if="!props.readonly"
              type="button"
              class="btn-sm btn-delete"
              :aria-label="$t('common.delete')"
              :title="$t('common.delete')"
              @click="onDelete(row.id)"
            >
              <IconTrash />
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Inline add form. Two fields: a type select + a value input. Kept
         inline (no modal) because the schema is trivially small and the
         flow is "type → paste ID → save" without further nesting. -->
    <div v-if="addOpen" class="identifier-add-form">
      <select v-model="newType" class="identifier-type-select" :aria-label="$t('personDetail.identifierType')">
        <option v-for="t in IDENTIFIER_TYPES" :key="t" :value="t">{{ typeLabel(t) }}</option>
      </select>
      <input
        v-model="newValue"
        type="text"
        class="identifier-value-input"
        :placeholder="$t('personDetail.identifierValue')"
        :aria-label="$t('personDetail.identifierValue')"
        @keydown.enter="onSave"
        @keydown.escape="addOpen = false"
      />
      <AppButton variant="soft" size="sm" :disabled="!newValue.trim()" @click="onSave">{{ $t('common.save') }}</AppButton>
      <AppButton variant="ghost" size="sm" @click="addOpen = false">{{ $t('common.cancel') }}</AppButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import SectionEmpty from './ui/SectionEmpty.vue';
import AppButton from './ui/AppButton.vue';
import IconTrash from './ui/IconTrash.vue';
import { useEntityData } from '../composables/useEntityData';

declare const window: Window & {
  api: {
    persons: {
      getIdentifiers: (personId: string) => Promise<PersonIdentifier[]>;
      addIdentifier: (personId: string, data: { identifier_type: string; identifier_value: string }) => Promise<PersonIdentifier>;
      deleteIdentifier: (id: string) => Promise<void>;
    };
  };
};

interface PersonIdentifier {
  id: string;
  person_id: string;
  identifier_type: 'familysearch' | 'ancestry' | 'riksarkivet' | 'personnummer' | 'refn' | 'rin' | 'uid' | 'afn' | 'ssn' | 'other';
  identifier_value: string;
  created_at: string;
}

const IDENTIFIER_TYPES = [
  'familysearch', 'ancestry', 'riksarkivet', 'personnummer', 'refn', 'rin', 'uid', 'afn', 'ssn', 'other',
] as const;

const props = withDefaults(defineProps<{
  personId: string;
  readonly?: boolean;
}>(), { readonly: false });

const { t } = useI18n();
function typeLabel(t_: PersonIdentifier['identifier_type']): string {
  return t(`personDetail.identifierTypes.${t_}`);
}

const idRef = computed(() => props.personId ?? null);
const { data, reload } = useEntityData<PersonIdentifier[]>(idRef, async (id) => {
  return await window.api.persons.getIdentifiers(id);
});
const identifiers = computed(() => data.value ?? []);
const count = computed(() => identifiers.value.length);

const addOpen = ref(false);
const newType = ref<PersonIdentifier['identifier_type']>('familysearch');
const newValue = ref('');

function openAddForm() {
  newType.value = 'familysearch';
  newValue.value = '';
  addOpen.value = true;
}

async function onSave() {
  const value = newValue.value.trim();
  if (!value) return;
  await window.api.persons.addIdentifier(props.personId, {
    identifier_type: newType.value,
    identifier_value: value,
  });
  addOpen.value = false;
  // useEntityData refreshes via onDataChanged, but reload() makes the
  // round-trip immediate (no debounce wait) for the user who just saved.
  await reload();
}

async function onDelete(id: string) {
  await window.api.persons.deleteIdentifier(id);
  await reload();
}

defineExpose({
  /** Surface contract: parent's section header shows (count) and decides
   * whether to render the `+ Identifier` action based on this. */
  count,
  reload,
  openAddForm,
});
</script>

<style scoped>
.identifiers-table { width: 100%; }
.th-type, .td-type { width: 35%; white-space: nowrap; }
.th-value { width: 60%; }
.identifier-type-badge {
  display: inline-block;
  padding: 2px 8px;
  background: var(--surface-hover);
  border-radius: var(--radius-sm);
  font-size: var(--font-xs);
}
.monospace { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: var(--font-sm); }
.identifier-add-form {
  display: flex;
  gap: var(--space-sm);
  align-items: center;
  margin-top: var(--space-sm);
  padding: var(--space-sm);
  background: var(--surface-hover);
  border-radius: var(--radius-sm);
}
.identifier-type-select { padding: 4px 8px; font-size: var(--font-sm); }
.identifier-value-input {
  flex: 1;
  padding: 4px 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: var(--font-sm);
}
</style>
