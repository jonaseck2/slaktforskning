<template>
  <div class="person-picker">
    <div class="picker-input-wrap">
      <input
        ref="inputEl"
        type="text"
        :value="searchQuery"
        :placeholder="placeholder"
        @input="onInput"
        @focus="open = true"
        @blur="onBlur"
      />
      <button v-if="modelValue" type="button" class="picker-clear" @click="clear">&times;</button>
    </div>
    <ul v-if="open && results.length > 0" class="picker-dropdown">
      <li
        v-for="person in results"
        :key="person.id"
        class="picker-option"
        @mousedown.prevent="select(person)"
      >
        <span class="picker-name">{{ person.given_name }} {{ person.surname }}</span>
        <span class="picker-sex">{{ person.sex }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface PersonResult {
  id: string;
  given_name: string;
  surname: string;
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

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

// When modelValue is set externally, load the person's name
watch(
  () => props.modelValue,
  async (id) => {
    if (id && window.api) {
      const names = (await window.api.persons.getNames(id)) as Array<{ given_name: string; surname: string }>;
      if (names.length > 0) {
        searchQuery.value = `${names[0].given_name} ${names[0].surname}`.trim();
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
  searchQuery.value = `${person.given_name} ${person.surname}`.trim();
  emit('update:modelValue', person.id);
  emit('select', person);
  open.value = false;
}

function clear() {
  searchQuery.value = '';
  emit('update:modelValue', null);
  results.value = [];
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
  font-size: 14px;
}
.picker-clear {
  background: none;
  border: none;
  font-size: 18px;
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
  background: white;
  border: 1px solid #ccc;
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
  background: #eef2ff;
}
.picker-name {
  font-size: 14px;
}
.picker-sex {
  font-size: 12px;
  color: #888;
  margin-left: 8px;
}
</style>
