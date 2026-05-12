<template>
  <BaseSubPanel
    entity-type="neutral"
    :label="$t('linkRules.entity')"
    :title="modalTitle"
    mode="standalone"
    @cancel="$emit('cancel')"
    @close="$emit('close')"
    @save="handleSave"
  >
    <div class="ep-fields">
      <div class="ep-field">
        <label class="ep-field-label" for="link-rule-name">{{ $t('linkRules.name') }}</label>
        <input
          id="link-rule-name"
          ref="nameRef"
          class="ep-input"
          v-model="form.name"
          :readonly="props.mode === 'view'"
        />
      </div>
      <div class="ep-field">
        <label class="ep-field-label" for="link-rule-pattern">{{ $t('linkRules.pattern') }}</label>
        <input
          id="link-rule-pattern"
          class="ep-input mono"
          v-model="form.pattern"
          :readonly="props.mode === 'view'"
          :class="{ 'ep-input--error': patternError }"
        />
        <span v-if="patternError" class="ep-field-error">{{ patternError }}</span>
      </div>
      <div class="ep-field">
        <label class="ep-field-label" for="link-rule-url-template">{{ $t('linkRules.urlTemplate') }}</label>
        <input
          id="link-rule-url-template"
          class="ep-input mono"
          v-model="form.urlTemplate"
          :readonly="props.mode === 'view'"
        />
      </div>
      <div class="ep-field">
        <label class="ep-field-label" for="link-rule-example">{{ $t('linkRules.example') }}</label>
        <input
          id="link-rule-example"
          class="ep-input"
          v-model="form.example"
          :placeholder="props.mode === 'add' ? $t('linkRules.examplePlaceholder') : ''"
          :readonly="props.mode === 'view'"
        />
      </div>
      <div v-if="props.mode === 'add' && form.example && form.pattern" class="ep-example-test">
        <span v-if="exampleMatchResult === 'valid'" class="ep-match-ok">&#x2713; {{ $t('linkRules.exampleMatches') }}</span>
        <span v-else-if="exampleMatchResult === 'no-match'" class="ep-match-fail">&#x2717; {{ $t('linkRules.exampleNoMatch') }}</span>
        <span v-else-if="exampleMatchResult === 'bad-regex'" class="ep-match-fail">&#x2717; {{ patternError }}</span>
        <div v-if="exampleMatchUrl" class="ep-match-url">→ {{ exampleMatchUrl }}</div>
      </div>
      <div class="ep-field">
        <label class="ep-field-label" for="link-rule-priority">{{ $t('linkRules.priority') }}</label>
        <input
          id="link-rule-priority"
          class="ep-input"
          v-model.number="form.priority"
          type="number"
          min="0"
          max="999"
          :readonly="props.mode === 'view'"
        />
      </div>
    </div>
  </BaseSubPanel>
</template>

<script setup lang="ts">
import { computed, reactive, ref, onMounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseSubPanel from './BaseSubPanel.vue';
import { linkify, type LinkRule } from '../../../api/source-linker';

const { t } = useI18n();

const props = defineProps<{
  mode: 'add' | 'view';
  editingRule?: LinkRule | null;
}>();

const emit = defineEmits<{
  cancel: [];
  close: [];
  saved: [rule: LinkRule];
}>();

const nameRef = ref<HTMLInputElement | null>(null);

const form = reactive({
  name: props.editingRule?.name ?? '',
  pattern: props.editingRule?.pattern ?? '',
  urlTemplate: props.editingRule?.urlTemplate ?? '',
  example: props.editingRule?.example ?? '',
  priority: props.editingRule?.priority ?? 50,
});

const patternError = ref('');

const modalTitle = computed(() =>
  props.mode === 'view' ? (props.editingRule?.name ?? '') : t('linkRules.addRule')
);

const exampleMatchResult = computed<'valid' | 'no-match' | 'bad-regex' | null>(() => {
  if (!form.example || !form.pattern) return null;
  try {
    const regex = new RegExp(form.pattern);
    return regex.test(form.example) ? 'valid' : 'no-match';
  } catch {
    return 'bad-regex';
  }
});

const exampleMatchUrl = computed<string | null>(() => {
  if (exampleMatchResult.value !== 'valid' || !form.urlTemplate) return null;
  const segments = linkify(form.example, [{
    id: 'preview',
    name: 'Preview',
    pattern: form.pattern,
    urlTemplate: form.urlTemplate,
    locale: '*',
    enabled: true,
    priority: 0,
  }]);
  const linked = segments.find((s) => s.url);
  return linked?.url ?? null;
});

function handleSave() {
  if (props.mode === 'view') return;
  patternError.value = '';
  if (!form.name.trim() || !form.pattern.trim() || !form.urlTemplate.trim()) return;
  try {
    new RegExp(form.pattern);
  } catch (e) {
    patternError.value = String(e);
    return;
  }
  const id = 'custom-' + Date.now();
  const rule: LinkRule = {
    id,
    name: form.name.trim(),
    pattern: form.pattern.trim(),
    urlTemplate: form.urlTemplate.trim(),
    priority: form.priority,
    locale: '*',
    enabled: true,
  };
  if (form.example.trim()) {
    rule.example = form.example.trim();
  }
  emit('saved', rule);
}

onMounted(() => {
  if (props.mode === 'add') nextTick(() => nameRef.value?.focus());
});
</script>

<style scoped>
.mono {
  font-family: monospace;
  font-size: var(--font-xs);
}

.ep-input--error {
  border-color: var(--error-text) !important;
}

.ep-field-error {
  display: block;
  color: var(--error-text);
  font-size: var(--font-xs);
  margin-top: var(--space-xs);
}

.ep-example-test {
  padding: var(--space-xs) 0 0;
  font-size: var(--font-sm);
}

.ep-match-ok {
  color: var(--success-text);
}

.ep-match-fail {
  color: var(--error-text);
}

.ep-match-url {
  font-family: monospace;
  font-size: var(--font-xs);
  color: var(--text-muted);
  margin-top: var(--space-xs);
  word-break: break-all;
}
</style>
