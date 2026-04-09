<template>
  <div class="person-picker">
    <div class="picker-input-wrap">
      <input
        ref="inputEl"
        type="text"
        :value="searchQuery"
        :placeholder="placeholder"
        role="combobox"
        :aria-expanded="open && results.length > 0"
        aria-autocomplete="list"
        :aria-controls="pickerId + '-listbox'"
        :aria-activedescendant="highlightIndex >= 0 ? pickerId + '-option-' + results[highlightIndex]?.id : undefined"
        @input="onInput"
        @focus="open = true"
        @blur="onBlur"
        @keydown="onKeydown"
      />
      <button v-if="modelValue" type="button" class="picker-clear" :aria-label="$t('a11y.clearSearch')" @click="clear">&times;</button>
    </div>
    <ul v-if="open && results.length > 0" :id="pickerId + '-listbox'" role="listbox" class="picker-dropdown">
      <li
        v-for="(person, idx) in results"
        :key="person.id"
        :id="pickerId + '-option-' + person.id"
        role="option"
        :aria-selected="idx === highlightIndex"
        class="picker-option"
        :class="{ highlighted: idx === highlightIndex }"
        v-narrate="[person.given_name, person.surname].filter(Boolean).join(' ')"
        @mousedown.prevent="select(person)"
      >
        <span class="picker-name"><PersonName :given-name="person.given_name" :surname="person.surname" :preferred-name="person.preferred_name" :nickname="person.nickname" /></span>
        <span class="picker-sex">{{ person.sex }}</span>
      </li>
    </ul>
    <div v-if="open && results.length > 0" class="sr-only" aria-live="polite">
      {{ $t('a11y.searchResults', { count: results.length }, results.length) }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, inject } from 'vue';
import { useI18n } from 'vue-i18n';

const pickerId = 'person-picker-' + Math.random().toString(36).slice(2, 8);
import PersonName from './PersonName.vue';

const { t } = useI18n();
const screenReader = inject('screenReader', null) as any;

interface PersonResult {
  id: string;
  given_name: string;
  surname: string;
  preferred_name: string | null;
  nickname: string | null;
  sex: string;
}

const props = defineProps<{
  modelValue: string | null;
  placeholder?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string | null];
  select: [person: PersonResult];
}>();

const searchQuery = ref('');
const results = ref<PersonResult[]>([]);
const open = ref(false);
const inputEl = ref<HTMLInputElement | null>(null);
const highlightIndex = ref(-1);

// Reset highlight when results change
watch(results, () => { highlightIndex.value = -1; });

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

// When modelValue is set externally, load the person's name
watch(
  () => props.modelValue,
  async (id) => {
    if (id && window.api) {
      const names = (await window.api.persons.getNames(id)) as Array<{ given_name: string; surname: string; preferred_name: string | null }>;
      if (names.length > 0) {
        const n = names[0];
        searchQuery.value = `${n.given_name ?? ''} ${n.surname ?? ''}`.trim();
      }
    } else if (!id) {
      searchQuery.value = '';
    }
  },
  { immediate: true },
);

async function search(query: string) {
  if (!window.api || query.length < 1) {
    results.value = [];
    return;
  }
  results.value = (await window.api.persons.search(query)) as PersonResult[];
}

function onInput(e: Event) {
  const val = (e.target as HTMLInputElement).value;
  searchQuery.value = val;
  open.value = true;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => search(val), 150);
}

function select(person: PersonResult) {
  const name = `${person.given_name ?? ''} ${person.surname ?? ''}`.trim();
  searchQuery.value = name;
  emit('update:modelValue', person.id);
  emit('select', person);
  open.value = false;
  if (screenReader?.isScreenReader?.value) {
    screenReader.speak(t('screenReader.selected', { name }));
  }
}

function clear() {
  searchQuery.value = '';
  emit('update:modelValue', null);
  results.value = [];
}

function onKeydown(e: KeyboardEvent) {
  if (!open.value || results.value.length === 0) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    highlightIndex.value = Math.min(highlightIndex.value + 1, results.value.length - 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    highlightIndex.value = Math.max(highlightIndex.value - 1, 0);
  } else if (e.key === 'Enter' && highlightIndex.value >= 0) {
    e.preventDefault();
    select(results.value[highlightIndex.value]);
  } else if (e.key === 'Escape') {
    open.value = false;
  }
}

function onBlur() {
  // Small delay to allow mousedown on dropdown to fire first
  setTimeout(() => {
    open.value = false;
  }, 200);
}
</script>

<style scoped>
.person-picker {
  position: relative;
  width: 100%;
  box-sizing: border-box;
}
.picker-input-wrap {
  display: flex;
  align-items: center;
}
.picker-input-wrap input {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: var(--font-base);
}
.picker-clear {
  background: none;
  border: none;
  font-size: var(--font-xl);
  cursor: pointer;
  color: #999;
  padding: 0 6px;
  line-height: 1;
}
.picker-clear:hover {
  color: #333;
}
.picker-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--color-bg);
  border: 1px solid var(--color-border-input);
  border-top: none;
  border-radius: 0 0 4px 4px;
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 200px;
  overflow-y: auto;
  z-index: 100;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}
.picker-option {
  padding: 8px 10px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.picker-option:hover {
  background: var(--color-row-hover);
}
.picker-name {
  font-size: var(--font-base);
}
.picker-sex {
  font-size: var(--font-xs);
  color: #888;
  margin-left: 8px;
}
.picker-option.highlighted {
  background: var(--color-row-hover);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
