<!--
  Add/edit a `person_associations` row (T21 — GEDCOM 7.0 ASSO without event).

  An association is a person → person link that does NOT mediate via any
  event: godparent (in general), friend, colleague, enemy, neighbor, other.
  Always created with the host person as `person_id` (the subject side);
  user picks the `related_person_id` (the object) and the `role`.
-->
<template>
  <BaseSubPanel
    entity-type="person"
    :title="modalTitle"
    :mode="mode"
    :save-disabled="!form.related_person_id || saving"
    @cancel="$emit('cancel')"
    @save="handleSave"
    @close="$emit('close')"
  >
    <div class="ep-fields">
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('personAssociations.relatedPerson') }}</span>
        <PersonPicker
          v-model="form.related_person_id"
          :placeholder="$t('personAssociations.relatedPerson')"
        />
      </div>
      <div class="ep-field">
        <label class="ep-field-label" for="assoc-field-role">{{ $t('personAssociations.role') }}</label>
        <select id="assoc-field-role" class="ep-input" v-model="form.role">
          <option v-for="r in ROLE_VALUES" :key="r" :value="r">{{ $t('personAssociations.roles.' + r) }}</option>
        </select>
      </div>
      <div class="ep-field">
        <label class="ep-field-label" for="assoc-field-notes">{{ $t('personAssociations.notes') }}</label>
        <textarea
          id="assoc-field-notes"
          class="ep-input"
          v-model="form.notes"
          rows="3"
        />
      </div>
    </div>
  </BaseSubPanel>
</template>

<script setup lang="ts">
import { reactive, ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseSubPanel from './BaseSubPanel.vue';
import PersonPicker from '../PersonPicker.vue';
import { useToast } from '../../composables/useToast';
import type { PersonAssociation, PersonAssociationRole } from '../../../api/types';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const ROLE_VALUES: PersonAssociationRole[] = [
  'godparent', 'friend', 'colleague', 'enemy', 'neighbor', 'other',
];

const props = withDefaults(defineProps<{
  mode?: 'standalone' | 'subpanel';
  personId: string;
  editing?: PersonAssociation | null;
}>(), {
  mode: 'standalone',
  editing: null,
});

const emit = defineEmits<{
  cancel: [];
  close: [];
  saved: [association: PersonAssociation];
}>();

const { t } = useI18n();
const toast = useToast();
const saving = ref(false);

const form = reactive<{
  related_person_id: string | null;
  role: PersonAssociationRole;
  notes: string;
}>({
  related_person_id: props.editing?.related_person_id ?? null,
  role: (props.editing?.role as PersonAssociationRole) ?? 'godparent',
  notes: props.editing?.notes ?? '',
});

const modalTitle = computed(() =>
  props.editing ? t('personAssociations.editTitle') : t('personAssociations.addTitle'),
);

async function handleSave() {
  if (!form.related_person_id) return;
  if (saving.value) return;
  saving.value = true;
  try {
    let row: PersonAssociation;
    if (props.editing) {
      row = (await window.api.personAssociations.update(props.editing.id, {
        related_person_id: form.related_person_id,
        role: form.role,
        notes: form.notes,
      })) as PersonAssociation;
    } else {
      row = (await window.api.personAssociations.create({
        person_id: props.personId,
        related_person_id: form.related_person_id,
        role: form.role,
        notes: form.notes,
      })) as PersonAssociation;
    }
    emit('saved', row);
  } catch (err) {
    console.error('[AssociationModal] save failed:', err);
    toast.error(t('errors.saveFailed'));
  } finally {
    saving.value = false;
  }
}
</script>
