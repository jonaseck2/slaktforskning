import * as media from '../../api/media';
import { getMediaTimeline } from '../../api/media_timeline';
import * as mediaRegions from '../../api/media_regions';
import { defineChannel } from './registry';

// ── Media (DB-backed) ─────────────────────────────────────────────────────────
// Note: media:getFilePath and media:readAsDataUrl remain in the legacy dispatch
// table in db-worker.ts because they require getDbDir() — worker-local state.
// media:attach and media:openFile remain in src/main/ipc/media.ts as main-thread
// operations (dialog, shell, fs).

defineChannel({
  name: 'media:list',
  thread: 'worker',
  handler: async (db) => await media.listMedia(db),
});

defineChannel({
  name: 'media:listPage',
  thread: 'worker',
  handler: async (db, limit: number, offset: number, sortBy?: media.ListMediaSortBy, sortDir?: media.ListMediaSortDir, query?: string, filters?: media.MediaListFilters) => ({
    items: await media.listMediaPage(db, limit, offset, sortBy, sortDir, query, filters),
    total: await media.countMedia(db, query, filters),
    total_missing: await media.countMissingMedia(db, query, filters),
  }),
});

defineChannel({
  name: 'media:get',
  thread: 'worker',
  handler: async (db, id: string) => await media.getMedia(db, id),
});

defineChannel({
  name: 'media:create',
  thread: 'worker',
  mutating: true,
  handler: async (db, data: Parameters<typeof media.createMedia>[1]) => await media.createMedia(db, data),
});

defineChannel({
  name: 'media:delete',
  thread: 'worker',
  mutating: true,
  handler: async (db, id: string) => await media.deleteMedia(db, id),
});

defineChannel({
  name: 'media:update',
  thread: 'worker',
  mutating: true,
  handler: async (db, id: string, data: Parameters<typeof media.updateMedia>[2]) =>
    await media.updateMedia(db, id, data),
});

defineChannel({
  name: 'media:forEntity',
  thread: 'worker',
  handler: async (db, entityType: Parameters<typeof media.getMediaForEntity>[1], entityId: string) =>
    await media.getMediaForEntity(db, entityType, entityId),
});

defineChannel({
  name: 'media:linksForMedia',
  thread: 'worker',
  handler: async (db, mediaId: string) => await media.getLinksForMedia(db, mediaId),
});

defineChannel({
  name: 'media:addLink',
  thread: 'worker',
  mutating: true,
  handler: async (db, data: Parameters<typeof media.addMediaLink>[1]) => await media.addMediaLink(db, data),
});

defineChannel({
  name: 'media:removeLink',
  thread: 'worker',
  mutating: true,
  handler: async (db, linkId: string) => await media.removeMediaLink(db, linkId),
});

defineChannel({
  name: 'media:reorder',
  thread: 'worker',
  mutating: true,
  handler: async (db, linkIds: string[]) => await media.reorderMediaLinks(db, linkIds),
});

defineChannel({
  name: 'media:profilePicRef',
  thread: 'worker',
  handler: async (db, personId: string) => await media.getPersonProfilePicRef(db, personId),
});

defineChannel({
  name: 'media:profilePicRefs',
  thread: 'worker',
  handler: async (db, personIds: string[]) => await media.getPersonProfilePicRefs(db, personIds),
});

defineChannel({
  name: 'media:getTimeline',
  thread: 'worker',
  handler: async (db, entityType: string, entityId: string) =>
    await getMediaTimeline(db, entityType, entityId),
});

// ── Media Regions ─────────────────────────────────────────────────────────────

defineChannel({
  name: 'mediaRegions:create',
  thread: 'worker',
  mutating: true,
  handler: async (db, data: Parameters<typeof mediaRegions.createMediaRegion>[1]) =>
    mediaRegions.createMediaRegion(db, data),
});

defineChannel({
  name: 'mediaRegions:getForMedia',
  thread: 'worker',
  handler: async (db, mediaId: string) => mediaRegions.getMediaRegions(db, mediaId),
});

defineChannel({
  name: 'mediaRegions:getForPerson',
  thread: 'worker',
  handler: async (db, personId: string) => mediaRegions.getRegionsForPerson(db, personId),
});

defineChannel({
  name: 'mediaRegions:update',
  thread: 'worker',
  mutating: true,
  handler: async (db, id: string, data: Parameters<typeof mediaRegions.updateMediaRegion>[2]) =>
    mediaRegions.updateMediaRegion(db, id, data),
});

defineChannel({
  name: 'mediaRegions:delete',
  thread: 'worker',
  mutating: true,
  handler: async (db, id: string) => mediaRegions.deleteMediaRegion(db, id),
});
