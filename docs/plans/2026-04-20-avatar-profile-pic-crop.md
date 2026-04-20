# Avatar Profile Picture + Face-Tag Crop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each person's profile picture (cropped to their starred face tag when available) on every `AppAvatar` in the app — PersonsView, PersonPanel, GroupDetailView, PlacePersonsSection, RelationshipsList, MediaPanel, PersonDetailView — without generating new media blobs.

**Architecture:** Pure renderer feature. New API resolver `getPersonProfilePicRef` returns `{ mediaId, region? }` per person (batched). A Pinia store lazily loads each unique media as a data URL (reusing `window.api.media.readAsDataUrl`), then uses an offscreen `<canvas>` to produce a small square cropped thumbnail per (mediaId, region) and caches the result keyed by personId. A composable `usePersonProfilePic(personId)` exposes the cropped src reactively. `AppAvatar` gets a `personId` prop and uses the composable; existing props (`src`, names, sex) still work as overrides/fallback. Mutation sites invalidate affected persons.

**Tech Stack:** TypeScript, Vue 3, Pinia, HTML Canvas, node-sqlite3-wasm, Electron IPC, Vitest.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/api/media.ts` | Add `getPersonProfilePicRef` + batch `getPersonProfilePicRefs` |
| Modify | `src/main/ipc/media.ts` | Wire IPC handlers for the two new functions |
| Modify | `src/preload/index.ts` | Expose `window.api.media.profilePicRef` / `profilePicRefs` |
| Create | `src/renderer/utils/cropImage.ts` | Pure `computeSquareCropRect` math + `cropImageToDataUrl` canvas helper |
| Create | `src/renderer/stores/profilePic.ts` | Pinia store: per-person cached cropped data URL + invalidation |
| Create | `src/renderer/composables/usePersonProfilePic.ts` | Reactive wrapper around the store |
| Modify | `src/renderer/components/ui/AppAvatar.vue` | Add `personId` prop, render cropped thumbnail |
| Modify | `src/renderer/views/PersonsView.vue:95` | Pass `:person-id` |
| Modify | `src/renderer/components/PersonPanel.vue:11-16` | Pass `:person-id` |
| Modify | `src/renderer/views/GroupDetailView.vue:75` | Pass `:person-id` |
| Modify | `src/renderer/components/PlacePersonsSection.vue:15` | Pass `:person-id` |
| Modify | `src/renderer/components/RelationshipsList.vue:25` | Pass `:person-id` |
| Modify | `src/renderer/components/MediaPanel.vue:79,152` | Pass `:person-id` |
| Modify | `src/renderer/views/PersonDetailView.vue:1-17,260-391` | Migrate header avatar to `:person-id`, delete bespoke `profilePicUrl` code |
| Modify | `src/renderer/utils/mediaProfile.ts` | Invalidate store on `setMediaAsPersonProfile` |
| Modify | `src/renderer/components/MediaPanel.vue` | Invalidate store from region/link mutations |
| Modify | `src/renderer/components/PersonMediaSection.vue` | Invalidate store from reorder/unlink |
| Modify | `src/renderer/views/MediaView.vue` | Invalidate store when new region is drawn with auto-assigned person |
| Test   | `tests/unit/media.test.ts` | Tests for `getPersonProfilePicRef` + batch |
| Test   | `tests/unit/cropImage.test.ts` | Tests for `computeSquareCropRect` math |
| Modify | `CLAUDE.md` | Document `AppAvatar` `personId` prop + store |
| Modify | `docs/PLAN.md` | Mark milestone done |
| Modify | `package.json` | Bump minor version in final commit |

---

## Design Notes

**Profile picture resolution:**
- Person's profile media = first row of `media_links WHERE entity_type='person' AND entity_id=P ORDER BY sort_order, created_at`.
- Crop region = first `media_regions` row on that media with `person_id=P` (ORDER BY created_at). If none, render full image (center square).
- Regions store fractional coords `(x, y, width, height)` in `[0,1]` (verified at `src/renderer/components/FaceTagOverlay.vue:163`).

**Square crop math (pure):**
Given region `(rx, ry, rw, rh)` as fractions of the full image, produce a square sub-rect `(sx, sy, s)` also as fractions:
```
cx = rx + rw/2                    // region center x (fraction)
cy = ry + rh/2                    // region center y (fraction)
s  = max(rw, rh)                  // square side (fraction) — take larger axis, no distortion
sx = clamp(cx - s/2, 0, 1 - s)    // top-left x, clamped to image bounds
sy = clamp(cy - s/2, 0, 1 - s)
```
For null region (no crop): `sx = (1 - s) / 2`, `sy = (1 - s) / 2`, `s = min(1, 1)` — center square, fits smaller axis.

**Cache strategy:**
- Pinia store keyed by `personId`. State per key: `{ status: 'idle' | 'loading' | 'ready' | 'none' | 'error', src: string | null }`.
- `ensureLoaded(personId)` resolves the full profile pic and caches. Idempotent.
- `ensureBatch(personIds)` batches the cheap `getPersonProfilePicRefs` IPC then fans out image loads, deduping by `mediaId` so three people in one group photo share one `readAsDataUrl` call.
- Cropped output is 128px square JPEG data URL (`canvas.toDataURL('image/jpeg', 0.85)`) — crisp enough for `xl` (56px) on retina, tiny enough to hold thousands in memory.
- `invalidatePerson(personId)` clears the entry so the next `ensureLoaded` reloads.
- `invalidateAll()` clears the map (used after import, database switch).

**Invalidation points (renderer-only, direct store calls):**
- `setMediaAsPersonProfile(personId, _)` → `invalidatePerson(personId)`.
- `MediaPanel.assignPersonToRegion(_, personId)` → `invalidatePerson(personId)` (old person may also need invalidation if reassigned, but `updateMediaRegion` doesn't expose the prior value; acceptable — re-tagging is rare).
- `MediaPanel.deleteRegion(regionId)` → look up region's `person_id` before delete, invalidate it.
- `MediaPanel.unlinkEntity(linkId)` for a person → invalidate that person.
- `MediaPanel.linkPerson(person)` → invalidate that person.
- `MediaView.onRegionDrawn` auto-assigned a `personId` → invalidate.
- `MediaView.onRegionUpdated(regionId, rect)` → look up region's `person_id`, invalidate.
- `PersonMediaSection.reorder/unlink/attach` → invalidate `props.personId`.
- Database switch (`window.api.database.switch`) already reloads routes; renderer Pinia store is reset by page reload, so no extra hook needed there.

**AppAvatar behavior:**
- Props: `personId?: string`, plus existing `givenName`, `surname`, `sex`, `size`, `src`.
- Resolution order when rendering:
  1. If `src` prop is explicitly set → use it (existing behavior preserved).
  2. Else if `personId` set and store has `status='ready'` → use cached cropped data URL.
  3. Else → show initials (existing fallback).
- No layout shift: the `<div class="app-avatar">` wrapper keeps fixed dimensions regardless of state.
- Image is already cropped, so CSS stays `object-fit: cover` as today.

---

## Task 1: API resolver — `getPersonProfilePicRef` + batch

**Files:**
- Modify: `src/api/media.ts`
- Test: `tests/unit/media.test.ts`

- [ ] **Step 1.1: Write failing tests**

Append to `tests/unit/media.test.ts` (inside the existing `describe` block):

```typescript
  describe('getPersonProfilePicRef', () => {
    it('returns null when person has no media', () => {
      const person = createPerson(db, { given_name: 'A', surname: 'B' });
      const ref = getPersonProfilePicRef(db, person.id);
      expect(ref).toBeNull();
    });

    it('returns { mediaId, region: null } when media has no region for this person', () => {
      const person = createPerson(db, { given_name: 'A', surname: 'B' });
      const m = createMedia(db, { title: 'Pic' });
      addMediaLink(db, { media_id: m.id, entity_type: 'person', entity_id: person.id });
      const ref = getPersonProfilePicRef(db, person.id);
      expect(ref).toEqual({ mediaId: m.id, region: null });
    });

    it('returns { mediaId, region } when media has a region tagged to this person', () => {
      const person = createPerson(db, { given_name: 'A', surname: 'B' });
      const m = createMedia(db, { title: 'Pic' });
      addMediaLink(db, { media_id: m.id, entity_type: 'person', entity_id: person.id });
      createMediaRegion(db, { media_id: m.id, person_id: person.id, x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
      const ref = getPersonProfilePicRef(db, person.id);
      expect(ref).not.toBeNull();
      expect(ref!.mediaId).toBe(m.id);
      expect(ref!.region).toEqual({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
    });

    it('picks the FIRST media by sort_order', () => {
      const person = createPerson(db, { given_name: 'A', surname: 'B' });
      const m1 = createMedia(db, { title: 'First' });
      const m2 = createMedia(db, { title: 'Second' });
      addMediaLink(db, { media_id: m2.id, entity_type: 'person', entity_id: person.id, sort_order: 1 });
      addMediaLink(db, { media_id: m1.id, entity_type: 'person', entity_id: person.id, sort_order: 0 });
      const ref = getPersonProfilePicRef(db, person.id);
      expect(ref!.mediaId).toBe(m1.id);
    });

    it('ignores regions on that media tagged to OTHER persons', () => {
      const p1 = createPerson(db, { given_name: 'A', surname: 'B' });
      const p2 = createPerson(db, { given_name: 'C', surname: 'D' });
      const m = createMedia(db, { title: 'Group' });
      addMediaLink(db, { media_id: m.id, entity_type: 'person', entity_id: p1.id });
      addMediaLink(db, { media_id: m.id, entity_type: 'person', entity_id: p2.id });
      createMediaRegion(db, { media_id: m.id, person_id: p2.id, x: 0.5, y: 0.5, width: 0.1, height: 0.1 });
      const ref = getPersonProfilePicRef(db, p1.id);
      expect(ref).toEqual({ mediaId: m.id, region: null });
    });
  });

  describe('getPersonProfilePicRefs (batch)', () => {
    it('returns a map keyed by personId, including nulls for missing', () => {
      const p1 = createPerson(db, { given_name: 'A', surname: 'B' });
      const p2 = createPerson(db, { given_name: 'C', surname: 'D' });
      const p3 = createPerson(db, { given_name: 'E', surname: 'F' });
      const m = createMedia(db, { title: 'Pic' });
      addMediaLink(db, { media_id: m.id, entity_type: 'person', entity_id: p1.id });
      createMediaRegion(db, { media_id: m.id, person_id: p1.id, x: 0.1, y: 0.1, width: 0.2, height: 0.2 });
      addMediaLink(db, { media_id: m.id, entity_type: 'person', entity_id: p2.id });
      const map = getPersonProfilePicRefs(db, [p1.id, p2.id, p3.id]);
      expect(map[p1.id]).toEqual({ mediaId: m.id, region: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 } });
      expect(map[p2.id]).toEqual({ mediaId: m.id, region: null });
      expect(map[p3.id]).toBeNull();
    });

    it('returns empty object for empty input', () => {
      const map = getPersonProfilePicRefs(db, []);
      expect(map).toEqual({});
    });
  });
```

Add these imports at the top of the test file next to the other media imports:
```typescript
import { getPersonProfilePicRef, getPersonProfilePicRefs } from '../../src/api/media';
import { createMediaRegion } from '../../src/api/media_regions';
```

- [ ] **Step 1.2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/media.test.ts`
Expected: FAIL with "getPersonProfilePicRef is not defined" and "getPersonProfilePicRefs is not defined".

- [ ] **Step 1.3: Implement `getPersonProfilePicRef` in `src/api/media.ts`**

Append after `reorderMediaLinks`:

```typescript
export interface ProfilePicRef {
  mediaId: string;
  region: { x: number; y: number; width: number; height: number } | null;
}

export function getPersonProfilePicRef(db: Database, personId: string): ProfilePicRef | null {
  const link = queryOne<{ media_id: string }>(db, `
    SELECT media_id FROM media_links
    WHERE entity_type = 'person' AND entity_id = ?
    ORDER BY sort_order, created_at
    LIMIT 1
  `, [personId]);
  if (!link) return null;
  const region = queryOne<{ x: number; y: number; width: number; height: number }>(db, `
    SELECT x, y, width, height FROM media_regions
    WHERE media_id = ? AND person_id = ?
    ORDER BY created_at
    LIMIT 1
  `, [link.media_id, personId]);
  return { mediaId: link.media_id, region: region ?? null };
}

export function getPersonProfilePicRefs(db: Database, personIds: string[]): Record<string, ProfilePicRef | null> {
  const result: Record<string, ProfilePicRef | null> = {};
  for (const id of personIds) {
    result[id] = getPersonProfilePicRef(db, id);
  }
  return result;
}
```

- [ ] **Step 1.4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/media.test.ts`
Expected: PASS — all new tests green; existing media tests still green.

- [ ] **Step 1.5: Commit**

```bash
git add src/api/media.ts tests/unit/media.test.ts
git commit -m "feat(api): add getPersonProfilePicRef + batch resolver"
```

---

## Task 2: IPC + preload wiring

**Files:**
- Modify: `src/main/ipc/media.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 2.1: Add IPC handlers**

Open `src/main/ipc/media.ts`. Find the existing `wrapHandler('media:reorder', ...)` call. Add directly beneath it:

```typescript
  wrapHandler('media:profilePicRef', (personId) => media.getPersonProfilePicRef(getDb(), personId as string));
  wrapHandler('media:profilePicRefs', (personIds) => media.getPersonProfilePicRefs(getDb(), personIds as string[]));
```

- [ ] **Step 2.2: Expose on window.api.media**

Open `src/preload/index.ts`. Find the `reorder:` line (inside `media:`). Add directly beneath it:

```typescript
    profilePicRef: (personId: string) => ipcRenderer.invoke('media:profilePicRef', personId),
    profilePicRefs: (personIds: string[]) => ipcRenderer.invoke('media:profilePicRefs', personIds),
```

Note: read-only — no `mutating()` wrapper.

- [ ] **Step 2.3: Smoke test the IPC**

Run: `npm start` in one terminal (or use `./scripts/dev-debug.sh`). In the DevTools console of the running Electron app, evaluate:
```javascript
await window.api.media.profilePicRefs(['not-a-real-id'])
```
Expected: `{ "not-a-real-id": null }`. No exception.

Then kill the app.

- [ ] **Step 2.4: Commit**

```bash
git add src/main/ipc/media.ts src/preload/index.ts
git commit -m "feat(ipc): expose media.profilePicRef + profilePicRefs"
```

---

## Task 3: Crop math utility (pure)

**Files:**
- Create: `src/renderer/utils/cropImage.ts`
- Test: `tests/unit/cropImage.test.ts`

- [ ] **Step 3.1: Write failing tests**

Create `tests/unit/cropImage.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeSquareCropRect } from '../../src/renderer/utils/cropImage';

describe('computeSquareCropRect', () => {
  it('centers on region midpoint, uses max axis as side', () => {
    const rect = computeSquareCropRect({ x: 0.3, y: 0.2, width: 0.2, height: 0.4 });
    // cx = 0.4, cy = 0.4, s = 0.4
    expect(rect.size).toBeCloseTo(0.4);
    expect(rect.x).toBeCloseTo(0.2);
    expect(rect.y).toBeCloseTo(0.2);
  });

  it('clamps to left edge when region is near left', () => {
    const rect = computeSquareCropRect({ x: 0.0, y: 0.4, width: 0.2, height: 0.2 });
    // cx = 0.1, s = 0.2 → unclamped x = 0.0 (already edge)
    expect(rect.x).toBeCloseTo(0);
    expect(rect.y).toBeCloseTo(0.4);
    expect(rect.size).toBeCloseTo(0.2);
  });

  it('clamps to right edge when region is near right', () => {
    const rect = computeSquareCropRect({ x: 0.85, y: 0.4, width: 0.1, height: 0.2 });
    // cx = 0.9, cy = 0.5, s = 0.2 → unclamped x = 0.8, y = 0.4; 1 - s = 0.8 → x stays 0.8
    expect(rect.x).toBeCloseTo(0.8);
    expect(rect.y).toBeCloseTo(0.4);
    expect(rect.size).toBeCloseTo(0.2);
  });

  it('returns full-image center square when region is null', () => {
    const rect = computeSquareCropRect(null);
    expect(rect.x).toBeCloseTo(0);
    expect(rect.y).toBeCloseTo(0);
    expect(rect.size).toBeCloseTo(1);
  });

  it('handles a square region passthrough', () => {
    const rect = computeSquareCropRect({ x: 0.4, y: 0.4, width: 0.2, height: 0.2 });
    expect(rect.x).toBeCloseTo(0.4);
    expect(rect.y).toBeCloseTo(0.4);
    expect(rect.size).toBeCloseTo(0.2);
  });

  it('clamps wide region to fit image width', () => {
    // region is 1.2-wide (impossible in practice but we should not overflow)
    const rect = computeSquareCropRect({ x: 0.0, y: 0.4, width: 1.0, height: 0.1 });
    // cx = 0.5, s = 1.0, unclamped x = 0 → ok. But size >= 1 should saturate to 1.
    expect(rect.size).toBeLessThanOrEqual(1);
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.size).toBeLessThanOrEqual(1 + 1e-9);
  });
});
```

- [ ] **Step 3.2: Run test — expect fail**

Run: `npx vitest run tests/unit/cropImage.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3.3: Implement `cropImage.ts`**

Create `src/renderer/utils/cropImage.ts`:

```typescript
export interface RegionFrac {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SquareCrop {
  x: number;
  y: number;
  size: number;
}

export function computeSquareCropRect(region: RegionFrac | null): SquareCrop {
  if (!region) {
    return { x: 0, y: 0, size: 1 };
  }
  const cx = region.x + region.width / 2;
  const cy = region.y + region.height / 2;
  const size = Math.min(1, Math.max(region.width, region.height));
  const maxX = Math.max(0, 1 - size);
  const maxY = Math.max(0, 1 - size);
  const x = Math.max(0, Math.min(maxX, cx - size / 2));
  const y = Math.max(0, Math.min(maxY, cy - size / 2));
  return { x, y, size };
}

// Loads a data URL into an HTMLImageElement. Resolves once decoded.
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

// Crops `imageDataUrl` to the square crop derived from `region` (may be null) and
// returns a JPEG data URL at `outputSize` x `outputSize` pixels.
export async function cropImageToDataUrl(
  imageDataUrl: string,
  region: RegionFrac | null,
  outputSize = 128,
): Promise<string> {
  const img = await loadImage(imageDataUrl);
  const crop = computeSquareCropRect(region);
  const sx = crop.x * img.naturalWidth;
  const sy = crop.y * img.naturalHeight;
  const srcSize = Math.min(crop.size * img.naturalWidth, crop.size * img.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D context');
  ctx.drawImage(
    img,
    sx, sy, srcSize, srcSize,
    0, 0, outputSize, outputSize,
  );
  return canvas.toDataURL('image/jpeg', 0.85);
}
```

- [ ] **Step 3.4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/cropImage.test.ts`
Expected: PASS — 6 tests green. (Canvas helper is not unit tested — renderer-only DOM dependency.)

- [ ] **Step 3.5: Commit**

```bash
git add src/renderer/utils/cropImage.ts tests/unit/cropImage.test.ts
git commit -m "feat(media): add cropImage utility (pure math + canvas helper)"
```

---

## Task 4: Pinia store for profile pictures

**Files:**
- Create: `src/renderer/stores/profilePic.ts`

- [ ] **Step 4.1: Create the store**

Create `src/renderer/stores/profilePic.ts`:

```typescript
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

interface Ref { mediaId: string; region: RegionFrac | null }

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

  async function resolveOne(personId: string, ref: Ref | null): Promise<void> {
    if (!ref) {
      set(personId, { status: 'none', src: null });
      return;
    }
    try {
      const url = await loadMediaUrl(ref.mediaId);
      if (!url) {
        set(personId, { status: 'none', src: null });
        return;
      }
      const cropped = await cropImageToDataUrl(url, ref.region);
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
        const ref = await window.api.media.profilePicRef(personId) as Ref | null;
        await resolveOne(personId, ref);
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
    const refs = await window.api.media.profilePicRefs(toFetch) as Record<string, Ref | null>;
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
```

- [ ] **Step 4.2: Verify it compiles**

Run: `npm run lint`
Expected: 0 errors.

Then: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4.3: Commit**

```bash
git add src/renderer/stores/profilePic.ts
git commit -m "feat(renderer): add profilePic Pinia store with per-person cache"
```

---

## Task 5: Composable `usePersonProfilePic`

**Files:**
- Create: `src/renderer/composables/usePersonProfilePic.ts`

- [ ] **Step 5.1: Create the composable**

Create `src/renderer/composables/usePersonProfilePic.ts`:

```typescript
import { computed, watch, type Ref } from 'vue';
import { useProfilePicStore } from '../stores/profilePic';

export function usePersonProfilePic(personId: Ref<string | undefined | null>) {
  const store = useProfilePicStore();

  watch(personId, (id) => {
    if (id) void store.ensureLoaded(id);
  }, { immediate: true });

  const src = computed<string | null>(() => {
    const id = personId.value;
    if (!id) return null;
    return store.get(id).src;
  });

  const loading = computed<boolean>(() => {
    const id = personId.value;
    if (!id) return false;
    return store.get(id).status === 'loading';
  });

  return { src, loading };
}
```

- [ ] **Step 5.2: Verify compile**

Run: `npm run lint && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5.3: Commit**

```bash
git add src/renderer/composables/usePersonProfilePic.ts
git commit -m "feat(renderer): add usePersonProfilePic composable"
```

---

## Task 6: Wire `personId` into `AppAvatar`

**Files:**
- Modify: `src/renderer/components/ui/AppAvatar.vue`

- [ ] **Step 6.1: Update template + script**

Replace the entire contents of `src/renderer/components/ui/AppAvatar.vue` with:

```vue
<template>
  <div :class="['app-avatar', `app-avatar--${size}`]" :style="avatarStyle">
    <img v-if="effectiveSrc" :src="effectiveSrc" :alt="initials" class="app-avatar__img" />
    <span v-else>{{ initials }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed, toRef } from 'vue';
import { usePersonProfilePic } from '../../composables/usePersonProfilePic';

const props = withDefaults(defineProps<{
  personId?: string | null;
  givenName?: string;
  surname?: string;
  sex?: 'M' | 'F' | 'U';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  src?: string | null;
}>(), {
  personId: null,
  givenName: '',
  surname: '',
  sex: 'U',
  size: 'md',
  src: null,
});

const { src: storeSrc } = usePersonProfilePic(toRef(props, 'personId'));

const effectiveSrc = computed<string | null>(() => {
  // Explicit `src` prop always wins (back-compat + special cases).
  if (props.src) return props.src;
  return storeSrc.value;
});

const initials = computed(() => {
  const g = props.givenName.trim();
  const s = props.surname.trim();
  if (g && s) return (g[0] + s[0]).toUpperCase();
  if (g) return g.slice(0, 2).toUpperCase();
  if (s) return s.slice(0, 2).toUpperCase();
  return '?';
});

const avatarStyle = computed(() => {
  if (effectiveSrc.value) return {};
  const map: Record<string, { background: string; color: string }> = {
    F: { background: 'var(--sex-f-bg)', color: 'var(--sex-f-text)' },
    M: { background: 'var(--sex-m-bg)', color: 'var(--sex-m-text)' },
    U: { background: 'var(--sex-u-bg)', color: 'var(--sex-u-text)' },
  };
  return map[props.sex] ?? map['U'];
});
</script>

<style scoped>
.app-avatar {
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-weight: var(--font-weight-bold);
  user-select: none;
  overflow: hidden;
}

/* Sizes */
.app-avatar--sm  { width: 20px; height: 20px; font-size: 8px;  }
.app-avatar--md  { width: 28px; height: 28px; font-size: 10px; }
.app-avatar--lg  { width: 36px; height: 36px; font-size: 13px; }
.app-avatar--xl  { width: 56px; height: 56px; font-size: 18px; }

.app-avatar__img {
  width: 100%;
  height: 100%;
  border-radius: var(--radius-full);
  object-fit: cover;
}
</style>
```

- [ ] **Step 6.2: Verify compile**

Run: `npm run lint && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 6.3: Smoke test**

Run: `npm start`. Navigate to `/` (PersonsView). Verify the avatars still render with initials for persons without media. No console errors.

Kill the app.

- [ ] **Step 6.4: Commit**

```bash
git add src/renderer/components/ui/AppAvatar.vue
git commit -m "feat(ui): AppAvatar accepts personId and auto-loads cropped profile pic"
```

---

## Task 7: Invalidation hooks on mutations

**Files:**
- Modify: `src/renderer/utils/mediaProfile.ts`
- Modify: `src/renderer/components/MediaPanel.vue`
- Modify: `src/renderer/components/PersonMediaSection.vue`
- Modify: `src/renderer/views/MediaView.vue`

- [ ] **Step 7.1: Invalidate from `setMediaAsPersonProfile`**

Open `src/renderer/utils/mediaProfile.ts`. Replace the file contents:

```typescript
import { useProfilePicStore } from '../stores/profilePic';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface LinkRow {
  id: string;       // media id
  link_id: string;  // media_link id
}

export async function setMediaAsPersonProfile(personId: string, mediaId: string): Promise<void> {
  const links = await window.api.media.forEntity('person', personId) as LinkRow[];
  const target = links.find(l => l.id === mediaId);
  if (!target) return;
  const reordered = [target.link_id, ...links.filter(l => l.id !== mediaId).map(l => l.link_id)];
  await window.api.media.reorder(reordered);
  useProfilePicStore().invalidatePerson(personId);
}

export async function isMediaPersonProfile(personId: string, mediaId: string): Promise<boolean> {
  const links = await window.api.media.forEntity('person', personId) as LinkRow[];
  return links.length > 0 && links[0].id === mediaId;
}
```

- [ ] **Step 7.2: Invalidate from MediaPanel mutation handlers**

Open `src/renderer/components/MediaPanel.vue`. Add this import near the other imports:

```typescript
import { useProfilePicStore } from '../stores/profilePic';
```

At the top of `<script setup>` (after other store/composable calls if any), add:

```typescript
const profilePicStore = useProfilePicStore();
```

Then, in these functions, add invalidation immediately after the DB mutation:

**In `assignPersonToRegion`** — add `profilePicStore.invalidatePerson(personId);` right after `await window.api.mediaRegions.update(regionId, { person_id: personId });`:

```typescript
async function assignPersonToRegion(regionId: string, personId: string) {
  editingTagId.value = null;
  await window.api.mediaRegions.update(regionId, { person_id: personId });
  profilePicStore.invalidatePerson(personId);
  // Also ensure the person is linked to this media
  if (props.mediaId && !linkedPersons.value.some(lp => lp.entityId === personId)) {
    await window.api.media.addLink({
      media_id: props.mediaId,
      entity_type: 'person',
      entity_id: personId,
    });
    emit('link-changed');
  }
  emit('region-deleted'); // triggers viewer reload too
  if (props.mediaId) await load();
}
```

**In `deleteRegion`** — look up the region's `person_id` before delete:

Replace existing:
```typescript
async function deleteRegion(regionId: string) {
  await window.api.mediaRegions.delete(regionId);
  emit('region-deleted');
  if (props.mediaId) await load();
}
```

With:
```typescript
async function deleteRegion(regionId: string) {
  const r = regions.value.find(rr => rr.id === regionId);
  const personId = r?.person_id ?? null;
  await window.api.mediaRegions.delete(regionId);
  if (personId) profilePicStore.invalidatePerson(personId);
  emit('region-deleted');
  if (props.mediaId) await load();
}
```

**In `unlinkEntity`** — the link_id is passed in, but we need the person_id. Look it up in `linkedPersons`:

Replace existing:
```typescript
async function unlinkEntity(linkId: string) {
  await window.api.media.removeLink(linkId);
  emit('link-changed');
  if (props.mediaId) await load();
}
```

With:
```typescript
async function unlinkEntity(linkId: string) {
  const lp = linkedPersons.value.find(x => x.linkId === linkId);
  const personId = lp?.entityId ?? null;
  await window.api.media.removeLink(linkId);
  if (personId) profilePicStore.invalidatePerson(personId);
  emit('link-changed');
  if (props.mediaId) await load();
}
```

**In `linkPerson`** — after `await window.api.media.addLink(...)`, add:
```typescript
  profilePicStore.invalidatePerson(person.id);
```

Final `linkPerson`:
```typescript
async function linkPerson(person: { id: string }) {
  if (!props.mediaId) return;
  await window.api.media.addLink({
    media_id: props.mediaId,
    entity_type: 'person',
    entity_id: person.id,
  });
  profilePicStore.invalidatePerson(person.id);
  showPersonPicker.value = false;
  emit('link-changed');
  await load();
}
```

- [ ] **Step 7.3: Invalidate from PersonMediaSection**

Open `src/renderer/components/PersonMediaSection.vue`. Add near other imports:

```typescript
import { useProfilePicStore } from '../stores/profilePic';
```

After the existing declarations in `<script setup>` (after `const thumbnails = ref...`):

```typescript
const profilePicStore = useProfilePicStore();
```

Modify `unlink`:
```typescript
async function unlink(linkId: string) {
  await window.api.media.removeLink(linkId);
  profilePicStore.invalidatePerson(props.personId);
  await load();
  emit('profileChanged');
}
```

Modify `reorder`:
```typescript
async function reorder(newOrder: MediaItem[]) {
  media.value = newOrder;
  await window.api.media.reorder(newOrder.map(m => m.link_id));
  profilePicStore.invalidatePerson(props.personId);
  emit('profileChanged');
}
```

Modify `attach`:
```typescript
async function attach() {
  const result = await window.api.media.attach({ entityType: 'person', entityId: props.personId });
  if (!(result as { canceled: boolean }).canceled) {
    profilePicStore.invalidatePerson(props.personId);
    await load();
    emit('profileChanged');
  }
}
```

- [ ] **Step 7.4: Invalidate from MediaView (auto-assign on draw + region move)**

Open `src/renderer/views/MediaView.vue`. Add near other imports:

```typescript
import { useProfilePicStore } from '../stores/profilePic';
```

In `<script setup>` after other top-level declarations:

```typescript
const profilePicStore = useProfilePicStore();
```

Modify `onRegionDrawn` — after `await window.api.mediaRegions.create(...)`:
```typescript
  await window.api.mediaRegions.create({
    media_id: selectedMediaId.value,
    x: rect.x, y: rect.y,
    width: rect.width, height: rect.height,
    ...(personId ? { person_id: personId } : {}),
  });
  if (personId) profilePicStore.invalidatePerson(personId);
  drawMode.value = false; // exit draw mode after creating a tag
  viewerRef.value?.reloadRegions();
  panelRef.value?.reload();
  panelRef.value?.expandFaceTags();
}
```

Modify `onRegionUpdated` — look up person_id via `mediaRegions.getForMedia`:
```typescript
async function onRegionUpdated(id: string, rect: { x: number; y: number; width: number; height: number }) {
  await window.api.mediaRegions.updateGeometry(id, rect);
  if (selectedMediaId.value) {
    const regs = await window.api.mediaRegions.getForMedia(selectedMediaId.value) as Array<{ id: string; person_id: string | null }>;
    const r = regs.find(rr => rr.id === id);
    if (r?.person_id) profilePicStore.invalidatePerson(r.person_id);
  }
  viewerRef.value?.reloadRegions();
}
```

- [ ] **Step 7.5: Smoke test**

Run: `npm start`. Open a person with no profile pic. Navigate to `/media`, select a photo, draw a face tag, assign the person. Navigate back to PersonsView — the person's avatar should now show the cropped face. Star behavior and reorder should update the avatar live.

Kill the app.

- [ ] **Step 7.6: Commit**

```bash
git add src/renderer/utils/mediaProfile.ts src/renderer/components/MediaPanel.vue src/renderer/components/PersonMediaSection.vue src/renderer/views/MediaView.vue
git commit -m "feat(media): invalidate profilePic store on region/link mutations"
```

---

## Task 8: Wire `:person-id` into all AppAvatar call sites

**Files:**
- Modify: `src/renderer/views/PersonsView.vue`
- Modify: `src/renderer/components/PersonPanel.vue`
- Modify: `src/renderer/views/GroupDetailView.vue`
- Modify: `src/renderer/components/PlacePersonsSection.vue`
- Modify: `src/renderer/components/RelationshipsList.vue`
- Modify: `src/renderer/components/MediaPanel.vue`
- Modify: `src/renderer/views/PersonDetailView.vue`

- [ ] **Step 8.1: PersonsView**

Open `src/renderer/views/PersonsView.vue`. At line 95, change:
```vue
<AppAvatar :given-name="person.given_name || ''" :surname="person.surname || ''" :sex="(person.sex as 'M' | 'F' | 'U') || 'U'" />
```
to:
```vue
<AppAvatar :person-id="person.id" :given-name="person.given_name || ''" :surname="person.surname || ''" :sex="(person.sex as 'M' | 'F' | 'U') || 'U'" />
```

- [ ] **Step 8.2: PersonPanel**

Open `src/renderer/components/PersonPanel.vue`. At lines 11-16, change:
```vue
<AppAvatar
  :given-name="primaryName?.given_name ?? ''"
  :surname="primaryName?.surname ?? ''"
  :sex="person.sex"
  size="lg"
/>
```
to:
```vue
<AppAvatar
  :person-id="personId"
  :given-name="primaryName?.given_name ?? ''"
  :surname="primaryName?.surname ?? ''"
  :sex="person.sex"
  size="lg"
/>
```

- [ ] **Step 8.3: GroupDetailView**

Open `src/renderer/views/GroupDetailView.vue`. At line 75, change:
```vue
<AppAvatar :given-name="m.given_name ?? ''" :surname="m.surname ?? ''" :sex="(m.sex as 'M' | 'F' | 'U')" size="sm" />
```
to:
```vue
<AppAvatar :person-id="m.id" :given-name="m.given_name ?? ''" :surname="m.surname ?? ''" :sex="(m.sex as 'M' | 'F' | 'U')" size="sm" />
```

(If `m.id` is not the person ID — verify by reading the query that populates `m` — use the correct field. `GroupMember` rows in the group detail include the person's id; confirm in the actual code and adjust if the field is `person_id` instead.)

- [ ] **Step 8.4: PlacePersonsSection**

Open `src/renderer/components/PlacePersonsSection.vue`. At line 15, change:
```vue
<AppAvatar :given-name="p.given_name" :surname="p.surname" :sex="p.sex" size="sm" />
```
to:
```vue
<AppAvatar :person-id="p.id" :given-name="p.given_name" :surname="p.surname" :sex="p.sex" size="sm" />
```

(If the person id field is `person_id` not `id`, use that instead.)

- [ ] **Step 8.5: RelationshipsList**

Open `src/renderer/components/RelationshipsList.vue`. Around line 25, change:
```vue
<AppAvatar
  v-if="p.id || p.givenName || p.surname"
```
— ensure it passes `:person-id="p.id"`. The full avatar element should become:
```vue
<AppAvatar
  v-if="p.id || p.givenName || p.surname"
  :person-id="p.id"
  :given-name="p.givenName ?? ''"
  :surname="p.surname ?? ''"
  :sex="(p.sex as 'M' | 'F' | 'U')"
  size="sm"
/>
```
(Confirm actual existing prop names by reading lines 24-32 before editing; preserve all existing props, only add `:person-id="p.id"`.)

- [ ] **Step 8.6: MediaPanel**

Open `src/renderer/components/MediaPanel.vue`. At line 79 (linked persons section):
```vue
<AppAvatar :given-name="lp.givenName" :surname="lp.surname" :sex="lp.sex" size="sm" />
```
becomes:
```vue
<AppAvatar :person-id="lp.entityId" :given-name="lp.givenName" :surname="lp.surname" :sex="lp.sex" size="sm" />
```

At line 152 (face-tag row):
```vue
<AppAvatar v-if="r.person_id" :given-name="r.personGivenName || ''" :surname="r.personSurname || ''" :sex="r.personSex || 'U'" size="sm" />
```
becomes:
```vue
<AppAvatar v-if="r.person_id" :person-id="r.person_id" :given-name="r.personGivenName || ''" :surname="r.personSurname || ''" :sex="r.personSex || 'U'" size="sm" />
```

- [ ] **Step 8.7: PersonDetailView — migrate header avatar**

Open `src/renderer/views/PersonDetailView.vue`.

Replace the header AppAvatar + `<img>` block (lines 5-17):

```vue
        <AppAvatar
          v-if="!profilePicUrl"
          :given-name="primaryNameData?.given_name ?? ''"
          :surname="primaryNameData?.surname ?? ''"
          :sex="(person.sex as 'M' | 'F' | 'U')"
          size="xl"
        />
        <img
          v-else
          :src="profilePicUrl"
          class="profile-thumbnail"
          :alt="$t('media.profileAlt')"
        />
```

with:

```vue
        <AppAvatar
          :person-id="person.id"
          :given-name="primaryNameData?.given_name ?? ''"
          :surname="primaryNameData?.surname ?? ''"
          :sex="(person.sex as 'M' | 'F' | 'U')"
          size="xl"
        />
```

Then delete the now-unused `profilePicUrl` state + `loadProfilePic` function + all call sites:

- Delete the `const profilePicUrl = ref<string | null>(null);` line (around line 264).
- Delete the entire `loadProfilePic` function (around lines 383-391).
- Delete every call to `loadProfilePic()` in the file (watchers, `onMounted`, `onDetailUpdated`, etc.) — grep within the file for `loadProfilePic` to be sure.
- Delete the `.profile-thumbnail` CSS rule in the `<style scoped>` block (it's no longer referenced).
- If `media.profileAlt` i18n key has no other references in the codebase, leave it — small cost; removal is cleanup, not required here.

- [ ] **Step 8.8: Verify compile + lint**

Run: `npm run lint`
Expected: 0 errors. TypeScript compile also clean: `npx tsc --noEmit`.

- [ ] **Step 8.9: Smoke test the whole flow**

Run: `npm start`. For a person with a face-tagged photo already in the DB:
1. PersonsView list shows the cropped face avatar.
2. Click into PersonDetailView — header shows the same cropped face (same store entry).
3. Open `/visualisering`, click a box with a profile pic — PersonPanel avatar shows the cropped face.
4. Open a group at `/groups/:id` — member avatars show cropped faces where available.
5. Open `/relationships` — person-chip avatars show cropped faces.
6. Open `/places/:id` — linked-person avatars show cropped faces.
7. Open `/media`, select the photo, verify face-tag-row avatars show cropped faces.
8. Star a different face-tagged photo — avatars everywhere update to the new crop within one frame (Pinia invalidation).
9. Unlink a photo in PersonMediaSection — avatars fall back to initials (or the next media).

Kill the app.

- [ ] **Step 8.10: Commit**

```bash
git add src/renderer/views/PersonsView.vue src/renderer/components/PersonPanel.vue src/renderer/views/GroupDetailView.vue src/renderer/components/PlacePersonsSection.vue src/renderer/components/RelationshipsList.vue src/renderer/components/MediaPanel.vue src/renderer/views/PersonDetailView.vue
git commit -m "feat(ui): wire :person-id into all AppAvatar call sites"
```

---

## Task 9: Run full test suite + final verification

- [ ] **Step 9.1: Run all unit tests**

Run: `npm test -- --run`
Expected: all tests pass (existing + new `media.test.ts` + new `cropImage.test.ts`). Zero failures.

- [ ] **Step 9.2: Run lint**

Run: `npm run lint`
Expected: 0 errors.

- [ ] **Step 9.3: Final smoke test**

Run: `npm start`. Import a GEDCOM with media (or use an existing DB). Verify:
- Large person list renders without lag — batch resolve should make it instant.
- Scrolling does not re-fetch; Pinia cache holds.
- No "flash of initials" after first load for any person with a photo.

---

## Task 10: Docs + version bump + final commit

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/PLAN.md`
- Modify: `package.json`

- [ ] **Step 10.1: Update CLAUDE.md**

In the Domain Components table, update the `AppAvatar` row to:

```markdown
| `AppAvatar` | `personId?`, `name?: string`, `sex?: string`, `size?: 'sm'\|'md'\|'lg'\|'xl'`, `src?` | Person avatar. When `personId` is set, auto-loads the cropped profile picture via `useProfilePicStore` (first media link's first region tagged to this person, or full-image center square if no region). Explicit `src` overrides the store. Falls back to sex-colored initials when no photo exists. |
```

In the Composables table, add:

```markdown
| `usePersonProfilePic` | Reactive `{ src, loading }` for a person's cropped profile picture. Wraps `useProfilePicStore`. Used automatically by `AppAvatar` when `personId` is set. |
```

In the Pinia Stores table, add:

```markdown
| `profilePic` | Per-person cached cropped profile picture data URLs. Dedupes `readAsDataUrl` calls across rows. Invalidated on region/link mutations. |
```

- [ ] **Step 10.2: Update docs/PLAN.md**

Add (or check off existing) milestone entry pointing to this plan:

```markdown
- Cropped face-tag profile pictures everywhere (`docs/plans/2026-04-20-avatar-profile-pic-crop.md`) — done
```

Match the file's existing format for milestones.

- [ ] **Step 10.3: Bump version**

Open `package.json`. Bump the `version` field from the current `x.y.z` to the next minor (e.g., `0.130.2` → `0.131.0`). New feature → minor bump.

- [ ] **Step 10.4: Final commit**

```bash
git add CLAUDE.md docs/PLAN.md package.json
git commit -m "feat(media): cropped face-tag profile pictures on all avatars"
```

- [ ] **Step 10.5: Archive the plan**

Once everything is green, move this plan file to archive:

```bash
git mv docs/plans/2026-04-20-avatar-profile-pic-crop.md docs/plans/archive/
git commit -m "docs(plan): archive completed avatar-profile-pic-crop plan"
```

Update the `docs/PLAN.md` pointer to reflect the archive path.

---
