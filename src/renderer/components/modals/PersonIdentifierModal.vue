<template>
  <BaseSubPanel
    entity-type="identifier"
    :title="displayTitle"
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
import { reactive, ref, computed, onMounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
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

const { t } = useI18n();

const valueRef = ref<HTMLInputElement | null>(null);

const form = reactive({
  identifier_type: 'familysearch',
  identifier_value: '',
});

const personName = ref('');

const displayTitle = computed(() => {
  const base = t('identifiers.addTitle');
  return personName.value ? t('identifiers.titleFor', { title: base, name: personName.value }) : base;
});

async function loadPersonName() {
  if (!window.api) return;
  try {
    const names = (await window.api.persons.getNames(props.personId)) as Array<{ given_name: string; surname: string }>;
    const primary = names[0];
    if (primary) personName.value = [primary.given_name, primary.surname].filter(Boolean).join(' ');
  } catch { /* ignore */ }
}

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

onMounted(async () => {
  await loadPersonName();
  await nextTick();
  valueRef.value?.focus();
});
</script>
