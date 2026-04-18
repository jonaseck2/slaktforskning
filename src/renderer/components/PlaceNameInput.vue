<template>
  <div class="place-name-input">
    <input
      ref="inputEl"
      type="text"
      :value="displayValue"
      :class="inputClass"
      autocomplete="off"
      @input="onInput"
      @focus="editing = true"
      @blur="onBlur"
      @keydown="onKeydown"
    />
    <ul v-if="showSuggestions && suggestions.length > 0" class="name-dropdown">
      <li
        v-for="(sug, idx) in suggestions"
        :key="idx"
        class="name-suggestion"
        :class="{ highlighted: idx === highlightIndex }"
        @mousedown.prevent="accept(sug)"
      >
        <span class="sug-path">{{ sug.matchedPath.join(', ') }}</span>
        <span class="sug-type">{{ sug.pathNodes[sug.pathNodes.length - 1]?.type }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { usePlaceResolver } from '../composables/usePlaceResolver';
import { searchGazetteer } from '../../api/place-gazetteers/resolver';

interface GazetteerSuggestion {
  matchedPath: string[];
  pathNodes: { name: string; type: string; lat: number; lon: number }[];
}

const props = defineProps<{
  modelValue: string;
  inputClass?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'save': [name: string];
  'accept': [suggestion: GazetteerSuggestion];
}>();

const { ready, ensureLoaded, getGazetteers } = usePlaceResolver();

const inputEl = ref<HTMLInputElement | null>(null);
const suggestions = ref<GazetteerSuggestion[]>([]);
const showSuggestions = ref(false);
const highlightIndex = ref(-1);
let debounceTimer: ReturnType<typeof setTimeout>;
let accepting = false;
let editing = ref(false);
let localValue = ref(props.modelValue);

// Show local value while editing, prop value otherwise
const displayValue = computed(() => editing.value ? localValue.value : props.modelValue);

// Sync from prop when not editing (e.g. after accept completes)
watch(() => props.modelValue, (v) => { if (!editing.value) localValue.value = v; });

function onInput(e: Event) {
  localValue.value = (e.target as HTMLInputElement).value;
  emit('update:modelValue', localValue.value);
  clearTimeout(debounceTimer);
  if (localValue.value.length < 2) { suggestions.value = []; showSuggestions.value = false; return; }
  debounceTimer = setTimeout(async () => {
    if (!ready.value) await ensureLoaded();
    const hits = searchGazetteer(localValue.value, getGazetteers(), 8);
    const seen = new Set<string>();
    const results: GazetteerSuggestion[] = [];
    for (const hit of hits) {
      const key = hit.path.map(n => n.name).join('>');
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        matchedPath: hit.path.map(n => n.name),
        pathNodes: hit.path.map(n => ({ name: n.name, type: n.type, lat: n.lat, lon: n.lon })),
      });
    }
    results.sort((a, b) => b.pathNodes.length - a.pathNodes.length);
    suggestions.value = results;
    showSuggestions.value = results.length > 0;
    highlightIndex.value = -1;
  }, 150);
}

function onBlur() {
  setTimeout(() => {
    if (accepting) return;
    editing.value = false;
    showSuggestions.value = false;
    emit('save', localValue.value);
  }, 200);
}

function onKeydown(e: KeyboardEvent) {
  if (!showSuggestions.value || suggestions.value.length === 0) {
    if (e.key === 'Enter') { e.preventDefault(); editing.value = false; emit('save', localValue.value); }
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    highlightIndex.value = Math.min(highlightIndex.value + 1, suggestions.value.length - 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    highlightIndex.value = Math.max(highlightIndex.value - 1, 0);
  } else if (e.key === 'Enter' && highlightIndex.value >= 0) {
    e.preventDefault();
    accept(suggestions.value[highlightIndex.value]);
  } else if (e.key === 'Escape') {
    showSuggestions.value = false;
  }
}

function accept(sug: GazetteerSuggestion) {
  accepting = true;
  showSuggestions.value = false;
  editing.value = false;
  const newName = [...sug.matchedPath].reverse().join(', ');
  localValue.value = newName;
  emit('update:modelValue', newName);
  emit('accept', sug);
  setTimeout(() => { accepting = false; }, 50);
}
</script>

<style scoped>
.place-name-input { position: relative; }
.place-name-input input { width: 100%; box-sizing: border-box; }
.name-dropdown {
  position: absolute; top: 100%; left: 0; right: 0; z-index: 100;
  background: var(--color-bg, #fff); border: 1px solid var(--color-border-input, #ccc);
  border-radius: 0 0 4px 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  list-style: none; margin: 0; padding: 0; max-height: 200px; overflow-y: auto;
}
.name-suggestion {
  padding: 8px 12px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;
}
.name-suggestion:hover, .name-suggestion.highlighted { background: var(--color-row-hover, #f0f0f0); }
.sug-path { font-size: var(--font-sm); }
.sug-type { font-size: var(--font-xs); color: var(--text-muted); margin-left: 8px; }
</style>
