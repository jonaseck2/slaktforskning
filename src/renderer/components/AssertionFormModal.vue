<template>
  <BaseModal @close="$emit('close')">
    <template #title>{{ editing ? $t('assertions.editTitle') : $t('assertions.addTitle') }}</template>
    <form @submit.prevent="save">
      <label>
        {{ $t('assertions.attribute') }}
        <select v-model="form.attribute" required>
          <option v-for="attr in attributeOptions" :key="attr" :value="attr">
            {{ $t('assertions.attributes.' + attr, attr) }}
          </option>
        </select>
      </label>
      <label>
        {{ $t('assertions.value') }}
        <input v-model="form.value" type="text" />
      </label>
      <label>
        {{ $t('assertions.valueOriginal') }}
        <input v-model="form.value_original" type="text" :placeholder="$t('citations.transcriptionPlaceholder')" />
      </label>
      <label>
        {{ $t('assertions.confidence') }}
        <select v-model.number="form.confidence">
          <option v-for="c in CONFIDENCE_LEVEL_VALUES" :key="c" :value="c">
            {{ $t('confidenceLevels.' + c) }}
          </option>
        </select>
      </label>
      <label>
        {{ $t('assertions.evidenceType') }}
        <select v-model="form.evidence_type">
          <option value="">-</option>
          <option value="direct">{{ $t('assertions.evidenceTypes.direct') }}</option>
          <option value="indirect">{{ $t('assertions.evidenceTypes.indirect') }}</option>
          <option value="negative">{{ $t('assertions.evidenceTypes.negative') }}</option>
        </select>
      </label>
      <label class="checkbox-label">
        <input v-model="form.is_accepted" type="checkbox" />
        {{ $t('assertions.isAccepted') }}
      </label>
      <label>
        {{ $t('assertions.notes') }}
        <textarea v-model="form.notes" rows="3" :placeholder="$t('assertions.notesPlaceholder')" />
      </label>
      <div class="modal-actions">
        <button type="button" class="btn-cancel" @click="$emit('close')">{{ $t('common.cancel') }}</button>
        <button type="submit">{{ $t('common.save') }}</button>
      </div>
    </form>
  </BaseModal>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseModal from './BaseModal.vue';
import { CONFIDENCE_LEVEL_VALUES } from '../constants/eventTypes';
import { useToast } from '../composables/useToast';

const { t } = useI18n();
const toast = useToast();

const props = defineProps<{
  citationId: string;
  subjectType: string;
  subjectId: string;
  assertion?: {
    id: string;
    attribute: string;
    value: string;
    value_original: string;
    confidence: number;
    evidence_type: string | null;
    is_accepted: boolean;
    notes: string;
  } | null;
}>();

const emit = defineEmits<{ (e: 'close'): void; (e: 'saved'): void }>();

const editing = !!props.assertion;

const ATTRIBUTE_OPTIONS: Record<string, string[]> = {
  event: ['date_value', 'date_original', 'place', 'cause', 'description'],
  person: ['sex', 'name', 'living'],
  relationship: ['type', 'subtype'],
  place: ['name', 'place_type', 'coordinates'],
};

const attributeOptions = ATTRIBUTE_OPTIONS[props.subjectType] ?? ['date_value', 'name'];

const form = reactive({
  attribute: props.assertion?.attribute ?? attributeOptions[0] ?? '',
  value: props.assertion?.value ?? '',
  value_original: props.assertion?.value_original ?? '',
  confidence: props.assertion?.confidence ?? 2,
  evidence_type: props.assertion?.evidence_type ?? '',
  is_accepted: props.assertion?.is_accepted ?? false,
  notes: props.assertion?.notes ?? '',
});

async function save() {
  try {
    const data = {
      ...form,
      evidence_type: form.evidence_type || null,
    };
    if (editing && props.assertion) {
      await window.api.assertions.update(props.assertion.id, data);
    } else {
      await window.api.assertions.create({
        citation_id: props.citationId,
        subject_type: props.subjectType,
        subject_id: props.subjectId,
        ...data,
      });
    }
    emit('saved');
  } catch (err) {
    console.error('[AssertionFormModal] save failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}
</script>

<style scoped>
.checkbox-label {
  flex-direction: row !important;
  align-items: center;
  gap: 8px !important;
}
.checkbox-label input[type="checkbox"] {
  width: auto;
}
</style>
