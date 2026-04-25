import { reactive } from 'vue';

const isStaticMode = import.meta.env.VITE_STATIC_MODE === 'true';

/**
 * Collapsible-section state for side panels (PersonPanel, PlacePanel, etc).
 *
 * Persists per-section open/closed flags in localStorage under a unique prefix.
 * In static-website-export mode, ignores stored state and uses `staticDefaults`
 * (typically all-open) so visitors see content without clicking to expand.
 */
export function usePanelSections<TKey extends string>(
  storagePrefix: string,
  defaults: Record<TKey, boolean>,
  staticDefaults?: Record<TKey, boolean>,
) {
  const effective = isStaticMode && staticDefaults ? staticDefaults : defaults;

  const sections = reactive(
    Object.fromEntries(
      Object.entries(effective).map(([key, def]) => {
        if (isStaticMode) return [key, def];
        const v = localStorage.getItem(storagePrefix + key);
        return [key, v === null ? def : v === 'true'];
      }),
    ),
  ) as Record<TKey, boolean>;

  function toggleSection(key: TKey) {
    sections[key] = !sections[key];
    if (!isStaticMode) {
      localStorage.setItem(storagePrefix + key, String(sections[key]));
    }
  }

  return { sections, toggleSection };
}
