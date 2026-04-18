// Reactive signal that invalidates when the user switches theme or appearance.
//
// Theme (theme-forest / theme-nordic / theme-twilight) and appearance
// (dark / high-contrast / text-size) are applied by toggling classes on
// `document.documentElement` (see App.vue setTheme / setAppearance).
// Chart color composables that read `getComputedStyle(html)` inside a Vue
// `computed(...)` would otherwise cache the first result forever, because
// the DOM read isn't a Vue reactive source. Depending on the ref returned
// here registers the change as a reactive dep — the computed re-runs on
// every class mutation.

import { ref, type Ref } from 'vue';

const themeVersion = ref(0);

if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
  const observer = new MutationObserver(() => { themeVersion.value++; });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
}

export function useThemeSignal(): Ref<number> {
  return themeVersion;
}
