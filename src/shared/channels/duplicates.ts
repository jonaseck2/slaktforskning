import * as duplicates from '../../api/duplicates';
import { defineChannel } from './registry';

// ── Place duplicates ─────────────────────────────────────────────────────────

defineChannel({
  name: 'duplicates:findPlaces',
  thread: 'worker',
  handler: async (db, limit?: number, offset?: number) =>
    await duplicates.findDuplicatePlaces(db, limit, offset),
});

defineChannel({
  name: 'duplicates:countPlaces',
  thread: 'worker',
  handler: async (db) => await duplicates.countDuplicatePlaces(db),
});

defineChannel({
  name: 'duplicates:ignorePlace',
  thread: 'worker',
  mutating: true,
  handler: async (db, placeAId: string, placeBId: string) =>
    await duplicates.ignoreDuplicatePlace(db, placeAId, placeBId),
});

defineChannel({
  name: 'duplicates:mergePlaces',
  thread: 'worker',
  mutating: true,
  handler: async (db, targetId: string, sourceId: string) =>
    await duplicates.mergePlaces(db, targetId, sourceId),
});

// ── Source duplicates ────────────────────────────────────────────────────────

defineChannel({
  name: 'duplicates:findSources',
  thread: 'worker',
  handler: async (db, limit?: number, offset?: number) =>
    await duplicates.findDuplicateSources(db, limit, offset),
});

defineChannel({
  name: 'duplicates:countSources',
  thread: 'worker',
  handler: async (db) => await duplicates.countDuplicateSources(db),
});

defineChannel({
  name: 'duplicates:ignoreSource',
  thread: 'worker',
  mutating: true,
  handler: async (db, sourceAId: string, sourceBId: string) =>
    await duplicates.ignoreDuplicateSource(db, sourceAId, sourceBId),
});

defineChannel({
  name: 'duplicates:mergeSources',
  thread: 'worker',
  mutating: true,
  handler: async (db, targetId: string, sourceId: string) =>
    await duplicates.mergeSources(db, targetId, sourceId),
});

// ── Media duplicates ─────────────────────────────────────────────────────────
//
// `findDuplicateMedia`, `countDuplicateMedia`, `ignoreDuplicateMedia` are pure
// DB operations and run on the worker.
//
// `mergeMedia` is intentionally NOT registered here — it uses synchronous
// `fs` calls to delete and snapshot the file on disk, which is banned in
// worker handlers (see .claude/rules/api.md "Worker-thread sync I/O"). The
// retired Electron build registered it as a main-thread handler in
// `src/main/ipc/duplicates.ts`; the Tauri build polyfills it directly in
// `src/renderer/tauri-window-api.ts` (search for `api.duplicates.mergeMedia`).
// The `static-api.ts` stub keeps it as a noop because the static SPA is
// read-only.

defineChannel({
  name: 'duplicates:findMedia',
  thread: 'worker',
  handler: async (db, limit?: number, offset?: number) =>
    await duplicates.findDuplicateMedia(db, limit, offset),
});

defineChannel({
  name: 'duplicates:countMedia',
  thread: 'worker',
  handler: async (db) => await duplicates.countDuplicateMedia(db),
});

defineChannel({
  name: 'duplicates:ignoreMedia',
  thread: 'worker',
  mutating: true,
  handler: async (db, mediaAId: string, mediaBId: string) =>
    await duplicates.ignoreDuplicateMedia(db, mediaAId, mediaBId),
});
