<template>
  <BaseSubPanel
    entity-type="source"
    :title="form.title || $t('sources.newSource')"
    mode="subpanel"
    @cancel="$emit('cancel')"
    @save="save"
    @close="$emit('close')"
  >
    <div class="ep-fields">
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('sources.sourceTitle') }}</span>
        <input
          ref="titleRef"
          class="ep-input"
          v-model="form.title"
          :placeholder="$t('sources.titlePlaceholder')"
          required
        />
      </div>
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('sources.sourceType') }}</span>
        <select class="ep-input" v-model="form.source_type">
          <option v-for="st in SOURCE_TYPE_VALUES" :key="st" :value="st">
            {{ $t('sourceTypes.' + st) }}
          </option>
        </select>
      </div>
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('sources.author') }}</span>
        <input class="ep-input" v-model="form.author" :placeholder="$t('sources.authorPlaceholder')" />
      </div>
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('sources.publicationInfo') }}</span>
        <input class="ep-input" v-model="form.publication_info" :placeholder="$t('sources.publicationInfoPlaceholder')" />
      </div>
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('sources.url') }}</span>
        <input class="ep-input" v-model="form.url" type="url" :placeholder="$t('sources.urlPlaceholder')" />
      </div>
    </div>
  </BaseSubPanel>
</template>

<script setup lang="ts">
import { reactive, ref, nextTick, onMounted } from 'vue';
import BaseSubPanel from './BaseSubPanel.vue';
import { SOURCE_TYPE_VALUES } from '../../constants/eventTypes';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface Source { id: string; title: string; }

const emit = defineEmits<{
  cancel: [];
  close: [];
  saved: [sourceId: string, sourceTitle: string];
}>();

const titleRef = ref<HTMLInputElement | null>(null);

const form = reactive({
  title: '',
  source_type: 'church_record',
  author: '',
  publication_info: '',
  url: '',
});

onMounted(() => nextTick(() => titleRef.value?.focus()));

async function save() {
  if (!window.api || !form.title.trim()) return;
  try {
    const source = (await window.api.sources.create({
      title: form.title,
      source_type: form.source_type,
      author: form.author,
      publication_info: form.publication_info,
      url: form.url,
    })) as Source;
    emit('saved', source.id, source.title);
  } catch (err) {
    console.error('[SourceModal] save failed:', err);
  }
}
</script>
