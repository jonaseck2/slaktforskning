import { defineStore } from 'pinia';
import { ref } from 'vue';
import { cropImageToDataUrl, type RegionFrac } from '../utils/cropImage';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

export type ProfilePicStatus = 'idle' | 'loading' | 'ready' | 'none' | 'error';

export interface ProfilePicEntry {
  status: ProfilePicStatus;
  src: string | null;
}

interface MediaRef { mediaId: string; region: RegionFrac | null }

const EMPTY: ProfilePicEntry = { status: 'idle', src: null };

export const useProfilePicStore = defineStore('profilePic', () => {
  // Per-person entries. Reactive map — consumers can read entries.value[personId].
  const entries = ref<Record<string, ProfilePicEntry>>({});

  // In-flight promises to dedupe concurrent ensureLoaded calls.
  const inFlight = new Map<string, Promise<void>>();

  // Cache of raw media data URLs so 3 people in one photo share one readAsDataUrl.
  const mediaUrlCache = new Map<string, Promise<string | null>>();

  function get(personId: string): ProfilePicEntry {
    return entries.value[personId] ?? EMPTY;
  }

  function set(personId: string, entry: ProfilePicEntry) {
    entries.value = { ...entries.value, [personId]: entry };
  }

  async function loadMediaUrl(mediaId: string): Promise<string | null> {
    let p = mediaUrlCache.get(mediaId);
    if (!p) {
      p = window.api.media.readAsDataUrl(mediaId) as Promise<string | null>;
      mediaUrlCache.set(mediaId, p);
    }
    return p;
  }

  async function resolveOne(personId: string, mediaRef: MediaRef | null): Promise<void> {
    if (!mediaRef) {
      set(personId, { status: 'none', src: null });
      return;
    }
    try {
      const url = await loadMediaUrl(mediaRef.mediaId);
      if (!url) {
        set(personId, { status: 'none', src: null });
        return;
      }
      const cropped = await cropImageToDataUrl(url, mediaRef.region);
      set(personId, { status: 'ready', src: cropped });
    } catch {
      set(personId, { status: 'error', src: null });
    }
  }

  async function ensureLoaded(personId: string): Promise<void> {
    const current = entries.value[personId];
    if (current && (current.status === 'ready' || current.status === 'none' || current.status === 'error')) {
      return;
    }
    const existing = inFlight.get(personId);
    if (existing) return existing;
    set(personId, { status: 'loading', src: null });
    const p = (async () => {
      try {
        const mediaRef = await window.api.media.profilePicRef(personId) as MediaRef | null;
        await resolveOne(personId, mediaRef);
      } finally {
        inFlight.delete(personId);
      }
    })();
    inFlight.set(personId, p);
    return p;
  }

  async function ensureBatch(personIds: string[]): Promise<void> {
    const toFetch = personIds.filter(id => {
      const e = entries.value[id];
      return !e || e.status === 'idle';
    });
    if (toFetch.length === 0) return;
    for (const id of toFetch) set(id, { status: 'loading', src: null });
    const refs = await window.api.media.profilePicRefs(toFetch) as Record<string, MediaRef | null>;
    await Promise.all(toFetch.map(id => resolveOne(id, refs[id] ?? null)));
  }

  function invalidatePerson(personId: string) {
    const copy = { ...entries.value };
    delete copy[personId];
    entries.value = copy;
    inFlight.delete(personId);
    // Don't clear mediaUrlCache — the raw image didn't change, only the link/region did.
  }

  function invalidateAll() {
    entries.value = {};
    inFlight.clear();
    mediaUrlCache.clear();
  }

  return {
    entries,
    get,
    ensureLoaded,
    ensureBatch,
    invalidatePerson,
    invalidateAll,
  };
});
