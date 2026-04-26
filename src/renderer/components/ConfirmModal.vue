<template>
  <BaseSubPanel
    v-if="visible"
    entity-type="neutral"
    :title="title"
    :icon="icon"
    :tone="tone"
    :save-label="resolvedConfirmLabel"
    mode="standalone"
    centered
    @cancel="cancel"
    @close="cancel"
    @save="onConfirm"
  >
    <p>{{ message }}</p>
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
  message: string;
  /** Tone for the confirm button. Defaults to 'danger' (red) to match the original delete use case. */
  tone?: 'info' | 'warning' | 'danger';
  /** Optional icon shown in the panel header. */
  icon?: string;
  /** Override label for the confirm button. Defaults to 'Delete' for danger tone, 'Confirm' otherwise. */
  confirmLabel?: string;
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
