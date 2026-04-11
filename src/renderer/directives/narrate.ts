import type { Directive, DirectiveBinding } from 'vue';

// WeakMap storing narration source for each element.
// The focus listener in useScreenReaderMode reads from this map.
export const narrationMap = new WeakMap<HTMLElement, string | (() => string)>();

// v-narrate directive.
// Usage:
//   v-narrate="'static text'"
//   v-narrate="() => computeText()"
//   v-narrate="reactiveString"
export const vNarrate: Directive<HTMLElement, string | (() => string)> = {
  mounted(el: HTMLElement, binding: DirectiveBinding<string | (() => string)>) {
    narrationMap.set(el, binding.value);
  },
  updated(el: HTMLElement, binding: DirectiveBinding<string | (() => string)>) {
    narrationMap.set(el, binding.value);
  },
  unmounted(el: HTMLElement) {
    narrationMap.delete(el);
  },
};

// Collect text content, reading aria-hidden "+" as "add" so TTS says
// "add" instead of "plus" on buttons.
function visibleTextContent(el: HTMLElement): string {
  let result = '';
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent ?? '';
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const child = node as HTMLElement;
      if (child.getAttribute('aria-hidden') === 'true') {
        const hidden = (child.textContent ?? '').trim();
        if (hidden === '+') result += 'add ';
        continue;
      }
      result += visibleTextContent(child);
    }
  }
  return result;
}

// Resolve narration text for an element.
// Resolution order:
// 1. v-narrate directive value (from WeakMap)
// 2. data-narrate attribute
// 3. aria-label
// 4. Visible text content, excluding aria-hidden elements (max 200 chars)
export function resolveNarration(el: HTMLElement): string | null {
  const source = narrationMap.get(el);
  if (source) {
    return typeof source === 'function' ? source() : source;
  }
  const dataNarrate = el.getAttribute('data-narrate');
  if (dataNarrate) return dataNarrate;
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;
  const text = visibleTextContent(el).trim();
  if (text && text.length <= 200) return text;
  if (text) return text.slice(0, 200);
  return null;
}
