<template>
  <BaseModal @close="$emit('close')">
    <template #title>{{ $t('duplicates.mergeTitle') }}</template>
    <div class="merge-layout">
      <div class="merge-side">
        <h5>{{ $t('duplicates.keepPerson') }}</h5>
        <div class="person-card target">
          <strong>{{ targetName }}</strong>
          <div v-if="targetBirth" class="person-meta">{{ $t('persons.birthDate') }}: {{ targetBirth }}</div>
          <div class="person-meta">ID: {{ target.id.slice(0, 8) }}</div>
        </div>
      </div>
      <div class="merge-arrow">←</div>
      <div class="merge-side">
        <h5>{{ $t('duplicates.mergePerson') }}</h5>
        <div class="person-card source">
          <strong>{{ sourceName }}</strong>
          <div v-if="sourceBirth" class="person-meta">{{ $t('persons.birthDate') }}: {{ sourceBirth }}</div>
          <div class="person-meta">ID: {{ source.id.slice(0, 8) }}</div>
        </div>
      </div>
    </div>
    <div class="merge-explanation">
      <p>{{ $t('duplicates.mergeExplanation') }}</p>
      <ul>
        <li v-for="reason in reasons" :key="reason">{{ $t('duplicates.reasons.' + reason, reason) }}</li>
      </ul>
    </div>
    <div class="merge-warning">
      {{ $t('duplicates.mergeWarning') }}
    </div>
    <div class="modal-actions">
      <button type="button" class="btn-cancel" @click="$emit('close')">{{ $t('common.cancel') }}</button>
      <button type="button" class="btn-merge" @click="doMerge" :disabled="merging">
        {{ merging ? $t('duplicates.merging') : $t('duplicates.confirmMerge') }}
      </button>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseModal from './BaseModal.vue';
import { useToast } from '../composables/useToast';

const { t } = useI18n();
const toast = useToast();

const props = defineProps<{
  target: { id: string };
  source: { id: string };
  targetName: string;
  sourceName: string;
  targetBirth: string | null;
  sourceBirth: string | null;
  reasons: string[];
}>();

const emit = defineEmits<{ (e: 'close'): void; (e: 'merged'): void }>();
const merging = ref(false);

async function doMerge() {
  merging.value = true;
  try {
    await window.api.duplicates.merge(props.target.id, props.source.id);
    emit('merged');
  } catch (err) {
    console.error('[MergePersonsModal] merge failed:', err);
    toast.error(t('errors.saveFailed'));
    merging.value = false;
  }
}
</script>

<style scoped>
.merge-layout {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.merge-side {
  flex: 1;
}
.merge-side h5 {
  margin: 0 0 6px;
  font-size: var(--font-sm);
  color: var(--color-text-subtle);
}
.merge-arrow {
  font-size: 24px;
  color: var(--color-text-subtle);
  padding-top: 20px;
}
.person-card {
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
}
.person-card.target {
  background: var(--color-success-bg, #dcfce7);
  border-color: #86efac;
}
.person-card.source {
  background: var(--color-danger-bg, #fee2e2);
  border-color: #fca5a5;
}
.person-meta {
  font-size: var(--font-xs);
  color: var(--color-text-subtle);
  margin-top: 2px;
}
.merge-explanation {
  font-size: var(--font-sm);
  margin-bottom: 12px;
}
.merge-explanation ul {
  margin: 4px 0;
  padding-left: 20px;
}
.merge-warning {
  background: var(--color-warning-bg, #fef3c7);
  color: var(--color-warning-badge, #92400e);
  padding: 8px 12px;
  border-radius: 6px;
  font-size: var(--font-xs);
  margin-bottom: 16px;
}
.btn-merge {
  background: var(--color-danger, #dc2626);
  color: white;
  border: none;
  padding: 6px 16px;
  border-radius: 4px;
  cursor: pointer;
}
.btn-merge:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
