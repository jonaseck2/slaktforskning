import { ref, watch, type Ref } from 'vue';
import type { SelectedParentInfo } from '../utils/chart-layout/types';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

/**
 * Reactive `{ hasFather, hasMother }` for the currently selected chart node.
 *
 * The chart-outline placeholders for + Far / + Mor must be hidden when the
 * person already has a parent_child relationship of that sex in the database.
 * The selected person isn't always the focal — they could be a descendant
 * whose parents aren't loaded into the chart tree — so we fetch directly.
 *
 * Returns null while loading or when no person is selected; consumers should
 * treat null as "fall back to whatever the tree shows".
 */
export function useSelectedParentInfo(selectedPersonId: Ref<string | null | undefined>) {
  const info = ref<SelectedParentInfo | null>(null);

  watch(selectedPersonId, async (id) => {
    if (!id) { info.value = null; return; }
    try {
      const rels = await window.api.relationships.getForPerson(id) as Array<{
        type: string;
        person1_id: string | null;
        person2_id: string | null;
      }>;
      // parent_child rows where this person is person2 → the OTHER side is a parent.
      const parentIds = rels
        .filter(r => r.type === 'parent_child' && r.person2_id === id)
        .map(r => r.person1_id)
        .filter((pid): pid is string => !!pid);
      if (parentIds.length === 0) {
        info.value = { hasFather: false, hasMother: false };
        return;
      }
      const parents = await Promise.all(parentIds.map(pid =>
        window.api.persons.get(pid) as Promise<{ sex?: string } | null>
      ));
      info.value = {
        hasFather: parents.some(p => p?.sex === 'M'),
        hasMother: parents.some(p => p?.sex === 'F'),
      };
    } catch {
      info.value = null;
    }
  }, { immediate: true });

  return info;
}
