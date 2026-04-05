<template>
  <div class="group-picker">
    <input
      ref="inputEl"
      type="text"
      v-model="query"
      :placeholder="$t('groups.searchOrCreate')"
      @input="onInput"
      @focus="open = true"
      @blur="onBlur"
      @keydown.escape="$emit('cancel')"
    />
    <ul v-if="open && (filtered.length > 0 || query.trim())" class="picker-dropdown">
      <li
        v-for="g in filtered"
        :key="g.id"
        class="picker-option"
        @mousedown.prevent="select(g)"
      >
        {{ g.name }}
        <span class="picker-count">{{ g.memberCount }}</span>
      </li>
      <li
        v-if="query.trim() && !exactMatch"
        class="picker-option picker-create"
        @mousedown.prevent="createAndAdd"
      >
        ＋ {{ $t('groups.createNew') }} "{{ query.trim() }}"
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface GroupOption { id: string; name: string; memberCount: number; }

const props = defineProps<{
  personId: string;
  excludeIds: string[];
}>();

const emit = defineEmits<{
  added: [];
  cancel: [];
}>();

const query = ref('');
const open = ref(false);
const allGroups = ref<GroupOption[]>([]);
const inputEl = ref<HTMLInputElement | null>(null);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  return allGroups.value.filter(
    g => !props.excludeIds.includes(g.id) && (!q || g.name.toLowerCase().includes(q))
  );
});

const exactMatch = computed(() =>
  allGroups.value.some(g => g.name.toLowerCase() === query.value.trim().toLowerCase())
);

async function loadGroups() {
  if (!window.api) return;
  const raw = (await window.api.groups.list()) as Array<{ id: string; name: string }>;
  const options: GroupOption[] = [];
  for (const g of raw) {
    const members = (await window.api.groups.getMembers(g.id)) as unknown[];
    options.push({ id: g.id, name: g.name, memberCount: members.length });
  }
  allGroups.value = options;
}

function onInput() {
  open.value = true;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(loadGroups, 150);
}

function onBlur() {
  setTimeout(() => { open.value = false; }, 200);
}

async function select(g: GroupOption) {
  await window.api.groups.addMember(g.id, props.personId);
  query.value = '';
  open.value = false;
  emit('added');
}

async function createAndAdd() {
  const name = query.value.trim();
  if (!name) return;
  const created = (await window.api.groups.create({ name, notes: '' })) as { id: string };
  await window.api.groups.addMember(created.id, props.personId);
  query.value = '';
  open.value = false;
  emit('added');
}

onMounted(async () => {
  await loadGroups();
  await nextTick();
  inputEl.value?.focus();
});
</script>

<style scoped>
.group-picker { position: relative; }
.group-picker input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
  box-sizing: border-box;
  font-family: inherit;
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
  box-shadow: 0 4px 8px rgba(0,0,0,0.1);
}
.picker-option {
  padding: 8px 10px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
}
.picker-option:hover { background: #eef2ff; }
.picker-create { color: #059669; }
.picker-create:hover { background: #f0fdf4; }
.picker-count { font-size: 12px; color: #aaa; }
</style>
