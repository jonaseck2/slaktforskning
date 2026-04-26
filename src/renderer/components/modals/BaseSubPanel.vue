<template>
  <!-- STANDALONE: BaseModal provides overlay + focus trap; the entity card itself is the visible surface -->
  <BaseModal
    v-if="mode === 'standalone'"
    :title-id="titleId"
    modal-class="modal--panel-host"
    @close="$emit('cancel')"
  >
    <div class="entity-panel-wrap" :style="wrapStyle">
      <div ref="panelRef" class="entity-panel" :data-entity="entityType" :style="panelStyle">
        <div
          class="ep-header ep-header--draggable"
          v-narrate="headerNarration"
          @mousedown="startDrag"
        >
          <div class="ep-header-left">
            <span v-if="resolvedIcon" class="ep-icon" aria-hidden="true">{{ resolvedIcon }}</span>
            <div class="ep-header-text">
              <span v-if="resolvedLabel" class="ep-label">{{ resolvedLabel }}</span>
              <div :id="titleId" class="ep-title">{{ title }}</div>
            </div>
          </div>
        </div>
        <div class="ep-body">
          <slot />
        </div>
        <div class="ep-footer">
          <button type="button" class="btn-cancel" @click="$emit('cancel')">
            {{ cancelLabel ?? $t('common.cancel') }}
          </button>
          <button
            v-if="!hideSave"
            type="button"
            class="ep-save-btn"
            :class="{ 'ep-save-btn--danger': tone === 'danger' }"
            @click="$emit('save')"
          >
            {{ saveLabel ?? $t('common.save') }}
          </button>
        </div>
        <div class="ep-resize-handle" @mousedown.stop="startResize" />
      </div>
      <slot name="subpanels" />
    </div>
  </BaseModal>

  <!-- SUBPANEL: floating card, no overlay; closes via × -->
  <div v-else class="entity-panel-wrap">
    <div ref="panelRef" class="entity-panel" :data-entity="entityType" :style="subPanelStyle">
      <div
        class="ep-header"
        :class="{ 'ep-header--draggable': parentDrag }"
        v-narrate="headerNarration"
        @mousedown="parentDrag?.($event)"
      >
        <div class="ep-header-left">
          <span v-if="resolvedIcon" class="ep-icon" aria-hidden="true">{{ resolvedIcon }}</span>
          <div class="ep-header-text">
            <span v-if="resolvedLabel" class="ep-label">{{ resolvedLabel }}</span>
            <div class="ep-title">{{ title }}</div>
          </div>
        </div>
        <button
          class="ep-close"
          type="button"
          :aria-label="$t('common.close')"
          @click="$emit('close')"
        >×</button>
      </div>
      <div class="ep-body">
        <slot />
      </div>
      <div class="ep-footer">
        <button type="button" class="btn-cancel" @click="$emit('cancel')">
          {{ cancelLabel ?? $t('common.cancel') }}
        </button>
        <button
          v-if="!hideSave"
          type="button"
          class="ep-save-btn"
          :class="{ 'ep-save-btn--danger': tone === 'danger' }"
          @click="$emit('save')"
        >
          {{ saveLabel ?? $t('common.save') }}
        </button>
      </div>
      <div class="ep-resize-handle" @mousedown.stop="startSubResize" />
    </div>
    <slot name="subpanels" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive, provide, inject } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseModal from '../BaseModal.vue';
import { ENTITY_META, type EntityType } from '../../constants/entityMeta';

const props = withDefaults(defineProps<{
  entityType: EntityType;
  /** Title text shown as the second line of the header (entity name / event type / etc.) */
  title: string;
  /** Optional override for the small caps label above the title. Defaults to the entity's own labelKey. */
  label?: string;
  mode?: 'standalone' | 'subpanel';
  saveLabel?: string;
  /** When true, the save/primary button is hidden. Use for informational dialogs with only a close action. */
  hideSave?: boolean;
  /** Override label for the cancel/close button. Defaults to $t('common.cancel'). */
  cancelLabel?: string;
  /** Optional icon override — when provided, replaces the entity visual's default icon in the header. */
  icon?: string;
  /** Tone for the save button. 'danger' renders a red background using --error-text. Default: 'info'. */
  tone?: 'info' | 'warning' | 'danger';
}>(), {
  mode: 'standalone',
  hideSave: false,
  tone: 'info',
});

defineEmits<{
  cancel: [];
  save: [];
  close: [];
}>();

const { t, te } = useI18n();

const visual = computed(() => ENTITY_META[props.entityType]);
const titleId = computed(() => `${props.entityType}-panel-title`);

const resolvedLabel = computed(() => {
  if (props.label !== undefined) return props.label;
  const key = visual.value.labelKey;
  if (!key) return '';
  return te(key) ? t(key) : '';
});

const resolvedIcon = computed(() => props.icon ?? visual.value.icon);

const headerNarration = computed(() => {
  const entity = visual.value.labelKey && te(visual.value.labelKey) ? t(visual.value.labelKey) : props.entityType;
  return t('narration.modal.header', { entity, title: props.title });
});

// ── Drag / resize ───────────────────────────────────────────────────────────

type ModalPos = { x: number; y: number; w: number; h: number | null };

const STORAGE_KEY = `modal-pos-${props.entityType}`;
const DEFAULT_POS: ModalPos = { x: 24, y: 32, w: 480, h: null };

const MIN_W = 360;
const MIN_H = 220;

function loadPos(): ModalPos {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) {
      const p = JSON.parse(s) as ModalPos;
      if (p.w < MIN_W) p.w = MIN_W;
      if (p.h !== null && p.h < MIN_H) p.h = MIN_H;
      return p;
    }
  } catch {}
  return { ...DEFAULT_POS };
}

const pos = reactive<ModalPos>(loadPos());
const panelRef = ref<HTMLElement | null>(null);

function savePos() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
}

const wrapStyle = computed(() =>
  props.mode === 'standalone'
    ? { position: 'fixed' as const, left: `${pos.x}px`, top: `${pos.y}px` }
    : undefined
);

// `.entity-panel`'s min-height: min-content keeps the modal from shrinking
// below its body, and its max-height caps it at viewport. The user-set height
// from the resize handle is applied here only when set, and acts as a target
// — the min/max-height clamps win when content is taller or viewport is shorter.
const panelStyle = computed(() =>
  props.mode === 'standalone'
    ? { width: `${pos.w}px`, ...(pos.h !== null ? { height: `${pos.h}px` } : {}) }
    : undefined
);

function startDrag(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('button, input, select, textarea, a')) return;
  const startX = e.clientX - pos.x;
  const startY = e.clientY - pos.y;

  function onMove(ev: MouseEvent) {
    pos.x = Math.max(0, ev.clientX - startX);
    pos.y = Math.max(0, ev.clientY - startY);
  }
  function onUp() {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    document.body.classList.remove('modal-dragging');
    savePos();
  }
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  document.body.classList.add('modal-dragging');
  e.preventDefault();
}

// Sub-panels inject this to move the shared fixed wrapper
provide('modalDrag', startDrag);

function startResize(e: MouseEvent) {
  const startX = e.clientX;
  const startY = e.clientY;
  const startW = pos.w;
  const startH = panelRef.value?.offsetHeight ?? 400;

  function onMove(ev: MouseEvent) {
    pos.w = Math.max(MIN_W, startW + (ev.clientX - startX));
    pos.h = Math.max(MIN_H, startH + (ev.clientY - startY));
  }
  function onUp() {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    document.body.classList.remove('modal-resizing');
    savePos();
  }
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  document.body.classList.add('modal-resizing');
  e.preventDefault();
}

// ── Sub-panel: inherit drag from standalone parent, resize independently ────

const parentDrag = inject<((e: MouseEvent) => void) | null>('modalDrag', null);

type SubPos = { w: number; h: number | null };
const SUB_KEY = `modal-pos-${props.entityType}-sub`;

function loadSubPos(): SubPos {
  try {
    const s = localStorage.getItem(SUB_KEY);
    if (s) {
      const p = JSON.parse(s) as SubPos;
      if (p.w < MIN_W) p.w = MIN_W;
      if (p.h !== null && p.h < MIN_H) p.h = MIN_H;
      return p;
    }
  } catch {}
  return { w: 480, h: null };
}

const subPos = reactive<SubPos>(loadSubPos());

const subPanelStyle = computed(() => ({
  width: `${subPos.w}px`,
  ...(subPos.h !== null ? { height: `${subPos.h}px` } : {}),
}));

function startSubResize(e: MouseEvent) {
  const startX = e.clientX;
  const startY = e.clientY;
  const startW = subPos.w;
  const startH = panelRef.value?.offsetHeight ?? 400;

  function onMove(ev: MouseEvent) {
    subPos.w = Math.max(MIN_W, startW + (ev.clientX - startX));
    subPos.h = Math.max(MIN_H, startH + (ev.clientY - startY));
  }
  function onUp() {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    document.body.classList.remove('modal-resizing');
    localStorage.setItem(SUB_KEY, JSON.stringify(subPos));
  }
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  document.body.classList.add('modal-resizing');
  e.preventDefault();
}
</script>
