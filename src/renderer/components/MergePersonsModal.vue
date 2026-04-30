<template>
  <BaseSubPanel
    entity-type="person"
    :title="$t('duplicates.mergeTitle')"
    mode="standalone"
    :save-label="merging ? $t('duplicates.merging') : $t('duplicates.confirmMerge')"
    @cancel="$emit('close')"
    @close="$emit('close')"
    @save="doMerge"
  >
    <div class="ep-fields merge-body">
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
    </div>
  </BaseSubPanel>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseSubPanel from './modals/BaseSubPanel.vue';
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
  if (merging.value) return;
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
  gap: var(--space-md);
  margin-bottom: var(--space-lg);
}
.merge-side {
  flex: 1;
}
.merge-side h5 {
  margin: 0 0 var(--space-sm);
  font-size: var(--font-sm);
  color: var(--text-muted);
}
.merge-arrow {
  font-size: 24px;
  color: var(--text-muted);
  padding-top: var(--space-lg);
}
.person-card {
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  border: 1px solid var(--surface-border);
}
.person-card.target {
  background: var(--success-bg);
  border-color: var(--success-text);
}
.person-card.source {
  background: var(--error-bg);
  border-color: var(--error-text);
}
.person-meta {
  font-size: var(--font-xs);
  color: var(--text-muted);
  margin-top: var(--space-xs);
}
.merge-explanation {
  font-size: var(--font-sm);
  margin-bottom: var(--space-md);
}
.merge-explanation ul {
  margin: var(--space-xs) 0;
  padding-left: var(--space-lg);
}
.merge-warning {
  background: var(--warning-bg);
  color: var(--warning-text);
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  font-size: var(--font-xs);
  margin-bottom: var(--space-lg);
}
</style>
