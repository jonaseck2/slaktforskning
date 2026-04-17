<template>
  <BaseModal v-if="visible" :title-id="titleId" @close="cancel">
    <h3 :id="titleId">{{ title }}</h3>
    <p>{{ message }}</p>
    <div class="modal-actions">
      <AppButton
        variant="secondary"
        v-narrate="t('screenReader.btnCancel')"
        @click="cancel"
      >{{ $t('common.cancel') }}</AppButton>
      <AppButton
        variant="danger"
        v-narrate="t('screenReader.btnDelete')"
        @click="onConfirm"
      >{{ $t('common.delete') }}</AppButton>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import BaseModal from './BaseModal.vue';
import AppButton from './ui/AppButton.vue';

const { t } = useI18n();

const titleId = 'confirm-modal-title-' + Math.random().toString(36).slice(2, 8);

defineProps<{
  visible: boolean;
  title: string;
  message: string;
}>();

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();

function onConfirm() { emit('confirm'); }
function cancel() { emit('cancel'); }
</script>
