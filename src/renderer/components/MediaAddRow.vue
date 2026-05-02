<template>
  <div class="add-row">
    <MediaPicker
      v-model="pickedId"
      :exclude-ids="excludeIds"
      :placeholder="$t('media.title_label')"
      @attach-file="onAttachFile"
    />
    <AppButton variant="primary" size="sm" :disabled="!pickedId" @click="commitExisting">
      {{ $t('common.add') }}
    </AppButton>
    <AppButton variant="ghost" size="sm" @click="cancel">
      {{ $t('common.cancel') }}
    </AppButton>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import MediaPicker from './MediaPicker.vue';
import AppButton from './ui/AppButton.vue';

defineProps<{
  excludeIds?: string[];
}>();

const emit = defineEmits<{
  committed: [{ mediaId: string }];
  cancelled: [];
}>();

const pickedId = ref<string | null>(null);

function commitExisting() {
  if (!pickedId.value) return;
  const id = pickedId.value;
  pickedId.value = null;
  emit('committed', { mediaId: id });
}

async function onAttachFile(suggestedTitle: string) {
  const result = (await window.api.media.createFromFile({ suggestedTitle })) as
    | { canceled: true }
    | { canceled: false; media: { id: string } };
  if (result.canceled) return;
  emit('committed', { mediaId: result.media.id });
}

function cancel() {
  pickedId.value = null;
  emit('cancelled');
}
</script>

<style scoped>
.add-row {
  display: flex;
  gap: var(--space-xs);
  align-items: center;
  padding: var(--space-xs) 0;
}
.add-row > :first-child { flex: 1; }
</style>
