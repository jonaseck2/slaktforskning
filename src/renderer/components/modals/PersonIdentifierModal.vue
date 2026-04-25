<template>
  <BaseSubPanel
    entity-type="identifier"
    :title="$t('identifiers.addTitle')"
    :mode="mode"
    @cancel="$emit('cancel')"
    @save="handleSave"
    @close="$emit('close')"
  >
    <div class="ep-fields">
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('identifiers.type') }}</span>
        <select class="ep-input" v-model="form.identifier_type">
          <option value="familysearch">{{ $t('identifiers.types.familysearch') }}</option>
          <option value="ancestry">{{ $t('identifiers.types.ancestry') }}</option>
          <option value="riksarkivet">{{ $t('identifiers.types.riksarkivet') }}</option>
          <option value="personnummer">{{ $t('identifiers.types.personnummer') }}</option>
          <option value="refn">{{ $t('identifiers.types.refn') }}</option>
          <option value="rin">{{ $t('identifiers.types.rin') }}</option>
          <option value="other">{{ $t('identifiers.types.other') }}</option>
        </select>
      </div>
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('identifiers.value') }}</span>
        <input ref="valueRef" class="ep-input" v-model="form.identifier_value" type="text" required />
      </div>
    </div>
  </BaseSubPanel>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted, nextTick } from 'vue';
import BaseSubPanel from './BaseSubPanel.vue';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const props = withDefaults(defineProps<{
  personId: string;
  mode?: 'standalone' | 'subpanel';
}>(), {
  mode: 'standalone',
});

const emit = defineEmits<{
  cancel: [];
  close: [];
  saved: [];
}>();

const valueRef = ref<HTMLInputElement | null>(null);

const form = reactive({
  identifier_type: 'familysearch',
  identifier_value: '',
});

async function handleSave() {
  if (!form.identifier_value.trim()) return;
  try {
    await window.api.persons.addIdentifier(props.personId, {
      identifier_type: form.identifier_type,
      identifier_value: form.identifier_value,
    });
    emit('saved');
  } catch (err) {
    console.error('[PersonIdentifierModal] save failed:', err);
  }
}

onMounted(() => nextTick(() => valueRef.value?.focus()));
</script>
