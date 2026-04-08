import { onMounted, onUnmounted, type Ref } from 'vue';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export function useFocusTrap(containerRef: Ref<HTMLElement | null>) {
  let previouslyFocused: HTMLElement | null = null;

  function getFocusableElements(): HTMLElement[] {
    if (!containerRef.value) return [];
    return Array.from(
      containerRef.value.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter((el) => !el.closest('[inert]') && el.offsetParent !== null);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key !== 'Tab') return;
    const focusable = getFocusableElements();
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function activate() {
    previouslyFocused = document.activeElement as HTMLElement;
    const focusable = getFocusableElements();
    const autofocusEl = containerRef.value?.querySelector<HTMLElement>('[autofocus]');
    if (autofocusEl) {
      autofocusEl.focus();
    } else if (focusable.length > 0) {
      focusable[0].focus();
    }
    containerRef.value?.addEventListener('keydown', handleKeydown);
  }

  function deactivate() {
    containerRef.value?.removeEventListener('keydown', handleKeydown);
    previouslyFocused?.focus();
  }

  onMounted(activate);
  onUnmounted(deactivate);
}
