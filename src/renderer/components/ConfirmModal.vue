<template>
  <BaseModal v-if="visible" :title-id="titleId" @close="cancel">
    <h3 :id="titleId">{{ title }}</h3>
    <p>{{ message }}</p>
    <div class="modal-actions">
      <button
        class="btn-cancel"
        type="button"
        v-narrate="t('screenReader.btnCancel')"
        @click="cancel"
      >{{ $t('common.cancel') }}</button>
      <button
        class="btn-delete"
        type="button"
        v-narrate="t('screenReader.btnDelete')"
        @click="onConfirm"
      >{{ $t('common.delete') }}</button>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import BaseModal from './BaseModal.vue';

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
