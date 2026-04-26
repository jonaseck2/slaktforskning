<template>
  <div
    v-if="visible"
    ref="menuRef"
    class="person-ctx-menu"
    :style="positionStyle"
    role="menu"
    :aria-label="$t('contextMenu.personActions')"
    @click.stop
    @contextmenu.prevent
  >
    <!-- Navigation actions (hidden in add-only mode) -->
    <div v-if="!addOnly" class="ctx-section">
      <button v-if="!isTreeSubject" class="ctx-item" role="menuitem" @click="emit('set-tree-subject', personId)">
        <span class="ctx-icon">🌳</span>
        <span>{{ $t('contextMenu.showInTree') }}</span>
      </button>
      <button class="ctx-item" role="menuitem" @click="emit('select-person', personId)">
        <span class="ctx-icon">➤</span>
        <span>{{ $t('contextMenu.openManagePerson') }}</span>
      </button>
    </div>

    <!-- Add-relative actions -->
    <div v-if="!readonly" class="ctx-section">
      <div class="ctx-section-label">{{ $t('personDetail.addRelativeLabel') }}</div>
      <button class="ctx-item" role="menuitem" @click="emit('add-relative', { personId, mode: 'father' })">
        <span class="ctx-icon">➕</span>
        <span>{{ $t('personDetail.addFather') }}</span>
      </button>
      <button class="ctx-item" role="menuitem" @click="emit('add-relative', { personId, mode: 'mother' })">
        <span class="ctx-icon">➕</span>
        <span>{{ $t('personDetail.addMother') }}</span>
      </button>
      <button class="ctx-item" role="menuitem" @click="emit('add-relative', { personId, mode: 'spouse' })">
        <span class="ctx-icon">➕</span>
        <span>{{ $t('personDetail.addSpouse') }}</span>
      </button>
      <button class="ctx-item" role="menuitem" @click="emit('add-relative', { personId, mode: 'son' })">
        <span class="ctx-icon">➕</span>
        <span>{{ $t('personDetail.addSon') }}</span>
      </button>
      <button class="ctx-item" role="menuitem" @click="emit('add-relative', { personId, mode: 'daughter' })">
        <span class="ctx-icon">➕</span>
        <span>{{ $t('personDetail.addDaughter') }}</span>
      </button>
    </div>

    <!-- Destructive action (hidden in add-only mode) -->
    <div v-if="!readonly && !addOnly" class="ctx-section ctx-section--danger">
      <button class="ctx-item ctx-item--danger" role="menuitem" @click="emit('delete-person', personId)">
        <span class="ctx-icon">🗑️</span>
        <span>{{ $t('persons.deletePersonAction') }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';

const props = defineProps<{
  visible: boolean;
  personId: string;
  x: number;
  y: number;
  isTreeSubject?: boolean;
  readonly?: boolean;
  /** When true, only the "Add family member" shortcuts are shown — no navigation, no delete. */
  addOnly?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  'set-tree-subject': [personId: string];
  'select-person': [personId: string];
  'add-relative': [payload: { personId: string; mode: 'father' | 'mother' | 'spouse' | 'son' | 'daughter' }];
  'delete-person': [personId: string];
}>();


// ── Position (clamp to viewport) ────────────────────────────────────────────

const menuRef = ref<HTMLElement | null>(null);
const adjustedPos = ref({ x: props.x, y: props.y });
const positionStyle = computed(() => ({
  left: `${adjustedPos.value.x}px`,
  top: `${adjustedPos.value.y}px`,
}));

watch(() => [props.visible, props.x, props.y, props.personId], async () => {
  if (!props.visible) return;
  adjustedPos.value = { x: props.x, y: props.y };
  await nextTick();
  const el = menuRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const margin = 8;
  let x = props.x;
  let y = props.y;
  if (x + rect.width + margin > window.innerWidth) x = Math.max(margin, window.innerWidth - rect.width - margin);
  if (y + rect.height + margin > window.innerHeight) y = Math.max(margin, window.innerHeight - rect.height - margin);
  adjustedPos.value = { x, y };
}, { immediate: true });

// ── Close on outside click / Escape ─────────────────────────────────────────

function onDocClick(ev: MouseEvent) {
  if (!props.visible) return;
  const el = menuRef.value;
  if (el && !el.contains(ev.target as Node)) emit('close');
}
function onKey(ev: KeyboardEvent) {
  if (!props.visible) return;
  if (ev.key === 'Escape') emit('close');
}
onMounted(() => {
  document.addEventListener('mousedown', onDocClick, true);
  document.addEventListener('keydown', onKey);
});
onUnmounted(() => {
  document.removeEventListener('mousedown', onDocClick, true);
  document.removeEventListener('keydown', onKey);
});
</script>

<style scoped>
.person-ctx-menu {
  position: fixed;
  z-index: 2000;
  min-width: 240px;
  max-width: 320px;
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  font-size: var(--font-sm);
  color: var(--text-primary);
  padding: var(--space-xs) 0;
  user-select: none;
}

.ctx-section {
  padding: var(--space-xs) 0;
  border-top: 1px solid var(--surface-border-subtle);
}
.ctx-section:first-of-type { border-top: none; }
.ctx-section-label {
  padding: 2px var(--space-md) 4px;
  font-size: var(--font-xs);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.ctx-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  width: 100%;
  padding: 6px var(--space-md);
  background: transparent;
  border: none;
  text-align: left;
  cursor: pointer;
  color: inherit;
  font: inherit;
}
.ctx-item:hover {
  background: var(--surface-hover);
}
.ctx-item:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.ctx-icon {
  width: 20px;
  text-align: center;
  font-size: 1.1em;
  flex-shrink: 0;
}

.ctx-item--danger {
  color: var(--error-text);
}
.ctx-item--danger:hover {
  background: var(--surface-hover);
}
</style>
