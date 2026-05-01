import { defineStore } from 'pinia';
import { ref } from 'vue';
import { cropImageToDataUrl, type RegionFrac } from '../utils/cropImage';
import { invalidatePersonPhoto, invalidateAllPersonPhotos } from '../utils/chartData';

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
  // Per-person entries. Reactive map — consumers read entries.value[personId].
  const entries = ref<Record<string, ProfilePicEntry>>({});

  // Per-person in-flight promise (dedupes concurrent ensureLoaded calls).
  const inFlight = new Map<string, Promise<void>>();

  // Per-person generation counter. Bumped on invalidate; pending async work
  // compares its captured generation to the current one before writing, so
  // a stale in-flight resolve can't overwrite a cleared entry.
  const generations = new Map<string, number>();

  function get(personId: string): ProfilePicEntry {
    return entries.value[personId] ?? EMPTY;
  }

  function setEntry(personId: string, gen: number, entry: ProfilePicEntry): boolean {
    if ((generations.get(personId) ?? 0) !== gen) return false;
    entries.value = { ...entries.value, [personId]: entry };
    return true;
  }

  async function resolveOne(
    personId: string,
    gen: number,
    mediaRef: MediaRef | null,
    urlPromise: Promise<string | null> | null,
  ): Promise<void> {
    // Avatars must mirror what trees render: only the tagged face. Without a
    // face tag we'd center-crop the raw media, which reads as "showing the
    // whole picture" — show the initials placeholder instead so list rows,
    // panel headers, mini cards and tree boxes stay consistent.
    if (!mediaRef || !mediaRef.region || !urlPromise) {
      setEntry(personId, gen, { status: 'none', src: null });
      return;
    }
    try {
      const url = await urlPromise;
      if ((generations.get(personId) ?? 0) !== gen) return;
      if (!url) {
        setEntry(personId, gen, { status: 'none', src: null });
        return;
      }
      const cropped = await cropImageToDataUrl(url, mediaRef.region);
      setEntry(personId, gen, { status: 'ready', src: cropped });
    } catch {
      setEntry(personId, gen, { status: 'error', src: null });
    }
  }

  async function ensureLoaded(personId: string): Promise<void> {
    const current = entries.value[personId];
    if (current && (current.status === 'ready' || current.status === 'none' || current.status === 'error')) {
      return;
    }
    const existing = inFlight.get(personId);
    if (existing) return existing;
    const gen = generations.get(personId) ?? 0;
    entries.value = { ...entries.value, [personId]: { status: 'loading', src: null } };
    const p = (async () => {
      try {
        const mediaRef = await window.api.media.profilePicRef(personId) as MediaRef | null;
        const urlPromise = mediaRef
          ? (window.api.media.readAsDataUrl(mediaRef.mediaId) as Promise<string | null>)
          : null;
        await resolveOne(personId, gen, mediaRef, urlPromise);
      } catch {
        setEntry(personId, gen, { status: 'error', src: null });
      } finally {
        inFlight.delete(personId);
      }
    })();
    inFlight.set(personId, p);
    return p;
  }

  // Loads profile pics for many persons in one shot. Dedupes by mediaId WITHIN
  // this batch (3 people in 1 photo share one readAsDataUrl call), but does not
  // persist a media-url cache across batches — that would leak full-image
  // data URLs (~5 MB each) without eviction.
  async function ensureBatch(personIds: string[]): Promise<void> {
    const toFetch = personIds.filter(id => {
      const e = entries.value[id];
      return !e || e.status === 'idle';
    });
    if (toFetch.length === 0) return;
    const perPersonGen = new Map<string, number>();
    for (const id of toFetch) {
      perPersonGen.set(id, generations.get(id) ?? 0);
      entries.value = { ...entries.value, [id]: { status: 'loading', src: null } };
    }
    const refs = await window.api.media.profilePicRefs(toFetch) as Record<string, MediaRef | null>;

    // Dedup mediaId fetches within this batch only.
    const urlByMediaId = new Map<string, Promise<string | null>>();
    function urlFor(mediaId: string): Promise<string | null> {
      let p = urlByMediaId.get(mediaId);
      if (!p) {
        p = window.api.media.readAsDataUrl(mediaId) as Promise<string | null>;
        urlByMediaId.set(mediaId, p);
      }
      return p;
    }

    await Promise.all(toFetch.map(id => {
      const mediaRef = refs[id] ?? null;
      const gen = perPersonGen.get(id) ?? 0;
      const urlPromise = mediaRef ? urlFor(mediaRef.mediaId) : null;
      return resolveOne(id, gen, mediaRef, urlPromise);
    }));
  }

  function invalidatePerson(personId: string) {
    generations.set(personId, (generations.get(personId) ?? 0) + 1);
    const copy = { ...entries.value };
    delete copy[personId];
    entries.value = copy;
    inFlight.delete(personId);
    invalidatePersonPhoto(personId);
  }

  function invalidateAll() {
    for (const id of Object.keys(entries.value)) {
      generations.set(id, (generations.get(id) ?? 0) + 1);
    }
    entries.value = {};
    inFlight.clear();
    invalidateAllPersonPhotos();
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
