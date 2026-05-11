<template>
  <Teleport to="body">
    <div
      v-if="visible"
      ref="root"
      class="coachmark"
      role="status"
      aria-live="polite"
      :style="positionStyle"
    >
      <p class="coachmark__tip">{{ t(tipKey) }}</p>
      <div class="coachmark__actions">
        <button class="coachmark__dismiss" type="button" @click="dismiss">
          {{ t(dismissKey) }}
        </button>
      </div>
      <span class="coachmark__arrow" :class="`coachmark__arrow--${placement}`" aria-hidden="true" />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch, type CSSProperties } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFirstEncounter } from '../../composables/useFirstEncounter';

const props = withDefaults(defineProps<{
  seenKey: string;
  anchorEl: HTMLElement | null;
  tipKey: string;
  dismissKey?: string;
  placement?: 'below' | 'above' | 'right' | 'left';
  autoDismissOn?: () => boolean;
}>(), {
  dismissKey: 'common.gotIt',
  placement: 'below',
});

const emit = defineEmits<{ dismissed: [] }>();

const { t } = useI18n();
const { seen, markSeen } = useFirstEncounter(props.seenKey);
const root = ref<HTMLElement | null>(null);
const positionStyle = ref<CSSProperties>({});

const visible = computed(() => !seen.value && props.anchorEl != null);

async function dismiss() {
  await markSeen();
  emit('dismissed');
}

function reposition() {
  if (!props.anchorEl) return;
  const rect = props.anchorEl.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    positionStyle.value = { visibility: 'hidden', position: 'fixed' };
    return;
  }
  const off = 10;
  const style: CSSProperties = { position: 'fixed', zIndex: 'var(--z-coachmark)' };
  if (props.placement === 'below') {
    style.top = `${rect.bottom + off}px`;
    style.left = `${rect.left + rect.width / 2}px`;
    style.transform = 'translateX(-50%)';
  } else if (props.placement === 'above') {
    style.bottom = `${window.innerHeight - rect.top + off}px`;
    style.left = `${rect.left + rect.width / 2}px`;
    style.transform = 'translateX(-50%)';
  } else if (props.placement === 'right') {
    style.top = `${rect.top + rect.height / 2}px`;
    style.left = `${rect.right + off}px`;
    style.transform = 'translateY(-50%)';
  } else {
    style.top = `${rect.top + rect.height / 2}px`;
    style.right = `${window.innerWidth - rect.left + off}px`;
    style.transform = 'translateY(-50%)';
  }
  positionStyle.value = style;
}

let raf = 0;
function tick() {
  if (props.autoDismissOn?.() && !seen.value) {
    dismiss();
  }
  reposition();
  raf = requestAnimationFrame(tick);
}

onMounted(() => {
  reposition();
  raf = requestAnimationFrame(tick);
  window.addEventListener('resize', reposition);
  window.addEventListener('scroll', reposition, true);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  window.removeEventListener('resize', reposition);
  window.removeEventListener('scroll', reposition, true);
});

watch(() => props.anchorEl, reposition);
</script>

<style scoped>
.coachmark {
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  padding: var(--space-md);
  max-width: 320px;
  color: var(--text-primary);
  font-size: var(--font-sm);
  line-height: 1.4;
}

.coachmark__tip {
  margin: 0 0 var(--space-sm) 0;
}

.coachmark__actions {
  display: flex;
  justify-content: flex-end;
}

.coachmark__dismiss {
  background: var(--accent);
  color: var(--accent-text);
  border: none;
  border-radius: var(--radius-sm);
  padding: var(--space-xs) var(--space-md);
  font: inherit;
  cursor: pointer;
}

.coachmark__dismiss:hover {
  background: var(--accent-hover);
}

.coachmark__arrow {
  position: absolute;
  width: 12px;
  height: 12px;
  background: var(--surface);
  border: 1px solid var(--surface-border);
  transform: rotate(45deg);
}

.coachmark__arrow--below {
  top: -7px;
  left: 50%;
  margin-left: -6px;
  border-right: none;
  border-bottom: none;
}

.coachmark__arrow--above {
  bottom: -7px;
  left: 50%;
  margin-left: -6px;
  border-left: none;
  border-top: none;
}

.coachmark__arrow--right {
  left: -7px;
  top: 50%;
  margin-top: -6px;
  border-right: none;
  border-top: none;
}

.coachmark__arrow--left {
  right: -7px;
  top: 50%;
  margin-top: -6px;
  border-left: none;
  border-bottom: none;
}
</style>
