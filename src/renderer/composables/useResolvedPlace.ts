import { computed, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { PlaceResolveResult } from '../../api/place-gazetteers/types';
import { usePlaceResolver } from './usePlaceResolver';

/**
 * Reactive gazetteer-resolution view of a place — the "what would the resolver
 * say if these fields were left blank" preview surfaced as resolved chips.
 *
 * Per the Prime Directive, gazetteer-derived values are NEVER persisted; they
 * are recomputed on every render. This composable produces the labels for the
 * preview UI, matching the pattern in PlacePanel (and now PlaceModal).
 *
 * @param name - Reactive leaf name being authored (or already saved)
 * @param ancestorChain - Reactive list of ancestor names, leaf-first to root
 *                       (e.g. ["Mosås", "Örebro län"]). Combined with `name`
 *                       to form the comma-string the resolver consumes.
 */
export function useResolvedPlace(
  name: Ref<string | null | undefined>,
  ancestorChain: Ref<string[]>,
) {
  const { ready, ensureLoaded, resolve } = usePlaceResolver();
  ensureLoaded();
  const { t, te } = useI18n();

  const resolvedMatch = computed<PlaceResolveResult | null>(() => {
    if (!ready.value) return null;
    const leaf = (name.value ?? '').trim();
    if (!leaf) return null;
    const parts = [leaf, ...ancestorChain.value];
    return resolve(parts.join(', '));
  });

  const leafMatched = computed<boolean>(() => {
    const m = resolvedMatch.value;
    const leaf = (name.value ?? '').trim();
    if (!m || !leaf) return false;
    const leafToken = leaf.split(/,|\.(?=[A-Z])/)[0].trim().toLowerCase();
    return !m.unmatchedComponents.some(u => u.trim().toLowerCase() === leafToken);
  });

  const resolvedTypeLabel = computed<string | null>(() => {
    const m = resolvedMatch.value;
    if (!m || !leafMatched.value) return null;
    const raw = m.matchedNode?.type ?? null;
    if (!raw) return null;
    const key = `placeTypes.${raw}`;
    return te(key) ? t(key) : raw;
  });

  const resolvedParentPath = computed<string | null>(() => {
    const m = resolvedMatch.value;
    if (!m) return null;
    const path = leafMatched.value ? m.matchedPath.slice(0, -1) : m.matchedPath;
    return path.length > 0 ? path.join(' › ') : null;
  });

  return { resolvedMatch, resolvedTypeLabel, resolvedParentPath, leafMatched };
}
