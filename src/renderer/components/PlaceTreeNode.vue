<template>
  <li
    role="treeitem"
    :aria-level="level"
    :aria-expanded="node.hasChildren ? node.expanded : undefined"
    :aria-selected="isSelected"
    :class="['tree-node', { selected: isSelected }]"
    v-narrate="narrationText"
  >
    <div class="row" @click="onSelect">
      <button
        v-if="node.hasChildren"
        type="button"
        class="chevron"
        :aria-label="node.expanded ? $t('places.tree.collapse') : $t('places.tree.expand')"
        @click.stop="onToggle"
      >
        {{ node.expanded ? '▾' : '▸' }}
      </button>
      <span v-else class="chevron-spacer" aria-hidden="true"></span>
      <span class="name">{{ node.name }}</span>
      <span v-if="node.type" class="type">{{ $te('placeTypes.' + node.type) ? $t('placeTypes.' + node.type) : node.type }}</span>
      <span v-if="node.source === 'gazetteer'" class="gaz-badge">{{ $t('places.tree.fromGazetteerBadge') }}</span>
      <button
        type="button"
        class="add-child"
        :aria-label="$t('places.tree.addChild')"
        :title="$t('places.tree.addChild')"
        @click.stop="onAddChildClick"
      >+</button>
    </div>
    <form v-if="creating" class="create-form" @submit.prevent="onCreateSubmit">
      <input
        ref="newNameInput"
        type="text"
        v-model="newName"
        :placeholder="$t('places.tree.newChildLabel', { parent: node.name })"
        :aria-label="$t('places.tree.newChildLabel', { parent: node.name })"
        @keydown.escape.prevent="cancelCreate"
      />
      <button type="submit" :disabled="!newName.trim() || saving">{{ $t('places.tree.save') }}</button>
      <button type="button" @click="cancelCreate">{{ $t('places.tree.cancel') }}</button>
    </form>
    <ul v-if="node.expanded && node.children.length > 0" role="group" class="children">
      <PlaceTreeNode
        v-for="child in node.children"
        :key="child.key"
        :node="child"
        :level="level + 1"
        :selected-key="selectedKey"
        @select="$emit('select', $event)"
        @toggle="$emit('toggle', $event)"
        @add-child="$emit('add-child', $event)"
      />
    </ul>
  </li>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';
import type { PlaceTreeNode as TreeNode } from '../composables/usePlaceTree';

const props = defineProps<{
  node: TreeNode;
  level: number;
  selectedKey: string | null;
}>();
const emit = defineEmits<{
  select: [node: TreeNode];
  toggle: [node: TreeNode];
  'add-child': [payload: { parent: TreeNode; name: string }];
}>();

const creating = ref(false);
const newName = ref('');
const saving = ref(false);
const newNameInput = ref<HTMLInputElement | null>(null);

const isSelected = computed(() => props.selectedKey === props.node.key);
const narrationText = computed(() => {
  const parts = [props.node.name];
  if (props.node.type) parts.push(props.node.type);
  return parts.join(', ');
});

function onSelect() { emit('select', props.node); }
function onToggle() { emit('toggle', props.node); }
function onAddChildClick() {
  creating.value = true;
  newName.value = '';
  nextTick(() => newNameInput.value?.focus());
}
function cancelCreate() {
  creating.value = false;
  newName.value = '';
}
async function onCreateSubmit() {
  if (!newName.value.trim() || saving.value) return;
  saving.value = true;
  try {
    emit('add-child', { parent: props.node, name: newName.value.trim() });
  } finally {
    saving.value = false;
    creating.value = false;
    newName.value = '';
  }
}
</script>

<style scoped>
.tree-node { list-style: none; }
.row {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 6px; cursor: pointer;
  border-radius: var(--radius-sm);
}
.row:hover { background: var(--surface-hover); }
.tree-node.selected > .row { background: var(--accent); color: var(--accent-text); }
.chevron, .chevron-spacer {
  width: 18px; height: 18px;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 11px;
}
.chevron { background: transparent; border: none; cursor: pointer; color: var(--text-secondary); }
.chevron:hover { color: var(--text-primary); }
.name { flex: 0 1 auto; }
.type { font-size: var(--font-xs); color: var(--text-muted); }
.gaz-badge {
  font-size: var(--font-xs);
  color: var(--success-text); background: var(--success-bg);
  padding: 1px 5px; border-radius: 3px;
}
.add-child {
  margin-left: auto;
  width: 22px; height: 22px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--surface-border);
  background: var(--surface-bg); color: var(--text-secondary);
  cursor: pointer; font-size: 14px; line-height: 1;
}
.add-child:hover { background: var(--surface-hover); color: var(--accent); }
.create-form {
  display: flex; gap: 6px;
  margin: 4px 0 4px 24px;
}
.create-form input {
  flex: 1; padding: 4px 8px;
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm); background: var(--surface-bg); color: var(--text-primary);
}
.create-form button {
  padding: 4px 10px;
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  background: var(--surface-bg); color: var(--text-primary);
  cursor: pointer;
}
.create-form button:hover { background: var(--surface-hover); }
.children { list-style: none; padding-left: 18px; margin: 0; }
</style>
