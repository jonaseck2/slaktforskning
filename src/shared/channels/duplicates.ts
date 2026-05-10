import * as duplicates from '../../api/duplicates';
import { defineChannel } from './registry';

// ── Place duplicates ─────────────────────────────────────────────────────────

defineChannel({
  name: 'duplicates:findPlaces',
  thread: 'worker',
  handler: (db, limit?: number, offset?: number) =>
    duplicates.findDuplicatePlaces(db, limit, offset),
});

defineChannel({
  name: 'duplicates:countPlaces',
  thread: 'worker',
  handler: (db) => duplicates.countDuplicatePlaces(db),
});

defineChannel({
  name: 'duplicates:ignorePlace',
  thread: 'worker',
  mutating: true,
  handler: (db, placeAId: string, placeBId: string) =>
    duplicates.ignoreDuplicatePlace(db, placeAId, placeBId),
});

defineChannel({
  name: 'duplicates:mergePlaces',
  thread: 'worker',
  mutating: true,
  handler: (db, targetId: string, sourceId: string) =>
    duplicates.mergePlaces(db, targetId, sourceId),
});

// ── Source duplicates ────────────────────────────────────────────────────────

defineChannel({
  name: 'duplicates:findSources',
  thread: 'worker',
  handler: (db, limit?: number, offset?: number) =>
    duplicates.findDuplicateSources(db, limit, offset),
});

defineChannel({
  name: 'duplicates:countSources',
  thread: 'worker',
  handler: (db) => duplicates.countDuplicateSources(db),
});

defineChannel({
  name: 'duplicates:ignoreSource',
  thread: 'worker',
  mutating: true,
  handler: (db, sourceAId: string, sourceBId: string) =>
    duplicates.ignoreDuplicateSource(db, sourceAId, sourceBId),
});

defineChannel({
  name: 'duplicates:mergeSources',
  thread: 'worker',
  mutating: true,
  handler: (db, targetId: string, sourceId: string) =>
    duplicates.mergeSources(db, targetId, sourceId),
});

// ── Media duplicates ─────────────────────────────────────────────────────────
//
// `findDuplicateMedia`, `countDuplicateMedia`, `ignoreDuplicateMedia` are pure
// DB operations and run on the worker.
//
// `mergeMedia` is intentionally NOT registered here — it uses synchronous
// `fs` calls to delete and snapshot the file on disk, which is banned in
// worker handlers (see .claude/rules/api.md "Worker-thread sync I/O"). It is
// registered as a main-thread handler in `src/main/ipc/duplicates.ts` and
// listed in `MAIN_THREAD_ONLY_CHANNELS` in
// `tests/unit/ipc-worker-coverage.test.ts`.

defineChannel({
  name: 'duplicates:findMedia',
  thread: 'worker',
  handler: (db, limit?: number, offset?: number) =>
    duplicates.findDuplicateMedia(db, limit, offset),
});

defineChannel({
  name: 'duplicates:countMedia',
  thread: 'worker',
  handler: (db) => duplicates.countDuplicateMedia(db),
});

defineChannel({
  name: 'duplicates:ignoreMedia',
  thread: 'worker',
  mutating: true,
  handler: (db, mediaAId: string, mediaBId: string) =>
    duplicates.ignoreDuplicateMedia(db, mediaAId, mediaBId),
});
