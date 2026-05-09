import { ref, type Ref, onMounted } from 'vue';

const cache = new Map<string, Ref<boolean>>();
let snapshotPromise: Promise<Record<string, true>> | null = null;

function loadSnapshot(): Promise<Record<string, true>> {
  if (!snapshotPromise) {
    snapshotPromise = window.api?.onboarding?.getSeen?.() ?? Promise.resolve({});
  }
  return snapshotPromise;
}

export function useFirstEncounter(key: string) {
  let seenRef = cache.get(key);
  if (!seenRef) {
    seenRef = ref(false);
    cache.set(key, seenRef);
  }

  onMounted(async () => {
    const snap = await loadSnapshot();
    if (snap[key]) seenRef!.value = true;
  });

  async function markSeen(): Promise<void> {
    if (seenRef!.value) return;
    seenRef!.value = true;
    try {
      await window.api?.onboarding?.markSeen?.(key);
    } catch (err) {
      console.error('[useFirstEncounter] markSeen failed:', err);
    }
  }

  return { seen: seenRef as Ref<boolean>, markSeen };
}

/** Test-only — clears the in-memory cache. Not exposed in production code paths. */
export function __resetForTests(): void {
  cache.clear();
  snapshotPromise = null;
}
