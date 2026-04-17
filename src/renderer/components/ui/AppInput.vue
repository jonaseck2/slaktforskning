<template>
  <div class="app-input" :class="{ 'app-input--error': error }">
    <label v-if="label" class="app-input__label">{{ label }}</label>

    <select
      v-if="type === 'select'"
      :value="modelValue"
      class="app-input__field"
      @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option v-if="placeholder" value="" disabled>{{ placeholder }}</option>
      <option
        v-for="opt in options"
        :key="opt.value"
        :value="opt.value"
      >{{ opt.label }}</option>
    </select>

    <textarea
      v-else-if="type === 'textarea'"
      :value="modelValue as string"
      :placeholder="placeholder"
      class="app-input__field app-input__field--textarea"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />

    <input
      v-else
      type="text"
      :value="modelValue as string"
      :placeholder="placeholder"
      class="app-input__field"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />

    <div v-if="error" class="app-input__error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  modelValue: string | number;
  label?: string;
  type?: 'text' | 'select' | 'textarea';
  error?: string;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
}>(), {
  type: 'text',
  placeholder: '',
  options: () => [],
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();
</script>

<style scoped>
.app-input {
  display: flex;
  flex-direction: column;
}

.app-input__label {
  display: block;
  font-size: var(--font-sm);
  color: var(--text-secondary);
  margin-bottom: var(--space-xs);
}

.app-input__field {
  width: 100%;
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-md);
  padding: var(--space-sm) var(--space-md);
  font-size: var(--font-md);
  color: var(--text-primary);
  background: var(--surface);
  transition: border-color 0.15s, outline 0.15s;
  box-sizing: border-box;
  font-family: inherit;
}

.app-input__field:focus {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
  border-color: var(--accent);
}

.app-input--error .app-input__field {
  border-color: var(--error-text);
}

.app-input__field--textarea {
  min-height: 80px;
  resize: vertical;
}

.app-input__error {
  color: var(--error-text);
  font-size: var(--font-xs);
  margin-top: var(--space-xs);
}
</style>
