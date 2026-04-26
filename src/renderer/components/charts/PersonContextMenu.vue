<template>
  <div
    v-if="visible && person"
    ref="menuRef"
    class="person-ctx-menu"
    :style="positionStyle"
    role="menu"
    :aria-label="$t('contextMenu.personActions')"
    @click.stop
    @contextmenu.prevent
  >
    <!-- Header: identity readout (read-only) -->
    <div class="ctx-header">
      <AppAvatar
        :person-id="person.id"
        :given-name="primaryName?.given_name ?? ''"
        :surname="primaryName?.surname ?? ''"
        :preferred-name="primaryName?.preferred_name ?? null"
        :sex="(person.sex as 'M' | 'F' | 'U') || 'U'"
        size="md"
      />
      <div class="ctx-header-text">
        <div class="ctx-name">
          <PersonName
            :given-name="primaryName?.given_name ?? null"
            :surname="primaryName?.surname ?? null"
            :preferred-name="primaryName?.preferred_name ?? null"
            :nickname="primaryName?.nickname ?? null"
          />
        </div>
        <div class="ctx-life">
          <span>* {{ birthLine || '—' }}</span>
          <span>† {{ deathLine || '—' }}</span>
        </div>
      </div>
    </div>

    <!-- Navigation actions -->
    <div class="ctx-section">
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
      <button
        v-if="!parentInfo?.hasFather"
        class="ctx-item"
        role="menuitem"
        @click="emit('add-relative', { personId, mode: 'father' })"
      >
        <span class="ctx-icon">➕</span>
        <span>{{ $t('personDetail.addFather') }}</span>
      </button>
      <button
        v-if="!parentInfo?.hasMother"
        class="ctx-item"
        role="menuitem"
        @click="emit('add-relative', { personId, mode: 'mother' })"
      >
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

    <!-- Destructive action -->
    <div v-if="!readonly" class="ctx-section ctx-section--danger">
      <button class="ctx-item ctx-item--danger" role="menuitem" @click="emit('delete-person', personId)">
        <span class="ctx-icon">🗑️</span>
        <span>{{ $t('persons.deletePersonAction') }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, toRef, nextTick } from 'vue';
import AppAvatar from '../ui/AppAvatar.vue';
import PersonName from '../PersonName.vue';
import { useSelectedParentInfo } from '../../composables/useSelectedParentInfo';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface Person { id: string; sex: string; }
interface PersonNameRow {
  given_name: string | null;
  surname: string | null;
  preferred_name: string | null;
  nickname: string | null;
  sort_order: number;
}

const props = defineProps<{
  visible: boolean;
  personId: string;
  x: number;
  y: number;
  isTreeSubject?: boolean;
  readonly?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  'set-tree-subject': [personId: string];
  'select-person': [personId: string];
  'add-relative': [payload: { personId: string; mode: 'father' | 'mother' | 'spouse' | 'son' | 'daughter' }];
  'delete-person': [personId: string];
}>();

// ── Data load ───────────────────────────────────────────────────────────────

const person = ref<Person | null>(null);
const primaryName = ref<PersonNameRow | null>(null);
const birthLine = ref<string | null>(null);
const deathLine = ref<string | null>(null);

watch(() => props.personId, async (id) => {
  if (!id) {
    person.value = null;
    primaryName.value = null;
    birthLine.value = null;
    deathLine.value = null;
    return;
  }
  try {
    const [p, names, events] = await Promise.all([
      window.api.persons.get(id) as Promise<Person | null>,
      window.api.persons.getNames(id) as Promise<PersonNameRow[]>,
      window.api.events.forPerson(id) as Promise<Array<{ event_type: string; date_value: string | null; date_original: string | null }>>,
    ]);
    person.value = p;
    primaryName.value = names.length > 0 ? [...names].sort((a, b) => a.sort_order - b.sort_order)[0] : null;
    const pickDate = (e?: { date_value: string | null; date_original: string | null }) =>
      e ? (e.date_original?.trim() || e.date_value || null) : null;
    birthLine.value = pickDate(events.find(e => e.event_type === 'birth'));
    deathLine.value = pickDate(events.find(e => e.event_type === 'death'));
  } catch {
    // ignore — menu will not render if person stays null
  }
}, { immediate: true });

const parentInfo = useSelectedParentInfo(toRef(props, 'personId'));

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

.ctx-header {
  display: flex;
  gap: var(--space-sm);
  align-items: center;
  padding: var(--space-sm) var(--space-md);
  border-bottom: 1px solid var(--surface-border-subtle);
}
.ctx-header-text {
  flex: 1;
  min-width: 0;
}
.ctx-name {
  font-weight: var(--font-weight-bold);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ctx-life {
  display: flex;
  flex-direction: column;
  font-size: var(--font-xs);
  color: var(--text-muted);
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
