<!--
  Plain text input + autocomplete dropdown for a Place's *name string*.

  Used by the editable Name field in PlaceModal and PlacePanel — both surfaces
  share this component so the autocomplete behaves identically.

  Prime Directive: picking a suggestion ONLY sets the input string. It never
  links to another place's id, never creates a row, and never copies parent /
  type / coordinates from the suggestion. The "Resolved" chips on the parent
  Type / Parent / Coordinates fields re-preview against the new name string
  on the next render — that's the entire effect of picking a suggestion.

  Mirrors PlacePicker's DB + gazetteer search code path so suggestion shape
  stays consistent across the app.
-->
<template>
  <div class="place-name-ac">
    <input
      ref="inputRef"
      v-model="localValue"
      type="text"
      class="place-name-ac-input"
      :placeholder="placeholder || $t('places.searchPlaceholder')"
      role="combobox"
      :aria-expanded="showDropdown && (results.length > 0 || gazetteerResults.length > 0)"
      aria-autocomplete="list"
      :aria-controls="acId + '-listbox'"
      :aria-activedescendant="highlightIndex >= 0 ? acId + '-option-' + highlightIndex : undefined"
      autocomplete="off"
      @input="onUserInput"
      @focus="onFocus"
      @blur="onBlur"
      @keydown="onKeydown"
    />
    <Teleport to="body">
      <ul
        v-if="showDropdown && (results.length > 0 || gazetteerResults.length > 0)"
        :id="acId + '-listbox'"
        role="listbox"
        class="dropdown"
        :style="dropdownStyle"
      >
        <li
          v-for="(place, idx) in results"
          :key="place.id"
          :id="acId + '-option-' + idx"
          role="option"
          :aria-selected="idx === highlightIndex"
          class="dropdown-item"
          :class="{ highlighted: idx === highlightIndex }"
          v-narrate="place.name"
          @mousedown.prevent.stop="pickName(place.name)"
          @click.stop
        >
          <div class="place-main">
            <span class="place-name">{{ place.name }}</span>
            <span v-if="place.place_type" class="place-type">{{ $te('placeTypes.' + place.place_type) ? $t('placeTypes.' + place.place_type) : place.place_type }}</span>
          </div>
          <div v-if="place.parent_name" class="place-subtitle">{{ place.parent_name }}</div>
        </li>
        <li
          v-for="(gaz, gIdx) in gazetteerResults"
          :key="'gaz-' + gIdx"
          :id="acId + '-option-' + (results.length + gIdx)"
          role="option"
          :aria-selected="(results.length + gIdx) === highlightIndex"
          class="dropdown-item gazetteer-item"
          :class="{ highlighted: (results.length + gIdx) === highlightIndex }"
          v-narrate="gaz.name"
          @mousedown.prevent.stop="pickName(gaz.name)"
          @click.stop
        >
          <div class="place-main">
            <span class="place-name">{{ gaz.name }}</span>
            <span v-if="gaz.leafType" class="place-type">{{ $te('placeTypes.' + gaz.leafType) ? $t('placeTypes.' + gaz.leafType) : gaz.leafType }}</span>
          </div>
          <div v-if="gaz.parentChain" class="place-subtitle">{{ gaz.parentChain }}</div>
        </li>
      </ul>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { usePlaceResolver } from '../composables/usePlaceResolver';
import { searchGazetteer, resolveHierarchical, tokenizePlaceString } from '../../api/place-gazetteers/resolver';

interface PlaceRow { id: string; name: string; place_type: string | null; parent_name?: string | null; }
interface GazetteerSuggestion {
  name: string;
  leafType: string | null;
  /** "Mosås › Örebro län › Sverige" — pretty path for the dropdown subtitle. */
  parentChain: string;
}

const props = defineProps<{
  modelValue: string;
  /** Optional placeholder override (defaults to places.searchPlaceholder). */
  placeholder?: string;
  /** DB place id to omit from suggestions — e.g. the place currently being
   * edited in PlacePanel, so we don't suggest "rename to your own name". */
  excludePlaceId?: string | null;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: string];
  /** Fires on blur with the final string (after the dropdown has had a chance
   * to commit a click). PlacePanel uses this for save-on-blur; PlaceModal
   * relies on update:modelValue + Save. */
  change: [value: string];
}>();

const acId = 'place-name-ac-' + Math.random().toString(36).slice(2, 8);

const { ready: gazetteerReady, ensureLoaded: ensureGazetteersLoaded, getGazetteers } = usePlaceResolver();

const results = ref<PlaceRow[]>([]);
const gazetteerResults = ref<GazetteerSuggestion[]>([]);
const showDropdown = ref(false);
const highlightIndex = ref(-1);
const inputRef = ref<HTMLInputElement | null>(null);
const dropdownStyle = ref<Record<string, string>>({});
let debounceTimer: ReturnType<typeof setTimeout>;

// Local copy of the input string. We can't bind `:value="modelValue"`
// directly: every reactive change inside the component (results loading,
// gazetteer hits arriving) triggers a re-render that re-applies the
// `:value` binding, snapping the user's in-progress text back to the
// last-committed prop. PlacePicker uses the same local-ref pattern.
const localValue = ref(props.modelValue);
// Sync prop → local when the panel switches to a different entity. We do NOT
// watch localValue and re-emit / re-search from there: that would conflate
// user typing with prop-driven re-sync (panel switching to a new place
// would open the dropdown and run a search). The @input handler handles
// the user-typing path explicitly.
watch(() => props.modelValue, (v) => { localValue.value = v; });

function updateDropdownPosition() {
  const el = inputRef.value;
  if (!el) return;
  const r = el.getBoundingClientRect();
  dropdownStyle.value = {
    position: 'fixed',
    top: `${r.bottom + 2}px`,
    left: `${r.left}px`,
    width: `${r.width}px`,
  };
}
function onScroll() { if (showDropdown.value) updateDropdownPosition(); }
onMounted(() => {
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onScroll);
});
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll, true);
  window.removeEventListener('resize', onScroll);
});
watch(showDropdown, (o) => { if (o) nextTick(updateDropdownPosition); });
watch([results, gazetteerResults], () => {
  highlightIndex.value = -1;
  if (showDropdown.value) nextTick(updateDropdownPosition);
});

async function runSearch(query: string) {
  if (query.length < 1) { results.value = []; gazetteerResults.value = []; return; }

  // DB hits — exclude the row being edited so the user isn't told to "rename
  // to itself".
  const dbResults = (await window.api.places.search(query)) as PlaceRow[];
  const filtered = props.excludePlaceId
    ? dbResults.filter(r => r.id !== props.excludePlaceId)
    : dbResults;
  results.value = filtered.slice(0, 5);

  // Gazetteer hits — same code path PlacePicker uses for the parent picker.
  if (!gazetteerReady.value) await ensureGazetteersLoaded();

  const suggestions: GazetteerSuggestion[] = [];
  const tokens = tokenizePlaceString(query);

  // Tier 1 — hierarchical, parent-aware match.
  if (tokens.length > 1) {
    const hier = resolveHierarchical(query, getGazetteers());
    if (hier.best && hier.candidates.length > 0) {
      const seen = new Set<string>();
      for (const cand of hier.candidates.slice(0, 5)) {
        const node = cand.node;
        const leafName = cand.unmatchedLeftTokens.length > 0
          ? cand.unmatchedLeftTokens.join(', ')
          : node.name;
        const pathStr = cand.path.map(n => n.name).join('>');
        const key = `${leafName.toLowerCase()}|${pathStr}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const parentChain = [...cand.path].reverse().map(n => n.name).join(' › ');
        suggestions.push({
          name: leafName,
          leafType: node.type ?? null,
          parentChain,
        });
      }
    }
  }

  // Tier 0 fallback — flat full-tree search by node name.
  if (suggestions.length === 0) {
    const hits = searchGazetteer(query, getGazetteers(), 5);
    const seen = new Set<string>();
    for (const hit of hits) {
      const pathStr = hit.path.map(n => n.name).join('>');
      const key = `${hit.node.name.toLowerCase()}|${hit.node.type}|${pathStr}`;
      if (seen.has(key)) continue;
      seen.add(key);
      suggestions.push({
        name: hit.node.name,
        leafType: hit.node.type ?? null,
        parentChain: hit.path.map(n => n.name).join(' › '),
      });
    }
  }

  // Drop suggestions whose name is identical (case-insensitive) to a DB hit
  // we're already showing — the user doesn't need to see "Stockholm" twice.
  const dbNames = new Set(results.value.map(r => r.name.toLowerCase()));
  gazetteerResults.value = suggestions.filter(s => !dbNames.has(s.name.toLowerCase()));
}

function onUserInput() {
  // localValue is already in sync via v-model. Treat any input event as the
  // user typing (paste counts) — emit, open the dropdown, debounce a search.
  emit('update:modelValue', localValue.value);
  clearTimeout(debounceTimer);
  if (localValue.value.length < 1) {
    results.value = [];
    gazetteerResults.value = [];
    return;
  }
  showDropdown.value = true;
  debounceTimer = setTimeout(() => runSearch(localValue.value), 150);
}

function onFocus() {
  showDropdown.value = true;
  // If there's already typed text, run a search on focus so re-focusing shows
  // suggestions without requiring another keystroke.
  if (localValue.value && localValue.value.length >= 1) runSearch(localValue.value);
}

function onBlur() {
  // 150 ms gives mousedown handlers on the dropdown items time to fire before
  // the blur tears down the listbox. Same pattern as PlacePicker.
  setTimeout(() => {
    showDropdown.value = false;
    emit('change', localValue.value);
  }, 150);
}

function pickName(name: string) {
  localValue.value = name;
  emit('update:modelValue', name);
  showDropdown.value = false;
  // Refocus so the user can keep editing without an extra click.
  nextTick(() => inputRef.value?.focus());
}

defineExpose({
  focus: () => inputRef.value?.focus(),
});

function totalOptions(): number {
  return results.value.length + gazetteerResults.value.length;
}

function onKeydown(e: KeyboardEvent) {
  if (!showDropdown.value) return;
  const total = totalOptions();
  if (total === 0) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    highlightIndex.value = Math.min(highlightIndex.value + 1, total - 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    highlightIndex.value = Math.max(highlightIndex.value - 1, 0);
  } else if (e.key === 'Enter' && highlightIndex.value >= 0) {
    e.preventDefault();
    const dbCount = results.value.length;
    if (highlightIndex.value < dbCount) {
      pickName(results.value[highlightIndex.value].name);
    } else {
      pickName(gazetteerResults.value[highlightIndex.value - dbCount].name);
    }
  } else if (e.key === 'Escape') {
    showDropdown.value = false;
  }
}
</script>

<style scoped>
.place-name-ac { position: relative; width: 100%; box-sizing: border-box; }
.place-name-ac-input {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 8px;
  font-size: var(--font-base);
  font-family: inherit;
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  background: var(--surface-bg);
  color: var(--text-primary);
}
.place-name-ac-input:focus {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
  border-color: var(--accent);
  background: var(--surface);
}
/* Teleported to <body>; position is set inline from inputRef's bounding rect.
   Scoped styles still apply because Vue keeps the data-v-* attribute. */
.dropdown {
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-md);
  z-index: 1000;
  max-height: 240px;
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: 0;
}
.dropdown-item {
  padding: 8px 12px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  font-size: var(--font-base);
}
.dropdown-item:hover,
.dropdown-item.highlighted { background: var(--surface-hover); }
.place-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.place-type {
  font-size: var(--font-xs);
  color: var(--text-muted);
}
.place-subtitle {
  font-size: var(--font-xs);
  color: var(--text-muted);
  margin-top: 2px;
}
</style>
