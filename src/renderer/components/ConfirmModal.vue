<template>
  <BaseSubPanel
    v-if="visible"
    entity-type="neutral"
    :title="title"
    :icon="icon"
    :tone="tone"
    :save-label="resolvedConfirmLabel"
    :cancel-label="cancelLabel"
    mode="standalone"
    centered
    @cancel="cancel"
    @close="cancel"
    @save="onConfirm"
  >
    <div class="ep-fields confirm-body">
      <p v-if="message">{{ message }}</p>
      <p v-for="(line, i) in messages ?? []" :key="i">{{ line }}</p>
    </div>
  </BaseSubPanel>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseSubPanel from './modals/BaseSubPanel.vue';

const { t } = useI18n();

const props = withDefaults(defineProps<{
  visible: boolean;
  title: string;
  /** Single-paragraph message. Use `messages` for multiple paragraphs. */
  message?: string;
  /** Multi-paragraph body (rendered as one `<p>` per item). */
  messages?: string[];
  /** Tone for the confirm button. Defaults to 'danger' (red) to match the original delete use case. */
  tone?: 'info' | 'warning' | 'danger';
  /** Optional icon shown in the panel header. */
  icon?: string;
  /** Override label for the confirm button. Defaults to 'Delete' for danger tone, 'Confirm' otherwise. */
  confirmLabel?: string;
  /** Override label for the cancel button. Defaults to 'Cancel' (via BaseSubPanel). */
  cancelLabel?: string;
}>(), {
  tone: 'danger',
});

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();

const resolvedConfirmLabel = computed(() => {
  if (props.confirmLabel !== undefined) return props.confirmLabel;
  return props.tone === 'danger' ? t('common.delete') : t('common.confirm');
});

function onConfirm() { emit('confirm'); }
function cancel() { emit('cancel'); }
</script>

<style scoped>
.confirm-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}
.confirm-body p {
  margin: 0;
  font-size: var(--font-base);
  line-height: 1.5;
}
</style>
